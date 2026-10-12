"""Periodic sweep: `python -m app.admin_cli sweep [--loop 60]`, once a minute in development.

Each task finds what is past its deadline, moves it in the same transaction as its notifications and audit rows
and returns how many items it changed. Rows are locked with `FOR UPDATE SKIP LOCKED` and re-checked by state,
so two sweeps at once (or a second run) never change the same item twice. Reads keep handling deadlines on their
own, so a late sweep never shows an expired state as valid.

Stage 2 tasks: expire paid reservations without an approved receipt and count unanswered refunds as received
after 7 days. Stage 3 appends its tasks to `TASKS` (searches of 24 h, proposals of 2 h, result deadlines of 48 h).
"""
from __future__ import annotations

import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.events import EntryReceipt, Event, EventEntry
from app.models.identity import utcnow
from app.services import audit, notifications
from app.services.event_rules import REFUND_AUTO_CONFIRM_AFTER, next_entry_state
from app.services.participants import entry_recipients

logger = logging.getLogger('arena.sweep')
BATCH = 500


@dataclass(frozen=True)
class SweepTask:
    name: str
    run: Callable[[Session, datetime], int]


def _events(db: Session, event_ids: set[int]) -> dict[int, Event]:
    return {event.id: event for event in db.scalars(select(Event).where(Event.id.in_(event_ids))).all()}


def expire_entries(db: Session, entries: Sequence[EventEntry], now: datetime) -> int:
    """Expires lapsed reservations already locked by the caller, with notification and audit (no commit).

    The sweep uses it for every lapsed reservation; the entry service calls it inline for a stale reservation
    of the same team or athlete before creating a new entry, so the unique index never blocks a fair retry.
    """
    if not entries:
        return 0
    events = _events(db, {entry.event_id for entry in entries})
    recipients = entry_recipients(db, entries)
    for entry in entries:
        entry.state = next_entry_state(entry.state, 'expirar')
        entry.expired_at = now
        audit.record(db, actor_id=None, action='inscricao.expirada', target_type='event_entry', target_id=entry.id,
                     data={'event_id': entry.event_id, 'automatico': True})
        notifications.notify_many(db, recipients[entry.id], 'reserva_expirada', {
            'event_id': entry.event_id, 'event_name': events[entry.event_id].name, 'entry_id': entry.id})
    return len(entries)


def expire_reservations(db: Session, now: datetime) -> int:
    """Reservations (and refused receipts) whose deadline passed become 'expirada'; the spot is freed."""
    entries = db.scalars(
        select(EventEntry).where(EventEntry.state.in_(('reservada', 'rejeitada')), EventEntry.reserved_until <= now)
        .order_by(EventEntry.reserved_until, EventEntry.id).limit(BATCH).with_for_update(skip_locked=True)
    ).all()
    return expire_entries(db, entries, now)


def auto_confirm_refunds(db: Session, now: datetime) -> int:
    """Refund receipts without the participant's answer for 7 days count as received ('automatica')."""
    rows = db.execute(
        select(EntryReceipt, EventEntry).join(EventEntry, EventEntry.id == EntryReceipt.entry_id)
        .where(EntryReceipt.kind == 'devolucao', EntryReceipt.participant_response.is_(None),
               EntryReceipt.created_at <= now - REFUND_AUTO_CONFIRM_AFTER, EventEntry.state == 'devolucao_pendente')
        .order_by(EntryReceipt.created_at, EntryReceipt.id).limit(BATCH).with_for_update(skip_locked=True)
    ).all()
    if not rows:
        return 0
    events = _events(db, {entry.event_id for _, entry in rows})
    # Organizer and participants (0003, section 17): every active member of the team, not only representatives.
    recipients = entry_recipients(db, [entry for _, entry in rows], scope='membros')
    for receipt, entry in rows:
        receipt.participant_response, receipt.responded_at = 'automatica', now
        entry.state = next_entry_state(entry.state, 'devolucao_automatica')
        entry.refunded_at = now
        event = events[entry.event_id]
        audit.record(db, actor_id=None, action='devolucao.confirmada_automaticamente', target_type='event_entry',
                     target_id=entry.id, data={'event_id': event.id, 'receipt_id': receipt.id, 'automatico': True})
        payload = {'event_id': event.id, 'event_name': event.name, 'entry_id': entry.id, 'receipt_id': receipt.id,
                   'automatic': True}
        notifications.notify_many(db, [event.organizer_user_id, *recipients[entry.id]], 'devolucao_confirmada',
                                  payload)
    return len(rows)


TASKS: tuple[SweepTask, ...] = (
    SweepTask('reservas_expiradas', expire_reservations),
    SweepTask('devolucoes_recebidas', auto_confirm_refunds),
)


def run_sweep(db: Session, now: datetime | None = None, tasks: Sequence[SweepTask] = TASKS) -> dict[str, int | None]:
    """Runs every task in its own transaction; a failing task is logged, rolled back and reported as None."""
    moment = now or utcnow()
    report: dict[str, int | None] = {}
    for task in tasks:
        try:
            report[task.name] = task.run(db, moment)
            db.commit()
        except Exception as error:
            # One broken task must not stop the others; the next run tries it again.
            db.rollback()
            logger.error('Sweep task %s failed: %s', task.name, type(error).__name__)
            report[task.name] = None
    return report

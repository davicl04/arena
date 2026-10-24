"""Eventos do organizador e decisões da administração (docs/decisoes/0003, seções 14, 15.1 e 15.2).

Rascunho com checklist, envio (gratuito publica, pago vai à administração), retirada, exclusão, cancelamento com
devolução, inscrições e comprovantes (A2), canal de avisos, revogação de organizador com eventos abertos e as
filas da administração. As regras puras ficam em `event_rules`; aqui entram as consultas, as travas e os efeitos
(notificações e auditoria no mesmo commit). Também expõe as funções compartilhadas da seção 19 (`load_owned_event`,
`ensure_writable`, `pending_counts`, `holding_counts`, `cancel_event`, `on_organizer_revoked`, `channel_readers` e
`can_read_channel`) e as peças que o lado do atleta (`services/entries.py`) reaproveita: `holding_clause`,
`open_refund_clause`, `posters_out`, `organizer_entries_out`, `lock_event` e `admin_ids`.

Ordem global das travas (etapa 2), a mesma em todas as transições de eventos, inscrições e comprovantes:

1. conta do organizador (`users`, FOR NO KEY UPDATE; só na revogação e no pedido de organizador);
2. permissão de organizador (`organizers`, FOR UPDATE; criar, editar rascunho, enviar e revogar);
3. evento (`events`): FOR UPDATE nas transições do evento (editar, enviar, retirar, excluir, decidir, cancelar,
   revogar, decidir a revogação) e na inscrição nova (a vaga); FOR SHARE nas transições de uma inscrição
   (comprovante, decisão do comprovante, desistência, devolução, resposta e contestação), que podem correr em paralelo
   entre inscrições diferentes, mas esperam (ou fazem esperar) qualquer mudança do evento;
4. time (`teams`, FOR SHARE; só na inscrição nova, contra encerrar o time ou mudar papéis);
5. inscrições (`event_entries`, FOR UPDATE, por id);
6. comprovantes (`entry_receipts`, FOR UPDATE).

Nenhuma transação pede uma trava de nível acima depois de segurar uma de nível abaixo, nem passa de FOR SHARE a
FOR UPDATE no mesmo evento, então não há ciclos. A varredura (`services/sweep.py`) trava só inscrições e
comprovantes, com SKIP LOCKED, e nunca espera: pula o que outra transação segura e tenta na próxima rodada.
"""
from __future__ import annotations

from collections.abc import Iterable, Sequence
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import and_, case, func, literal, or_, select
from sqlalchemy.orm import Session

from app.core.pagination import paginate
from app.models.events import (
    HOLDING_ENTRY_STATES,
    OPEN_EVENT_STATES,
    VISIBLE_EVENT_STATES,
    EntryReceipt,
    Event,
    EventEntry,
    EventMessage,
)
from app.models.identity import City, MediaObject, User, utcnow
from app.models.organizers import Organizer
from app.models.teams import Team, TeamMember
from app.schemas.events import (
    EntrySubjectOut,
    EventMessageOut,
    EventPosterOut,
    OrganizerEntryOut,
    ReceiptOut,
    TennisBonusOut,
    championship_out,
    checklist_out,
    next_action_out,
    pending_out,
    pix_out,
    poster_out,
    receipt_out,
)
from app.schemas.organizer_events import (
    AdminEventDecisionInput,
    AdminEventOrganizerOut,
    AdminEventOut,
    EventCreateInput,
    EventRefusalOut,
    EventUpdateInput,
    OrganizerEventCardOut,
    OrganizerEventDetailOut,
    ReceiptDecisionInput,
    ReceiptReviewOut,
)
from app.schemas.rankings import TeamRefOut
from app.services import audit, championship_lifecycle, notifications
from app.services.event_rules import (
    DRAFT_FIELDS,
    VENUE_LENGTH,
    PendingCounts,
    TransitionError,
    checklist_complete,
    draft_checklist,
    editable_fields,
    entry_state_on_event_cancel,
    event_registration_deadline,
    is_open_refund,
    next_action,
    next_entry_state,
    next_event_state,
    normalize_category,
    normalize_pix_key,
    reservation_lapsed,
    tennis_bonus,
)
from app.services.organizers import get_active_organizer
from app.services.participants import entry_recipients, entry_role
from app.services.people import blocked_ids, person_out
from app.services.sweep import expire_entries

EVENT_NOT_FOUND = 'Evento não encontrado.'
NOT_ORGANIZER = 'Você precisa ser organizador para criar eventos.'
REVOCATION_PENDING = 'A administração está decidindo sobre este evento.'
RECEIPT_NOT_FOUND = 'Comprovante não encontrado.'
ONLY_ORGANIZER_DECIDES = 'Só o organizador do evento decide os comprovantes.'
ONLY_ORGANIZER_WRITES = 'Só o organizador publica avisos.'
CHANNEL_FORBIDDEN = 'Os avisos são só para os inscritos do evento.'
CANCEL_REASON = 'Descreva o motivo do cancelamento.'
REFUSAL_CODE = 'Escolha o motivo da recusa.'
REFUSAL_DETAIL = 'Descreva o motivo da recusa.'
EDIT_MESSAGES = {
    'publicado': 'Depois de publicado, só local, percurso, instruções e contato podem mudar.',
    'em_andamento': 'Depois de publicado, só local, percurso, instruções e contato podem mudar.',
    'em_aprovacao': 'Retire o evento da aprovação para editar.',
}
EDIT_CLOSED = 'Este evento não pode mais ser editado.'
PIX_FIELDS = ('pix_beneficiary', 'pix_key_type', 'pix_key', 'pix_copy_paste', 'pix_instructions')
CLOSED_STATES = ('encerrado', 'cancelado')
MESSAGE_LENGTH = (1, 1000)
CANCEL_REASON_LENGTH = (5, 500)


class FieldsError(Exception):
    """422 with a list of fields (`{ detail, fields: [{ field, message }] }`); the router builds the response."""

    def __init__(self, detail: str, fields: list[dict[str, str]]):
        super().__init__(detail)
        self.detail = detail
        self.fields = fields

    def body(self) -> dict[str, Any]:
        return {'detail': self.detail, 'fields': self.fields}


def _conflict(error: TransitionError) -> HTTPException:
    return HTTPException(409, str(error))


# --- Pure checks (unit tested) ---------------------------------------------------------------------------

def refusal_reason(code: str | None, detail: str | None, *, max_detail: int) -> tuple[str, str | None]:
    """Refusal of an event (detail up to 500) or of a receipt (up to 300): `outro` needs a 5+ character detail."""
    if code is None:
        raise HTTPException(422, REFUSAL_CODE)
    if detail is not None and len(detail) > max_detail:
        raise HTTPException(422, f'Descreva o motivo da recusa em até {max_detail} caracteres.')
    if code == 'outro' and (detail is None or len(detail) < 5):
        raise HTTPException(422, REFUSAL_DETAIL)
    return code, detail


def cancel_reason(reason: str | None) -> str:
    if reason is None or not CANCEL_REASON_LENGTH[0] <= len(reason.strip()) <= CANCEL_REASON_LENGTH[1]:
        raise HTTPException(422, CANCEL_REASON)
    return reason.strip()


def message_body(body: str | None) -> str:
    value = (body or '').strip()
    if not MESSAGE_LENGTH[0] <= len(value) <= MESSAGE_LENGTH[1]:
        raise HTTPException(422, 'Escreva o aviso (até 1000 caracteres).')
    return value


def ensure_writable(event: Event) -> None:
    """With the administration deciding on a revoked organizer's event, management is read-only."""
    if event.revocation_decision == 'pendente':
        raise HTTPException(409, REVOCATION_PENDING)


def ensure_editable(state: str, fields: Iterable[str]) -> None:
    """409 for fields the state does not allow (`event_rules.editable_fields`)."""
    blocked = set(fields) - set(editable_fields(state))
    if blocked:
        raise HTTPException(409, EDIT_MESSAGES.get(state, EDIT_CLOSED))


def checklist_error(items) -> FieldsError:
    return FieldsError('Complete o rascunho para publicar.',
                       [{'field': item.key, 'message': item.message or ''} for item in items if not item.done])


def merge_draft(current: dict[str, Any], changes: dict[str, Any]) -> dict[str, Any]:
    """Applies the sent fields to the current values, normalizes the Pix key and drops what the sport ignores.

    Raises FieldsError (`pix_key`) or HTTPException (dates) with the contract messages.
    """
    values = {**current, **changes}
    if values.get('pix_key') is not None and values.get('pix_key_type') is not None and (
            {'pix_key', 'pix_key_type'} & changes.keys()):
        try:
            values['pix_key'] = normalize_pix_key(values['pix_key_type'], values['pix_key'])
        except ValueError as error:
            raise FieldsError('Revise os campos informados.', [{'field': 'pix_key', 'message': str(error)}]) from None
    starts, closes = values.get('starts_at'), values.get('registration_closes_at')
    if starts is not None and closes is not None and closes > starts:
        raise HTTPException(422, 'As inscrições precisam fechar antes do início do evento.')
    return normalize_category(values)


# --- Shared queries (section 19) -------------------------------------------------------------------------

def _lapsed(now: datetime):
    """SQL twin of `event_rules.reservation_lapsed`."""
    return and_(EventEntry.state.in_(('reservada', 'rejeitada')), EventEntry.reserved_until.is_not(None),
                EventEntry.reserved_until <= now)


def _effective_state(now: datetime):
    """SQL twin of `event_rules.effective_entry_state`."""
    return case((_lapsed(now), literal('expirada')), else_=EventEntry.state)


def _effective_state_is(state: str, now: datetime):
    if state == 'expirada':
        return or_(EventEntry.state == 'expirada', _lapsed(now))
    if state in ('reservada', 'rejeitada'):
        return and_(EventEntry.state == state, ~_lapsed(now))
    return EventEntry.state == state


def holding_clause(now: datetime):
    """Entries that take a spot now (effective state): a lapsed reservation or refusal no longer does.

    The only SQL of the "vaga ocupada" rule (0003, 10.1): capacity, posters, eligibility and "Minhas inscrições".
    """
    return and_(EventEntry.state.in_(HOLDING_ENTRY_STATES), ~_lapsed(now))


def open_refund_clause():
    """SQL twin of `event_rules.is_open_refund` (and of the index `uq_entry_receipts_refund_open`)."""
    return and_(EntryReceipt.kind == 'devolucao', EntryReceipt.resolution.is_(None),
                or_(EntryReceipt.participant_response.is_(None), EntryReceipt.participant_response == 'contestada'))


def _open_refund():
    """The entry has a refund receipt still open: unanswered, or contested and not yet resolved."""
    return (select(EntryReceipt.id).where(EntryReceipt.entry_id == EventEntry.id, open_refund_clause())
            .correlate(EventEntry).exists())


def holding_counts(db: Session, event_ids: Iterable[int], *, now: datetime | None = None) -> dict[int, tuple[int, int]]:
    """(spots taken, confirmed) per event in one query, with a pair for every id (zeros without entries)."""
    ids = set(event_ids)
    if not ids:
        return {}
    moment = now or utcnow()
    rows = db.execute(select(EventEntry.event_id, func.count().filter(holding_clause(moment)),
                             func.count().filter(EventEntry.state == 'confirmada'))
                      .where(EventEntry.event_id.in_(ids)).group_by(EventEntry.event_id)).all()
    counts = dict.fromkeys(ids, (0, 0))
    counts.update({event_id: (int(taken), int(confirmed)) for event_id, taken, confirmed in rows})
    return counts


def pending_counts(db: Session, event_ids: Iterable[int]) -> dict[int, PendingCounts]:
    """Receipts to analyse and refunds to send, waiting or contested, per event in one query."""
    ids = set(event_ids)
    if not ids:
        return {}
    open_refund = _open_refund()
    rows = db.execute(select(
        EventEntry.event_id,
        func.count().filter(EventEntry.state == 'em_analise'),
        func.count().filter(and_(EventEntry.state == 'devolucao_pendente', ~open_refund)),
        func.count().filter(and_(EventEntry.state == 'devolucao_pendente', open_refund)),
        func.count().filter(EventEntry.state == 'devolucao_contestada'),
    ).where(EventEntry.event_id.in_(ids),
            EventEntry.state.in_(('em_analise', 'devolucao_pendente', 'devolucao_contestada')))
        .group_by(EventEntry.event_id)).all()
    counts = {event_id: PendingCounts() for event_id in ids}
    for event_id, receipts, to_send, awaiting, disputes in rows:
        counts[event_id] = PendingCounts(receipts=receipts, refunds_to_send=to_send, refunds_awaiting=awaiting,
                                         refund_disputes=disputes)
    return counts


def entries_by_state(db: Session, event_ids: Iterable[int], now: datetime) -> dict[int, dict[str, int]]:
    """Entries per effective state of each event (only the states that occur)."""
    ids = set(event_ids)
    if not ids:
        return {}
    state = _effective_state(now)
    rows = db.execute(select(EventEntry.event_id, state, func.count())
                      .where(EventEntry.event_id.in_(ids)).group_by(EventEntry.event_id, state)).all()
    result: dict[int, dict[str, int]] = {event_id: {} for event_id in ids}
    for event_id, value, count in rows:
        result[event_id][value] = count
    return result


def load_owned_event(db: Session, event_id: int, user: User, *, for_update: bool = False) -> Event:
    """The viewer's own event; 404 for anyone else (does not reveal that it exists)."""
    statement = select(Event).where(Event.id == event_id, Event.organizer_user_id == user.id)
    if for_update:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    event = db.scalar(statement)
    if event is None:
        raise HTTPException(404, EVENT_NOT_FOUND)
    return event


def lock_event(db: Session, event_id: int, *, share: bool = False) -> Event | None:
    """Locks the event row, level 3 of the global order (module docstring), fresh from the database.

    `share=True` (FOR SHARE) is for transitions of one entry: they run side by side for different entries of the
    same event and wait for any change of the event itself (FOR UPDATE), such as a cancellation or a revocation.
    """
    statement = select(Event).where(Event.id == event_id)
    statement = statement.with_for_update(read=True) if share else statement.with_for_update()
    return db.scalar(statement.execution_options(populate_existing=True))


def _load_for_staff(db: Session, event_id: int, user: User) -> Event:
    """Owner or administration (entries and receipts of G3/A2); 404 for everyone else."""
    event = db.get(Event, event_id)
    if event is None or (event.organizer_user_id != user.id and not user.is_admin):
        raise HTTPException(404, EVENT_NOT_FOUND)
    return event


def _reading_entry(now: datetime):
    """Entries whose people read the notice channel: all but expired and those the participant cancelled."""
    return and_(EventEntry.state != 'expirada', ~_lapsed(now),
                ~and_(EventEntry.state == 'cancelada', EventEntry.cancel_origin == 'participante'))


def channel_readers(db: Session, event: Event, *, now: datetime | None = None) -> list[int]:
    """The organizer and the participants (athletes, or active members of the entered teams), without repeats.

    The administration also reads the channel (`can_read_channel`), but is not a recipient of its notices.
    """
    entries = db.scalars(select(EventEntry).where(EventEntry.event_id == event.id, _reading_entry(now or utcnow()))
                         .order_by(EventEntry.created_at, EventEntry.id)).all()
    recipients = entry_recipients(db, entries, scope='membros')
    ids = [event.organizer_user_id, *(user_id for entry in entries for user_id in recipients[entry.id])]
    return list(dict.fromkeys(ids))


def can_read_channel(db: Session, event: Event, user: User, *, now: datetime | None = None) -> bool:
    """Reader of the notice channel (0003, 10.1): the owner, the administration and the participants (the athlete,
    or an active member of the entered team) whose entry did not expire and was not cancelled by themselves.

    The only implementation of the rule: G3/O3 (`GET /events/{id}/messages`) and the athlete's D2
    (`can_read_messages`) both call it.
    """
    if user.is_admin or event.organizer_user_id == user.id:
        return True
    teams = select(TeamMember.team_id).where(TeamMember.user_id == user.id, TeamMember.left_at.is_(None))
    return db.scalar(select(EventEntry.id).where(
        EventEntry.event_id == event.id, _reading_entry(now or utcnow()),
        or_(EventEntry.user_id == user.id, EventEntry.team_id.in_(teams))).limit(1)) is not None


def admin_ids(db: Session) -> list[int]:
    """Active administrative accounts (recipients of `evento_para_aprovar` and `devolucao_contestada`)."""
    return list(db.scalars(select(User.id).where(User.is_admin.is_(True), User.active.is_(True)).order_by(User.id)))


# --- Serialization ---------------------------------------------------------------------------------------

def _cities(db: Session, ids: Iterable[int | None]) -> dict[int, City]:
    ids = {city_id for city_id in ids if city_id is not None}
    return {city.id: city for city in db.scalars(select(City).where(City.id.in_(ids)))} if ids else {}


def _users(db: Session, ids: Iterable[int | None]) -> dict[int, User]:
    ids = {user_id for user_id in ids if user_id is not None}
    return {user.id: user for user in db.scalars(select(User).where(User.id.in_(ids)))} if ids else {}


def _people(db: Session, viewer: User, ids: Iterable[int | None]) -> dict[int, Any]:
    """Name and @ of each person; the avatar is hidden for blocks either way and for inactive accounts (9.1)."""
    users = _users(db, ids)
    hidden = blocked_ids(db, viewer.id, users)
    return {user_id: person_out(user, blocked=user_id in hidden or not user.active)
            for user_id, user in users.items()}


def posters_out(db: Session, events: Sequence[Event], now: datetime) -> dict[int, EventPosterOut]:
    """Posters of a page (O3, E2, D2, AD1, S1) with the spot counts of `holding_counts`, in two queries."""
    cities = _cities(db, (event.city_id for event in events))
    counts = holding_counts(db, (event.id for event in events), now=now)
    return {event.id: poster_out(event, cities.get(event.city_id), entries_count=counts[event.id][0],
                                 confirmed_count=counts[event.id][1], now=now) for event in events}


def _checklist(event: Event, now: datetime):
    return draft_checklist(event, now) if event.state == 'rascunho' else []


def _cards(db: Session, events: Sequence[Event], now: datetime) -> list[OrganizerEventCardOut]:
    posters = posters_out(db, events, now)
    pending = pending_counts(db, (event.id for event in events))
    championships = championship_lifecycle.status_for(db, events, now)
    cards = []
    for event in events:
        done = checklist_complete(_checklist(event, now))
        counts = championships.get(event.id)
        action = next_action(event, pending=pending[event.id], checklist_done=done, now=now, championship=counts)
        cards.append(OrganizerEventCardOut(**posters[event.id].model_dump(), pending=pending_out(pending[event.id]),
                                           next_action=next_action_out(action),
                                           championship=championship_out(counts) if counts is not None else None))
    return cards


def event_detail(db: Session, event: Event, now: datetime | None = None) -> OrganizerEventDetailOut:
    moment = now or utcnow()
    card = _cards(db, [event], moment)[0]
    checklist = _checklist(event, moment)
    active = get_active_organizer(db, event.organizer_user_id) is not None
    refusal = (EventRefusalOut(reason_code=event.review_reason_code, reason_detail=event.review_reason_detail,
                               reviewed_at=event.reviewed_at)
               if event.state == 'rascunho' and event.review_reason_code and event.reviewed_at else None)
    # Read-only while the administration decides, and for drafts of an organizer without the permission.
    writable = event.revocation_decision != 'pendente' and (event.state != 'rascunho' or active)
    bonus = tennis_bonus(event.sport, card.confirmed_count)
    return OrganizerEventDetailOut(
        **card.model_dump(), course_notes=event.course_notes, contact=event.contact, pix=pix_out(event),
        checklist=checklist_out(checklist),
        can_submit=event.state == 'rascunho' and active and checklist_complete(checklist),
        refusal=refusal, submitted_at=event.submitted_at, published_at=event.published_at,
        cancelled_at=event.cancelled_at, cancel_reason=event.cancel_reason,
        revocation_decision=event.revocation_decision,
        entries_by_state=entries_by_state(db, [event.id], moment)[event.id],
        editable_fields=list(editable_fields(event.state)) if writable else [],
        tennis_bonus=TennisBonusOut(**bonus) if bonus else None)


class _EntrySheet:
    """Rows needed to serialize entries and their receipts, loaded in a fixed number of queries."""

    def __init__(self, db: Session, viewer: User, entries: Sequence[EventEntry]):
        ids = {entry.id for entry in entries}
        receipts = list(db.scalars(select(EntryReceipt).where(EntryReceipt.entry_id.in_(ids))
                                   .order_by(EntryReceipt.created_at, EntryReceipt.id))) if ids else []
        self.receipts: dict[int, list[EntryReceipt]] = {entry_id: [] for entry_id in ids}
        for receipt in receipts:
            self.receipts[receipt.entry_id].append(receipt)
        media_ids = {receipt.media_id for receipt in receipts}
        self.media = {media.id: media for media in db.scalars(select(MediaObject).where(
            MediaObject.id.in_(media_ids)))} if media_ids else {}
        team_ids = {entry.team_id for entry in entries if entry.team_id is not None}
        self.teams = {team.id: team for team in db.scalars(select(Team).where(Team.id.in_(team_ids)))} \
            if team_ids else {}
        self.people = _people(db, viewer, [*(entry.user_id for entry in entries),
                                           *(entry.registered_by_id for entry in entries),
                                           *(receipt.uploaded_by_id for receipt in receipts)])

    def receipt(self, receipt: EntryReceipt) -> ReceiptOut:
        return receipt_out(receipt, self.media[receipt.media_id], self.people.get(receipt.uploaded_by_id))

    def payments(self, entry_id: int) -> list[EntryReceipt]:
        return [receipt for receipt in self.receipts[entry_id] if receipt.kind == 'pagamento']

    def refund(self, entry_id: int) -> EntryReceipt | None:
        """The open refund receipt, or the last one (receipts are in upload order)."""
        refunds = [receipt for receipt in self.receipts[entry_id] if receipt.kind == 'devolucao']
        opened = [receipt for receipt in refunds if is_open_refund(receipt)]
        return (opened or refunds or [None])[-1]

    def entry(self, entry: EventEntry, now: datetime) -> OrganizerEntryOut:
        team = self.teams.get(entry.team_id)
        subject = EntrySubjectOut(
            kind='time' if entry.team_id is not None else 'atleta',
            team=TeamRefOut(id=team.id, name=team.name, initials=team.initials, crest_url=team.crest_url)
            if team else None,
            athlete=self.people.get(entry.user_id))
        payments = self.payments(entry.id)
        refund = self.refund(entry.id)
        state = 'expirada' if reservation_lapsed(entry.state, entry.reserved_until, now) else entry.state
        return OrganizerEntryOut(
            id=entry.id, subject=subject, state=state, price_cents=entry.price_cents,
            reserved_until=entry.reserved_until, created_at=entry.created_at, confirmed_at=entry.confirmed_at,
            registered_by=self.people.get(entry.registered_by_id),
            latest_payment=self.receipt(payments[-1]) if payments else None,
            refund=self.receipt(refund) if refund else None)

    def review(self, receipt: EntryReceipt, entry: EventEntry, now: datetime) -> ReceiptReviewOut:
        payments = self.payments(entry.id)
        position = next(index for index, item in enumerate(payments) if item.id == receipt.id)
        return ReceiptReviewOut(receipt=self.receipt(receipt), entry=self.entry(entry, now), attempt=position + 1,
                                previous=[self.receipt(item) for item in reversed(payments[:position])])


def organizer_entries_out(db: Session, viewer: User, entries: Sequence[EventEntry],
                          now: datetime) -> dict[int, OrganizerEntryOut]:
    """`OrganizerEntry` of each entry (G3, A2, the refund upload and the contested refunds queue), by entry id."""
    sheet = _EntrySheet(db, viewer, entries)
    return {entry.id: sheet.entry(entry, now) for entry in entries}


def _messages_out(db: Session, viewer: User, messages: Sequence[EventMessage]) -> list[EventMessageOut]:
    authors = _users(db, (message.author_id for message in messages))
    hidden = blocked_ids(db, viewer.id, authors)
    items = []
    for message in messages:
        author = authors.get(message.author_id)
        items.append(EventMessageOut(
            id=message.id, kind=message.kind, body=message.body, created_at=message.created_at,
            author=person_out(author, blocked=author.id in hidden) if author is not None and author.active else None))
    return items


def admin_events_out(db: Session, viewer: User, events: Sequence[Event],
                     now: datetime | None = None) -> list[AdminEventOut]:
    moment = now or utcnow()
    posters = posters_out(db, events, moment)
    pending = pending_counts(db, (event.id for event in events))
    states = entries_by_state(db, (event.id for event in events), moment)
    owner_ids = {event.organizer_user_id for event in events}
    owners = _people(db, viewer, owner_ids)
    owner_users = _users(db, owner_ids)
    permission_ids = {event.organizer_id for event in events if event.organizer_id is not None}
    permissions = {row.id: row for row in db.scalars(select(Organizer).where(Organizer.id.in_(permission_ids)))} \
        if permission_ids else {}
    active = set(db.scalars(select(Organizer.user_id).where(Organizer.user_id.in_(owner_ids),
                                                            Organizer.revoked_at.is_(None)))) if owner_ids else set()
    items = []
    for event in events:
        permission = permissions.get(event.organizer_id)
        display_name = permission.display_name if permission else owner_users[event.organizer_user_id].name
        items.append(AdminEventOut(
            **posters[event.id].model_dump(),
            organizer=AdminEventOrganizerOut(organizer_id=event.organizer_id, display_name=display_name,
                                             user=owners[event.organizer_user_id],
                                             active=event.organizer_user_id in active),
            pix=pix_out(event), contact=event.contact, course_notes=event.course_notes,
            submitted_at=event.submitted_at, published_at=event.published_at,
            revocation_decision=event.revocation_decision, pending=pending_out(pending[event.id]),
            entries_by_state=states[event.id]))
    return items


# --- Organizer: events (O3, V4, G3) ----------------------------------------------------------------------

def list_events(db: Session, user: User, scope: str, cursor: str | None,
                limit: int) -> tuple[list[OrganizerEventCardOut], str | None]:
    """`abertos`: one page by start date (undated drafts last); `encerrados`: paginated, most recent first."""
    now = utcnow()
    if scope == 'abertos':
        rows = list(db.scalars(select(Event).where(Event.organizer_user_id == user.id,
                                                   Event.state.in_(OPEN_EVENT_STATES))
                               .order_by(Event.starts_at.asc().nulls_last(), Event.id.asc())))
        return _cards(db, rows, now), None
    statement = select(Event).where(Event.organizer_user_id == user.id, Event.state.in_(CLOSED_STATES))
    rows, next_cursor = paginate(statement, cursor, limit, Event.starts_at, Event.id, db)
    return _cards(db, rows, now), next_cursor


def _require_permission(db: Session, user: User) -> Organizer:
    # Locks the permission row: a concurrent revocation waits for this transaction (or this one for it).
    organizer = get_active_organizer(db, user.id, for_update=True)
    if organizer is None:
        raise HTTPException(403, NOT_ORGANIZER)
    return organizer


def _require_city(db: Session, city_id: int | None) -> None:
    if city_id is not None and db.get(City, city_id) is None:
        raise HTTPException(422, 'Selecione uma cidade do catálogo.')


def create_event(db: Session, user: User, data: EventCreateInput) -> OrganizerEventDetailOut:
    organizer = _require_permission(db, user)
    fields = set(data.model_fields_set)
    changes = {field: getattr(data, field) for field in fields}
    _require_city(db, changes.get('city_id'))
    values = merge_draft(dict.fromkeys(DRAFT_FIELDS), changes)
    event = Event(organizer_user_id=user.id, organizer_id=organizer.id, state='rascunho', **values)
    db.add(event)
    db.flush()
    audit.record(db, actor_id=user.id, action='evento.criado', target_type='event', target_id=event.id,
                 data={'organizer_id': organizer.id, 'fields': sorted(fields)})
    db.commit()
    return event_detail(db, event)


def update_event(db: Session, user: User, event_id: int, data: EventUpdateInput) -> OrganizerEventDetailOut:
    fields = set(data.model_fields_set)
    # The permission row is locked before the event (same order as the revocation); drafts require it.
    organizer = get_active_organizer(db, user.id, for_update=True)
    event = load_owned_event(db, event_id, user, for_update=True)
    ensure_writable(event)
    if event.state == 'rascunho' and organizer is None:
        raise HTTPException(403, NOT_ORGANIZER)
    ensure_editable(event.state, fields)
    changes = {field: getattr(data, field) for field in fields}
    _require_city(db, changes.get('city_id'))
    if event.state != 'rascunho' and 'venue' in changes and not (
            changes['venue'] and VENUE_LENGTH[0] <= len(changes['venue']) <= VENUE_LENGTH[1]):
        raise HTTPException(422, 'Informe o local com 2 a 120 caracteres.')
    current = {field: getattr(event, field) for field in DRAFT_FIELDS}
    values = merge_draft(current, changes)
    changed = sorted(field for field in DRAFT_FIELDS if values[field] != current[field])
    for field in changed:
        setattr(event, field, values[field])
    if changed:
        audit.record(db, actor_id=user.id, action='evento.editado', target_type='event', target_id=event.id,
                     data={'fields': changed})
    db.commit()
    return event_detail(db, event)


def delete_event(db: Session, user: User, event_id: int) -> None:
    event = load_owned_event(db, event_id, user, for_update=True)
    if event.state != 'rascunho':
        raise HTTPException(409, 'Só rascunhos podem ser excluídos.')
    audit.record(db, actor_id=user.id, action='evento.rascunho_excluido', target_type='event', target_id=event.id,
                 data={'name': event.name})
    db.delete(event)
    db.commit()


def submit_event(db: Session, user: User, event_id: int) -> OrganizerEventDetailOut:
    _require_permission(db, user)
    event = load_owned_event(db, event_id, user, for_update=True)
    ensure_writable(event)
    now = utcnow()
    paid = bool(event.price_cents)
    try:
        target = next_event_state(event.state, 'enviar', paid=paid)
    except TransitionError as error:
        raise _conflict(error) from None
    items = draft_checklist(event, now)
    if not checklist_complete(items):
        raise checklist_error(items)
    event.state = target
    event.review_reason_code = event.review_reason_detail = None
    if target == 'publicado':
        event.published_at = now
        for field in PIX_FIELDS:
            setattr(event, field, None)
        audit.record(db, actor_id=user.id, action='evento.publicado', target_type='event', target_id=event.id)
    else:
        event.submitted_at = now
        notifications.notify_many(db, admin_ids(db), 'evento_para_aprovar',
                                  {'event_id': event.id, 'event_name': event.name}, actor_id=user.id,
                                  action_key=notifications.event_review_key(event.id))
        audit.record(db, actor_id=user.id, action='evento.enviado', target_type='event', target_id=event.id,
                     data={'price_cents': event.price_cents})
    db.commit()
    return event_detail(db, event, now)


def withdraw_event(db: Session, user: User, event_id: int) -> OrganizerEventDetailOut:
    event = load_owned_event(db, event_id, user, for_update=True)
    ensure_writable(event)
    try:
        event.state = next_event_state(event.state, 'retirar')
    except TransitionError as error:
        raise _conflict(error) from None
    event.submitted_at = None
    notifications.resolve_actions(db, notifications.event_review_key(event.id))
    audit.record(db, actor_id=user.id, action='evento.retirado', target_type='event', target_id=event.id)
    db.commit()
    return event_detail(db, event)


def cancel_event(db: Session, event: Event, *, actor_id: int, reason: str, now: datetime,
                 by_admin: bool = False) -> dict[str, Any]:
    """Cancels a locked event: entries, automatic notice, notifications and audit, without committing.

    Paid entries confirmed or under analysis wait for the refund by Pix (`devolucao_pendente`); the others that
    still held a spot are cancelled with `cancel_origin = 'evento'`; a lapsed reservation is expired first (the
    sweep would do the same). `by_admin` hides the administrator behind "A administração" for the participants.
    """
    try:
        target = next_event_state(event.state, 'cancelar')
    except TransitionError as error:
        raise _conflict(error) from None
    entries = list(db.scalars(select(EventEntry).where(EventEntry.event_id == event.id)
                              .order_by(EventEntry.id).with_for_update().execution_options(populate_existing=True)))
    lapsed = [entry for entry in entries if reservation_lapsed(entry.state, entry.reserved_until, now)]
    expire_entries(db, lapsed, now)
    lapsed_ids = {entry.id for entry in lapsed}
    refunds: list[EventEntry] = []
    cancelled: list[EventEntry] = []
    analysing: list[int] = []
    for entry in entries:
        if entry.id in lapsed_ids:
            continue
        new_state = entry_state_on_event_cancel(entry.state, paid=entry.price_cents > 0)
        if new_state is None:
            continue
        if entry.state == 'em_analise':
            analysing.append(entry.id)
        entry.state = new_state
        if new_state == 'cancelada':
            entry.cancelled_at, entry.cancelled_by_id, entry.cancel_origin = now, actor_id, 'evento'
            cancelled.append(entry)
        else:
            refunds.append(entry)
    # Nothing is left to answer: a refused receipt no longer awaits a new one (those expired were closed by
    # `expire_entries`), and a receipt under analysis cannot be decided once the entry waits for its refund.
    notifications.resolve_actions_many(db, [notifications.entry_receipt_key(entry.id) for entry in cancelled])
    if analysing:
        notifications.resolve_actions_many(db, [notifications.receipt_key(receipt_id) for receipt_id in db.scalars(
            select(EntryReceipt.id).where(EntryReceipt.entry_id.in_(analysing), EntryReceipt.kind == 'pagamento',
                                          EntryReceipt.decision.is_(None)))])
    event.state = target
    event.cancelled_at, event.cancelled_by_id, event.cancel_reason = now, actor_id, reason
    # Championship matches still being arranged or scheduled are cancelled with the event (fase 6).
    championship_lifecycle.cancel_event_matches(db, event, actor_id=actor_id, now=now)
    shown_actor = None if by_admin else actor_id
    message = EventMessage(event_id=event.id, author_id=shown_actor, kind='evento_cancelado', body=reason,
                           created_at=now)
    db.add(message)
    db.flush()
    recipients = entry_recipients(db, [*refunds, *cancelled], scope='membros')
    for entry in [*refunds, *cancelled]:
        notifications.notify_many(db, recipients[entry.id], 'evento_cancelado', {
            'event_id': event.id, 'event_name': event.name, 'entry_id': entry.id, 'reason': reason,
            'refund': entry.state == 'devolucao_pendente'}, actor_id=shown_actor)
    audit.record(db, actor_id=actor_id, action='evento.cancelado', target_type='event', target_id=event.id,
                 data={'reason': reason, 'refunds': len(refunds), 'cancelled': len(cancelled),
                       'expired': len(lapsed), 'message_id': message.id})
    return {'refunds': [entry.id for entry in refunds], 'cancelled': [entry.id for entry in cancelled],
            'expired': [entry.id for entry in lapsed], 'message_id': message.id}


def cancel_owned_event(db: Session, user: User, event_id: int, reason: str | None) -> OrganizerEventDetailOut:
    event = load_owned_event(db, event_id, user, for_update=True)
    ensure_writable(event)
    now = utcnow()
    # `cancel_event` answers 409 outside 'publicado' and 'em_andamento'.
    cancel_event(db, event, actor_id=user.id, reason=cancel_reason(reason), now=now)
    db.commit()
    return event_detail(db, event, now)


def on_organizer_revoked(db: Session, organizer: Organizer, *, actor_id: int) -> list[Event]:
    """Called inside the revocation transaction (organizer row already locked); no commit.

    Events waiting for approval go back to draft; published or running ones wait for the administration
    (`revocation_decision = 'pendente'`: entries suspended, management read-only). Drafts do not change.
    """
    events = list(db.scalars(select(Event).where(
        Event.organizer_user_id == organizer.user_id, Event.state.in_(('em_aprovacao', 'publicado', 'em_andamento')))
        .order_by(Event.id).with_for_update().execution_options(populate_existing=True)))
    for event in events:
        if event.state == 'em_aprovacao':
            event.state = next_event_state(event.state, 'revogar')
            event.submitted_at = None
            notifications.resolve_actions(db, notifications.event_review_key(event.id))
            audit.record(db, actor_id=actor_id, action='evento.retirado', target_type='event', target_id=event.id,
                         data={'automatico': True, 'organizer_id': organizer.id})
            continue
        event.revocation_decision = 'pendente'
        event.revocation_decided_at = event.revocation_decided_by_id = None
        audit.record(db, actor_id=actor_id, action='evento.revogacao_pendente', target_type='event',
                     target_id=event.id, data={'organizer_id': organizer.id})
    return events


# --- Entries and receipts (G3, A2) -----------------------------------------------------------------------

def list_entries(db: Session, user: User, event_id: int, state: str | None, cursor: str | None,
                 limit: int) -> tuple[list[OrganizerEntryOut], str | None]:
    event = _load_for_staff(db, event_id, user)
    now = utcnow()
    statement = select(EventEntry).where(EventEntry.event_id == event.id)
    if state is not None:
        statement = statement.where(_effective_state_is(state, now))
    rows, next_cursor = paginate(statement, cursor, limit, EventEntry.created_at, EventEntry.id, db, ascending=True)
    views = organizer_entries_out(db, user, rows, now)
    return [views[entry.id] for entry in rows], next_cursor


def _reviews(db: Session, viewer: User, receipts: Sequence[EntryReceipt], now: datetime) -> list[ReceiptReviewOut]:
    entry_ids = {receipt.entry_id for receipt in receipts}
    entries = {entry.id: entry for entry in db.scalars(select(EventEntry).where(EventEntry.id.in_(entry_ids)))} \
        if entry_ids else {}
    sheet = _EntrySheet(db, viewer, list(entries.values()))
    return [sheet.review(receipt, entries[receipt.entry_id], now) for receipt in receipts]


def list_receipts(db: Session, user: User, event_id: int, tab: str, cursor: str | None,
                  limit: int) -> tuple[list[ReceiptReviewOut], str | None]:
    """`para_analisar`: undecided payments of entries under analysis, oldest first; `decididos`: newest first."""
    event = _load_for_staff(db, event_id, user)
    statement = select(EntryReceipt).join(EventEntry, EventEntry.id == EntryReceipt.entry_id).where(
        EventEntry.event_id == event.id, EntryReceipt.kind == 'pagamento')
    if tab == 'para_analisar':
        statement = statement.where(EntryReceipt.decision.is_(None), EventEntry.state == 'em_analise')
        rows, next_cursor = paginate(statement, cursor, limit, EntryReceipt.created_at, EntryReceipt.id, db,
                                     ascending=True)
    else:
        statement = statement.where(EntryReceipt.decision.is_not(None))
        rows, next_cursor = paginate(statement, cursor, limit, EntryReceipt.decided_at, EntryReceipt.id, db)
    return _reviews(db, user, rows, utcnow()), next_cursor


def decide_receipt(db: Session, user: User, receipt_id: int, data: ReceiptDecisionInput) -> ReceiptReviewOut:
    receipt = db.get(EntryReceipt, receipt_id)
    if receipt is None or receipt.kind != 'pagamento':
        raise HTTPException(404, RECEIPT_NOT_FOUND)
    entry = db.get(EventEntry, receipt.entry_id)
    event = db.get(Event, entry.event_id)
    if event.organizer_user_id != user.id:
        # Who may see the receipt (administration, athlete, representatives) learns why; the others get 404.
        if user.is_admin or entry_role(db, entry, user.id) in ('atleta', 'representante'):
            raise HTTPException(403, ONLY_ORGANIZER_DECIDES)
        raise HTTPException(404, RECEIPT_NOT_FOUND)
    refusal = (refusal_reason(data.reason_code, data.reason_detail, max_detail=300)
               if data.decision == 'recusar' else None)
    # Global order: event (FOR SHARE, a transition of one entry) -> entry -> receipt.
    event = lock_event(db, event.id, share=True)
    ensure_writable(event)
    entry = db.scalar(select(EventEntry).where(EventEntry.id == entry.id).with_for_update()
                      .execution_options(populate_existing=True))
    receipt = db.scalar(select(EntryReceipt).where(EntryReceipt.id == receipt_id).with_for_update()
                        .execution_options(populate_existing=True))
    if receipt.decision is not None:
        raise HTTPException(409, 'Este comprovante já foi decidido.')
    now = utcnow()
    action = 'aprovar_comprovante' if refusal is None else 'recusar_comprovante'
    try:
        new_state = next_entry_state(entry.state, action, now=now, reserved_until=entry.reserved_until)
    except TransitionError as error:
        raise _conflict(error) from None
    receipt.decided_at, receipt.decided_by_id = now, user.id
    entry.state = new_state
    payload: dict[str, Any] = {'event_id': event.id, 'event_name': event.name, 'entry_id': entry.id,
                               'receipt_id': receipt.id}
    if refusal is None:
        receipt.decision = 'aprovado'
        entry.confirmed_at = now
        payload['decision'] = 'aprovado'
    else:
        receipt.decision = 'recusado'
        receipt.reason_code, receipt.reason_detail = refusal
        if new_state == 'expirada':
            entry.expired_at = now
        # `entry_state` (optional field) tells the client when the refusal came after the reservation ended.
        payload.update(decision='recusado', reason_code=receipt.reason_code, reason_detail=receipt.reason_detail,
                       entry_state=new_state, reserved_until=entry.reserved_until.isoformat()
                       if new_state == 'rejeitada' and entry.reserved_until else None)
    notifications.resolve_actions(db, notifications.receipt_key(receipt.id))
    recipients = entry_recipients(db, [entry], scope='representantes')[entry.id]
    if refusal is None:
        notifications.notify_many(db, recipients, 'comprovante_decidido', payload, actor_id=user.id)
    elif new_state == 'rejeitada':
        # Time left to send another receipt: pending until the reservation ends or a new receipt arrives.
        notifications.notify_many(db, recipients, 'comprovante_decidido', payload, actor_id=user.id,
                                  action_key=notifications.entry_receipt_key(entry.id),
                                  action_until=entry.reserved_until)
    else:
        # Refused after the reservation ended: the entry expired at once, there is nothing to answer.
        notifications.notify_many(db, recipients, 'comprovante_decidido', payload, actor_id=user.id,
                                  informative=True)
    audit.record(db, actor_id=user.id, action=f'comprovante.{receipt.decision}', target_type='entry_receipt',
                 target_id=receipt.id, data={'entry_id': entry.id, 'event_id': event.id, 'entry_state': new_state,
                                             'reason_code': receipt.reason_code})
    db.commit()
    return _reviews(db, user, [receipt], now)[0]


# --- Notice channel --------------------------------------------------------------------------------------

def list_messages(db: Session, user: User, event_id: int, cursor: str | None,
                  limit: int) -> tuple[list[EventMessageOut], str | None]:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(404, EVENT_NOT_FOUND)
    if not can_read_channel(db, event, user):
        if event.state in VISIBLE_EVENT_STATES:
            raise HTTPException(403, CHANNEL_FORBIDDEN)
        raise HTTPException(404, EVENT_NOT_FOUND)
    statement = select(EventMessage).where(EventMessage.event_id == event.id)
    rows, next_cursor = paginate(statement, cursor, limit, EventMessage.created_at, EventMessage.id, db)
    return _messages_out(db, user, rows), next_cursor


def post_message(db: Session, user: User, event_id: int, body: str) -> EventMessageOut:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(404, EVENT_NOT_FOUND)
    if event.organizer_user_id != user.id:
        if event.state in VISIBLE_EVENT_STATES or user.is_admin:
            raise HTTPException(403, ONLY_ORGANIZER_WRITES)
        raise HTTPException(404, EVENT_NOT_FOUND)
    ensure_writable(event)
    if event.state not in VISIBLE_EVENT_STATES:
        raise HTTPException(409, 'Publique o evento antes de enviar avisos.')
    message = EventMessage(event_id=event.id, author_id=user.id, kind='aviso', body=message_body(body),
                           created_at=utcnow())
    db.add(message)
    db.flush()
    notifications.notify_many(db, channel_readers(db, event), 'aviso_evento', {
        'event_id': event.id, 'event_name': event.name, 'message_id': message.id}, actor_id=user.id)
    db.commit()
    return _messages_out(db, user, [message])[0]


# --- Administration (AD1, 15.1 and 15.2) -----------------------------------------------------------------

def queue_counts(db: Session) -> dict[str, int]:
    """Counters added to `GET /admin/queue-counts` by stage 2."""
    paid = db.scalar(select(func.count()).select_from(Event).where(Event.state == 'em_aprovacao')) or 0
    revoked = db.scalar(select(func.count()).select_from(Event).where(Event.revocation_decision == 'pendente')) or 0
    disputes = db.scalar(select(func.count()).select_from(EventEntry)
                         .where(EventEntry.state == 'devolucao_contestada')) or 0
    return {'paid_events': paid, 'revoked_events': revoked, 'refund_disputes': disputes}


def admin_list_events(db: Session, admin: User, queue: str, cursor: str | None,
                      limit: int) -> tuple[list[AdminEventOut], str | None]:
    """`em_aprovacao` by submission (oldest first); `revogacao` by start date (soonest first)."""
    if queue == 'em_aprovacao':
        statement = select(Event).where(Event.state == 'em_aprovacao')
        rows, next_cursor = paginate(statement, cursor, limit, Event.submitted_at, Event.id, db, ascending=True)
    else:
        statement = select(Event).where(Event.revocation_decision == 'pendente')
        rows, next_cursor = paginate(statement, cursor, limit, Event.starts_at, Event.id, db, ascending=True)
    return admin_events_out(db, admin, rows), next_cursor


def admin_get_event(db: Session, admin: User, event_id: int) -> AdminEventOut:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(404, EVENT_NOT_FOUND)
    return admin_events_out(db, admin, [event])[0]


def admin_decide_event(db: Session, admin: User, event_id: int, data: AdminEventDecisionInput) -> AdminEventOut:
    refusal = (refusal_reason(data.reason_code, data.reason_detail, max_detail=500)
               if data.decision == 'recusar' else None)
    event = lock_event(db, event_id)
    if event is None:
        raise HTTPException(404, EVENT_NOT_FOUND)
    now = utcnow()
    try:
        target = next_event_state(event.state, 'aprovar' if refusal is None else 'recusar')
    except TransitionError as error:
        raise _conflict(error) from None
    if refusal is None:
        deadline = event_registration_deadline(event)
        if deadline is None or now >= deadline:
            raise HTTPException(409, 'As datas deste evento já passaram. Recuse para o organizador corrigir.')
    event.state = target
    event.reviewed_by_id, event.reviewed_at = admin.id, now
    payload: dict[str, Any] = {'event_id': event.id, 'event_name': event.name}
    if refusal is None:
        event.published_at = now
        event.review_reason_code = event.review_reason_detail = None
        payload['decision'] = 'aprovado'
    else:
        event.submitted_at = None
        event.review_reason_code, event.review_reason_detail = refusal
        payload.update(decision='recusado', reason_code=event.review_reason_code,
                       reason_detail=event.review_reason_detail)
    # Decided by any administrator: the pending of all of them closes (the 409 above leaves it open).
    notifications.resolve_actions(db, notifications.event_review_key(event.id))
    # actor null: the organizer sees "A administração".
    notifications.notify(db, event.organizer_user_id, 'evento_decidido', payload)
    audit.record(db, actor_id=admin.id, action=f"evento.{payload['decision']}", target_type='event',
                 target_id=event.id, data={key: payload[key] for key in ('reason_code', 'reason_detail')
                                           if key in payload})
    db.commit()
    return admin_events_out(db, admin, [event], now)[0]


def admin_decide_revocation(db: Session, admin: User, event_id: int, decision: str,
                            reason: str | None) -> AdminEventOut:
    reason_text = cancel_reason(reason) if decision == 'cancelar' else None
    event = lock_event(db, event_id)
    if event is None:
        raise HTTPException(404, EVENT_NOT_FOUND)
    if event.revocation_decision != 'pendente':
        raise HTTPException(409, 'Este evento não aguarda decisão da administração.')
    now = utcnow()
    if decision == 'cancelar':
        cancel_event(db, event, actor_id=admin.id, reason=reason_text, now=now, by_admin=True)
        outcome = 'cancelado'
    else:
        outcome = 'seguir'
    event.revocation_decision = outcome
    event.revocation_decided_by_id, event.revocation_decided_at = admin.id, now
    notifications.notify(db, event.organizer_user_id, 'evento_revogacao_decidida', {
        'event_id': event.id, 'event_name': event.name, 'decision': outcome})
    audit.record(db, actor_id=admin.id, action='evento.revogacao_decidida', target_type='event', target_id=event.id,
                 data={'decision': outcome, **({'reason': reason_text} if reason_text else {})})
    db.commit()
    return admin_events_out(db, admin, [event], now)[0]

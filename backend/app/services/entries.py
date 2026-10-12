"""Athlete side of events: posters with eligibility, entries, payment receipts and refunds (stage 2).

Jogar, fase 7 (docs/decisoes/0002-jogar.md, section 6) and Times e campeonatos, sections 15.3 and 16
(docs/decisoes/0003-times-campeonatos.md). The titular always comes from the session. Locks follow the global order
of `services/events.py` (event -> team -> entries -> receipts): entering locks the event row FOR UPDATE, so two
entries at once never pass the capacity; the transitions of one entry (receipt, giving up, refund, answer and the
administration's decision) lock the event FOR SHARE, then the entry and then its receipts, so they never interleave
with a cancellation or a revocation of the event. Every transition goes in one commit with its notifications and
audit rows. Reads use the effective state: a lapsed reservation shows (and counts) as 'expirada' before the sweep.
The shared pieces (spot counts, posters, the notice channel rule and the organizer's entry row) come from
`services/events.py`, so both fronts answer the same numbers.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field
from datetime import datetime

from fastapi import HTTPException
from fastapi.responses import Response
from sqlalchemy import and_, func, or_, select, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.pagination import decode_cursor, encode_cursor, paginate
from app.models.events import (
    HOLDING_ENTRY_STATES,
    REFUND_ENTRY_STATES,
    VISIBLE_EVENT_STATES,
    EntryReceipt,
    Event,
    EventEntry,
)
from app.models.identity import MediaObject, User, utcnow
from app.models.organizers import Organizer
from app.models.rankings import Standing
from app.models.teams import Team, TeamMember
from app.schemas.common import PersonOut
from app.schemas.entries import (
    EventCardOut,
    EventDetailOut,
    EventEligibilityOut,
    EventOrganizerOut,
    MyEntryOut,
    MyEntrySummaryOut,
    PublicEntryOut,
    RefundDisputeOut,
    TeamEligibilityOut,
)
from app.schemas.events import (
    EntrySubjectOut,
    OrganizerEntryOut,
    ReceiptOut,
    TennisBonusOut,
    pix_out,
    receipt_out,
)
from app.schemas.rankings import TeamRefOut
from app.services import audit, media, notifications
from app.services.event_rules import (
    NO_TEAM,
    TransitionError,
    effective_entry_state,
    eligibility,
    entry_subject,
    initial_entry_state,
    is_open_refund,
    next_entry_state,
    refund_auto_confirm_at,
    registration_open,
    reservation_deadline,
    reservation_lapsed,
    spots_left,
    tennis_bonus,
)
from app.services.events import (
    admin_ids,
    can_read_channel,
    holding_clause,
    holding_counts,
    lock_event,
    open_refund_clause,
    organizer_entries_out,
    posters_out,
)
from app.services.participants import entry_recipients, entry_role
from app.services.people import blocked_between, blocked_ids, person_out
from app.services.rankings import subject_tier, team_format_grid
from app.services.sweep import expire_entries

LISTED_EVENT_STATES = ('publicado', 'em_andamento')
REFUND_IN_PROGRESS = ('devolucao_pendente', 'devolucao_contestada')
ACTING_ROLES = ('atleta', 'representante')
RECEIPT_ROLES = ('atleta', 'representante', 'organizador', 'administracao')
REFUND_REASON_LENGTH = (5, 500)

EVENT_NOT_FOUND = 'Evento não encontrado.'
ENTRY_NOT_FOUND = 'Inscrição não encontrada.'
RECEIPT_NOT_FOUND = 'Comprovante não encontrado.'
TEAM_NOT_FOUND = 'Time não encontrado.'
REGISTRATION_CLOSED = 'As inscrições deste evento estão fechadas.'
OWN_EVENT = 'Você não se inscreve no próprio evento.'
TEAM_REQUIRED = 'Escolha o time que vai se inscrever.'
TEAM_ONLY_FOOTBALL = 'Inscrição por time só no futebol.'
ONLY_REP_ENTER = 'Só representantes inscrevem o time.'
TEAM_ALREADY_ENTERED = 'Este time já está inscrito.'
ATHLETE_ALREADY_ENTERED = 'Você já está inscrito.'
NO_SPOTS = 'As vagas deste evento acabaram.'
PAID_CANCEL = 'Para desistir de uma inscrição paga, fale com o organizador.'
EVENT_STARTED = 'O evento já começou.'
NOT_WAITING_RECEIPT = 'Esta inscrição não aguarda comprovante.'
NOT_WAITING_REFUND = 'Esta inscrição não aguarda devolução.'
REFUND_ALREADY_SENT = 'A devolução já foi enviada; aguarde a resposta do participante.'
NO_REFUND_TO_ANSWER = 'Nenhuma devolução aguarda a sua resposta.'
CONTEST_REASON = 'Conte o que aconteceu com a devolução.'
NOT_CONTESTED = 'Esta devolução não está contestada.'
DECISION_REASON = 'Descreva a decisão.'
ONLY_ORGANIZER_REFUND = 'Só o organizador do evento envia a devolução.'
TEAM_HAS_ACTIVE_ENTRY = 'Encerre ou cancele as partidas agendadas e as inscrições ativas antes de encerrar o time.'
# 403 for people who see the entry but do not act on it: the team message from the contract, and its athlete twin.
ROLE_MESSAGES = {
    'cancel': ('Só representantes cancelam a inscrição do time.', 'Só o atleta inscrito cancela a inscrição.'),
    'receipt': ('Só representantes enviam o comprovante do time.', 'Só o atleta inscrito envia o comprovante.'),
    'refund': ('Só representantes respondem à devolução do time.', 'Só o atleta inscrito responde à devolução.'),
}


# --- Pure rules (unit tested) ---------------------------------------------------------------------------------

def resolve_role(participant: str | None, *, organizer: bool, admin: bool) -> str | None:
    """Viewer's role on an entry: who acts first (athlete, representative), then the event owner, the
    administration and the team members who only follow it. None means 404."""
    if participant in ACTING_ROLES:
        return participant
    if organizer:
        return 'organizador'
    if admin:
        return 'administracao'
    return participant


def can_view_receipt(role: str | None) -> bool:
    """Receipt history and files: the athlete or the team's representatives, the event owner and the
    administration. Other team members only see the entry state."""
    return role in RECEIPT_ROLES


def role_message(action: str, *, team: bool) -> str:
    team_message, athlete_message = ROLE_MESSAGES[action]
    return team_message if team else athlete_message


def holding_now(entry: EventEntry, now: datetime) -> bool:
    return effective_entry_state(entry.state, entry.reserved_until, now) in HOLDING_ENTRY_STATES


def refund_waiting_answer(receipt: EntryReceipt | None, now: datetime) -> bool:
    """The participant can still answer: attached, unanswered and inside the 7 days (then it counts as received)."""
    return (receipt is not None and receipt.kind == 'devolucao' and receipt.participant_response is None
            and now < refund_auto_confirm_at(receipt.created_at))


def cancel_error(state: str, *, paid: bool, starts_at: datetime | None, now: datetime) -> str | None:
    """Why the participant cannot give up (409), or None. `state` is the effective state."""
    if paid and state == 'em_analise':
        return PAID_CANCEL
    try:
        next_entry_state(state, 'cancelar', paid=paid)
    except TransitionError as error:
        return str(error)
    if starts_at is not None and now >= starts_at:
        return EVENT_STARTED
    return None


def start_for_cancel(event: Event, now: datetime) -> datetime | None:
    """When the event counts as started for giving up: its start, or already when the organizer confirmed the bracket
    (`em_andamento`): the draw was made with the confirmed entries, so nobody leaves afterwards."""
    return now if event.state in ('em_andamento', 'encerrado') else event.starts_at


def entry_flags(*, role: str, state: str, paid: bool, starts_at: datetime | None, reserved_until: datetime | None,
                refund: EntryReceipt | None, now: datetime) -> tuple[bool, bool, bool]:
    """(can_send_receipt, can_cancel, can_respond_refund) for the viewer of an entry."""
    acting = role in ACTING_ROLES
    can_send = (acting and state in ('reservada', 'rejeitada') and reserved_until is not None
                and now < reserved_until)
    can_cancel = acting and cancel_error(state, paid=paid, starts_at=starts_at, now=now) is None
    can_respond = acting and state == 'devolucao_pendente' and refund_waiting_answer(refund, now)
    return can_send, can_cancel, can_respond


def summary_rank(state: str) -> int | None:
    """Which of the viewer's entries the poster shows: one holding a spot, then a refund, then an expiry."""
    if state in HOLDING_ENTRY_STATES:
        return 0
    if state in REFUND_ENTRY_STATES:
        return 1
    if state == 'expirada':
        return 2
    return None


def pick_my_entry(entries: Iterable[EventEntry], now: datetime) -> EventEntry | None:
    ranked = [(rank, entry) for entry in entries
              if (rank := summary_rank(effective_entry_state(entry.state, entry.reserved_until, now))) is not None]
    if not ranked:
        return None
    return min(ranked, key=lambda pair: (pair[0], -pair[1].created_at.timestamp(), -pair[1].id))[1]


def football_eligibility(accepted_tiers: Sequence[str] | None,
                         teams: Sequence[tuple[TeamRefOut, str | None, int | None]]) -> EventEligibilityOut:
    """RN18 for football: (team, tier in the event format, holding entry id) of each team the viewer represents.

    Eligible when some team is eligible and not entered yet. Without such a team, an entered team hides the
    lock (the poster shows the entry); otherwise the first refusal explains the lock.
    """
    if not teams:
        return EventEligibilityOut(eligible=False, reason=NO_TEAM.reason, message=NO_TEAM.message, tier=None,
                                   teams=[])
    items, refusal = [], None
    for team, tier, entry_id in teams:
        result = eligibility(accepted_tiers, tier)
        items.append(TeamEligibilityOut(team=team, tier=tier, eligible=result.eligible, reason=result.reason,
                                        entry_id=entry_id))
        if not result.eligible and refusal is None:
            refusal = result
    if any(item.eligible and item.entry_id is None for item in items):
        return EventEligibilityOut(eligible=True, reason=None, message=None, tier=None, teams=items)
    if refusal is None or any(item.entry_id is not None for item in items):
        return EventEligibilityOut(eligible=False, reason=None, message=None, tier=None, teams=items)
    return EventEligibilityOut(eligible=False, reason=refusal.reason, message=refusal.message, tier=None, teams=items)


def clean_reason(value: str | None, message: str, bounds: tuple[int, int] = REFUND_REASON_LENGTH) -> str:
    text = ' '.join((value or '').split())
    if not bounds[0] <= len(text) <= bounds[1]:
        raise HTTPException(422, message)
    return text


# --- Queries shared by the reads --------------------------------------------------------------------------------

def active_clause(now: datetime):
    """Entries still in play: holding a spot in an open event, or a refund in progress (cancelled events)."""
    return or_(and_(holding_clause(now), Event.state.in_(LISTED_EVENT_STATES)),
               EventEntry.state.in_(REFUND_IN_PROGRESS))


def _users(db: Session, ids: Iterable[int | None]) -> dict[int, User]:
    wanted = {user_id for user_id in ids if user_id is not None}
    if not wanted:
        return {}
    return {user.id: user for user in db.scalars(select(User).where(User.id.in_(wanted)))}


def team_ref(team: Team) -> TeamRefOut:
    return TeamRefOut(id=team.id, name=team.name, initials=team.initials, crest_url=team.crest_url)


def _person(user: User | None, hidden: set[int]) -> PersonOut | None:
    if user is None:
        return None
    return person_out(user, blocked=user.id in hidden or not user.active)


def _subjects(db: Session, viewer_id: int, entries: Sequence[EventEntry]) -> dict[int, EntrySubjectOut]:
    team_ids = {entry.team_id for entry in entries if entry.team_id is not None}
    teams = {team.id: team for team in db.scalars(select(Team).where(Team.id.in_(team_ids)))} if team_ids else {}
    users = _users(db, (entry.user_id for entry in entries))
    hidden = blocked_ids(db, viewer_id, users)
    subjects = {}
    for entry in entries:
        if entry.team_id is not None:
            subjects[entry.id] = EntrySubjectOut(kind='time', team=team_ref(teams[entry.team_id]), athlete=None)
        else:
            subjects[entry.id] = EntrySubjectOut(kind='atleta', team=None, athlete=_person(users[entry.user_id], hidden))
    return subjects


@dataclass
class EntryReceipts:
    """Receipts of one entry, most recent first, with the pieces each view needs."""
    items: list[tuple[EntryReceipt, ReceiptOut]] = field(default_factory=list)

    def latest_payment(self) -> ReceiptOut | None:
        return next((out for receipt, out in self.items if receipt.kind == 'pagamento'), None)

    def refund_row(self) -> EntryReceipt | None:
        """The open refund receipt, or the last one."""
        refunds = [receipt for receipt, _ in self.items if receipt.kind == 'devolucao']
        return next((receipt for receipt in refunds if is_open_refund(receipt)), refunds[0] if refunds else None)

    def refund(self) -> ReceiptOut | None:
        row = self.refund_row()
        return next(out for receipt, out in self.items if receipt is row) if row is not None else None


def _receipts(db: Session, viewer_id: int, entry_ids: Iterable[int]) -> dict[int, EntryReceipts]:
    ids = set(entry_ids)
    result: dict[int, EntryReceipts] = defaultdict(EntryReceipts)
    if not ids:
        return result
    rows = db.execute(select(EntryReceipt, MediaObject).join(MediaObject, MediaObject.id == EntryReceipt.media_id)
                      .where(EntryReceipt.entry_id.in_(ids))
                      .order_by(EntryReceipt.created_at.desc(), EntryReceipt.id.desc())).all()
    uploaders = _users(db, (receipt.uploaded_by_id for receipt, _ in rows))
    hidden = blocked_ids(db, viewer_id, uploaders)
    for receipt, stored in rows:
        uploader = _person(uploaders.get(receipt.uploaded_by_id), hidden)
        result[receipt.entry_id].items.append((receipt, receipt_out(receipt, stored, uploader)))
    return result


def _payload(event: Event, entry: EventEntry, **extra) -> dict:
    return {'event_id': event.id, 'event_name': event.name, 'entry_id': entry.id, **extra}


# --- Viewer context: teams, tiers and own entries ----------------------------------------------------------------

@dataclass
class ViewerContext:
    user: User
    roles: dict[int, str]                      # active team -> role of the viewer
    teams: dict[int, Team]                     # active teams the viewer belongs to
    represented: list[Team]                    # representative first, then by entry date
    grid: dict[int, dict[str, str | None]]     # team -> format -> tier
    own_tiers: dict[tuple[str, int | None], str | None]

    def tier(self, sport: str, distance_km: int | None) -> str | None:
        return self.own_tiers.get((sport, distance_km if sport == 'corrida' else None))


def viewer_context(db: Session, user: User) -> ViewerContext:
    rows = db.execute(select(TeamMember.role, Team).join(Team, Team.id == TeamMember.team_id).where(
        TeamMember.user_id == user.id, TeamMember.left_at.is_(None), Team.state == 'ativo',
    ).order_by((TeamMember.role == 'representante').desc(), TeamMember.joined_at, Team.id)).all()
    represented = [team for role, team in rows if role == 'representante']
    grid = {team_id: {cell.format: cell.tier for cell in cells}
            for team_id, cells in team_format_grid(db, [team.id for team in represented]).items()}
    own = db.execute(select(Standing.sport, Standing.distance_km, Standing.tier).where(
        Standing.user_id == user.id, Standing.sport.in_(('tenis', 'corrida')))).all()
    return ViewerContext(user=user, roles={team.id: role for role, team in rows},
                         teams={team.id: team for _, team in rows}, represented=represented, grid=grid,
                         own_tiers={(sport, km): tier for sport, km, tier in own})


def _own_entries(db: Session, context: ViewerContext, event_ids: Iterable[int]) -> dict[int, list[EventEntry]]:
    ids = set(event_ids)
    mine = or_(EventEntry.user_id == context.user.id, EventEntry.team_id.in_(list(context.teams)))
    by_event: dict[int, list[EventEntry]] = defaultdict(list)
    for entry in db.scalars(select(EventEntry).where(EventEntry.event_id.in_(ids), mine)):
        by_event[entry.event_id].append(entry)
    return by_event


def event_eligibility(event: Event, context: ViewerContext, entries: Sequence[EventEntry],
                      now: datetime) -> EventEligibilityOut:
    if event.sport == 'futebol':
        held = {entry.team_id: entry.id for entry in entries if entry.team_id is not None and holding_now(entry, now)}
        teams = [(team_ref(team), context.grid.get(team.id, {}).get(event.format), held.get(team.id))
                 for team in context.represented]
        return football_eligibility(event.accepted_tiers, teams)
    tier = context.tier(event.sport, event.distance_km)
    result = eligibility(event.accepted_tiers, tier)
    return EventEligibilityOut(eligible=result.eligible, reason=result.reason, message=result.message, tier=tier,
                               teams=None)


def _organizer_names(db: Session, events: Sequence[Event]) -> dict[int, str]:
    """The organizer's public name (from the permission used to create the event), or the account name."""
    org_ids = {event.organizer_id for event in events if event.organizer_id is not None}
    names = dict(db.execute(select(Organizer.id, Organizer.display_name).where(Organizer.id.in_(org_ids))).all()) \
        if org_ids else {}
    fallback = _users(db, (event.organizer_user_id for event in events if event.organizer_id not in names))
    return {event.id: names.get(event.organizer_id) or fallback[event.organizer_user_id].name for event in events}


def build_cards(db: Session, user: User, events: Sequence[Event], now: datetime, *,
                context: ViewerContext | None = None,
                own: dict[int, list[EventEntry]] | None = None) -> list[EventCardOut]:
    """Posters of a page with the viewer's eligibility and entry, in a fixed number of queries."""
    if not events:
        return []
    context = context or viewer_context(db, user)
    own = own if own is not None else _own_entries(db, context, [event.id for event in events])
    posters = posters_out(db, events, now)
    names = _organizer_names(db, events)
    cards = []
    for event in events:
        entries = own.get(event.id, [])
        mine = pick_my_entry(entries, now)
        summary = None if mine is None else MyEntrySummaryOut(
            id=mine.id, state=effective_entry_state(mine.state, mine.reserved_until, now),
            team=team_ref(context.teams[mine.team_id]) if mine.team_id is not None else None,
            reserved_until=mine.reserved_until)
        cards.append(EventCardOut(**posters[event.id].model_dump(), organizer_name=names[event.id],
                                  eligibility=event_eligibility(event, context, entries, now), my_entry=summary))
    return cards


# --- Events (E2 and D2) ------------------------------------------------------------------------------------------

def visible_event(db: Session, event_id: int, *, lock: bool = False) -> Event:
    statement = select(Event).where(Event.id == event_id)
    if lock:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    event = db.scalar(statement)
    if event is None or event.state not in VISIBLE_EVENT_STATES:
        raise HTTPException(404, EVENT_NOT_FOUND)
    return event


def list_events(db: Session, user: User, *, sport: str | None, city_id: int | None, cursor: str | None,
                limit: int) -> tuple[list[EventCardOut], str | None]:
    """E2: running events and published events that have not started yet, soonest first.

    A published event whose start passed stays out of the list (it is not open, and nothing marks it as running
    before fase 6); its detail, the participants' "Minhas inscrições" and the organizer's O3 still show it.
    """
    now = utcnow()
    statement = select(Event).where(Event.state.in_(LISTED_EVENT_STATES), or_(
        Event.state != 'publicado', Event.starts_at > now))
    if sport is not None:
        statement = statement.where(Event.sport == sport)
    if city_id is not None:
        statement = statement.where(Event.city_id == city_id)
    rows, next_cursor = paginate(statement, cursor, limit, Event.starts_at, Event.id, db, ascending=True)
    return build_cards(db, user, rows, now), next_cursor


def event_detail(db: Session, user: User, event_id: int) -> EventDetailOut:
    event = visible_event(db, event_id)
    now = utcnow()
    context = viewer_context(db, user)
    own = _own_entries(db, context, [event.id])
    card = build_cards(db, user, [event], now, context=context, own=own)[0]
    organizer = db.get(User, event.organizer_user_id)
    is_organizer = organizer.id == user.id
    hidden = not organizer.active or (not is_organizer and blocked_between(db, user.id, organizer.id))
    bonus = tennis_bonus(event.sport, card.confirmed_count)
    return EventDetailOut(
        **card.model_dump(), course_notes=event.course_notes, contact=event.contact,
        organizer=EventOrganizerOut(display_name=card.organizer_name,
                                    person=None if hidden else person_out(organizer)),
        pix=pix_out(event), registration_open=registration_open(event, now),
        spots_left=spots_left(event.capacity, card.entries_count),
        tennis_bonus=TennisBonusOut(**bonus) if bonus is not None else None,
        cancelled_at=event.cancelled_at, cancel_reason=event.cancel_reason, is_organizer=is_organizer,
        can_read_messages=can_read_channel(db, event, user, now=now))


def public_entries(db: Session, user: User, event_id: int, cursor: str | None,
                   limit: int) -> tuple[list[PublicEntryOut], str | None]:
    """Inscritos tab: confirmed entries in the order they were confirmed."""
    event = visible_event(db, event_id)
    statement = select(EventEntry).where(EventEntry.event_id == event.id, EventEntry.state == 'confirmada')
    rows, next_cursor = paginate(statement, cursor, limit, EventEntry.confirmed_at, EventEntry.id, db,
                                 ascending=True)
    subjects = _subjects(db, user.id, rows)
    return [PublicEntryOut(id=entry.id, subject=subjects[entry.id], confirmed_at=entry.confirmed_at)
            for entry in rows], next_cursor


# --- Entry views (MyEntry and OrganizerEntry) --------------------------------------------------------------------

def build_my_entries(db: Session, user: User, pairs: Sequence[tuple[EventEntry, str]],
                     now: datetime) -> list[MyEntryOut]:
    if not pairs:
        return []
    entries = [entry for entry, _ in pairs]
    events = {event.id: event for event in db.scalars(select(Event).where(
        Event.id.in_({entry.event_id for entry in entries})))}
    posters = posters_out(db, list(events.values()), now)
    subjects = _subjects(db, user.id, entries)
    receipts = _receipts(db, user.id, [entry.id for entry, role in pairs if can_view_receipt(role)])
    views = []
    for entry, role in pairs:
        event = events[entry.event_id]
        state = effective_entry_state(entry.state, entry.reserved_until, now)
        history = receipts.get(entry.id, EntryReceipts())
        can_send, can_cancel, can_respond = entry_flags(
            role=role, state=state, paid=entry.price_cents > 0, starts_at=start_for_cancel(event, now),
            reserved_until=entry.reserved_until, refund=history.refund_row(), now=now)
        views.append(MyEntryOut(
            id=entry.id, event=posters[event.id], subject=subjects[entry.id], my_role=role, state=state,
            price_cents=entry.price_cents, reserved_until=entry.reserved_until, created_at=entry.created_at,
            confirmed_at=entry.confirmed_at, expired_at=entry.expired_at, cancelled_at=entry.cancelled_at,
            refunded_at=entry.refunded_at, latest_payment=history.latest_payment(), refund=history.refund(),
            can_send_receipt=can_send, can_cancel=can_cancel, can_respond_refund=can_respond))
    return views


def my_entry_view(db: Session, user: User, entry: EventEntry, role: str) -> MyEntryOut:
    return build_my_entries(db, user, [(entry, role)], utcnow())[0]


# --- Loading an entry for the viewer (0003, section 19) ----------------------------------------------------------

def _lock_entry(db: Session, entry_id: int) -> EventEntry | None:
    """Event (FOR SHARE) and then the entry (FOR UPDATE): a transition of one entry never takes the event after
    the entry, so it cannot deadlock with a cancellation or a revocation, which lock the event and then the entries."""
    event_id = db.scalar(select(EventEntry.event_id).where(EventEntry.id == entry_id))
    if event_id is None:
        return None
    lock_event(db, event_id, share=True)
    return db.scalar(select(EventEntry).where(EventEntry.id == entry_id).with_for_update()
                     .execution_options(populate_existing=True))


def load_entry_for(db: Session, entry_id: int, user: User, *,
                   for_update: bool = False) -> tuple[EventEntry, Event, str]:
    """The entry, its event and the viewer's role: atleta, representante, membro, organizador or administracao.

    Everyone else gets `404 Inscrição não encontrada.` (the entry's existence is not revealed). With `for_update`,
    the locks follow the global order: the event FOR SHARE first, then the entry FOR UPDATE, both read fresh.
    """
    entry = _lock_entry(db, entry_id) if for_update else db.get(EventEntry, entry_id)
    if entry is None:
        raise HTTPException(404, ENTRY_NOT_FOUND)
    event = db.get(Event, entry.event_id)
    role = resolve_role(entry_role(db, entry, user.id), organizer=event.organizer_user_id == user.id,
                        admin=user.is_admin)
    if role is None:
        raise HTTPException(404, ENTRY_NOT_FOUND)
    return entry, event, role


def get_entry(db: Session, user: User, entry_id: int) -> MyEntryOut:
    entry, _, role = load_entry_for(db, entry_id, user)
    return my_entry_view(db, user, entry, role)


def _require_acting(entry: EventEntry, role: str, action: str) -> None:
    if role not in ACTING_ROLES:
        raise HTTPException(403, role_message(action, team=entry.team_id is not None))


# --- Entering, giving up and my entries --------------------------------------------------------------------------

def create_entry(db: Session, user: User, event_id: int, team_id: int | None) -> MyEntryOut:
    """Enters the team (football, by a representative) or the athlete; the event lock serializes the spots."""
    now = utcnow()
    event = visible_event(db, event_id, lock=True)
    if not registration_open(event, now):
        raise HTTPException(409, REGISTRATION_CLOSED)
    if event.organizer_user_id == user.id:
        raise HTTPException(409, OWN_EVENT)
    team = None
    if entry_subject(event.sport) == 'time':
        if team_id is None:
            raise HTTPException(422, TEAM_REQUIRED)
        # FOR SHARE: closing the team or changing roles (FOR UPDATE on the team) waits for this entry.
        team = db.scalar(select(Team).where(Team.id == team_id).with_for_update(read=True)
                         .execution_options(populate_existing=True))
        role = None if team is None or team.state != 'ativo' else db.scalar(select(TeamMember.role).where(
            TeamMember.team_id == team.id, TeamMember.user_id == user.id, TeamMember.left_at.is_(None)))
        if role is None:
            raise HTTPException(404, TEAM_NOT_FOUND)
        if role != 'representante':
            raise HTTPException(403, ONLY_REP_ENTER)
        tier = subject_tier(db, 'futebol', team_id=team.id, format=event.format)
        same_subject, already = EventEntry.team_id == team.id, TEAM_ALREADY_ENTERED
    else:
        if team_id is not None:
            raise HTTPException(422, TEAM_ONLY_FOOTBALL)
        role = 'atleta'
        tier = subject_tier(db, event.sport, user_id=user.id, distance_km=event.distance_km)
        same_subject, already = EventEntry.user_id == user.id, ATHLETE_ALREADY_ENTERED
    result = eligibility(event.accepted_tiers, tier)
    if not result.eligible:
        raise HTTPException(403, result.message)
    current = db.scalars(select(EventEntry).where(EventEntry.event_id == event.id, same_subject,
                                                  EventEntry.state.in_(HOLDING_ENTRY_STATES))
                         .with_for_update().execution_options(populate_existing=True)).all()
    lapsed = [entry for entry in current if reservation_lapsed(entry.state, entry.reserved_until, now)]
    if len(lapsed) < len(current):
        raise HTTPException(409, already)
    # A stale reservation of the same team or athlete expires now, so the unique index never blocks a fair retry.
    expire_entries(db, lapsed, now)
    held, _ = holding_counts(db, [event.id], now=now)[event.id]
    if spots_left(event.capacity, held) <= 0:
        raise HTTPException(409, NO_SPOTS)
    paid = bool(event.price_cents)
    entry = EventEntry(event_id=event.id, team_id=team.id if team else None, user_id=None if team else user.id,
                       registered_by_id=user.id, state=initial_entry_state(paid=paid), price_cents=event.price_cents,
                       reserved_until=reservation_deadline(now, event.starts_at) if paid else None,
                       confirmed_at=None if paid else now, created_at=now)
    db.add(entry)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, already) from None
    if team is not None:
        notifications.notify_many(db, entry_recipients(db, [entry], scope='membros')[entry.id], 'time_inscrito',
                                  _payload(event, entry, team_id=team.id, team_name=team.name), actor_id=user.id)
    audit.record(db, actor_id=user.id, action='inscricao.criada', target_type='event_entry', target_id=entry.id,
                 data={'event_id': event.id, 'team_id': entry.team_id, 'user_id': entry.user_id,
                       'state': entry.state, 'price_cents': entry.price_cents})
    db.commit()
    return my_entry_view(db, user, entry, role)


def cancel_entry(db: Session, user: User, entry_id: int) -> None:
    """The participant gives up: free before the start, paid only without an approved payment."""
    entry, event, role = load_entry_for(db, entry_id, user, for_update=True)
    _require_acting(entry, role, 'cancel')
    now = utcnow()
    state = effective_entry_state(entry.state, entry.reserved_until, now)
    error = cancel_error(state, paid=entry.price_cents > 0, starts_at=start_for_cancel(event, now), now=now)
    if error is not None:
        raise HTTPException(409, error)
    previous = entry.state
    entry.state = next_entry_state(state, 'cancelar', paid=entry.price_cents > 0)
    entry.cancelled_at, entry.cancelled_by_id, entry.cancel_origin = now, user.id, 'participante'
    audit.record(db, actor_id=user.id, action='inscricao.cancelada', target_type='event_entry', target_id=entry.id,
                 data={'event_id': event.id, 'team_id': entry.team_id, 'previous_state': previous})
    db.commit()


def my_entries(db: Session, user: User, scope: str, cursor: str | None,
               limit: int) -> tuple[list[MyEntryOut], str | None]:
    """Entries of the athlete and of the active teams they belong to.

    `ativas`: holding a spot in an open event or with a refund in progress, by event start (soonest first);
    `historico`: everything else, most recent entry first.
    """
    now = utcnow()
    roles = dict(db.execute(select(TeamMember.team_id, TeamMember.role).join(Team, Team.id == TeamMember.team_id)
                            .where(TeamMember.user_id == user.id, TeamMember.left_at.is_(None),
                                   Team.state == 'ativo')).all())
    mine = or_(EventEntry.user_id == user.id, EventEntry.team_id.in_(list(roles)))
    if scope == 'ativas':
        statement = select(EventEntry, Event.starts_at).join(Event, Event.id == EventEntry.event_id).where(
            mine, active_clause(now))
        point = decode_cursor(cursor)
        if point:
            statement = statement.where(tuple_(Event.starts_at, EventEntry.id) > tuple_(*point))
        rows = db.execute(statement.order_by(Event.starts_at.asc(), EventEntry.id.asc()).limit(limit + 1)).all()
        next_cursor = encode_cursor(rows[limit - 1][1], rows[limit - 1][0].id) if len(rows) > limit else None
        entries = [entry for entry, _ in rows[:limit]]
    else:
        statement = select(EventEntry).join(Event, Event.id == EventEntry.event_id).where(mine, ~active_clause(now))
        entries, next_cursor = paginate(statement, cursor, limit, EventEntry.created_at, EventEntry.id, db)
    pairs = [(entry, 'atleta' if entry.user_id == user.id else roles[entry.team_id]) for entry in entries]
    return build_my_entries(db, user, pairs, now), next_cursor


def team_ensure_no_active_entry(db: Session, team: Team) -> None:
    """409 of `ensure_closable` when the (locked) team holds a spot in an open event or has a refund in progress."""
    found = db.scalar(select(EventEntry.id).join(Event, Event.id == EventEntry.event_id).where(
        EventEntry.team_id == team.id, active_clause(utcnow())).limit(1))
    if found is not None:
        raise HTTPException(409, TEAM_HAS_ACTIVE_ENTRY)


# --- Payment receipts ---------------------------------------------------------------------------------------------

def _check_receipt_upload(entry: EventEntry, role: str, now: datetime) -> str:
    """The state after the upload ('em_analise'), or 403/409 (the raw state: a lapsed reservation says so)."""
    _require_acting(entry, role, 'receipt')
    try:
        return next_entry_state(entry.state, 'enviar_comprovante', now=now, reserved_until=entry.reserved_until)
    except TransitionError as error:
        raise HTTPException(409, str(error)) from None


def check_payment_receipt(db: Session, user: User, entry_id: int) -> None:
    """Permission and state before reading the file (the store step checks again under the lock)."""
    entry, _, role = load_entry_for(db, entry_id, user)
    _check_receipt_upload(entry, role, utcnow())


def save_receipt(db: Session, entry: EventEntry, stored: MediaObject, *, kind: str, uploader_id: int,
                 now: datetime, conflict: str, effects: Callable[[EntryReceipt], None]) -> EntryReceipt:
    """Adds the receipt row next to its stored object, applies `effects` (notifications, audit) and commits.

    The row and the object metadata go in the same commit; any failure rolls back and removes the uploaded object
    (a race on the partial unique indexes answers 409 with `conflict`).
    """
    try:
        receipt = EntryReceipt(entry_id=entry.id, kind=kind, media_id=stored.id, uploaded_by_id=uploader_id,
                               created_at=now)
        db.add(receipt)
        db.flush()
        effects(receipt)
        db.commit()
    except IntegrityError:
        db.rollback()
        media.discard_object(stored)
        raise HTTPException(409, conflict) from None
    except Exception:
        db.rollback()
        media.discard_object(stored)
        raise
    return receipt


def store_payment_receipt(db: Session, user: User, entry_id: int, prepared: media.ReceiptFile) -> MyEntryOut:
    entry, event, role = load_entry_for(db, entry_id, user, for_update=True)
    now = utcnow()
    target = _check_receipt_upload(entry, role, now)
    stored = media.store_receipt(db, user.id, prepared)
    entry.state = target

    def effects(receipt: EntryReceipt) -> None:
        attempt = db.scalar(select(func.count()).select_from(EntryReceipt).where(
            EntryReceipt.entry_id == entry.id, EntryReceipt.kind == 'pagamento'))
        notifications.notify(db, event.organizer_user_id, 'comprovante_recebido',
                             _payload(event, entry, receipt_id=receipt.id), actor_id=user.id)
        audit.record(db, actor_id=user.id, action='comprovante.enviado', target_type='entry_receipt',
                     target_id=receipt.id, data={'entry_id': entry.id, 'event_id': event.id, 'attempt': attempt,
                                                 'file_type': prepared.file_type})

    save_receipt(db, entry, stored, kind='pagamento', uploader_id=user.id, now=now, conflict=NOT_WAITING_RECEIPT,
                 effects=effects)
    return my_entry_view(db, user, entry, role)


def entry_receipts(db: Session, user: User, entry_id: int) -> list[ReceiptOut]:
    entry, _, role = load_entry_for(db, entry_id, user)
    if not can_view_receipt(role):
        raise HTTPException(404, ENTRY_NOT_FOUND)
    return [out for _, out in _receipts(db, user.id, [entry.id]).get(entry.id, EntryReceipts()).items]


def receipt_file(db: Session, user: User, receipt_id: int) -> Response:
    """Authorized read of a payment or refund receipt; anyone else gets 404, as if it did not exist."""
    receipt = db.get(EntryReceipt, receipt_id)
    if receipt is None:
        raise HTTPException(404, RECEIPT_NOT_FOUND)
    try:
        _, _, role = load_entry_for(db, receipt.entry_id, user)
    except HTTPException:
        raise HTTPException(404, RECEIPT_NOT_FOUND) from None
    if not can_view_receipt(role):
        raise HTTPException(404, RECEIPT_NOT_FOUND)
    return media.private_file_response(db.get(MediaObject, receipt.media_id), filename=f'comprovante-{receipt.id}')


# --- Refunds (0003, sections 15.3 and 16) -------------------------------------------------------------------------

def _open_refund(db: Session, entry_id: int, *, lock: bool = False) -> EntryReceipt | None:
    statement = select(EntryReceipt).where(EntryReceipt.entry_id == entry_id, open_refund_clause())
    if lock:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    return db.scalar(statement)


def _check_refund_upload(db: Session, entry: EventEntry, role: str, *, lock: bool) -> None:
    if role != 'organizador':
        raise HTTPException(403, ONLY_ORGANIZER_REFUND)
    if entry.state != 'devolucao_pendente':
        raise HTTPException(409, NOT_WAITING_REFUND)
    if _open_refund(db, entry.id, lock=lock) is not None:
        raise HTTPException(409, REFUND_ALREADY_SENT)


def check_refund_receipt(db: Session, user: User, entry_id: int) -> None:
    entry, _, role = load_entry_for(db, entry_id, user)
    _check_refund_upload(db, entry, role, lock=False)


def store_refund_receipt(db: Session, user: User, entry_id: int, prepared: media.ReceiptFile) -> OrganizerEntryOut:
    """The organizer attaches the Pix refund; allowed even with a pending revocation (the money must go back)."""
    entry, event, role = load_entry_for(db, entry_id, user, for_update=True)
    _check_refund_upload(db, entry, role, lock=True)
    now = utcnow()
    stored = media.store_receipt(db, user.id, prepared)

    def effects(receipt: EntryReceipt) -> None:
        notifications.notify_many(db, entry_recipients(db, [entry])[entry.id], 'devolucao_enviada',
                                  _payload(event, entry, receipt_id=receipt.id), actor_id=user.id)
        audit.record(db, actor_id=user.id, action='devolucao.enviada', target_type='entry_receipt',
                     target_id=receipt.id, data={'entry_id': entry.id, 'event_id': event.id,
                                                 'file_type': prepared.file_type})

    save_receipt(db, entry, stored, kind='devolucao', uploader_id=user.id, now=now, conflict=REFUND_ALREADY_SENT,
                 effects=effects)
    return organizer_entries_out(db, user, [entry], utcnow())[entry.id]


def respond_refund(db: Session, user: User, entry_id: int, response: str, reason: str | None) -> MyEntryOut:
    """The participant confirms the refund (entry 'devolvida') or contests it (the administration decides)."""
    entry, event, role = load_entry_for(db, entry_id, user, for_update=True)
    _require_acting(entry, role, 'refund')
    now = utcnow()
    receipt = _open_refund(db, entry.id, lock=True)
    if entry.state != 'devolucao_pendente' or not refund_waiting_answer(receipt, now):
        raise HTTPException(409, NO_REFUND_TO_ANSWER)
    payload = _payload(event, entry, receipt_id=receipt.id)
    if response == 'confirmar':
        receipt.participant_response, receipt.responded_at, receipt.responded_by_id = 'confirmada', now, user.id
        entry.state = next_entry_state(entry.state, 'confirmar_devolucao')
        entry.refunded_at = now
        notifications.notify(db, event.organizer_user_id, 'devolucao_confirmada', {**payload, 'automatic': False},
                             actor_id=user.id)
        audit.record(db, actor_id=user.id, action='devolucao.confirmada', target_type='entry_receipt',
                     target_id=receipt.id, data={'entry_id': entry.id, 'event_id': event.id})
    else:
        text = clean_reason(reason, CONTEST_REASON)
        receipt.participant_response, receipt.responded_at, receipt.responded_by_id = 'contestada', now, user.id
        receipt.contest_reason = text
        entry.state = next_entry_state(entry.state, 'contestar_devolucao')
        notifications.notify_many(db, [event.organizer_user_id, *admin_ids(db)], 'devolucao_contestada', payload,
                                  actor_id=user.id)
        audit.record(db, actor_id=user.id, action='devolucao.contestada', target_type='entry_receipt',
                     target_id=receipt.id, data={'entry_id': entry.id, 'event_id': event.id})
    db.commit()
    return my_entry_view(db, user, entry, role)


def _contested_statement():
    return select(EntryReceipt).join(EventEntry, EventEntry.id == EntryReceipt.entry_id).where(
        EntryReceipt.kind == 'devolucao', EntryReceipt.participant_response == 'contestada',
        EntryReceipt.resolution.is_(None), EventEntry.state == 'devolucao_contestada')


def build_disputes(db: Session, admin: User, receipts: Sequence[EntryReceipt], now: datetime) -> list[RefundDisputeOut]:
    if not receipts:
        return []
    entries = {entry.id: entry for entry in db.scalars(select(EventEntry).where(
        EventEntry.id.in_({receipt.entry_id for receipt in receipts})))}
    events = {event.id: event for event in db.scalars(select(Event).where(
        Event.id.in_({entry.event_id for entry in entries.values()})))}
    views = organizer_entries_out(db, admin, list(entries.values()), now)
    posters = posters_out(db, list(events.values()), now)
    organizers = _users(db, (event.organizer_user_id for event in events.values()))
    hidden = blocked_ids(db, admin.id, organizers)
    disputes = []
    for receipt in receipts:
        entry = entries[receipt.entry_id]
        event = events[entry.event_id]
        disputes.append(RefundDisputeOut(entry=views[entry.id], event=posters[event.id],
                                         organizer=_person(organizers[event.organizer_user_id], hidden),
                                         contested_at=receipt.responded_at))
    return disputes


def refund_disputes(db: Session, admin: User, cursor: str | None,
                    limit: int) -> tuple[list[RefundDisputeOut], str | None]:
    """Contested refunds, the oldest contestation first."""
    rows, next_cursor = paginate(_contested_statement(), cursor, limit, EntryReceipt.responded_at, EntryReceipt.id,
                                 db, ascending=True)
    return build_disputes(db, admin, rows, utcnow()), next_cursor


def decide_refund(db: Session, admin: User, entry_id: int, decision: str, reason: str) -> RefundDisputeOut:
    """'devolvida': the refund stands; 'pendente': back to the organizer, who sends another receipt."""
    entry = _lock_entry(db, entry_id)
    if entry is None:
        raise HTTPException(404, ENTRY_NOT_FOUND)
    receipt = db.scalar(_contested_statement().where(EntryReceipt.entry_id == entry.id).with_for_update(
        of=EntryReceipt).execution_options(populate_existing=True))
    if entry.state != 'devolucao_contestada' or receipt is None:
        raise HTTPException(409, NOT_CONTESTED)
    text = clean_reason(reason, DECISION_REASON)
    now = utcnow()
    if decision == 'devolvida':
        entry.state = next_entry_state(entry.state, 'manter_devolucao')
        entry.refunded_at = now
    else:
        entry.state = next_entry_state(entry.state, 'reabrir_devolucao')
    receipt.resolution, receipt.resolution_reason, receipt.resolved_by_id, receipt.resolved_at = (
        decision, text, admin.id, now)
    event = db.get(Event, entry.event_id)
    recipients = entry_recipients(db, [entry], scope='membros')[entry.id]
    notifications.notify_many(db, [event.organizer_user_id, *recipients], 'devolucao_decidida',
                              _payload(event, entry, receipt_id=receipt.id, decision=decision))
    audit.record(db, actor_id=admin.id, action='devolucao.decidida', target_type='entry_receipt',
                 target_id=receipt.id, data={'entry_id': entry.id, 'event_id': event.id, 'decision': decision,
                                             'reason': text})
    db.commit()
    return build_disputes(db, admin, [receipt], now)[0]

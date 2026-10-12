"""Walk-ins and slots (Jogar, fase 4; RN06; etapa 3): offers, "Quero jogar", declared slots and removal.

A team opens spots for walk-in athletes (one goalkeeper at most and up to the format size minus one). The queue
(`matchmaking_queue`) pairs waiting walk-ins with the open slots of scheduled friendlies and holds the slot for
the athlete for 2 h (`oferecida`), so two people never receive the same offer; accepting fills the slot
atomically and puts the athlete in the lineup as a guest of that match only. This module holds what the routes of
the walk-in front add on top of the queue: the list of offers, accept and decline, the representative adjusting
the slots and removing a guest.

Lock order (docs/decisoes/0002-jogar.md, section 15.1): team → match → ranking → bucket (advisory) → slot → search.
A route that can offer slots again locks the match and then takes the bucket of the city, as the queue does when it
pairs, so it never waits for the bucket while holding a slot. Every function here leaves the commit to the caller
except the route entries (`accept_slot`, `decline_slot`, `update_slots`, `delete_guest`), which commit and return
the final view.
"""
from __future__ import annotations

from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.identity import User, utcnow
from app.models.matches import Match, MatchLineup, MatchSearch, MatchSide, MatchSlot
from app.models.teams import POSITIONS
from app.schemas.matches import MatchDetailOut, SlotOfferOut
from app.services import audit, notifications
from app.services.match_access import MatchAccess, load_match_for, load_sides, subject_names
from app.services.match_events import post_event
from app.services.match_rules import POSITION_LABELS, TransitionError, bucket_key, normalize_open_slots
from app.services.match_views import match_cards, match_detail
from app.services.matchmaking_queue import queue

OFFER_NOT_FOUND = 'Oferta de vaga não encontrada.'
ALREADY_IN_MATCH = 'Você já está nesta partida.'
SLOTS_ONLY_FRIENDLY_FOOTBALL = 'Só partidas amistosas de futebol têm vagas para avulsos.'
SLOTS_ONLY_REPRESENTATIVES = 'Só os representantes ajustam as vagas.'
SLOTS_STATE = 'As vagas só mudam enquanto a partida está sendo combinada ou antes do início.'
SLOTS_STARTED = 'As vagas só mudam antes do início da partida.'
GUEST_NOT_FOUND = 'Avulso não encontrado nesta partida.'
GUEST_ONLY_REPRESENTATIVES = 'Só os representantes do time do avulso o removem da partida.'
GUEST_STARTED = 'Depois do início, o avulso só fica de fora pela presença.'
OPEN_STATES = ('aberta', 'oferecida')


# ----- Pure rules (unit tested) ------------------------------------------------------------------------------

def slots_error(match, access: MatchAccess, *, now: datetime) -> tuple[int, str] | None:
    """Why the viewer cannot adjust the declared slots as (status, message), or None.

    Only a representative of a friendly football match, while it is being arranged (`combinando`) or scheduled and
    not started. Same conditions as `match_views.permissions_for(...).manage_slots`, with the reason for the 403/409."""
    if match.sport != 'futebol' or match.origin != 'amistoso':
        return 409, SLOTS_ONLY_FRIENDLY_FOOTBALL
    if access.role != 'representante' or access.side is None:
        return 403, SLOTS_ONLY_REPRESENTATIVES
    if match.state == 'combinando':
        return None
    if match.state != 'agendada':
        return 409, SLOTS_STATE
    if match.starts_at is None or match.starts_at <= now:
        return 409, SLOTS_STARTED
    return None


def guest_removal_error(starts_at: datetime | None, now: datetime) -> str | None:
    """A guest leaves the lineup only before the start; afterwards the attendance decides (409)."""
    return GUEST_STARTED if starts_at is None or now >= starts_at else None


@dataclass(frozen=True)
class SlotPlan:
    """What adjusting the slots of one side does: spots to open per position and slot ids to close."""
    open: dict[str, int] = field(default_factory=dict)
    close: tuple[int, ...] = ()

    @property
    def empty(self) -> bool:
        return not self.open and not self.close


def plan_slot_changes(held: Sequence, desired: Mapping[str, int]) -> SlotPlan:
    """Compares the slots a side holds (`aberta` or `oferecida`, with `id`, `position`, `state` and `opened_at`)
    with the wanted number per position. To reduce, the newest `aberta` slots close first and then the newest
    `oferecida` ones (the athlete holding that offer returns to the queue)."""
    opening: dict[str, int] = {}
    closing: list[int] = []
    for position in POSITIONS:
        current = [slot for slot in held if slot.position == position]
        delta = desired.get(position, 0) - len(current)
        if delta > 0:
            opening[position] = delta
        elif delta < 0:
            newest = sorted(current, key=lambda slot: (slot.opened_at, slot.id), reverse=True)
            order = [slot for slot in newest if slot.state == 'aberta'] + [
                slot for slot in newest if slot.state == 'oferecida']
            closing += [slot.id for slot in order[:-delta]]
    return SlotPlan(opening, tuple(closing))


def counts(slots: Mapping[str, int] | None) -> dict[str, int]:
    """Slots per position with every position present (a missing one is 0)."""
    return {position: (slots or {}).get(position, 0) for position in POSITIONS}


def slots_text(team_name: str, slots: Mapping[str, int]) -> str:
    """Banner of the chat when a team changes its slots."""
    parts = [f'{POSITION_LABELS[position]} ({slots[position]})' for position in POSITIONS if slots.get(position)]
    if not parts:
        return f'{team_name} não tem vagas abertas para avulsos.'
    return f'{team_name} atualizou as vagas para avulsos: {", ".join(parts)}.'


# ----- Offers of the walk-in ---------------------------------------------------------------------------------

def slot_offers(db: Session, user: User, *, now: datetime) -> list[SlotOfferOut]:
    """Pending offers of the holder (usually one: a single open search per athlete), the soonest to lapse first.

    An offer past its 2 h is not listed even before the sweep releases it. The match card comes from
    `match_cards`, which shows the pending offer with the role 'avulso' on the side that opened the slot."""
    rows = db.execute(
        select(MatchSearch, MatchSlot, Match)
        .join(MatchSlot, MatchSlot.id == MatchSearch.slot_id).join(Match, Match.id == MatchSlot.match_id)
        .where(MatchSearch.user_id == user.id, MatchSearch.kind == 'avulso', MatchSearch.state == 'pareada',
               MatchSearch.offer_expires_at > now, MatchSlot.state == 'oferecida', Match.state == 'agendada')
        .order_by(MatchSearch.offer_expires_at, MatchSearch.id)).all()
    if not rows:
        return []
    cards = match_cards(db, user, [match for _, _, match in rows], now=now)
    return [SlotOfferOut(slot_id=slot.id, search_id=search.id, position=slot.position, side=slot.side,
                         expires_at=search.offer_expires_at, match=card)
            for (search, slot, _), card in zip(rows, cards, strict=True)]


def accept_slot(db: Session, user: User, slot_id: int) -> MatchDetailOut:
    """'Quero jogar': fills the slot reserved for the athlete and returns the match as a guest sees it."""
    now = utcnow()
    try:
        lineup = queue.accept_offer(db, slot_id, user, now=now)
        if lineup is None:
            raise HTTPException(404, OFFER_NOT_FOUND)
        db.commit()
    except TransitionError as error:
        db.rollback()
        raise HTTPException(409, str(error)) from None
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, ALREADY_IN_MATCH) from None
    return match_detail(db, user, db.get(Match, lineup.match_id), now=now)


def decline_slot(db: Session, user: User, slot_id: int) -> None:
    """The athlete refuses the offer: the search ends and the slot goes to the next waiting walk-in."""
    now = utcnow()
    held = db.execute(
        select(MatchSlot.match_id, Match.city_id)
        .join(Match, Match.id == MatchSlot.match_id).join(MatchSearch, MatchSearch.slot_id == MatchSlot.id)
        .where(MatchSlot.id == slot_id, MatchSearch.user_id == user.id, MatchSearch.kind == 'avulso',
               MatchSearch.state == 'pareada')).first()
    if held is None:
        raise HTTPException(404, OFFER_NOT_FOUND)
    match_id, city_id = held
    # The decline offers the slot again: match, then the bucket, then slot → search (lock order).
    db.scalar(select(Match).where(Match.id == match_id).with_for_update().execution_options(populate_existing=True))
    queue.lock_bucket(db, bucket_key('avulso', city_id))
    try:
        declined = queue.decline_offer(db, slot_id, user, now=now)
    except TransitionError as error:
        db.rollback()
        raise HTTPException(409, str(error)) from None
    if not declined:
        db.rollback()
        raise HTTPException(404, OFFER_NOT_FOUND)
    db.commit()


# ----- Slots declared by the team ----------------------------------------------------------------------------

@dataclass(frozen=True)
class SlotsChange:
    changed: bool
    before: dict[str, int]
    after: dict[str, int]
    opened: int = 0
    closed: tuple[int, ...] = ()
    returned: tuple[int, ...] = ()      # searches of walk-ins that held a closed offer and went back to the queue
    offered: int = 0                    # offers made to waiting walk-ins after the change


def set_open_slots(db: Session, match: Match, side: str, slots: Mapping[str, int], *, now: datetime,
                   actor_id: int) -> SlotsChange:
    """Sets how many slots per position one side wants open (the caller locked the match, then took the bucket of the
    city and checked `slots_error`). `combinando` only stores the declaration; `agendada` opens the missing slots
    and closes the surplus (newest `aberta` first, then `oferecida`: that walk-in returns to the queue). Spots
    already filled count toward the limits. Opened slots are offered to the walk-ins waiting. Raises `RuleError` (422)
    when the limits are not respected."""
    side_row = db.scalar(select(MatchSide).where(MatchSide.match_id == match.id, MatchSide.side == side)
                         .execution_options(populate_existing=True))
    rows = db.scalars(select(MatchSlot).where(MatchSlot.match_id == match.id, MatchSlot.side == side,
                                              MatchSlot.state.in_((*OPEN_STATES, 'preenchida')))
                      .order_by(MatchSlot.id).with_for_update().execution_options(populate_existing=True)).all()
    holding = [slot for slot in rows if slot.state in OPEN_STATES]
    filled = Counter(slot.position for slot in rows if slot.state == 'preenchida')
    after = normalize_open_slots(match.format, slots, filled=filled)
    before = counts(side_row.declared_slots) if match.state == 'combinando' else {
        position: sum(1 for slot in holding if slot.position == position) for position in POSITIONS}
    plan = plan_slot_changes(holding, after) if match.state == 'agendada' else SlotPlan()
    if before == after and plan.empty:
        return SlotsChange(False, before, after)

    side_row.declared_slots = after
    by_id = {slot.id: slot for slot in holding}
    closing = [by_id[slot_id] for slot_id in plan.close]
    offered_slots = [slot.id for slot in closing if slot.state == 'oferecida']
    searches = {search.slot_id: search for search in db.scalars(
        select(MatchSearch).where(MatchSearch.slot_id.in_(offered_slots), MatchSearch.state == 'pareada')
        .order_by(MatchSearch.id).with_for_update().execution_options(populate_existing=True))} if offered_slots else {}
    returned: list[MatchSearch] = []
    for slot in closing:
        search = searches.get(slot.id) if slot.state == 'oferecida' else None
        if search is not None:
            queue.release_offer(db, search, slot, outcome='devolvida', now=now, actor_id=actor_id,
                                reason='vagas_reduzidas')
            returned.append(search)
        slot.state, slot.closed_at = 'fechada', now
    opened = [MatchSlot(match_id=match.id, side=side, position=position, state='aberta', opened_at=now,
                        created_at=now) for position in POSITIONS for _ in range(plan.open.get(position, 0))]
    db.add_all(opened)
    db.flush()

    offered = 0
    if opened or returned:
        offered += len(queue.offer_slots(db, match, now=now))
        # A walk-in that lost its offer looks at the slots of other matches too.
        offered += sum(1 for search in returned if search.state == 'ativa'
                       and queue.try_match(db, search, now=now) is not None)
    name = subject_names(db, [side_row])[side_row.id]
    post_event(db, match.id, 'vagas_atualizadas', slots_text(name, after), side=side,
               payload={'side': side, 'open_slots': after}, now=now)
    audit.record(db, actor_id=actor_id, action='vagas.atualizadas', target_type='match', target_id=match.id,
                 data={'side': side, 'before': before, 'after': after, 'closed_slot_ids': list(plan.close),
                       'returned_search_ids': [search.id for search in returned]})
    return SlotsChange(True, before, after, len(opened), plan.close, tuple(search.id for search in returned),
                       offered)


def _require_slot_manager(match: Match, access: MatchAccess, now: datetime) -> None:
    error = slots_error(match, access, now=now)
    if error is not None:
        raise HTTPException(*error)


def update_slots(db: Session, user: User, match_id: int, wanted: Mapping[str, int]) -> MatchDetailOut:
    """`PUT /matches/{id}/slots`: the representative sets the slots of their own side."""
    now = utcnow()
    match, _, access = load_match_for(db, match_id, user)       # 404, 403 and 409 before any lock
    _require_slot_manager(match, access, now)
    match, sides, access = load_match_for(db, match_id, user, for_update=True)
    _require_slot_manager(match, access, now)
    # Opening or releasing slots offers them again: the bucket of the walk-ins of the city comes after the match
    # and before the slots (lock order).
    queue.lock_bucket(db, bucket_key('avulso', match.city_id))
    set_open_slots(db, match, access.side, wanted, now=now, actor_id=user.id)
    db.commit()
    return match_detail(db, user, match, now=now, sides=sides, access=access)


# ----- Removing a guest --------------------------------------------------------------------------------------

def remove_guest(db: Session, match: Match, user_id: int, *, now: datetime, actor_id: int,
                 side: str | None = None) -> MatchSlot:
    """Takes a walk-in out of the lineup before the start (the caller locked the match). The slot closes and does
    not reopen by itself; the athlete loses access to the match and is told. With `side`, the guest must belong
    to it (403 otherwise). 404 for who is not a guest of the match; 409 after the start."""
    slot = db.scalar(select(MatchSlot).where(MatchSlot.match_id == match.id, MatchSlot.filled_by_id == user_id,
                                             MatchSlot.state == 'preenchida')
                     .with_for_update().execution_options(populate_existing=True))
    if slot is None:
        raise HTTPException(404, GUEST_NOT_FOUND)
    if side is not None and slot.side != side:
        raise HTTPException(403, GUEST_ONLY_REPRESENTATIVES)
    error = guest_removal_error(match.starts_at, now)
    if error is not None:
        raise HTTPException(409, error)
    slot.state, slot.removed_at, slot.removed_by_id, slot.closed_at = 'fechada', now, actor_id, now
    db.execute(update(MatchLineup).where(MatchLineup.match_id == match.id, MatchLineup.user_id == user_id)
               .values(removed_at=now, updated_at=now).execution_options(synchronize_session='fetch'))
    side_row = load_sides(db, [match.id])[match.id][slot.side]
    team_name = subject_names(db, [side_row])[side_row.id]
    guest_name = db.scalar(select(User.name).where(User.id == user_id))
    notifications.notify(db, user_id, 'removido_da_partida', {'match_id': match.id, 'team_name': team_name},
                         actor_id=actor_id)
    post_event(db, match.id, 'avulso_removido', f'{guest_name} foi removido da partida.', side=slot.side,
               payload={'user_id': user_id, 'slot_id': slot.id}, now=now)
    audit.record(db, actor_id=actor_id, action='avulso.removido', target_type='match_slot', target_id=slot.id,
                 data={'match_id': match.id, 'user_id': user_id, 'side': slot.side, 'position': slot.position})
    return slot


def delete_guest(db: Session, user: User, match_id: int, guest_id: int) -> None:
    """`DELETE /matches/{id}/guests/{user_id}`: the representative of the guest's team removes the walk-in."""
    now = utcnow()
    match, _, access = load_match_for(db, match_id, user, for_update=True)
    if access.role != 'representante' or access.side is None:
        raise HTTPException(403, GUEST_ONLY_REPRESENTATIVES)
    remove_guest(db, match, guest_id, now=now, actor_id=user.id, side=access.side)
    db.commit()

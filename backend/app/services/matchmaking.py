"""Busca, proposta e placa do Jogar (fase 2; etapa 3): create and cancel searches, answer proposals and read the board.

The pairing itself is `matchmaking_queue.queue` (advisory lock per bucket, `FOR UPDATE` re-reads, proposal and
notifications in one transaction); this module validates the input, writes the search, calls the queue and builds
the views. Everything commits at the end of the operation, so the bucket lock never outlives it.

Deadlines on reads: a waiting search past its 24 h, a proposal past its 2 h and a slot offer past its 2 h are shown
as the sweep would leave them (`effective_search`), even before the sweep runs. Writes that touch such a row apply
the same expiry first (`settle`), so a lapsed proposal never blocks a new search, a cancellation or an answer.

Locks follow the global order of stage 3: team (share, on creation) → match → ranking → bucket → slot → search;
pairing takes the bucket lock before the searches it re-reads, and so does the expiry of a lapsed hold (a proposal
dissolves under its bucket, a slot offer is released under the bucket of the city). Contract:
docs/decisoes/0002-jogar.md, sections 9 and 15.
"""
from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from datetime import datetime
from typing import Any, Literal

from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.pagination import paginate
from app.models.identity import City, SportsProfile, User
from app.models.matches import (
    CLOSED_MATCH_STATES,
    OPEN_SEARCH_STATES,
    Match,
    MatchSearch,
    MatchSide,
    MatchSlot,
)
from app.models.teams import Team, TeamMember
from app.schemas.identity import CityOut
from app.schemas.matches import (
    MatchCardOut,
    MatchSearchOut,
    OpenSlotsOut,
    PlayBoardOut,
    ProposalOut,
    SearchCreatedOut,
    SearchInput,
)
from app.schemas.rankings import TeamRefOut
from app.services import audit
from app.services.match_access import load_match_for, load_sides, match_accesses
from app.services.match_rules import (
    RuleError,
    TransitionError,
    bucket_key,
    effective_match_state,
    effective_search_state,
    next_search_state,
    normalize_open_slots,
    search_expires_at,
    slot_total,
)
from app.services.match_views import match_cards, sides_out
from app.services.matchmaking_queue import queue
from app.services.rankings import subject_tier
from app.services.slots import slot_offers

REPRESENTATIVE = 'representante'
PROPOSAL_STATES = ('proposta', 'combinando', 'recusada', 'expirada')
# Matches in play for the board and "Próximas": being arranged, scheduled, or played with the result window open.
UPCOMING_STATES = ('combinando', 'agendada', 'realizada')
# Matches that keep a team from closing.
CLOSING_BLOCKERS = ('proposta', 'combinando', 'agendada')
UPCOMING_LIMIT = 100

MATCH_NOT_FOUND = 'Partida não encontrada.'
TEAM_NOT_FOUND = 'Time não encontrado.'
SEARCH_NOT_FOUND = 'Busca não encontrada.'
ONLY_REP_SEARCH = 'Só representantes buscam partida para o time.'
ONLY_REP_CANCEL = 'Só representantes cancelam a busca do time.'
ONLY_REP_ANSWER = 'Só os representantes aceitam.'
SEARCH_PAIRED = 'A busca já encontrou uma partida. Responda à proposta.'
SEARCH_OFFERED = 'A busca já encontrou uma partida. Responda à oferta de vaga.'
SEARCH_ENDED = 'Esta busca já foi encerrada.'
PROPOSAL_CLOSED = 'Esta proposta não está mais aberta.'
COMPLETE_TEAM_SLOTS = 'Com o time completo, não há vagas para avulsos.'
PROFILE_CITY = {
    'tenis': 'Complete seu perfil de tênis com a cidade para buscar partidas.',
    'futebol': 'Complete seu perfil de futebol com a cidade para buscar vaga.',
}
TEAM_HAS_ACTIVE_MATCH = 'Encerre ou cancele as partidas agendadas e as inscrições ativas antes de encerrar o time.'


# ----- Pure rules (unit tested) ---------------------------------------------------------------------------------

def search_kind(data: SearchInput) -> str:
    """The kind of search from the body, or the 422 for a body that does not fit it (before any query)."""
    if data.sport == 'tenis':
        for name in ('team_id', 'format', 'position', 'open_slots'):
            if getattr(data, name) is not None:
                raise RuleError('Busca de tênis não tem time, formato nem posição.', name)
        return 'tenis'
    if data.team_id is not None:
        if data.format is None:
            raise RuleError('Escolha o formato da partida.', 'format')
        if data.position is not None:
            raise RuleError('A posição é só da busca de avulso.', 'position')
        return 'time'
    if data.format is not None:
        raise RuleError('O avulso aceita qualquer formato.', 'format')
    if data.open_slots is not None:
        raise RuleError('O avulso aceita qualquer formato.', 'open_slots')
    return 'avulso'


def team_open_slots(data: SearchInput, format_: str) -> dict[str, int]:
    """Walk-in spots a team search declares (RN06): at most one goalkeeper and the format size minus one."""
    slots = normalize_open_slots(format_, data.open_slots.model_dump() if data.open_slots is not None else None)
    if data.team_complete and slot_total(slots):
        raise RuleError(COMPLETE_TEAM_SLOTS, 'open_slots')
    return slots


def proposal_overdue(match: Any, now: datetime) -> bool:
    return match.state == 'proposta' and match.proposal_expires_at is not None and match.proposal_expires_at <= now


def effective_search(search: Any, match: Any | None, side: Any | None, now: datetime) -> tuple[str, bool]:
    """(state, held) of a search as the sweep would leave it: 24 h of the search, 2 h of the proposal (a side that
    had accepted returns to the queue, a side that did not answer ends) and 2 h of a slot offer. `held` tells
    whether the search still holds its proposal or slot offer."""
    state = effective_search_state(search.state, search.expires_at, now)
    if state != 'pareada':
        return state, False
    if search.kind == 'avulso':
        lapsed = search.offer_expires_at is not None and search.offer_expires_at <= now
        return ('sem_resposta', False) if lapsed else ('pareada', True)
    if match is not None and proposal_overdue(match, now):
        if side is not None and side.accepted_at is not None:
            return effective_search_state('ativa', search.expires_at, now), False
        return 'sem_resposta', False
    return 'pareada', True


# ----- Small queries ---------------------------------------------------------------------------------------------

def _lock(db: Session, model, row_id: int | None):
    """Re-reads one row with FOR UPDATE and refreshes the loaded copy."""
    if row_id is None:
        return None
    return db.scalar(select(model).where(model.id == row_id).with_for_update().execution_options(
        populate_existing=True))


def _my_team_roles(db: Session, user: User) -> dict[int, str]:
    """Active teams of the viewer and their role in each: {team_id: 'representante' | 'membro'}."""
    rows = db.execute(select(TeamMember.team_id, TeamMember.role).join(Team, Team.id == TeamMember.team_id).where(
        TeamMember.user_id == user.id, TeamMember.left_at.is_(None), Team.state == 'ativo')).all()
    return dict(rows)


def _roles_in(db: Session, user: User, team_ids: Iterable[int]) -> dict[int, str]:
    ids = list(dict.fromkeys(team_ids))
    if not ids:
        return {}
    return dict(db.execute(select(TeamMember.team_id, TeamMember.role).where(
        TeamMember.team_id.in_(ids), TeamMember.user_id == user.id, TeamMember.left_at.is_(None))).all())


def _subject_filter(user: User, team_ids: Iterable[int]):
    ids = list(team_ids)
    return or_(MatchSearch.user_id == user.id, MatchSearch.team_id.in_(ids)) if ids else (
        MatchSearch.user_id == user.id)


def _open_search_rows(db: Session, user: User, team_ids: Iterable[int]) -> list[MatchSearch]:
    return list(db.scalars(select(MatchSearch).where(
        _subject_filter(user, team_ids), MatchSearch.state.in_(OPEN_SEARCH_STATES))
        .order_by(MatchSearch.started_at, MatchSearch.id)).all())


def _my_match_clause(user: User):
    """Matches the viewer takes part in: an athlete side, an active member of a side's team, or a walk-in of an
    open match (the same people `match_access` lets in)."""
    teams = select(TeamMember.team_id).where(TeamMember.user_id == user.id, TeamMember.left_at.is_(None))
    as_side = select(MatchSide.match_id).where(or_(MatchSide.user_id == user.id, MatchSide.team_id.in_(teams)))
    as_guest = select(MatchSlot.match_id).where(MatchSlot.filled_by_id == user.id, MatchSlot.state == 'preenchida')
    return or_(Match.id.in_(as_side), and_(Match.id.in_(as_guest), Match.state.not_in(CLOSED_MATCH_STATES)))


# ----- Views -----------------------------------------------------------------------------------------------------

def searches_out(db: Session, user: User, rows: Sequence[MatchSearch], *, now: datetime) -> list[MatchSearchOut]:
    """The searches as the viewer sees them, in the order given, in a fixed number of queries. The state is the
    effective one: a lapsed hold shows what the sweep will do (the search ended, or back in the queue)."""
    if not rows:
        return []
    cities = {city.id: city for city in db.scalars(select(City).where(City.id.in_({row.city_id for row in rows})))}
    team_ids = {row.team_id for row in rows if row.team_id is not None}
    teams = {team.id: team for team in db.scalars(select(Team).where(Team.id.in_(team_ids)))} if team_ids else {}
    roles = _roles_in(db, user, team_ids)
    paired = [row for row in rows if row.state == 'pareada' and row.kind != 'avulso' and row.match_id is not None]
    matches: dict[int, Match] = {}
    sides: dict[tuple[int | None, int], MatchSide] = {}
    if paired:
        matches = {match.id: match for match in db.scalars(select(Match).where(
            Match.id.in_({row.match_id for row in paired})))}
        sides = {(side.search_id, side.match_id): side for side in db.scalars(select(MatchSide).where(
            MatchSide.search_id.in_([row.id for row in paired]), MatchSide.match_id.in_(matches)))}
    items = []
    for row in rows:
        state, held = effective_search(row, matches.get(row.match_id), sides.get((row.id, row.match_id)), now)
        team = teams.get(row.team_id) if row.team_id is not None else None
        acts = row.user_id == user.id or roles.get(row.team_id) == REPRESENTATIVE
        items.append(MatchSearchOut(
            id=row.id, kind=row.kind, sport=row.sport, city=CityOut.model_validate(cities[row.city_id]),
            format=row.format, position=row.position,
            team=TeamRefOut(id=team.id, name=team.name, initials=team.initials, crest_url=team.crest_url)
            if team is not None else None,
            tier=row.tier, open_slots=OpenSlotsOut(**row.open_slots) if row.open_slots is not None else None,
            state=state, started_at=row.started_at, expires_at=row.expires_at,
            match_id=None if state == 'ativa' else row.match_id,
            slot_id=row.slot_id if held else None, offer_expires_at=row.offer_expires_at if held else None,
            can_cancel=state == 'ativa' and acts))
    return items


def proposals_out(db: Session, user: User, matches: Iterable[Match], *, now: datetime) -> list[ProposalOut]:
    """The proposals among `matches` for the viewer, in the order given, in a fixed number of queries.

    The matches must be the viewer's (a stranger's raises `404 Partida não encontrada.`); matches that are no
    longer a proposal (scheduled, closed...) are left out. `state` is the effective one."""
    rows = list(dict.fromkeys(matches))
    if not rows:
        return []
    sides = load_sides(db, [match.id for match in rows])
    accesses = match_accesses(db, rows, user, sides=sides)
    mine = {match_id: access.side for match_id, access in accesses.items() if access is not None}
    views = sides_out(db, user, sides, my_sides=mine)
    cities = {city.id: city for city in db.scalars(select(City).where(City.id.in_({match.city_id for match in rows})))}
    items = []
    for match in rows:
        access = accesses[match.id]
        if access is None or access.side is None:
            raise HTTPException(404, MATCH_NOT_FOUND)
        state = effective_match_state(match.state, match.proposal_expires_at, now)
        if state not in PROPOSAL_STATES or match.proposal_expires_at is None:
            continue
        side = sides[match.id].get(access.side)
        items.append(ProposalOut(
            match_id=match.id, sport=match.sport, format=match.format, city=CityOut.model_validate(cities[match.city_id]),
            state=state, expires_at=match.proposal_expires_at, sides=views[match.id], my_side=access.side,
            my_role=access.role,
            can_respond=bool(access.acts_for_side and state == 'proposta' and side is not None
                             and side.accepted_at is None and side.declined_at is None),
            created_at=match.created_at))
    return items


def _pending_proposals(db: Session, user: User, *, now: datetime) -> list[Match]:
    return list(db.scalars(select(Match).where(
        Match.state == 'proposta', Match.proposal_expires_at > now, _my_match_clause(user))
        .order_by(Match.proposal_expires_at, Match.id)).all())


def _upcoming_matches(db: Session, user: User) -> list[Match]:
    """Matches in play, soonest first and the ones without a date first."""
    return list(db.scalars(select(Match).where(Match.state.in_(UPCOMING_STATES), _my_match_clause(user))
                           .order_by(Match.starts_at.asc().nulls_first(), Match.id).limit(UPCOMING_LIMIT)).all())


def _created_out(db: Session, user: User, search: MatchSearch, *, now: datetime) -> SearchCreatedOut:
    """The search with the proposal or the slot offer it holds, if any."""
    out = searches_out(db, user, [search], now=now)[0]
    proposal = offer = None
    if out.state == 'pareada':
        if search.kind == 'avulso':
            offer = next((item for item in slot_offers(db, user, now=now) if item.search_id == search.id), None)
        elif search.match_id is not None:
            proposals = proposals_out(db, user, [db.get(Match, search.match_id)], now=now)
            proposal = proposals[0] if proposals else None
    return SearchCreatedOut(search=out, proposal=proposal, offer=offer)


# ----- Applying lapsed deadlines on writes -----------------------------------------------------------------------

def _expire_overdue(db: Session, match: Match, now: datetime, *,
                    skip: Callable[[MatchSearch], bool] | None = None) -> None:
    """What the sweep does to a lapsed proposal (the caller locked the match): the side that had accepted returns
    to the queue, the other ends, and the searches that returned are paired again, except those `skip` names."""
    for search in queue.dissolve_proposal(db, match, outcome='expirada', now=now):
        if skip is None or not skip(search):
            queue.try_match(db, search, now=now)


def settle(db: Session, search_id: int, now: datetime) -> MatchSearch | None:
    """Locks one search after applying the expiry of its own lapsed hold (proposal or slot offer) and of its 24 h.
    Returns the locked search while it is still open, None when it is over."""
    search = db.get(MatchSearch, search_id)
    if search is None:
        return None
    if search.state == 'pareada' and search.kind == 'avulso' and search.slot_id is not None:
        # Releasing the offer offers the slot again: the bucket of the city comes before the slot (lock order).
        queue.lock_bucket(db, bucket_key('avulso', search.city_id))
        slot = _lock(db, MatchSlot, search.slot_id)
        held = _lock(db, MatchSearch, search_id)
        if (slot is not None and held is not None and held.state == 'pareada' and held.slot_id == slot.id
                and held.offer_expires_at is not None and held.offer_expires_at <= now):
            queue.release_offer(db, held, slot, outcome='sem_resposta', now=now)
            queue.offer_slots(db, db.get(Match, slot.match_id), now=now)
    elif search.state == 'pareada' and search.match_id is not None:
        match = _lock(db, Match, search.match_id)
        if match is not None and proposal_overdue(match, now):
            _expire_overdue(db, match, now, skip=lambda other: other.id == search_id)
    current = _lock(db, MatchSearch, search_id)
    if current is not None and current.state == 'ativa' and current.expires_at <= now:
        current.state = next_search_state(current.state, 'expirar')
        current.ended_at = current.updated_at = now
        audit.record(db, actor_id=None, action='busca.expirada', target_type='match_search', target_id=current.id,
                     data={'automatico': True})
    return current if current is not None and current.state in OPEN_SEARCH_STATES else None


# ----- Create ----------------------------------------------------------------------------------------------------

def _representative_team(db: Session, user: User, team_id: int) -> Team:
    """The active team the viewer represents, locked FOR SHARE: closing the team (FOR UPDATE) waits for a search in
    flight and sees it, and a search never starts for a team that already closed. 404 hides other teams, 403 is
    for a member without the armband."""
    def role() -> str | None:
        return db.scalar(select(TeamMember.role).join(Team, Team.id == TeamMember.team_id).where(
            Team.id == team_id, Team.state == 'ativo', TeamMember.user_id == user.id, TeamMember.left_at.is_(None)))

    found = role()
    if found is None:
        raise HTTPException(404, TEAM_NOT_FOUND)
    if found != REPRESENTATIVE:
        raise HTTPException(403, ONLY_REP_SEARCH)
    team = db.scalar(select(Team).where(Team.id == team_id).with_for_update(read=True).execution_options(
        populate_existing=True))
    # The roster and the state may have changed while waiting for the lock.
    found = role() if team is not None and team.state == 'ativo' else None
    if found is None:
        raise HTTPException(404, TEAM_NOT_FOUND)
    if found != REPRESENTATIVE:
        raise HTTPException(403, ONLY_REP_SEARCH)
    return team


def _open_search_id(db: Session, kind: str, sport: str, *, team_id: int | None, user_id: int | None) -> int | None:
    subject = MatchSearch.team_id == team_id if kind == 'time' else MatchSearch.user_id == user_id
    return db.scalar(select(MatchSearch.id).where(subject, MatchSearch.sport == sport,
                                                  MatchSearch.state.in_(OPEN_SEARCH_STATES)))


def create_search_with_status(db: Session, user: User, data: SearchInput, *,
                             now: datetime) -> tuple[SearchCreatedOut, bool]:
    """Creates the search and pairs it at once. The flag is False when the subject already had an open search,
    which is returned untouched (resubmission, RNF06). Raises `RuleError` (422) for a body that does not fit."""
    kind = search_kind(data)
    team = _representative_team(db, user, data.team_id) if kind == 'time' else None
    slots = team_open_slots(data, data.format) if kind == 'time' else None
    if team is not None:
        city_id = team.city_id
    else:
        city_id = db.scalar(select(SportsProfile.city_id).where(
            SportsProfile.user_id == user.id, SportsProfile.sport == data.sport))
        if city_id is None:
            raise HTTPException(409, PROFILE_CITY[data.sport])
    team_id = team.id if team is not None else None

    def existing() -> SearchCreatedOut | None:
        search_id = _open_search_id(db, kind, data.sport, team_id=team_id, user_id=user.id)
        found = settle(db, search_id, now) if search_id is not None else None
        return _created_out(db, user, found, now=now) if found is not None else None

    resubmitted = existing()
    if resubmitted is not None:
        db.commit()
        return resubmitted, False

    if kind == 'time':
        tier = subject_tier(db, 'futebol', team_id=team_id, format=data.format)
    elif kind == 'tenis':
        tier = subject_tier(db, 'tenis', user_id=user.id)
    else:
        tier = None    # the walk-in's tier is compared per slot (position and format of the slot)
    search = MatchSearch(
        sport=data.sport, kind=kind, city_id=city_id, format=data.format if kind == 'time' else None,
        position=data.position if kind == 'avulso' else None, team_id=team_id,
        user_id=None if kind == 'time' else user.id, created_by_id=user.id, tier=tier,
        state='ativa', started_at=now, expires_at=search_expires_at(now), created_at=now, updated_at=now)
    if slots is not None:
        # Left unset otherwise: a JSON null is not the SQL NULL that the category check requires.
        search.open_slots = slots
    try:
        # A savepoint: the unique index of an open search per team or athlete may refuse the insert (a double
        # submission racing us), and the transaction must survive to return the winner.
        with db.begin_nested():
            queue.enqueue(db, search, now=now)
    except IntegrityError:
        resubmitted = existing()
        if resubmitted is None:
            raise
        db.commit()
        return resubmitted, False
    audit.record(db, actor_id=user.id, action='busca.criada', target_type='match_search', target_id=search.id,
                 data={'kind': kind, 'sport': data.sport, 'city_id': city_id, 'format': search.format,
                       'position': search.position, 'team_id': team_id, 'tier': tier, 'open_slots': slots})
    out = _created_out(db, user, search, now=now)
    db.commit()
    return out, True


def create_search(db: Session, user: User, data: SearchInput, *, now: datetime) -> SearchCreatedOut:
    return create_search_with_status(db, user, data, now=now)[0]


# ----- Cancel and list ------------------------------------------------------------------------------------------

def cancel_search(db: Session, user: User, search_id: int, *, now: datetime) -> None:
    """The athlete or a representative ends a waiting search. Not theirs: 404; a member without the armband: 403;
    a search holding a proposal or offer must be answered instead (409)."""
    search = db.get(MatchSearch, search_id)
    if search is None:
        raise HTTPException(404, SEARCH_NOT_FOUND)
    if search.team_id is not None:
        role = _roles_in(db, user, [search.team_id]).get(search.team_id)
        if role is None:
            raise HTTPException(404, SEARCH_NOT_FOUND)
        if role != REPRESENTATIVE:
            raise HTTPException(403, ONLY_REP_CANCEL)
    elif search.user_id != user.id:
        raise HTTPException(404, SEARCH_NOT_FOUND)
    current = settle(db, search_id, now)
    if current is None:
        db.commit()
        raise HTTPException(409, SEARCH_ENDED)
    if current.state == 'pareada':
        db.commit()
        raise HTTPException(409, SEARCH_OFFERED if current.kind == 'avulso' else SEARCH_PAIRED)
    current.state = next_search_state(current.state, 'cancelar')
    current.ended_at = current.updated_at = now
    audit.record(db, actor_id=user.id, action='busca.cancelada', target_type='match_search', target_id=current.id,
                 data={'kind': current.kind, 'team_id': current.team_id})
    db.commit()


def my_searches(db: Session, user: User, *, now: datetime) -> list[MatchSearchOut]:
    """Open searches of the viewer and of the teams they belong to (members see the team's, `can_cancel` false)."""
    rows = _open_search_rows(db, user, _my_team_roles(db, user))
    return [item for item in searches_out(db, user, rows, now=now) if item.state in OPEN_SEARCH_STATES]


def my_proposals(db: Session, user: User, *, now: datetime) -> list[ProposalOut]:
    return proposals_out(db, user, _pending_proposals(db, user, now=now), now=now)


# ----- Answer a proposal -----------------------------------------------------------------------------------------

def respond_to_proposal(db: Session, user: User, match_id: int, decision: Literal['aceitar', 'recusar'], *,
                        now: datetime) -> ProposalOut:
    """Accepts or declines for the viewer's side (a representative, or the tennis athlete). A lapsed proposal is
    ended first (the side that had accepted returns to the queue) and answers 409 like any closed one."""
    load_match_for(db, match_id, user)    # 404 for a stranger before any lock
    match, _, access = load_match_for(db, match_id, user, for_update=True)
    if not access.acts_for_side:
        raise HTTPException(403, ONLY_REP_ANSWER)
    if proposal_overdue(match, now):
        _expire_overdue(db, match, now)
        db.commit()
        raise HTTPException(409, PROPOSAL_CLOSED)
    try:
        if decision == 'aceitar':
            queue.accept_proposal(db, match, access.side, user, now=now)
        else:
            queue.decline_proposal(db, match, access.side, user, now=now)
    except TransitionError as error:
        raise HTTPException(409, str(error)) from None
    out = proposals_out(db, user, [match], now=now)[0]
    db.commit()
    return out


# ----- Board and match lists -------------------------------------------------------------------------------------

def play_board(db: Session, user: User, *, now: datetime) -> PlayBoardOut:
    """The state of the Jogar board: open searches with their elapsed time, pending proposals, slot offers held and
    the matches in play. `attention` lights the mint dot on the navigation."""
    rows = _open_search_rows(db, user, _my_team_roles(db, user))
    searches = [item for item in searches_out(db, user, rows, now=now) if item.state in OPEN_SEARCH_STATES]
    proposals = my_proposals(db, user, now=now)
    offers = slot_offers(db, user, now=now)
    matches = match_cards(db, user, _upcoming_matches(db, user), now=now)
    # A championship match waiting for the organizer's schedule is not something the player has to arrange.
    attention = bool(searches or proposals or offers
                     or any(card.state == 'combinando' and card.origin == 'amistoso' for card in matches))
    return PlayBoardOut(attention=attention, searches=searches, proposals=proposals, offers=offers, matches=matches)


def my_matches(db: Session, user: User, scope: Literal['proximas', 'historico'], cursor: str | None, limit: int, *,
               now: datetime) -> tuple[list[MatchCardOut], str | None]:
    """`proximas`: the matches in play (no pagination). `historico`: finished, without result or cancelled, by
    `closed_at` descending, in pages."""
    if scope == 'proximas':
        return match_cards(db, user, _upcoming_matches(db, user), now=now), None
    statement = select(Match).where(Match.state.in_(('encerrada', 'sem_resultado', 'cancelada')),
                                    _my_match_clause(user))
    rows, next_cursor = paginate(statement, cursor, limit, Match.closed_at, Match.id, db)
    return match_cards(db, user, rows, now=now), next_cursor


# ----- Closing a team (called by services/teams.py) ------------------------------------------------------------

def _blocking_match(team_id: int, now: datetime):
    """A match of the team that keeps it open: a proposal still running, being arranged or scheduled."""
    return select(Match.id).join(MatchSide, MatchSide.match_id == Match.id).where(
        MatchSide.team_id == team_id, Match.state.in_(CLOSING_BLOCKERS),
        or_(Match.state != 'proposta', Match.proposal_expires_at > now)).limit(1)


def team_ensure_no_active_match(db: Session, team: Team, *, now: datetime) -> None:
    """409 of `ensure_closable` while the (locked) team has a match in `proposta`, `combinando` or `agendada`.

    A lapsed proposal does not count: its expiry is applied here, as the sweep would. The team's open searches are
    then locked, so a pairing in flight commits first and is seen by the second check."""
    if db.scalar(_blocking_match(team.id, now)) is not None:
        raise HTTPException(409, TEAM_HAS_ACTIVE_MATCH)
    lapsed = db.scalars(select(Match.id).join(MatchSide, MatchSide.match_id == Match.id).where(
        MatchSide.team_id == team.id, Match.state == 'proposta', Match.proposal_expires_at <= now)
        .order_by(Match.id)).all()
    for match_id in lapsed:
        match = _lock(db, Match, match_id)
        if match is not None and proposal_overdue(match, now):
            _expire_overdue(db, match, now, skip=lambda other: other.team_id == team.id)
    held = db.scalars(select(MatchSearch).where(
        MatchSearch.team_id == team.id, MatchSearch.state.in_(OPEN_SEARCH_STATES)).order_by(MatchSearch.id)
        .with_for_update().execution_options(populate_existing=True)).all()
    if any(row.state == 'pareada' for row in held) or db.scalar(_blocking_match(team.id, now)) is not None:
        raise HTTPException(409, TEAM_HAS_ACTIVE_MATCH)


def cancel_team_searches(db: Session, team: Team, *, actor_id: int, now: datetime) -> list[int]:
    """Cancels the waiting searches of a team that is closing (no commit); returns their ids."""
    rows = db.scalars(select(MatchSearch).where(MatchSearch.team_id == team.id, MatchSearch.state == 'ativa')
                      .order_by(MatchSearch.id).with_for_update().execution_options(populate_existing=True)).all()
    for row in rows:
        row.state = next_search_state(row.state, 'cancelar')
        row.ended_at = row.updated_at = now
        audit.record(db, actor_id=actor_id, action='busca.cancelada', target_type='match_search', target_id=row.id,
                     data={'kind': row.kind, 'team_id': team.id, 'time_encerrado': True})
    return [row.id for row in rows]


__all__ = [
    'cancel_search', 'cancel_team_searches', 'create_search', 'create_search_with_status',
    'effective_search', 'my_matches', 'my_proposals', 'my_searches', 'play_board', 'proposal_overdue',
    'proposals_out', 'respond_to_proposal', 'search_kind', 'searches_out', 'settle', 'team_ensure_no_active_match',
    'team_open_slots',
]

"""Who is who in a match: sides, rosters, walk-ins, the championship organizer and the administration.

Shared by every stage 3 front (contract: docs/decisoes/0002-jogar.md, section 8). A team side is represented by its
active representatives (they accept proposals, terms and scores) and followed by its active members; a tennis side
is the athlete. Walk-ins (filled slots) belong to the side that opened the slot until the match closes. In a
championship match (stage 4) the event organizer also takes part in the chat.
"""
from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.events import Event
from app.models.identity import User
from app.models.matches import CLOSED_MATCH_STATES, Match, MatchLineup, MatchSide, MatchSlot
from app.models.teams import Team, TeamMember
from app.services.match_participation import owner_sides, participation_clause

Scope = Literal['representantes', 'membros']
Role = Literal['representante', 'membro', 'atleta', 'avulso', 'organizador', 'administracao', 'historico']
# The chat opens when both sides accepted the proposal and turns read-only when the match closes.
CHAT_STATES = ('combinando', 'agendada', 'realizada', 'encerrada', 'sem_resultado', 'cancelada')
CHAT_WRITE_STATES = ('combinando', 'agendada', 'realizada')
# Who acts for a side: team representatives, or the tennis athlete.
ACTING_ROLES = ('representante', 'atleta')


@dataclass(frozen=True)
class MatchAccess:
    role: Role
    side: str | None              # the viewer's side; None for the organizer and the administration

    @property
    def acts_for_side(self) -> bool:
        """Accepts the proposal, proposes and accepts terms, reports the score, cancels and registers W.O."""
        return self.role in ACTING_ROLES and self.side is not None


def load_sides(db: Session, match_ids: Iterable[int]) -> dict[int, dict[str, MatchSide]]:
    """Sides of several matches in one query: {match_id: {'a': side, 'b': side}} (missing sides are absent)."""
    ids = list(dict.fromkeys(match_ids))
    result: dict[int, dict[str, MatchSide]] = {match_id: {} for match_id in ids}
    if ids:
        for side in db.scalars(select(MatchSide).where(MatchSide.match_id.in_(ids))).all():
            result[side.match_id][side.side] = side
    return result


def side_users(db: Session, sides: Sequence[MatchSide], *, scope: Scope = 'representantes') -> dict[int, list[int]]:
    """User ids per side id: team representatives (or every active member) in one query; the tennis athlete."""
    team_ids = {side.team_id for side in sides if side.team_id is not None}
    by_team: dict[int, list[int]] = {}
    if team_ids:
        statement = select(TeamMember.team_id, TeamMember.user_id).where(
            TeamMember.team_id.in_(team_ids), TeamMember.left_at.is_(None))
        if scope == 'representantes':
            statement = statement.where(TeamMember.role == 'representante')
        statement = statement.order_by((TeamMember.role == 'representante').desc(), TeamMember.joined_at,
                                       TeamMember.id)
        for team_id, user_id in db.execute(statement).all():
            by_team.setdefault(team_id, []).append(user_id)
    return {side.id: [side.user_id] if side.user_id is not None else list(by_team.get(side.team_id, []))
            for side in sides}


def guest_users(db: Session, match_id: int) -> dict[int, str]:
    """Walk-ins currently in the match (filled slots): {user_id: side}."""
    rows = db.execute(select(MatchSlot.filled_by_id, MatchSlot.side).where(
        MatchSlot.match_id == match_id, MatchSlot.state == 'preenchida')).all()
    return {user_id: side for user_id, side in rows}


def audience(db: Session, match: Match, *, scope: Scope = 'membros', include_guests: bool = True,
             sides: dict[str, MatchSide] | None = None) -> list[int]:
    """Everyone to notify about the match: both sides (representatives or members) and, while the match is
    open, the walk-ins. Order: side A, side B, walk-ins; each person once."""
    sides = sides if sides is not None else load_sides(db, [match.id])[match.id]
    ordered = [sides[key] for key in ('a', 'b') if key in sides]
    users = side_users(db, ordered, scope=scope)
    people = [user_id for side in ordered for user_id in users[side.id]]
    if include_guests and match.state not in CLOSED_MATCH_STATES:
        people += list(guest_users(db, match.id))
    return list(dict.fromkeys(people))


def side_actors(db: Session, side: MatchSide) -> list[int]:
    """Who acts for one side: the active representatives of the team, or the tennis athlete."""
    return side_users(db, [side])[side.id]


def subject_names(db: Session, sides: Iterable[MatchSide]) -> dict[int, str]:
    """Display name per side id: the team name or the athlete's name (copied into notification payloads)."""
    sides = list(sides)
    team_ids = {side.team_id for side in sides if side.team_id is not None}
    user_ids = {side.user_id for side in sides if side.user_id is not None}
    teams = dict(db.execute(select(Team.id, Team.name).where(Team.id.in_(team_ids))).all()) if team_ids else {}
    users = dict(db.execute(select(User.id, User.name).where(User.id.in_(user_ids))).all()) if user_ids else {}
    return {side.id: teams.get(side.team_id, '') if side.team_id is not None else users.get(side.user_id, '')
            for side in sides}


def match_accesses(db: Session, matches: Sequence[Match], user: User, *,
                   sides: dict[int, dict[str, MatchSide]] | None = None) -> dict[int, MatchAccess | None]:
    """The viewer's relation to several matches in a fixed number of queries: {match_id: access or None}.

    A person in both rosters belongs to the side of their lineup, else to the side they represent, else to
    side A. Walk-ins count only while the match is open. The administration reads every match (walkover
    disputes and chat reports), without acting for a side. `sides` may hold the already loaded sides per match.
    """
    matches = list(dict.fromkeys(matches))
    sides = dict(sides or {})
    missing = [match.id for match in matches if match.id not in sides]
    if missing:
        sides.update(load_sides(db, missing))
    ordered = {match.id: [sides[match.id][key] for key in ('a', 'b') if key in sides[match.id]] for match in matches}
    result: dict[int, MatchAccess | None] = {}

    # Tennis: the athlete of a side.
    todo = []
    for match in matches:
        own = next((side for side in ordered[match.id] if side.user_id == user.id), None)
        if own is not None:
            result[match.id] = MatchAccess('atleta', own.side)
        else:
            todo.append(match)

    # Football: the viewer's role in the teams of the sides, then the side of their lineup.
    team_ids = {side.team_id for match in todo for side in ordered[match.id] if side.team_id is not None}
    roles = dict(db.execute(select(TeamMember.team_id, TeamMember.role).where(
        TeamMember.team_id.in_(team_ids), TeamMember.user_id == user.id, TeamMember.left_at.is_(None))).all()
    ) if team_ids else {}
    members = [match for match in todo if any(side.team_id in roles for side in ordered[match.id])]
    lineup_sides = dict(db.execute(select(MatchLineup.match_id, MatchLineup.side).where(
        MatchLineup.match_id.in_([match.id for match in members]), MatchLineup.user_id == user.id)).all()
    ) if members else {}
    for match in members:
        candidates = [side for side in ordered[match.id] if side.team_id in roles]
        chosen = next((side for side in candidates if side.side == lineup_sides.get(match.id)), None) or next(
            (side for side in candidates if roles[side.team_id] == 'representante'), candidates[0])
        result[match.id] = MatchAccess(roles[chosen.team_id], chosen.side)
    todo = [match for match in todo if match.id not in result]

    # Walk-ins of the open matches, then the organizer of the championship and the administration.
    open_ids = [match.id for match in todo if match.state not in CLOSED_MATCH_STATES]
    guest_sides = dict(db.execute(select(MatchSlot.match_id, MatchSlot.side).where(
        MatchSlot.match_id.in_(open_ids), MatchSlot.filled_by_id == user.id, MatchSlot.state == 'preenchida')).all()
    ) if open_ids else {}
    for match in todo:
        if match.id in guest_sides:
            result[match.id] = MatchAccess('avulso', guest_sides[match.id])
    todo = [match for match in todo if match.id not in result]
    event_ids = {match.event_id for match in todo if match.event_id is not None}
    organizers = dict(db.execute(select(Event.id, Event.organizer_user_id).where(Event.id.in_(event_ids))).all()
                      ) if event_ids else {}
    for match in todo:
        if match.event_id is not None and organizers.get(match.event_id) == user.id:
            result[match.id] = MatchAccess('organizador', None)
        elif user.is_admin:
            result[match.id] = MatchAccess('administracao', None)
        else:
            result[match.id] = None
    return result


def match_access(db: Session, match: Match, user: User, *,
                 sides: dict[str, MatchSide] | None = None) -> MatchAccess | None:
    """The viewer's relation to a match; None means 404 (the match is not theirs).

    Same rules as `match_accesses`, which this calls for a single match."""
    return match_accesses(db, [match], user, sides=None if sides is None else {match.id: sides})[match.id]


def load_match_for(db: Session, match_id: int, user: User, *,
                   for_update: bool = False, allow_history: bool = False
                   ) -> tuple[Match, dict[str, MatchSide], MatchAccess]:
    """The match, its sides and the viewer's access, for every match route; `404 Partida não encontrada.` when the
    match does not exist or is not the viewer's (never revealing it). `for_update` locks the match row first
    (lock order: match → slot → search)."""
    statement = select(Match).where(Match.id == match_id)
    if for_update:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    match = db.scalar(statement)
    sides = load_sides(db, [match.id])[match.id] if match is not None else {}
    access = match_access(db, match, user, sides=sides) if match is not None else None
    # Only the detail and own lineup reads opt in. Mutations and chat retain their current authorization.
    if access is None and match is not None and allow_history and not for_update:
        historical = db.scalar(select(Match.id).where(Match.id == match.id, participation_clause(user.id)))
        if historical is not None:
            mine, _ = owner_sides(db, user.id, [match], {match.id: sides})
            access = MatchAccess('historico', mine[match.id])
    if access is None:
        raise HTTPException(404, 'Partida não encontrada.')
    return match, sides, access


def can_read_chat(match: Match, access: MatchAccess | None) -> bool:
    return access is not None and access.role != 'historico' and match.state in CHAT_STATES


def can_write_chat(match: Match, access: MatchAccess | None) -> bool:
    """Rosters, walk-ins and the championship organizer write while the match is open; the administration
    only reads."""
    return (access is not None and access.role not in ('administracao', 'historico')
            and match.state in CHAT_WRITE_STATES)

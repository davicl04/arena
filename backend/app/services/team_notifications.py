"""Pending actions that exist only because someone represented a team (docs/decisoes/0003, section 7.2).

When a representative leaves, is removed or stops representing the team (and when the team closes), the actions
they received as its representative are resolved for them alone; the other representatives keep theirs.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.events import EventEntry
from app.models.matches import MatchSide
from app.models.notifications import Notification
from app.models.teams import TeamMember
from app.services import notifications

# Types sent to the representatives of a side of a match; the payload has `match_id`.
MATCH_TYPES = ('proposta_partida', 'condicoes_propostas', 'wo_registrado', 'resultado_divergente')
# Types sent to the representatives of the team that owns an entry; the payload has `entry_id`.
ENTRY_TYPES = ('comprovante_decidido', 'devolucao_enviada')
# Sent to the representatives of the team asked to join; the payload has `team_id`.
TEAM_TYPES = ('pedido_entrada',)
# `vaga_encontrada` is not here: it goes to the walk-in who searched for a spot, never because of a team role.
TYPES = (*MATCH_TYPES, *ENTRY_TYPES, *TEAM_TYPES)


def _int(payload: dict | None, name: str) -> int | None:
    value = (payload or {}).get(name)
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def resolve_for_former_representatives(db: Session, team_id: int, user_ids: Iterable[int]) -> int:
    """Closes, for each of `user_ids` only, the open actions they received as representatives of `team_id`.

    Call it in the transaction of the change, after the roster rows already carry their new state (left or
    demoted): the actions kept are the ones the person still receives by another role, i.e. a match whose other side
    is a team they still represent or their own tennis side. Fixed number of queries: the open actions of these
    people, the sides of the matches involved, the entries involved and the teams they still represent. No commit."""
    users = list(dict.fromkeys(user_ids))
    if not users:
        return 0
    db.flush()
    rows = db.execute(select(Notification.user_id, Notification.type, Notification.action_key, Notification.payload)
                      .where(Notification.user_id.in_(users), Notification.type.in_(TYPES),
                             Notification.action_key.is_not(None), Notification.resolved_at.is_(None))).all()
    if not rows:
        return 0
    match_ids = {_int(payload, 'match_id') for _, type_, _, payload in rows if type_ in MATCH_TYPES} - {None}
    entry_ids = {_int(payload, 'entry_id') for _, type_, _, payload in rows if type_ in ENTRY_TYPES} - {None}

    # Matches where the team is a side, and the other subjects of those matches.
    other_teams: dict[int, set[int]] = defaultdict(set)
    other_athletes: dict[int, set[int]] = defaultdict(set)
    team_matches: set[int] = set()
    if match_ids:
        sides = db.execute(select(MatchSide.match_id, MatchSide.team_id, MatchSide.user_id).where(
            MatchSide.match_id.in_(match_ids))).all()
        team_matches = {match_id for match_id, side_team, _ in sides if side_team == team_id}
        for match_id, side_team, side_user in sides:
            if side_team is not None and side_team != team_id:
                other_teams[match_id].add(side_team)
            if side_user is not None:
                other_athletes[match_id].add(side_user)
    team_entries = set(db.scalars(select(EventEntry.id).where(
        EventEntry.id.in_(entry_ids), EventEntry.team_id == team_id))) if entry_ids else set()
    still_representing: dict[int, set[int]] = defaultdict(set)
    if team_matches:
        for user_id, other_team in db.execute(select(TeamMember.user_id, TeamMember.team_id).where(
                TeamMember.user_id.in_(users), TeamMember.role == 'representante', TeamMember.left_at.is_(None))):
            still_representing[user_id].add(other_team)

    keys: dict[int, list[str]] = defaultdict(list)
    for user_id, type_, key, payload in rows:
        if type_ in TEAM_TYPES:
            related = _int(payload, 'team_id') == team_id
        elif type_ in ENTRY_TYPES:
            related = _int(payload, 'entry_id') in team_entries
        else:
            match_id = _int(payload, 'match_id')
            related = (match_id in team_matches and user_id not in other_athletes[match_id]
                       and not (other_teams[match_id] & still_representing[user_id]))
        if related and key is not None:
            keys[user_id].append(key)
    return sum(notifications.resolve_actions_many(db, user_keys, user_ids=[user_id])
               for user_id, user_keys in keys.items())

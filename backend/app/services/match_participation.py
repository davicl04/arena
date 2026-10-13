"""Shared historical participation and side resolution for profile queries and read-only match access."""
from __future__ import annotations

from collections.abc import Mapping, Sequence

from sqlalchemy import and_, exists, or_, select
from sqlalchemy.orm import Session

from app.models.matches import Match, MatchLineup, MatchSide
from app.models.teams import TeamMember

# 'realizada' has a confirmed score; it becomes 'encerrada' when the 48 h stats window closes.
# A match waiting for its score is still 'agendada' and stays in the Jogar.
HISTORY_STATES = ('realizada', 'encerrada', 'sem_resultado', 'cancelada')


def participation_clause(owner_id: int):
    """SQL condition over `matches`: the match is in the history of the athlete (rule A1)."""
    plays_tennis = and_(Match.sport == 'tenis', exists().where(
        MatchSide.match_id == Match.id, MatchSide.user_id == owner_id))
    in_lineup = exists().where(
        MatchLineup.match_id == Match.id, MatchLineup.user_id == owner_id, MatchLineup.removed_at.is_(None),
        MatchLineup.present.is_(True))
    marked_absent = exists().where(
        MatchLineup.match_id == Match.id, MatchLineup.user_id == owner_id, MatchLineup.present.is_(False))
    was_member = exists().where(
        MatchSide.match_id == Match.id, MatchSide.team_id == TeamMember.team_id, TeamMember.user_id == owner_id,
        TeamMember.joined_at <= Match.starts_at,
        or_(TeamMember.left_at.is_(None), TeamMember.left_at > Match.starts_at))
    plays_football = and_(Match.sport == 'futebol', or_(in_lineup, and_(~marked_absent, was_member)))
    return and_(Match.state.in_(HISTORY_STATES), Match.starts_at.is_not(None), or_(plays_tennis, plays_football))


def owner_sides(db: Session, owner_id: int, matches: Sequence[Match],
                sides: Mapping[int, Mapping[str, MatchSide]]) -> tuple[dict[int, str | None], dict[int, MatchLineup]]:
    """The side of the athlete in each match (the lineup wins over the membership) and their lineups."""
    ids = [match.id for match in matches]
    lineups: dict[int, MatchLineup] = {}
    if ids:
        lineups = {row.match_id: row for row in db.scalars(select(MatchLineup).where(
            MatchLineup.user_id == owner_id, MatchLineup.match_id.in_(ids)))}
    stays = db.scalars(select(TeamMember).where(TeamMember.user_id == owner_id)).all() if ids else []
    result: dict[int, str | None] = {}
    for match in matches:
        by_side = sides.get(match.id, {})
        lineup = lineups.get(match.id)
        found = None
        if match.sport == 'tenis':
            found = next((key for key, side in by_side.items() if side.user_id == owner_id), None)
        elif lineup is not None and lineup.present is True and lineup.removed_at is None:
            found = lineup.side
        else:
            for key in sorted(by_side):
                team_id = by_side[key].team_id
                if team_id is not None and any(
                        stay.team_id == team_id and stay.joined_at <= match.starts_at
                        and (stay.left_at is None or stay.left_at > match.starts_at) for stay in stays):
                    found = key
                    break
        result[match.id] = found
    return result, lineups



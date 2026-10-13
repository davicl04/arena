"""Participation rule of the profile history (aba Partidas) and the counts of the own profile.

Contract: docs/plano-perfil-partidas.md, parts A1 and A3. A match belongs to the history of an athlete when it is
`realizada` (final score confirmed, stats window still open), `encerrada`, `sem_resultado` or `cancelada` (always
with a start date) and one of these holds:

1. tennis: the athlete is the player of a side (`MatchSide.user_id`);
2. football, lineup: the athlete has a lineup row not removed with presence confirmed (walk-ins included);
3. football, presence not informed: no lineup row says "absent" and the athlete was a member of the team of a side
   on the date of the match (`joined_at <= starts_at` and not left, or left after it). This covers matches without
   a roll call, walkovers and cancelled matches.

The history does not depend on the current membership: leaving a team keeps the past and joining one does not
inherit the old matches. The result is read from the athlete's side with `scoring.outcome_for`; in a walkover the
absent side loses (the final score of a walkover already names the winner). Only reads happen here.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import and_, exists, or_, select
from sqlalchemy.orm import Session

from app.models.identity import User
from app.models.matches import SCORED_MATCH_STATES, FootballStat, Match, MatchLineup, MatchSide
from app.models.rankings import TIERS
from app.models.teams import TeamMember
from app.schemas.profile import ProfileStatsOut
from app.services import scoring
from app.services.match_access import load_sides
from app.services.match_rules import counted_stat_fields
from app.services.rankings import my_standings

# 'realizada' always has a confirmed final score (it already counts in the rankings); it becomes 'encerrada' when
# the 48 h stats window closes. A match waiting for its score is still 'agendada' and stays in the Jogar.
HISTORY_STATES = ('realizada', 'encerrada', 'sem_resultado', 'cancelada')
STAT_COLUMNS = {'gols': 'goals', 'assistencias': 'assists', 'estatistica_posicao': 'position_stat'}


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


def is_final(match: Match) -> bool:
    """The match has a confirmed final score (a walkover kept included; an annulled one is `sem_resultado`)."""
    return match.state in SCORED_MATCH_STATES and match.score_a is not None and match.score_b is not None


def valid_walkover_side(match: Match) -> str | None:
    """The absent side of a walkover that stands: the match ended and the administration did not annul it."""
    if match.state != 'encerrada' or match.walkover_decision == 'anulado':
        return None
    return match.walkover_absent_side


def outcome_of(match: Match, owner_side: str | None) -> str | None:
    """'vitoria', 'empate' or 'derrota' for the athlete's side; None without a final score or without a side."""
    if owner_side is None or not is_final(match):
        return None
    if match.sport == 'tenis' and match.winner_side is None:
        return None
    return scoring.outcome_for(owner_side, match.winner_side)


def points_of(match: Match, outcome: str | None) -> int | None:
    if outcome is None:
        return None
    return scoring.team_points(outcome) if match.sport == 'futebol' else scoring.tennis_points(outcome)


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


def counted_stats(db: Session, matches: Sequence[Match],
                  lineups: Mapping[int, MatchLineup]) -> dict[int, dict[str, int | str | None]]:
    """Stats of the athlete that count (RN10: reviewed, or not contested after a review), per match id. A
    walkover has none; neither does a match where the athlete has no confirmed lineup or no stat."""
    wanted: dict[int, MatchLineup] = {}
    for match in matches:
        lineup = lineups.get(match.id)
        if (match.sport == 'futebol' and is_final(match) and valid_walkover_side(match) is None
                and lineup is not None and lineup.present is True and lineup.removed_at is None):
            wanted[match.id] = lineup
    if not wanted:
        return {}
    by_lineup = {stat.lineup_id: stat for stat in db.scalars(select(FootballStat).where(
        FootballStat.lineup_id.in_([lineup.id for lineup in wanted.values()])))}
    result: dict[int, dict[str, int | str | None]] = {}
    for match_id, lineup in wanted.items():
        stat = by_lineup.get(lineup.id)
        if stat is None:
            continue
        counted = counted_stat_fields(stat.state, stat.contested_fields, reviewed=stat.reviewed_at is not None)
        values = {column: getattr(stat, column) if field in counted else None
                  for field, column in STAT_COLUMNS.items()}
        if any(value is not None for value in values.values()):
            result[match_id] = {'position': lineup.position, **values}
    return result


@dataclass(frozen=True)
class Tally:
    played: int
    wins: int
    draws: int
    losses: int


def tally(db: Session, owner_id: int) -> Tally:
    """Football and tennis matches of the history with a final result (walkover included): the counts of the
    own profile. Cancelled, without result and runs stay out."""
    matches = list(db.scalars(select(Match).where(participation_clause(owner_id), Match.state.in_(SCORED_MATCH_STATES),
                                                  Match.score_a.is_not(None))))
    sides = load_sides(db, [match.id for match in matches])
    mine, _ = owner_sides(db, owner_id, matches, sides)
    counts = {'vitoria': 0, 'empate': 0, 'derrota': 0}
    for match in matches:
        outcome = outcome_of(match, mine[match.id])
        if outcome is not None:
            counts[outcome] += 1
    wins, draws, losses = counts['vitoria'], counts['empate'], counts['derrota']
    return Tally(wins + draws + losses, wins, draws, losses)


def profile_stats(db: Session, user: User) -> ProfileStatsOut:
    """`GET /me/profile-stats`: counts of the history plus the best tier among the ranked lines of
    `/me/standings` (never a line still in placement)."""
    counts = tally(db, user.id)
    standings = my_standings(db, user)
    lines = [line for team in standings.futebol.teams for line in team.formats]
    lines += [*standings.futebol.individual, standings.tenis, *standings.corrida]
    tiers = [line.tier for line in lines if line.state == 'ranqueado' and line.tier in TIERS]
    best = max(tiers, key=TIERS.index) if tiers else None
    placing = best is None and any(line.state == 'classificacao' for line in lines)
    rate = (float((Decimal(counts.wins) * 100 / counts.played).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP))
            if counts.played else None)
    return ProfileStatsOut(played=counts.played, wins=counts.wins, draws=counts.draws, losses=counts.losses,
                           win_rate=rate, best_tier=best, in_placement=placing)

"""Points and rankings of football and tennis (Jogar, fase 5), without database access.

Individual football points per match (RN12, with the position stat of RN13 and the review rules of RN10), team
points 3/1/0 and tie-breaks (RN14), tennis points (RN16), the 52-week window, classification (3 confirmed
matches) and the tier of each classified subject from the versioned cuts, Lendário included (RN23). The ranking
service (stage 3, results and ranking front) loads the confirmed matches, builds the records with these
functions and materializes `standings`.
"""
from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Generic, TypeVar

from app.models.matches import STAT_FIELDS
from app.services.rankings import Cuts, tier_for

OUTCOMES = ('vitoria', 'empate', 'derrota')
# RN14 (teams) and the result share of RN12 (individual).
RESULT_POINTS = {'vitoria': 3, 'empate': 1, 'derrota': 0}
PRESENCE_POINTS = Decimal(1)
GOAL_POINTS = Decimal(1)
ASSIST_POINTS = Decimal(1)
POSITION_STAT_POINTS = Decimal('0.5')
POSITION_STAT_CAP = Decimal(4)
# RN16: a confirmed tennis win is worth 10 points, in friendlies and championships.
TENNIS_WIN_POINTS = 10
WINDOW_WEEKS = 52
AVERAGE_QUANTUM = Decimal('0.001')


def outcome_for(side: str, winner: str | None) -> str:
    """'vitoria', 'empate' or 'derrota' for `side` given the winner (None is a football draw)."""
    if side not in ('a', 'b'):
        raise ValueError('Lado inválido.')
    if winner is None:
        return 'empate'
    return 'vitoria' if winner == side else 'derrota'


def team_points(outcome: str) -> int:
    return RESULT_POINTS[outcome]


def tennis_points(outcome: str) -> int:
    if outcome == 'empate':
        raise ValueError('Tênis não tem empate.')
    return TENNIS_WIN_POINTS if outcome == 'vitoria' else 0


def position_stat_points(count: int | None) -> Decimal:
    """0.5 per occurrence, limited to 4 points per match (RN12)."""
    return min(POSITION_STAT_POINTS * (count or 0), POSITION_STAT_CAP)


@dataclass(frozen=True)
class IndividualPoints:
    presence: Decimal
    result: Decimal
    goals: Decimal
    assists: Decimal
    position_stat: Decimal

    @property
    def total(self) -> Decimal:
        return self.presence + self.result + self.goals + self.assists + self.position_stat


def individual_points(*, outcome: str | None, goals: int | None = None, assists: int | None = None,
                      position_stat: int | None = None,
                      counted: Iterable[str] = STAT_FIELDS) -> IndividualPoints:
    """Points of one appearance (RN12): presence 1; win 3, draw 1, loss 0; goal 1; assist 1; position stat
    0.5 each up to 4. Only the `counted` stat items score (see `match_rules.counted_stat_fields`); empty
    fields neither add nor subtract. `outcome` None (score not known yet) gives 0 for the result, for previews."""
    items = frozenset(counted)
    return IndividualPoints(
        presence=PRESENCE_POINTS,
        result=Decimal(RESULT_POINTS[outcome]) if outcome is not None else Decimal(0),
        goals=GOAL_POINTS * (goals or 0) if 'gols' in items else Decimal(0),
        assists=ASSIST_POINTS * (assists or 0) if 'assistencias' in items else Decimal(0),
        position_stat=position_stat_points(position_stat) if 'estatistica_posicao' in items else Decimal(0),
    )


# ----- Window and classification -----------------------------------------------------------------------------

def window_start(now: datetime, weeks: int = WINDOW_WEEKS) -> datetime:
    return now - timedelta(weeks=weeks)


def in_window(played_at: datetime, now: datetime, weeks: int = WINDOW_WEEKS) -> bool:
    """A match counts while its scheduled start is within the last 52 weeks."""
    return window_start(now, weeks) <= played_at <= now


def is_classified(matches: int, required: int) -> bool:
    """Classification: 3 confirmed matches in the window (football and tennis); before that, no tier."""
    return matches >= required


# ----- Records -----------------------------------------------------------------------------------------------

@dataclass(frozen=True)
class TeamRecord:
    subject_id: int
    matches: int = 0
    wins: int = 0
    draws: int = 0
    losses: int = 0
    goals_for: int = 0
    goals_against: int = 0

    @property
    def points(self) -> int:
        return 3 * self.wins + self.draws

    @property
    def goal_difference(self) -> int:
        return self.goals_for - self.goals_against

    @property
    def metric(self) -> Decimal:
        return Decimal(self.points)


def team_record(subject_id: int, games: Iterable[tuple[int, int]]) -> TeamRecord:
    """Record from (goals for, goals against) of each confirmed match in the window."""
    wins = draws = losses = scored = conceded = matches = 0
    for goals_for, goals_against in games:
        matches += 1
        scored += goals_for
        conceded += goals_against
        if goals_for > goals_against:
            wins += 1
        elif goals_for == goals_against:
            draws += 1
        else:
            losses += 1
    return TeamRecord(subject_id, matches, wins, draws, losses, scored, conceded)


def team_order(record: TeamRecord) -> tuple:
    """RN14: points, then goal difference, goals scored and fewer matches; the id keeps the order stable."""
    return (-record.points, -record.goal_difference, -record.goals_for, record.matches, record.subject_id)


@dataclass(frozen=True)
class IndividualRecord:
    subject_id: int
    matches: int = 0
    total: Decimal = Decimal(0)
    wins: int = 0
    draws: int = 0
    losses: int = 0

    @property
    def average(self) -> Decimal:
        if not self.matches:
            return Decimal(0)
        return (self.total / self.matches).quantize(AVERAGE_QUANTUM, rounding=ROUND_HALF_UP)

    @property
    def metric(self) -> Decimal:
        return self.average


def individual_record(subject_id: int, appearances: Iterable[tuple[str, IndividualPoints]]) -> IndividualRecord:
    """Record from (outcome, points) of each counted appearance in one position and format (RN11)."""
    total = Decimal(0)
    tally = {'vitoria': 0, 'empate': 0, 'derrota': 0}
    matches = 0
    for outcome, points in appearances:
        matches += 1
        total += points.total
        tally[outcome] += 1
    return IndividualRecord(subject_id, matches, total, tally['vitoria'], tally['empate'], tally['derrota'])


def individual_order(record: IndividualRecord) -> tuple:
    """Average per match; ties go to more matches (a steadier average), then the id (interpretation)."""
    return (-record.average, -record.matches, record.subject_id)


@dataclass(frozen=True)
class TennisRecord:
    subject_id: int
    matches: int = 0
    wins: int = 0
    losses: int = 0
    sets_for: int = 0
    sets_against: int = 0
    bonus: int = 0              # championship placement bonus (RN16), added by the championship phase

    @property
    def points(self) -> int:
        return TENNIS_WIN_POINTS * self.wins + self.bonus

    @property
    def metric(self) -> Decimal:
        return Decimal(self.points)


def tennis_record(subject_id: int, games: Iterable[tuple[int, int]], *, bonus: int = 0) -> TennisRecord:
    """Record from (sets won, sets lost) of each confirmed match in the window."""
    wins = losses = won = lost = matches = 0
    for sets_won, sets_lost in games:
        matches += 1
        won += sets_won
        lost += sets_lost
        if sets_won > sets_lost:
            wins += 1
        else:
            losses += 1
    return TennisRecord(subject_id, matches, wins, losses, won, lost, bonus)


def tennis_order(record: TennisRecord) -> tuple:
    """Points; ties go to fewer matches (as in RN14), then the id (interpretation)."""
    return (-record.points, record.matches, record.subject_id)


# ----- Placement and tiers -----------------------------------------------------------------------------------

R = TypeVar('R', TeamRecord, IndividualRecord, TennisRecord)


@dataclass(frozen=True)
class Placement(Generic[R]):
    record: R
    metric_value: Decimal
    matches_played: int
    rank_position: int | None    # only classified subjects have a position and a tier
    tier: str | None


def rank_records(records: Sequence[R], *, cuts: Cuts, order: Callable[[R], tuple]) -> list[Placement[R]]:
    """Positions and tiers of one ranking: classified subjects (`placement_matches`) in `order`, each with the
    tier of its metric; Lendário for Diamante inside ⌊classified × 15%⌋. Unclassified subjects keep no tier."""
    classified = sorted((item for item in records if is_classified(item.matches, cuts.placement_matches)), key=order)
    count = len(classified)
    placements = [Placement(item, item.metric, item.matches, index,
                            tier_for(item.metric, cuts, rank_position=index, classified_count=count))
                  for index, item in enumerate(classified, start=1)]
    placements += [Placement(item, item.metric, item.matches, None, None)
                   for item in records if not is_classified(item.matches, cuts.placement_matches)]
    return placements


def standing_fields(placement: Placement, *, calc_version: int) -> dict:
    """Column values of a `standings` row for one placement (goals for teams, sets for tennis, none for the
    individual ranking, whose metric is the average)."""
    record = placement.record
    return {
        'metric_value': placement.metric_value, 'matches_played': placement.matches_played,
        'rank_position': placement.rank_position, 'tier': placement.tier, 'calc_version': calc_version,
        'wins': record.wins, 'draws': getattr(record, 'draws', 0), 'losses': record.losses,
        'goals_for': getattr(record, 'goals_for', getattr(record, 'sets_for', 0)),
        'goals_against': getattr(record, 'goals_against', getattr(record, 'sets_against', 0)),
    }

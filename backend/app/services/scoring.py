"""Points and rankings of football, tennis and running (Jogar, fases 5 e 6), without database access.

Individual football points per match (RN12, with the position stat of RN13 and the review rules of RN10), team
points 3/1/0 and tie-breaks (RN14), tennis points (RN16), the best time of a running distance (RN17), the 52-week
window, classification (3 confirmed matches; the first mark in running) and the tier of each classified subject
from the versioned cuts, Lendário included (RN23). The ranking service (`services.standings`) loads the confirmed
matches and the marks, builds the records with these functions and materializes `standings`.

From `calc_version = 2` teams and tennis are ranked by a rating (decision docs/decisoes/0006-ranking-por-rating.md):
`replay_ratings` replays the counted matches of the window in chronological order from the initial rating, with
`expected_score` and `updated_rating`; the points 3/1/0 and 10 per win stay as campaign statistics. In tennis the
championship bonus (RN16) enters the replay at the moment it was awarded, weighted by the strength of the bracket
(`weighted_bonus`). When the cuts of the version in use still rank by points (`metric = 'pontos'`), the records carry
no rating and rank by points.
"""
from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_EVEN, ROUND_HALF_UP, Context, Decimal, localcontext
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
# Rating: rounded to 3 places at every step, so a replay gives the same value on any machine; the arithmetic runs
# in a fixed decimal context (precision and rounding), whatever the context of the caller.
RATING_QUANTUM = Decimal('0.001')
RATING_CONTEXT = Context(prec=28, rounding=ROUND_HALF_EVEN)
RATING_SCALE = Decimal(400)
RATING_SCORES = {'vitoria': Decimal(1), 'empate': Decimal('0.5'), 'derrota': Decimal(0)}
# Recent form (Ranking screen): the last results of a subject, oldest first, as stored in `standings.recent_form`.
FORM_LENGTH = 5
FORM_LETTERS = {'vitoria': 'V', 'empate': 'E', 'derrota': 'D'}


def outcome_for(side: str, winner: str | None) -> str:
    """'vitoria', 'empate' or 'derrota' for `side` given the winner (None is a football draw)."""
    if side not in ('a', 'b'):
        raise ValueError('Lado inválido.')
    if winner is None:
        return 'empate'
    return 'vitoria' if winner == side else 'derrota'


def score_outcome(points_for: int, points_against: int, *, draws: bool = True) -> str:
    """'vitoria', 'empate' or 'derrota' from the score of one side; without draws (tennis) a tie is a loss, as in
    `tennis_record`."""
    if points_for > points_against:
        return 'vitoria'
    return 'empate' if draws and points_for == points_against else 'derrota'


def recent_form(outcomes: Iterable[tuple[datetime, int, str]], limit: int = FORM_LENGTH) -> str:
    """Last `limit` results as letters ('V', 'E', 'D'), the oldest first: `outcomes` are (match start, match id,
    outcome) and are ordered by start, then id, so the sequence does not depend on how they were loaded."""
    latest = sorted(outcomes, key=lambda item: (item[0], item[1]))[-limit:] if limit > 0 else []
    return ''.join(FORM_LETTERS[outcome] for _, _, outcome in latest)


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


def run_window_start(today: date, weeks: int = WINDOW_WEEKS) -> date:
    """First day whose marks count (running windows are calendar days, not instants)."""
    return today - timedelta(weeks=weeks)


def is_classified(matches: int, required: int) -> bool:
    """Classification: 3 confirmed matches in the window (football and tennis), the first mark in running; before
    that, no tier."""
    return matches >= required


# ----- Rating (futebol · time and tênis, calc_version 2) --------------------------------------------------------

def expected_score(rating: Decimal, opponent: Decimal) -> Decimal:
    """E = 1 / (1 + 10^((opponent - rating) / 400)): the expected result of `rating` against `opponent`, in (0, 1)."""
    with localcontext(RATING_CONTEXT):
        return Decimal(1) / (Decimal(1) + Decimal(10) ** ((Decimal(opponent) - Decimal(rating)) / RATING_SCALE))


def updated_rating(rating: Decimal, opponent: Decimal, score: Decimal, k: Decimal) -> Decimal:
    """rating + K × (S - E), rounded to 3 places; S is 1 (win), 0.5 (draw) or 0 (loss) and both ratings are the ones
    before the match. The margin of goals or sets does not matter."""
    with localcontext(RATING_CONTEXT):
        value = Decimal(rating) + Decimal(k) * (Decimal(score) - expected_score(rating, opponent))
        return value.quantize(RATING_QUANTUM, rounding=ROUND_HALF_UP)


def k_factor(played_before: int, cuts: Cuts) -> Decimal:
    """K of a subject's match: the placement K in its first `placement_matches` matches of the window, then the
    regular K."""
    if cuts.placement_k is None or cuts.regular_k is None:
        raise ValueError('Cortes sem parâmetros de rating.')
    return cuts.placement_k if played_before < cuts.placement_matches else cuts.regular_k


@dataclass(frozen=True)
class RatedMatch:
    """A counted match of a rating category: when it started, its id, the subject of each side (None if a side has
    no subject in the category) and the score (goals or sets)."""
    starts_at: datetime
    match_id: int
    side_a: int | None
    side_b: int | None
    score_a: int
    score_b: int


@dataclass(frozen=True)
class RatedBonus:
    """A championship placement bonus of a rating category (tennis, RN16): when the event ended and gave it, the
    event, the athlete, the base stored in `event_placements` (40, 20 or 10) and every confirmed entrant of the
    event (the athlete included or not: the bracket strength leaves the athlete out)."""
    awarded_at: datetime
    event_id: int
    subject_id: int
    base: int
    entrants: frozenset[int]


def weighted_bonus(base: int | Decimal, rating: Decimal, others: Sequence[Decimal]) -> Decimal:
    """base × 2 × (1 - E), rounded to 3 places, where E is the expected result of `rating` against the mean rating of
    the other entrants of the bracket: exactly the base against a bracket of the same level, up to twice the base
    against a stronger one, towards 0 against a weaker one, never negative. Without other entrants (the award needs
    4 or more) the bracket counts as the same level."""
    with localcontext(RATING_CONTEXT):
        bracket = sum(others, Decimal(0)) / len(others) if others else Decimal(rating)
        value = Decimal(base) * 2 * (Decimal(1) - expected_score(rating, bracket))
        return max(value.quantize(RATING_QUANTUM, rounding=ROUND_HALF_UP), Decimal(0))


def replay_ratings(matches: Iterable[RatedMatch], cuts: Cuts, *, draws: bool = True,
                   bonuses: Iterable[RatedBonus] = ()) -> dict[int, Decimal]:
    """Ratings of a category: every subject starts at the initial rating of the cuts and each match, in order of
    start and then id, updates both sides from their ratings before it (K by `k_factor`). Without draws (tennis) an
    equal score is a loss for both, as in `tennis_record`. A side without a subject is faced at the initial rating
    and keeps no rating. Nothing is incremental: the same matches always give the same ratings.

    `bonuses` (tennis) enter the same timeline at `awarded_at`: the bonuses of one event are applied together, from
    the ratings before that instant (an entrant without a match yet is at the initial rating), with
    `weighted_bonus`. A match that starts at the same instant goes first (the event ends after its matches), and
    events of the same instant follow their id. A bonus is not a match: it does not advance the placement K."""
    if cuts.initial_rating is None:
        raise ValueError('Cortes sem parâmetros de rating.')
    initial = cuts.initial_rating
    ratings: dict[int, Decimal] = {}
    played: dict[int, int] = {}
    awards: dict[tuple[datetime, int], list[RatedBonus]] = {}
    for bonus in bonuses:
        awards.setdefault((bonus.awarded_at, bonus.event_id), []).append(bonus)
    timeline = sorted([((match.starts_at, 0, match.match_id), match) for match in matches]
                      + [((awarded_at, 1, event_id), items) for (awarded_at, event_id), items in awards.items()],
                      key=lambda item: item[0])
    for _, step in timeline:
        if isinstance(step, RatedMatch):
            _replay_match(step, ratings, played, cuts, draws=draws)
            continue
        gains = [(bonus.subject_id, weighted_bonus(
            bonus.base, ratings.get(bonus.subject_id, initial),
            [ratings.get(entrant, initial) for entrant in sorted(bonus.entrants - {bonus.subject_id})]))
            for bonus in step]
        with localcontext(RATING_CONTEXT):
            for subject_id, gain in gains:
                ratings[subject_id] = ratings.get(subject_id, initial) + gain
    return ratings


def _replay_match(match: RatedMatch, ratings: dict[int, Decimal], played: dict[int, int], cuts: Cuts, *,
                  draws: bool) -> None:
    """Both sides of one match, from their ratings before it; each counts one more match for its K."""
    initial = cuts.initial_rating
    before = {side: ratings.get(subject, initial) if subject is not None else initial
              for side, subject in (('a', match.side_a), ('b', match.side_b))}
    for side, subject, scored, conceded in (('a', match.side_a, match.score_a, match.score_b),
                                            ('b', match.side_b, match.score_b, match.score_a)):
        if subject is None:
            continue
        opponent = before['b' if side == 'a' else 'a']
        score = RATING_SCORES[score_outcome(scored, conceded, draws=draws)]
        ratings[subject] = updated_rating(before[side], opponent, score, k_factor(played.get(subject, 0), cuts))
        played[subject] = played.get(subject, 0) + 1


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
    form: str = ''
    rating: Decimal | None = None   # from `replay_ratings` when the cuts rank by rating; None ranks by points

    @property
    def points(self) -> int:
        """Campaign points 3/1/0 (RN14); the metric only while the cuts rank by points."""
        return 3 * self.wins + self.draws

    @property
    def goal_difference(self) -> int:
        return self.goals_for - self.goals_against

    @property
    def metric(self) -> Decimal:
        return self.rating if self.rating is not None else Decimal(self.points)


def team_record(subject_id: int, games: Iterable[tuple[int, int]], *, form: str = '',
                rating: Decimal | None = None) -> TeamRecord:
    """Record from (goals for, goals against) of each confirmed match in the window; `form` is `recent_form` and
    `rating` the replayed rating (rating cuts only)."""
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
    return TeamRecord(subject_id, matches, wins, draws, losses, scored, conceded, form, rating)


def team_order(record: TeamRecord) -> tuple:
    """The metric (rating, or points under points cuts), then the RN14 tie-breaks: goal difference, goals scored
    and fewer matches; the id keeps the order stable."""
    return (-record.metric, -record.goal_difference, -record.goals_for, record.matches, record.subject_id)


@dataclass(frozen=True)
class IndividualRecord:
    subject_id: int
    matches: int = 0
    total: Decimal = Decimal(0)
    wins: int = 0
    draws: int = 0
    losses: int = 0
    form: str = ''

    @property
    def average(self) -> Decimal:
        if not self.matches:
            return Decimal(0)
        return (self.total / self.matches).quantize(AVERAGE_QUANTUM, rounding=ROUND_HALF_UP)

    @property
    def metric(self) -> Decimal:
        return self.average


def individual_record(subject_id: int, appearances: Iterable[tuple[str, IndividualPoints]], *,
                      form: str = '') -> IndividualRecord:
    """Record from (outcome, points) of each counted appearance in one position and format (RN11); `form` is
    `recent_form` of those appearances."""
    total = Decimal(0)
    tally = {'vitoria': 0, 'empate': 0, 'derrota': 0}
    matches = 0
    for outcome, points in appearances:
        matches += 1
        total += points.total
        tally[outcome] += 1
    return IndividualRecord(subject_id, matches, total, tally['vitoria'], tally['empate'], tally['derrota'], form)


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
    bonus: int = 0              # sum of the championship placement bases (RN16) of the window, for the points
    form: str = ''
    rating: Decimal | None = None   # from `replay_ratings` (weighted bonus included) under rating cuts; None: points

    @property
    def points(self) -> int:
        """10 per win plus the championship bonus base (RN16); the metric only while the cuts rank by points."""
        return TENNIS_WIN_POINTS * self.wins + self.bonus

    @property
    def metric(self) -> Decimal:
        return self.rating if self.rating is not None else Decimal(self.points)


def tennis_record(subject_id: int, games: Iterable[tuple[int, int]], *, bonus: int = 0, form: str = '',
                  rating: Decimal | None = None) -> TennisRecord:
    """Record from (sets won, sets lost) of each confirmed match in the window; `form` is `recent_form` and
    `rating` the replayed rating (rating cuts only), which already carries the weighted championship bonus."""
    wins = losses = won = lost = matches = 0
    for sets_won, sets_lost in games:
        matches += 1
        won += sets_won
        lost += sets_lost
        if sets_won > sets_lost:
            wins += 1
        else:
            losses += 1
    return TennisRecord(subject_id, matches, wins, losses, won, lost, bonus, form, rating)


def tennis_order(record: TennisRecord) -> tuple:
    """The metric (rating, or points under points cuts); ties go to fewer matches (as in RN14), then the id
    (interpretation)."""
    return (-record.metric, record.matches, record.subject_id)


@dataclass(frozen=True)
class RunRecord:
    """The marks of an athlete in one distance inside the window: how many, the best time (the metric; lower is
    better) and the first day it was run, which breaks ties between athletes with the same best time."""
    subject_id: int
    matches: int = 0
    best_s: int = 0
    achieved_on: date | None = None

    @property
    def metric(self) -> Decimal:
        return Decimal(self.best_s)


def run_order(record: RunRecord) -> tuple:
    """Best time first; the same time goes to who ran it first, then the id keeps the order stable."""
    return (record.best_s, record.achieved_on or date.max, record.subject_id)


# ----- Placement and tiers -----------------------------------------------------------------------------------

R = TypeVar('R', TeamRecord, IndividualRecord, TennisRecord, RunRecord)


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
    individual ranking, whose metric is the average, nor for running, whose metric is the best time). The recent
    form is empty in running, which has the day of the best mark instead."""
    record = placement.record
    return {
        'metric_value': placement.metric_value, 'matches_played': placement.matches_played,
        'rank_position': placement.rank_position, 'tier': placement.tier, 'calc_version': calc_version,
        'wins': getattr(record, 'wins', 0), 'draws': getattr(record, 'draws', 0),
        'losses': getattr(record, 'losses', 0),
        'goals_for': getattr(record, 'goals_for', getattr(record, 'sets_for', 0)),
        'goals_against': getattr(record, 'goals_against', getattr(record, 'sets_against', 0)),
        'recent_form': getattr(record, 'form', ''), 'best_mark_on': getattr(record, 'achieved_on', None),
    }

"""Invariant behind the Ranking screen: the tiers of a category are contiguous in `rank_position` (the best tier
first) and Lendário is a prefix, in the four orders of `services.scoring`, with the points cuts of version 1 and
the cuts of version 2 (teams and tennis ranked by the replayed rating, the individual ranking by the adjusted mean). The position inside a tier and the
windows of the Ranking screen (`services.ranking_views`) depend on it."""
import random
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.models.rankings import TIERS
from app.services.rankings import Cuts
from app.services.scoring import (
    RatedMatch,
    RunRecord,
    individual_order,
    individual_points,
    individual_record,
    rank_records,
    replay_ratings,
    run_order,
    team_order,
    team_record,
    tennis_order,
    tennis_record,
)

SHARE = Decimal('0.15')
CUTS = {
    'team': (Cuts('futebol_time', 'pontos', 'maior', Decimal(6), Decimal(12), Decimal(18), 3, SHARE, 52), team_order),
    'individual': (Cuts('futebol_individual', 'media', 'maior', Decimal('6.0'), Decimal('7.5'), Decimal('9.0'), 3,
                        SHARE, 52), individual_order),
    'tennis': (Cuts('tenis', 'pontos', 'maior', Decimal(30), Decimal(60), Decimal(90), 3, SHARE, 52), tennis_order),
    'run': (Cuts('corrida_5', 'tempo', 'menor', Decimal(1800), Decimal(1500), Decimal(1260), 1, SHARE, 52),
            run_order),
    # Version 2 (migration 0016): rating 1000, K 64 in placement and 32 afterwards, Prata 950, Ouro 1050, Diamante 1150.
    'team_rating': (Cuts('futebol_time', 'rating', 'maior', Decimal(950), Decimal(1050), Decimal(1150), 3, SHARE, 52,
                         Decimal(1000), Decimal(64), Decimal(32)), team_order),
    'tennis_rating': (Cuts('tenis', 'rating', 'maior', Decimal(950), Decimal(1050), Decimal(1150), 3, SHARE, 52,
                           Decimal(1000), Decimal(64), Decimal(32)), tennis_order),
    # Version 2 (migration 0017): the individual adjusted mean, m = 5 phantom matches at μ = 3.0 (cuts scaled to the
    # generated appearances, which score more than real ones).
    'individual_adjusted': (Cuts('futebol_individual', 'media', 'maior', Decimal('4.5'), Decimal('5.5'), Decimal('6.5'),
                                 3, SHARE, 52, prior_matches=Decimal(5), prior_mean=Decimal('3.0')), individual_order),
}
SEEDS = range(60)


def team_records(rng, count):
    return [team_record(i, [(rng.randint(0, 5), rng.randint(0, 5)) for _ in range(rng.randint(0, 12))])
            for i in range(1, count + 1)]


def individual_records(rng, count, *, prior: Cuts | None = None):
    def appearances():
        return [(rng.choice(('vitoria', 'empate', 'derrota')),
                 individual_points(outcome=rng.choice(('vitoria', 'empate', 'derrota')), goals=rng.randint(0, 4),
                                   assists=rng.randint(0, 3), position_stat=rng.randint(0, 8)))
                for _ in range(rng.randint(0, 10))]
    return [individual_record(i, appearances(), prior_matches=prior and prior.prior_matches,
                              prior_mean=prior and prior.prior_mean) for i in range(1, count + 1)]


def adjusted_records(rng, count):
    return individual_records(rng, count, prior=CUTS['individual_adjusted'][0])


def tennis_records(rng, count):
    return [tennis_record(i, [(rng.randint(0, 2), rng.randint(0, 2)) for _ in range(rng.randint(0, 20))],
                          bonus=rng.choice((0, 0, 10, 20, 40))) for i in range(1, count + 1)]


def run_records(rng, count):
    return [RunRecord(i, rng.randint(1, 5), rng.randint(1100, 2100), date(2026, 1, 1) + timedelta(days=rng.randint(0, 200)))
            for i in range(1, count + 1)]


def rated_matches(rng, count, *, draws):
    """Random matches between `count` subjects of hidden strengths (the stronger one wins more often), so the
    replayed ratings spread over every tier."""
    strength = {subject: rng.random() for subject in range(1, count + 1)}
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    matches = []
    for number in range(1, rng.randint(0, count * 8) + 1):
        a, b = rng.sample(range(1, count + 1), 2) if count > 1 else (1, None)
        chance = 0.5 + (strength[a] - strength.get(b, 0.5)) * 0.9
        roll = rng.random()
        score = (1, 1) if draws and abs(roll - chance) < 0.05 else (2, 0) if roll < chance else (0, 2)
        matches.append(RatedMatch(start + timedelta(hours=rng.randint(0, 5000)), number, a, b, *score))
    return matches


def rating_records(build, *, draws):
    def records(rng, count):
        matches = rated_matches(rng, count, draws=draws)
        cuts = CUTS['team_rating' if draws else 'tennis_rating'][0]
        ratings = replay_ratings(matches, cuts, draws=draws)
        games: dict[int, list[tuple[int, int]]] = {}
        for match in matches:
            games.setdefault(match.side_a, []).append((match.score_a, match.score_b))
            if match.side_b is not None:
                games.setdefault(match.side_b, []).append((match.score_b, match.score_a))
        return [build(subject, items, rating=ratings[subject]) for subject, items in games.items()]
    return records


RECORDS = {'team': team_records, 'individual': individual_records, 'tennis': tennis_records, 'run': run_records,
           'team_rating': rating_records(team_record, draws=True),
           'tennis_rating': rating_records(tennis_record, draws=False), 'individual_adjusted': adjusted_records}


@pytest.mark.parametrize('kind', RECORDS)
def test_tiers_are_contiguous_and_lendario_is_a_prefix(kind):
    cuts, order = CUTS[kind]
    seen: set[str] = set()
    for seed in SEEDS:
        rng = random.Random(f'{kind}-{seed}')
        placements = rank_records(RECORDS[kind](rng, rng.randint(1, 90)), cuts=cuts, order=order)
        ranked = sorted((item for item in placements if item.rank_position is not None),
                        key=lambda item: item.rank_position)
        assert [item.rank_position for item in ranked] == list(range(1, len(ranked) + 1))
        levels = [TIERS.index(item.tier) for item in ranked]
        assert levels == sorted(levels, reverse=True), (kind, seed)          # the tier never goes up along the list
        legends = [item.rank_position for item in ranked if item.tier == 'lendario']
        assert legends == list(range(1, len(legends) + 1))
        seen.update(item.tier for item in ranked)
        # Placement subjects keep no position and no tier.
        assert all(item.tier is None for item in placements if item.rank_position is None)
    assert seen == set(TIERS)       # the generated data reaches every tier, Lendário included

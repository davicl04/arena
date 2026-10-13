"""Invariant behind the Ranking screen: the tiers of a category are contiguous in `rank_position` (the best tier
first) and Lendário is a prefix, in the four orders of `services.scoring`. The position inside a tier and the
windows of the Ranking screen (`services.ranking_views`) depend on it."""
import random
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models.rankings import TIERS
from app.services.rankings import Cuts
from app.services.scoring import (
    RunRecord,
    individual_order,
    individual_points,
    individual_record,
    rank_records,
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
}
SEEDS = range(60)


def team_records(rng, count):
    return [team_record(i, [(rng.randint(0, 5), rng.randint(0, 5)) for _ in range(rng.randint(0, 12))])
            for i in range(1, count + 1)]


def individual_records(rng, count):
    def appearances():
        return [(rng.choice(('vitoria', 'empate', 'derrota')),
                 individual_points(outcome=rng.choice(('vitoria', 'empate', 'derrota')), goals=rng.randint(0, 4),
                                   assists=rng.randint(0, 3), position_stat=rng.randint(0, 8)))
                for _ in range(rng.randint(0, 10))]
    return [individual_record(i, appearances()) for i in range(1, count + 1)]


def tennis_records(rng, count):
    return [tennis_record(i, [(rng.randint(0, 2), rng.randint(0, 2)) for _ in range(rng.randint(0, 20))],
                          bonus=rng.choice((0, 0, 10, 20, 40))) for i in range(1, count + 1)]


def run_records(rng, count):
    return [RunRecord(i, rng.randint(1, 5), rng.randint(1100, 2100), date(2026, 1, 1) + timedelta(days=rng.randint(0, 200)))
            for i in range(1, count + 1)]


RECORDS = {'team': team_records, 'individual': individual_records, 'tennis': tennis_records, 'run': run_records}


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

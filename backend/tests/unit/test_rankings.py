import importlib.util
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.models.rankings import RANKINGS, TIERS
from app.services import rankings
from app.services.rankings import (
    Cuts,
    base_tier,
    can_face,
    faced_tiers,
    legend_slots,
    ranking_key,
    standing_line,
    tier_for,
)

MIGRATION = Path(__file__).resolve().parents[2] / 'migrations' / 'versions' / '0005_teams_organizers_rankings.py'


def migration_cuts() -> dict[str, Cuts]:
    spec = importlib.util.spec_from_file_location('migration_0005', MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return {ranking: Cuts(ranking, metric, direction, Decimal(str(prata)), Decimal(str(ouro)), Decimal(str(diamante)),
                          placement, Decimal(str(module.LEGEND_SHARE)), module.WINDOW_WEEKS)
            for ranking, metric, direction, prata, ouro, diamante, placement in module.CUTS_V1}


CUTS = migration_cuts()


def test_migration_seeds_every_ranking_with_plan_parameters():
    assert set(CUTS) == set(RANKINGS)
    assert all(cut.legend_share == Decimal('0.15') and cut.window_weeks == 52 for cut in CUTS.values())
    assert {name: cut.placement_matches for name, cut in CUTS.items() if not name.startswith('corrida')} == {
        'futebol_time': 3, 'futebol_individual': 3, 'tenis': 3}
    assert all(cut.placement_matches == 1 and cut.metric == 'tempo' and cut.direction == 'menor'
               for name, cut in CUTS.items() if name.startswith('corrida'))


@pytest.mark.parametrize(('ranking', 'value', 'expected'), [
    ('futebol_time', 0, 'bronze'), ('futebol_time', 9, 'bronze'), ('futebol_time', 10, 'prata'),
    ('futebol_time', 29, 'prata'), ('futebol_time', 30, 'ouro'), ('futebol_time', 59, 'ouro'),
    ('futebol_time', 60, 'diamante'), ('futebol_time', 250, 'diamante'),
    ('futebol_individual', 2.49, 'bronze'), ('futebol_individual', 2.5, 'prata'), ('futebol_individual', 3.95, 'prata'),
    ('futebol_individual', 4.0, 'ouro'), ('futebol_individual', 5.49, 'ouro'), ('futebol_individual', 5.5, 'diamante'),
    ('tenis', 29, 'bronze'), ('tenis', 30, 'prata'), ('tenis', 80, 'ouro'), ('tenis', 149, 'ouro'),
    ('tenis', 150, 'diamante'),
    ('corrida_3', 20 * 60 + 1, 'bronze'), ('corrida_3', 20 * 60, 'prata'), ('corrida_3', 15 * 60, 'ouro'),
    ('corrida_3', 12 * 60, 'diamante'),
    ('corrida_5', 35 * 60 + 1, 'bronze'), ('corrida_5', 24 * 60 + 12, 'ouro'), ('corrida_5', 22 * 60, 'diamante'),
    ('corrida_10', 75 * 60, 'prata'), ('corrida_10', 57 * 60, 'ouro'), ('corrida_10', 47 * 60, 'diamante'),
    ('corrida_21', 2 * 3600 + 45 * 60 + 1, 'bronze'), ('corrida_21', 2 * 3600 + 5 * 60, 'ouro'),
    ('corrida_21', 3600 + 45 * 60, 'diamante'),
    ('corrida_42', 5 * 3600 + 45 * 60, 'prata'), ('corrida_42', 4 * 3600 + 20 * 60, 'ouro'),
    ('corrida_42', 3 * 3600 + 40 * 60, 'diamante'), ('corrida_42', 6 * 3600, 'bronze'),
])
def test_fixed_cuts_map_values_to_tiers_up_to_diamante(ranking, value, expected):
    assert base_tier(value, CUTS[ranking]) == expected


@pytest.mark.parametrize(('classified', 'slots'), [(0, 0), (6, 0), (7, 1), (13, 1), (14, 2), (20, 3), (100, 15)])
def test_legend_slots_round_down(classified, slots):
    assert legend_slots(classified, Decimal('0.15')) == slots


def test_legendary_needs_diamante_points_and_a_top_share_place():
    cuts = CUTS['futebol_time']
    assert tier_for(60, cuts, rank_position=1, classified_count=7) == 'lendario'
    assert tier_for(60, cuts, rank_position=2, classified_count=7) == 'diamante'
    assert tier_for(60, cuts, rank_position=1, classified_count=6) == 'diamante'
    assert tier_for(59, cuts, rank_position=1, classified_count=100) == 'ouro'
    assert tier_for(12 * 60, CUTS['corrida_3'], rank_position=3, classified_count=20) == 'lendario'


@pytest.mark.parametrize(('tier', 'faced'), [
    (None, list(TIERS)), ('bronze', ['bronze', 'prata']), ('prata', ['bronze', 'prata', 'ouro']),
    ('ouro', ['prata', 'ouro', 'diamante']), ('lendario', ['diamante', 'lendario']),
])
def test_faced_range_is_same_or_neighbouring_tier(tier, faced):
    assert faced_tiers(tier) == faced


def test_pairing_compatibility_accepts_neighbours_and_unranked():
    assert can_face('prata', 'bronze') and can_face('prata', 'ouro') and can_face('prata', 'prata')
    assert not can_face('bronze', 'ouro') and not can_face('lendario', 'ouro')
    assert can_face(None, 'lendario') and can_face('bronze', None) and can_face(None, None)


def test_ranking_keys_by_category():
    assert ranking_key('futebol', team=True) == 'futebol_time'
    assert ranking_key('futebol') == 'futebol_individual'
    assert ranking_key('tenis') == 'tenis'
    assert ranking_key('corrida', distance_km=21) == 'corrida_21'
    for invalid in ({'sport': 'corrida', 'distance_km': 7}, {'sport': 'tenis', 'team': True}, {'sport': 'xadrez'}):
        with pytest.raises(ValueError):
            ranking_key(**invalid)


def standing(**values):
    return SimpleNamespace(**({'matches_played': 0, 'tier': None, 'rank_position': None,
                               'metric_value': Decimal('0')} | values))


def test_standing_line_never_assigns_a_tier_during_placement():
    empty = standing_line(None, 3)
    assert empty == {'state': 'sem_jogos', 'tier': None, 'played': 0, 'required': 3, 'rank_position': None,
                     'metric_value': None, 'faces': list(TIERS), 'faces_any_level': True}
    assert standing_line(None, 1, running=True)['state'] == 'sem_marca'
    placing = standing_line(standing(matches_played=2, metric_value=Decimal('4')), 3)
    assert (placing['state'], placing['played'], placing['tier'], placing['metric_value']) == ('classificacao', 2, None, 4.0)
    ranked = standing_line(standing(matches_played=9, tier='prata', rank_position=4, metric_value=Decimal('17')), 3)
    assert ranked['state'] == 'ranqueado' and ranked['played'] == 9 and ranked['rank_position'] == 4
    assert ranked['faces'] == ['bronze', 'prata', 'ouro'] and ranked['faces_any_level'] is False


def test_team_format_grid_fills_every_format_and_uses_one_query():
    db = Mock()
    db.scalars.return_value.all.return_value = [SimpleNamespace(
        team_id=7, format='society', matches_played=1, tier=None, rank_position=None, metric_value=Decimal('3'))]
    grid = rankings.team_format_grid(db, [7, 8, 7], cuts=CUTS)
    assert list(grid) == [7, 8]
    assert [(item.format, item.state, item.played) for item in grid[7]] == [
        ('futsal', 'sem_jogos', 0), ('society', 'classificacao', 1), ('campo', 'sem_jogos', 0)]
    assert all(item.state == 'sem_jogos' and item.required == 3 for item in grid[8])
    assert db.scalars.call_count == 1
    assert rankings.team_format_grid(db, []) == {}

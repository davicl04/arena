import importlib.util
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.models.rankings import RANKINGS, TIERS
from app.services import rankings
from app.services.rankings import (
    CURRENT_CALC_VERSION,
    DEFAULT_INITIAL_RATING,
    Cuts,
    base_tier,
    can_face,
    faced_tiers,
    hides_placement_metric,
    initial_rating,
    legend_slots,
    ranking_key,
    standing_line,
    tier_for,
)

VERSIONS = Path(__file__).resolve().parents[2] / 'migrations' / 'versions'
MIGRATION = VERSIONS / '0005_teams_organizers_rankings.py'


def load_migration(path: Path):
    spec = importlib.util.spec_from_file_location(f'migration_{path.stem}', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def migration_cuts() -> dict[str, Cuts]:
    module = load_migration(MIGRATION)
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


# ----- Rating rankings (calc_version 2) -----------------------------------------------------------------------

RATING = {ranking: Cuts(ranking, 'rating', 'maior', Decimal(950), Decimal(1050), Decimal(1150), 3, Decimal('0.15'), 52,
                        Decimal(1000), Decimal(64), Decimal(32)) for ranking in ('futebol_time', 'tenis')}


def test_migration_0016_seeds_the_rating_parameters_of_version_2():
    module = load_migration(VERSIONS / '0016_ranking_rating.py')
    assert CURRENT_CALC_VERSION == 2 and module.down_revision == '0015'
    assert module.RATING_RANKINGS == ('futebol_time', 'tenis')
    assert (module.INITIAL_RATING, module.PLACEMENT_K, module.REGULAR_K) == (1000, 64, 32)
    assert module.RATING_CUTS == {'prata': 950, 'ouro': 1050, 'diamante': 1150}
    # Three wins against equals with these cuts reach Ouro, never Bronze (test_scoring has the replay).
    assert base_tier(Decimal('1087.494'), RATING['futebol_time']) == 'ouro'
    assert base_tier(Decimal('912.506'), RATING['tenis']) == 'bronze'
    assert base_tier(Decimal(950), RATING['tenis']) == 'prata' and base_tier(Decimal(1150), RATING['tenis']) == 'diamante'


def test_migration_0017_completes_the_adjusted_mean_of_the_individual_ranking():
    module = load_migration(VERSIONS / '0017_individual_adjusted_mean.py')
    assert (module.revision, module.down_revision, module.RANKING) == ('0017', '0016', 'futebol_individual')
    assert (module.PRIOR_MATCHES, module.PRIOR_MEAN) == (Decimal(5), Decimal('3.0'))
    assert module.ADJUSTED_CUTS == {'prata': Decimal('2.6'), 'ouro': Decimal('3.9'), 'diamante': Decimal('5.2')}
    # The cuts keep the order the table requires, and the version 1 ones (migration 0005) stay as they were.
    assert module.ADJUSTED_CUTS['prata'] < module.ADJUSTED_CUTS['ouro'] < module.ADJUSTED_CUTS['diamante']
    assert (CUTS['futebol_individual'].prata, CUTS['futebol_individual'].diamante) == (Decimal('2.5'), Decimal('5.5'))


def test_load_cuts_reads_the_adjusted_mean_parameters():
    row = SimpleNamespace(ranking='futebol_individual', metric='media', direction='maior', prata=Decimal('2.60'),
                          ouro=Decimal('3.90'), diamante=Decimal('5.20'), placement_matches=3,
                          legend_share=Decimal('0.150'), window_weeks=52, initial_rating=None, placement_k=None,
                          regular_k=None, prior_matches=Decimal('5.00'), prior_mean=Decimal('3.000'))
    db = Mock()
    db.scalars.return_value.all.return_value = [row]
    cut = rankings.load_cuts(db, 2)['futebol_individual']
    assert (cut.prior_matches, cut.prior_mean, cut.diamante, cut.is_rating) == (
        Decimal(5), Decimal(3), Decimal('5.2'), False)
    # The individual line keeps its metric in placement (it is not a rating).
    assert not hides_placement_metric({'futebol_individual': cut}, 'futebol_individual')


def test_the_initial_rating_comes_from_the_cuts():
    assert initial_rating(RATING['tenis']) == Decimal(1000)
    assert initial_rating(Cuts('tenis', 'rating', 'maior', Decimal(1), Decimal(2), Decimal(3), 3, Decimal('0.15'), 52,
                               Decimal(1200), Decimal(64), Decimal(32))) == Decimal(1200)
    assert initial_rating(None) == initial_rating(CUTS['tenis']) == DEFAULT_INITIAL_RATING == Decimal(1000)
    assert RATING['tenis'].is_rating and not CUTS['tenis'].is_rating
    assert hides_placement_metric(RATING, 'tenis') and not hides_placement_metric(CUTS, 'tenis')
    assert not hides_placement_metric({}, 'futebol_time')


def test_a_rating_line_hides_the_rating_while_in_placement():
    placing = standing(matches_played=2, metric_value=Decimal('1061.050'))
    assert standing_line(placing, 3, rating=True)['metric_value'] is None
    assert standing_line(placing, 3)['metric_value'] == 1061.05                 # average and points keep it
    ranked = standing(matches_played=3, tier='ouro', rank_position=1, metric_value=Decimal('1087.494'))
    assert standing_line(ranked, 3, rating=True)['metric_value'] == 1087.494
    assert standing_line(None, 3, rating=True)['metric_value'] is None


def test_the_team_format_grid_hides_the_rating_of_a_format_in_placement():
    db = Mock()
    db.scalars.return_value.all.return_value = [
        SimpleNamespace(team_id=7, format='society', matches_played=2, tier=None, rank_position=None,
                        metric_value=Decimal('1061.05')),
        SimpleNamespace(team_id=7, format='campo', matches_played=3, tier='ouro', rank_position=2,
                        metric_value=Decimal('1087.494'))]
    grid = rankings.team_format_grid(db, [7], cuts={**CUTS, **RATING})
    assert [(item.format, item.state, item.metric_value) for item in grid[7]] == [
        ('futsal', 'sem_jogos', None), ('society', 'classificacao', None), ('campo', 'ranqueado', 1087.494)]


def test_load_cuts_reads_the_versioned_parameters():
    row = SimpleNamespace(ranking='tenis', metric='rating', direction='maior', prata=950, ouro=1050, diamante=1150,
                          placement_matches=3, legend_share=Decimal('0.150'), window_weeks=52,
                          initial_rating=Decimal('1000.000'), placement_k=Decimal('64.00'), regular_k=Decimal('32.00'),
                          prior_matches=None, prior_mean=None)
    db = Mock()
    db.scalars.return_value.all.return_value = [row]
    assert rankings.load_cuts(db, 2) == {'tenis': RATING['tenis']}

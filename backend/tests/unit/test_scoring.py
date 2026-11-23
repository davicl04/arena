"""Points and rankings (stage 3): RN11, RN12, RN14, RN16, the 52-week window, classification and tiers, and the
rating of teams and tennis (calc_version 2, decision 0006). The points cuts below are the version 1 ones: under them
the records still rank by points (the rollback path)."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.services.rankings import Cuts, base_tier
from app.services.scoring import (
    IndividualPoints,
    IndividualRecord,
    RatedBonus,
    RatedMatch,
    RunRecord,
    TeamRecord,
    TennisRecord,
    adjusted_mean,
    expected_score,
    in_window,
    individual_order,
    individual_points,
    individual_record,
    is_classified,
    k_factor,
    outcome_for,
    position_stat_points,
    rank_records,
    recent_form,
    replay_ratings,
    run_order,
    score_outcome,
    standing_fields,
    team_order,
    team_points,
    team_record,
    tennis_order,
    tennis_points,
    tennis_record,
    updated_rating,
    weighted_bonus,
    window_start,
)

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
TEAM_CUTS = Cuts('futebol_time', 'pontos', 'maior', Decimal(10), Decimal(30), Decimal(60), 3, Decimal('0.15'), 52)
INDIVIDUAL_CUTS = Cuts('futebol_individual', 'media', 'maior', Decimal('2.5'), Decimal('4.0'), Decimal('5.5'), 3,
                       Decimal('0.15'), 52)
TENNIS_CUTS = Cuts('tenis', 'pontos', 'maior', Decimal(30), Decimal(80), Decimal(150), 3, Decimal('0.15'), 52)
# The calc_version 2 rows of migration 0016 for futebol_time and tenis.
RATING_PARAMETERS = (Decimal(1000), Decimal(64), Decimal(32))
RATING_CUTS = Cuts('futebol_time', 'rating', 'maior', Decimal(950), Decimal(1050), Decimal(1150), 3, Decimal('0.15'),
                   52, *RATING_PARAMETERS)
TENNIS_RATING_CUTS = Cuts('tenis', 'rating', 'maior', Decimal(950), Decimal(1050), Decimal(1150), 3, Decimal('0.15'),
                          52, *RATING_PARAMETERS)
# The calc_version 2 row of futebol_individual (migration 0017): adjusted mean with m = 5 and μ = 3.0.
ADJUSTED_CUTS = Cuts('futebol_individual', 'media', 'maior', Decimal('2.6'), Decimal('3.9'), Decimal('5.2'), 3,
                     Decimal('0.15'), 52, prior_matches=Decimal(5), prior_mean=Decimal('3.0'))
PRIOR = {'prior_matches': Decimal(5), 'prior_mean': Decimal('3.0')}


def test_outcomes_and_result_points():
    assert outcome_for('a', 'a') == 'vitoria' and outcome_for('b', 'a') == 'derrota'
    assert outcome_for('a', None) == 'empate'
    with pytest.raises(ValueError):
        outcome_for('c', 'a')
    assert [team_points(item) for item in ('vitoria', 'empate', 'derrota')] == [3, 1, 0]
    assert tennis_points('vitoria') == 10 and tennis_points('derrota') == 0
    with pytest.raises(ValueError):
        tennis_points('empate')


def test_position_stat_is_half_a_point_up_to_four():
    assert position_stat_points(None) == 0 and position_stat_points(3) == Decimal('1.5')
    assert position_stat_points(8) == 4 and position_stat_points(20) == 4


def test_individual_points_of_the_prototype_preview():
    # "1 presença + 3 vitória + 0 gols + 1 assist. + 1,5 (passes decisivos, até 4)" = 6,5.
    points = individual_points(outcome='vitoria', goals=0, assists=1, position_stat=3)
    assert points == IndividualPoints(Decimal(1), Decimal(3), Decimal(0), Decimal(1), Decimal('1.5'))
    assert points.total == Decimal('6.5')
    # Empty fields neither add nor subtract; a draw is 1, a loss 0.
    assert individual_points(outcome='empate').total == 2
    assert individual_points(outcome='derrota', goals=None, assists=None, position_stat=None).total == 1
    # Before the score is known (preview), the result share is 0.
    assert individual_points(outcome=None, goals=2).total == 3


def test_only_counted_stat_items_score():
    full = dict(outcome='vitoria', goals=2, assists=1, position_stat=10)
    assert individual_points(**full).total == Decimal(1 + 3 + 2 + 1 + 4)
    assert individual_points(**full, counted=frozenset({'assistencias'})).total == Decimal(1 + 3 + 1)
    assert individual_points(**full, counted=()).total == 4


def test_window_of_52_weeks_and_classification():
    assert window_start(NOW) == NOW - timedelta(weeks=52)
    assert in_window(NOW - timedelta(weeks=52), NOW) and in_window(NOW, NOW)
    assert not in_window(NOW - timedelta(weeks=52, seconds=1), NOW)
    assert not in_window(NOW + timedelta(minutes=1), NOW)
    assert not is_classified(2, 3) and is_classified(3, 3)


def test_team_record_and_rn14_tie_breaks():
    record = team_record(7, [(3, 1), (2, 2), (0, 1), (4, 0)])
    assert record == TeamRecord(7, matches=4, wins=2, draws=1, losses=1, goals_for=9, goals_against=4)
    assert (record.points, record.goal_difference, record.metric) == (7, 5, Decimal(7))
    # Points, then goal difference, goals scored, fewer matches and the id.
    tied = [TeamRecord(1, 3, 2, 0, 1, 5, 4), TeamRecord(2, 3, 2, 0, 1, 6, 3), TeamRecord(3, 3, 2, 0, 1, 7, 4),
            TeamRecord(4, 4, 1, 3, 0, 7, 4), TeamRecord(5, 5, 2, 0, 3, 7, 4), TeamRecord(6, 3, 3, 0, 0, 3, 0)]
    assert [item.subject_id for item in sorted(tied, key=team_order)] == [6, 3, 4, 5, 2, 1]


def test_individual_record_averages_per_match():
    games = [('vitoria', individual_points(outcome='vitoria', goals=1)),
             ('derrota', individual_points(outcome='derrota')),
             ('empate', individual_points(outcome='empate', assists=2))]
    record = individual_record(9, games)
    # 5 (1 + 3 + 1 goal) + 1 (presence) + 4 (1 + 1 + 2 assists) = 10 in 3 matches.
    assert (record.matches, record.total, record.wins, record.draws, record.losses) == (3, Decimal(10), 1, 1, 1)
    assert record.average == Decimal('3.333') and record.metric == Decimal('3.333')
    assert IndividualRecord(1, 3, Decimal(11)).average == Decimal('3.667')
    assert IndividualRecord(1).average == 0
    ordered = sorted([IndividualRecord(1, 3, Decimal(9)), IndividualRecord(2, 4, Decimal(12)),
                      IndividualRecord(3, 3, Decimal(12))], key=individual_order)
    assert [item.subject_id for item in ordered] == [3, 2, 1]


# ----- Adjusted mean (futebol · individual, calc_version 2) -----------------------------------------------------

def test_the_adjusted_mean_adds_m_phantom_matches_at_the_reference_mean():
    # (total + m × μ) / (matches + m), rounded to 3 places.
    assert adjusted_mean(Decimal(21), 3, Decimal(5), Decimal('3.0')) == Decimal('4.500')     # (21 + 15) / 8
    assert adjusted_mean(Decimal(4), 1, Decimal(5), Decimal('3.0')) == Decimal('3.167')      # (4 + 15) / 6
    assert adjusted_mean(Decimal('2.5'), 2, Decimal('2.5'), Decimal(4)) == Decimal('2.778')  # m and μ may be fractional
    assert adjusted_mean(0, 0, Decimal(5), Decimal('3.0')) == Decimal('3.000')               # no match: the reference
    # A small sample stays close to μ; the adjusted mean converges to the real average as the athlete plays.
    gaps = [abs(Decimal(7) - adjusted_mean(Decimal(7) * n, n, Decimal(5), Decimal('3.0'))) for n in (3, 10, 30, 300)]
    assert gaps == sorted(gaps, reverse=True) and gaps[0] == Decimal('2.500') and gaps[-1] < Decimal('0.07')
    assert adjusted_mean(Decimal(1) * 300, 300, Decimal(5), Decimal('3.0')) == Decimal('1.033')   # also from below


def test_without_m_and_mu_the_metric_is_the_plain_average():
    # Cuts of older versions (and the v1 rollback) have m and μ null: the plain average, 0 without matches.
    assert adjusted_mean(Decimal(10), 3, None, None) == Decimal('3.333')
    assert adjusted_mean(Decimal(10), 3, Decimal(5), None) == adjusted_mean(Decimal(10), 3, None, Decimal(3))
    assert adjusted_mean(0, 0, None, None) == 0
    plain = IndividualRecord(1, 3, Decimal(21))
    assert plain.metric == plain.average == Decimal('7.000')
    adjusted = IndividualRecord(1, 3, Decimal(21), **PRIOR)
    assert (adjusted.metric, adjusted.average) == (Decimal('4.500'), Decimal('7.000'))


def test_the_individual_record_carries_m_and_mu_without_changing_the_rn12_points():
    games = [('vitoria', individual_points(outcome='vitoria', goals=1)),
             ('derrota', individual_points(outcome='derrota')),
             ('empate', individual_points(outcome='empate', assists=2))]
    record = individual_record(9, games, form='VDE', **PRIOR)
    # The same 10 RN12 points in 3 matches: average 3.333, adjusted mean (10 + 15) / 8 = 3.125.
    assert (record.matches, record.total, record.wins, record.draws, record.losses, record.form) == (
        3, Decimal(10), 1, 1, 1, 'VDE')
    assert (record.average, record.metric) == (Decimal('3.333'), Decimal('3.125'))
    assert [individual_points(outcome=outcome, goals=goals, assists=assists).total
            for (outcome, _), goals, assists in zip(games, (1, 0, 0), (0, 0, 2))] == [5, 1, 4]


def test_the_individual_order_is_the_adjusted_mean_then_more_matches_then_the_id():
    records = [
        IndividualRecord(1, 3, Decimal(15), **PRIOR),     # average 5.0, adjusted (15 + 15) / 8 = 3.750
        IndividualRecord(2, 20, Decimal(90), **PRIOR),    # average 4.5, adjusted (90 + 15) / 25 = 4.200
        IndividualRecord(3, 5, Decimal(15), **PRIOR),     # adjusted 3.000 in 5 matches
        IndividualRecord(4, 10, Decimal(30), **PRIOR),    # adjusted 3.000 in 10 matches: more matches first
        IndividualRecord(6, 10, Decimal(30), **PRIOR),    # same metric and matches as 4: the id
    ]
    assert [item.subject_id for item in sorted(records, key=individual_order)] == [2, 1, 4, 6, 3]
    # The plain average would put the short excellent sample first.
    assert [item.subject_id for item in sorted([IndividualRecord(1, 3, Decimal(15)), IndividualRecord(2, 20, Decimal(90))],
                                               key=individual_order)] == [1, 2]


def test_three_exceptional_matches_do_not_reach_diamante():
    # Real average 7.0 in the 3 placement matches: 4.5 with the adjusted mean, Ouro; it was Diamante with the plain mean.
    exceptional = IndividualRecord(1, 3, Decimal(21), 3, 0, 0, **PRIOR)
    placed = rank_records([exceptional], cuts=ADJUSTED_CUTS, order=individual_order)[0]
    assert (placed.metric_value, placed.tier, placed.rank_position) == (Decimal('4.500'), 'ouro', 1)
    assert rank_records([IndividualRecord(1, 3, Decimal(21))], cuts=INDIVIDUAL_CUTS,
                        order=individual_order)[0].tier == 'diamante'
    # Diamante (5.2) needs a sample coherent with the cuts: 7 matches at 7.0, 4 at 8.0, 14 at 6.0; never at 5.2.
    def first_diamante(mean):
        return next((n for n in range(1, 301) if rank_records(
            [IndividualRecord(1, n, Decimal(mean) * n, **PRIOR)], cuts=ADJUSTED_CUTS,
            order=individual_order)[0].tier == 'diamante'), None)
    assert [first_diamante(mean) for mean in (7, 8, 6)] == [7, 4, 14]
    assert first_diamante(Decimal('5.2')) is None
    # The damping works from below too: a weak average reaches Bronze, more firmly as the sample grows.
    assert [adjusted_mean(Decimal(n), n, Decimal(5), Decimal('3.0')) for n in (3, 30)] == [Decimal('2.250'),
                                                                                          Decimal('1.286')]
    assert rank_records([IndividualRecord(1, 30, Decimal(30), **PRIOR)], cuts=ADJUSTED_CUTS,
                        order=individual_order)[0].tier == 'bronze'


def test_tennis_record_and_order():
    record = tennis_record(4, [(2, 0), (1, 2), (2, 1)], bonus=20)
    assert (record.wins, record.losses, record.sets_for, record.sets_against) == (2, 1, 5, 3)
    assert record.points == 40 and record.metric == Decimal(40)
    ordered = sorted([TennisRecord(1, 4, 3), TennisRecord(2, 3, 3), TennisRecord(3, 5, 4)], key=tennis_order)
    assert [item.subject_id for item in ordered] == [3, 2, 1]


def test_rank_records_classifies_after_three_matches_and_assigns_tiers():
    records = [team_record(1, [(1, 0)] * 20), team_record(2, [(1, 0)] * 12), team_record(3, [(1, 1)] * 3),
               team_record(4, [(1, 0)] * 2), team_record(5, [(0, 1)] * 4)]
    placements = {item.record.subject_id: item for item in rank_records(records, cuts=TEAM_CUTS, order=team_order)}
    assert [(placements[i].rank_position, placements[i].tier) for i in (1, 2, 3, 5)] == [
        (1, 'diamante'), (2, 'ouro'), (3, 'bronze'), (4, 'bronze')]
    # Two matches: still in placement, no position and never a tier.
    assert (placements[4].rank_position, placements[4].tier, placements[4].matches_played) == (None, None, 2)
    assert placements[1].metric_value == Decimal(60)


def test_lendario_needs_diamante_and_the_top_15_percent_rounded_down():
    # 7 classified: floor(7 × 0.15) = 1 place for Lendário.
    records = [team_record(subject, [(1, 0)] * wins + [(0, 1)] * 3) for subject, wins in
               ((1, 25), (2, 22), (3, 4), (4, 3), (5, 2), (6, 1), (7, 0))]
    placements = rank_records(records, cuts=TEAM_CUTS, order=team_order)
    assert [(item.record.subject_id, item.tier) for item in placements[:3]] == [
        (1, 'lendario'), (2, 'diamante'), (3, 'prata')]
    # 6 classified: nobody is Lendário, not even the best Diamante.
    placements = rank_records(records[:6], cuts=TEAM_CUTS, order=team_order)
    assert placements[0].tier == 'diamante'
    # The top place without Diamante points is not Lendário either.
    weak = [team_record(subject, [(0, 1)] * 3) for subject in range(1, 8)]
    assert rank_records(weak, cuts=TEAM_CUTS, order=team_order)[0].tier == 'bronze'


def test_individual_and_tennis_rankings_use_their_metric():
    individual = [IndividualRecord(1, 3, Decimal('16.5')), IndividualRecord(2, 5, Decimal(15)),
                  IndividualRecord(3, 1, Decimal(9))]
    placed = rank_records(individual, cuts=INDIVIDUAL_CUTS, order=individual_order)
    assert [(item.record.subject_id, item.rank_position, item.tier) for item in placed] == [
        (1, 1, 'diamante'), (2, 2, 'prata'), (3, None, None)]
    tennis = [tennis_record(1, [(2, 0)] * 8), tennis_record(2, [(0, 2)] * 3)]
    placed = rank_records(tennis, cuts=TENNIS_CUTS, order=tennis_order)
    assert [(item.metric_value, item.tier) for item in placed] == [(Decimal(80), 'ouro'), (Decimal(0), 'bronze')]
    assert rank_records([], cuts=TENNIS_CUTS, order=tennis_order) == []


def test_standing_fields_carry_the_record_and_the_calc_version():
    team = rank_records([team_record(1, [(2, 0), (1, 1), (0, 3)])], cuts=TEAM_CUTS, order=team_order)[0]
    assert standing_fields(team, calc_version=1) == {
        'metric_value': Decimal(4), 'matches_played': 3, 'rank_position': 1, 'tier': 'bronze', 'calc_version': 1,
        'wins': 1, 'draws': 1, 'losses': 1, 'goals_for': 3, 'goals_against': 4, 'recent_form': '',
        'best_mark_on': None}
    tennis = rank_records([tennis_record(2, [(2, 1)])], cuts=TENNIS_CUTS, order=tennis_order)[0]
    assert standing_fields(tennis, calc_version=2) == {
        'metric_value': Decimal(10), 'matches_played': 1, 'rank_position': None, 'tier': None, 'calc_version': 2,
        'wins': 1, 'draws': 0, 'losses': 0, 'goals_for': 2, 'goals_against': 1, 'recent_form': '',
        'best_mark_on': None}
    individual = rank_records([IndividualRecord(3, 3, Decimal(12), 2, 0, 1)], cuts=INDIVIDUAL_CUTS,
                              order=individual_order)[0]
    fields = standing_fields(individual, calc_version=1)
    assert (fields['metric_value'], fields['tier'], fields['goals_for'], fields['wins']) == (
        Decimal('4.000'), 'ouro', 0, 2)


# ----- Recent form (Ranking screen) ---------------------------------------------------------------------------

def test_recent_form_keeps_the_last_five_oldest_first_by_start_then_id():
    day = datetime(2026, 9, 1, 20, 0, tzinfo=timezone.utc)
    shuffled = [(day + timedelta(days=4), 7, 'vitoria'), (day, 1, 'derrota'), (day + timedelta(days=2), 3, 'empate'),
                (day + timedelta(days=1), 2, 'vitoria'), (day + timedelta(days=5), 9, 'derrota'),
                (day + timedelta(days=3), 5, 'vitoria'), (day + timedelta(days=4), 6, 'empate')]
    # In order: D V E V E V D. The two oldest leave; the two of the same start are ordered by match id (6, then 7).
    assert recent_form(shuffled) == 'EVEVD'
    assert recent_form(shuffled, limit=2) == 'VD' and recent_form(shuffled, limit=0) == ''
    assert recent_form(shuffled[:2]) == 'DV'                    # fewer than five: only the ones that exist
    assert recent_form([]) == ''


def test_a_tennis_score_has_no_draw_in_the_form():
    assert [score_outcome(2, 1), score_outcome(1, 1), score_outcome(0, 3)] == ['vitoria', 'empate', 'derrota']
    assert [score_outcome(2, 1, draws=False), score_outcome(1, 1, draws=False)] == ['vitoria', 'derrota']


def test_the_form_and_the_best_mark_day_are_standing_columns():
    cuts = Cuts('futebol_time', 'pontos', 'maior', Decimal(10), Decimal(30), Decimal(60), 3, Decimal('0.15'), 52)
    [placement] = rank_records([team_record(1, [(1, 0)] * 3, form='VVV')], cuts=cuts, order=team_order)
    fields = standing_fields(placement, calc_version=1)
    assert (fields['recent_form'], fields['best_mark_on']) == ('VVV', None)
    run_cuts = Cuts('corrida_5', 'tempo', 'menor', Decimal(1800), Decimal(1500), Decimal(1260), 1, Decimal('0.15'), 52)
    [mark] = rank_records([RunRecord(1, 2, 1400, date(2026, 9, 3))], cuts=run_cuts, order=run_order)
    fields = standing_fields(mark, calc_version=1)
    assert (fields['recent_form'], fields['best_mark_on']) == ('', date(2026, 9, 3))


# ----- Rating (calc_version 2) ----------------------------------------------------------------------------------

def duel(number, a, b, score_a, score_b, *, day=None):
    """A counted match `number` between subjects `a` and `b`, one day apart from the previous ones by default."""
    return RatedMatch(NOW - timedelta(days=200 - (number if day is None else day)), number, a, b, score_a, score_b)


def test_expected_score_is_symmetric_and_follows_the_400_point_scale():
    assert expected_score(Decimal(1000), Decimal(1000)) == Decimal('0.5')
    for left, right in ((Decimal(1000), Decimal(1100)), (Decimal('987.654'), Decimal(1234)), (Decimal(1500), Decimal(800))):
        assert abs(expected_score(left, right) + expected_score(right, left) - 1) < Decimal('1e-20')
    # 400 points ahead: E = 1 / (1 + 10^-1) = 10/11.
    assert abs(expected_score(Decimal(1400), Decimal(1000)) - Decimal(10) / Decimal(11)) < Decimal('1e-20')
    assert expected_score(Decimal(900), Decimal(1000)) < Decimal('0.5') < expected_score(Decimal(1100), Decimal(1000))


def test_rating_update_is_zero_sum_between_equals_and_a_draw_is_half_a_win():
    assert updated_rating(Decimal(1000), Decimal(1000), Decimal(1), Decimal(32)) == Decimal('1016.000')
    assert updated_rating(Decimal(1000), Decimal(1000), Decimal(0), Decimal(32)) == Decimal('984.000')
    assert updated_rating(Decimal(1000), Decimal(1000), Decimal('0.5'), Decimal(64)) == Decimal('1000.000')
    # Against a stronger side a draw gains and a weaker side loses the same amount.
    gain = updated_rating(Decimal(1000), Decimal(1200), Decimal('0.5'), Decimal(32)) - 1000
    loss = updated_rating(Decimal(1200), Decimal(1000), Decimal('0.5'), Decimal(32)) - 1200
    assert gain > 0 and gain == -loss
    # Rounded to three places at every step.
    assert updated_rating(Decimal(1000), Decimal(1200), Decimal(1), Decimal(32)) == Decimal('1024.312')
    assert updated_rating(Decimal(1000), Decimal(1200), Decimal(1), Decimal(32)).as_tuple().exponent == -3


def test_beating_a_stronger_side_yields_more_and_losing_to_a_weaker_one_costs_more():
    k = Decimal(64)
    assert updated_rating(Decimal(1000), Decimal(1100), Decimal(1), k) > updated_rating(Decimal(1000), Decimal(900),
                                                                                         Decimal(1), k)
    assert updated_rating(Decimal(1000), Decimal(900), Decimal(0), k) < updated_rating(Decimal(1000), Decimal(1100),
                                                                                       Decimal(0), k)
    # In a replay: 10 won three matches and 20 lost three before; beating 10 is worth more than beating 20.
    history = [duel(1, 10, 11, 1, 0), duel(2, 10, 12, 1, 0), duel(3, 10, 13, 1, 0),
               duel(4, 20, 21, 0, 1), duel(5, 20, 22, 0, 1), duel(6, 20, 23, 0, 1)]
    ratings = replay_ratings([*history, duel(7, 1, 10, 2, 1), duel(8, 2, 20, 2, 1)], RATING_CUTS)
    assert ratings[1] > ratings[2] > Decimal(1000)


def test_k_is_larger_in_the_placement_matches_of_the_subject():
    assert [k_factor(played, RATING_CUTS) for played in range(5)] == [Decimal(64)] * 3 + [Decimal(32)] * 2
    with pytest.raises(ValueError):
        k_factor(0, TEAM_CUTS)
    with pytest.raises(ValueError):
        replay_ratings([duel(1, 1, 2, 1, 0)], TEAM_CUTS)
    # The fourth win of a subject against a fresh opponent uses K = 32: 32 × (1 - E), not 64 × (1 - E).
    ratings = replay_ratings([duel(n, 1, 100 + n, 1, 0) for n in range(1, 5)], RATING_CUTS)
    third = replay_ratings([duel(n, 1, 100 + n, 1, 0) for n in range(1, 4)], RATING_CUTS)[1]
    assert ratings[1] == updated_rating(third, Decimal(1000), Decimal(1), Decimal(32))
    # Each side has its own K: the newcomer (placement) moves more than the veteran it beats.
    veteran = [duel(n, 7, 200 + n, 1, 1) for n in range(1, 4)]
    after = replay_ratings([*veteran, duel(10, 8, 7, 1, 0)], RATING_CUTS)
    assert after[8] - 1000 == Decimal(32) and 1000 - after[7] == Decimal(16)


@pytest.mark.parametrize(('results', 'rating', 'tier'), [
    ('VVV', Decimal('1087.494'), 'ouro'),
    ('VVD', Decimal('1023.494'), 'prata'), ('VDV', Decimal('1029.332'), 'prata'), ('DVV', Decimal('1034.668'), 'prata'),
    ('VDD', Decimal('965.332'), 'prata'), ('DVD', Decimal('970.668'), 'prata'), ('DDV', Decimal('976.506'), 'prata'),
    ('DDD', Decimal('912.506'), 'bronze'),
])
def test_the_placement_matches_against_equals_calibrate_the_tier(results, rating, tier):
    # Three matches against opponents at the initial rating, with K = 64 (the proposed parameters).
    matches = [duel(n, 1, 100 + n, *((1, 0) if letter == 'V' else (0, 1))) for n, letter in enumerate(results, start=1)]
    ratings = replay_ratings(matches, RATING_CUTS)
    assert ratings[1] == rating and base_tier(ratings[1], RATING_CUTS) == tier
    [placement] = [item for item in rank_records(
        [team_record(1, [(m.score_a, m.score_b) for m in matches], rating=ratings[1])], cuts=RATING_CUTS,
        order=team_order)]
    assert (placement.metric_value, placement.tier, placement.rank_position) == (rating, tier, 1)


def test_draws_count_half_and_the_margin_does_not_matter():
    assert replay_ratings([duel(n, 1, 100 + n, 1, 1) for n in range(1, 4)], RATING_CUTS)[1] == Decimal(1000)
    narrow = replay_ratings([duel(1, 1, 2, 1, 0), duel(2, 1, 3, 2, 1)], RATING_CUTS)
    wide = replay_ratings([duel(1, 1, 2, 7, 0), duel(2, 1, 3, 9, 1)], RATING_CUTS)
    assert narrow == wide
    # Tennis has no draw: an equal score is a loss for both, as in the tennis record.
    tied = replay_ratings([duel(1, 1, 2, 1, 1)], TENNIS_RATING_CUTS, draws=False)
    assert tied == {1: Decimal('968.000'), 2: Decimal('968.000')}


def test_both_sides_are_updated_from_their_ratings_before_the_match():
    ratings = replay_ratings([duel(1, 1, 2, 3, 0)], RATING_CUTS)
    assert ratings == {1: Decimal('1032.000'), 2: Decimal('968.000')}
    # A side without a subject is faced at the initial rating and keeps nothing.
    assert replay_ratings([RatedMatch(NOW, 1, None, 5, 0, 2)], RATING_CUTS) == {5: Decimal('1032.000')}


def test_the_replay_is_chronological_and_does_not_depend_on_the_input_order():
    matches = [duel(1, 1, 2, 1, 0), duel(2, 2, 3, 2, 0), duel(3, 3, 1, 1, 1), duel(4, 1, 4, 0, 1),
               duel(5, 4, 2, 0, 0), duel(6, 1, 2, 3, 2), duel(7, 3, 4, 1, 0)]
    expected = replay_ratings(matches, RATING_CUTS)
    assert replay_ratings(list(reversed(matches)), RATING_CUTS) == expected
    assert replay_ratings([matches[3], matches[0], matches[6], matches[2], matches[5], matches[1], matches[4]],
                          RATING_CUTS) == expected
    # Same start: the match id decides the order, and the order changes the result.
    same_day = [duel(9, 1, 2, 1, 0, day=1), duel(8, 1, 3, 0, 1, day=1)]
    swapped = [duel(8, 1, 2, 1, 0, day=1), duel(9, 1, 3, 0, 1, day=1)]
    assert replay_ratings(same_day, RATING_CUTS)[1] != replay_ratings(swapped, RATING_CUTS)[1]
    assert replay_ratings(same_day, RATING_CUTS) == replay_ratings(list(reversed(same_day)), RATING_CUTS)


# ----- Weighted championship bonus (tennis, calc_version 2) -----------------------------------------------------

def award(day, event, subject, base, entrants):
    """A bonus of `base` to `subject` when `event` ended, on the same day scale as `duel`."""
    return RatedBonus(NOW - timedelta(days=200 - day), event, subject, base, frozenset(entrants))


def test_the_weighted_bonus_is_the_base_against_a_bracket_of_the_same_level():
    assert weighted_bonus(40, Decimal(1000), [Decimal(1000)] * 3) == Decimal('40.000')
    assert weighted_bonus(20, Decimal(1100), [Decimal(1100)] * 3) == Decimal('20.000')
    assert weighted_bonus(10, Decimal(1000), [Decimal(950), Decimal(1050)]) == Decimal('10.000')   # the mean counts
    # Without other entrants (the award needs 4 or more) the bracket counts as the same level.
    assert weighted_bonus(40, Decimal(1234), []) == Decimal('40.000')


def test_a_stronger_bracket_gives_more_than_the_base_up_to_twice_and_a_weaker_one_less():
    stronger = weighted_bonus(40, Decimal(1000), [Decimal(1200)] * 3)
    weaker = weighted_bonus(40, Decimal(1000), [Decimal(800)] * 3)
    assert (stronger, weaker) == (Decimal('60.780'), Decimal('19.220'))
    assert stronger + weaker == Decimal(80)                       # symmetric around the base
    assert weighted_bonus(40, Decimal(1000), [Decimal(5000)] * 3) == Decimal('80.000')   # at most twice the base
    assert Decimal(40) < weighted_bonus(40, Decimal(1000), [Decimal(1001)]) < Decimal(41)


def test_the_weighted_bonus_tends_to_zero_and_is_never_negative():
    assert weighted_bonus(40, Decimal(5000), [Decimal(1000)] * 3) == Decimal('0.000')
    assert weighted_bonus(10, Decimal(9000), [Decimal(1000)]) == Decimal('0.000')
    gains = [weighted_bonus(40, Decimal(rating), [Decimal(1000)] * 3) for rating in range(800, 4001, 50)]
    assert all(gain >= 0 for gain in gains) and gains == sorted(gains, reverse=True)


def test_the_bracket_strength_leaves_the_athlete_out():
    # Athlete 1 beats 2 three times (1079.839); 3 and 4 have no match and enter at the initial rating.
    matches = [duel(1, 1, 2, 2, 0), duel(2, 1, 2, 2, 0), duel(3, 1, 2, 2, 1)]
    plain = replay_ratings(matches, TENNIS_RATING_CUTS, draws=False)
    rated = replay_ratings(matches, TENNIS_RATING_CUTS, draws=False, bonuses=[award(4, 70, 1, 40, {1, 2, 3, 4})])
    others = [plain[2], Decimal(1000), Decimal(1000)]
    assert rated[1] == plain[1] + weighted_bonus(40, plain[1], others)
    assert rated[1] != plain[1] + weighted_bonus(40, plain[1], [plain[1], *others])
    assert rated[2] == plain[2] and set(rated) == {1, 2}           # the other entrants receive nothing


def test_the_bonuses_of_one_event_use_the_ratings_before_it_and_a_bonus_is_not_a_match():
    # Four entrants at the initial rating: the champion gets exactly 40 and the runner-up exactly 20, not a bonus
    # measured against the champion's new rating.
    bonuses = [award(1, 70, 1, 40, {1, 2, 3, 4}), award(1, 70, 2, 20, {1, 2, 3, 4})]
    assert replay_ratings([], TENNIS_RATING_CUTS, bonuses=bonuses) == {1: Decimal('1040.000'), 2: Decimal('1020.000')}
    # Three bonuses before the first match leave the placement K at 64.
    three = [award(day, 70 + day, 1, 10, {1, 2, 3, 4}) for day in (1, 2, 3)]
    rating = Decimal(1000)
    for _ in three:
        rating += weighted_bonus(10, rating, [Decimal(1000)] * 3)
    ratings = replay_ratings([duel(4, 1, 5, 2, 0)], TENNIS_RATING_CUTS, draws=False, bonuses=three)
    assert ratings[1] == updated_rating(rating, Decimal(1000), Decimal(1), Decimal(64))


def test_bonuses_enter_the_timeline_after_the_matches_of_the_same_instant_and_in_any_input_order():
    match = duel(5, 1, 2, 2, 0)
    same_instant = award(5, 70, 1, 40, {1, 2, 3, 4})
    after_match = replay_ratings([match], TENNIS_RATING_CUTS, draws=False)
    ratings = replay_ratings([match], TENNIS_RATING_CUTS, draws=False, bonuses=[same_instant])
    assert ratings[1] == after_match[1] + weighted_bonus(40, after_match[1], [after_match[2], Decimal(1000),
                                                                              Decimal(1000)])
    # A bonus earlier than a match changes the match itself; the input order never matters.
    matches = [duel(1, 1, 2, 2, 0), duel(3, 2, 3, 2, 1), duel(6, 1, 3, 0, 2), duel(8, 1, 4, 2, 1)]
    bonuses = [award(2, 71, 2, 40, {1, 2, 3, 4}), award(2, 71, 3, 20, {1, 2, 3, 4}), award(7, 72, 1, 10, {1, 3, 4, 5}),
               award(7, 70, 4, 40, {4, 5, 6, 7})]
    expected = replay_ratings(matches, TENNIS_RATING_CUTS, draws=False, bonuses=bonuses)
    assert replay_ratings(list(reversed(matches)), TENNIS_RATING_CUTS, draws=False,
                          bonuses=list(reversed(bonuses))) == expected
    assert expected != replay_ratings(matches, TENNIS_RATING_CUTS, draws=False)


def test_rating_records_rank_by_the_rating_then_the_current_tie_breaks():
    team = team_record(7, [(3, 1), (0, 1)], rating=Decimal('1012.5'))
    assert (team.metric, team.points) == (Decimal('1012.5'), 3)          # the 3/1/0 points stay as a statistic
    assert team_record(7, [(3, 1)]).metric == Decimal(3)                 # without a rating: points (v1 cuts)
    tied = [TeamRecord(1, 3, 1, 0, 2, 2, 4, rating=Decimal(1000)), TeamRecord(2, 3, 0, 0, 3, 0, 3, rating=Decimal(1001)),
            TeamRecord(3, 3, 3, 0, 0, 5, 1, rating=Decimal(1000)), TeamRecord(4, 3, 3, 0, 0, 6, 2, rating=Decimal(1000)),
            TeamRecord(5, 4, 3, 0, 1, 6, 2, rating=Decimal(1000))]
    # Rating first (even with fewer points), then goal difference, goals scored, fewer matches.
    assert [item.subject_id for item in sorted(tied, key=team_order)] == [2, 4, 5, 3, 1]
    tennis = tennis_record(4, [(2, 0)], bonus=40, rating=Decimal('1032'))
    # The record does not add the bonus base to the rating: the weighted bonus is already in the replayed rating.
    assert (tennis.metric, tennis.points) == (Decimal(1032), 50)
    ordered = sorted([TennisRecord(1, 4, rating=Decimal(990)), TennisRecord(2, 5, rating=Decimal(1010)),
                      TennisRecord(3, 3, rating=Decimal(990))], key=tennis_order)
    assert [item.subject_id for item in ordered] == [2, 3, 1]


def test_rating_cuts_place_the_classified_and_keep_the_rating_of_the_ones_in_placement():
    records = [tennis_record(1, [(2, 0)] * 3, rating=Decimal('1087.494')),
               tennis_record(2, [(0, 2)] * 3, rating=Decimal('912.506')),
               tennis_record(3, [(2, 0)] * 2, rating=Decimal('1061.05'))]
    placed = {item.record.subject_id: item for item in rank_records(records, cuts=TENNIS_RATING_CUTS,
                                                                     order=tennis_order)}
    assert (placed[1].rank_position, placed[1].tier) == (1, 'ouro')
    assert (placed[2].rank_position, placed[2].tier) == (2, 'bronze')
    # In placement: no position nor tier, but the rating is stored (the pairing reads it; the API hides it).
    assert (placed[3].rank_position, placed[3].tier, placed[3].metric_value) == (None, None, Decimal('1061.05'))
    assert standing_fields(placed[3], calc_version=2)['metric_value'] == Decimal('1061.05')

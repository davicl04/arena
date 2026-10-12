"""Points and rankings (stage 3): RN11, RN12, RN14, RN16, the 52-week window, classification and tiers."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.services.rankings import Cuts
from app.services.scoring import (
    IndividualPoints,
    IndividualRecord,
    TeamRecord,
    TennisRecord,
    in_window,
    individual_order,
    individual_points,
    individual_record,
    is_classified,
    outcome_for,
    position_stat_points,
    rank_records,
    standing_fields,
    team_order,
    team_points,
    team_record,
    tennis_order,
    tennis_points,
    tennis_record,
    window_start,
)

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
TEAM_CUTS = Cuts('futebol_time', 'pontos', 'maior', Decimal(10), Decimal(30), Decimal(60), 3, Decimal('0.15'), 52)
INDIVIDUAL_CUTS = Cuts('futebol_individual', 'media', 'maior', Decimal('2.5'), Decimal('4.0'), Decimal('5.5'), 3,
                       Decimal('0.15'), 52)
TENNIS_CUTS = Cuts('tenis', 'pontos', 'maior', Decimal(30), Decimal(80), Decimal(150), 3, Decimal('0.15'), 52)


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
        'wins': 1, 'draws': 1, 'losses': 1, 'goals_for': 3, 'goals_against': 4}
    tennis = rank_records([tennis_record(2, [(2, 1)])], cuts=TENNIS_CUTS, order=tennis_order)[0]
    assert standing_fields(tennis, calc_version=2) == {
        'metric_value': Decimal(10), 'matches_played': 1, 'rank_position': None, 'tier': None, 'calc_version': 2,
        'wins': 1, 'draws': 0, 'losses': 0, 'goals_for': 2, 'goals_against': 1}
    individual = rank_records([IndividualRecord(3, 3, Decimal(12), 2, 0, 1)], cuts=INDIVIDUAL_CUTS,
                              order=individual_order)[0]
    fields = standing_fields(individual, calc_version=1)
    assert (fields['metric_value'], fields['tier'], fields['goals_for'], fields['wins']) == (
        Decimal('4.000'), 'ouro', 0, 2)

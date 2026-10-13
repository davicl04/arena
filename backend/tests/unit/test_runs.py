"""Running marks (fase 6) without a database: the ±2% tolerance, pace, plausible times, the window, the best-time
ranking with its tiers and Lendário, and the preview verdicts."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.models.rankings import RUN_DISTANCES_KM, TIERS
from app.schemas.runs import RunInput
from app.services import run_rules
from app.services.match_rules import RuleError
from app.services.rankings import Cuts, base_tier, ranking_key, tier_for
from app.services.run_rules import (
    duration_bounds,
    format_km,
    format_pace,
    local_date,
    pace_s_per_km,
    resolve_standard_distance,
    run_kind,
    tier_rises,
    validate_day,
    validate_measure,
)
from app.services.runs import Before, Checked, _impact
from app.services.scoring import (
    WINDOW_WEEKS,
    RunRecord,
    rank_records,
    run_order,
    run_window_start,
    standing_fields,
)
from tests.unit.test_rankings import CUTS

TODAY = date(2026, 10, 12)


def minutes(text: str) -> int:
    """'h:mm:ss' or 'mm:ss' as seconds."""
    parts = [int(part) for part in text.split(':')]
    total = 0
    for part in parts:
        total = total * 60 + part
    return total


# ----- Tolerance of ±2% -----------------------------------------------------------------------------------------

@pytest.mark.parametrize(('distance_m', 'expected'), [
    (9800, 10), (9999, 10), (10000, 10), (10200, 10),         # 9.8 to 10.2 km counts as 10 km
    (9799, None), (9790, None), (10201, None),                # just outside
    (2940, 3), (3000, 3), (3060, 3), (2939, None), (3061, None),
    (4900, 5), (5000, 5), (5100, 5), (4899, None), (5101, None),
    (20580, 21), (21000, 21), (21097, 21), (21420, 21), (20579, None), (21421, None),   # half marathon is 21 km
    (41160, 42), (42000, 42), (42195, 42), (42840, 42), (41159, None), (42841, None),   # marathon is 42 km
    (1000, None), (7000, None), (15000, None), (30000, None), (100000, None),            # history only
])
def test_tolerance_of_two_percent_resolves_the_standard_distance(distance_m, expected):
    assert resolve_standard_distance(distance_m) == expected


def test_the_bands_do_not_overlap_and_every_standard_distance_has_one():
    resolved = [resolve_standard_distance(meters) for meters in range(500, 50_000)]
    assert [km for km in RUN_DISTANCES_KM if km not in resolved] == []
    # Contiguous blocks, in order: no distance falls in two bands (the function returns the first match, so any
    # overlap would show as a band that is not a single interval of the right size).
    for km in RUN_DISTANCES_KM:
        band = [meters for meters, standard in zip(range(500, 50_000), resolved) if standard == km]
        assert band == list(range(km * 980, km * 1020 + 1))


# ----- Pace and plausible times -------------------------------------------------------------------------------

@pytest.mark.parametrize(('distance_m', 'duration_s', 'pace'), [
    (5000, minutes('25:00'), 300), (10000, minutes('1:00:00'), 360), (3000, 1000, 333), (3000, 1001, 334),
    (2000, 601, 301), (2000, 600, 300), (21097, minutes('1:45:00'), 299), (42195, minutes('3:30:00'), 299),
])
def test_pace_is_seconds_per_km_rounded_half_up(distance_m, duration_s, pace):
    assert pace_s_per_km(distance_m, duration_s) == pace


def test_pace_formats_and_distance_labels():
    assert [format_pace(seconds) for seconds in (300, 305, 59, 3599)] == ['5:00', '5:05', '0:59', '59:59']
    assert [format_km(meters) for meters in (5000, 7500, 21097, 9800, 1000)] == [
        '5 km', '7,5 km', '21,1 km', '9,8 km', '1 km']


@pytest.mark.parametrize(('distance_m', 'bounds'), [
    (1000, (120, 900)), (3000, (360, 2700)), (5000, (600, 4500)), (10000, (1200, 9000)),
    (21097, (2532, 18987)), (42195, (5064, 37975)), (100000, (12000, 86400)),   # 24 h cap
])
def test_plausible_duration_follows_the_pace_limits(distance_m, bounds):
    assert duration_bounds(distance_m) == bounds


def test_a_time_must_be_plausible_for_the_distance():
    validate_measure(5000, 600)       # 2:00/km, the fastest accepted
    validate_measure(5000, 4500)      # 15:00/km, the slowest accepted
    validate_measure(1000, 120)
    validate_measure(100000, 86400)
    with pytest.raises(RuleError, match='rápido demais para 5 km') as fast:
        validate_measure(5000, 599)
    assert fast.value.field == 'duration_s'
    with pytest.raises(RuleError, match='longo demais para 5 km') as slow:
        validate_measure(5000, 4501)
    assert slow.value.field == 'duration_s'
    with pytest.raises(RuleError, match='Informe o tempo') as empty:
        validate_measure(5000, 0)
    assert empty.value.field == 'duration_s'
    for distance in (999, 100001, 0, -5000):
        with pytest.raises(RuleError, match='entre 1 km e 100 km') as far:
            validate_measure(distance, 1800)
        assert far.value.field == 'distance_m'


# ----- Days and the window ---------------------------------------------------------------------------------------

def test_days_follow_the_brasilia_calendar():
    assert local_date(datetime(2026, 10, 12, 3, 0, tzinfo=timezone.utc)) == date(2026, 10, 12)    # 00:00 local
    assert local_date(datetime(2026, 10, 12, 2, 59, tzinfo=timezone.utc)) == date(2026, 10, 11)   # 23:59 local
    assert local_date(datetime(2026, 10, 12, 23, 30, tzinfo=timezone.utc)) == date(2026, 10, 12)


def test_the_window_is_52_weeks_of_calendar_days():
    assert run_rules.RUN_WINDOW_WEEKS == WINDOW_WEEKS == 52
    assert run_rules.window_start_day(TODAY) == run_window_start(TODAY) == TODAY - timedelta(days=364)


def test_a_training_day_is_neither_future_nor_older_than_the_window():
    validate_day(TODAY, TODAY)
    validate_day(TODAY - timedelta(days=364), TODAY)
    with pytest.raises(RuleError, match='no futuro') as future:
        validate_day(TODAY + timedelta(days=1), TODAY)
    assert future.value.field == 'date'
    with pytest.raises(RuleError, match='últimas 52 semanas') as old:
        validate_day(TODAY - timedelta(days=365), TODAY)
    assert old.value.field == 'date'
    with pytest.raises(RuleError, match='Esta prova saiu das últimas 52 semanas'):
        validate_day(TODAY - timedelta(days=365), TODAY, race=True)


# ----- Ranking of a distance: best time, lower is better ---------------------------------------------------------

def run_cuts(distance_km: int) -> Cuts:
    return CUTS[ranking_key('corrida', distance_km=distance_km)]


@pytest.mark.parametrize(('distance_km', 'prata', 'ouro', 'diamante'), [
    (3, '20:00', '15:00', '12:00'), (5, '35:00', '27:00', '22:00'), (10, '1:15:00', '57:00', '47:00'),
    (21, '2:45:00', '2:05:00', '1:45:00'), (42, '5:45:00', '4:20:00', '3:40:00'),
])
def test_the_tier_of_a_time_follows_the_cuts_of_each_distance(distance_km, prata, ouro, diamante):
    cuts = run_cuts(distance_km)
    assert cuts.direction == 'menor' and cuts.placement_matches == 1
    expected = {prata: 'prata', ouro: 'ouro', diamante: 'diamante'}
    for text, tier in expected.items():
        assert base_tier(minutes(text), cuts) == tier                 # the cut itself reaches the tier
        assert base_tier(minutes(text) + 1, cuts) == TIERS[TIERS.index(tier) - 1]   # one second slower does not
    assert base_tier(minutes(diamante) - 600, cuts) == 'diamante'
    assert base_tier(minutes(prata) + 3600, cuts) == 'bronze'


def mark(subject_id, best, day=date(2026, 9, 1), marks=1):
    return RunRecord(subject_id, marks, best, day)


def test_the_first_mark_classifies_and_the_fastest_ranks_first():
    cuts = run_cuts(5)
    records = [mark(1, minutes('30:00')), mark(2, minutes('24:12'), marks=4), mark(3, minutes('40:00'))]
    placements = rank_records(records, cuts=cuts, order=run_order)
    assert [(item.record.subject_id, item.rank_position, item.tier) for item in placements] == [
        (2, 1, 'ouro'), (1, 2, 'prata'), (3, 3, 'bronze')]   # a single mark already carries a tier (RN: classifies at once)
    assert [item.matches_played for item in placements] == [4, 1, 1]
    assert placements[0].metric_value == Decimal(minutes('24:12'))


def test_the_same_time_goes_to_who_ran_it_first_then_to_the_lower_id():
    records = [mark(9, 1500, date(2026, 9, 10)), mark(4, 1500, date(2026, 9, 2)), mark(2, 1500, date(2026, 9, 10)),
               mark(7, 1490, date(2026, 9, 30))]
    order = sorted(records, key=run_order)
    assert [item.subject_id for item in order] == [7, 4, 2, 9]


def test_lendario_is_diamante_inside_the_top_15_percent_rounded_down():
    cuts = run_cuts(5)
    fast = [minutes('20:00') + index for index in range(20)]
    records = [mark(index + 1, best) for index, best in enumerate(fast)]
    tiers = {item.record.subject_id: item.tier for item in rank_records(records, cuts=cuts, order=run_order)}
    assert [tiers[subject] for subject in (1, 2, 3, 4)] == ['lendario', 'lendario', 'lendario', 'diamante']
    # Fewer than 7 classified: nobody is Lendário, even with Diamante times.
    six = rank_records(records[:6], cuts=cuts, order=run_order)
    assert {item.tier for item in six} == {'diamante'}
    # Lendário also needs the Diamante time: the top places of a slow ranking stay below it.
    slow = [mark(index + 1, minutes('26:00') + index) for index in range(20)]
    assert {item.tier for item in rank_records(slow, cuts=cuts, order=run_order)} == {'ouro'}
    assert tier_for(minutes('21:59'), cuts, rank_position=1, classified_count=7) == 'lendario'
    assert tier_for(minutes('21:59'), cuts, rank_position=2, classified_count=7) == 'diamante'


def test_a_running_standing_row_has_the_best_time_and_no_record():
    cuts = run_cuts(10)
    placement = rank_records([mark(1, minutes('52:30'), marks=3)], cuts=cuts, order=run_order)[0]
    fields = standing_fields(placement, calc_version=1)
    assert fields == {
        'metric_value': Decimal(3150), 'matches_played': 3, 'rank_position': 1, 'tier': 'ouro', 'calc_version': 1,
        'wins': 0, 'draws': 0, 'losses': 0, 'goals_for': 0, 'goals_against': 0, 'recent_form': '',
        'best_mark_on': date(2026, 9, 1)}


# ----- Preview verdicts ----------------------------------------------------------------------------------------------

def checked(duration_s, standard=5):
    return Checked(5000 if standard else 7000, duration_s, TODAY, 'treino', standard)


def test_the_kind_of_a_mark_depends_on_the_previous_best():
    assert run_kind(5, None, 1500) == run_rules.KIND_FIRST
    assert run_kind(5, 1500, 1499) == run_rules.KIND_BEST
    assert run_kind(5, 1500, 1500) == run_rules.KIND_NO_GAIN
    assert run_kind(5, 1500, 1800) == run_rules.KIND_NO_GAIN
    assert run_kind(None, 1500, 1000) == run_rules.KIND_HISTORY       # a 7 km run touches no ranking


def test_tier_rises_only_from_a_tier_the_athlete_already_had():
    assert tier_rises('prata', 'ouro') and tier_rises('bronze', 'lendario')
    assert not tier_rises('ouro', 'ouro') and not tier_rises('ouro', 'prata')
    assert not tier_rises(None, 'ouro')       # a first mark enters the ranking, nothing to rise from
    assert not tier_rises('ouro', None) and not tier_rises(None, None)


def test_a_new_best_reports_the_gain_and_the_new_tier():
    impact = _impact(checked(minutes('26:48')), Before(minutes('27:12'), 'prata'), 'ouro')   # "−0:24", "Sobe para Ouro"
    assert (impact.kind, impact.delta_s, impact.previous_best_s) == ('novo_melhor', -24, 1632)
    assert (impact.tier_before, impact.tier_after, impact.tier_up) == ('prata', 'ouro', True)


def test_a_first_mark_has_no_delta_and_does_not_rise():
    impact = _impact(checked(minutes('24:12')), Before(None, None), 'ouro')
    assert (impact.kind, impact.delta_s, impact.previous_best_s, impact.tier_up) == ('primeira_marca', None, None, False)
    assert (impact.tier_before, impact.tier_after) == (None, 'ouro')


def test_a_slower_mark_keeps_the_tier_and_a_history_mark_has_none():
    slower = _impact(checked(minutes('29:00')), Before(minutes('27:12'), 'prata'), 'prata')
    assert (slower.kind, slower.delta_s, slower.tier_up) == ('sem_melhora', 108, False)
    equal = _impact(checked(minutes('27:12')), Before(minutes('27:12'), 'prata'), 'prata')
    assert (equal.kind, equal.delta_s) == ('sem_melhora', 0)
    history = _impact(checked(minutes('35:00'), standard=None), Before(None, None), None)
    assert (history.kind, history.delta_s, history.tier_before, history.tier_after, history.tier_up) == (
        'fora_do_ranking', None, None, None, False)


# ----- Input ---------------------------------------------------------------------------------------------------------

def test_the_input_is_strict():
    valid = {'distance_m': 5000, 'duration_s': 1500, 'source': 'treino'}
    assert RunInput(**valid).date is None and RunInput(**valid, date='2026-10-01').date == date(2026, 10, 1)
    for bad in ({'source': 'prova ', 'extra': 1}, {'source': 'competicao'}, {'distance_m': 5000.5},
                {'distance_m': '5000'}, {'duration_s': True}, {'date': '12/10/2026'}, {'user_id': 3},
                {'verified': True}, {'standard_distance_km': 5}):
        with pytest.raises(ValidationError):
            RunInput(**{**valid, **bad})
    for missing in ('distance_m', 'duration_s', 'source'):
        with pytest.raises(ValidationError):
            RunInput(**{key: value for key, value in valid.items() if key != missing})

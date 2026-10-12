"""Running (fase 6) on PostgreSQL: marks, the ±2% tolerance, the Arena race rule, "Suas marcas", the history, the
best-time ranking of each distance, `/me/standings`, the 52-week window and the removal of a mark.

The running routes run on a fixed clock (2026-10-12 15:00 UTC, Brasília day 2026-10-12).
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.models.rankings import Standing
from app.models.runs import Run
from app.services import rankings
from app.services.runs import Checked
from app.services.standings import RankingKey, recalculate_outside_window, recalculate_rankings
from tests.integration.entry_helpers import tennis_event
from tests.integration.match_helpers import NOW, make_user
from tests.integration.result_helpers import DAY, HOUR, login
from tests.integration.run_helpers import (
    TODAY,
    WINDOW_START,
    body,
    enter,
    log_run,
    logged,
    mark,
    minutes,
    race,
    runner,
    use_clock,
)
from tests.integration.team_helpers import audit_actions

API = '/api/v1'


@pytest.fixture
def setup(client, monkeypatch):
    http, db = client
    use_clock(monkeypatch)
    return http, db


def standing_rows(db, distance_km):
    return db.scalars(select(Standing).where(Standing.sport == 'corrida', Standing.distance_km == distance_km)
                      .order_by(Standing.rank_position)).all()


def run_count(db):
    return db.scalar(select(func.count()).select_from(Run))


# ----- Session and shape -------------------------------------------------------------------------------------------

def test_every_running_route_needs_a_session(setup):
    http, _ = setup
    assert http.post(f'{API}/me/runs', json=body()).status_code == 401
    assert http.post(f'{API}/me/runs/preview', json=body()).status_code == 401
    assert http.get(f'{API}/me/runs').status_code == 401
    assert http.delete(f'{API}/me/runs/1').status_code == 401
    assert http.get(f'{API}/me/run-bests').status_code == 401
    assert http.get(f'{API}/me/run-races').status_code == 401


def test_the_athlete_is_the_session_and_unknown_fields_are_refused(setup):
    http, db = setup
    user, headers = runner(db, 'ana')
    other = make_user(db, 'bia')
    for extra in ({'user_id': other.id}, {'verified': True}, {'standard_distance_km': 10}, {'tier': 'ouro'}):
        assert http.post(f'{API}/me/runs', json=body(**extra), headers=headers).status_code == 422
    assert run_count(db) == 0
    logged(http, headers)
    assert db.scalar(select(Run.user_id)) == user.id


# ----- Training: first mark, better marks, tiers ----------------------------------------------------------------------

def test_the_first_training_registers_the_mark_and_classifies_the_athlete(setup):
    http, db = setup
    user, headers = runner(db, 'ana')
    response = log_run(http, headers, 5000, '24:12')
    assert response.status_code == 201, response.text
    created = response.json()
    assert created['run'] == {
        'id': created['run']['id'], 'distance_m': 5000, 'standard_distance_km': 5, 'duration_s': 1452,
        'pace_s_per_km': 290, 'date': '2026-10-12', 'origin': {'source': 'treino', 'label': 'Treino', 'event_id': None},
        'counts_for_ranking': True, 'created_at': created['run']['created_at']}
    assert created['impact'] == {'kind': 'primeira_marca', 'previous_best_s': None, 'delta_s': None,
                                 'tier_before': None, 'tier_after': 'ouro', 'tier_up': False}
    card = created['best']
    assert (card['distance_km'], card['state'], card['tier'], card['rank_position'], card['marks']) == (
        5, 'ranqueado', 'ouro', 1, 1)
    assert card['best']['duration_s'] == 1452 and card['best']['origin']['label'] == 'Treino'
    assert card['series'] == [{'id': created['run']['id'], 'date': '2026-10-12', 'duration_s': 1452}]

    # The first mark already carries a tier (the classification of the running ranking is one mark).
    corrida = http.get(f'{API}/me/standings', headers=headers).json()['corrida']
    line = next(item for item in corrida if item['distance_km'] == 5)
    assert (line['state'], line['tier'], line['played'], line['required'], line['rank_position'],
            line['metric_value']) == ('ranqueado', 'ouro', 1, 1, 1, 1452.0)
    assert line['faces'] == ['prata', 'ouro', 'diamante'] and line['faces_any_level'] is False
    assert {item['state'] for item in corrida if item['distance_km'] != 5} == {'sem_marca'}

    saved = db.scalar(select(Run))
    assert (saved.user_id, saved.source, saved.verified, saved.event_entry_id, saved.standard_distance_km) == (
        user.id, 'treino', False, None, 5)
    row = standing_rows(db, 5)[0]
    assert (row.user_id, row.tier, row.calc_version, row.matches_played, float(row.metric_value)) == (
        user.id, 'ouro', 1, 1, 1452.0)
    [(action, data)] = audit_actions(db, 'run', saved.id)
    assert action == 'corrida.registrada' and data['distance_m'] == 5000 and data['kind'] == 'primeira_marca'


def test_a_better_time_raises_the_tier_and_a_slower_one_changes_nothing(setup):
    http, db = setup
    user, headers = runner(db, 'ana')
    first = logged(http, headers, 5000, '30:00')
    assert (first['impact']['tier_after'], first['best']['tier']) == ('prata', 'prata')

    preview = http.post(f'{API}/me/runs/preview', json=body(5000, minutes('26:48')), headers=headers)
    assert preview.status_code == 200, preview.text
    assert preview.json()['impact'] == {'kind': 'novo_melhor', 'previous_best_s': 1800, 'delta_s': -192,
                                        'tier_before': 'prata', 'tier_after': 'ouro', 'tier_up': True}
    assert preview.json()['pace_s_per_km'] == 322 and preview.json()['standard_distance_km'] == 5
    assert run_count(db) == 1 and standing_rows(db, 5)[0].tier == 'prata'         # a preview writes nothing

    saved = logged(http, headers, 5000, '26:48')
    assert saved['impact'] == preview.json()['impact']
    assert (saved['best']['tier'], saved['best']['best']['duration_s'], saved['best']['marks']) == ('ouro', 1608, 2)

    slower = logged(http, headers, 5000, '29:00')
    assert slower['impact'] == {'kind': 'sem_melhora', 'previous_best_s': 1608, 'delta_s': 132,
                                'tier_before': 'ouro', 'tier_after': 'ouro', 'tier_up': False}
    assert (slower['best']['best']['duration_s'], slower['best']['marks']) == (1608, 3)
    row = standing_rows(db, 5)[0]
    assert (row.tier, row.matches_played, float(row.metric_value)) == ('ouro', 3, 1608.0)
    assert [action for action, _ in audit_actions(db, 'run', slower['run']['id'])] == ['corrida.registrada']


def test_an_equal_time_is_not_a_new_best(setup):
    http, db = setup
    _, headers = runner(db, 'ana')
    logged(http, headers, 5000, '25:00')
    again = logged(http, headers, 5000, '25:00')
    assert (again['impact']['kind'], again['impact']['delta_s']) == ('sem_melhora', 0)


def test_the_preview_of_a_slower_time_keeps_the_current_tier(setup):
    http, db = setup
    _, headers = runner(db, 'ana')
    logged(http, headers, 5000, '26:00')
    preview = http.post(f'{API}/me/runs/preview', json=body(5000, minutes('27:30')), headers=headers).json()
    assert preview['impact'] == {'kind': 'sem_melhora', 'previous_best_s': 1560, 'delta_s': 90,
                                 'tier_before': 'ouro', 'tier_after': 'ouro', 'tier_up': False}


def test_the_unique_index_is_the_last_barrier_for_a_race_mark(setup, monkeypatch):
    http, db = setup
    owner, (athlete, headers) = make_user(db, 'dono'), runner(db, 'ana')
    event = race(db, owner, distance_km=10)
    entry = enter(db, event, athlete)
    db.add(Run(user_id=athlete.id, distance_m=10000, duration_s=3000, ran_on=TODAY, source='prova',
               event_entry_id=entry.id, standard_distance_km=10, created_at=NOW))
    db.flush()
    # A second request that passed the checks before the first one committed: the index refuses it.
    monkeypatch.setattr('app.services.runs.check_run', lambda *args, **kwargs: Checked(
        10000, 2900, TODAY, 'prova', 10, entry, event))
    response = log_run(http, headers, 10000, '48:20', source='prova', entry_id=entry.id)
    assert response.status_code == 409 and response.json()['detail'] == 'Você já registrou a marca desta prova.'


def test_each_distance_has_its_own_ranking_and_tier(setup):
    http, db = setup
    _, headers = runner(db, 'ana')
    results = {3: '11:50', 5: '35:00', 10: '58:00', 21: '1:44:00', 42: '6:00:00'}
    for km, duration in results.items():
        logged(http, headers, km * 1000, duration)
    expected = {3: 'diamante', 5: 'prata', 10: 'prata', 21: 'diamante', 42: 'bronze'}
    bests = http.get(f'{API}/me/run-bests', headers=headers).json()['items']
    assert {item['distance_km']: item['tier'] for item in bests} == expected
    corrida = http.get(f'{API}/me/standings', headers=headers).json()['corrida']
    assert {item['distance_km']: item['tier'] for item in corrida} == expected
    assert all(item['state'] == 'ranqueado' and item['played'] == 1 for item in corrida)


# ----- The ±2% tolerance and the history ---------------------------------------------------------------------------

@pytest.mark.parametrize(('distance_m', 'standard'), [
    (9800, 10), (10000, 10), (10200, 10), (9799, None), (9790, None), (10201, None), (7000, None)])
def test_the_tolerance_decides_which_marks_count_for_a_distance(setup, distance_m, standard):
    http, db = setup
    _, headers = runner(db, 'ana')
    created = logged(http, headers, distance_m, '50:00')
    assert created['run']['standard_distance_km'] == standard
    assert created['run']['counts_for_ranking'] is (standard is not None)
    if standard:
        assert created['impact']['kind'] == 'primeira_marca' and created['best']['distance_km'] == standard
    else:
        assert created['impact']['kind'] == 'fora_do_ranking' and created['best'] is None
    assert len(standing_rows(db, 10)) == (1 if standard == 10 else 0)


def test_another_distance_stays_in_the_history_and_touches_no_ranking(setup):
    http, db = setup
    _, headers = runner(db, 'ana')
    logged(http, headers, 5000, '25:00')
    standings = [(row.distance_km, row.matches_played) for row in db.scalars(select(Standing))]
    seven = logged(http, headers, 7000, '34:00')
    assert seven['impact'] == {'kind': 'fora_do_ranking', 'previous_best_s': None, 'delta_s': None,
                               'tier_before': None, 'tier_after': None, 'tier_up': False}
    assert seven['run']['standard_distance_km'] is None and seven['run']['counts_for_ranking'] is False
    assert [(row.distance_km, row.matches_played) for row in db.scalars(select(Standing))] == standings
    # No conversion by pace: a 7 km run is not a 5 km mark, however fast.
    assert http.get(f'{API}/me/run-bests', headers=headers).json()['items'][1]['marks'] == 1
    outra = http.get(f'{API}/me/runs?distance=outra', headers=headers).json()
    assert [(item['distance_m'], item['standard_distance_km']) for item in outra['items']] == [(7000, None)]
    preview = http.post(f'{API}/me/runs/preview', json=body(7000, minutes('34:00')), headers=headers).json()
    assert preview['standard_distance_km'] is None and preview['impact']['kind'] == 'fora_do_ranking'


def test_the_history_is_paginated_newest_day_first_and_filtered_by_distance(setup):
    http, db = setup
    _, headers = runner(db, 'ana')
    days = [TODAY - timedelta(days=offset) for offset in (9, 3, 6, 0, 12)]
    for index, day in enumerate(days):
        logged(http, headers, 5000 if index % 2 == 0 else 7000, f'2{index}:00', date=day.isoformat())
    first = http.get(f'{API}/me/runs?limit=2', headers=headers).json()
    assert [item['date'] for item in first['items']] == ['2026-10-12', '2026-10-09'] and first['next_cursor']
    second = http.get(f'{API}/me/runs?limit=2&cursor={first["next_cursor"]}', headers=headers).json()
    assert [item['date'] for item in second['items']] == ['2026-10-06', '2026-10-03'] and second['next_cursor']
    last = http.get(f'{API}/me/runs?limit=2&cursor={second["next_cursor"]}', headers=headers).json()
    assert [item['date'] for item in last['items']] == ['2026-09-30'] and last['next_cursor'] is None
    five = http.get(f'{API}/me/runs?distance=5', headers=headers).json()['items']
    assert {item['distance_m'] for item in five} == {5000} and len(five) == 3
    assert http.get(f'{API}/me/runs?distance=10', headers=headers).json() == {'items': [], 'next_cursor': None}
    assert http.get(f'{API}/me/runs?distance=8', headers=headers).status_code == 422
    assert http.get(f'{API}/me/runs?cursor=%25%25', headers=headers).status_code == 422
    assert http.get(f'{API}/me/runs?limit=51', headers=headers).status_code == 422
    # Someone else's history is empty: the athlete is always the session.
    _, other = runner(db, 'bia')
    assert http.get(f'{API}/me/runs', headers=other).json() == {'items': [], 'next_cursor': None}


# ----- Validation ----------------------------------------------------------------------------------------------------

def test_an_implausible_time_or_distance_is_refused_with_the_field(setup):
    http, db = setup
    _, headers = runner(db, 'ana')
    cases = [
        (body(5000, minutes('9:59')), 'duration_s', 'rápido demais para 5 km'),
        (body(5000, minutes('1:15:01')), 'duration_s', 'longo demais para 5 km'),
        (body(5000, 0), 'duration_s', 'Informe o tempo'),
        (body(999, 300), 'distance_m', 'entre 1 km e 100 km'),
        (body(100001, 80000), 'distance_m', 'entre 1 km e 100 km'),
    ]
    for payload, field, text in cases:
        for route in ('', '/preview'):
            response = http.post(f'{API}/me/runs{route}', json=payload, headers=headers)
            assert response.status_code == 422, (payload, response.text)
            assert text in response.json()['detail']
            assert response.json()['fields'] == [{'field': field, 'message': response.json()['detail']}]
    boundary = [body(5000, minutes('10:00')), body(5000, minutes('1:15:00')), body(100000, 86400)]
    for payload in boundary:
        assert http.post(f'{API}/me/runs/preview', json=payload, headers=headers).status_code == 200
    assert run_count(db) == 0


def test_a_training_date_is_not_in_the_future_nor_older_than_the_window(setup):
    http, db = setup
    _, headers = runner(db, 'ana')
    future = log_run(http, headers, date=(TODAY + timedelta(days=1)).isoformat())
    assert future.status_code == 422 and future.json()['fields'][0]['field'] == 'date'
    assert 'no futuro' in future.json()['detail']
    old = log_run(http, headers, date=(WINDOW_START - timedelta(days=1)).isoformat())
    assert old.status_code == 422 and 'últimas 52 semanas' in old.json()['detail']
    assert log_run(http, headers, date=WINDOW_START.isoformat()).status_code == 201
    assert log_run(http, headers, date=TODAY.isoformat()).status_code == 201
    assert log_run(http, headers, date='12/10/2026').status_code == 422
    assert logged(http, headers)['run']['date'] == '2026-10-12'
    assert run_count(db) == 3


def test_the_default_day_is_the_brasilia_day(setup, monkeypatch):
    http, db = setup
    _, headers = runner(db, 'ana')
    # 02:30 UTC on the 13th is 23:30 on the 12th in Brasília (UTC-3).
    use_clock(monkeypatch, datetime(2026, 10, 13, 2, 30, tzinfo=timezone.utc))
    assert logged(http, headers)['run']['date'] == '2026-10-12'
    # 03:00 UTC is midnight in Brasília: the day changes, and the 13th is no longer "tomorrow".
    use_clock(monkeypatch, datetime(2026, 10, 13, 3, 0, tzinfo=timezone.utc))
    assert logged(http, headers)['run']['date'] == '2026-10-13'
    assert log_run(http, headers, date='2026-10-14').status_code == 422


def test_the_training_does_not_take_a_race_and_the_race_needs_one(setup):
    http, db = setup
    owner, athlete = make_user(db, 'dono'), runner(db, 'ana')
    _, headers = athlete
    event = race(db, owner)
    entry = enter(db, event, athlete[0])
    with_entry = log_run(http, headers, entry_id=entry.id)
    assert with_entry.status_code == 422 and with_entry.json()['fields'][0]['field'] == 'entry_id'
    without = log_run(http, headers, 10000, '50:00', source='prova')
    assert without.status_code == 422 and without.json()['fields'][0]['field'] == 'entry_id'
    assert run_count(db) == 0


# ----- Arena race --------------------------------------------------------------------------------------------------

def test_a_race_mark_takes_the_day_and_the_name_of_the_race(setup):
    http, db = setup
    owner, (athlete, headers) = make_user(db, 'dono'), runner(db, 'ana')
    event = race(db, owner, name='Corrida do Lago', distance_km=10, starts_at=NOW - 5 * DAY - 3 * HOUR)
    entry = enter(db, event, athlete)

    races = http.get(f'{API}/me/run-races', headers=headers).json()['items']
    assert races == [{'entry_id': entry.id, 'event_id': event.id, 'event_name': 'Corrida do Lago', 'distance_km': 10,
                      'starts_at': races[0]['starts_at'], 'date': '2026-10-07'}]

    created = log_run(http, headers, 10150, '52:10', source='prova', entry_id=entry.id)       # 10.15 km is within ±2%
    assert created.status_code == 201, created.text
    data = created.json()
    assert data['run']['origin'] == {'source': 'prova', 'label': 'Corrida do Lago', 'event_id': event.id}
    assert (data['run']['date'], data['run']['standard_distance_km'], data['run']['distance_m']) == (
        '2026-10-07', 10, 10150)
    assert (data['impact']['kind'], data['impact']['tier_after']) == ('primeira_marca', 'ouro')
    assert data['best']['best']['origin']['label'] == 'Corrida do Lago'
    saved = db.scalar(select(Run))
    assert (saved.source, saved.event_entry_id, saved.verified) == ('prova', entry.id, False)    # self-declared (RN17)
    assert http.get(f'{API}/me/run-races', headers=headers).json() == {'items': []}
    assert http.get(f'{API}/me/runs', headers=headers).json()['items'][0]['origin']['label'] == 'Corrida do Lago'


def test_one_mark_per_entry_and_the_day_must_be_the_race_day(setup):
    http, db = setup
    owner, (athlete, headers) = make_user(db, 'dono'), runner(db, 'ana')
    event = race(db, owner, distance_km=10)
    entry = enter(db, event, athlete)
    wrong_day = log_run(http, headers, 10000, '50:00', source='prova', entry_id=entry.id,
                        date=(TODAY - timedelta(days=1)).isoformat())
    assert wrong_day.status_code == 422 and wrong_day.json()['fields'][0]['field'] == 'date'
    assert log_run(http, headers, 10000, '50:00', source='prova', entry_id=entry.id,
                   date=TODAY.isoformat()).status_code == 201
    again = log_run(http, headers, 10000, '49:00', source='prova', entry_id=entry.id)
    assert again.status_code == 409 and again.json()['detail'] == 'Você já registrou a marca desta prova.'
    assert run_count(db) == 1


def test_the_distance_must_match_the_race_within_the_tolerance(setup):
    http, db = setup
    owner, (athlete, headers) = make_user(db, 'dono'), runner(db, 'ana')
    entry = enter(db, race(db, owner, distance_km=10), athlete)
    for distance_m in (5000, 9790, 10201, 21097):
        response = log_run(http, headers, distance_m, '1:10:00', source='prova', entry_id=entry.id)
        assert response.status_code == 422, distance_m
        assert response.json()['fields'][0]['field'] == 'distance_m'
        assert response.json()['detail'] == 'A distância informada não corresponde aos 10 km desta prova.'
    assert log_run(http, headers, 9800, '50:00', source='prova', entry_id=entry.id).status_code == 201


def test_only_the_own_confirmed_entry_of_a_started_race_counts(setup):
    http, db = setup
    owner, (athlete, headers) = make_user(db, 'dono'), runner(db, 'ana')
    _, stranger_headers = runner(db, 'bia')
    event = race(db, owner, distance_km=10)
    entry = enter(db, event, athlete)

    def prova(headers_, entry_id):
        return log_run(http, headers_, 10000, '50:00', source='prova', entry_id=entry_id)

    # Not the athlete's entry: 404, even for the organizer; an unknown entry too.
    assert prova(stranger_headers, entry.id).status_code == 404
    assert prova(login(db, owner), entry.id).status_code == 404
    assert prova(headers, entry.id + 1000).status_code == 404

    # Without a confirmed entry (a reservation waiting for the receipt), no mark.
    paid = race(db, owner, free=False, distance_km=10, name='Corrida paga')
    reserved = enter(db, paid, athlete, state='reservada')
    refused = prova(headers, reserved.id)
    assert refused.status_code == 409 and 'confirmadas' in refused.json()['detail']

    # The race must have started.
    upcoming = race(db, owner, distance_km=10, starts_at=NOW + HOUR, name='Corrida de hoje')
    waiting = enter(db, upcoming, athlete)
    early = prova(headers, waiting.id)
    assert early.status_code == 409 and 'depois da largada' in early.json()['detail']

    # A cancelled race (a confirmed free entry stays confirmed in this setup) does not take marks.
    called_off = race(db, owner, distance_km=10, name='Corrida cancelada', state='cancelado',
                      cancelled_at=NOW - HOUR, cancel_reason='Chuva forte no local')
    cancelled = enter(db, called_off, athlete)
    stopped = prova(headers, cancelled.id)
    assert stopped.status_code == 409 and 'cancelada' in stopped.json()['detail']

    # Not a running race.
    court = tennis_event(db, owner.id, starts_at=NOW - 3 * HOUR, registration_closes_at=NOW - 2 * DAY)
    game = enter(db, court, athlete)
    wrong_sport = prova(headers, game.id)
    assert wrong_sport.status_code == 422 and wrong_sport.json()['fields'][0]['field'] == 'entry_id'

    assert prova(headers, entry.id).status_code == 201
    assert run_count(db) == 1


def test_the_entry_is_checked_before_the_measure_of_a_race_mark(setup):
    """0002, 18.4: an unconfirmed entry or a race that has not started answers 409 even with an implausible time."""
    http, db = setup
    owner, (athlete, headers) = make_user(db, 'dono'), runner(db, 'ana')
    paid = race(db, owner, free=False, distance_km=10, name='Corrida paga')
    reserved = enter(db, paid, athlete, state='reservada')
    upcoming = race(db, owner, distance_km=10, starts_at=NOW + HOUR, name='Corrida de hoje')
    waiting = enter(db, upcoming, athlete)
    ready = enter(db, race(db, owner, distance_km=10, name='Corrida pronta'), athlete)
    for entry, text in ((reserved, 'confirmadas'), (waiting, 'depois da largada')):
        for path in ('/me/runs/preview', '/me/runs'):
            response = http.post(f'{API}{path}', json=body(10000, 60, source='prova', entry_id=entry.id),
                                 headers=headers)
            assert response.status_code == 409 and text in response.json()['detail']
    measure = http.post(f'{API}/me/runs', json=body(10000, 60, source='prova', entry_id=ready.id), headers=headers)
    assert measure.status_code == 422 and measure.json()['fields'][0]['field'] == 'duration_s'
    assert run_count(db) == 0


def test_a_race_older_than_the_window_does_not_take_a_mark(setup):
    http, db = setup
    owner, (athlete, headers) = make_user(db, 'dono'), runner(db, 'ana')
    old = race(db, owner, distance_km=10, starts_at=NOW - timedelta(days=400))
    entry = enter(db, old, athlete)
    response = log_run(http, headers, 10000, '50:00', source='prova', entry_id=entry.id)
    assert response.status_code == 422 and 'Esta prova saiu das últimas 52 semanas' in response.json()['detail']
    assert http.get(f'{API}/me/run-races', headers=headers).json() == {'items': []}


def test_the_race_preview_applies_the_same_rules_and_writes_nothing(setup):
    http, db = setup
    owner, (athlete, headers) = make_user(db, 'dono'), runner(db, 'ana')
    event = race(db, owner, name='Corrida do Lago', distance_km=10)
    entry = enter(db, event, athlete)
    preview = http.post(f'{API}/me/runs/preview', json=body(10000, minutes('50:00'), source='prova',
                                                              entry_id=entry.id), headers=headers)
    assert preview.status_code == 200, preview.text
    assert preview.json()['origin']['label'] == 'Corrida do Lago' and preview.json()['date'] == '2026-10-12'
    bad = http.post(f'{API}/me/runs/preview', json=body(5000, minutes('25:00'), source='prova', entry_id=entry.id),
                    headers=headers)
    assert bad.status_code == 422
    assert run_count(db) == 0


def test_removing_a_race_mark_frees_the_entry_for_a_new_one(setup):
    http, db = setup
    owner, (athlete, headers) = make_user(db, 'dono'), runner(db, 'ana')
    entry = enter(db, race(db, owner, distance_km=10), athlete)
    first = logged(http, headers, 10000, '55:00', source='prova', entry_id=entry.id)
    assert http.delete(f'{API}/me/runs/{first["run"]["id"]}', headers=headers).status_code == 204
    assert len(http.get(f'{API}/me/run-races', headers=headers).json()['items']) == 1
    assert logged(http, headers, 10000, '53:00', source='prova', entry_id=entry.id)['impact']['kind'] == 'primeira_marca'


# ----- Suas marcas (run-bests) -----------------------------------------------------------------------------------------

def test_run_bests_always_lists_the_five_distances(setup):
    http, db = setup
    _, headers = runner(db, 'ana')
    items = http.get(f'{API}/me/run-bests', headers=headers).json()['items']
    assert [item['distance_km'] for item in items] == [3, 5, 10, 21, 42]
    assert all(item == {'distance_km': item['distance_km'], 'state': 'sem_marca', 'tier': None, 'rank_position': None,
                        'best': None, 'marks': 0, 'series': []} for item in items)


def test_a_card_has_the_best_time_its_origin_and_the_series_of_the_window(setup):
    http, db = setup
    owner, (athlete, headers) = make_user(db, 'dono'), runner(db, 'ana')
    event = race(db, owner, name='Corrida do Lago', distance_km=10, starts_at=NOW - 2 * DAY - 3 * HOUR)
    entry = enter(db, event, athlete)
    logged(http, headers, 10000, '58:30', date=(TODAY - timedelta(days=30)).isoformat())
    logged(http, headers, 10000, '54:10', source='prova', entry_id=entry.id)
    logged(http, headers, 10000, '56:00', date=(TODAY - timedelta(days=10)).isoformat())
    logged(http, headers, 5000, '26:00')
    mark(db, athlete, duration_s=minutes('40:00'), distance_m=10000, standard=10, ran_on=WINDOW_START - timedelta(days=1))
    mark(db, athlete, duration_s=minutes('41:00'), distance_m=10000, standard=10, ran_on=TODAY + timedelta(days=1))

    card = next(item for item in http.get(f'{API}/me/run-bests', headers=headers).json()['items']
                if item['distance_km'] == 10)
    assert (card['state'], card['tier'], card['marks']) == ('ranqueado', 'ouro', 3)      # 54:10 ≤ 57:00
    assert card['best']['duration_s'] == minutes('54:10') and card['best']['date'] == '2026-10-10'
    assert card['best']['origin'] == {'source': 'prova', 'label': 'Corrida do Lago', 'event_id': event.id}
    assert [(point['date'], point['duration_s']) for point in card['series']] == [
        ('2026-09-12', minutes('58:30')), ('2026-10-02', minutes('56:00')), ('2026-10-10', minutes('54:10'))]
    five = next(item for item in http.get(f'{API}/me/run-bests', headers=headers).json()['items']
                if item['distance_km'] == 5)
    assert five['marks'] == 1 and five['best']['origin']['label'] == 'Treino'


def test_the_series_keeps_the_latest_sixty_marks(setup):
    http, db = setup
    athlete, headers = runner(db, 'ana')
    for offset in range(65):
        mark(db, athlete, duration_s=1800 + offset, ran_on=TODAY - timedelta(days=offset))
    recalculate_rankings(db, [RankingKey.run(5)], now=NOW)
    card = http.get(f'{API}/me/run-bests', headers=headers).json()['items'][1]
    assert card['marks'] == 65 and len(card['series']) == 60
    assert card['series'][0]['date'] == (TODAY - timedelta(days=59)).isoformat()
    assert card['series'][-1]['date'] == TODAY.isoformat()
    assert card['best']['duration_s'] == 1800


# ----- Ranking of a distance ---------------------------------------------------------------------------------------------

def make_field(http, db, times, *, distance_m=5000):
    """One athlete per time ('mm:ss'); returns [(user, headers)] in the same order."""
    field = []
    for index, duration in enumerate(times):
        user, headers = runner(db, f'c{index}')
        logged(http, headers, distance_m, duration)
        field.append((user, headers))
    return field


def test_the_ranking_of_a_distance_is_general_ordered_by_time_and_paginated(setup):
    http, db = setup
    times = ['33:00', '24:12', '41:00', '28:30', '26:59']
    field = make_field(http, db, times)
    # The city is not a filter: rankings are general.
    page = http.get(f'{API}/rankings?sport=corrida&distance_km=5&limit=2', headers=field[2][1]).json()
    assert (page['ranking'], page['distance_km'], page['classified_count'], page['required'], page['legend_slots']) == (
        'corrida_5', 5, 5, 1, 0)
    assert [(item['rank_position'], item['metric_value'], item['tier']) for item in page['items']] == [
        (1, 1452.0, 'ouro'), (2, 1619.0, 'ouro')]
    first = page['items'][0]
    assert first['athlete']['id'] == field[1][0].id and first['is_mine'] is False
    assert (first['matches_played'], first['wins'], first['draws'], first['losses'], first['goals_for'],
            first['goals_against'], first['team']) == (1, 0, 0, 0, None, None, None)
    assert page['next_cursor']
    rest = http.get(f'{API}/rankings?sport=corrida&distance_km=5&limit=2&cursor={page["next_cursor"]}',
                    headers=field[2][1]).json()
    assert [(item['rank_position'], item['metric_value'], item['tier']) for item in rest['items']] == [
        (3, 1710.0, 'prata'), (4, 1980.0, 'prata')]
    last = http.get(f'{API}/rankings?sport=corrida&distance_km=5&limit=2&cursor={rest["next_cursor"]}',
                    headers=field[2][1]).json()
    assert [(item['rank_position'], item['tier'], item['is_mine']) for item in last['items']] == [(5, 'bronze', True)]
    assert last['next_cursor'] is None
    # The viewer's own line is there even beyond the page.
    assert (page['mine'][0]['state'], page['mine'][0]['tier'], page['mine'][0]['rank_position']) == (
        'ranqueado', 'bronze', 5)
    # Another distance is a different ranking.
    ten = http.get(f'{API}/rankings?sport=corrida&distance_km=10', headers=field[0][1]).json()
    assert (ten['classified_count'], ten['items'], ten['mine'][0]['state']) == (0, [], 'sem_marca')


def test_a_new_best_moves_the_athlete_up_and_the_others_down(setup):
    http, db = setup
    field = make_field(http, db, ['30:00', '31:00', '32:00'])
    logged(http, field[2][1], 5000, '29:00')
    items = http.get(f'{API}/rankings?sport=corrida&distance_km=5', headers=field[0][1]).json()['items']
    assert [item['athlete']['id'] for item in items] == [field[2][0].id, field[0][0].id, field[1][0].id]
    assert [item['rank_position'] for item in items] == [1, 2, 3]
    assert [item['matches_played'] for item in items] == [2, 1, 1]


def test_lendario_is_the_top_fifteen_percent_of_diamante_times(setup):
    http, db = setup
    times = [f'20:{second:02d}' for second in range(10, 17)]       # seven Diamante times (≤ 22:00)
    field = make_field(http, db, times)
    page = http.get(f'{API}/rankings?sport=corrida&distance_km=5', headers=field[0][1]).json()
    assert (page['classified_count'], page['legend_slots']) == (7, 1)
    assert [item['tier'] for item in page['items']] == ['lendario'] + ['diamante'] * 6
    assert http.get(f'{API}/me/standings', headers=field[0][1]).json()['corrida'][1]['tier'] == 'lendario'
    # A faster newcomer takes the only Lendário place (⌊8 × 15%⌋ is still 1): the former leader is Diamante.
    _, newcomer = runner(db, 'novo')
    logged(http, newcomer, 5000, '19:00')
    page = http.get(f'{API}/rankings?sport=corrida&distance_km=5', headers=field[0][1]).json()
    assert [item['tier'] for item in page['items']][:2] == ['lendario', 'diamante']
    assert page['items'][0]['metric_value'] == 1140.0
    assert http.get(f'{API}/me/standings', headers=field[0][1]).json()['corrida'][1]['tier'] == 'diamante'


def test_the_ranking_validates_the_distance_and_the_running_page_needs_no_football_parameters(setup):
    http, db = setup
    _, headers = runner(db, 'ana')
    assert http.get(f'{API}/rankings?sport=corrida', headers=headers).json()['detail'] == 'Escolha a distância.'
    assert http.get(f'{API}/rankings?sport=corrida&distance_km=7', headers=headers).json()['detail'] == 'Distância inválida.'
    assert http.get(f'{API}/rankings?sport=corrida&distance_km=5&kind=time&format=society',
                    headers=headers).status_code == 200


def test_race_marks_and_trainings_share_the_ranking(setup):
    http, db = setup
    owner, (athlete, headers) = make_user(db, 'dono'), runner(db, 'ana')
    other, other_headers = runner(db, 'bia')
    entry = enter(db, race(db, owner, name='Corrida do Lago', distance_km=10), athlete)
    logged(http, other_headers, 10000, '52:00')
    logged(http, headers, 10000, '51:30', source='prova', entry_id=entry.id)
    page = http.get(f'{API}/rankings?sport=corrida&distance_km=10', headers=other_headers).json()
    assert [(item['athlete']['id'], item['is_mine']) for item in page['items']] == [(athlete.id, False), (other.id, True)]


def test_the_first_mark_unlocks_the_eligibility_of_a_restricted_race(setup):
    http, db = setup
    athlete, headers = runner(db, 'ana')
    assert rankings.subject_tier(db, 'corrida', user_id=athlete.id, distance_km=10) is None
    logged(http, headers, 10000, '1:10:00')
    assert rankings.subject_tier(db, 'corrida', user_id=athlete.id, distance_km=10) == 'prata'
    assert rankings.subject_tier(db, 'corrida', user_id=athlete.id, distance_km=5) is None


# ----- The 52-week window ---------------------------------------------------------------------------------------------

def test_only_marks_inside_the_window_count_for_the_ranking(setup):
    http, db = setup
    athlete, headers = runner(db, 'ana')
    mark(db, athlete, duration_s=minutes('20:00'), ran_on=WINDOW_START - timedelta(days=1))      # just outside
    mark(db, athlete, duration_s=minutes('21:00'), ran_on=WINDOW_START - timedelta(days=200))
    mark(db, athlete, duration_s=minutes('30:00'), ran_on=WINDOW_START)                           # first day inside
    created = logged(http, headers, 5000, '31:00')
    row = standing_rows(db, 5)[0]
    assert (float(row.metric_value), row.matches_played, row.tier) == (1800.0, 2, 'prata')
    assert created['impact'] == {'kind': 'sem_melhora', 'previous_best_s': 1800, 'delta_s': 60,
                                 'tier_before': None, 'tier_after': 'prata', 'tier_up': False}


def test_marks_leaving_the_window_stop_counting_with_the_daily_task(setup):
    http, db = setup
    veteran, veteran_headers = runner(db, 'veterano')
    recent, recent_headers = runner(db, 'recente')
    logged(http, veteran_headers, 5000, '22:00', date=(WINDOW_START + timedelta(days=7)).isoformat())
    logged(http, recent_headers, 5000, '30:00')
    assert [(row.user_id, row.rank_position) for row in standing_rows(db, 5)] == [(veteran.id, 1), (recent.id, 2)]

    # Nothing left the window yet: the task changes nothing.
    assert recalculate_outside_window(db, NOW + timedelta(days=3)) == 0
    later = NOW + timedelta(weeks=2)
    assert recalculate_outside_window(db, later) == 2
    assert [(row.user_id, row.rank_position, row.tier) for row in standing_rows(db, 5)] == [(recent.id, 1, 'prata')]
    assert recalculate_outside_window(db, later) == 0                                              # idempotent

    # The veteran is back to "sem marca".
    corrida = http.get(f'{API}/me/standings', headers=veteran_headers).json()['corrida']
    assert next(item for item in corrida if item['distance_km'] == 5)['state'] == 'sem_marca'


# ----- Removal -------------------------------------------------------------------------------------------------------------

def test_removing_a_mark_recalculates_the_ranking(setup):
    http, db = setup
    athlete, headers = runner(db, 'ana')
    logged(http, headers, 5000, '30:00')
    best = logged(http, headers, 5000, '26:00')
    assert standing_rows(db, 5)[0].tier == 'ouro'
    assert http.delete(f'{API}/me/runs/{best["run"]["id"]}', headers=headers).status_code == 204
    row = standing_rows(db, 5)[0]
    assert (float(row.metric_value), row.matches_played, row.tier) == (1800.0, 1, 'prata')
    assert audit_actions(db, 'run', best['run']['id'])[-1][0] == 'corrida.removida'
    assert http.get(f'{API}/me/runs', headers=headers).json()['items'][0]['duration_s'] == 1800


def test_removing_the_only_mark_puts_the_athlete_back_in_placement(setup):
    http, db = setup
    athlete, headers = runner(db, 'ana')
    only = logged(http, headers, 5000, '30:00')
    assert http.delete(f'{API}/me/runs/{only["run"]["id"]}', headers=headers).status_code == 204
    assert standing_rows(db, 5) == []
    corrida = http.get(f'{API}/me/standings', headers=headers).json()['corrida']
    assert next(item for item in corrida if item['distance_km'] == 5)['state'] == 'sem_marca'
    assert http.delete(f'{API}/me/runs/{only["run"]["id"]}', headers=headers).status_code == 404


def test_only_the_owner_removes_a_mark_and_the_history_mark_leaves_no_ranking_trace(setup):
    http, db = setup
    athlete, headers = runner(db, 'ana')
    _, other = runner(db, 'bia')
    five = logged(http, headers, 5000, '30:00')
    seven = logged(http, headers, 7000, '40:00')
    assert http.delete(f'{API}/me/runs/{five["run"]["id"]}', headers=other).status_code == 404
    assert run_count(db) == 2
    assert http.delete(f'{API}/me/runs/{seven["run"]["id"]}', headers=headers).status_code == 204
    assert len(standing_rows(db, 5)) == 1 and run_count(db) == 1
    assert http.delete(f'{API}/me/runs/999999', headers=headers).status_code == 404

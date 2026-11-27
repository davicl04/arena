"""Result sticker data on PostgreSQL: `GET /me/share/matches/{id}`, `GET /me/share/runs/{id}` and the `shareable` of
the timeline. One rule decides what can be shared (decision 0007): a match with a final result, except the owner's
walkover win, and every run of the owner. Anything else, someone else's or missing answers the same 404."""
from datetime import timedelta

import pytest

from app.models.identity import Follow
from tests.integration.entry_helpers import make_event
from tests.integration.match_helpers import NOW, make_user
from tests.integration.profile_helpers import football, join, new_team, stat, tennis, walkover
from tests.integration.result_helpers import DAY, lineup, login
from tests.integration.run_helpers import TODAY, logged, mark, runner, use_clock

API = '/api/v1'
NOT_FOUND = {'detail': 'Atividade não encontrada.'}
MATCH_KEYS = {'id', 'sport', 'format', 'origin', 'occurred_at', 'event', 'round_label', 'sides', 'owner_side',
              'score', 'outcome', 'walkover_absent_side', 'points', 'stats', 'category'}
RUN_KEYS = {'id', 'occurred_at', 'date', 'distance_m', 'standard_distance_km', 'duration_s', 'pace_s_per_km',
            'previous_best_s', 'mark_kind', 'origin', 'category'}


@pytest.fixture
def world(client):
    http, db = client
    owner = make_user(db, 'dono')
    team, rival = new_team(db, 'Time Dono'), new_team(db, 'Time Rival')
    join(db, team, owner)
    return http, db, owner, team, rival


def share_match(http, headers, match_id):
    return http.get(f'{API}/me/share/matches/{match_id}', headers=headers)


def share_run(http, headers, run_id):
    return http.get(f'{API}/me/share/runs/{run_id}', headers=headers)


def timeline_items(http, headers, user_id):
    page = http.get(f'{API}/users/{user_id}/timeline', params={'limit': 50}, headers=headers)
    assert page.status_code == 200, page.text
    return {(item['kind'], item['id']): item for item in page.json()['items']}


# ----- Access ------------------------------------------------------------------------------------------------------

def test_share_routes_need_a_session(world):
    http, db, owner, team, rival = world
    match = football(db, team, rival, 1, 0)
    run = mark(db, owner)
    assert http.get(f'{API}/me/share/matches/{match.id}').status_code == 401
    assert http.get(f'{API}/me/share/runs/{run.id}').status_code == 401


def test_someone_elses_or_missing_activity_answers_the_same_404(world):
    http, db, owner, team, rival = world
    match = football(db, team, rival, 2, 1)
    run = mark(db, owner)
    owner.social_public = True
    stranger = make_user(db, 'estranho')
    db.flush()
    headers = login(db, stranger)
    for response in (share_match(http, headers, match.id), share_run(http, headers, run.id),
                     share_match(http, headers, 999999), share_run(http, headers, 999999)):
        assert response.status_code == 404
        assert response.json() == NOT_FOUND
    # the owner shares both; an approved follower still cannot share what belongs to the owner
    own = login(db, owner)
    assert share_match(http, own, match.id).status_code == 200
    assert share_run(http, own, run.id).status_code == 200
    db.add(Follow(follower_id=stranger.id, followed_id=owner.id, approved=True))
    db.flush()
    assert share_match(http, headers, match.id).json() == NOT_FOUND


def test_the_rival_shares_the_same_match_from_their_own_side(world):
    http, db, owner, team, rival = world
    other = make_user(db, 'rival')
    join(db, rival, other)
    match = football(db, team, rival, 2, 1)
    mine = share_match(http, login(db, owner), match.id).json()
    theirs = share_match(http, login(db, other), match.id).json()
    assert (mine['owner_side'], mine['outcome'], mine['points']) == ('a', 'vitoria', 3)
    assert (theirs['owner_side'], theirs['outcome'], theirs['points']) == ('b', 'derrota', 0)
    assert [side['is_owner'] for side in theirs['sides']] == [False, True]


def test_a_team_member_absent_from_the_lineup_cannot_share(world):
    http, db, owner, team, rival = world
    match = football(db, team, rival, 1, 0)
    lineup(db, match, owner, 'a', 'atacante', present=False, team_id=team.id)
    assert share_match(http, login(db, owner), match.id).json() == NOT_FOUND


# ----- Shareable rule ----------------------------------------------------------------------------------------------

def test_shareable_rule_over_every_final_state(world):
    http, db, owner, team, rival = world
    confirmed = football(db, team, rival, 2, 0, starts_at=NOW - 7 * DAY)
    open_stats = football(db, team, rival, 0, 1, starts_at=NOW - 6 * DAY, state='realizada')
    draw = football(db, team, rival, 1, 1, starts_at=NOW - 5 * DAY)
    unresolved = football(db, team, rival, 0, 0, starts_at=NOW - 4 * DAY, state='sem_resultado')
    cancelled = football(db, team, rival, 0, 0, starts_at=NOW - 3 * DAY, state='cancelada')
    walkover_win = walkover(db, team, rival, 'b', starts_at=NOW - 2 * DAY)      # the rival did not show up
    walkover_loss = walkover(db, team, rival, 'a', starts_at=NOW - DAY)         # the owner's team did not show up
    annulled = walkover(db, team, rival, 'b', starts_at=NOW - 8 * DAY, decision='anulado')
    headers = login(db, owner)
    expected = {confirmed: True, open_stats: True, draw: True, walkover_loss: True,
                unresolved: False, cancelled: False, walkover_win: False, annulled: False}
    items = timeline_items(http, headers, owner.id)
    for match, shareable in expected.items():
        assert items[('partida', match.id)]['shareable'] is shareable, match.id
        response = share_match(http, headers, match.id)
        assert response.status_code == (200 if shareable else 404), match.id
        if not shareable:
            assert response.json() == NOT_FOUND
    loss = share_match(http, headers, walkover_loss.id).json()
    assert (loss['walkover_absent_side'], loss['outcome'], loss['points'], loss['stats']) == ('a', 'derrota', 0, None)
    assert loss['score'] == {'a': 0, 'b': 3, 'sets': None, 'winner': 'b'}
    assert share_match(http, headers, draw.id).json()['outcome'] == 'empate'


def test_timeline_shareable_is_false_for_a_visitor(world):
    http, db, owner, team, rival = world
    match = football(db, team, rival, 2, 0, starts_at=NOW - 2 * DAY)
    cancelled = football(db, team, rival, 0, 0, starts_at=NOW - 3 * DAY, state='cancelada')
    run = mark(db, owner, ran_on=TODAY - timedelta(days=1))
    owner.social_public = True
    visitor = make_user(db, 'visitante')
    db.flush()
    own = timeline_items(http, login(db, owner), owner.id)
    seen = timeline_items(http, login(db, visitor), owner.id)
    assert own[('partida', match.id)]['shareable'] is True
    assert own[('corrida', run.id)]['shareable'] is True
    assert own[('partida', cancelled.id)]['shareable'] is False
    assert set(seen) == set(own)
    assert all(item['shareable'] is False for item in seen.values())


# ----- Match payload -----------------------------------------------------------------------------------------------

def test_football_payload_has_the_plate_numbers_and_the_owner_stats(world):
    http, db, owner, team, rival = world
    event = make_event(db, owner.id, name='Copa Sudoeste', state='em_andamento')
    semi = football(db, team, rival, 3, 1, starts_at=NOW - 3 * DAY)
    final = football(db, team, rival, 1, 0, starts_at=NOW - DAY)
    for match, number in ((semi, 1), (final, 2)):
        match.origin, match.event_id, match.round_number, match.bracket_position = 'campeonato', event.id, number, 1
    line = lineup(db, semi, owner, 'a', 'atacante', present=True, team_id=team.id)
    stat(db, line, goals=2, assists=1, position_stat=4)
    db.flush()
    body = share_match(http, login(db, owner), semi.id).json()
    assert set(body) == MATCH_KEYS
    assert (body['id'], body['sport'], body['format'], body['origin']) == (semi.id, 'futebol', 'society', 'campeonato')
    assert body['event'] == {'id': event.id, 'name': 'Copa Sudoeste'} and body['round_label'] == 'Semifinal'
    assert body['occurred_at'].startswith((NOW - 3 * DAY).date().isoformat())
    assert body['score'] == {'a': 3, 'b': 1, 'sets': None, 'winner': 'a'}
    assert (body['owner_side'], body['outcome'], body['points'], body['walkover_absent_side']) == (
        'a', 'vitoria', 3, None)
    assert body['stats'] == {'position': 'atacante', 'goals': 2, 'assists': 1, 'position_stat': 4}
    # The elo bar is the individual ranking of the position played; no standing yet: placement with nothing played.
    assert (body['category']['ranking'], body['category']['state'], body['category']['played']) == (
        'futebol_individual', 'classificacao', 0)
    assert [(side['side'], side['kind'], side['is_owner']) for side in body['sides']] == [
        ('a', 'time', True), ('b', 'time', False)]
    assert body['sides'][0]['team']['name'] == 'Time Dono' and body['sides'][0]['athlete'] is None


def test_football_without_stats_and_friendly_has_no_event(world):
    http, db, owner, team, rival = world
    match = football(db, rival, team, 0, 2, format_='futsal')
    body = share_match(http, login(db, owner), match.id).json()
    assert (body['format'], body['origin'], body['event'], body['round_label']) == ('futsal', 'amistoso', None, None)
    assert (body['owner_side'], body['outcome'], body['stats']) == ('b', 'vitoria', None)


def test_tennis_payload_has_sets_with_tiebreak(world):
    http, db, owner, *_ = world
    rival = make_user(db, 'tenista')
    match = tennis(db, owner, rival, sets=[{'a': 6, 'b': 4}, {'a': 7, 'b': 6, 'tiebreak': {'a': 7, 'b': 5}}])
    body = share_match(http, login(db, owner), match.id).json()
    assert (body['sport'], body['format'], body['stats']) == ('tenis', None, None)
    assert (body['category']['ranking'], body['category']['state']) == ('tenis', 'classificacao')
    assert (body['outcome'], body['points']) == ('vitoria', 10)
    assert body['score'] == {'a': 2, 'b': 0, 'winner': 'a', 'sets': [
        {'a': 6, 'b': 4, 'tiebreak': None, 'super_tiebreak': False},
        {'a': 7, 'b': 6, 'tiebreak': {'a': 7, 'b': 5}, 'super_tiebreak': False}]}
    assert [(side['kind'], side['is_owner']) for side in body['sides']] == [('atleta', True), ('atleta', False)]
    assert body['sides'][0]['athlete']['id'] == owner.id and body['sides'][0]['team'] is None
    lost = share_match(http, login(db, rival), match.id).json()
    assert (lost['owner_side'], lost['outcome'], lost['points']) == ('b', 'derrota', 0)


def test_tennis_without_result_is_not_shareable(world):
    http, db, owner, *_ = world
    match = tennis(db, owner, make_user(db, 'tenista'), state='sem_resultado')
    assert share_match(http, login(db, owner), match.id).json() == NOT_FOUND


# ----- Run payload -------------------------------------------------------------------------------------------------

def test_run_on_a_standard_distance_carries_the_previous_best(client, monkeypatch):
    http, db = client
    clock = use_clock(monkeypatch)
    owner, headers = runner(db, 'ana')
    first = logged(http, headers, 5000, '25:00')['run']
    clock['now'] = NOW + timedelta(hours=1)
    best = logged(http, headers, 5000, '24:10')['run']
    body = share_run(http, headers, best['id']).json()
    assert set(body) == RUN_KEYS
    assert (body['id'], body['distance_m'], body['standard_distance_km'], body['duration_s']) == (
        best['id'], 5000, 5, 1450)
    assert (body['pace_s_per_km'], body['previous_best_s'], body['mark_kind']) == (290, 1500, 'novo_melhor')
    assert body['date'] == TODAY.isoformat() and body['occurred_at'].startswith(TODAY.isoformat())
    assert body['origin'] == {'source': 'treino', 'label': 'Treino', 'event_id': None}
    # Registering the marks recalculated the 5 km ranking: best 24:10 is Ouro (<= 27:00), 130 s from Diamante
    # (22:00), the only one classified, so without Lendário slots.
    assert body['category'] == {'ranking': 'corrida_5', 'state': 'ranqueado', 'tier': 'ouro', 'tier_position': 1,
                                'tier_size': 1, 'played': 2, 'required': 1, 'progress': 0.5667,
                                'next_tier': 'diamante', 'gap': {'amount': 130.0, 'unit': 'segundos'}}
    opening = share_run(http, headers, first['id']).json()
    assert (opening['previous_best_s'], opening['mark_kind']) == (None, 'primeira_marca')


def test_run_outside_the_standard_distances_is_shareable_without_comparison(client, monkeypatch):
    http, db = client
    use_clock(monkeypatch)
    owner, headers = runner(db, 'ana')
    free = logged(http, headers, 7000, '40:00')['run']
    body = share_run(http, headers, free['id']).json()
    assert (body['distance_m'], body['standard_distance_km'], body['previous_best_s'], body['mark_kind']) == (
        7000, None, None, None)
    assert body['category'] is None
    assert timeline_items(http, headers, owner.id)[('corrida', free['id'])]['shareable'] is True

"""GET /users/{id}/timeline on PostgreSQL: privacy, court, filters, stable pagination across matches and runs,
the mark of each run against what `create_run` answered, counted stats and the exact shape of the contract."""
from datetime import datetime, timedelta, timezone

import pytest

from app.models.identity import Follow, UserBlock
from tests.integration.entry_helpers import make_event
from tests.integration.match_helpers import NOW, add, make_user
from tests.integration.partida.helpers import make_court
from tests.integration.profile_helpers import football, join, new_team, stat, tennis, walkover
from tests.integration.result_helpers import DAY, HOUR, lineup, login
from tests.integration.run_helpers import logged, mark, minutes, runner, use_clock

API = '/api/v1'
MATCH_KEYS = {'kind', 'id', 'sport', 'format', 'origin', 'state', 'occurred_at', 'sides', 'owner_side', 'score',
              'outcome', 'walkover_absent_side', 'points', 'stats', 'event', 'round_label', 'court'}
RUN_KEYS = {'kind', 'id', 'occurred_at', 'date', 'distance_m', 'standard_distance_km', 'duration_s',
            'pace_s_per_km', 'origin', 'previous_best_s', 'mark_kind'}


@pytest.fixture
def world(client):
    http, db = client
    owner = make_user(db, 'dono')
    team, rival = new_team(db, 'Time Dono'), new_team(db, 'Time Rival')
    join(db, team, owner)
    return http, db, owner, team, rival


def timeline(http, headers, user_id, **params):
    return http.get(f'{API}/users/{user_id}/timeline', params=params, headers=headers)


def ids(response):
    return [(item['kind'], item['id']) for item in response.json()['items']]


# ----- Access ------------------------------------------------------------------------------------------------------

def test_timeline_needs_a_session_and_an_existing_profile(world):
    http, db, owner, *_ = world
    assert http.get(f'{API}/users/{owner.id}/timeline').status_code == 401
    assert timeline(http, login(db, owner), 999999).status_code == 404


def test_privacy_follows_the_same_rule_as_the_posts(world):
    http, db, owner, team, rival = world
    football(db, team, rival, 1, 0)
    viewer = make_user(db, 'visitante')
    headers = login(db, viewer)
    assert timeline(http, login(db, owner), owner.id).status_code == 200                  # the owner
    assert timeline(http, headers, owner.id).status_code == 404                           # private, not following
    add(db, Follow(follower_id=viewer.id, followed_id=owner.id, approved=False))
    assert timeline(http, headers, owner.id).status_code == 404                           # request still pending
    db.query(Follow).update({'approved': True})
    db.flush()
    assert timeline(http, headers, owner.id).status_code == 200                           # approved follower
    add(db, UserBlock(blocker_id=owner.id, blocked_id=viewer.id))
    assert timeline(http, headers, owner.id).status_code == 404                           # blocked by the owner
    db.query(UserBlock).delete()
    add(db, UserBlock(blocker_id=viewer.id, blocked_id=owner.id))
    assert timeline(http, headers, owner.id).status_code == 404                           # the viewer blocked


def test_public_profile_is_open_to_any_member_and_blocks_still_win(world):
    http, db, owner, team, rival = world
    football(db, team, rival, 1, 0)
    owner.social_public = True
    stranger = make_user(db, 'estranho')
    db.flush()
    assert timeline(http, login(db, stranger), owner.id).json()['total'] == 1
    add(db, UserBlock(blocker_id=owner.id, blocked_id=stranger.id))
    assert timeline(http, login(db, stranger), owner.id).status_code == 404


def test_court_is_only_shown_to_the_owner_and_nothing_else_leaks(world):
    http, db, owner, team, rival = world
    match = football(db, team, rival, 2, 0)
    court = make_court(db, name='Quadra do Lago')
    match.court_id = court.id
    visitor = make_user(db, 'visitante')
    owner.social_public = True
    db.flush()
    own = timeline(http, login(db, owner), owner.id).json()['items'][0]
    seen = timeline(http, login(db, visitor), owner.id).json()['items'][0]
    assert own['court'] == {'name': 'Quadra do Lago'}
    assert seen['court'] is None
    assert set(own) == set(seen) == MATCH_KEYS
    assert set(own['stats'] or {}) <= {'position', 'goals', 'assists', 'position_stat'}
    assert set(own['sides'][0]) == {'side', 'kind', 'team', 'athlete', 'is_owner'}
    assert set(own['sides'][0]['team']) == {'id', 'name', 'initials', 'crest_url'}


# ----- Content -----------------------------------------------------------------------------------------------------

def test_match_items_carry_side_result_points_and_state(world):
    http, db, owner, team, rival = world
    win = football(db, team, rival, 2, 1, starts_at=NOW - 5 * DAY)
    loss = football(db, rival, team, 3, 0, starts_at=NOW - 4 * DAY)         # the owner's team is side b
    draw = football(db, team, rival, 1, 1, starts_at=NOW - 3 * DAY)
    unresolved = football(db, team, rival, 0, 0, starts_at=NOW - 2 * DAY, state='sem_resultado')
    cancelled = football(db, team, rival, 0, 0, starts_at=NOW - DAY, state='cancelada')
    items = {item['id']: item for item in timeline(http, login(db, owner), owner.id).json()['items']}
    assert [items[m.id]['outcome'] for m in (win, loss, draw)] == ['vitoria', 'derrota', 'empate']
    assert [items[m.id]['points'] for m in (win, loss, draw)] == [3, 0, 1]
    assert [items[m.id]['owner_side'] for m in (win, loss, draw)] == ['a', 'b', 'a']
    assert [side['is_owner'] for side in items[loss.id]['sides']] == [False, True]
    assert items[win.id]['score'] == {'a': 2, 'b': 1, 'sets': None, 'winner': 'a'}
    assert items[draw.id]['score']['winner'] is None
    for match, state in ((unresolved, 'sem_resultado'), (cancelled, 'cancelada')):
        item = items[match.id]
        assert item['state'] == state
        assert (item['score'], item['outcome'], item['points']) == (None, None, None)


def test_tennis_item_has_sets_and_ten_points(world):
    http, db, owner, *_ = world
    rival = make_user(db, 'rival')
    match = tennis(db, rival, owner, sets=[{'a': 3, 'b': 6}, {'a': 4, 'b': 6}])
    item = timeline(http, login(db, owner), owner.id).json()['items'][0]
    assert item['id'] == match.id and item['sport'] == 'tenis' and item['format'] is None
    assert (item['owner_side'], item['outcome'], item['points'], item['stats']) == ('b', 'vitoria', 10, None)
    assert item['score']['sets'][0] == {'a': 3, 'b': 6, 'tiebreak': None, 'super_tiebreak': False}
    assert [side['kind'] for side in item['sides']] == ['atleta', 'atleta']
    assert item['sides'][1]['athlete']['id'] == owner.id and item['sides'][1]['team'] is None


def test_walkover_names_the_absent_side_only_while_it_stands(world):
    http, db, owner, team, rival = world
    kept = walkover(db, team, rival, 'a', starts_at=NOW - 3 * DAY)               # the owner's side was absent
    annulled = walkover(db, team, rival, 'b', starts_at=NOW - 2 * DAY, decision='anulado')
    items = {item['id']: item for item in timeline(http, login(db, owner), owner.id).json()['items']}
    assert (items[kept.id]['walkover_absent_side'], items[kept.id]['outcome'], items[kept.id]['points']) == (
        'a', 'derrota', 0)
    assert items[kept.id]['stats'] is None
    assert items[annulled.id]['state'] == 'sem_resultado' and items[annulled.id]['walkover_absent_side'] is None


def test_only_counted_stats_appear(world):
    http, db, owner, team, rival = world
    sent = football(db, team, rival, 1, 0, starts_at=NOW - 4 * DAY)
    reviewed = football(db, team, rival, 1, 0, starts_at=NOW - 3 * DAY)
    contested = football(db, team, rival, 1, 0, starts_at=NOW - 2 * DAY)
    for match, state in ((sent, 'enviada'), (reviewed, 'revisada'), (contested, 'contestada')):
        line = lineup(db, match, owner, 'a', 'atacante', present=True, team_id=team.id)
        stat(db, line, state=state, reviewed=state != 'enviada', goals=2, assists=1, position_stat=3,
             contested_fields=['gols'] if state == 'contestada' else None)
    items = {item['id']: item for item in timeline(http, login(db, owner), owner.id).json()['items']}
    assert items[sent.id]['stats'] is None
    assert items[reviewed.id]['stats'] == {'position': 'atacante', 'goals': 2, 'assists': 1, 'position_stat': 3}
    assert items[contested.id]['stats'] == {'position': 'atacante', 'goals': None, 'assists': 1, 'position_stat': 3}


def test_championship_match_has_event_and_round_label(world):
    http, db, owner, team, rival = world
    event = make_event(db, owner.id, name='Copa Sudoeste', state='em_andamento')
    semi = football(db, team, rival, 2, 0, starts_at=NOW - 3 * DAY)
    final = football(db, team, rival, 1, 0, starts_at=NOW - DAY)
    for match, number in ((semi, 1), (final, 2)):
        match.origin, match.event_id, match.round_number, match.bracket_position = 'campeonato', event.id, number, 1
    db.flush()
    items = {item['id']: item for item in timeline(http, login(db, owner), owner.id).json()['items']}
    assert items[semi.id]['round_label'] == 'Semifinal' and items[final.id]['round_label'] == 'Final'
    assert items[semi.id]['event'] == {'id': event.id, 'name': 'Copa Sudoeste'}
    assert items[semi.id]['origin'] == 'campeonato'
    friendly = football(db, team, rival, 0, 0, starts_at=NOW - 6 * DAY)
    items = {item['id']: item for item in timeline(http, login(db, owner), owner.id).json()['items']}
    assert items[friendly.id]['event'] is None and items[friendly.id]['round_label'] is None


def test_filter_by_sport_and_total_respect_the_filter(world):
    http, db, owner, team, rival = world
    football(db, team, rival, 1, 0, starts_at=NOW - 3 * DAY)
    tennis(db, owner, make_user(db, 'rival'), starts_at=NOW - 2 * DAY)
    mark(db, owner, ran_on=NOW.date() - timedelta(days=1))
    headers = login(db, owner)
    everything = timeline(http, headers, owner.id).json()
    assert everything['total'] == 3 and len(everything['items']) == 3
    for sport, kind, total in (('futebol', 'partida', 1), ('tenis', 'partida', 1), ('corrida', 'corrida', 1)):
        page = timeline(http, headers, owner.id, sport=sport).json()
        assert page['total'] == total and [item['kind'] for item in page['items']] == [kind]
    assert [item['sport'] for item in timeline(http, headers, owner.id, sport='tenis').json()['items']] == ['tenis']
    assert timeline(http, headers, owner.id, sport='basquete').status_code == 422
    assert timeline(http, headers, owner.id, limit=51).status_code == 422
    assert timeline(http, headers, owner.id, cursor='lixo').status_code == 422


def test_total_counts_beyond_the_page(world):
    http, db, owner, team, rival = world
    for index in range(5):
        football(db, team, rival, 1, 0, starts_at=NOW - (index + 1) * DAY)
    page = timeline(http, login(db, owner), owner.id, limit=2).json()
    assert page['total'] == 5 and len(page['items']) == 2 and page['next_cursor']


# ----- Pagination --------------------------------------------------------------------------------------------------

def test_pages_are_stable_across_matches_and_runs_on_the_same_day(world):
    http, db, owner, team, rival = world
    day = datetime(2026, 10, 10, tzinfo=timezone.utc)
    football(db, team, rival, 1, 0, starts_at=day + 3 * HOUR)            # exactly at the Brasília midnight of the runs
    football(db, team, rival, 2, 0, starts_at=day + 12 * HOUR)
    football(db, team, rival, 0, 1, starts_at=day + 12 * HOUR)           # same instant: the id breaks the tie
    for seconds in (1500, 1490, 1480):
        mark(db, owner, duration_s=seconds, ran_on=day.date())
    mark(db, owner, ran_on=day.date() - timedelta(days=1))
    football(db, team, rival, 3, 3, starts_at=day - 30 * HOUR)
    headers = login(db, owner)
    full = timeline(http, headers, owner.id, limit=50)
    assert full.json()['total'] == 8 and full.json()['next_cursor'] is None
    expected = ids(full)
    assert len(set(expected)) == 8
    for size in (1, 2, 3, 5):
        collected, cursor = [], None
        for _ in range(20):
            params = {'limit': size, **({'cursor': cursor} if cursor else {})}
            page = timeline(http, headers, owner.id, **params)
            assert page.status_code == 200
            collected += ids(page)
            cursor = page.json()['next_cursor']
            if cursor is None:
                break
        assert collected == expected, size
    # order: newest first; on the same instant 'corrida' comes before 'partida' and the id decreases
    stamps = [datetime.fromisoformat(item['occurred_at']) for item in full.json()['items']]
    assert stamps == sorted(stamps, reverse=True)
    assert [kind for kind, _ in expected] == ['partida', 'partida', 'corrida', 'corrida', 'corrida', 'partida',
                                              'corrida', 'partida']
    assert [item_id for _, item_id in expected[:2]] == sorted((item_id for _, item_id in expected[:2]), reverse=True)


# ----- Runs --------------------------------------------------------------------------------------------------------

def test_run_marks_equal_what_create_run_answered(client, monkeypatch):
    http, db = client
    clock = use_clock(monkeypatch)
    owner, headers = runner(db, 'ana')
    answered = {}

    def register(distance_m=5000, duration='25:00', **extra):
        created = logged(http, headers, distance_m, duration, **extra)
        answered[created['run']['id']] = (created['impact']['kind'], created['impact']['previous_best_s'],
                                          created['run']['standard_distance_km'])

    register()                                                           # first mark
    clock['now'] = NOW + HOUR
    register(duration='26:00')                                           # slower: no gain
    clock['now'] = NOW + 2 * HOUR
    register(duration='24:00')                                           # new best
    clock['now'] = NOW + 3 * HOUR
    register(distance_m=7000, duration='40:00')                          # outside every band
    clock['now'] = NOW + 4 * HOUR
    register(duration='25:30', date=(NOW - 20 * DAY).date().isoformat())  # backdated: still compares with the best
    clock['now'] = NOW + 5 * HOUR
    register(distance_m=10000, duration='55:00')                         # another distance: its own first mark
    clock['now'] = NOW + 60 * 7 * DAY
    register(duration='30:00')                                           # everything else left the 52 weeks
    page = timeline(http, headers, owner.id, sport='corrida', limit=50)
    items = {item['id']: item for item in page.json()['items']}
    assert set(items) == set(answered) and len(items) == 7
    for run_id, (kind, previous, standard) in answered.items():
        item = items[run_id]
        assert item['previous_best_s'] == previous, run_id
        assert item['mark_kind'] == (None if kind == 'fora_do_ranking' else kind), run_id
        assert item['standard_distance_km'] == standard
        assert set(item) == RUN_KEYS
    assert sorted(item['mark_kind'] for item in items.values() if item['mark_kind']).count('primeira_marca') == 3
    assert [item['previous_best_s'] for item in items.values() if item['distance_m'] == 7000] == [None]


def test_run_item_shows_pace_origin_and_midnight_utc(client, monkeypatch):
    http, db = client
    use_clock(monkeypatch)
    owner, headers = runner(db, 'ana')
    logged(http, headers, 5000, '25:00')
    item = timeline(http, headers, owner.id).json()['items'][0]
    assert item['date'] == '2026-10-12' and item['occurred_at'].startswith('2026-10-12T00:00:00')
    assert item['pace_s_per_km'] == 300 and item['origin'] == {'source': 'treino', 'label': 'Treino', 'event_id': None}
    assert minutes('25:00') == item['duration_s']
    # a visitor sees the runs too (a run has no place)
    owner.social_public = True
    visitor = make_user(db, 'visitante')
    db.flush()
    assert timeline(http, login(db, visitor), owner.id).json()['items'][0]['id'] == item['id']


def test_a_run_is_placed_at_the_brasilia_midnight_of_its_day(world):
    http, db, owner, team, rival = world
    evening = datetime(2026, 10, 1, 1, 0, tzinfo=timezone.utc)           # 30 Sep 22:00 in Brasília
    match = football(db, team, rival, 1, 0, starts_at=evening)
    run = mark(db, owner, ran_on=evening.date())                         # 1 Oct, Brasília midnight = 03:00 UTC
    headers = login(db, owner)
    full = timeline(http, headers, owner.id)
    assert ids(full) == [('corrida', run.id), ('partida', match.id)]
    assert full.json()['items'][0]['occurred_at'].endswith('-03:00')
    first = timeline(http, headers, owner.id, limit=1)
    second = timeline(http, headers, owner.id, limit=1, cursor=first.json()['next_cursor'])
    assert ids(first) + ids(second) == ids(full) and second.json()['next_cursor'] is None

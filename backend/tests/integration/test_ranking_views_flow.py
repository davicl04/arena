"""`GET /rankings` by tier and `GET /rankings/overview` on PostgreSQL (Ranking screen): the counts per tier, the
position inside a tier, the cursor inside a tier, the window around the viewer, the gaps, the viewer's teams, the
Salão preview and the visibility of the athletes.

The ranking rows are written straight to `standings` (a controlled layout of tiers), except in the last test,
which goes through the real recalculation.
"""
import re
import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import event as sa_event
from sqlalchemy import select

from app.models.identity import MediaObject, UserBlock
from app.models.rankings import RankCut, Standing
from app.models.teams import TeamMember
from app.services.standings import RankingKey, recalculate_rankings
from tests.integration.match_helpers import NOW, add, make_team, make_user
from tests.integration.result_helpers import DAY, login, played

API = '/api/v1'
SOCIETY = 'sport=futebol&kind=time&format=society'
FORMS = ['VVVVV', 'VVVVE', 'VVVED', 'VVEDV', 'VEDVV', 'EDVVV', 'DVVVV', 'DDVVV', 'DDDVV', 'DDDDV', 'DDDDD', 'VDVDV',
         'V', 'VE', 'EEE', 'VVVV']
# (tier, how many): ranks 1, 2-3, 4-6, 7 and 8-16. The metric of rank r is 105 - 5r points.
LAYOUT = [('lendario', 1), ('diamante', 2), ('ouro', 3), ('prata', 1), ('bronze', 9)]


def metric(rank):
    return 105 - 5 * rank


def standing(db, *, rank, tier, value, form='', fmt='society', team=None, user=None, sport='futebol', position=None,
             distance_km=None, best_mark_on=None):
    return add(db, Standing(
        team_id=team.id if team else None, user_id=user.id if user else None, sport=sport,
        format=fmt if sport == 'futebol' else None, position=position, distance_km=distance_km, metric_value=value,
        matches_played=5, wins=3, draws=1, losses=1, goals_for=9 if team else 0, goals_against=4 if team else 0,
        rank_position=rank, tier=tier, calc_version=1, recent_form=form, best_mark_on=best_mark_on))


@pytest.fixture
def world(client, monkeypatch):
    """Sixteen teams of the society ranking (rank 1 to 16) laid out in tiers; `reps[r]` represents the team of
    rank r. The viewer `me` represents rank 5 (Ouro, 2nd of 3) and is a member of rank 12 (Bronze, 5th of 9)."""
    http, db = client
    teams, reps = {}, {}
    rank = 0
    for tier, size in LAYOUT:
        for _ in range(size):
            rank += 1
            reps[rank] = make_user(db, f'rep{rank}')
            teams[rank] = make_team(db, reps[rank], name=f'Time {rank}')
            standing(db, rank=rank, tier=tier, value=metric(rank), form=FORMS[rank - 1], team=teams[rank])
    add(db, TeamMember(team_id=teams[12].id, user_id=reps[5].id, role='membro', joined_via='convite'))
    headers = {rank: login(db, user) for rank, user in reps.items()}
    stranger = make_user(db, 'sem-time')
    db.commit()
    return SimpleNamespace(http=http, db=db, teams=teams, reps=reps, h=headers, stranger=stranger,
                           stranger_h=login(db, stranger))


def overview(w, who, query=SOCIETY, **params):
    suffix = ''.join(f'&{key}={value}' for key, value in params.items())
    headers = w.h[who] if isinstance(who, int) else who
    return w.http.get(f'{API}/rankings/overview?{query}{suffix}', headers=headers)


# ----- GET /rankings: counts, positions, forms and the tier filter -----------------------------------------------------

def test_the_page_carries_the_counts_per_tier_the_position_inside_the_tier_and_the_form(world):
    w = world
    page = w.http.get(f'{API}/rankings?{SOCIETY}&limit=50', headers=w.h[5]).json()
    assert page['tier_counts'] == {'bronze': 9, 'prata': 1, 'ouro': 3, 'diamante': 2, 'lendario': 1}
    assert (page['classified_count'], page['legend_slots'], page['next_cursor']) == (16, 2, None)
    assert [item['rank_position'] for item in page['items']] == list(range(1, 17))
    assert [item['tier_position'] for item in page['items']] == [1, 1, 2, 1, 2, 3, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    assert [item['form'] for item in page['items']][:3] == [list('VVVVV'), list('VVVVE'), list('VVVED')]
    assert page['items'][12]['form'] == ['V'] and page['items'][4]['is_mine'] and page['items'][11]['is_mine']
    assert all(item['best_mark_on'] is None for item in page['items'])
    # Both lines of the viewer carry the place inside the tier and the gaps (Ouro: 85, 80, 75).
    ouro, bronze = page['mine']
    assert (ouro['team']['name'], ouro['tier'], ouro['rank_position'], ouro['tier_position'], ouro['tier_size'],
            ouro['leader_gap'], ouro['next_gap'], ouro['next_tier_position']) == (
        'Time 5', 'ouro', 5, 2, 3, 5.0, 5.0, 3)
    assert (bronze['team']['name'], bronze['tier_position'], bronze['tier_size'], bronze['leader_gap'],
            bronze['next_gap'], bronze['next_tier_position']) == ('Time 12', 5, 9, 20.0, 5.0, 6)


def test_a_tier_filters_and_paginates_with_the_cursor_inside_it(world):
    w = world
    first = w.http.get(f'{API}/rankings?{SOCIETY}&tier=bronze&limit=4', headers=w.h[5]).json()
    assert [(item['rank_position'], item['tier_position'], item['tier']) for item in first['items']] == [
        (8, 1, 'bronze'), (9, 2, 'bronze'), (10, 3, 'bronze'), (11, 4, 'bronze')]
    assert first['next_cursor'] and first['classified_count'] == 16 and first['tier_counts']['bronze'] == 9
    second = w.http.get(f"{API}/rankings?{SOCIETY}&tier=bronze&limit=4&cursor={first['next_cursor']}",
                        headers=w.h[5]).json()
    assert [item['tier_position'] for item in second['items']] == [5, 6, 7, 8]
    last = w.http.get(f"{API}/rankings?{SOCIETY}&tier=bronze&limit=4&cursor={second['next_cursor']}",
                      headers=w.h[5]).json()
    assert [(item['rank_position'], item['tier_position']) for item in last['items']] == [(16, 9)]
    assert last['next_cursor'] is None
    # Every tier counts from 1; a cursor from another tier simply finds nothing above it.
    for tier, ranks in (('lendario', [1]), ('diamante', [2, 3]), ('ouro', [4, 5, 6]), ('prata', [7])):
        items = w.http.get(f'{API}/rankings?{SOCIETY}&tier={tier}', headers=w.h[5]).json()['items']
        assert [item['rank_position'] for item in items] == ranks
        assert [item['tier_position'] for item in items] == list(range(1, len(ranks) + 1))
    beyond = w.http.get(f"{API}/rankings?{SOCIETY}&tier=lendario&cursor={first['next_cursor']}", headers=w.h[5])
    assert beyond.json()['items'] == []
    assert w.http.get(f'{API}/rankings?{SOCIETY}&tier=mestre', headers=w.h[5]).status_code == 422


def test_a_category_without_rows_has_zero_counts_and_the_placement_lines_of_the_viewer(world):
    w = world
    page = w.http.get(f'{API}/rankings?sport=futebol&kind=time&format=futsal', headers=w.h[5]).json()
    assert page['tier_counts'] == dict.fromkeys(('bronze', 'prata', 'ouro', 'diamante', 'lendario'), 0)
    assert page['items'] == [] and page['classified_count'] == 0
    assert [(line['state'], line['tier_position'], line['leader_gap'], line['next_gap']) for line in page['mine']] == [
        ('sem_jogos', None, None, None)] * 2


# ----- GET /rankings/overview ---------------------------------------------------------------------------------------

def test_the_overview_opens_on_the_team_the_viewer_represents_with_the_window_inside_the_tier(world):
    w = world
    response = overview(w, 5)
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body['ranking'], body['format'], body['position'], body['distance_km'], body['calc_version'],
            body['required'], body['classified_count'], body['legend_slots']) == (
        'futebol_time', 'society', None, None, 1, 3, 16, 2)
    assert body['tier_counts'] == {'bronze': 9, 'prata': 1, 'ouro': 3, 'diamante': 2, 'lendario': 1}
    assert [line['team']['name'] for line in body['mine']] == ['Time 5', 'Time 12']     # the representative first
    assert body['selected_team_id'] == w.teams[5].id
    # Ouro has three: the window is the whole tier (positions 1 to 3 = ranks 4 to 6), the viewer marked.
    assert [(row['rank_position'], row['tier_position'], row['is_mine']) for row in body['window']] == [
        (4, 1, False), (5, 2, True), (6, 3, False)]
    assert body['window'][0]['team']['name'] == 'Time 4' and body['window'][0]['form'] == list('VVEDV')
    assert [item['team']['name'] for item in body['legends_preview']] == ['Time 1']
    assert set(body['legends_preview'][0]) == {'team', 'athlete'} and body['legends_preview'][0]['athlete'] is None


def test_team_id_picks_the_team_of_the_plate_and_the_window_reaches_three_each_way(world):
    w = world
    body = overview(w, 5, team_id=w.teams[12].id).json()
    assert body['selected_team_id'] == w.teams[12].id
    # 5th of 9 in Bronze: positions 2 to 8 (ranks 9 to 15), three above and three below.
    assert [(row['rank_position'], row['tier_position']) for row in body['window']] == [
        (rank, rank - 7) for rank in range(9, 16)]
    assert [row['is_mine'] for row in body['window']] == [False, False, False, True, False, False, False]
    assert [line['team']['name'] for line in body['mine']] == ['Time 5', 'Time 12']


@pytest.mark.parametrize('rank, window, leader_gap, next_gap, next_position', [
    (1, [1], None, None, None),                                  # the only Lendário
    (7, [7], None, None, None),                                  # the only Prata
    (2, [2, 3], None, 5.0, 2),                                   # first of two
    (3, [2, 3], 5.0, None, None),                                # last of two
    (8, [8, 9, 10, 11], None, 5.0, 2),                           # first of nine
    (16, [13, 14, 15, 16], 40.0, None, None),                    # last of nine
    (4, [4, 5, 6], None, 5.0, 2),                                # first of three
    (6, [4, 5, 6], 10.0, None, None),                            # last of three
])
def test_the_window_and_the_gaps_at_the_ends_of_small_and_large_tiers(world, rank, window, leader_gap, next_gap,
                                                                      next_position):
    w = world
    body = overview(w, rank).json()
    assert body['selected_team_id'] == w.teams[rank].id
    assert [row['rank_position'] for row in body['window']] == window
    [line] = [line for line in body['mine'] if line['team']['id'] == w.teams[rank].id]
    assert (line['leader_gap'], line['next_gap'], line['next_tier_position']) == (leader_gap, next_gap, next_position)
    assert sum(row['is_mine'] for row in body['window']) == 1


def test_a_team_that_is_not_an_active_team_of_the_viewer_is_not_found(world):
    w = world
    other = overview(w, 5, team_id=w.teams[2].id)                  # someone else's team
    assert (other.status_code, other.json()['detail']) == (404, 'Time não encontrado.')
    assert overview(w, 5, team_id=999999).status_code == 404
    # A team the viewer left or that was closed no longer counts.
    closed = make_team(w.db, w.reps[5], name='Encerrado FC')
    closed.state, closed.closed_at = 'encerrado', NOW
    left = make_team(w.db, w.reps[5], name='Saiu FC')
    membership = w.db.scalar(select(TeamMember).where(TeamMember.team_id == left.id))
    membership.left_at, membership.left_reason = NOW, 'saiu'
    w.db.commit()
    assert overview(w, 5, team_id=closed.id).status_code == 404
    assert overview(w, 5, team_id=left.id).status_code == 404
    assert [line['team']['name'] for line in overview(w, 5).json()['mine']] == ['Time 5', 'Time 12']
    # The same check holds in a ranking that is not of teams; a valid team there selects nothing.
    assert overview(w, 5, 'sport=tenis', team_id=w.teams[2].id).status_code == 404
    tennis = overview(w, 5, 'sport=tenis', team_id=w.teams[5].id).json()
    assert (tennis['selected_team_id'], tennis['window'], tennis['mine'][0]['team']) == (None, None, None)


def test_several_teams_with_the_representative_first_and_a_selected_team_in_placement(world):
    w = world
    # The representative comes first, then the oldest membership: Time 12, then the newest.
    first = make_team(w.db, w.reps[2], w.reps[5], name='Veterano FC')
    placement = standing(w.db, rank=None, tier=None, value=3, form='VE', team=first)
    placement.matches_played = 2
    w.db.commit()
    body = overview(w, 5).json()
    assert [line['team']['name'] for line in body['mine']] == ['Time 5', 'Time 12', 'Veterano FC']
    assert body['selected_team_id'] == w.teams[5].id and body['window'] is not None
    line = body['mine'][2]
    assert (line['state'], line['tier'], line['rank_position'], line['played'], line['tier_position'],
            line['tier_size'], line['leader_gap'], line['next_gap'], line['next_tier_position']) == (
        'classificacao', None, None, 2, None, None, None, None, None)
    # Asking for the team in placement: no tier, so no window.
    chosen = overview(w, 5, team_id=first.id).json()
    assert (chosen['selected_team_id'], chosen['window']) == (first.id, None)


def test_a_viewer_without_ranked_lines_has_no_window(world):
    w = world
    nobody = overview(w, w.stranger_h).json()
    assert (nobody['mine'], nobody['selected_team_id'], nobody['window']) == ([], None, None)
    assert nobody['classified_count'] == 16 and len(nobody['tier_counts']) == 5
    assert [item['team']['name'] for item in nobody['legends_preview']] == ['Time 1']
    # A team without any game in the category: "sem jogos", still selected.
    fresh = make_team(w.db, w.stranger, name='Recem Chegado')
    w.db.commit()
    body = overview(w, w.stranger_h).json()
    assert (body['selected_team_id'], body['window'], [line['state'] for line in body['mine']]) == (
        fresh.id, None, ['sem_jogos'])
    assert (body['mine'][0]['tier_position'], body['mine'][0]['leader_gap']) == (None, None)


def test_the_salao_preview_has_up_to_four_legends_in_order_and_is_empty_without_places(world):
    w = world
    # Twenty football teams of another format, the first five Lendário.
    for rank in range(1, 21):
        owner = make_user(w.db, f'campo{rank}')
        standing(w.db, rank=rank, tier='lendario' if rank <= 5 else 'bronze', value=200 - rank, fmt='campo',
                 team=make_team(w.db, owner, name=f'Campo {rank}'))
    # Three teams in futsal: fewer than seven classified, no places and nobody in the Salão.
    for rank in range(1, 4):
        standing(w.db, rank=rank, tier='bronze', value=10 - rank, fmt='futsal',
                 team=make_team(w.db, make_user(w.db, f'futsal{rank}'), name=f'Futsal {rank}'))
    w.db.commit()
    campo = overview(w, w.stranger_h, 'sport=futebol&kind=time&format=campo').json()
    assert (campo['legend_slots'], campo['tier_counts']['lendario']) == (3, 5)
    assert [item['team']['name'] for item in campo['legends_preview']] == [f'Campo {rank}' for rank in range(1, 5)]
    futsal = overview(w, w.stranger_h, 'sport=futebol&kind=time&format=futsal').json()
    assert (futsal['legend_slots'], futsal['legends_preview'], futsal['classified_count']) == (0, [], 3)
    empty = overview(w, w.stranger_h, 'sport=tenis').json()
    assert (empty['classified_count'], empty['legends_preview'], empty['window']) == (0, [], None)
    assert empty['tier_counts'] == dict.fromkeys(('bronze', 'prata', 'ouro', 'diamante', 'lendario'), 0)


def test_the_overview_validates_the_category_and_needs_a_session(world):
    w = world
    for query, message in (('sport=futebol', 'Escolha se o ranking é de times ou individual.'),
                           ('sport=futebol&kind=time', 'Escolha o formato.'),
                           ('sport=futebol&kind=individual&format=campo', 'Escolha a posição.'),
                           ('sport=corrida', 'Escolha a distância.'), ('sport=corrida&distance_km=7', 'Distância inválida.')):
        response = overview(w, 5, query)
        assert (response.status_code, response.json()['detail']) == (422, message), query
    assert w.http.get(f'{API}/rankings/overview?{SOCIETY}').status_code == 401


# ----- Athletes: individual, tennis and running -------------------------------------------------------------------------

def test_athlete_rankings_show_the_person_with_the_visibility_of_the_list_and_no_goals(world):
    w = world
    me, friend, blocked, gone = (make_user(w.db, name) for name in ('eu', 'amigo', 'bloqueado', 'inativo'))
    for user in (friend, blocked, gone):
        media = add(w.db, MediaObject(id=uuid.uuid4(), user_id=user.id, bucket='arena', size_bytes=10, width=1,
                                      height=1, object_key=f'avatars/{uuid.uuid4()}.webp', content_type='image/webp'))
        user.avatar_media_id = media.id
    gone.active = False
    add(w.db, UserBlock(blocker_id=me.id, blocked_id=blocked.id))
    for rank, user in enumerate((friend, me, blocked, gone), start=1):
        standing(w.db, rank=rank, tier='ouro', value=8 - rank, form='VVD', user=user, sport='tenis')
    headers = login(w.db, me)
    w.db.commit()
    for body in (overview(w, headers, 'sport=tenis').json(),
                 w.http.get(f'{API}/rankings?sport=tenis', headers=headers).json()):
        rows = body['window'] if 'window' in body else body['items']
        assert [row['athlete']['name'] for row in rows] == [f'Atleta {name}' for name in ('amigo', 'eu', 'bloqueado',
                                                                                         'inativo')]
        # The avatar is hidden by a block and for an inactive account; the name stays (me has no avatar).
        avatars = [row['athlete']['avatar_url'] for row in rows]
        assert avatars[0].startswith('/api/v1/users/') and avatars[1:] == [None, None, None]
        assert [row['is_mine'] for row in rows] == [False, True, False, False]
        assert all(row['team'] is None and row['form'] == list('VVD') for row in rows)
    page = overview(w, headers, 'sport=tenis').json()
    assert (page['selected_team_id'], page['mine'][0]['team'], page['mine'][0]['tier_position']) == (None, None, 2)


def test_individual_rows_have_no_goals(world):
    w = world
    me = make_user(w.db, 'goleiro')
    standing(w.db, rank=1, tier='bronze', value=2, form='EV', user=me, position='goleiro')
    headers = login(w.db, me)
    w.db.commit()
    body = overview(w, headers, 'sport=futebol&kind=individual&format=society&position=goleiro').json()
    [row] = body['window']
    assert (row['goals_for'], row['goals_against'], row['form'], row['team'], row['athlete']['id']) == (
        None, None, ['E', 'V'], None, me.id)
    assert body['mine'][0]['tier_position'] == 1 and body['selected_team_id'] is None


def test_running_gaps_are_times_the_form_is_null_and_the_best_mark_day_is_there(world):
    w = world
    runners = [make_user(w.db, f'corre{i}') for i in range(3)]
    for rank, (user, seconds) in enumerate(zip(runners, (1200, 1242, 1300)), start=1):
        standing(w.db, rank=rank, tier='ouro', value=seconds, user=user, sport='corrida', distance_km=5,
                 best_mark_on=NOW.date() - rank * DAY)
    headers = login(w.db, runners[1])
    w.db.commit()
    body = overview(w, headers, 'sport=corrida&distance_km=5').json()
    [line] = body['mine']
    assert (line['tier_position'], line['tier_size'], line['leader_gap'], line['next_gap'],
            line['next_tier_position']) == (2, 3, 42.0, 58.0, 3)
    assert [(row['metric_value'], row['form'], row['best_mark_on'], row['goals_for']) for row in body['window']] == [
        (1200.0, None, '2026-10-11', None), (1242.0, None, '2026-10-10', None), (1300.0, None, '2026-10-09', None)]
    page = w.http.get(f'{API}/rankings?sport=corrida&distance_km=5&tier=ouro', headers=headers).json()
    assert [(item['tier_position'], item['best_mark_on'], item['form']) for item in page['items']] == [
        (1, '2026-10-11', None), (2, '2026-10-10', None), (3, '2026-10-09', None)]


# ----- Reading the stored columns ---------------------------------------------------------------------------------------

def test_the_reads_use_the_stored_form_and_never_look_at_the_matches(world):
    w = world
    connection = w.db.get_bind()
    statements: list[str] = []

    def listener(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    sa_event.listen(connection, 'before_cursor_execute', listener)
    try:
        assert w.http.get(f'{API}/rankings?{SOCIETY}&tier=ouro', headers=w.h[5]).status_code == 200
        assert overview(w, 5).status_code == 200
        assert overview(w, 5, 'sport=corrida&distance_km=10').status_code == 200
    finally:
        sa_event.remove(connection, 'before_cursor_execute', listener)
    assert statements
    assert not [sql for sql in statements if re.search(r'\b(FROM|JOIN)\s+(matches|match_sides|match_lineups|runs)\b', sql)]
    # The form shown is the column, not a recomputation: change it and the read follows.
    row = w.db.scalar(select(Standing).where(Standing.team_id == w.teams[5].id))
    row.recent_form = 'DDDDD'
    w.db.commit()
    assert overview(w, 5).json()['window'][1]['form'] == list('DDDDD')


# ----- Through the real recalculation -------------------------------------------------------------------------------------

def test_the_overview_follows_a_real_recalculation(client):
    http, db = client
    # Low cuts (as in the Lendário recalculation test) so that nine points are Diamante.
    cut = db.scalar(select(RankCut).where(RankCut.ranking == 'futebol_time', RankCut.calc_version == 1))
    cut.prata, cut.ouro, cut.diamante = 2, 4, 6
    db.flush()
    reps = []
    for index in range(1, 5):
        reps.append(make_user(db, f'campeao{index}'))
        winner = make_team(db, reps[-1], name=f'Campeao {index}')
        loser = make_team(db, make_user(db, f'reserva{index}'), name=f'Reserva {index}')
        for number in range(3):
            played(db, winner, loser, index, 0, starts_at=NOW - (number + 1) * DAY)
    recalculate_rankings(db, [RankingKey('futebol_time', 'society')], now=NOW)
    headers = login(db, reps[3])
    db.commit()
    response = http.get(f'{API}/rankings/overview?{SOCIETY}', headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    # Eight classified, one place: the best goal difference is the Lendário, the other winners are Diamante.
    assert body['tier_counts'] == {'bronze': 4, 'prata': 0, 'ouro': 0, 'diamante': 3, 'lendario': 1}
    assert body['legend_slots'] == 1
    [line] = body['mine']
    assert (line['team']['name'], line['tier'], line['rank_position'], line['tier_position'], line['tier_size']) == (
        'Campeao 4', 'lendario', 1, 1, 1)
    assert body['selected_team_id'] == line['team']['id']
    assert [row['team']['name'] for row in body['legends_preview']] == ['Campeao 4']
    assert [row['form'] for row in body['window']] == [list('VVV')]
    diamante = http.get(f'{API}/rankings?{SOCIETY}&tier=diamante', headers=headers).json()['items']
    assert [(item['team']['name'], item['tier_position'], item['form']) for item in diamante] == [
        ('Campeao 3', 1, list('VVV')), ('Campeao 2', 2, list('VVV')), ('Campeao 1', 3, list('VVV'))]

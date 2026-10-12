from app.models.rankings import Standing
from app.models.teams import Team, TeamMember
from app.services.rankings import team_format_grid

PASSWORD = 'standings-test-password'
POSITIONS = ['goleiro', 'defesa', 'meio_campo', 'atacante']
FORMATS = ['futsal', 'society', 'campo']
ALL_TIERS = ['bronze', 'prata', 'ouro', 'diamante', 'lendario']


def register(http, email):
    data = {'name': 'Atleta Elo', 'email': email, 'birth_date': '1992-03-04', 'password': PASSWORD}
    assert http.post('/api/v1/auth/register', json=data).status_code == 201
    response = http.post('/api/v1/auth/login', json={'email': email, 'password': PASSWORD})
    return {'Authorization': f"Bearer {response.json()['token']}"}, response.json()['user']['id']


def test_empty_standings_put_every_category_in_placement(client):
    http, _ = client
    headers, _ = register(http, 'elo-vazio@example.com')
    assert http.get('/api/v1/me/standings').status_code == 401
    response = http.get('/api/v1/me/standings', headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body['calc_version'] == 1 and body['futebol']['teams'] == []
    assert [(item['position'], item['format']) for item in body['futebol']['individual']] == [
        (position, fmt) for position in POSITIONS for fmt in FORMATS]
    lines = [*body['futebol']['individual'], body['tenis'], *body['corrida']]
    assert all(line['tier'] is None and line['played'] == 0 and line['faces_any_level'] and line['faces'] == ALL_TIERS
               and line['rank_position'] is None and line['metric_value'] is None for line in lines)
    assert {line['state'] for line in body['futebol']['individual']} == {'sem_jogos'}
    assert body['tenis']['state'] == 'sem_jogos' and body['tenis']['required'] == 3
    assert [(line['distance_km'], line['state'], line['required']) for line in body['corrida']] == [
        (3, 'sem_marca', 1), (5, 'sem_marca', 1), (10, 'sem_marca', 1), (21, 'sem_marca', 1), (42, 'sem_marca', 1)]


def test_team_lines_follow_active_memberships_and_stored_tiers(client):
    http, db = client
    headers, user_id = register(http, 'elo-time@example.com')
    member_of = Team(name='Amigos do Lago', city_id=5300108, state='ativo')
    represents = Team(name='Ferrugem FC', city_id=5300108, state='ativo')
    left = Team(name='Antigo Time', city_id=5300108, state='ativo')
    db.add_all([member_of, represents, left])
    db.flush()
    db.add_all([
        TeamMember(team_id=member_of.id, user_id=user_id, role='membro', joined_via='convite'),
        TeamMember(team_id=represents.id, user_id=user_id, role='representante', joined_via='criacao'),
        TeamMember(team_id=left.id, user_id=user_id, role='membro', joined_via='convite', left_at=left.created_at,
                   left_reason='saiu'),
        Standing(team_id=represents.id, sport='futebol', format='society', metric_value=17, matches_played=9,
                 rank_position=4, tier='prata', calc_version=1),
        Standing(team_id=represents.id, sport='futebol', format='futsal', metric_value=3, matches_played=1,
                 calc_version=1),
        Standing(user_id=user_id, sport='tenis', metric_value=40, matches_played=5, rank_position=2, tier='prata',
                 calc_version=1),
        Standing(user_id=user_id, sport='corrida', distance_km=5, metric_value=1452, matches_played=1,
                 rank_position=10, tier='ouro', calc_version=1),
    ])
    db.commit()

    body = http.get('/api/v1/me/standings', headers=headers).json()
    teams = body['futebol']['teams']
    assert [(item['team']['name'], item['my_role']) for item in teams] == [
        ('Ferrugem FC', 'representante'), ('Amigos do Lago', 'membro')]
    assert teams[0]['team'] == {'id': represents.id, 'name': 'Ferrugem FC', 'initials': 'FF', 'crest_url': None}
    futsal, society, campo = teams[0]['formats']
    assert (futsal['state'], futsal['played'], futsal['tier']) == ('classificacao', 1, None)
    assert (society['state'], society['tier'], society['faces'], society['faces_any_level']) == (
        'ranqueado', 'prata', ['bronze', 'prata', 'ouro'], False)
    assert campo['state'] == 'sem_jogos'
    assert body['tenis']['state'] == 'ranqueado' and body['tenis']['faces'] == ['bronze', 'prata', 'ouro']
    five = next(line for line in body['corrida'] if line['distance_km'] == 5)
    assert (five['state'], five['tier'], five['metric_value']) == ('ranqueado', 'ouro', 1452.0)

    grid = team_format_grid(db, [represents.id, member_of.id])
    assert [item.state for item in grid[member_of.id]] == ['sem_jogos'] * 3
    assert [item.state for item in grid[represents.id]] == ['classificacao', 'ranqueado', 'sem_jogos']

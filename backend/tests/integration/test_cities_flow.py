"""Catálogo nacional de cidades: dados migrados, busca por nome/UF, consulta por IDs, cidade mais próxima e cidade
do perfil esportivo."""
import time

from sqlalchemy import func, select

from app.models.identity import City
from tests.integration.team_helpers import PASSWORD, register

ORIGINAL = {5300108: ('Brasília', 'DF'), 3550308: ('São Paulo', 'SP'), 3304557: ('Rio de Janeiro', 'RJ'),
            2304400: ('Fortaleza', 'CE'), 3106200: ('Belo Horizonte', 'MG'), 5208707: ('Goiânia', 'GO')}
SANTA_RITA = [2110203, 2513703, 3159209, 2928406, 3159407, 3159308, 3159357, 5219407, 3159506, 5219456,
              5007554, 3547502, 3159605, 1718899, 5107768, 3547403, 2207959, 4313375]


def search(http, q):
    response = http.get('/api/v1/cities', params={'q': q})
    assert response.status_code == 200, response.text
    return response.json()


def test_migration_loads_every_municipality_and_keeps_the_original_ids(client):
    _, db = client
    assert db.scalar(select(func.count()).select_from(City)) == 5571
    assert db.scalar(select(func.count()).select_from(City).where(City.capital)) == 27
    assert db.scalar(select(func.count()).select_from(City).where(
        (City.latitude.is_(None)) | (City.longitude.is_(None)) | (City.search_text.is_(None)))) == 0
    originals = {city.id: city for city in db.scalars(select(City).where(City.id.in_(ORIGINAL)))}
    assert {key: (city.name, city.state) for key, city in originals.items()} == ORIGINAL
    assert all(city.capital for city in originals.values())
    brasilia = originals[5300108]
    assert (round(brasilia.latitude, 2), round(brasilia.longitude, 2)) == (-15.78, -47.93)
    assert brasilia.search_text == 'brasilia df'
    assert db.get(City, 1100015).search_text == 'alta floresta doeste ro'


def test_search_ignores_accents_case_and_matches_the_state(client):
    http, _ = client
    for q in ('goiania', 'GOIÂNIA', '  Goiânia '):
        found = search(http, q)
        assert found[0] == {'id': 5208707, 'name': 'Goiânia', 'state': 'GO'}
        assert 'Aparecida de Goiânia' in [city['name'] for city in found]
    assert search(http, 'sao paulo sp')[0]['id'] == 3550308
    assert search(http, 'São Paulo - SP')[0]['id'] == 3550308
    assert [city['id'] for city in search(http, 'df')] == [5300108]
    assert search(http, 'rio de janeiro rj')[0]['id'] == 3304557


def test_search_orders_prefix_first_then_capitals_then_alphabetically(client):
    http, _ = client
    assert [city['id'] for city in search(http, 'santa rita')] == SANTA_RITA
    paulo = search(http, 'paulo')
    assert [city['name'] for city in paulo[:7]] == ['Paulo Afonso', 'Paulo Bento', 'Paulo de Faria', 'Paulo Frontin',
                                                   'Paulo Jacinto', 'Paulo Lopes', 'Paulo Ramos']
    assert paulo[7]['id'] == 3550308  # primeira ocorrência interna: a capital vem antes dos demais "São Paulo..."
    assert [city['name'] for city in search(http, 'rio')[:2]] == ['Rio Branco', 'Rio de Janeiro']
    by_state = search(http, 'sp')
    assert by_state[0]['id'] == 3550308 and len(by_state) == 20


def test_search_needs_two_characters_and_returns_at_most_twenty(client):
    http, _ = client
    assert len(search(http, 'sa')) == 20
    for q in ('', ' ', 'a', ' a ', '-', "'a"):
        assert search(http, q) == []
    assert search(http, 'zzzz') == []


def test_without_q_returns_an_empty_list(client):
    # Etapa de restrição (ticket 09): nenhum cliente carrega mais a lista global de cidades.
    http, _ = client
    response = http.get('/api/v1/cities')
    assert response.status_code == 200
    assert response.json() == []


def test_lookup_by_ids(client):
    http, _ = client
    response = http.get('/api/v1/cities', params={'ids': '5208707,1100015,9999999,5208707'})
    assert response.status_code == 200
    assert response.json() == [{'id': 1100015, 'name': "Alta Floresta D'Oeste", 'state': 'RO'},
                               {'id': 5208707, 'name': 'Goiânia', 'state': 'GO'}]
    assert http.get('/api/v1/cities', params={'ids': ''}).json() == []
    fifty = ','.join(str(1100000 + n) for n in range(50))
    assert http.get('/api/v1/cities', params={'ids': fifty}).status_code == 200
    assert http.get('/api/v1/cities', params={'ids': f'{fifty},5300108'}).status_code == 422
    assert http.get('/api/v1/cities', params={'ids': 'abc'}).status_code == 422
    assert http.get('/api/v1/cities', params={'ids': '5300108', 'q': 'go'}).status_code == 422


def test_sports_profile_returns_the_city_object(client):
    http, _ = client
    headers, _ = register(http, 'cities-profile@example.com')
    put = http.put('/api/v1/me/sports-profiles/tenis', json={'city_id': 1100015}, headers=headers)
    assert put.status_code == 200, put.text
    assert put.json()['city_id'] == 1100015
    assert put.json()['city'] == {'id': 1100015, 'name': "Alta Floresta D'Oeste", 'state': 'RO'}
    http.put('/api/v1/me/sports-profiles/futebol', json={'city_id': 5300108}, headers=headers)
    updated = http.put('/api/v1/me/sports-profiles/tenis', json={'city_id': 5208707}, headers=headers)
    assert updated.json()['city'] == {'id': 5208707, 'name': 'Goiânia', 'state': 'GO'}
    listed = http.get('/api/v1/me/sports-profiles', headers=headers).json()
    assert [(item['sport'], item['city_id'], item['city']['name']) for item in listed] == [
        ('futebol', 5300108, 'Brasília'), ('tenis', 5208707, 'Goiânia')]


NEAREST = '/api/v1/cities/nearest'
WEB = {'Origin': 'http://localhost:5173'}
BRASILIA_CENTER = {'latitude': -15.793889, 'longitude': -47.882778}  # Esplanada dos Ministérios
GOIANIA_POINT = {'latitude': -16.679917, 'longitude': -49.255083}  # Praça Cívica
OCEAN = {'latitude': -10.123457, 'longitude': -25.987654}  # Atlântico, a mais de 800 km da costa


def coordinates_absent(text, point):
    return all(str(value) not in text for value in point.values())


def test_nearest_city_returns_the_closest_municipal_seat(client):
    http, _ = client
    headers, _ = register(http, 'nearest-city@example.com')
    brasilia = http.post(NEAREST, json=BRASILIA_CENTER, headers=headers)
    assert brasilia.status_code == 200, brasilia.text
    assert brasilia.json() == {'id': 5300108, 'name': 'Brasília', 'state': 'DF'}
    assert coordinates_absent(brasilia.text, BRASILIA_CENTER)
    goiania = http.post(NEAREST, json=GOIANIA_POINT, headers=headers)
    assert goiania.status_code == 200, goiania.text
    assert goiania.json() == {'id': 5208707, 'name': 'Goiânia', 'state': 'GO'}
    assert coordinates_absent(goiania.text, GOIANIA_POINT)
    # Inteiros também são coordenadas válidas; (-23, -46) fica a menos de 100 km de alguma sede paulista.
    assert http.post(NEAREST, json={'latitude': -23, 'longitude': -46}, headers=headers).status_code == 200


def test_nearest_city_outside_coverage_is_404_without_the_coordinates(client):
    http, _ = client
    headers, _ = register(http, 'nearest-ocean@example.com')
    for point in (OCEAN, {'latitude': 48.856614, 'longitude': 2.352222}):
        response = http.post(NEAREST, json=point, headers=headers)
        assert response.status_code == 404
        assert response.json() == {'detail': 'Não encontramos um município perto de você.'}
        assert coordinates_absent(response.text, point)


def test_nearest_city_rejects_invalid_coordinates_without_echoing_them(client):
    http, _ = client
    headers, _ = register(http, 'nearest-invalid@example.com')
    invalid = [
        {'latitude': 90.000001, 'longitude': -47.882778},
        {'latitude': -90.123457, 'longitude': -47.882778},
        {'latitude': -15.793889, 'longitude': 180.987654},
        {'latitude': -15.793889, 'longitude': -180.987654},
        {'latitude': '-15.793889', 'longitude': -47.882778},
        {'latitude': True, 'longitude': -47.882778},
        {'latitude': None, 'longitude': -47.882778},
        {'latitude': -15.793889},
        {'longitude': -47.882778},
        {},
        {**BRASILIA_CENTER, 'accuracy': 12.345678},
    ]
    for body in invalid:
        response = http.post(NEAREST, json=body, headers=headers)
        assert response.status_code == 422, (body, response.text)
        assert all(str(value) not in response.text for value in body.values() if value not in (None, True)), body
        assert response.json()['detail'] == 'Revise os campos informados.'
    # JSON aceita NaN e Infinity no parser do Python: valores não finitos também são 422.
    for raw in ('{"latitude": NaN, "longitude": -47.882778}', '{"latitude": -15.793889, "longitude": Infinity}',
                '{"latitude": -15.793889, "longitude": -Infinity}'):
        response = http.post(NEAREST, content=raw, headers={**headers, 'Content-Type': 'application/json'})
        assert response.status_code == 422, (raw, response.text)
        assert '15.793889' not in response.text and '47.882778' not in response.text
    malformed = http.post(NEAREST, content='{"latitude": -15.793889,', headers={**headers,
                                                                             'Content-Type': 'application/json'})
    assert malformed.status_code == 422 and '15.793889' not in malformed.text


def test_nearest_city_requires_a_session(client):
    http, _ = client
    assert http.post(NEAREST, json=BRASILIA_CENTER).status_code == 401
    # Sem sessão, a validação do corpo não chega a ser exposta.
    assert http.post(NEAREST, json={'latitude': 91.5, 'longitude': 0}).status_code == 401
    expired = http.post(NEAREST, json=BRASILIA_CENTER, headers={'Authorization': 'Bearer invalido'})
    assert expired.status_code == 401 and coordinates_absent(expired.text, BRASILIA_CENTER)
    assert http.post(NEAREST, json=BRASILIA_CENTER, headers={'Authorization': 'invalid'}).status_code == 401
    # As coordenadas só trafegam no corpo: não existe variante por query string.
    assert http.get(NEAREST, params=BRASILIA_CENTER).status_code == 405


def test_nearest_city_with_cookie_session_checks_the_origin(client):
    http, _ = client
    register(http, 'nearest-web@example.com')
    login = http.post('/api/v1/auth/login', json={'email': 'nearest-web@example.com', 'password': PASSWORD},
                      headers=WEB)
    assert login.status_code == 200 and login.json()['token'] is None
    allowed = http.post(NEAREST, json=GOIANIA_POINT, headers=WEB)
    assert allowed.status_code == 200 and allowed.json()['id'] == 5208707
    foreign = http.post(NEAREST, json=GOIANIA_POINT, headers={'Origin': 'https://attacker.invalid'})
    assert foreign.status_code == 403 and coordinates_absent(foreign.text, GOIANIA_POINT)
    assert http.post(NEAREST, json=GOIANIA_POINT).status_code == 403  # cookie sem Origin
    as_form = http.post(NEAREST, data={'latitude': '-16.679917', 'longitude': '-49.255083'}, headers=WEB)
    assert as_form.status_code == 415


def test_nearest_city_answers_within_the_latency_budget(client):
    http, _ = client
    headers, _ = register(http, 'nearest-latency@example.com')
    http.post(NEAREST, json=BRASILIA_CENTER, headers=headers)  # aquece a conexão
    elapsed = []
    for _ in range(20):
        started = time.perf_counter()
        response = http.post(NEAREST, json=GOIANIA_POINT, headers=headers)
        elapsed.append(time.perf_counter() - started)
        assert response.status_code == 200
    assert sorted(elapsed)[len(elapsed) // 2] < 0.1

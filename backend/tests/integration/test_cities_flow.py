"""Catálogo nacional de cidades: dados migrados, busca por nome/UF, consulta por IDs e cidade do perfil esportivo."""
from sqlalchemy import func, select

from app.models.identity import City
from tests.integration.team_helpers import register

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


def test_without_q_keeps_the_first_hundred_alphabetically(client):
    http, db = client
    response = http.get('/api/v1/cities')
    assert response.status_code == 200
    expected = db.scalars(select(City.id).order_by(City.name).limit(100)).all()
    assert [city['id'] for city in response.json()] == expected and len(expected) == 100


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

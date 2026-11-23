import csv
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.services.cities import (
    IDS_LIMIT,
    NEAREST_MAX_DISTANCE_KM,
    choose_nearest_seat,
    city_search_text,
    haversine_km,
    normalize_search_text,
    parse_city_ids,
)

CATALOG = Path(__file__).resolve().parents[2] / 'migrations' / 'data' / 'municipios'
ORIGINAL = {5300108: ('Brasília', 'DF'), 3550308: ('São Paulo', 'SP'), 3304557: ('Rio de Janeiro', 'RJ'),
            2304400: ('Fortaleza', 'CE'), 3106200: ('Belo Horizonte', 'MG'), 5208707: ('Goiânia', 'GO')}


@pytest.mark.parametrize(('value', 'expected'), [
    ('Goiânia', 'goiania'),
    ('  SÃO   PAULO  ', 'sao paulo'),
    ('São Paulo - SP', 'sao paulo sp'),
    ('Brasília, DF', 'brasilia df'),
    ('Conceição do Lago-Açu', 'conceicao do lago acu'),
    ("Dias d'Ávila", 'dias davila'),
    ('Alta Floresta D’Oeste', 'alta floresta doeste'),
    ('Augusto Severo (Campo Grande)', 'augusto severo campo grande'),
    ('', ''),
    ('  -  ', ''),
])
def test_normalize_search_text_drops_accents_case_and_punctuation(value, expected):
    assert normalize_search_text(value) == expected


def test_city_search_text_joins_name_and_state():
    assert city_search_text('Brasília', 'DF') == 'brasilia df'
    assert city_search_text("Pérola d'Oeste", 'PR') == 'perola doeste pr'
    # A mesma função normaliza o que o cliente digita, então os dois lados sempre coincidem.
    assert normalize_search_text('perola d’oeste - pr') in city_search_text("Pérola d'Oeste", 'PR')


def test_parse_city_ids_accepts_up_to_the_limit_and_ignores_repeats():
    assert parse_city_ids('') == []
    assert parse_city_ids(' 5300108 , 3550308,5300108,') == [5300108, 3550308]
    assert len(parse_city_ids(','.join(str(1100000 + n) for n in range(IDS_LIMIT)))) == IDS_LIMIT


@pytest.mark.parametrize('value', ['abc', '5300108,x', '-1', '1.5', ','.join(str(1100000 + n) for n in range(IDS_LIMIT + 1))])
def test_parse_city_ids_rejects_invalid_or_too_many(value):
    with pytest.raises(HTTPException) as error:
        parse_city_ids(value)
    assert error.value.status_code == 422


def test_versioned_catalog_has_every_municipality_and_the_original_ids():
    with (CATALOG / 'municipios.csv').open(encoding='utf-8', newline='') as file:
        rows = list(csv.DictReader(file))
    ids = [int(row['codigo_ibge']) for row in rows]
    assert len(rows) == 5571 and len(set(ids)) == len(rows)
    assert all(len(row['codigo_ibge']) == 7 and len(row['uf']) == 2 for row in rows)
    assert all(-34 < float(row['latitude']) < 6 and -74 < float(row['longitude']) < -32 for row in rows)
    assert sum(row['capital'] == '1' for row in rows) == 27
    by_id = {int(row['codigo_ibge']): row for row in rows}
    assert {key: (by_id[key]['nome'], by_id[key]['uf']) for key in ORIGINAL} == ORIGINAL
    license_text = (CATALOG / 'LICENSE').read_text(encoding='utf-8')
    assert 'MIT License' in license_text and 'Kelvin S. do Prado' in license_text
    assert '503e2f70bbf1b4b7ec0b1f68b09086ccc38fe861' in (CATALOG / 'FONTE.md').read_text(encoding='utf-8')


def test_haversine_km_matches_known_distances():
    assert haversine_km(-15.78, -47.93, -15.78, -47.93) == 0
    # 1 grau de latitude no raio médio da Terra (6371,0088 km) mede cerca de 111,195 km em qualquer longitude.
    assert haversine_km(0, 0, 1, 0) == pytest.approx(111.195, abs=0.001)
    assert haversine_km(-30, -50, -31, -50) == pytest.approx(111.195, abs=0.001)
    # Sedes de Brasília e Goiânia: cerca de 174,6 km em linha reta (a aproximação equirretangular dá o mesmo valor
    # a essa distância), nos dois sentidos.
    there = haversine_km(-15.7795, -47.9297, -16.6864, -49.2643)
    back = haversine_km(-16.6864, -49.2643, -15.7795, -47.9297)
    assert there == pytest.approx(174.6, abs=0.1) and there == pytest.approx(back)
    # O antimeridiano não distorce a distância: 179,5 e -179,5 ficam a 1 grau de longitude no equador.
    assert haversine_km(0, 179.5, 0, -179.5) == pytest.approx(111.195, abs=0.001)


SEATS = [(1, -15.78, -47.93), (2, -16.69, -49.26), (3, -16.82, -49.24)]


def test_choose_nearest_seat_returns_the_closest_seat():
    assert choose_nearest_seat(SEATS, -15.79, -47.88) == 1
    assert choose_nearest_seat(SEATS, -16.68, -49.25) == 2
    assert choose_nearest_seat(SEATS, -16.80, -49.24) == 3
    assert choose_nearest_seat([], -15.79, -47.88) is None


def test_choose_nearest_seat_breaks_ties_by_the_smallest_id():
    assert choose_nearest_seat([(9, 0, 0.1), (4, 0, -0.1), (7, 0.1, 0)], 0, 0) == 4


def test_choose_nearest_seat_ignores_seats_beyond_the_coverage_limit():
    assert NEAREST_MAX_DISTANCE_KM == 100
    # 0,89 grau de latitude ≈ 98,96 km (dentro); 0,91 grau ≈ 101,19 km (fora).
    assert choose_nearest_seat([(1, -10.89, -40)], -10, -40) == 1
    assert choose_nearest_seat([(1, -10.91, -40)], -10, -40) is None
    assert choose_nearest_seat([(1, -10.91, -40), (2, -9.09, -40)], -10, -40) is None

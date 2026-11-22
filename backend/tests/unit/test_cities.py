import csv
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.services.cities import IDS_LIMIT, city_search_text, normalize_search_text, parse_city_ids

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

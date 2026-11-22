"""Catálogo de cidades (municípios do IBGE): normalização de texto, busca por nome/UF e consulta por IDs."""
import re
import unicodedata

from fastapi import HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.identity import City

SEARCH_MIN_LENGTH = 2
SEARCH_LIMIT = 20
IDS_LIMIT = 50
LIST_LIMIT = 100

_APOSTROPHES = str.maketrans('', '', "'’‘`´")
_SEPARATORS = re.compile(r'[^a-z0-9]+')


def normalize_search_text(value: str) -> str:
    """Texto sem acentos, em minúsculas, com letras e dígitos separados por um único espaço.

    Apóstrofos são removidos ("D'Oeste" → "doeste") e qualquer outra pontuação vira espaço ("Lago-Açu" →
    "lago acu"). É a única normalização do catálogo: a migração 0015 grava `cities.search_text` com ela e a
    busca normaliza o termo digitado com ela. Mudar esta função exige uma migração que recalcule a coluna.
    """
    text = unicodedata.normalize('NFKD', value.translate(_APOSTROPHES))
    text = ''.join(char for char in text if not unicodedata.combining(char)).lower()
    return _SEPARATORS.sub(' ', text).strip()


def city_search_text(name: str, state: str) -> str:
    """Valor de `cities.search_text`: nome e UF normalizados ("Goiânia", "GO" → "goiania go")."""
    return normalize_search_text(f'{name} {state}')


def _alphabetical():
    # search_text termina sempre em " uf": sem os 3 últimos caracteres sobra o nome normalizado, que ordena sem
    # depender de acentos nem da collation do banco ("santa rita" antes de "santa rita do sapucai").
    return func.left(City.search_text, -3).collate('C'), City.state, City.id


def search_cities(db: Session, q: str) -> list[City]:
    """Até 20 cidades cujo nome + UF contém o termo; prefixo do nome primeiro, depois capitais e ordem alfabética."""
    term = normalize_search_text(q)
    if len(term) < SEARCH_MIN_LENGTH:
        return []
    # O termo normalizado só tem [a-z0-9 ], portanto não carrega curingas de LIKE.
    prefix_first = case((City.search_text.startswith(term), 0), else_=1)
    statement = (select(City).where(City.search_text.contains(term))
                 .order_by(prefix_first, City.capital.desc(), *_alphabetical()).limit(SEARCH_LIMIT))
    return list(db.scalars(statement))


def list_cities(db: Session) -> list[City]:
    """Comportamento anterior de `GET /cities` sem `q`: as 100 primeiras cidades por nome."""
    return list(db.scalars(select(City).order_by(City.name).limit(LIST_LIMIT)))


def parse_city_ids(value: str) -> list[int]:
    """IDs distintos de "a,b,c", na ordem informada; 422 para valor não numérico ou mais de 50 IDs."""
    ids: list[int] = []
    for part in value.split(','):
        part = part.strip()
        if not part:
            continue
        if not part.isascii() or not part.isdigit():
            raise HTTPException(422, 'Informe os IDs das cidades como números separados por vírgula.')
        if int(part) not in ids:
            ids.append(int(part))
    if len(ids) > IDS_LIMIT:
        raise HTTPException(422, f'Informe no máximo {IDS_LIMIT} cidades por consulta.')
    return ids


def cities_by_ids(db: Session, ids: list[int]) -> list[City]:
    """Cidades pedidas que existem no catálogo, em ordem alfabética; IDs desconhecidos são ignorados."""
    if not ids:
        return []
    return list(db.scalars(select(City).where(City.id.in_(ids)).order_by(*_alphabetical())))

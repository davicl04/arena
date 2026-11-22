"""Catálogo de cidades (municípios do IBGE): normalização de texto, busca por nome/UF, consulta por IDs e sede mais
próxima de uma localização."""
import math
import re
import unicodedata
from collections.abc import Iterable

from fastapi import HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.identity import City

SEARCH_MIN_LENGTH = 2
SEARCH_LIMIT = 20
IDS_LIMIT = 50
# Cobertura da cidade sugerida: sede mais distante que isso não é sugerida (valor inicial, questão Q3 da spec).
NEAREST_MAX_DISTANCE_KM = 100.0
NEAREST_NOT_FOUND = 'Não encontramos um município perto de você.'
EARTH_RADIUS_KM = 6371.0088  # raio médio da Terra (IUGG)

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


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distância em linha reta (círculo máximo) entre dois pontos em graus decimais, em km."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    half_dphi, half_dlambda = math.radians(lat2 - lat1) / 2, math.radians(lon2 - lon1) / 2
    a = math.sin(half_dphi) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(half_dlambda) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def choose_nearest_seat(seats: Iterable[tuple[int, float, float]], latitude: float, longitude: float,
                        max_distance_km: float = NEAREST_MAX_DISTANCE_KM) -> int | None:
    """ID da sede (id, latitude, longitude) mais próxima do ponto, se estiver a até `max_distance_km`.

    Empate de distância fica com o menor ID, para a resposta não depender da ordem das linhas.
    """
    best: tuple[float, int] | None = None
    for city_id, seat_latitude, seat_longitude in seats:
        candidate = (haversine_km(latitude, longitude, seat_latitude, seat_longitude), city_id)
        if best is None or candidate < best:
            best = candidate
    if best is None or best[0] > max_distance_km:
        return None
    return best[1]


def nearest_city(db: Session, latitude: float, longitude: float) -> City:
    """Município cuja sede é a mais próxima do ponto; 404 se nenhuma sede estiver a até 100 km.

    O cálculo é feito em memória sobre as coordenadas de todas as sedes (5.571 linhas de três números): nenhum valor
    derivado da localização vai para o SQL, onde poderia aparecer em logs de consulta do PostgreSQL, e não há índice
    novo nem cache a invalidar. As coordenadas recebidas não são gravadas, registradas nem devolvidas.
    """
    seats = db.execute(select(City.id, City.latitude, City.longitude))
    city_id = choose_nearest_seat(seats, latitude, longitude)
    if city_id is None:
        raise HTTPException(404, NEAREST_NOT_FOUND)
    return db.get_one(City, city_id)

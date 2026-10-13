"""Rules of running marks without database access (Jogar, fase 6; RN17).

Contract: docs/decisoes/0002-jogar.md, section 18. The distance an athlete declares counts for one of the
standard distances (3, 5, 10, 21 and 42 km) when it is within ±2% of it; anything else stays in the history.
There is no conversion by pace between distances. A time must be plausible for its distance (the pace limits
below). Days are the Brasília calendar day (UTC-3, no daylight saving time since 2019).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from app.models.rankings import RUN_DISTANCES_KM, TIERS
from app.models.runs import MAX_DISTANCE_M, MAX_DURATION_S, MIN_DISTANCE_M
from app.services.match_rules import RuleError

BRASILIA = timezone(timedelta(hours=-3))
# ±2% of the standard distance (9.8 to 10.2 km is 10 km): |distance − standard| × 50 ≤ standard.
TOLERANCE_DENOMINATOR = 50
# Plausible pace, in seconds per km: faster than 2:00/km is beyond every world record, slower than 15:00/km is
# slower than a walk. The duration also stays under 24 h.
MIN_PACE_S_PER_KM = 120
MAX_PACE_S_PER_KM = 900
RUN_WINDOW_WEEKS = 52
TREINO_LABEL = 'Treino'

KIND_FIRST = 'primeira_marca'
KIND_BEST = 'novo_melhor'
KIND_NO_GAIN = 'sem_melhora'
KIND_HISTORY = 'fora_do_ranking'

MEASURE_RANGE = f'A distância deve ficar entre {MIN_DISTANCE_M // 1000} km e {MAX_DISTANCE_M // 1000} km.'
FUTURE_DAY = 'A data do treino não pode ser no futuro.'


def local_date(moment: datetime) -> date:
    """The Brasília calendar day of an instant."""
    return moment.astimezone(BRASILIA).date()


def window_start_day(today: date, weeks: int = RUN_WINDOW_WEEKS) -> date:
    return today - timedelta(weeks=weeks)


def resolve_standard_distance(distance_m: int) -> int | None:
    """The standard distance (km) a declared distance counts for, or None when it is outside every ±2% band."""
    for km in RUN_DISTANCES_KM:
        standard_m = km * 1000
        if abs(distance_m - standard_m) * TOLERANCE_DENOMINATOR <= standard_m:
            return km
    return None


def pace_s_per_km(distance_m: int, duration_s: int) -> int:
    """Seconds per km, rounded half up (the card shows m:ss)."""
    return (duration_s * 1000 * 2 + distance_m) // (2 * distance_m)


def duration_bounds(distance_m: int) -> tuple[int, int]:
    """Shortest and longest plausible duration, in seconds, for a distance."""
    shortest = -(-distance_m * MIN_PACE_S_PER_KM // 1000)
    longest = min(distance_m * MAX_PACE_S_PER_KM // 1000, MAX_DURATION_S)
    return shortest, longest


def format_km(distance_m: int) -> str:
    """'5 km' or '7,5 km' (Portuguese decimal comma, up to two places)."""
    kilometers = Decimal(distance_m) / 1000
    text = f'{kilometers:.2f}'.rstrip('0').rstrip('.')
    return f"{text.replace('.', ',')} km"


def format_pace(seconds: int) -> str:
    return f'{seconds // 60}:{seconds % 60:02d}'


def validate_measure(distance_m: int, duration_s: int) -> None:
    """422 with the field when the distance or the time cannot be a real run."""
    if not MIN_DISTANCE_M <= distance_m <= MAX_DISTANCE_M:
        raise RuleError(MEASURE_RANGE, 'distance_m')
    shortest, longest = duration_bounds(distance_m)
    if duration_s < 1:
        raise RuleError('Informe o tempo da corrida.', 'duration_s')
    if duration_s < shortest:
        raise RuleError(f'Esse tempo é rápido demais para {format_km(distance_m)} '
                        f'(ritmo abaixo de {format_pace(MIN_PACE_S_PER_KM)} por km). Confira o tempo e a distância.',
                        'duration_s')
    if duration_s > longest:
        raise RuleError(f'Esse tempo é longo demais para {format_km(distance_m)} '
                        f'(ritmo acima de {format_pace(MAX_PACE_S_PER_KM)} por km). Confira o tempo e a distância.',
                        'duration_s')


def validate_day(day: date, today: date, *, weeks: int = RUN_WINDOW_WEEKS, race: bool = False) -> None:
    """A training day is neither in the future nor out of the window; a race day only has to be inside it (the
    race already happened). Marks older than the window would never count, so they are refused."""
    if day > today:
        raise RuleError(FUTURE_DAY, 'date')
    if day < window_start_day(today, weeks):
        raise RuleError(f'Esta prova saiu das últimas {weeks} semanas e não entra mais no ranking.' if race
                        else f'Só entram marcas das últimas {weeks} semanas.', 'date')


def run_kind(standard_km: int | None, previous_best_s: int | None, duration_s: int) -> str:
    """What a mark does to the athlete's ranking of its distance."""
    if standard_km is None:
        return KIND_HISTORY
    if previous_best_s is None:
        return KIND_FIRST
    return KIND_BEST if duration_s < previous_best_s else KIND_NO_GAIN


def tier_rises(before: str | None, after: str | None) -> bool:
    """True when the athlete already had a tier and the new one is higher ('Sobe para Ouro'). A first mark enters
    the ranking: it has a `tier_after` but nothing to rise from."""
    return before is not None and after is not None and TIERS.index(after) > TIERS.index(before)

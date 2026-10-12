"""Pure rules of matchmaking, matches and results (Jogar, fases 2 a 5), without database access.

Deadlines (search of 24 h, proposal and slot offer of 2 h, cancellation until 24 h before, results until 48 h
after the start), walk-in slots (RN06), buckets and pairing order (RN04, RN23), score validation (football,
tennis with tie-breaks and the optional super tie-break, walkover), state transitions of searches, matches and
stats, and which stat items count (RN10). Services load the rows, call these functions and persist the result in
one transaction. Contracts: docs/decisoes/0002-jogar.md (sections 7 to 14).
"""
from __future__ import annotations

import hashlib
import re
import unicodedata
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from app.models.matches import STAT_FIELDS
from app.models.rankings import FOOTBALL_FORMATS, TIERS
from app.models.teams import POSITIONS
from app.services.event_rules import TransitionError
from app.services.rankings import can_face

__all__ = ['TransitionError', 'RuleError']

SEARCH_DURATION = timedelta(hours=24)
PROPOSAL_DURATION = timedelta(hours=2)
OFFER_DURATION = timedelta(hours=2)
CANCEL_NOTICE = timedelta(hours=24)
RESULT_WINDOW = timedelta(hours=48)
TERMS_HORIZON = timedelta(days=60)
TERMS_STEP_MINUTES = 15
FORMAT_SIZES = {'futsal': 5, 'society': 7, 'campo': 11}
FORMAT_LABELS = {'futsal': 'futsal', 'society': 'society', 'campo': 'campo'}
POSITION_LABELS = {'goleiro': 'Goleiro', 'defesa': 'Defesa', 'meio_campo': 'Meio de campo', 'atacante': 'Atacante'}
# RN13: the position-specific stat.
POSITION_STAT_LABELS = {'goleiro': 'Defesas', 'defesa': 'Desarmes', 'meio_campo': 'Passes decisivos',
                        'atacante': 'Finalizações no alvo'}
MAX_GOALKEEPER_SLOTS = 1
FOOTBALL_GOALS_MAX = 99
STAT_MAX = 50
# Decided on 12 Oct 2026: a walkover is recorded as 3×0 (football) or 6-0 6-0 (tennis).
WALKOVER_GOALS = 3
WALKOVER_SETS = ((6, 0), (6, 0))
COURT_NAME_LENGTH = (2, 80)


class RuleError(ValueError):
    """Invalid input according to a product rule; the message is shown to the user (HTTP 422)."""

    def __init__(self, message: str, field: str | None = None):
        super().__init__(message)
        self.field = field


# ----- Deadlines ---------------------------------------------------------------------------------------------

def search_expires_at(started_at: datetime) -> datetime:
    """A search waits 24 h (RN04) or until cancelled; a requeued search keeps this original limit."""
    return started_at + SEARCH_DURATION


def proposal_expires_at(created_at: datetime) -> datetime:
    """Both representatives accept within 2 h (RN05)."""
    return created_at + PROPOSAL_DURATION


def offer_expires_at(now: datetime, starts_at: datetime) -> datetime:
    """A slot offer to a walk-in lasts 2 h, never beyond the start of the match."""
    return min(now + OFFER_DURATION, starts_at)


def cancel_deadline(starts_at: datetime) -> datetime:
    """Last moment to cancel a scheduled match: 24 h before the start. After that, absence is a walkover."""
    return starts_at - CANCEL_NOTICE


def result_deadline(starts_at: datetime) -> datetime:
    """Scores, attendance, stats, reviews and contests until 48 h after the scheduled start (RN09, RN10, RN15)."""
    return starts_at + RESULT_WINDOW


def result_window_open(starts_at: datetime | None, now: datetime) -> bool:
    return starts_at is not None and starts_at <= now < result_deadline(starts_at)


def effective_search_state(state: str, expires_at: datetime, now: datetime) -> str:
    """Reads show a waiting search past its 24 h as 'expirada', even before the sweep."""
    return 'expirada' if state == 'ativa' and expires_at <= now else state


def effective_match_state(state: str, proposal_expires_at_: datetime | None, now: datetime) -> str:
    """Reads show a proposal past its 2 h as 'expirada', even before the sweep."""
    if state == 'proposta' and proposal_expires_at_ is not None and proposal_expires_at_ <= now:
        return 'expirada'
    return state


MATCH_PHASES = ('proposta', 'recusada', 'expirada', 'combinando', 'agendada', 'informar_resultado', 'divergente',
                'wo_registrado', 'wo_contestado', 'confirmado', 'encerrada', 'sem_resultado', 'cancelada')


def match_phase(state: str, *, now: datetime, proposal_expires_at_: datetime | None = None,
                starts_at: datetime | None = None, walkover_absent_side: str | None = None,
                walkover_contested: bool = False, reports_differ: bool = False) -> str:
    """What the S1 card shows: the stored state, refined after the start of a scheduled match (score to report,
    divergence or walkover) and 'confirmado' while the stats window of a confirmed result is open."""
    state = effective_match_state(state, proposal_expires_at_, now)
    if state == 'agendada' and starts_at is not None and now >= starts_at:
        if walkover_absent_side is not None:
            return 'wo_contestado' if walkover_contested else 'wo_registrado'
        return 'divergente' if reports_differ else 'informar_resultado'
    if state == 'realizada':
        return 'confirmado'
    return state


def cancel_error(state: str, starts_at: datetime | None, now: datetime) -> str | None:
    """None when a representative may cancel; otherwise the message (HTTP 409)."""
    if state == 'combinando':
        return None
    if state != 'agendada' or starts_at is None:
        return 'Só partidas combinando ou agendadas podem ser canceladas.'
    if now >= cancel_deadline(starts_at):
        return 'Faltam menos de 24 h para a partida. Quem não comparecer perde por W.O.'
    return None


def validate_terms_start(starts_at: datetime, now: datetime) -> datetime:
    """Proposed start: in the future, on a 15-minute step and within 60 days."""
    if starts_at.tzinfo is None:
        raise RuleError('Informe a data e a hora com o fuso horário.', 'starts_at')
    if starts_at <= now:
        raise RuleError('Escolha uma data e um horário que ainda não passaram.', 'starts_at')
    if starts_at - now > TERMS_HORIZON:
        raise RuleError('Escolha uma data nos próximos 60 dias.', 'starts_at')
    if starts_at.minute % TERMS_STEP_MINUTES or starts_at.second or starts_at.microsecond:
        raise RuleError('Escolha um horário em intervalos de 15 minutos.', 'starts_at')
    return starts_at


# ----- Walk-in slots (RN06) ----------------------------------------------------------------------------------

def format_size(format_: str) -> int:
    if format_ not in FORMAT_SIZES:
        raise RuleError('Formato inválido.', 'format')
    return FORMAT_SIZES[format_]


def max_slots(format_: str) -> int:
    """At most the format size minus one: the team brings at least one athlete."""
    return format_size(format_) - 1


def normalize_open_slots(format_: str, slots: Mapping[str, Any] | None, *,
                         filled: Mapping[str, int] | None = None) -> dict[str, int]:
    """Slots per position for walk-ins: at most one goalkeeper and, counting the filled ones, up to size − 1.

    Missing positions are 0. `filled` holds walk-ins already in the side (when a scheduled match changes its
    open slots), so the limits apply to open plus filled spots.
    """
    raw = dict(slots or {})
    unknown = set(raw) - set(POSITIONS)
    if unknown:
        raise RuleError('Posição inválida nas vagas.', 'open_slots')
    result: dict[str, int] = {}
    for position in POSITIONS:
        value = raw.get(position, 0)
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise RuleError('Informe as vagas com números inteiros a partir de zero.', 'open_slots')
        result[position] = value
    taken = {position: (filled or {}).get(position, 0) for position in POSITIONS}
    if result['goleiro'] + taken['goleiro'] > MAX_GOALKEEPER_SLOTS:
        raise RuleError('No máximo uma vaga de goleiro.', 'open_slots')
    limit = max_slots(format_)
    if sum(result.values()) + sum(taken.values()) > limit:
        raise RuleError(f'No {FORMAT_LABELS[format_]} cabem até {limit} vagas para avulsos.', 'open_slots')
    return result


def slot_total(slots: Mapping[str, int] | None) -> int:
    return sum((slots or {}).values())


def expand_slots(slots: Mapping[str, int] | None) -> list[str]:
    """One position per spot, in position order (goleiro, defesa, meio_campo, atacante)."""
    return [position for position in POSITIONS for _ in range((slots or {}).get(position, 0))]


def slot_position_matches(wanted: str | None, slot_position: str) -> bool:
    """A walk-in looking for 'any position' (None) takes the first compatible spot of any position."""
    return wanted is None or wanted == slot_position


# ----- Buckets and pairing order (RN04, RN23) ----------------------------------------------------------------

def bucket_key(kind: str, city_id: int, format_: str | None = None) -> str:
    """Compatibility bucket: only searches of the same bucket may pair.

    Team: football + city + format. Tennis: tennis + city. Walk-in: football + city (position and format are
    filters inside the bucket, because "any position" and "any format" cross them); the walk-in bucket also
    serializes the slot offers of the city.
    """
    if kind == 'time':
        if format_ not in FOOTBALL_FORMATS:
            raise ValueError('Busca de time sem formato.')
        return f'futebol:time:{city_id}:{format_}'
    if kind == 'tenis':
        return f'tenis:{city_id}'
    if kind == 'avulso':
        return f'futebol:avulso:{city_id}'
    raise ValueError('Tipo de busca inválido.')


def bucket_lock_id(key: str) -> int:
    """Signed 64-bit key for pg_advisory_xact_lock, stable across processes and API instances."""
    digest = hashlib.sha256(f'arena:matchmaking:{key}'.encode()).digest()
    return int.from_bytes(digest[:8], 'big', signed=True)


def pairing_rank(mine: str | None, theirs: str | None) -> int:
    """0 for the same tier (both in placement included), 1 for a neighbouring tier, 2 for the rest.

    Only pairs allowed by `can_face` reach this ranking; 2 happens when exactly one side is in placement.
    """
    if mine == theirs:
        return 0
    if mine is not None and theirs is not None and abs(TIERS.index(mine) - TIERS.index(theirs)) == 1:
        return 1
    return 2


def compatible(mine: str | None, theirs: str | None) -> bool:
    """Same or neighbouring tier; placement faces any level (RN04, RN23)."""
    return can_face(mine, theirs)


def candidate_order(mine: str | None, theirs: str | None, started_at: datetime, item_id: int) -> tuple:
    """Pairing order: same tier first, then the neighbour, then the oldest search (or slot)."""
    return (pairing_rank(mine, theirs), started_at, item_id)


@dataclass(frozen=True)
class Candidate:
    """Something to pair with: a waiting search, or an open slot for a walk-in.

    `mine` is the tier of who is looking (for a walk-in, in the slot's position and format) and `theirs` the
    tier on the other side (the waiting search, or the team that opened the slot)."""
    item: Any
    mine: str | None
    theirs: str | None
    since: datetime
    item_id: int


def rank_candidates(candidates: Iterable[Candidate]) -> list[Any]:
    """Compatible candidates in pairing order; the caller locks each one and re-checks it before using it."""
    allowed = [candidate for candidate in candidates if compatible(candidate.mine, candidate.theirs)]
    allowed.sort(key=lambda c: candidate_order(c.mine, c.theirs, c.since, c.item_id))
    return [candidate.item for candidate in allowed]


# ----- Courts (RN07) -----------------------------------------------------------------------------------------

def court_key(name: str) -> str:
    """Normalized name for duplicate detection: no accents, lowercase, single spaces, no punctuation."""
    text = unicodedata.normalize('NFKD', name)
    text = ''.join(char for char in text if not unicodedata.combining(char)).lower()
    text = re.sub(r'[^a-z0-9]+', ' ', text)
    return ' '.join(text.split())[:80]


def court_kind_for(sport: str, format_: str | None) -> str:
    """Court kind a match needs: the football format or 'tenis'."""
    if sport == 'tenis':
        return 'tenis'
    if format_ in FOOTBALL_FORMATS:
        return format_
    raise ValueError('Partida sem formato.')


def clean_court_name(name: str) -> str:
    cleaned = ' '.join(name.split())
    low, high = COURT_NAME_LENGTH
    if not low <= len(cleaned) <= high or not court_key(cleaned):
        raise RuleError(f'O nome da quadra precisa ter de {low} a {high} caracteres.', 'name')
    return cleaned


# ----- Scores ------------------------------------------------------------------------------------------------

@dataclass(frozen=True)
class TennisSet:
    a: int
    b: int
    tiebreak_a: int | None = None
    tiebreak_b: int | None = None
    super_tiebreak: bool = False

    @property
    def winner(self) -> str:
        return 'a' if self.a > self.b else 'b'

    def as_json(self) -> dict:
        tiebreak = None if self.tiebreak_a is None else {'a': self.tiebreak_a, 'b': self.tiebreak_b}
        return {'a': self.a, 'b': self.b, 'tiebreak': tiebreak, 'super_tiebreak': self.super_tiebreak}


@dataclass(frozen=True)
class Score:
    """Final or reported score from the match's point of view (side A, side B)."""
    score_a: int                      # goals (football) or sets won (tennis)
    score_b: int
    winner: str | None                # 'a', 'b' or None (football draw)
    sets: tuple[TennisSet, ...] | None = None

    def sets_json(self) -> list[dict] | None:
        return None if self.sets is None else [item.as_json() for item in self.sets]


def _whole(value: Any, field: str, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= maximum:
        raise RuleError(f'Informe números inteiros de 0 a {maximum}.', field)
    return value


def validate_football_score(goals_a: Any, goals_b: Any) -> Score:
    a = _whole(goals_a, 'goals_a', FOOTBALL_GOALS_MAX)
    b = _whole(goals_b, 'goals_b', FOOTBALL_GOALS_MAX)
    return Score(a, b, 'a' if a > b else 'b' if b > a else None)


def _tiebreak_valid(winner: int, loser: int, target: int) -> bool:
    """Tie-break to `target` points with two of advantage: 7-5, 8-6, 10-8 (super), 12-10..."""
    return winner >= target and winner - loser >= 2 and (winner == target or winner - loser == 2)


def _regular_set(raw: Mapping[str, Any], number: int) -> TennisSet:
    a = _whole(raw.get('a'), f'sets.{number}', 7)
    b = _whole(raw.get('b'), f'sets.{number}', 7)
    tiebreak = raw.get('tiebreak')
    high, low = max(a, b), min(a, b)
    if high == 6 and low <= 4 or high == 7 and low == 5:
        if tiebreak is not None:
            raise RuleError(f'O {number}º set não teve tie-break.', f'sets.{number}')
        return TennisSet(a, b)
    if high == 7 and low == 6:
        if not isinstance(tiebreak, Mapping):
            raise RuleError(f'Informe o placar do tie-break do {number}º set.', f'sets.{number}')
        tb_a = _whole(tiebreak.get('a'), f'sets.{number}', 99)
        tb_b = _whole(tiebreak.get('b'), f'sets.{number}', 99)
        if (tb_a > tb_b) != (a > b) or not _tiebreak_valid(max(tb_a, tb_b), min(tb_a, tb_b), 7):
            raise RuleError(f'O tie-break do {number}º set vai a 7 pontos, com 2 de vantagem, e é de quem '
                            'venceu o set.', f'sets.{number}')
        return TennisSet(a, b, tb_a, tb_b)
    raise RuleError(f'O {number}º set precisa terminar em 6-0 a 6-4, 7-5 ou 7-6.', f'sets.{number}')


def _super_tiebreak(raw: Mapping[str, Any]) -> TennisSet:
    a = _whole(raw.get('a'), 'sets.3', 99)
    b = _whole(raw.get('b'), 'sets.3', 99)
    if raw.get('tiebreak') is not None or not _tiebreak_valid(max(a, b), min(a, b), 10):
        raise RuleError('O super tie-break vai a 10 pontos, com 2 de vantagem.', 'sets.3')
    return TennisSet(a, b, super_tiebreak=True)


def validate_tennis_sets(sets: Sequence[Mapping[str, Any]], *, super_tiebreak: bool = False) -> Score:
    """Best of three (RN15): each set 6-0 to 6-4, 7-5 or 7-6 with the tie-break score; the winner takes two sets
    and a third set exists only when the first two were split. With `super_tiebreak` (agreed in the terms) the
    third set is a super tie-break to 10 points with two of advantage."""
    if not isinstance(sets, Sequence) or isinstance(sets, (str, bytes)) or not 2 <= len(sets) <= 3:
        raise RuleError('Informe dois ou três sets.', 'sets')
    if not all(isinstance(item, Mapping) for item in sets):
        raise RuleError('Informe cada set com os games dos dois lados.', 'sets')
    parsed = [_regular_set(sets[0], 1), _regular_set(sets[1], 2)]
    split = parsed[0].winner != parsed[1].winner
    if split and len(sets) == 2:
        raise RuleError('Os dois primeiros sets ficaram divididos: informe o terceiro.', 'sets')
    if not split and len(sets) == 3:
        raise RuleError('Quem venceu os dois primeiros sets já ganhou a partida: não há terceiro set.', 'sets')
    if len(sets) == 3:
        parsed.append(_super_tiebreak(sets[2]) if super_tiebreak else _regular_set(sets[2], 3))
    won_a = sum(1 for item in parsed if item.winner == 'a')
    won_b = len(parsed) - won_a
    return Score(won_a, won_b, 'a' if won_a > won_b else 'b', tuple(parsed))


def tennis_sets_from_json(sets: Sequence[Mapping[str, Any]] | None) -> tuple[TennisSet, ...] | None:
    if sets is None:
        return None
    return tuple(TennisSet(item['a'], item['b'], (item.get('tiebreak') or {}).get('a'),
                           (item.get('tiebreak') or {}).get('b'), bool(item.get('super_tiebreak')))
                 for item in sets)


def walkover_score(sport: str, absent_side: str) -> Score:
    """Walkover (12 Oct 2026): 3×0 in football and 6-0 6-0 in tennis for the side that showed up."""
    if absent_side not in ('a', 'b'):
        raise ValueError('Lado ausente inválido.')
    present = 'b' if absent_side == 'a' else 'a'
    if sport == 'futebol':
        return Score(WALKOVER_GOALS if present == 'a' else 0, WALKOVER_GOALS if present == 'b' else 0, present)
    sets = tuple(TennisSet(won, lost) if present == 'a' else TennisSet(lost, won) for won, lost in WALKOVER_SETS)
    return Score(2 if present == 'a' else 0, 2 if present == 'b' else 0, present, sets)


def scores_agree(left: Score | None, right: Score | None) -> bool:
    """Bilateral confirmation (RN09, RN15): both sides reported exactly the same score (and sets)."""
    return left is not None and right is not None and left == right


def result_state(report_a: Score | None, report_b: Score | None) -> str:
    """'aguardando' (none or one report), 'confirmado' (equal) or 'divergente' (different)."""
    if report_a is None or report_b is None:
        return 'aguardando'
    return 'confirmado' if scores_agree(report_a, report_b) else 'divergente'


def other_side(side: str) -> str:
    if side not in ('a', 'b'):
        raise ValueError('Lado inválido.')
    return 'b' if side == 'a' else 'a'


# ----- State transitions -------------------------------------------------------------------------------------

SEARCH_TRANSITIONS: dict[tuple[str, str], str] = {
    ('ativa', 'parear'): 'pareada',
    ('ativa', 'cancelar'): 'cancelada',
    ('ativa', 'expirar'): 'expirada',
    ('pareada', 'concluir'): 'concluida',
    ('pareada', 'voltar_a_fila'): 'ativa',
    ('pareada', 'expirar'): 'expirada',          # returned to the queue after its own 24 h
    ('pareada', 'recusar'): 'recusada',
    ('pareada', 'sem_resposta'): 'sem_resposta',
}
SEARCH_MESSAGES = {
    'cancelar': 'Esta busca já encontrou uma partida ou foi encerrada.',
    'parear': 'Esta busca não está mais na fila.',
}

MATCH_TRANSITIONS: dict[tuple[str, str], str] = {
    ('proposta', 'aceitar_proposta'): 'combinando',
    ('proposta', 'recusar_proposta'): 'recusada',
    ('proposta', 'expirar_proposta'): 'expirada',
    ('combinando', 'agendar'): 'agendada',
    ('combinando', 'cancelar'): 'cancelada',
    ('agendada', 'cancelar'): 'cancelada',
    ('agendada', 'confirmar_resultado'): 'realizada',
    ('agendada', 'confirmar_wo'): 'encerrada',
    ('agendada', 'decidir_resultado'): 'encerrada',
    ('agendada', 'fechar_sem_resultado'): 'sem_resultado',
    ('realizada', 'encerrar'): 'encerrada',
}
MATCH_MESSAGES = {
    'aceitar_proposta': 'Esta proposta não está mais aberta.',
    'recusar_proposta': 'Esta proposta não está mais aberta.',
    'agendar': 'As condições só são aceitas enquanto a partida está sendo combinada ou agendada.',
    'cancelar': 'Só partidas combinando ou agendadas podem ser canceladas.',
    'confirmar_resultado': 'O resultado desta partida já foi definido.',
    'confirmar_wo': 'O resultado desta partida já foi definido.',
    'decidir_resultado': 'O resultado desta partida já foi definido.',
}

STAT_TRANSITIONS: dict[tuple[str, str], str] = {
    ('enviada', 'editar'): 'enviada',
    ('revisada', 'editar'): 'enviada',
    ('enviada', 'revisar'): 'revisada',
    ('revisada', 'revisar'): 'revisada',
    ('contestada', 'revisar'): 'revisada',
    ('enviada', 'contestar'): 'contestada',
    ('revisada', 'contestar'): 'contestada',
}
STAT_MESSAGES = {
    'editar': 'Esta estatística foi contestada; o representante do seu time revisa.',
    'contestar': 'Esta estatística já foi contestada.',
}


def _transition(table: dict, messages: dict, state: str, action: str, default: str) -> str:
    target = table.get((state, action))
    if target is None:
        raise TransitionError(messages.get(action, default))
    return target


def next_search_state(state: str, action: str) -> str:
    return _transition(SEARCH_TRANSITIONS, SEARCH_MESSAGES, state, action, 'Esta busca já foi encerrada.')


def next_match_state(state: str, action: str) -> str:
    return _transition(MATCH_TRANSITIONS, MATCH_MESSAGES, state, action, 'Esta ação não vale no estado da partida.')


def next_stat_state(state: str, action: str, *, contested_before: bool = False) -> str:
    """Stat transitions; each stat can be contested once (the review after a contest is final)."""
    if action == 'contestar' and contested_before:
        raise TransitionError(STAT_MESSAGES['contestar'])
    return _transition(STAT_TRANSITIONS, STAT_MESSAGES, state, action, 'Esta estatística não pode mudar agora.')


# ----- Stats (RN10, RN13) ------------------------------------------------------------------------------------

def validate_stat(value: Any, field: str) -> int | None:
    """Optional stat: empty (None) neither adds nor subtracts (RN10)."""
    if value is None:
        return None
    return _whole(value, field, STAT_MAX)


def normalize_contested_fields(fields: Sequence[str]) -> list[str]:
    chosen = list(dict.fromkeys(fields))
    if not chosen or any(field not in STAT_FIELDS for field in chosen):
        raise RuleError('Escolha os itens contestados: gols, assistências ou a estatística da posição.', 'fields')
    return [field for field in STAT_FIELDS if field in chosen]


def counted_stat_fields(state: str | None, contested_fields: Sequence[str] | None = None, *,
                        reviewed: bool = False) -> frozenset[str]:
    """Stat items that score (RN10): all after the own representative's review; while contested, only the items
    that were reviewed before and not contested; nothing while only sent by the athlete."""
    if state == 'revisada':
        return frozenset(STAT_FIELDS)
    if state == 'contestada' and reviewed:
        return frozenset(STAT_FIELDS) - frozenset(contested_fields or ())
    return frozenset()

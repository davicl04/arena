"""Pure rules of championship brackets and schedules (Times e campeonatos, fase 6), without database access.

- **Single elimination:** the draw is a deterministic shuffle of the confirmed entries from a stored seed, laid
  into the usual seeded bracket of the smallest power of two that fits them (at least 2). Seeds beyond the number of
  entries are byes ("Folga"): whoever has no opponent in the first round goes straight through. With fewer
  confirmed entries than the capacity the championship goes on with the confirmed ones (decision of 12 Oct 2026),
  so a bracket of 8 with 6 entries has 2 byes and one of 16 with 5 entries is a bracket of 8 with 3 byes.
- **Round robin:** the circle method, so every competitor plays once per round and, with an odd number, one rests in
  each round; the draw only changes the order.
- **Table:** 3/1/0 points, then goal difference, goals for and wins.
- **Schedule:** free start time; the same court cannot hold two matches of the event less than 2 h apart, and a
  competitor cannot play two matches less than 2 h apart.
- **Decision of the organizer:** which kind of decision a match accepts, the justification and the tennis bonus of
  RN16 by final placement.

Services load the rows, call these functions and persist the result in one transaction. Contracts:
docs/decisoes/0003-times-campeonatos.md (section 21) and docs/decisoes/0002-jogar.md (section 17).
"""
from __future__ import annotations

import hashlib
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

from app.services.event_rules import TENNIS_BONUS, TransitionError
from app.services.match_rules import RuleError, Score
from app.services.scoring import outcome_for, team_points

CONFLICT_WINDOW = timedelta(hours=2)
SCHEDULE_HORIZON = timedelta(days=365)
JUSTIFICATION_LENGTH = (5, 500)
MIN_COMPETITORS = 2
ROUND_NAMES = {1: 'Final', 2: 'Semifinal', 3: 'Quartas de final', 4: 'Oitavas de final'}
DECISION_KINDS = ('divergencia', 'prazo', 'wo')
DecisionKind = Literal['divergencia', 'prazo', 'wo']
BONUS_BY_PLACEMENT = {1: TENNIS_BONUS['champion'], 2: TENNIS_BONUS['runner_up'], 3: TENNIS_BONUS['semifinalist'],
                      4: TENNIS_BONUS['semifinalist']}


# ----- Draw --------------------------------------------------------------------------------------------------

def draw_order(entry_ids: Iterable[int], seed: int) -> list[int]:
    """Deterministic shuffle: the same entries and the same seed always give the same order (reproducible draw).

    Each id is ranked by a SHA-256 of the seed and the id, which does not depend on the Python version."""
    return sorted(set(entry_ids), key=lambda entry_id: hashlib.sha256(f'arena:sorteio:{seed}:{entry_id}'.encode()).digest())


def elimination_size(count: int) -> int:
    """Smallest power of two (at least 2) that fits `count` entries."""
    if count < MIN_COMPETITORS:
        raise RuleError('Confirme pelo menos 2 inscrições para sortear o campeonato.')
    size = 2
    while size < count:
        size *= 2
    return size


def seed_order(size: int) -> list[int]:
    """Seeds in bracket order, so neighbours meet in the first round and the top seeds meet late:
    4 → [1, 4, 2, 3]; 8 → [1, 8, 4, 5, 2, 7, 3, 6]."""
    if size < 2 or size & (size - 1):
        raise ValueError('O tamanho da chave precisa ser uma potência de dois.')
    order = [1]
    while len(order) < size:
        total = len(order) * 2 + 1
        order = [value for seed in order for value in (seed, total - seed)]
    return order


def elimination_slots(ordered: Sequence[int], size: int) -> list[int | None]:
    """The plan of a bracket: slot `2i` and `2i+1` meet in the first round; `None` is a bye ("Folga")."""
    return [ordered[seed - 1] if seed <= len(ordered) else None for seed in seed_order(size)]


def validate_elimination_slots(slots: Sequence[int | None]) -> None:
    """A power of two of places, each pairing with at least one entry and no entry twice."""
    size = len(slots)
    if size < 2 or size & (size - 1):
        raise ValueError('Plano de chave inválido.')
    entries = [slot for slot in slots if slot is not None]
    if len(entries) != len(set(entries)) or len(entries) < MIN_COMPETITORS:
        raise ValueError('Plano de chave inválido.')
    for index in range(0, size, 2):
        if slots[index] is None and slots[index + 1] is None:
            raise RuleError('Essa troca deixaria um jogo sem nenhum time. Escolha outros lugares.')


def swap_slots(slots: Sequence[int | None], first: int, second: int) -> list[int | None]:
    """Two places swap their entries (a team may take a bye place). 422 for the same place twice, places that do
    not exist, two byes, or a swap that leaves a pairing empty."""
    size = len(slots)
    if not (0 <= first < size and 0 <= second < size):
        raise RuleError('Escolha lugares que existem na chave.', 'a')
    if first == second:
        raise RuleError('Escolha dois lugares diferentes para trocar.', 'b')
    if slots[first] is None and slots[second] is None:
        raise RuleError('Escolha pelo menos um time para trocar de lugar.', 'b')
    swapped = list(slots)
    swapped[first], swapped[second] = swapped[second], swapped[first]
    return swapped


# ----- Single elimination layout -----------------------------------------------------------------------------

@dataclass(frozen=True)
class SlotRef:
    """One side of a node: a known entry, a place waiting for the winner of a match, or a bye."""
    entry_id: int | None = None       # known entry (also the one that went through on a bye)
    from_match: int | None = None     # number (J) of the match whose winner arrives here
    bye: bool = False                 # "Folga": the first-round place has no entry
    advanced: bool = False            # the entry is here because its first-round pairing was a bye


@dataclass(frozen=True)
class Node:
    round: int                        # 1 is the first round; the last one is the final
    position: int                     # 1-based inside the round
    a: SlotRef
    b: SlotRef
    number: int | None                # J of the match; None for a bye pairing (no match is played)
    next: tuple[int, int, str] | None  # (round, position, 'a' | 'b') where the winner goes

    @property
    def is_bye(self) -> bool:
        return self.number is None

    @property
    def advancing_entry(self) -> int | None:
        """Who goes through when the pairing is a bye."""
        if not self.is_bye:
            return None
        return self.a.entry_id if self.a.entry_id is not None else self.b.entry_id


def round_count(size: int) -> int:
    return size.bit_length() - 1


def round_name(round_number: int, total_rounds: int) -> str:
    """"Oitavas de final", "Quartas de final", "Semifinal" or "Final", counted from the last round."""
    remaining = total_rounds - round_number + 1
    return ROUND_NAMES.get(remaining, f'Fase {round_number}')


def elimination_layout(slots: Sequence[int | None]) -> list[Node]:
    """Every node of the tree, round by round, with the J numbers of the real matches (byes have none)."""
    validate_elimination_slots(slots)
    size = len(slots)
    total = round_count(size)

    def counts(round_number: int) -> int:
        return size >> round_number

    def first_round_bye(position: int) -> bool:
        return slots[2 * position - 2] is None or slots[2 * position - 1] is None

    numbers: dict[tuple[int, int], int] = {}
    for round_number in range(1, total + 1):
        for position in range(1, counts(round_number) + 1):
            if not (round_number == 1 and first_round_bye(position)):
                numbers[(round_number, position)] = len(numbers) + 1

    def bye_winner(position: int) -> int:
        return slots[2 * position - 2] if slots[2 * position - 2] is not None else slots[2 * position - 1]

    def target(round_number: int, position: int) -> tuple[int, int, str] | None:
        if round_number == total:
            return None
        return round_number + 1, (position + 1) // 2, 'a' if position % 2 else 'b'

    nodes: list[Node] = []
    for round_number in range(1, total + 1):
        for position in range(1, counts(round_number) + 1):
            if round_number == 1:
                refs = [SlotRef(bye=True) if slots[index] is None else SlotRef(entry_id=slots[index])
                        for index in (2 * position - 2, 2 * position - 1)]
            else:
                refs = []
                for feeder in (2 * position - 1, 2 * position):
                    if round_number == 2 and first_round_bye(feeder):
                        refs.append(SlotRef(entry_id=bye_winner(feeder), advanced=True))
                    else:
                        refs.append(SlotRef(from_match=numbers[(round_number - 1, feeder)]))
            nodes.append(Node(round_number, position, refs[0], refs[1], numbers.get((round_number, position)),
                              target(round_number, position)))
    return nodes


# ----- Round robin -------------------------------------------------------------------------------------------

@dataclass(frozen=True)
class RoundPlan:
    number: int
    pairs: tuple[tuple[int, int], ...]     # (side a, side b)
    rest: int | None                       # entry that sits out the round (odd number of entries)


def validate_round_robin_slots(slots: Sequence[int | None]) -> None:
    entries = list(slots)
    if any(item is None for item in entries) or len(entries) != len(set(entries)) or len(entries) < MIN_COMPETITORS:
        raise ValueError('Plano de tabela inválido.')


def circle_rounds(ordered: Sequence[int]) -> list[RoundPlan]:
    """Circle method: the first entry stays, the others rotate. Every entry plays once per round (or rests when the
    number is odd) and every pair meets exactly once across the `n − 1` rounds (`n` rounds when `n` is odd)."""
    validate_round_robin_slots(ordered)
    teams: list[int | None] = list(ordered)
    if len(teams) % 2:
        teams.append(None)
    size = len(teams)
    rounds = []
    for number in range(1, size):
        pairs, rest = [], None
        for index in range(size // 2):
            first, second = teams[index], teams[size - 1 - index]
            if first is None or second is None:
                rest = second if first is None else first
                continue
            # Alternate the side so nobody is always "a".
            pairs.append((second, first) if (number + index) % 2 == 0 else (first, second))
        rounds.append(RoundPlan(number, tuple(pairs), rest))
        teams = [teams[0], teams[-1], *teams[1:-1]]
    return rounds


# ----- Table (round robin) -----------------------------------------------------------------------------------

@dataclass(frozen=True)
class TableRow:
    entry_id: int
    played: int = 0
    wins: int = 0
    draws: int = 0
    losses: int = 0
    goals_for: int = 0           # goals (football) or sets (tennis)
    goals_against: int = 0

    @property
    def points(self) -> int:
        return team_points('vitoria') * self.wins + team_points('empate') * self.draws

    @property
    def goal_difference(self) -> int:
        return self.goals_for - self.goals_against


def table_standings(entry_ids: Sequence[int], results: Iterable[tuple[int, int, int, int]]) -> list[TableRow]:
    """Classification from the confirmed results `(entry a, entry b, score a, score b)`: points 3/1/0, then goal
    difference, goals for and wins; the order of the draw settles what is left."""
    rows = {entry_id: dict(played=0, wins=0, draws=0, losses=0, goals_for=0, goals_against=0) for entry_id in entry_ids}
    for entry_a, entry_b, score_a, score_b in results:
        for entry, scored, conceded, side in ((entry_a, score_a, score_b, 'a'), (entry_b, score_b, score_a, 'b')):
            row = rows[entry]
            row['played'] += 1
            row['goals_for'] += scored
            row['goals_against'] += conceded
            outcome = outcome_for(side, 'a' if score_a > score_b else 'b' if score_b > score_a else None)
            row[{'vitoria': 'wins', 'empate': 'draws', 'derrota': 'losses'}[outcome]] += 1
    table = [TableRow(entry_id, **values) for entry_id, values in rows.items()]
    order = {entry_id: index for index, entry_id in enumerate(entry_ids)}
    return sorted(table, key=lambda row: (-row.points, -row.goal_difference, -row.goals_for, -row.wins,
                                          order[row.entry_id]))


# ----- Schedule ----------------------------------------------------------------------------------------------

def validate_schedule_start(starts_at: datetime, now: datetime) -> datetime:
    """Free start time (no fixed steps): with time zone, in the future and within a year."""
    if starts_at.tzinfo is None:
        raise RuleError('Informe a data e a hora com o fuso horário.', 'starts_at')
    moment = starts_at.replace(second=0, microsecond=0)
    if moment <= now:
        raise RuleError('Escolha uma data e um horário que ainda não passaram.', 'starts_at')
    if moment - now > SCHEDULE_HORIZON:
        raise RuleError('Escolha uma data nos próximos 12 meses.', 'starts_at')
    return moment


@dataclass(frozen=True)
class Booking:
    """A scheduled match of the event, for the conflict check."""
    match_id: int
    starts_at: datetime
    court_id: int | None
    subjects: frozenset[tuple[str, int]]      # ('time', team id) or ('atleta', user id)


def find_conflict(starts_at: datetime, court_id: int | None, subjects: Iterable[tuple[str, int]],
                  others: Iterable[Booking]) -> tuple[Literal['quadra', 'time'], Booking] | None:
    """The match that clashes with the new start: the same court with another match of the event less than 2 h
    apart (decided on 12 Oct 2026), else a competitor of the match that plays another one less than 2 h apart.
    Exactly 2 h apart is free."""
    near = sorted((other for other in others if abs(other.starts_at - starts_at) < CONFLICT_WINDOW),
                  key=lambda other: (abs(other.starts_at - starts_at), other.match_id))
    mine = frozenset(subjects)
    if court_id is not None:
        court = next((other for other in near if other.court_id == court_id), None)
        if court is not None:
            return 'quadra', court
    team = next((other for other in near if mine & other.subjects), None)
    return ('time', team) if team is not None else None


# ----- Result decision of the organizer ----------------------------------------------------------------------

def clean_justification(value: str | None) -> str:
    """Trimmed justification of 5 to 500 characters, registered and visible to both teams."""
    text = ' '.join((value or '').split())
    low, high = JUSTIFICATION_LENGTH
    if not low <= len(text) <= high:
        raise RuleError(f'Escreva a justificativa da decisão, de {low} a {high} caracteres.', 'justification')
    return text


def decision_kind(*, state: str, started: bool, reports_differ: bool, deadline_passed: bool,
                  walkover: bool) -> DecisionKind:
    """What the organizer may decide in a championship match now (`TransitionError` → 409 otherwise).

    - `wo`: a side did not show up; after the start.
    - `divergencia`: both sides reported different scores; the organizer need not wait for the deadline.
    - `prazo`: the 48 h passed without a confirmed result (a missing or single report).
    The match must be scheduled and not decided yet."""
    if state in ('realizada', 'encerrada', 'sem_resultado'):
        raise TransitionError('O resultado desta partida já foi definido.')
    if state == 'cancelada':
        raise TransitionError('Esta partida foi cancelada.')
    if state != 'agendada':
        raise TransitionError('Agende a partida antes de decidir o resultado.')
    if not started:
        raise TransitionError('A partida ainda não começou.')
    if walkover:
        return 'wo'
    if reports_differ:
        return 'divergencia'
    if deadline_passed:
        return 'prazo'
    raise TransitionError('Os times ainda podem informar o placar. O organizador decide quando os placares divergem, '
                          'depois do prazo de 48 h ou em caso de W.O.')


def ensure_decisive(score: Score, knockout: bool) -> None:
    """A knockout match has a winner: a football draw is refused (the score includes the penalties)."""
    if knockout and score.winner is None:
        raise RuleError('Na eliminação simples não há empate. Informe o placar final com o vencedor (some os '
                        'pênaltis, se houver).', 'goals_a')


# ----- Final placement and bonus (RN16) ----------------------------------------------------------------------

def elimination_placements(champion: int, runner_up: int, semifinal_losers: Iterable[int]) -> dict[int, int]:
    """Champion 1st, runner-up 2nd, the semifinal losers 3rd (there is no third-place match)."""
    placements = {champion: 1, runner_up: 2}
    placements.update({entry: 3 for entry in semifinal_losers})
    return placements


def table_placements(table: Sequence[TableRow]) -> dict[int, int]:
    return {row.entry_id: index for index, row in enumerate(table, start=1)}


def placement_bonus(placement: int) -> int:
    """Tennis bonus: champion +40, runner-up +20, 3rd and 4th +10 (applied only with 4+ confirmed entries)."""
    return BONUS_BY_PLACEMENT.get(placement, 0)

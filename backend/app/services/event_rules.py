"""Pure rules of events and entries (stage 2), without database access.

Deadlines (reservation of 48 h or until 12 h before the event; refund counted as received after 7 days),
eligibility (RN18), the draft checklist, state transitions of events and entries, the phase shown on the poster,
the next action of the management screen ("Agora"), the tennis bonus (RN16) and Pix key normalization.
Services load the rows, call these functions and persist the result in one transaction. Contracts:
docs/decisoes/0003-times-campeonatos.md (sections 10 and 12 to 19) and docs/decisoes/0002-jogar.md (section 6).
"""
from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from app.models.events import COMPETITION_TYPES, ELIMINATION_CAPACITIES, PIX_KEY_TYPES
from app.models.organizers import SPORTS
from app.models.rankings import FOOTBALL_FORMATS, RUN_DISTANCES_KM, TIERS

RESERVATION_WINDOW = timedelta(hours=48)
PAID_CLOSE_BEFORE_START = timedelta(hours=12)
REFUND_AUTO_CONFIRM_AFTER = timedelta(days=7)
NAME_LENGTH = (3, 60)
VENUE_LENGTH = (2, 120)
BENEFICIARY_LENGTH = (2, 80)
ROUND_ROBIN_CAPACITY = (3, 20)
RACE_CAPACITY = (2, 5000)
PRICE_CENTS = (100, 1_000_000)
TIER_LABELS = {'bronze': 'Bronze', 'prata': 'Prata', 'ouro': 'Ouro', 'diamante': 'Diamante', 'lendario': 'Lendário'}
# RN16: tennis championships with at least 4 confirmed entries give ranking points by final placement.
TENNIS_BONUS = {'champion': 40, 'runner_up': 20, 'semifinalist': 10, 'min_entries': 4}

# Fields of the draft input that only make sense for one sport (cleared when the sport changes).
SPORT_ONLY_FIELDS = {'format': 'futebol', 'distance_km': 'corrida', 'course_notes': 'corrida'}
DRAFT_FIELDS = ('name', 'sport', 'format', 'distance_km', 'competition_type', 'capacity', 'accepted_tiers', 'city_id',
                'venue', 'course_notes', 'starts_at', 'registration_closes_at', 'price_cents', 'pix_beneficiary',
                'pix_key_type', 'pix_key', 'pix_copy_paste', 'pix_instructions', 'contact')
# After publication only practical details change; price, Pix and rules would change what people paid for.
EDITABLE_AFTER_PUBLISH = ('venue', 'course_notes', 'pix_instructions', 'contact')


class TransitionError(ValueError):
    """Action not allowed in the current state; the message is shown to the user (HTTP 409)."""


# ----- Deadlines ---------------------------------------------------------------------------------------------

def reservation_deadline(entered_at: datetime, starts_at: datetime) -> datetime:
    """End of a paid reservation: 48 h after entering or 12 h before the event, whichever comes first."""
    return min(entered_at + RESERVATION_WINDOW, starts_at - PAID_CLOSE_BEFORE_START)


def registration_deadline(registration_closes_at: datetime, starts_at: datetime, *, paid: bool) -> datetime:
    """Last moment to enter. Paid events also stop 12 h before the start, when no reservation fits anymore."""
    if paid:
        return min(registration_closes_at, starts_at - PAID_CLOSE_BEFORE_START)
    return min(registration_closes_at, starts_at)


def event_registration_deadline(event: Any) -> datetime | None:
    if event.registration_closes_at is None or event.starts_at is None:
        return None
    return registration_deadline(event.registration_closes_at, event.starts_at, paid=bool(event.price_cents))


def registration_open(event: Any, now: datetime) -> bool:
    """Published, not suspended by a pending revocation decision and before the registration deadline."""
    deadline = event_registration_deadline(event)
    return (event.state == 'publicado' and event.revocation_decision != 'pendente'
            and deadline is not None and now < deadline)


def refund_auto_confirm_at(sent_at: datetime) -> datetime:
    """A refund receipt without an answer counts as received 7 days after it was attached."""
    return sent_at + REFUND_AUTO_CONFIRM_AFTER


def is_open_refund(receipt: Any) -> bool:
    """Refund receipt waiting for the participant, or contested and waiting for the administration.

    Same rule as the partial unique index `uq_entry_receipts_refund_open` and as `events.open_refund_clause`.
    """
    return (receipt.kind == 'devolucao' and receipt.resolution is None
            and receipt.participant_response in (None, 'contestada'))


def spots_left(capacity: int | None, holding_count: int) -> int:
    return max((capacity or 0) - holding_count, 0)


# ----- Eligibility (RN18) ------------------------------------------------------------------------------------

@dataclass(frozen=True)
class Eligibility:
    eligible: bool
    reason: str | None = None   # 'em_classificacao' | 'fora_da_faixa' | 'sem_time'
    message: str | None = None


def tiers_text(tiers: Sequence[str]) -> str:
    """'Prata e Ouro', 'Bronze, Prata e Ouro', in tier order."""
    labels = [TIER_LABELS[tier] for tier in TIERS if tier in tiers]
    return labels[0] if len(labels) == 1 else f"{', '.join(labels[:-1])} e {labels[-1]}"


def eligibility(accepted_tiers: Sequence[str] | None, tier: str | None) -> Eligibility:
    """RN18: open events take everyone; restricted events take only the accepted tiers.

    Who is still in placement (no tier) only enters open events. The tier is the team's in the event format
    (football), the athlete's in tennis or the athlete's at the race distance (running): see `entry_subject`
    and `services.rankings.subject_tier`.
    """
    if accepted_tiers is None:
        return Eligibility(True)
    if tier is None:
        return Eligibility(False, 'em_classificacao',
                           'Quem está em classificação só se inscreve em evento aberto a todos.')
    if tier in accepted_tiers:
        return Eligibility(True)
    return Eligibility(False, 'fora_da_faixa', f'Este evento aceita só {tiers_text(accepted_tiers)}.')


NO_TEAM = Eligibility(False, 'sem_time', 'Para inscrever um time, você precisa ser representante dele.')


def entry_subject(sport: str) -> str:
    """Football entries are made by a team (through a representative); tennis and running by the athlete."""
    if sport not in SPORTS:
        raise ValueError('Modalidade inválida.')
    return 'time' if sport == 'futebol' else 'atleta'


# ----- Draft: category, capacity, Pix and checklist ----------------------------------------------------------

def normalize_category(values: Mapping[str, Any]) -> dict[str, Any]:
    """Drops what does not apply to the chosen sport and type (used when creating or editing a draft).

    Changing the sport clears format, distance, type and course notes of the previous one. A capacity that the
    elimination does not accept (4, 8 or 16) is cleared too, so the checklist asks for it again instead of the
    database refusing the draft; other out-of-range capacities stay in the draft and the checklist flags them.
    """
    result = dict(values)
    sport = result.get('sport')
    for field, only_for in SPORT_ONLY_FIELDS.items():
        if sport != only_for:
            result[field] = None
    if sport not in ('futebol', 'tenis'):
        result['competition_type'] = None
    if (result.get('competition_type') == 'eliminacao_simples'
            and result.get('capacity') not in (None, *ELIMINATION_CAPACITIES)):
        result['capacity'] = None
    return result


def capacity_error(sport: str | None, competition_type: str | None, capacity: int | None) -> str | None:
    if capacity is None:
        return 'Informe as vagas.'
    if sport == 'corrida':
        low, high = RACE_CAPACITY
        return None if low <= capacity <= high else f'Na corrida, as vagas vão de {low} a {high}.'
    if competition_type == 'eliminacao_simples':
        return None if capacity in ELIMINATION_CAPACITIES else 'Na eliminação simples, as vagas são 4, 8 ou 16.'
    if competition_type == 'todos_contra_todos':
        low, high = ROUND_ROBIN_CAPACITY
        return None if low <= capacity <= high else f'No todos contra todos, as vagas vão de {low} a {high}.'
    return 'Escolha o tipo antes das vagas.'


EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
RANDOM_KEY_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')


def _valid_cpf(digits: str) -> bool:
    if len(digits) != 11 or digits == digits[0] * 11:
        return False
    for size in (9, 10):
        total = sum(int(digit) * weight for digit, weight in zip(digits[:size], range(size + 1, 1, -1)))
        if (total * 10 % 11) % 10 != int(digits[size]):
            return False
    return True


def normalize_pix_key(key_type: str, key: str) -> str:
    """Canonical Pix key for the type (CPF digits, lower-case e-mail, +55 phone, lower-case random key)."""
    value = (key or '').strip()
    if key_type == 'cpf':
        digits = re.sub(r'\D', '', value)
        if not _valid_cpf(digits):
            raise ValueError('Informe um CPF válido.')
        return digits
    if key_type == 'email':
        value = value.lower()
        if len(value) > 77 or not EMAIL_RE.match(value):
            raise ValueError('Informe um e-mail válido.')
        return value
    if key_type == 'telefone':
        digits = re.sub(r'\D', '', value)
        if value.startswith('+'):
            if not digits.startswith('55'):
                raise ValueError('Use um telefone do Brasil, com DDD.')
            digits = digits[2:]
        if len(digits) not in (10, 11) or digits[0] == '0':
            raise ValueError('Informe o telefone com DDD.')
        return f'+55{digits}'
    if key_type == 'aleatoria':
        value = value.lower()
        if not RANDOM_KEY_RE.match(value):
            raise ValueError('Copie a chave aleatória completa, como aparece no app do banco.')
        return value
    raise ValueError('Escolha o tipo de chave Pix.')


@dataclass(frozen=True)
class ChecklistItem:
    key: str      # nome_modalidade | formato_tipo | vagas_elos | datas | local | inscricao
    label: str
    done: bool
    message: str | None = None


def _text_ok(value: str | None, bounds: tuple[int, int]) -> bool:
    return value is not None and bounds[0] <= len(value.strip()) <= bounds[1]


def _category_item(event: Any) -> ChecklistItem:
    if event.sport == 'futebol':
        done = event.format in FOOTBALL_FORMATS and event.competition_type in COMPETITION_TYPES
        return ChecklistItem('formato_tipo', 'Formato e tipo', done, None if done else 'Escolha o formato e o tipo.')
    if event.sport == 'tenis':
        done = event.competition_type in COMPETITION_TYPES
        return ChecklistItem('formato_tipo', 'Tipo', done, None if done else 'Escolha o tipo.')
    if event.sport == 'corrida':
        done = event.distance_km in RUN_DISTANCES_KM
        return ChecklistItem('formato_tipo', 'Distância', done, None if done else 'Escolha a distância.')
    return ChecklistItem('formato_tipo', 'Formato e tipo', False, 'Escolha a modalidade primeiro.')


def _dates_message(event: Any, now: datetime) -> str | None:
    if event.starts_at is None or event.registration_closes_at is None:
        return 'Informe a data do evento e o fim das inscrições.'
    if event.registration_closes_at > event.starts_at:
        return 'As inscrições precisam fechar antes do início do evento.'
    if event.starts_at <= now:
        return 'A data do evento já passou.'
    if event.registration_closes_at <= now:
        return 'O fim das inscrições já passou.'
    if event.price_cents and event.starts_at - PAID_CLOSE_BEFORE_START <= now:
        return 'Inscrições pagas fecham 12 h antes do início; escolha outra data.'
    return None


def _payment_message(event: Any) -> str | None:
    if event.price_cents is None:
        return 'Escolha se a inscrição é gratuita ou paga.'
    if event.price_cents == 0:
        return None
    if not PRICE_CENTS[0] <= event.price_cents <= PRICE_CENTS[1]:
        return 'O valor vai de R$ 1,00 a R$ 10.000,00.'
    if not _text_ok(event.pix_beneficiary, BENEFICIARY_LENGTH) or event.pix_key_type not in PIX_KEY_TYPES:
        return 'Preencha o favorecido e o tipo de chave Pix.'
    try:
        normalize_pix_key(event.pix_key_type, event.pix_key or '')
    except ValueError as error:
        return str(error)
    return None


def draft_checklist(event: Any, now: datetime) -> list[ChecklistItem]:
    """What a draft still needs before publishing (G3). Accepts the model or any object with its attributes."""
    named = _text_ok(event.name, NAME_LENGTH) and event.sport in SPORTS
    tiers = event.accepted_tiers
    tiers_ok = tiers is None or (len(tiers) >= 1 and set(tiers) <= set(TIERS))
    capacity = capacity_error(event.sport, event.competition_type, event.capacity) if event.sport else 'Informe as vagas.'
    dates = _dates_message(event, now)
    placed = event.city_id is not None and _text_ok(event.venue, VENUE_LENGTH)
    payment = _payment_message(event)
    return [
        ChecklistItem('nome_modalidade', 'Nome e modalidade', named,
                      None if named else 'Informe o nome (3 a 60 caracteres) e a modalidade.'),
        _category_item(event),
        ChecklistItem('vagas_elos', 'Vagas e elos aceitos', capacity is None and tiers_ok,
                      capacity or (None if tiers_ok else 'Escolha ao menos um elo ou deixe aberto a todos.')),
        ChecklistItem('datas', 'Datas', dates is None, dates),
        ChecklistItem('local', 'Local', placed, None if placed else 'Informe a cidade e o local.'),
        ChecklistItem('inscricao', 'Inscrição e Pix', payment is None, payment),
    ]


def checklist_complete(items: Sequence[ChecklistItem]) -> bool:
    return all(item.done for item in items)


def editable_fields(state: str) -> tuple[str, ...]:
    """Fields the organizer may change in each state (PATCH answers 409 for the others)."""
    if state == 'rascunho':
        return DRAFT_FIELDS
    if state in ('publicado', 'em_andamento'):
        return EDITABLE_AFTER_PUBLISH
    return ()


# ----- Event states ------------------------------------------------------------------------------------------

EVENT_TRANSITIONS: dict[str, dict[str, str]] = {
    # Free events publish directly; paid ones go to the administration ('enviar' resolves the target).
    'enviar': {'rascunho': 'publicado'},
    'retirar': {'em_aprovacao': 'rascunho'},
    'aprovar': {'em_aprovacao': 'publicado'},
    'recusar': {'em_aprovacao': 'rascunho'},
    # Organizer lost the permission while the event waited for the administration.
    'revogar': {'em_aprovacao': 'rascunho'},
    'cancelar': {'publicado': 'cancelado', 'em_andamento': 'cancelado'},
    # Triggers come with the bracket (fase 6) and the race results (corrida); nothing calls them in stage 2.
    'iniciar': {'publicado': 'em_andamento'},
    'encerrar': {'em_andamento': 'encerrado'},
}
EVENT_TRANSITION_ERRORS = {
    'enviar': 'Só rascunhos podem ser enviados.',
    'retirar': 'Este evento não está em aprovação.',
    'aprovar': 'Este evento já foi decidido.',
    'recusar': 'Este evento já foi decidido.',
    'revogar': 'Este evento não está em aprovação.',
    'cancelar': 'Só eventos publicados ou em andamento podem ser cancelados.',
    'iniciar': 'Só eventos publicados podem começar.',
    'encerrar': 'Só eventos em andamento podem ser encerrados.',
}


def next_event_state(state: str, action: str, *, paid: bool = False) -> str:
    target = EVENT_TRANSITIONS[action].get(state)
    if target is None:
        raise TransitionError(EVENT_TRANSITION_ERRORS[action])
    if action == 'enviar' and paid:
        return 'em_aprovacao'
    return target


def event_phase(state: str, *, registration_deadline: datetime | None, now: datetime) -> str:
    """Label of the poster: publication splits into 'inscricoes_abertas' and 'inscricoes_encerradas'."""
    if state != 'publicado':
        return state
    if registration_deadline is not None and now < registration_deadline:
        return 'inscricoes_abertas'
    return 'inscricoes_encerradas'


# ----- Entry states ------------------------------------------------------------------------------------------

ENTRY_TRANSITIONS: dict[str, dict[str, str]] = {
    'enviar_comprovante': {'reservada': 'em_analise', 'rejeitada': 'em_analise'},
    'aprovar_comprovante': {'em_analise': 'confirmada'},
    'recusar_comprovante': {'em_analise': 'rejeitada'},
    'expirar': {'reservada': 'expirada', 'rejeitada': 'expirada'},
    'cancelar': {'reservada': 'cancelada', 'rejeitada': 'cancelada', 'confirmada': 'cancelada'},
    'confirmar_devolucao': {'devolucao_pendente': 'devolvida'},
    'contestar_devolucao': {'devolucao_pendente': 'devolucao_contestada'},
    'devolucao_automatica': {'devolucao_pendente': 'devolvida'},
    # Administration's answer to a contested refund.
    'manter_devolucao': {'devolucao_contestada': 'devolvida'},
    'reabrir_devolucao': {'devolucao_contestada': 'devolucao_pendente'},
}
ENTRY_TRANSITION_ERRORS = {
    'enviar_comprovante': 'Esta inscrição não aguarda comprovante.',
    'aprovar_comprovante': 'Esta inscrição não está em análise.',
    'recusar_comprovante': 'Esta inscrição não está em análise.',
    'expirar': 'Esta reserva não pode expirar.',
    'cancelar': 'Esta inscrição já foi encerrada.',
    'confirmar_devolucao': 'Nenhuma devolução aguarda a sua resposta.',
    'contestar_devolucao': 'Nenhuma devolução aguarda a sua resposta.',
    'devolucao_automatica': 'Nenhuma devolução aguarda resposta.',
    'manter_devolucao': 'Esta devolução não está contestada.',
    'reabrir_devolucao': 'Esta devolução não está contestada.',
}


def initial_entry_state(*, paid: bool) -> str:
    """Free entries are confirmed at once; paid ones start as a reservation waiting for the receipt."""
    return 'reservada' if paid else 'confirmada'


def next_entry_state(state: str, action: str, *, paid: bool = False, now: datetime | None = None,
                     reserved_until: datetime | None = None) -> str:
    """Target state of an entry action, or TransitionError with the message for the 409.

    `enviar_comprovante` needs the reservation to be running; a refusal after the reservation ended expires the
    entry at once (there is no time left to send another receipt); a paid entry already paid (or under analysis)
    is not cancelled by the participant: the payment happened outside the Arena.
    """
    target = ENTRY_TRANSITIONS[action].get(state)
    if target is None:
        raise TransitionError(ENTRY_TRANSITION_ERRORS[action])
    if action == 'enviar_comprovante' and (now is None or reserved_until is None or now >= reserved_until):
        raise TransitionError('O prazo da reserva acabou.')
    if action == 'recusar_comprovante' and now is not None and reserved_until is not None and now >= reserved_until:
        return 'expirada'
    if action == 'cancelar' and state == 'confirmada' and paid:
        raise TransitionError('Para desistir de uma inscrição paga, fale com o organizador.')
    return target


def reservation_lapsed(state: str, reserved_until: datetime | None, now: datetime) -> bool:
    """A reservation (or a refused receipt) whose deadline passed, even if the sweep did not run yet."""
    return state in ('reservada', 'rejeitada') and reserved_until is not None and now >= reserved_until


def effective_entry_state(state: str, reserved_until: datetime | None, now: datetime) -> str:
    """State to show and to authorize with: a lapsed reservation reads as 'expirada' before the sweep runs."""
    return 'expirada' if reservation_lapsed(state, reserved_until, now) else state


def entry_state_on_event_cancel(state: str, *, paid: bool) -> str | None:
    """New state of an entry when its event is cancelled, or None when it does not change.

    Paid entries confirmed or under analysis (the participant declared the payment) wait for the refund by Pix;
    reservations without payment and free entries are just cancelled; finished entries stay as they are.
    """
    if state in ('confirmada', 'em_analise') and paid:
        return 'devolucao_pendente'
    if state in ('reservada', 'rejeitada', 'confirmada', 'em_analise'):
        return 'cancelada'
    return None


# ----- Management screen (G3 and O3) -------------------------------------------------------------------------

@dataclass(frozen=True)
class PendingCounts:
    """Pending work of an event; `total` (receipts + refunds to send) is the alert on the organizer's poster."""
    receipts: int = 0           # entries 'em_analise' (payment receipt to analyse)
    refunds_to_send: int = 0    # 'devolucao_pendente' without an open refund receipt
    refunds_awaiting: int = 0   # refund receipt attached, waiting for the participant (or the 7 days)
    refund_disputes: int = 0    # 'devolucao_contestada', decided by the administration

    @property
    def total(self) -> int:
        return self.receipts + self.refunds_to_send


@dataclass(frozen=True)
class ChampionshipCounts:
    """Bracket and matches of a championship (fase 6) for the "Agora" card and the poster of the organizer."""
    bracket: str = 'sem_chaveamento'   # 'sem_chaveamento' | 'sorteado' | 'confirmado'
    confirmed: int = 0                 # confirmed entries (what the draw uses)
    matches_total: int = 0
    to_schedule: int = 0               # both sides known and no date yet
    waiting: int = 0                   # a side still waits for the winner of a previous match
    scheduled: int = 0                 # scheduled and without a final result
    to_decide: int = 0                 # divergent score, or 48 h passed without a result: the organizer decides
    finished: int = 0                  # with a final result


@dataclass(frozen=True)
class NextAction:
    kind: str
    count: int | None = None
    deadline: datetime | None = None


def next_action(event: Any, *, pending: PendingCounts, checklist_done: bool, now: datetime,
                championship: ChampionshipCounts | None = None) -> NextAction:
    """The "Agora" card: the most urgent thing for the organizer, in a fixed priority.

    Kinds: aguardar_revogacao, corrigir_recusa, completar_rascunho, publicar, aguardar_aprovacao,
    analisar_comprovantes, enviar_devolucoes, aguardar_devolucoes, sortear_chaveamento, confirmar_chaveamento,
    decidir_divergencias, agendar_partidas, acompanhar_partidas, acompanhar_inscricoes, aguardar_inicio, nenhuma.
    The bracket kinds (fase 6) need the `championship` counts and come after the receipts and refunds.
    """
    if event.revocation_decision == 'pendente':
        return NextAction('aguardar_revogacao')
    if event.state == 'rascunho':
        if event.review_reason_code:
            return NextAction('corrigir_recusa')
        return NextAction('publicar' if checklist_done else 'completar_rascunho')
    if event.state == 'em_aprovacao':
        return NextAction('aguardar_aprovacao')
    if pending.receipts:
        return NextAction('analisar_comprovantes', pending.receipts)
    if pending.refunds_to_send:
        return NextAction('enviar_devolucoes', pending.refunds_to_send)
    if event.state == 'cancelado':
        waiting = pending.refunds_awaiting + pending.refund_disputes
        return NextAction('aguardar_devolucoes', waiting) if waiting else NextAction('nenhuma')
    if event.state == 'publicado':
        deadline = event_registration_deadline(event)
        if deadline is not None and now < deadline:
            return NextAction('acompanhar_inscricoes', deadline=deadline)
        if championship is not None:
            if championship.bracket == 'sorteado':
                return NextAction('confirmar_chaveamento', championship.confirmed)
            if championship.bracket == 'sem_chaveamento' and championship.confirmed >= 2:
                return NextAction('sortear_chaveamento', championship.confirmed)
        return NextAction('aguardar_inicio', deadline=event.starts_at)
    if event.state == 'em_andamento' and championship is not None:
        if championship.to_decide:
            return NextAction('decidir_divergencias', championship.to_decide)
        if championship.to_schedule:
            return NextAction('agendar_partidas', championship.to_schedule)
        if championship.scheduled or championship.waiting:
            return NextAction('acompanhar_partidas', championship.scheduled)
    return NextAction('nenhuma')


def tennis_bonus(sport: str | None, confirmed_count: int) -> dict | None:
    """RN16 bonus shown on tennis championships; `applies` needs at least 4 **confirmed** entries.

    "Inscritos" are the confirmed entries (the D2 tab and the bracket of fase 6, which goes on with the confirmed
    ones); reservations and receipts under analysis may still expire, so they do not count. Both the organizer's
    G3 and the athlete's D2 call this with `confirmed_count`.
    """
    if sport != 'tenis':
        return None
    return {**TENNIS_BONUS, 'applies': confirmed_count >= TENNIS_BONUS['min_entries']}

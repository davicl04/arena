from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.services import event_rules as rules
from app.services.event_rules import (
    PendingCounts,
    TransitionError,
    capacity_error,
    checklist_complete,
    draft_checklist,
    editable_fields,
    eligibility,
    entry_state_on_event_cancel,
    entry_subject,
    event_phase,
    initial_entry_state,
    next_action,
    next_entry_state,
    next_event_state,
    normalize_category,
    normalize_pix_key,
    registration_deadline,
    registration_open,
    reservation_deadline,
    tennis_bonus,
    tiers_text,
)

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
H = timedelta(hours=1)


def event(**values):
    base = dict(name='Copa Sudoeste Society', sport='futebol', format='society', distance_km=None,
                competition_type='eliminacao_simples', capacity=8, accepted_tiers=None, city_id=5300108,
                venue='Arena Sudoeste', course_notes=None, starts_at=NOW + 10 * 24 * H,
                registration_closes_at=NOW + 7 * 24 * H, price_cents=0, pix_beneficiary=None, pix_key_type=None,
                pix_key=None, state='rascunho', revocation_decision=None, review_reason_code=None)
    base.update(values)
    return SimpleNamespace(**base)


PAID = dict(price_cents=24000, pix_beneficiary='Rafa Nunes', pix_key_type='email', pix_key='copa.sudoeste@pix.com')


def test_reservation_lasts_48_hours_or_until_12_hours_before_the_event():
    assert reservation_deadline(NOW, NOW + 10 * 24 * H) == NOW + 48 * H
    assert reservation_deadline(NOW, NOW + 30 * H) == NOW + 18 * H
    assert reservation_deadline(NOW, NOW + 60 * H) == NOW + 48 * H


def test_registration_deadline_stops_paid_events_12_hours_before_the_start():
    closes, starts = NOW + 20 * H, NOW + 24 * H
    assert registration_deadline(closes, starts, paid=False) == closes
    assert registration_deadline(closes, starts, paid=True) == NOW + 12 * H
    assert registration_deadline(NOW + H, starts, paid=True) == NOW + H


def test_registration_is_open_only_while_published_unsuspended_and_before_the_deadline():
    published = event(state='publicado')
    assert registration_open(published, NOW)
    assert not registration_open(event(state='publicado', revocation_decision='pendente'), NOW)
    assert registration_open(event(state='publicado', revocation_decision='seguir'), NOW)
    assert not registration_open(event(state='rascunho'), NOW)
    assert not registration_open(event(state='em_andamento'), NOW)
    assert not registration_open(published, published.registration_closes_at)
    assert not registration_open(event(state='publicado', starts_at=None), NOW)
    assert rules.event_registration_deadline(event(registration_closes_at=None)) is None


def test_eligibility_follows_rn18():
    assert eligibility(None, None).eligible and eligibility(None, 'ouro').eligible
    placement = eligibility(['prata', 'ouro'], None)
    assert (placement.eligible, placement.reason) == (False, 'em_classificacao')
    assert 'evento aberto' in placement.message
    assert eligibility(['prata', 'ouro'], 'ouro').eligible
    outside = eligibility(['ouro', 'prata'], 'bronze')
    assert (outside.eligible, outside.reason, outside.message) == (False, 'fora_da_faixa',
                                                                   'Este evento aceita só Prata e Ouro.')
    assert tiers_text(['lendario']) == 'Lendário'
    assert tiers_text(['ouro', 'bronze', 'prata']) == 'Bronze, Prata e Ouro'
    assert rules.NO_TEAM.reason == 'sem_time'


def test_entries_are_by_team_in_football_and_by_athlete_otherwise():
    assert [entry_subject(sport) for sport in ('futebol', 'tenis', 'corrida')] == ['time', 'atleta', 'atleta']
    with pytest.raises(ValueError):
        entry_subject('xadrez')


def test_normalize_category_drops_fields_of_another_sport_and_invalid_elimination_capacity():
    run = normalize_category({'sport': 'corrida', 'format': 'society', 'competition_type': 'eliminacao_simples',
                              'distance_km': 10, 'course_notes': 'Plano', 'capacity': 150})
    assert (run['format'], run['competition_type'], run['distance_km'], run['course_notes'], run['capacity']) == (
        None, None, 10, 'Plano', 150)
    football = normalize_category({'sport': 'futebol', 'format': 'society', 'distance_km': 10,
                                   'competition_type': 'eliminacao_simples', 'capacity': 6, 'course_notes': 'x'})
    assert (football['distance_km'], football['course_notes'], football['capacity']) == (None, None, None)
    league = normalize_category({'sport': 'tenis', 'competition_type': 'todos_contra_todos', 'capacity': 30})
    assert (league['competition_type'], league['capacity'], league['format']) == ('todos_contra_todos', 30, None)
    assert normalize_category({'sport': None, 'competition_type': 'todos_contra_todos'})['competition_type'] is None


@pytest.mark.parametrize(('sport', 'kind', 'capacity', 'expected'), [
    ('futebol', 'eliminacao_simples', 8, None), ('futebol', 'eliminacao_simples', 6, 'Na eliminação'),
    ('tenis', 'todos_contra_todos', 3, None), ('tenis', 'todos_contra_todos', 21, 'No todos contra todos'),
    ('corrida', None, 5000, None), ('corrida', None, 1, 'Na corrida'), ('futebol', None, 8, 'Escolha o tipo'),
    ('futebol', 'todos_contra_todos', None, 'Informe as vagas'),
])
def test_capacity_rules(sport, kind, capacity, expected):
    error = capacity_error(sport, kind, capacity)
    assert error is None if expected is None else error.startswith(expected)


@pytest.mark.parametrize(('kind', 'raw', 'expected'), [
    ('cpf', '529.982.247-25', '52998224725'), ('email', ' Copa.Sudoeste@PIX.com ', 'copa.sudoeste@pix.com'),
    ('telefone', '(61) 99999-0000', '+5561999990000'), ('telefone', '+55 61 3333-0000', '+556133330000'),
    ('aleatoria', '123E4567-E89B-12D3-A456-426614174000', '123e4567-e89b-12d3-a456-426614174000'),
])
def test_pix_keys_are_normalized(kind, raw, expected):
    assert normalize_pix_key(kind, raw) == expected


@pytest.mark.parametrize(('kind', 'raw'), [
    ('cpf', '529.982.247-24'), ('cpf', '111.111.111-11'), ('cpf', '123'), ('email', 'sem-arroba'),
    ('email', 'a' * 70 + '@pix.com.br'), ('telefone', '+1 202 555 0100'), ('telefone', '9999-0000'),
    ('telefone', '(06) 99999-0000'), ('aleatoria', '123e4567'), ('chave', 'x'),
])
def test_invalid_pix_keys_are_refused_with_a_message(kind, raw):
    with pytest.raises(ValueError) as error:
        normalize_pix_key(kind, raw)
    assert str(error.value)


def test_checklist_of_an_empty_draft_lists_everything():
    draft = event(sport=None, format=None, competition_type=None, capacity=None, city_id=None, venue=None,
                  starts_at=None, registration_closes_at=None, price_cents=None, name='Copa')
    items = draft_checklist(draft, NOW)
    assert [item.key for item in items] == ['nome_modalidade', 'formato_tipo', 'vagas_elos', 'datas', 'local',
                                            'inscricao']
    assert [item.done for item in items] == [False] * 6
    assert all(item.message for item in items)
    assert not checklist_complete(items)


def test_checklist_of_complete_free_and_paid_events():
    assert checklist_complete(draft_checklist(event(), NOW))
    assert checklist_complete(draft_checklist(event(**PAID), NOW))
    tennis = event(sport='tenis', format=None, competition_type='todos_contra_todos', capacity=12,
                   accepted_tiers=['prata', 'ouro'])
    assert checklist_complete(draft_checklist(tennis, NOW))
    race = event(sport='corrida', format=None, competition_type=None, distance_km=10, capacity=150)
    items = draft_checklist(race, NOW)
    assert checklist_complete(items) and items[1].label == 'Distância'


def by_key(item_list):
    return {item.key: item for item in item_list}


@pytest.mark.parametrize(('values', 'key', 'message'), [
    (dict(sport='tenis', format=None, competition_type=None), 'formato_tipo', 'Escolha o tipo.'),
    (dict(sport='corrida', format=None, competition_type=None, distance_km=None, capacity=50), 'formato_tipo',
     'Escolha a distância.'),
    (dict(format=None), 'formato_tipo', 'Escolha o formato e o tipo.'),
    (dict(accepted_tiers=[]), 'vagas_elos', 'Escolha ao menos um elo'),
    (dict(competition_type='todos_contra_todos', capacity=40), 'vagas_elos', 'No todos contra todos'),
    (dict(registration_closes_at=NOW + 11 * 24 * H), 'datas', 'As inscrições precisam fechar antes'),
    (dict(starts_at=NOW - H, registration_closes_at=NOW - 2 * H), 'datas', 'A data do evento já passou.'),
    (dict(registration_closes_at=NOW - H), 'datas', 'O fim das inscrições já passou.'),
    (dict(starts_at=NOW + 11 * H, registration_closes_at=NOW + 10 * H, **PAID), 'datas', 'Inscrições pagas fecham'),
    (dict(venue=' '), 'local', 'Informe a cidade e o local.'),
    (dict(price_cents=50), 'inscricao', 'O valor vai de'),
    (dict(price_cents=24000), 'inscricao', 'Preencha o favorecido'),
    (dict(**{**PAID, 'pix_key': 'sem-arroba'}), 'inscricao', 'Informe um e-mail válido.'),
])
def test_checklist_explains_what_is_missing(values, key, message):
    item = by_key(draft_checklist(event(**values), NOW))[key]
    assert not item.done and item.message.startswith(message)


def test_editable_fields_by_state():
    assert 'price_cents' in editable_fields('rascunho') and 'name' in editable_fields('rascunho')
    assert editable_fields('publicado') == ('venue', 'course_notes', 'pix_instructions', 'contact')
    assert editable_fields('em_andamento') == editable_fields('publicado')
    assert editable_fields('em_aprovacao') == () == editable_fields('cancelado')


def test_event_transitions():
    assert next_event_state('rascunho', 'enviar') == 'publicado'
    assert next_event_state('rascunho', 'enviar', paid=True) == 'em_aprovacao'
    assert next_event_state('em_aprovacao', 'aprovar') == 'publicado'
    assert next_event_state('em_aprovacao', 'recusar') == 'rascunho'
    assert next_event_state('em_aprovacao', 'retirar') == 'rascunho'
    assert next_event_state('em_aprovacao', 'revogar') == 'rascunho'
    assert next_event_state('publicado', 'cancelar') == 'cancelado'
    assert next_event_state('em_andamento', 'cancelar') == 'cancelado'
    assert next_event_state('publicado', 'iniciar') == 'em_andamento'
    assert next_event_state('em_andamento', 'encerrar') == 'encerrado'


@pytest.mark.parametrize(('state', 'action', 'message'), [
    ('publicado', 'enviar', 'Só rascunhos podem ser enviados.'), ('publicado', 'aprovar', 'Este evento já foi decidido.'),
    ('rascunho', 'retirar', 'Este evento não está em aprovação.'),
    ('rascunho', 'cancelar', 'Só eventos publicados ou em andamento podem ser cancelados.'),
    ('cancelado', 'cancelar', 'Só eventos publicados ou em andamento podem ser cancelados.'),
    ('encerrado', 'iniciar', 'Só eventos publicados podem começar.'),
    ('publicado', 'encerrar', 'Só eventos em andamento podem ser encerrados.'),
])
def test_invalid_event_transitions_explain_why(state, action, message):
    with pytest.raises(TransitionError) as error:
        next_event_state(state, action)
    assert str(error.value) == message


def test_event_phase_splits_publication_by_registration_deadline():
    deadline = NOW + H
    assert event_phase('publicado', registration_deadline=deadline, now=NOW) == 'inscricoes_abertas'
    assert event_phase('publicado', registration_deadline=deadline, now=deadline) == 'inscricoes_encerradas'
    assert event_phase('publicado', registration_deadline=None, now=NOW) == 'inscricoes_encerradas'
    for state in ('rascunho', 'em_aprovacao', 'em_andamento', 'encerrado', 'cancelado'):
        assert event_phase(state, registration_deadline=deadline, now=NOW) == state


def test_entry_flow_for_paid_and_free_entries():
    assert initial_entry_state(paid=False) == 'confirmada' and initial_entry_state(paid=True) == 'reservada'
    until = NOW + H
    assert next_entry_state('reservada', 'enviar_comprovante', now=NOW, reserved_until=until) == 'em_analise'
    assert next_entry_state('rejeitada', 'enviar_comprovante', now=NOW, reserved_until=until) == 'em_analise'
    assert next_entry_state('em_analise', 'aprovar_comprovante') == 'confirmada'
    assert next_entry_state('em_analise', 'recusar_comprovante', now=NOW, reserved_until=until) == 'rejeitada'
    # Refused after the reservation ended: no time left to resend, the entry expires at once.
    assert next_entry_state('em_analise', 'recusar_comprovante', now=until, reserved_until=until) == 'expirada'
    assert next_entry_state('reservada', 'expirar') == next_entry_state('rejeitada', 'expirar') == 'expirada'
    assert next_entry_state('reservada', 'cancelar', paid=True) == 'cancelada'
    assert next_entry_state('confirmada', 'cancelar', paid=False) == 'cancelada'
    assert next_entry_state('devolucao_pendente', 'confirmar_devolucao') == 'devolvida'
    assert next_entry_state('devolucao_pendente', 'contestar_devolucao') == 'devolucao_contestada'
    assert next_entry_state('devolucao_pendente', 'devolucao_automatica') == 'devolvida'
    assert next_entry_state('devolucao_contestada', 'manter_devolucao') == 'devolvida'
    assert next_entry_state('devolucao_contestada', 'reabrir_devolucao') == 'devolucao_pendente'


@pytest.mark.parametrize(('state', 'action', 'kwargs', 'message'), [
    ('em_analise', 'enviar_comprovante', {'now': NOW, 'reserved_until': NOW + H}, 'Esta inscrição não aguarda'),
    ('reservada', 'enviar_comprovante', {'now': NOW, 'reserved_until': NOW}, 'O prazo da reserva acabou.'),
    ('reservada', 'enviar_comprovante', {}, 'O prazo da reserva acabou.'),
    ('confirmada', 'cancelar', {'paid': True}, 'Para desistir de uma inscrição paga'),
    ('em_analise', 'cancelar', {'paid': True}, 'Esta inscrição já foi encerrada.'),
    ('expirada', 'cancelar', {}, 'Esta inscrição já foi encerrada.'),
    ('confirmada', 'aprovar_comprovante', {}, 'Esta inscrição não está em análise.'),
    ('devolvida', 'contestar_devolucao', {}, 'Nenhuma devolução aguarda a sua resposta.'),
    ('devolucao_pendente', 'manter_devolucao', {}, 'Esta devolução não está contestada.'),
])
def test_invalid_entry_actions_explain_why(state, action, kwargs, message):
    with pytest.raises(TransitionError) as error:
        next_entry_state(state, action, **kwargs)
    assert str(error.value).startswith(message)


def test_lapsed_reservations_read_as_expired_before_the_sweep():
    until = NOW + H
    assert rules.effective_entry_state('reservada', until, NOW) == 'reservada'
    assert rules.effective_entry_state('reservada', until, until) == 'expirada'
    assert rules.effective_entry_state('rejeitada', until, NOW + 2 * H) == 'expirada'
    assert rules.effective_entry_state('em_analise', until, NOW + 2 * H) == 'em_analise'
    assert rules.effective_entry_state('confirmada', None, NOW) == 'confirmada'
    assert not rules.reservation_lapsed('reservada', None, NOW)


@pytest.mark.parametrize(('state', 'paid', 'expected'), [
    ('confirmada', True, 'devolucao_pendente'), ('em_analise', True, 'devolucao_pendente'),
    ('reservada', True, 'cancelada'), ('rejeitada', True, 'cancelada'), ('confirmada', False, 'cancelada'),
    ('expirada', True, None), ('cancelada', False, None), ('devolvida', True, None),
])
def test_cancelling_the_event_sends_paid_entries_to_refund(state, paid, expected):
    assert entry_state_on_event_cancel(state, paid=paid) == expected


def test_next_action_priority():
    none = PendingCounts()
    assert next_action(event(revocation_decision='pendente', state='publicado'), pending=PendingCounts(receipts=2),
                       checklist_done=True, now=NOW).kind == 'aguardar_revogacao'
    assert next_action(event(review_reason_code='pix_incompleto'), pending=none, checklist_done=True,
                       now=NOW).kind == 'corrigir_recusa'
    assert next_action(event(), pending=none, checklist_done=False, now=NOW).kind == 'completar_rascunho'
    assert next_action(event(), pending=none, checklist_done=True, now=NOW).kind == 'publicar'
    assert next_action(event(state='em_aprovacao'), pending=none, checklist_done=True,
                       now=NOW).kind == 'aguardar_aprovacao'
    receipts = next_action(event(state='publicado'), pending=PendingCounts(receipts=2, refunds_to_send=1),
                           checklist_done=True, now=NOW)
    assert (receipts.kind, receipts.count) == ('analisar_comprovantes', 2)
    refunds = next_action(event(state='cancelado'), pending=PendingCounts(refunds_to_send=3), checklist_done=True,
                          now=NOW)
    assert (refunds.kind, refunds.count) == ('enviar_devolucoes', 3)
    waiting = next_action(event(state='cancelado'), pending=PendingCounts(refunds_awaiting=1, refund_disputes=1),
                          checklist_done=True, now=NOW)
    assert (waiting.kind, waiting.count) == ('aguardar_devolucoes', 2)
    assert next_action(event(state='cancelado'), pending=none, checklist_done=True, now=NOW).kind == 'nenhuma'
    open_ = next_action(event(state='publicado'), pending=none, checklist_done=True, now=NOW)
    assert (open_.kind, open_.deadline) == ('acompanhar_inscricoes', NOW + 7 * 24 * H)
    closed = next_action(event(state='publicado'), pending=none, checklist_done=True, now=NOW + 8 * 24 * H)
    assert (closed.kind, closed.deadline) == ('aguardar_inicio', NOW + 10 * 24 * H)
    assert next_action(event(state='encerrado'), pending=none, checklist_done=True, now=NOW).kind == 'nenhuma'
    assert PendingCounts(receipts=2, refunds_to_send=1, refunds_awaiting=4, refund_disputes=5).total == 3


def test_tennis_bonus_and_small_helpers():
    assert tennis_bonus('futebol', 10) is None
    assert tennis_bonus('tenis', 3) == {'champion': 40, 'runner_up': 20, 'semifinalist': 10, 'min_entries': 4,
                                        'applies': False}
    assert tennis_bonus('tenis', 4)['applies']
    assert rules.spots_left(8, 5) == 3 and rules.spots_left(8, 9) == 0 and rules.spots_left(None, 0) == 0
    assert rules.refund_auto_confirm_at(NOW) == NOW + timedelta(days=7)

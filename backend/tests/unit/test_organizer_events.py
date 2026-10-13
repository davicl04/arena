"""Unit tests of the organizer events module: draft inputs, validations and the pure helpers of the service."""
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.routers.events import _fields_error
from app.schemas.organizer_events import (
    AdminEventDecisionInput,
    EventCreateInput,
    EventDraftInput,
    EventUpdateInput,
    ReceiptDecisionInput,
    RevocationDecisionInput,
)
from app.services import events
from app.services.event_rules import DRAFT_FIELDS, ChecklistItem

T0 = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)


def messages(error: ValidationError) -> dict[str, str]:
    return {'.'.join(map(str, item['loc'])): item['msg'] for item in error.errors()}


def test_draft_input_trims_texts_sorts_tiers_and_converts_dates_to_utc():
    data = EventCreateInput(name='  Copa do Lago  ', accepted_tiers=['ouro', 'bronze'], venue='   ',
                            contact=' (61) 9999 ', starts_at='2026-10-20T10:00:00-03:00', price_cents=0)
    assert data.name == 'Copa do Lago' and data.accepted_tiers == ['bronze', 'ouro']
    assert data.venue is None and data.contact == '(61) 9999'
    assert data.starts_at == datetime(2026, 10, 20, 13, 0, tzinfo=timezone.utc)
    assert data.model_fields_set == {'name', 'accepted_tiers', 'venue', 'contact', 'starts_at', 'price_cents'}
    # Absent fields keep their value; an explicit null clears it.
    assert EventUpdateInput(accepted_tiers=None).model_fields_set == {'accepted_tiers'}


@pytest.mark.parametrize(('body', 'field', 'message'), [
    ({'name': 'Oi'}, 'name', 'Informe o nome do evento com 3 a 60 caracteres.'),
    ({'name': None}, 'name', 'Informe o nome do evento com 3 a 60 caracteres.'),
    ({'capacity': 1}, 'capacity', 'As vagas vão de 2 a 5000.'),
    ({'capacity': 5001}, 'capacity', 'As vagas vão de 2 a 5000.'),
    ({'accepted_tiers': []}, 'accepted_tiers', 'Escolha ao menos um elo ou deixe aberto a todos.'),
    ({'accepted_tiers': ['ouro', 'ouro']}, 'accepted_tiers', 'Escolha cada elo uma vez.'),
    ({'city_id': 0}, 'city_id', 'Selecione uma cidade do catálogo.'),
    ({'starts_at': '2026-10-20T10:00:00'}, 'starts_at', 'Informe a data com o fuso horário.'),
    ({'price_cents': 50}, 'price_cents', 'O valor vai de R$ 1,00 a R$ 10.000,00 (0 para inscrição gratuita).'),
    ({'price_cents': 1_000_001}, 'price_cents', 'O valor vai de R$ 1,00 a R$ 10.000,00 (0 para inscrição gratuita).'),
    ({'venue': 'x' * 121}, 'venue', 'Informe o local com até 120 caracteres.'),
    ({'pix_copy_paste': 'x' * 1001}, 'pix_copy_paste', 'Informe o Pix Copia e Cola com até 1000 caracteres.'),
    ({'distance_km': 7}, 'distance_km', None),
    ({'sport': 'volei'}, 'sport', None),
    ({'state': 'publicado'}, 'state', None),
])
def test_draft_input_refuses_invalid_values(body, field, message):
    with pytest.raises(ValidationError) as error:
        EventDraftInput(**body)
    found = messages(error.value)
    assert field in found
    if message:
        assert found[field].endswith(message)


def test_create_requires_a_name_and_update_at_least_one_field():
    with pytest.raises(ValidationError):
        EventCreateInput()
    with pytest.raises(ValidationError) as error:
        EventUpdateInput()
    assert 'Informe ao menos um campo para alterar.' in str(error.value)
    assert EventUpdateInput(price_cents=0).price_cents == 0


def test_decision_inputs_trim_details_and_refuse_unknown_values():
    assert ReceiptDecisionInput(decision='recusar', reason_code='outro', reason_detail='  ').reason_detail is None
    assert AdminEventDecisionInput(decision='aprovar').reason_code is None
    assert RevocationDecisionInput(decision='seguir').reason is None
    for model, body in ((ReceiptDecisionInput, {'decision': 'talvez'}),
                        (AdminEventDecisionInput, {'decision': 'recusar', 'reason_code': 'valor_diferente'}),
                        (RevocationDecisionInput, {'decision': 'cancelado'})):
        with pytest.raises(ValidationError):
            model(**body)


def test_refusal_reason_requires_code_and_detail_for_other():
    assert events.refusal_reason('pix_incompleto', None, max_detail=500) == ('pix_incompleto', None)
    assert events.refusal_reason('outro', 'Datas trocadas.', max_detail=500) == ('outro', 'Datas trocadas.')
    cases = [((None, None, 500), 'Escolha o motivo da recusa.'),
             (('outro', None, 300), 'Descreva o motivo da recusa.'),
             (('outro', 'ruim', 300), 'Descreva o motivo da recusa.'),
             (('valor_diferente', 'x' * 301, 300), 'Descreva o motivo da recusa em até 300 caracteres.')]
    for (code, detail, limit), message in cases:
        with pytest.raises(HTTPException) as error:
            events.refusal_reason(code, detail, max_detail=limit)
        assert (error.value.status_code, error.value.detail) == (422, message)


def test_cancel_reason_and_message_body_bounds():
    assert events.cancel_reason('  Chuva forte  ') == 'Chuva forte'
    assert events.message_body('  Chegar cedo ') == 'Chegar cedo'
    assert events.message_body('x' * 1000) == 'x' * 1000
    for value in (None, '  ab ', 'x' * 501):
        with pytest.raises(HTTPException) as error:
            events.cancel_reason(value)
        assert error.value.detail == 'Descreva o motivo do cancelamento.'
    for value in (None, '   ', 'x' * 1001):
        with pytest.raises(HTTPException) as error:
            events.message_body(value)
        assert error.value.detail == 'Escreva o aviso (até 1000 caracteres).'


def test_writable_and_editable_follow_the_state():
    events.ensure_writable(SimpleNamespace(revocation_decision=None))
    events.ensure_writable(SimpleNamespace(revocation_decision='seguir'))
    with pytest.raises(HTTPException) as error:
        events.ensure_writable(SimpleNamespace(revocation_decision='pendente'))
    assert (error.value.status_code, error.value.detail) == (409, 'A administração está decidindo sobre este evento.')

    events.ensure_editable('rascunho', DRAFT_FIELDS)
    events.ensure_editable('publicado', ['venue', 'contact'])
    expected = {'publicado': 'Depois de publicado, só local, percurso, instruções e contato podem mudar.',
                'em_andamento': 'Depois de publicado, só local, percurso, instruções e contato podem mudar.',
                'em_aprovacao': 'Retire o evento da aprovação para editar.',
                'encerrado': 'Este evento não pode mais ser editado.',
                'cancelado': 'Este evento não pode mais ser editado.'}
    for state, message in expected.items():
        with pytest.raises(HTTPException) as error:
            events.ensure_editable(state, ['price_cents'])
        assert (error.value.status_code, error.value.detail) == (409, message)


def test_checklist_error_lists_the_missing_items_for_the_client():
    items = [ChecklistItem('nome_modalidade', 'Nome e modalidade', True),
             ChecklistItem('datas', 'Datas', False, 'A data do evento já passou.'),
             ChecklistItem('local', 'Local', False, 'Informe a cidade e o local.')]
    error = events.checklist_error(items)
    assert error.body() == {'detail': 'Complete o rascunho para publicar.', 'fields': [
        {'field': 'datas', 'message': 'A data do evento já passou.'},
        {'field': 'local', 'message': 'Informe a cidade e o local.'}]}
    response = _fields_error(error)
    assert response.status_code == 422 and json.loads(response.body) == error.body()


def test_merge_draft_normalizes_pix_checks_dates_and_drops_other_sports_fields():
    current = dict.fromkeys(DRAFT_FIELDS)
    current.update(name='Copa', sport='futebol', format='society', competition_type='eliminacao_simples',
                   capacity=8, pix_key='Copa@Pix.com')
    # The key is normalized only when the type or the key changes and both exist.
    assert events.merge_draft(current, {'venue': 'Arena'})['pix_key'] == 'Copa@Pix.com'
    assert events.merge_draft(current, {'pix_key_type': 'email'})['pix_key'] == 'copa@pix.com'
    switched = events.merge_draft(current, {'sport': 'corrida', 'distance_km': 10, 'course_notes': 'Volta no lago'})
    assert (switched['format'], switched['competition_type'], switched['distance_km']) == (None, None, 10)
    assert events.merge_draft(current, {'competition_type': 'eliminacao_simples', 'capacity': 10})['capacity'] is None

    with pytest.raises(events.FieldsError) as error:
        events.merge_draft(current, {'pix_key_type': 'cpf'})
    assert error.value.fields == [{'field': 'pix_key', 'message': 'Informe um CPF válido.'}]
    with pytest.raises(HTTPException) as error:
        events.merge_draft(current, {'starts_at': T0, 'registration_closes_at': T0 + timedelta(minutes=1)})
    assert error.value.detail == 'As inscrições precisam fechar antes do início do evento.'
    assert events.merge_draft(current, {'starts_at': T0, 'registration_closes_at': T0})['starts_at'] == T0


def receipt(receipt_id, kind, **values):
    return SimpleNamespace(id=receipt_id, kind=kind, resolution=values.get('resolution'),
                           participant_response=values.get('participant_response'))


def test_entry_sheet_picks_the_open_refund_or_the_latest_one():
    sheet = object.__new__(events._EntrySheet)
    sheet.receipts = {
        1: [receipt(1, 'pagamento'), receipt(2, 'devolucao', participant_response='contestada',
                                             resolution='pendente'), receipt(3, 'devolucao')],
        2: [receipt(4, 'devolucao', participant_response='confirmada'),
            receipt(5, 'devolucao', participant_response='contestada', resolution='devolvida')],
        3: [receipt(6, 'pagamento'), receipt(7, 'pagamento')],
    }
    assert sheet.refund(1).id == 3
    assert sheet.refund(2).id == 5
    assert sheet.refund(3) is None
    assert [item.id for item in sheet.payments(3)] == [6, 7]

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.models.organizers import Organizer, OrganizerRequest
from app.schemas.organizers import (
    OrganizerDecisionInput,
    OrganizerRefusalReason,
    OrganizerRequestInput,
    OrganizerRevokeInput,
    is_web_link,
)
from app.services import organizers
from app.services.organizers import (
    current_organizer,
    ensure_can_request,
    ensure_undecided,
    refusal_reason,
    resolve_status,
)

VALID = {'display_name': 'Liga do Cerrado', 'city_id': 5300108, 'sports': ['futebol'],
         'contact': '(61) 99999-0000', 'accept_terms': True}
T0 = datetime(2026, 10, 12, 12, tzinfo=timezone.utc)


def at(minutes):
    return T0 + timedelta(minutes=minutes)


def field_messages(error: ValidationError) -> dict[str, str]:
    return {'.'.join(str(part) for part in item['loc']): item['msg'] for item in error.errors()}


def test_request_input_trims_texts_orders_sports_and_nulls_blank_optionals():
    data = OrganizerRequestInput(**{**VALID, 'display_name': '  Liga do Cerrado ', 'sports': ['corrida', 'futebol'],
                                    'experience': '   ', 'contact': '  @ligadocerrado ', 'link': ' '})
    assert data.display_name == 'Liga do Cerrado' and data.contact == '@ligadocerrado'
    assert data.sports == ['futebol', 'corrida']
    assert data.experience is None and data.link is None
    full = OrganizerRequestInput(**{**VALID, 'sports': ['tenis', 'corrida', 'futebol'], 'experience': ' Torneios ',
                                    'link': ' https://liga.example/torneios?ano=2026 '})
    assert full.sports == ['futebol', 'tenis', 'corrida']
    assert full.experience == 'Torneios' and full.link == 'https://liga.example/torneios?ano=2026'


@pytest.mark.parametrize(('changes', 'field', 'message'), [
    ({'display_name': ' ab '}, 'display_name', 'Informe o nome do organizador com 3 a 80 caracteres.'),
    ({'display_name': 'x' * 81}, 'display_name', 'Informe o nome do organizador com 3 a 80 caracteres.'),
    ({'sports': []}, 'sports', 'Escolha pelo menos uma modalidade.'),
    ({'sports': ['futebol', 'futebol']}, 'sports', 'Escolha cada modalidade uma vez.'),
    ({'experience': 'x' * 1001}, 'experience', 'Descreva a experiência em até 1000 caracteres.'),
    ({'contact': ' 1234 '}, 'contact', 'Informe um contato com 5 a 120 caracteres.'),
    ({'contact': 'x' * 121}, 'contact', 'Informe um contato com 5 a 120 caracteres.'),
    ({'link': 'ftp://liga.example'}, 'link', 'Informe um link http ou https válido, com até 300 caracteres.'),
])
def test_request_input_rejects_out_of_contract_fields_in_portuguese(changes, field, message):
    with pytest.raises(ValidationError) as error:
        OrganizerRequestInput(**{**VALID, **changes})
    assert field_messages(error.value)[field].endswith(message)


@pytest.mark.parametrize('payload', [
    {**VALID, 'sports': ['xadrez']},
    {**VALID, 'user_id': 7},
    {key: value for key, value in VALID.items() if key != 'accept_terms'},
    {key: value for key, value in VALID.items() if key != 'contact'},
])
def test_request_input_rejects_unknown_sports_extra_and_missing_fields(payload):
    with pytest.raises(ValidationError):
        OrganizerRequestInput(**payload)


@pytest.mark.parametrize(('value', 'valid'), [
    ('https://instagram.com/liga', True), ('http://liga.example', True), ('https://liga.example:8443/a#b', True),
    ('ftp://liga.example', False), ('javascript:alert(1)', False), ('https://', False), ('liga.example', False),
    ('https://liga .example', False), ('https://liga.example/\x00', False), ('https://[::1', False),
    ('https://liga.example/' + 'a' * 280, False),
])
def test_web_links_require_http_scheme_host_and_no_spaces(value, valid):
    assert is_web_link(value) is valid


def test_decision_and_revoke_inputs():
    refusal = OrganizerDecisionInput(decision='recusar', reason_code='outro', reason_detail='  Sem resposta  ')
    assert refusal.reason_code is OrganizerRefusalReason.outro and refusal.reason_detail == 'Sem resposta'
    assert OrganizerDecisionInput(decision='aprovar', reason_detail='   ').reason_detail is None
    for payload in ({'decision': 'talvez'}, {'decision': 'recusar', 'reason_code': 'spam'},
                    {'decision': 'aprovar', 'user_id': 1}):
        with pytest.raises(ValidationError):
            OrganizerDecisionInput(**payload)
    assert OrganizerRevokeInput(reason='  Contato falso  ').reason == 'Contato falso'
    for reason in (' abcd ', 'x' * 501):
        with pytest.raises(ValidationError) as error:
            OrganizerRevokeInput(reason=reason)
        assert 'Descreva o motivo da revogação com 5 a 500 caracteres.' in field_messages(error.value)['reason']


@pytest.mark.parametrize(('code', 'detail', 'message'), [
    (None, None, 'Escolha o motivo da recusa.'),
    (None, 'Detalhe sem motivo', 'Escolha o motivo da recusa.'),
    (OrganizerRefusalReason.outro, None, 'Descreva o motivo da recusa.'),
    (OrganizerRefusalReason.outro, 'curt', 'Descreva o motivo da recusa.'),
    (OrganizerRefusalReason.pouca_informacao, 'x' * 501, 'Descreva o motivo da recusa em até 500 caracteres.'),
])
def test_refusal_requires_reason_and_description_for_other(code, detail, message):
    with pytest.raises(HTTPException) as error:
        refusal_reason(code, detail)
    assert (error.value.status_code, error.value.detail) == (422, message)


def test_refusal_reason_accepts_contract_values():
    assert refusal_reason(OrganizerRefusalReason.contato_nao_funciona, None) == ('contato_nao_funciona', None)
    assert refusal_reason(OrganizerRefusalReason.pedido_repetido, 'Igual ao anterior') == (
        'pedido_repetido', 'Igual ao anterior')
    assert refusal_reason(OrganizerRefusalReason.outro, 'x' * 500) == ('outro', 'x' * 500)


def request(state='em_analise', decided=None):
    return OrganizerRequest(id=1, state=state, decided_at=decided)


def revoked(minutes):
    return Organizer(id=2, revoked_at=at(minutes), revoke_reason='Contato falso')


def test_status_prefers_active_permission_then_pending_request():
    active = Organizer(id=3)
    assert resolve_status(active, request(), request('recusado', at(1)), revoked(2)) == ('aprovado', None, None)
    pending = request()
    assert resolve_status(None, pending, request('recusado', at(1)), revoked(2)) == ('em_analise', pending, None)
    assert resolve_status(None, None, None, None) == ('sem_pedido', None, None)


def test_status_uses_most_recent_fact_between_decision_and_revocation():
    refused = request('recusado', at(10))
    assert resolve_status(None, None, refused, None) == ('recusado', refused, None)
    assert resolve_status(None, None, request('cancelado', at(10)), None) == ('sem_pedido', None, None)
    revocation = revoked(5)
    assert resolve_status(None, None, None, revocation) == ('revogado', None, revocation)
    # Approved at 1, revoked at 5: the revocation is the latest fact.
    assert resolve_status(None, None, request('aprovado', at(1)), revocation) == ('revogado', None, revocation)
    # After the revocation, a refused request shows the refusal and a cancelled one shows nothing.
    assert resolve_status(None, None, refused, revocation) == ('recusado', refused, None)
    assert resolve_status(None, None, request('cancelado', at(10)), revocation) == ('sem_pedido', None, None)
    # An approval without permission or later revocation (data outside the flow) is not shown as approved.
    assert resolve_status(None, None, request('aprovado', at(10)), revocation) == ('sem_pedido', None, None)


def test_transitions_block_second_request_and_second_decision():
    ensure_can_request(None, None)
    with pytest.raises(HTTPException) as error:
        ensure_can_request(Organizer(id=1), None)
    assert (error.value.status_code, error.value.detail) == (409, 'Você já é organizador.')
    with pytest.raises(HTTPException) as error:
        ensure_can_request(None, request())
    assert (error.value.status_code, error.value.detail) == (409, 'Você já tem um pedido em análise.')
    ensure_undecided(request())
    for state in ('aprovado', 'recusado', 'cancelado'):
        with pytest.raises(HTTPException) as error:
            ensure_undecided(request(state, at(1)))
        assert (error.value.status_code, error.value.detail) == (409, 'Este pedido já foi decidido.')


class FakeDb:
    """Session double for the paths that never reach PostgreSQL."""

    def __init__(self, *, city=True, scalar=None, flush_error=None):
        self.city, self.scalar_value, self.flush_error = city, scalar, flush_error
        self.added, self.rolled_back, self.committed = [], False, False

    def get(self, model, key):
        return SimpleNamespace(id=key, name='Brasília', state='DF') if self.city else None

    def execute(self, statement):
        return None

    def scalar(self, statement):
        return self.scalar_value

    def add(self, value):
        self.added.append(value)

    def flush(self):
        if self.flush_error:
            raise self.flush_error

    def rollback(self):
        self.rolled_back = True

    def commit(self):
        self.committed = True


def integrity(constraint):
    return IntegrityError('INSERT', {}, Exception(f'duplicate key value violates unique constraint "{constraint}"'))


def test_create_checks_terms_and_catalog_city_before_any_lock():
    user = SimpleNamespace(id=1)
    with pytest.raises(HTTPException) as error:
        organizers.create_request(FakeDb(), user, OrganizerRequestInput(**{**VALID, 'accept_terms': False}))
    assert (error.value.status_code, error.value.detail) == (
        422, 'Aceite as responsabilidades do organizador para enviar o pedido.')
    with pytest.raises(HTTPException) as error:
        organizers.create_request(FakeDb(city=False), user, OrganizerRequestInput(**VALID))
    assert (error.value.status_code, error.value.detail) == (422, 'Selecione uma cidade do catálogo.')


def test_create_turns_a_concurrent_pending_request_into_conflict():
    db = FakeDb(flush_error=integrity('uq_organizer_requests_pending'))
    with pytest.raises(HTTPException) as error:
        organizers.create_request(db, SimpleNamespace(id=1), OrganizerRequestInput(**VALID))
    assert (error.value.status_code, error.value.detail) == (409, 'Você já tem um pedido em análise.')
    assert db.rolled_back and not db.committed
    other = FakeDb(flush_error=integrity('organizer_requests_city_id_fkey'))
    with pytest.raises(IntegrityError):
        organizers.create_request(other, SimpleNamespace(id=1), OrganizerRequestInput(**VALID))
    assert other.rolled_back and not other.committed


def test_current_organizer_requires_an_active_permission():
    with pytest.raises(HTTPException) as error:
        current_organizer(user=SimpleNamespace(id=1), db=FakeDb())
    assert (error.value.status_code, error.value.detail) == (403, 'Você precisa ser organizador para criar eventos.')
    permission = Organizer(id=4, user_id=1)
    assert current_organizer(user=SimpleNamespace(id=1), db=FakeDb(scalar=permission)) is permission


def test_open_events_extension_point_is_a_no_op_until_phase_four():
    db = FakeDb()
    assert organizers.handle_open_events(db, Organizer(id=1), actor_id=2, revoked_at=T0) is None
    assert db.added == [] and not db.committed

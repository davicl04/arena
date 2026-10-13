"""Regras puras da frente de partida (condições, motivos, quadras duplicadas) e os handlers globais dos erros de regra."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

from app.main import app as arena_app
from app.schemas.matches import CourtDecisionInput, CourtSuggestionInput, MessageInput, TermsInput
from app.services.courts import is_possible_duplicate, kind_label
from app.services.match_rules import RuleError, TransitionError
from app.services.match_text import iso
from app.services.matches import clean_reason, same_terms, terms_open

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
HOUR = timedelta(hours=1)


# ----- Terms ------------------------------------------------------------------------------------------------------

@pytest.mark.parametrize(('state', 'starts_at', 'expected'), [
    ('combinando', None, True),
    ('agendada', NOW + HOUR, True),
    ('agendada', NOW, False),                 # at the start the terms are closed
    ('agendada', NOW - HOUR, False),
    ('agendada', None, False),
    ('proposta', None, False),
    ('realizada', NOW - HOUR, False),
    ('cancelada', None, False),
])
def test_terms_change_while_arranging_or_before_the_start(state, starts_at, expected):
    assert terms_open(SimpleNamespace(state=state, starts_at=starts_at), NOW) is expected


def test_equal_terms_compare_time_court_booking_and_super_tiebreak():
    agreed = SimpleNamespace(starts_at=NOW + HOUR, court_id=4, booking_side='a', super_tiebreak=None)
    assert same_terms(agreed, NOW + HOUR, 4, 'a', None)
    # The same instant in another time zone is the same time.
    assert same_terms(agreed, (NOW + HOUR).astimezone(timezone(timedelta(hours=-3))), 4, 'a', None)
    for changed in ((NOW + 2 * HOUR, 4, 'a', None), (NOW + HOUR, 5, 'a', None), (NOW + HOUR, 4, 'b', None),
                    (NOW + HOUR, 4, 'a', True)):
        assert not same_terms(agreed, *changed)


@pytest.mark.parametrize(('value', 'expected'), [('Conte tudo', 'Conte tudo'), ('  abcde  ', 'abcde'),
                                                 ('x' * 500, 'x' * 500)])
def test_reasons_are_trimmed_and_bounded(value, expected):
    assert clean_reason(value, low=5, high=500, message='Erro') == expected


@pytest.mark.parametrize('value', [None, '', '    ', 'abcd', ' ab ', 'x' * 501])
def test_short_or_long_reasons_are_refused_with_the_field(value):
    with pytest.raises(RuleError) as error:
        clean_reason(value, low=5, high=500, message='Conte o que aconteceu.')
    assert (str(error.value), error.value.field) == ('Conte o que aconteceu.', 'reason')


def test_iso_serializes_payload_dates():
    assert iso(NOW) == '2026-10-12T15:00:00+00:00' and iso(None) is None


# ----- Courts -----------------------------------------------------------------------------------------------------

@pytest.mark.parametrize(('key', 'other', 'expected'), [
    ('quadra central', 'quadra central', True),
    ('quadra central', 'quadra central sul', True),       # the published name contains the suggestion
    ('quadra central sul', 'central', True),              # the suggestion contains the published name
    ('quadra central', 'quadra norte', False),
    ('arena', 'arena', True),
    ('', 'arena', False),
    ('arena', '', False),
])
def test_possible_duplicates_compare_normalized_names(key, other, expected):
    assert is_possible_duplicate(key, other) is expected


def test_court_kind_labels():
    assert [kind_label(kind) for kind in ('futsal', 'society', 'campo', 'tenis')] == [
        'futsal', 'society', 'campo', 'tênis']


# ----- Inputs -----------------------------------------------------------------------------------------------------

def test_inputs_reject_unknown_fields_and_bad_values():
    assert TermsInput(starts_at=NOW, court_id=1, booking_side='b').super_tiebreak is None
    with pytest.raises(ValueError):
        TermsInput(starts_at=NOW, court_id=1, booking_side='c')
    with pytest.raises(ValueError):
        TermsInput(starts_at=NOW, court_id=1, booking_side='a', owner_id=3)
    with pytest.raises(ValueError):
        MessageInput(body='x' * 1001)
    with pytest.raises(ValueError):
        CourtDecisionInput(decision='talvez')
    with pytest.raises(ValueError):
        CourtSuggestionInput(match_id=1, name='Quadra', kind='basquete')
    assert CourtDecisionInput(decision='publicar', address=None).model_fields_set == {'decision', 'address'}


# ----- Handlers globais dos erros de regra ------------------------------------------------------------------------

def make_client():
    """Uma aplicação mínima com os handlers reais de `app/main.py` e rotas que só lançam os erros."""
    router = APIRouter()

    @router.get('/rule')
    def rule():
        raise RuleError('Escolha uma data futura.', 'starts_at')

    @router.get('/rule-without-field')
    def rule_without_field():
        raise RuleError('Algo está errado.')

    @router.get('/transition')
    def transition():
        raise TransitionError('Faltam menos de 24 h para a partida.')

    @router.get('/fine')
    def fine():
        return {'ok': True}

    app = FastAPI()
    for error in (RuleError, TransitionError):
        app.add_exception_handler(error, arena_app.exception_handlers[error])
    app.include_router(router)
    return TestClient(app)


def test_rule_errors_become_422_with_fields_and_transition_errors_409():
    client = make_client()
    response = client.get('/rule')
    assert response.status_code == 422
    assert response.json() == {'detail': 'Escolha uma data futura.',
                               'fields': [{'field': 'starts_at', 'message': 'Escolha uma data futura.'}]}
    assert client.get('/rule-without-field').json() == {'detail': 'Algo está errado.', 'fields': []}
    conflict = client.get('/transition')
    assert (conflict.status_code, conflict.json()) == (409, {'detail': 'Faltam menos de 24 h para a partida.'})
    assert client.get('/fine').json() == {'ok': True}


def test_the_real_app_registers_both_handlers_and_keeps_the_validation_shape():
    assert {RuleError, TransitionError} <= set(arena_app.exception_handlers)
    from fastapi.exceptions import RequestValidationError
    assert RequestValidationError in arena_app.exception_handlers

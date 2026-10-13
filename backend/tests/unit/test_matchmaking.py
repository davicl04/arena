"""Matchmaking rules without a database: the shape of a search, the walk-in spots and the effective states."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.schemas.matches import SearchInput
from app.services.match_rules import RuleError
from app.services.matchmaking import effective_search, proposal_overdue, search_kind, team_open_slots

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
HOUR = timedelta(hours=1)


def body(**values):
    return SearchInput(**{'sport': 'futebol', **values})


# ----- Body of the search -------------------------------------------------------------------------------------

@pytest.mark.parametrize(('values', 'kind'), [
    ({'sport': 'tenis'}, 'tenis'),
    ({'team_id': 4, 'format': 'society'}, 'time'),
    ({'team_id': 4, 'format': 'campo', 'team_complete': True}, 'time'),
    ({}, 'avulso'),
    ({'position': 'goleiro'}, 'avulso'),
    ({'team_complete': False}, 'avulso'),
])
def test_the_kind_comes_from_the_body(values, kind):
    assert search_kind(body(**values)) == kind


@pytest.mark.parametrize(('values', 'message', 'field'), [
    ({'sport': 'tenis', 'team_id': 3}, 'Busca de tênis não tem time, formato nem posição.', 'team_id'),
    ({'sport': 'tenis', 'format': 'society'}, 'Busca de tênis não tem time, formato nem posição.', 'format'),
    ({'sport': 'tenis', 'position': 'atacante'}, 'Busca de tênis não tem time, formato nem posição.', 'position'),
    ({'sport': 'tenis', 'open_slots': {}}, 'Busca de tênis não tem time, formato nem posição.', 'open_slots'),
    ({'team_id': 3}, 'Escolha o formato da partida.', 'format'),
    ({'team_id': 3, 'format': 'futsal', 'position': 'defesa'}, 'A posição é só da busca de avulso.', 'position'),
    ({'format': 'society'}, 'O avulso aceita qualquer formato.', 'format'),
    ({'open_slots': {'defesa': 1}}, 'O avulso aceita qualquer formato.', 'open_slots'),
])
def test_a_body_that_does_not_fit_the_kind_is_refused(values, message, field):
    with pytest.raises(RuleError) as refused:
        search_kind(body(**values))
    assert (str(refused.value), refused.value.field) == (message, field)


def test_the_body_rejects_unknown_fields_and_values():
    for values in ({'extra': 1}, {'sport': 'corrida'}, {'format': 'quadra'}, {'position': 'lateral'},
                   {'open_slots': {'lateral': 1}}, {'open_slots': {'defesa': 'x'}}, {'team_id': 'a'}):
        with pytest.raises(ValidationError):
            body(**values)


# ----- Walk-in spots (RN06) -----------------------------------------------------------------------------------

@pytest.mark.parametrize(('format_', 'slots', 'expected'), [
    ('society', None, {'goleiro': 0, 'defesa': 0, 'meio_campo': 0, 'atacante': 0}),
    ('society', {'goleiro': 1, 'atacante': 2}, {'goleiro': 1, 'defesa': 0, 'meio_campo': 0, 'atacante': 2}),
    ('society', {'defesa': 2, 'meio_campo': 2, 'atacante': 2}, {'goleiro': 0, 'defesa': 2, 'meio_campo': 2, 'atacante': 2}),
    ('futsal', {'goleiro': 1, 'defesa': 1, 'meio_campo': 1, 'atacante': 1},
     {'goleiro': 1, 'defesa': 1, 'meio_campo': 1, 'atacante': 1}),
    ('campo', {'defesa': 4, 'meio_campo': 3, 'atacante': 2, 'goleiro': 1},
     {'goleiro': 1, 'defesa': 4, 'meio_campo': 3, 'atacante': 2}),
])
def test_open_slots_are_normalized_per_position(format_, slots, expected):
    assert team_open_slots(body(team_id=1, format=format_, open_slots=slots), format_) == expected


@pytest.mark.parametrize(('format_', 'slots', 'message'), [
    ('society', {'goleiro': 2}, 'No máximo uma vaga de goleiro.'),
    ('futsal', {'defesa': 5}, 'No futsal cabem até 4 vagas para avulsos.'),
    ('society', {'defesa': 3, 'atacante': 4}, 'No society cabem até 6 vagas para avulsos.'),
    ('campo', {'defesa': 11}, 'No campo cabem até 10 vagas para avulsos.'),
    ('society', {'defesa': -1}, 'Informe as vagas com números inteiros a partir de zero.'),
])
def test_open_slots_respect_one_goalkeeper_and_the_format_size_minus_one(format_, slots, message):
    with pytest.raises(RuleError, match=message) as refused:
        team_open_slots(body(team_id=1, format=format_, open_slots=slots), format_)
    assert refused.value.field == 'open_slots'


def test_a_complete_team_declares_no_slots():
    assert team_open_slots(body(team_id=1, format='society', team_complete=True), 'society') == {
        'goleiro': 0, 'defesa': 0, 'meio_campo': 0, 'atacante': 0}
    assert team_open_slots(body(team_id=1, format='society', team_complete=True, open_slots={}), 'society')
    with pytest.raises(RuleError, match='Com o time completo, não há vagas para avulsos.'):
        team_open_slots(body(team_id=1, format='society', team_complete=True, open_slots={'defesa': 1}), 'society')
    # Not complete with slots, or slots with the flag unset, are fine.
    assert team_open_slots(body(team_id=1, format='society', team_complete=False, open_slots={'defesa': 1}),
                           'society')['defesa'] == 1


# ----- Effective state of a search -----------------------------------------------------------------------------

def search(state, kind='time', *, expires_in=20 * HOUR, offer_in=None):
    return SimpleNamespace(state=state, kind=kind, expires_at=NOW + expires_in,
                           offer_expires_at=None if offer_in is None else NOW + offer_in)


def match(state='proposta', *, expires_in=HOUR):
    return SimpleNamespace(state=state, proposal_expires_at=NOW + expires_in)


def side(accepted):
    return SimpleNamespace(accepted_at=NOW if accepted else None)


@pytest.mark.parametrize(('row', 'other', 'sides', 'expected'), [
    # Waiting: 24 h.
    (search('ativa'), None, None, ('ativa', False)),
    (search('ativa', expires_in=-HOUR), None, None, ('expirada', False)),
    (search('ativa', 'tenis'), None, None, ('ativa', False)),
    # Held by a proposal that is still running.
    (search('pareada'), match(), side(False), ('pareada', True)),
    (search('pareada', 'tenis'), match(), side(True), ('pareada', True)),
    # The proposal lapsed: who had accepted is back in the queue, who did not answer is over.
    (search('pareada'), match(expires_in=-HOUR), side(True), ('ativa', False)),
    (search('pareada'), match(expires_in=-HOUR), side(False), ('sem_resposta', False)),
    (search('pareada'), match(expires_in=-HOUR), None, ('sem_resposta', False)),
    # ...unless the 24 h of the search are over too.
    (search('pareada', expires_in=-HOUR), match(expires_in=-2 * HOUR), side(True), ('expirada', False)),
    # Walk-in offers: 2 h.
    (search('pareada', 'avulso', offer_in=HOUR), None, None, ('pareada', True)),
    (search('pareada', 'avulso', offer_in=-HOUR), None, None, ('sem_resposta', False)),
    # Ended searches stay as they are.
    (search('concluida'), match('combinando'), side(True), ('concluida', False)),
    (search('recusada'), None, None, ('recusada', False)),
    (search('cancelada'), None, None, ('cancelada', False)),
])
def test_effective_state_of_a_search(row, other, sides, expected):
    assert effective_search(row, other, sides, NOW) == expected


def test_a_proposal_is_overdue_only_while_it_is_stored_as_one():
    assert proposal_overdue(match(expires_in=-HOUR), NOW)
    assert proposal_overdue(match(expires_in=timedelta(0)), NOW)
    assert not proposal_overdue(match(expires_in=HOUR), NOW)
    assert not proposal_overdue(match('combinando', expires_in=-HOUR), NOW)
    assert not proposal_overdue(SimpleNamespace(state='proposta', proposal_expires_at=None), NOW)

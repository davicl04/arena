"""Pending actions of terms, walkovers and contested walkovers close when the action does (partida front).

Same approach as `test_notification_resolution_matches_flow.py`: the notification is pending with its deadline, reading
does not resolve it and the real action (or the other ways of closing the object) does. The clock of the routes and
of the pending list is fixed, so deadlines are deterministic.
"""
import pytest

from app.models.matches import MatchTerms
from app.services import match_lifecycle, notifications
from tests.integration.match_helpers import make_user
from tests.integration.partida.helpers import HOUR, NOW, agreed_match, login
from tests.integration.partida.test_courts_flow import decide as decide_court
from tests.integration.partida.test_courts_flow import propose as propose_with_court
from tests.integration.partida.test_courts_flow import suggest
from tests.integration.partida.test_terms_flow import accept, cancel, combining, propose
from tests.integration.partida.test_walkover_flow import contest, decide, register, started, withdraw
from tests.integration.test_notification_resolution_matches_flow import (
    listed,
    one_pending,
    parse,
    pending,
    pending_count,
    rows,
)


@pytest.fixture(autouse=True)
def fixed_notification_clock(monkeypatch, clock):
    monkeypatch.setattr(notifications, 'utcnow', lambda: clock['now'])


# ----- Type 5: condicoes_propostas --------------------------------------------------------------------------

def test_terms_are_pending_for_the_other_side_until_accepted(client, world, clock):
    http, db = client
    match = combining(db, world)
    created = propose(http, world, match)
    assert created.status_code == 201, created.text
    terms = created.json()['terms']['pending']

    item = one_pending(http, world['h']['rep_b'], 'condicoes_propostas')
    assert item['payload']['terms_id'] == terms['id']
    # The action lapses at the proposed time: after it the terms cannot be accepted any more.
    assert parse(item['action_until']) == parse(terms['starts_at'])
    assert pending(http, world['h']['rep_a']) == []                      # the proposer already accepted

    assert accept(http, world, match, terms['id']).status_code == 200
    assert pending(http, world['h']['rep_b']) == []
    assert listed(http, world['h']['rep_b'], 'condicoes_propostas')[0]['pending'] is False


def test_replaced_or_cancelled_terms_stop_asking_for_an_answer(client, world, clock):
    http, db = client
    match = combining(db, world)
    first = propose(http, world, match).json()['terms']['pending']
    one_pending(http, world['h']['rep_b'], 'condicoes_propostas')

    # The other side answers with its own proposal: the first one is replaced and its alert closes.
    second = propose(http, world, match, 'rep_b', starts_at=NOW + 72 * HOUR).json()['terms']['pending']
    assert second['id'] != first['id']
    assert pending(http, world['h']['rep_b']) == []
    [counter] = pending(http, world['h']['rep_a'], 'condicoes_propostas')
    assert counter['payload']['terms_id'] == second['id']

    # Cancelling the match closes the pending terms and the alert.
    assert cancel(http, world, match, 'rep_b').status_code == 200
    assert pending(http, world['h']['rep_a']) == []
    assert all(row.resolved_at is not None for row in rows(db, 'terms:'))


def test_rejecting_the_court_of_pending_terms_closes_their_alert(client, world, clock):
    http, db = client
    match = combining(db, world)
    asked = suggest(http, world, match, 'Quadra Fantasma').json()['court']
    assert propose_with_court(http, world, match, asked).status_code == 201
    one_pending(http, world['h']['rep_b'], 'condicoes_propostas')

    done = decide_court(http, world, asked['id'], 'rejeitar', reason='Quadra inexistente no endereço.')
    assert done.status_code == 200
    assert db.query(MatchTerms.state).filter(MatchTerms.match_id == match.id).scalar() == 'cancelada'
    assert pending(http, world['h']['rep_b']) == []
    assert all(row.resolved_at is not None for row in rows(db, 'terms:'))


# ----- Type 6: wo_registrado --------------------------------------------------------------------------------

def test_walkover_is_pending_for_the_accused_side_until_withdrawn_or_contested(client, world, clock):
    http, db = client
    match = started(db, world)
    assert register(http, world, match).status_code == 200

    item = one_pending(http, world['h']['rep_b'], 'wo_registrado')
    assert parse(item['action_until']) == match.result_deadline
    assert pending(http, world['h']['rep_a']) == []                      # whoever registered is not asked

    assert withdraw(http, world, match).status_code == 204
    assert pending(http, world['h']['rep_b']) == []

    assert register(http, world, match).status_code == 200
    one_pending(http, world['h']['rep_b'], 'wo_registrado')
    assert contest(http, world, match).status_code == 200
    assert pending(http, world['h']['rep_b']) == []
    assert all(row.resolved_at is not None for row in rows(db, f'wo:{match.id}'))


def test_decided_walkover_closes_the_accused_alert_and_the_deadline_makes_it_the_result(client, world, clock):
    http, db = client
    decided = started(db, world)
    assert register(http, world, decided).status_code == 200
    one_pending(http, world['h']['rep_b'], 'wo_registrado')
    assert contest(http, world, decided).status_code == 200
    assert decide(http, world, decided).status_code == 200
    assert all(row.resolved_at is not None for row in rows(db, f'wo:{decided.id}'))

    uncontested = agreed_match(db, world, starts_at=NOW - 2 * HOUR)
    assert register(http, world, uncontested).status_code == 200
    one_pending(http, world['h']['rep_b'], 'wo_registrado')
    # 48 h without contest: the walkover becomes the result and nobody has anything to answer.
    assert match_lifecycle.close_due_results(db, uncontested.result_deadline) == 1
    db.commit()
    [row] = rows(db, f'wo:{uncontested.id}')
    assert row.resolved_at is not None


# ----- Type 14: wo_contestado -------------------------------------------------------------------------------

def test_contested_walkover_is_pending_for_every_admin_and_a_decision_closes_it_for_all(client, world, clock):
    http, db = client
    second_admin = make_user(db, 'admin2', admin=True)
    world['h']['admin2'] = login(db, second_admin)
    match = started(db, world)
    assert register(http, world, match).status_code == 200
    assert contest(http, world, match).status_code == 200

    for who in ('admin', 'admin2'):
        item = one_pending(http, world['h'][who], 'wo_contestado')
        assert (item['action_until'], item['payload']['match_id']) == (None, match.id)
    # The side that registered is told, but the decision is not theirs: informative, no pending action.
    [told] = listed(http, world['h']['rep_a'], 'wo_contestado')
    assert told['pending'] is False and pending_count(http, world['h']['rep_a']) == 0

    assert decide(http, world, match, who='admin2').status_code == 200
    assert pending_count(http, world['h']['admin']) == 0 and pending_count(http, world['h']['admin2']) == 0
    assert all(row.resolved_at is not None for row in rows(db, f'wo_dispute:{match.id}'))


def test_an_admin_who_represents_the_registering_side_gets_a_single_pending_notification(client, world, clock):
    http, db = client
    world['rep_a'].is_admin = True
    db.flush()
    match = started(db, world)
    assert register(http, world, match).status_code == 200
    assert contest(http, world, match).status_code == 200

    mine = listed(http, world['h']['rep_a'], 'wo_contestado')
    assert [item['pending'] for item in mine] == [True]
    assert len(listed(http, world['h']['admin'], 'wo_contestado')) == 1
    assert decide(http, world, match, who='rep_a').status_code == 200
    assert pending_count(http, world['h']['rep_a']) == 0 and pending_count(http, world['h']['admin']) == 0

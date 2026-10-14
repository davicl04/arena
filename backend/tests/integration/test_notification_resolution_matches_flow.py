"""Pending actions of teams, matchmaking, walk-in offers and divergent results close when the action does.

Each test follows one notification type from its creation (pending, with its deadline) to the real action that
resolves it, over the HTTP routes: reading never resolves, and the alternative ways of closing do (cancelled invite,
closed team, a proposal declined or expired, a slot withdrawn, a divergence corrected). `notify` requires the
key, so any action notification these flows create without one would fail the test.
Contract: docs/decisoes/0003-times-campeonatos.md, section 7.
"""
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.models.identity import utcnow
from app.models.matches import Match
from app.models.notifications import Notification
from app.models.teams import TeamInvite, TeamJoinRequest
from app.services import notifications
from app.services.match_lifecycle import close_due_results
from app.services.matchmaking_queue import queue
from tests.integration import test_matchmaking_flow as mm
from tests.integration import test_slots_flow as sf
from tests.integration.match_helpers import NOW, make_team, make_user, scheduled_match
from tests.integration.result_helpers import HOUR, login, put_result, use_clock
from tests.integration.team_helpers import create_team, invite, join_by_invite, link_token, register

PENDING = '/api/v1/me/notifications/pending'
SUMMARY = '/api/v1/me/notifications/summary'
LIST = '/api/v1/me/notifications'


def pending(http, headers, type_=None):
    response = http.get(PENDING, headers=headers)
    assert response.status_code == 200, response.text
    return [item for item in response.json()['items'] if type_ is None or item['type'] == type_]


def pending_count(http, headers):
    return http.get(SUMMARY, headers=headers).json()['pending_count']


def listed(http, headers, type_):
    items = http.get(LIST, headers=headers).json()['items']
    return [item for item in items if item['type'] == type_]


def mark_read(http, headers, notification_id):
    assert http.put(f'{LIST}/{notification_id}/read', json={}, headers=headers).status_code == 200


def one_pending(http, headers, type_):
    """The single pending notification of the type; reading it must not resolve it."""
    [item] = pending(http, headers, type_)
    assert item['pending'] is True
    mark_read(http, headers, item['id'])
    assert [row['id'] for row in pending(http, headers, type_)] == [item['id']]
    return item


def rows(db, key_prefix):
    db.expire_all()
    return db.scalars(select(Notification).where(Notification.action_key.startswith(key_prefix))
                      .order_by(Notification.id)).all()


def parse(moment):
    return datetime.fromisoformat(moment.replace('Z', '+00:00'))


def promote(http, owner, team_id, user_id):
    response = http.patch(f'/api/v1/teams/{team_id}/members/{user_id}', json={'role': 'representante'}, headers=owner)
    assert response.status_code == 200, response.text


# ----- Type 1: convite_time ---------------------------------------------------------------------------------

def test_team_invite_is_pending_until_answered_cancelled_or_the_team_closes(client):
    http, db = client
    owner, owner_id = register(http, 'res-convite-dono@example.com', 'Dono Convite')
    people = {name: register(http, f'res-convite-{name}@example.com', f'Convidado {name}')
              for name in ('recusa', 'aceita', 'cancela', 'pedido', 'encerra')}
    team_id = create_team(http, owner, 'Convites FC')['id']

    refused = invite(http, owner, team_id, people['recusa'][1], 'Vem jogar').json()
    item = one_pending(http, people['recusa'][0], 'convite_time')
    assert (item['action_until'], item['payload']['invite_id']) == (None, refused['id'])
    assert http.put(f"/api/v1/team-invites/{refused['id']}", json={'decision': 'recusar'},
                    headers=people['recusa'][0]).status_code == 200
    assert pending_count(http, people['recusa'][0]) == 0
    assert listed(http, people['recusa'][0], 'convite_time')[0]['pending'] is False

    accepted = invite(http, owner, team_id, people['aceita'][1]).json()
    one_pending(http, people['aceita'][0], 'convite_time')
    assert http.put(f"/api/v1/team-invites/{accepted['id']}", json={'decision': 'aceitar'},
                    headers=people['aceita'][0]).status_code == 200
    assert pending_count(http, people['aceita'][0]) == 0

    cancelled = invite(http, owner, team_id, people['cancela'][1]).json()
    one_pending(http, people['cancela'][0], 'convite_time')
    assert http.delete(f"/api/v1/team-invites/{cancelled['id']}", headers=owner).status_code == 204
    assert pending_count(http, people['cancela'][0]) == 0

    # Approving a join request of the same person cancels the pending invite (the two only coexist after a race).
    superseded = invite(http, owner, team_id, people['pedido'][1]).json()
    one_pending(http, people['pedido'][0], 'convite_time')
    raced = TeamJoinRequest(team_id=team_id, user_id=people['pedido'][1], created_at=utcnow())
    db.add(raced)
    db.flush()
    assert http.put(f'/api/v1/team-join-requests/{raced.id}', json={'decision': 'aprovar'},
                    headers=owner).status_code == 200
    assert db.get(TeamInvite, superseded['id']).state == 'cancelado'
    assert pending_count(http, people['pedido'][0]) == 0

    # Closing the team cancels the invites still pending.
    closing = create_team(http, owner, 'Encerra Convites')['id']
    invite(http, owner, closing, people['encerra'][1])
    one_pending(http, people['encerra'][0], 'convite_time')
    assert http.post(f'/api/v1/teams/{closing}/close', json={}, headers=owner).status_code == 204
    assert pending_count(http, people['encerra'][0]) == 0
    assert all(row.resolved_at is not None for row in rows(db, 'invite:'))


# ----- Type 2: pedido_entrada -------------------------------------------------------------------------------

def test_join_request_is_pending_for_every_representative_until_it_is_decided_or_cancelled(client):
    http, db = client
    owner, owner_id = register(http, 'res-pedido-dono@example.com', 'Dono Pedido')
    second, second_id = register(http, 'res-pedido-segundo@example.com', 'Segundo Representante')
    visitors = {name: register(http, f'res-pedido-{name}@example.com', f'Visitante {name}')
                for name in ('aprova', 'recusa', 'cancela', 'convite', 'encerra')}
    team_id = create_team(http, owner, 'Pedidos FC')['id']
    join_by_invite(http, owner, team_id, second, second_id)
    promote(http, owner, team_id, second_id)
    token = link_token(http, owner, team_id)

    def ask(name):
        response = http.post(f'/api/v1/join/{token}', json={}, headers=visitors[name][0])
        assert response.status_code == 201, response.text
        return response.json()

    approved = ask('aprova')
    for headers in (owner, second):
        item = one_pending(http, headers, 'pedido_entrada')
        assert (item['action_until'], item['payload']['request_id']) == (None, approved['id'])
    # One representative decides: the other one's notification closes too.
    assert http.put(f"/api/v1/team-join-requests/{approved['id']}", json={'decision': 'aprovar'},
                    headers=second).status_code == 200
    assert (pending_count(http, owner), pending_count(http, second)) == (0, 0)

    refused = ask('recusa')
    one_pending(http, owner, 'pedido_entrada')
    assert http.put(f"/api/v1/team-join-requests/{refused['id']}", json={'decision': 'recusar'},
                    headers=owner).status_code == 200
    assert (pending_count(http, owner), pending_count(http, second)) == (0, 0)

    cancelled = ask('cancela')
    one_pending(http, second, 'pedido_entrada')
    assert http.delete(f"/api/v1/team-join-requests/{cancelled['id']}", headers=visitors['cancela'][0]).status_code == 204
    assert (pending_count(http, owner), pending_count(http, second)) == (0, 0)

    # The visitor accepts an invite that raced with the request: the request is cancelled for the representatives.
    raced_request = ask('convite')
    one_pending(http, owner, 'pedido_entrada')
    raced_invite = TeamInvite(team_id=team_id, invitee_id=visitors['convite'][1], inviter_id=owner_id,
                              created_at=utcnow())
    db.add(raced_invite)
    db.flush()
    assert http.put(f'/api/v1/team-invites/{raced_invite.id}', json={'decision': 'aceitar'},
                    headers=visitors['convite'][0]).status_code == 200
    assert db.get(TeamJoinRequest, raced_request['id']).state == 'cancelado'
    assert (pending_count(http, owner), pending_count(http, second)) == (0, 0)

    ask('encerra')
    assert (pending_count(http, owner), pending_count(http, second)) == (1, 1)
    assert http.post(f'/api/v1/teams/{team_id}/close', json={}, headers=owner).status_code == 204
    assert (pending_count(http, owner), pending_count(http, second)) == (0, 0)
    assert all(row.resolved_at is not None for row in rows(db, 'join_request:'))


# ----- Type 3: proposta_partida -----------------------------------------------------------------------------

def test_proposal_closes_per_side_when_answered_and_for_both_when_it_ends(client):
    http, db = client
    first = mm.squad(http, 'prop-a')
    second = mm.squad(http, 'prop-b')
    helper, helper_id = register(http, 'res-proposta-helper@example.com', 'Segundo Representante Alfa')
    join_by_invite(http, first[0], first[2], helper, helper_id)
    promote(http, first[0], first[2], helper_id)

    match_id, _ = mm.pair(http, first, second)
    match = db.get(Match, match_id)
    heads = {'a1': first[0], 'a2': helper, 'b1': second[0]}
    for headers in heads.values():
        item = one_pending(http, headers, 'proposta_partida')
        assert item['payload']['match_id'] == match_id
        assert parse(item['action_until']) == match.proposal_expires_at
    assert len(rows(db, f'proposal:{match_id}:user:')) == 3

    # Side A answers once: both of its representatives are done, side B still has to answer.
    assert mm.accept(http, heads['a1'], match_id).status_code == 200
    assert (pending_count(http, heads['a1']), pending_count(http, heads['a2']), pending_count(http, heads['b1'])) == (
        0, 0, 1)
    # Side B accepts: the match goes to "combinando" and nothing is left open.
    assert mm.accept(http, heads['b1'], match_id).status_code == 200
    assert pending_count(http, heads['b1']) == 0
    assert all(row.resolved_at is not None for row in rows(db, f'proposal:{match_id}:'))


def test_declined_proposal_closes_both_sides(client):
    http, db = client
    first = mm.squad(http, 'rec-a')
    second = mm.squad(http, 'rec-b')
    match_id, _ = mm.pair(http, first, second)
    assert [one_pending(http, headers, 'proposta_partida')['payload']['match_id']
            for headers in (first[0], second[0])] == [match_id, match_id]

    assert mm.decline(http, first[0], match_id).status_code == 200
    assert (pending_count(http, first[0]), pending_count(http, second[0])) == (0, 0)
    assert all(row.resolved_at is not None for row in rows(db, f'proposal:{match_id}:'))


def test_expired_proposal_closes_both_sides_even_when_one_had_accepted(client):
    http, db = client
    first = mm.squad(http, 'exp-a')
    second = mm.squad(http, 'exp-b')
    match_id, _ = mm.pair(http, first, second)
    assert mm.accept(http, first[0], match_id).status_code == 200
    assert pending_count(http, second[0]) == 1

    assert queue.expire_proposals(db, utcnow() + 3 * HOUR) == 1
    db.commit()
    assert all(row.resolved_at is not None for row in rows(db, f'proposal:{match_id}:'))
    assert db.get(Match, match_id).state == 'expirada'
    # The deadline is still in the future for the real clock, so only the resolution explains the empty list.
    assert pending(http, second[0], 'proposta_partida') == []


# ----- Type 4: vaga_encontrada ------------------------------------------------------------------------------

@pytest.fixture
def slots_world(client):
    http, db = client
    people = sf.actors(http, db, 'rep_a', 'member_a', 'rep_b', 'guest', 'other', 'stranger', 'admin')
    team_a = make_team(db, people['rep_a'].user, people['member_a'].user, name='Ferrugem FC')
    team_b = make_team(db, people['rep_b'].user, name='Tigres do Lago')
    db.commit()
    return SimpleNamespace(http=http, db=db, people=people, team_a=team_a, team_b=team_b)


def test_walkin_offer_is_pending_with_its_deadline_until_accepted_or_declined(slots_world):
    w = slots_world
    guest, other = w.people['guest'], w.people['other']
    match = sf.new_match(w, slots_a={'atacante': 1})
    sf.wait(w.db, guest.user)
    slot = sf.slots_of(w.db, match)[0]

    item = one_pending(w.http, guest.headers, 'vaga_encontrada')
    assert item['payload']['slot_id'] == slot.id
    assert parse(item['action_until']) == sf.search_of(w.db, guest.user).offer_expires_at
    assert sf.accept(w, 'guest', slot.id).status_code == 200
    assert pending_count(w.http, guest.headers) == 0

    # Another slot: the offer is declined and the slot passes to the next walk-in, who gets its own pending action.
    second = sf.new_match(w, slots_a={'atacante': 1})
    sf.wait(w.db, other.user)
    other_slot = sf.slots_of(w.db, second)[0]
    one_pending(w.http, other.headers, 'vaga_encontrada')
    assert sf.decline(w, 'other', other_slot.id).status_code == 204
    assert pending_count(w.http, other.headers) == 0


def test_walkin_offer_closes_when_nobody_answers_or_the_slot_is_withdrawn(slots_world):
    w = slots_world
    guest, other = w.people['guest'], w.people['other']
    sf.new_match(w, slots_a={'atacante': 1})
    sf.wait(w.db, guest.user)
    one_pending(w.http, guest.headers, 'vaga_encontrada')

    # No answer: the sweep releases the offer and the search ends.
    assert queue.expire_offers(w.db, utcnow() + 3 * HOUR) == 1
    w.db.commit()
    assert sf.search_of(w.db, guest.user).state == 'sem_resposta'
    assert pending(w.http, guest.headers, 'vaga_encontrada') == []

    # Fewer slots: the offer is withdrawn (the walk-in goes back to waiting) and the action closes.
    other_match = sf.new_match(w, slots_a={'goleiro': 1})
    sf.wait(w.db, other.user, position='goleiro')
    one_pending(w.http, other.headers, 'vaga_encontrada')
    assert sf.set_slots(w, 'rep_a', other_match, {}).status_code == 200
    assert sf.search_of(w.db, other.user).state == 'ativa'
    assert pending(w.http, other.headers, 'vaga_encontrada') == []


# ----- Type 7: resultado_divergente -------------------------------------------------------------------------

@pytest.fixture
def results_world(client, monkeypatch):
    """Two teams and a match played 2 h ago; the clock of the routes and of the pending list is fixed."""
    http, db = client
    clock = use_clock(monkeypatch)
    monkeypatch.setattr('app.services.notifications.utcnow', lambda: clock['now'])
    people = {name: make_user(db, name) for name in ('rep_a', 'rep_b')}
    people['admin'] = make_user(db, 'admin', admin=True)
    team_a = make_team(db, people['rep_a'], name='Ferrugem FC')
    team_b = make_team(db, people['rep_b'], name='Tigres do Lago')
    headers = {name: login(db, user) for name, user in people.items()}
    match = scheduled_match(db, team_a, team_b, starts_at=NOW - 2 * HOUR, open_slots=False)
    db.commit()
    return SimpleNamespace(http=http, db=db, clock=clock, people=people, h=headers, team_a=team_a, team_b=team_b,
                           match=match)


def test_divergent_result_keeps_only_the_latest_alert_and_closes_when_the_scores_match(results_world):
    w = results_world
    match, db, http = w.match, w.db, w.http
    # The championship organizer's decision (type 11) is also moot once the scores match.
    notifications.notify(db, w.people['admin'].id, 'divergencia_para_decidir',
                         {'match_id': match.id, 'event_id': 1, 'event_name': 'Copa', 'deadline': 'x'},
                         action_key=notifications.decision_key(match.id))
    db.commit()

    assert put_result(http, w.h['rep_a'], match.id, 2, 1).status_code == 200
    assert pending(http, w.h['rep_a']) == [] and pending(http, w.h['rep_b']) == []
    assert put_result(http, w.h['rep_b'], match.id, 1, 1).status_code == 200
    for who in ('rep_a', 'rep_b'):
        item = one_pending(http, w.h[who], 'resultado_divergente')
        assert parse(item['action_until']) == match.result_deadline

    # A second divergent report notifies again, but only the latest alert stays open.
    assert put_result(http, w.h['rep_b'], match.id, 3, 0).status_code == 200
    assert len(rows(db, f'result:{match.id}')) == 4
    for who in ('rep_a', 'rep_b'):
        [latest] = pending(http, w.h[who], 'resultado_divergente')
        assert latest['pending']
    assert sum(row.resolved_at is None for row in rows(db, f'result:{match.id}')) == 2

    assert put_result(http, w.h['rep_a'], match.id, 3, 0).status_code == 200
    assert pending_count(http, w.h['rep_a']) == 0 and pending_count(http, w.h['rep_b']) == 0
    assert all(row.resolved_at is not None for row in rows(db, f'result:{match.id}'))
    assert pending_count(http, w.h['admin']) == 0                       # decision_key closed as well


def test_divergence_without_a_result_at_the_deadline_closes_for_both_sides(results_world):
    w = results_world
    match, db, http = w.match, w.db, w.http
    assert put_result(http, w.h['rep_a'], match.id, 2, 1).status_code == 200
    assert put_result(http, w.h['rep_b'], match.id, 0, 0).status_code == 200
    assert pending_count(http, w.h['rep_a']) == 1 and pending_count(http, w.h['rep_b']) == 1

    assert close_due_results(db, match.result_deadline + timedelta(minutes=1)) == 1
    db.commit()
    db.refresh(match)
    assert match.state == 'sem_resultado'
    w.clock['now'] = match.result_deadline - timedelta(minutes=5)       # before the deadline: only resolution counts
    assert pending_count(http, w.h['rep_a']) == 0 and pending_count(http, w.h['rep_b']) == 0
    assert all(row.resolved_at is not None for row in rows(db, f'result:{match.id}'))

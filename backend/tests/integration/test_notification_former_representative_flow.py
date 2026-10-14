"""Pending actions of a representative who leaves, is removed or stops representing the team (proposals, join requests
and entries), over the HTTP routes.

The actions they received as representatives of that team close for them alone; the other representatives (and the
other side) keep theirs. The match types with shared keys are in `partida/test_notification_former_representative_
flow.py`. Contract: docs/decisoes/0003-times-campeonatos.md, section 7.2.
"""
import pytest

from app.models.events import EventEntry
from app.services import media as media_service
from tests.integration import test_matchmaking_flow as mm
from tests.integration.entry_helpers import FakeStorage, account, image_file, make_event, organizer
from tests.integration.team_helpers import create_team, join_by_invite, link_token, register
from tests.integration.test_notification_resolution_events_flow import (
    cancel_event,
    only,
    pending,
    refuse,
    send_refund,
)
from tests.integration.test_notification_resolution_matches_flow import pending_count, promote, rows

HOW = ('leave', 'removed', 'demoted')


@pytest.fixture(autouse=True)
def storage(monkeypatch):
    fake = FakeStorage()
    monkeypatch.setattr(media_service, 'storage_client', lambda: fake)
    return fake


def types(http, headers):
    return sorted(item['type'] for item in pending(http, headers))


def stop_representing(http, how, team_id, owner, helper, helper_id):
    """The second representative leaves, is removed by the owner or is made an ordinary member."""
    base = f'/api/v1/teams/{team_id}/members/{helper_id}'
    if how == 'leave':
        response = http.delete(base, headers=helper)
    elif how == 'removed':
        response = http.delete(base, headers=owner)
    else:
        response = http.patch(base, json={'role': 'membro'}, headers=owner)
    assert response.status_code in (200, 204), response.text


@pytest.mark.parametrize('how', HOW)
def test_proposal_and_join_request_close_only_for_the_representative_who_stops_representing(client, how):
    http, db = client
    first = mm.squad(http, 'rep-a')
    second = mm.squad(http, 'rep-b')
    helper, helper_id = register(http, 'rep-a-helper@example.com', 'Segundo Representante')
    join_by_invite(http, first[0], first[2], helper, helper_id)
    promote(http, first[0], first[2], helper_id)
    visitor, _ = register(http, 'rep-a-visitante@example.com', 'Visitante')
    match_id, _ = mm.pair(http, first, second)
    assert http.post(f"/api/v1/join/{link_token(http, first[0], first[2])}", json={}, headers=visitor
                     ).status_code == 201

    expected = ['pedido_entrada', 'proposta_partida']
    assert (types(http, first[0]), types(http, helper), types(http, second[0])) == (
        expected, expected, ['proposta_partida'])

    stop_representing(http, how, first[2], first[0], helper, helper_id)

    assert types(http, helper) == []
    assert pending_count(http, helper) == 0
    # The other representative and the opposing side keep the proposal; the request is still waiting for the owner.
    assert types(http, first[0]) == expected
    assert types(http, second[0]) == ['proposta_partida']
    [owner_proposal] = rows(db, f'proposal:{match_id}:user:{first[1]}')
    assert owner_proposal.resolved_at is None
    [helper_proposal] = rows(db, f'proposal:{match_id}:user:{helper_id}')
    assert helper_proposal.resolved_at is not None

    # The remaining representative still answers normally.
    assert mm.accept(http, first[0], match_id).status_code == 200
    assert types(http, first[0]) == ['pedido_entrada']


def test_a_member_who_was_never_a_representative_resolves_nothing(client):
    http, db = client
    first = mm.squad(http, 'mem-a')
    second = mm.squad(http, 'mem-b')
    member, member_id = register(http, 'mem-a-membro@example.com', 'Membro Comum')
    join_by_invite(http, first[0], first[2], member, member_id)
    mm.pair(http, first, second)

    assert http.delete(f'/api/v1/teams/{first[2]}/members/{member_id}', headers=member).status_code == 204
    assert types(http, first[0]) == ['proposta_partida'] and types(http, second[0]) == ['proposta_partida']


def team_with_two_representatives(http, db, label):
    owner, owner_id, permission = organizer(http, db, f'{label}-org')
    rep, rep_id = account(http, db, f'{label}-rep')
    helper, helper_id = account(http, db, f'{label}-helper')
    team = create_team(http, rep, f'Time {label}')
    join_by_invite(http, rep, team['id'], helper, helper_id)
    promote(http, rep, team['id'], helper_id)
    event = make_event(db, owner_id, permission)
    return owner, event, team, (rep, rep_id), (helper, helper_id)


@pytest.mark.parametrize('how', HOW)
def test_refused_receipt_of_the_team_closes_only_for_the_representative_who_stops(client, how):
    http, db = client
    owner, event, team, (rep, rep_id), (helper, helper_id) = team_with_two_representatives(http, db, 'comprov')
    created = http.post(f'/api/v1/events/{event.id}/entries', json={'team_id': team['id']}, headers=rep)
    assert created.status_code == 201, created.text
    entry_id = created.json()['id']
    sent = http.put(f'/api/v1/entries/{entry_id}/receipt', files=image_file(), headers=rep)
    assert sent.status_code == 201, sent.text
    refuse(http, owner, sent.json()['latest_payment']['id'])
    assert db.get(EventEntry, entry_id).state == 'rejeitada'
    assert [only(pending(http, who, 'comprovante_decidido'))['payload']['entry_id'] for who in (rep, helper)] == [
        entry_id, entry_id]

    stop_representing(http, how, team['id'], rep, helper, helper_id)

    assert pending(http, helper) == []
    assert only(pending(http, rep, 'comprovante_decidido'))['payload']['entry_id'] == entry_id
    assert {row.user_id for row in rows(db, f'entry_receipt:{entry_id}') if row.resolved_at is None} == {rep_id}


def test_sent_refund_of_the_team_closes_only_for_the_representative_who_leaves(client):
    http, db = client
    owner, event, team, (rep, _), (helper, helper_id) = team_with_two_representatives(http, db, 'devol')
    entry_id = http.post(f'/api/v1/events/{event.id}/entries', json={'team_id': team['id']}, headers=rep
                         ).json()['id']
    assert http.put(f'/api/v1/entries/{entry_id}/receipt', files=image_file(), headers=rep).status_code == 201
    cancel_event(http, owner, event.id)
    assert db.get(EventEntry, entry_id).state == 'devolucao_pendente'
    send_refund(http, owner, entry_id)
    assert [len(pending(http, who, 'devolucao_enviada')) for who in (rep, helper)] == [1, 1]

    stop_representing(http, 'leave', team['id'], rep, helper, helper_id)

    assert pending(http, helper) == []
    assert len(pending(http, rep, 'devolucao_enviada')) == 1

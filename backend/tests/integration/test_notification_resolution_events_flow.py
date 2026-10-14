"""Pendências de eventos, inscrições, comprovantes e devoluções (tipos 8 a 13) e a parte de campeonato do tipo 7.

Cada pendência nasce na ação do domínio, ler não a resolve e a ação real (ou o fechamento por outro caminho) a tira
de `/me/notifications/pending`, sempre pelas rotas HTTP. Um serviço que esqueça a chave de um destinatário que decide
quebra o teste (`notify` a exige).
"""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.models.events import EntryReceipt, Event, EventEntry
from app.models.identity import User, utcnow
from app.models.notifications import Notification
from app.models.organizers import Organizer
from app.services import media as media_service
from app.services.event_rules import REFUND_AUTO_CONFIRM_AFTER
from app.services.sweep import run_sweep
from tests.integration.championship_helpers import API, decide, diverge
from tests.integration.entry_helpers import (
    FakeStorage,
    account,
    image_file,
    organizer,
    pdf_file,
    race_event,
    receipts_of,
)
from tests.integration.team_helpers import notifications as listed
from tests.integration.test_championship_result_flow import matches_of, reps, started_world
from tests.integration.test_organizer_events_flow import PAID_FOOTBALL, action, create, dates
from tests.integration.test_organizer_events_flow import admin as make_admin
from tests.integration.test_organizer_events_flow import organizer as make_organizer

PENDING = '/api/v1/me/notifications/pending'
SUMMARY = '/api/v1/me/notifications/summary'
REASON = 'Chuva forte no fim de semana'


@pytest.fixture(autouse=True)
def storage(monkeypatch):
    fake = FakeStorage()
    monkeypatch.setattr(media_service, 'storage_client', lambda: fake)
    return fake


def moment(value: str) -> datetime:
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def pending(http, headers, type_=None):
    response = http.get(PENDING, headers=headers, params={'limit': 50})
    assert response.status_code == 200, response.text
    return [item for item in response.json()['items'] if type_ in (None, item['type'])]


def pending_count(http, headers):
    return http.get(SUMMARY, headers=headers).json()['pending_count']


def read(http, headers, notification_id):
    response = http.put(f'/api/v1/me/notifications/{notification_id}/read', json={}, headers=headers)
    assert response.status_code == 200, response.text


def row_of(db, user_id, type_, **payload):
    """The notification rows (newest last) of a user, filtered by payload fields."""
    rows = db.scalars(select(Notification).where(Notification.user_id == user_id, Notification.type == type_)
                      .order_by(Notification.id)).all()
    return [item for item in rows if all(item.payload.get(key) == value for key, value in payload.items())]


def sweep(db, at):
    report = run_sweep(db, at)
    db.commit()
    return report


def only(items):
    assert len(items) == 1, items
    return items[0]


def paid_entry(http, event_id, headers):
    """The athlete enters a paid event and declares the Pix: (entry id, payment receipt id)."""
    created = http.post(f'/api/v1/events/{event_id}/entries', json={}, headers=headers)
    assert created.status_code == 201, created.text
    entry_id = created.json()['id']
    sent = http.put(f'/api/v1/entries/{entry_id}/receipt', files=image_file(), headers=headers)
    assert sent.status_code == 201, sent.text
    return entry_id, sent.json()['latest_payment']['id']


def decide_receipt(http, headers, receipt_id, decision='aprovar', **body):
    response = http.post(f'/api/v1/receipts/{receipt_id}/decision', json={'decision': decision, **body},
                         headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def refuse(http, headers, receipt_id):
    return decide_receipt(http, headers, receipt_id, 'recusar', reason_code='valor_diferente')


def cancel_event(http, headers, event_id):
    response = http.post(f'/api/v1/organizer/events/{event_id}/cancel', json={'reason': REASON}, headers=headers)
    assert response.status_code == 200, response.text


def send_refund(http, headers, entry_id):
    sent = http.put(f'/api/v1/entries/{entry_id}/refund-receipt', files=pdf_file(), headers=headers)
    assert sent.status_code == 201, sent.text
    return sent.json()['refund']['id']


def respond(http, headers, entry_id, response, **body):
    done = http.post(f'/api/v1/entries/{entry_id}/refund-response', json={'response': response, **body},
                     headers=headers)
    assert done.status_code == 200, done.text
    return done.json()


def cancelled_event_with_refunds(http, db, labels):
    """A paid race whose organizer cancelled it with every athlete's receipt under analysis: refunds are due."""
    owner, owner_id, permission = organizer(http, db)
    event = race_event(db, owner_id, permission)
    people = {}
    for label in labels:
        headers, user_id = account(http, db, label)
        entry_id, receipt_id = paid_entry(http, event.id, headers)
        people[label] = {'headers': headers, 'user_id': user_id, 'entry_id': entry_id}
    cancel_event(http, owner, event.id)
    for person in people.values():
        assert db.get(EventEntry, person['entry_id']).state == 'devolucao_pendente'
    return owner, owner_id, event, people


# --- 8. comprovante_decidido (recusado) -------------------------------------------------------------------------

def test_refused_receipt_is_pending_until_a_new_receipt_or_the_end_of_the_reservation(client):
    http, db = client
    owner, owner_id, permission = organizer(http, db)
    ana, ana_id = account(http, db, 'ana')
    bia, _ = account(http, db, 'bia')
    caio, caio_id = account(http, db, 'caio')
    event = race_event(db, owner_id, permission)

    # Approving asks nothing from the athlete.
    entry_id, receipt_id = paid_entry(http, event.id, ana)
    assert pending(http, ana) == []
    refuse(http, owner, receipt_id)
    entry = db.get(EventEntry, entry_id)
    assert entry.state == 'rejeitada'
    item = only(pending(http, ana, 'comprovante_decidido'))
    assert item['pending'] is True and moment(item['action_until']) == entry.reserved_until
    assert pending_count(http, ana) == 1
    read(http, ana, item['id'])
    assert only(pending(http, ana, 'comprovante_decidido'))['id'] == item['id']

    # A new receipt answers the refusal; the organizer receives a new one to analyse.
    assert http.put(f'/api/v1/entries/{entry_id}/receipt', files=image_file(), headers=ana).status_code == 201
    assert pending(http, ana) == [] and pending_count(http, ana) == 0
    assert row_of(db, ana_id, 'comprovante_decidido')[0].resolved_at is not None
    second = receipts_of(db, entry_id)[-1]
    assert [row['receipt_id'] for row in [r.payload for r in row_of(db, owner_id, 'comprovante_recebido')]] == [
        receipt_id, second.id]

    # Refused again and the reservation ends: the sweep expires the entry and closes the answer.
    refuse(http, owner, second.id)
    assert len(pending(http, ana, 'comprovante_decidido')) == 1
    assert sweep(db, entry.reserved_until + timedelta(minutes=1))['reservas_expiradas'] == 1
    assert db.get(EventEntry, entry_id).state == 'expirada'
    assert pending(http, ana) == []
    assert all(row.resolved_at is not None for row in row_of(db, ana_id, 'comprovante_decidido'))

    # Giving up closes it too.
    bia_entry, bia_receipt = paid_entry(http, event.id, bia)
    refuse(http, owner, bia_receipt)
    assert len(pending(http, bia, 'comprovante_decidido')) == 1
    assert http.delete(f'/api/v1/entries/{bia_entry}', headers=bia).status_code == 204
    assert pending(http, bia) == []

    # Refused after the reservation ended: the entry expires at once and nothing is left to answer.
    caio_entry, caio_receipt = paid_entry(http, event.id, caio)
    db.get(EventEntry, caio_entry).reserved_until = utcnow() - timedelta(minutes=5)
    db.flush()
    refuse(http, owner, caio_receipt)
    assert db.get(EventEntry, caio_entry).state == 'expirada'
    late = only(row_of(db, caio_id, 'comprovante_decidido'))
    assert late.action_key is None and late.resolved_at is None
    assert pending(http, caio) == [] and len(listed(http, caio, 'comprovante_decidido')) == 1


# --- 10. comprovante_recebido ------------------------------------------------------------------------------------

def test_received_receipt_is_pending_for_the_organizer_until_decided_or_the_event_is_cancelled(client):
    http, db = client
    owner, owner_id, permission = organizer(http, db)
    ana, _ = account(http, db, 'ana')
    bia, _ = account(http, db, 'bia')
    caio, _ = account(http, db, 'caio')
    dani, _ = account(http, db, 'dani')
    event = race_event(db, owner_id, permission)

    _, ana_receipt = paid_entry(http, event.id, ana)
    _, bia_receipt = paid_entry(http, event.id, bia)
    caio_entry, caio_receipt = paid_entry(http, event.id, caio)
    dani_entry, dani_receipt = paid_entry(http, event.id, dani)
    items = pending(http, owner, 'comprovante_recebido')
    assert sorted(item['payload']['receipt_id'] for item in items) == sorted(
        [ana_receipt, bia_receipt, caio_receipt, dani_receipt])
    assert all(item['pending'] and item['action_until'] is None for item in items)
    assert pending_count(http, owner) == 4
    read(http, owner, items[0]['id'])
    assert len(pending(http, owner, 'comprovante_recebido')) == 4

    decide_receipt(http, owner, ana_receipt)
    refuse(http, owner, bia_receipt)
    left = pending(http, owner, 'comprovante_recebido')
    assert sorted(item['payload']['receipt_id'] for item in left) == sorted([caio_receipt, dani_receipt])

    # The event is cancelled: the receipts under analysis cannot be decided any more (the refund flow starts).
    eve, _ = account(http, db, 'eve')
    eve_entry, eve_receipt = paid_entry(http, event.id, eve)
    refuse(http, owner, eve_receipt)
    assert len(pending(http, eve, 'comprovante_decidido')) == 1
    cancel_event(http, owner, event.id)
    assert pending(http, owner) == []
    assert db.get(EventEntry, caio_entry).state == 'devolucao_pendente'
    assert db.get(EventEntry, dani_entry).state == 'devolucao_pendente'
    assert db.get(EventEntry, eve_entry).state == 'cancelada'
    # The refused receipt of an entry cancelled with the event is closed as well.
    assert pending(http, eve) == []


# --- 9. devolucao_enviada ----------------------------------------------------------------------------------------

def test_sent_refund_is_pending_until_confirmed_contested_or_confirmed_automatically(client):
    http, db = client
    owner, owner_id, event, people = cancelled_event_with_refunds(http, db, ('ana', 'bia', 'caio'))
    ana, bia, caio = (people[label] for label in ('ana', 'bia', 'caio'))
    assert pending(http, ana['headers']) == []

    refunds = {person['entry_id']: send_refund(http, owner, person['entry_id']) for person in (ana, bia, caio)}
    for person in (ana, bia, caio):
        item = only(pending(http, person['headers'], 'devolucao_enviada'))
        receipt = db.get(EntryReceipt, refunds[person['entry_id']])
        assert item['pending'] is True
        assert moment(item['action_until']) == receipt.created_at + REFUND_AUTO_CONFIRM_AFTER
    assert pending(http, owner) == []
    read(http, ana['headers'], pending(http, ana['headers'])[0]['id'])
    assert len(pending(http, ana['headers'], 'devolucao_enviada')) == 1

    respond(http, ana['headers'], ana['entry_id'], 'confirmar')
    assert pending(http, ana['headers']) == []
    respond(http, bia['headers'], bia['entry_id'], 'contestar', reason='O Pix não caiu na minha conta.')
    assert pending(http, bia['headers']) == []
    assert len(pending(http, caio['headers'], 'devolucao_enviada')) == 1

    # Seven days without an answer: the sweep counts the refund as received and closes the answer.
    assert sweep(db, utcnow() + timedelta(days=8))['devolucoes_recebidas'] == 1
    assert db.get(EventEntry, caio['entry_id']).state == 'devolvida'
    assert pending(http, caio['headers']) == []
    for person in (ana, bia, caio):
        assert all(row.resolved_at is not None for row in row_of(db, person['user_id'], 'devolucao_enviada'))


# --- 13. devolucao_contestada ------------------------------------------------------------------------------------

def test_contested_refund_is_pending_for_every_admin_and_only_informs_the_organizer(client):
    http, db = client
    first_admin, _ = account(http, db, 'admin1', admin=True)
    second_admin, second_id = account(http, db, 'admin2', admin=True)
    owner, owner_id, event, people = cancelled_event_with_refunds(http, db, ('bia', 'caio'))
    bia, caio = people['bia'], people['caio']
    bia_refund = send_refund(http, owner, bia['entry_id'])

    respond(http, bia['headers'], bia['entry_id'], 'contestar', reason='O Pix não caiu na minha conta.')
    assert pending(http, bia['headers']) == []                       # the refund was answered
    for headers in (first_admin, second_admin):
        item = only(pending(http, headers, 'devolucao_contestada'))
        assert item['pending'] is True and item['action_until'] is None
        assert item['payload']['receipt_id'] == bia_refund
        assert pending_count(http, headers) == 1
    # The organizer is told, but does not decide: no pending.
    informed = only(listed(http, owner, 'devolucao_contestada'))
    assert informed['pending'] is False and pending(http, owner) == []
    read(http, first_admin, pending(http, first_admin)[0]['id'])
    assert len(pending(http, first_admin, 'devolucao_contestada')) == 1

    # One administrator decides: it closes for all of them (reopened here).
    decision = http.post(f"/api/v1/admin/entries/{bia['entry_id']}/refund-decision",
                         json={'decision': 'pendente', 'reason': 'Comprovante ilegível.'}, headers=first_admin)
    assert decision.status_code == 200, decision.text
    assert pending(http, first_admin) == [] and pending(http, second_admin) == []

    # The organizer is also an administrator: one notification only, and it is the one that asks for a decision.
    db.get(User, owner_id).is_admin = True
    db.flush()
    again = send_refund(http, owner, bia['entry_id'])
    respond(http, bia['headers'], bia['entry_id'], 'contestar', reason='Valor menor que o pago.')
    assert len(row_of(db, owner_id, 'devolucao_contestada', receipt_id=again)) == 1
    mine = only(pending(http, owner, 'devolucao_contestada'))
    assert mine['payload']['receipt_id'] == again
    assert len(pending(http, second_admin, 'devolucao_contestada')) == 1
    kept = http.post(f"/api/v1/admin/entries/{bia['entry_id']}/refund-decision",
                     json={'decision': 'devolvida', 'reason': 'O extrato confirma o valor.'}, headers=second_admin)
    assert kept.status_code == 200, kept.text
    assert pending(http, owner) == [] and pending(http, first_admin) == [] and pending(http, second_admin) == []
    assert caio['entry_id'] and second_id


# --- 12. evento_para_aprovar -------------------------------------------------------------------------------------

def test_event_review_is_pending_for_every_admin_until_one_decides_or_it_leaves_the_queue(client):
    http, db = client
    staff, _ = make_admin(http, db, 'review-admin1@example.com')
    other_staff, _ = make_admin(http, db, 'review-admin2@example.com')
    owner, owner_id = make_organizer(http, db, 'review-owner@example.com')
    event_id = create(http, owner, **PAID_FOOTBALL, **dates()).json()['id']
    decide_url = f'/api/v1/admin/events/{event_id}/decision'

    def submit():
        assert action(http, owner, event_id, 'submit').status_code == 200

    submit()
    for headers in (staff, other_staff):
        item = only(pending(http, headers, 'evento_para_aprovar'))
        assert item['pending'] is True and item['action_until'] is None
        assert item['payload']['event_id'] == event_id
    read(http, staff, pending(http, staff)[0]['id'])
    assert len(pending(http, staff, 'evento_para_aprovar')) == 1
    assert pending(http, owner) == []

    # A refusal by one administrator closes it for both.
    refused = http.post(decide_url, json={'decision': 'recusar', 'reason_code': 'pix_incompleto',
                                          'reason_detail': 'Falta o Copia e Cola.'}, headers=staff)
    assert refused.status_code == 200, refused.text
    assert pending(http, staff) == [] and pending(http, other_staff) == []

    # Withdrawn by the organizer.
    assert http.patch(f'/api/v1/organizer/events/{event_id}', json={'pix_copy_paste': '00020126...'},
                      headers=owner).status_code == 200
    submit()
    assert len(pending(http, staff, 'evento_para_aprovar')) == 1 and len(pending(http, other_staff)) == 1
    assert action(http, owner, event_id, 'withdraw').status_code == 200
    assert pending(http, staff) == [] and pending(http, other_staff) == []

    # Approval blocked by dates in the past (409): the pending stays; with the dates fixed, the approval closes it.
    submit()
    event = db.get(Event, event_id)
    closes = event.registration_closes_at
    event.registration_closes_at = utcnow() - timedelta(hours=1)
    db.flush()
    blocked = http.post(decide_url, json={'decision': 'aprovar'}, headers=other_staff)
    assert blocked.status_code == 409
    assert len(pending(http, staff, 'evento_para_aprovar')) == 1 and len(pending(http, other_staff)) == 1
    event.registration_closes_at = closes
    db.flush()
    approved = http.post(decide_url, json={'decision': 'aprovar'}, headers=other_staff)
    assert approved.status_code == 200, approved.text
    assert pending(http, staff) == [] and pending(http, other_staff) == []

    # The organizer is revoked while the event waits: it goes back to draft and the pending closes.
    second, second_id = make_organizer(http, db, 'review-owner2@example.com', display_name='Liga Dois')
    waiting = create(http, second, **PAID_FOOTBALL, **dates()).json()['id']
    assert action(http, second, waiting, 'submit').status_code == 200
    assert len(pending(http, staff, 'evento_para_aprovar')) == 1
    permission = db.scalar(select(Organizer).where(Organizer.user_id == second_id))
    revoked = http.post(f'/api/v1/admin/organizers/{permission.id}/revoke', json={'reason': 'Denúncias graves'},
                        headers=staff)
    assert revoked.status_code == 204, revoked.text
    assert db.get(Event, waiting).state == 'rascunho'
    assert pending(http, staff) == [] and pending(http, other_staff) == []
    assert owner_id


# --- 11 e 7 (campeonato). divergencia_para_decidir e resultado_divergente ------------------------------------------

def test_divergence_is_pending_for_the_organizer_and_both_sides_until_decided_or_the_event_is_cancelled(
        client, monkeypatch):
    http, db = client
    world = started_world(http, db, monkeypatch)
    one, two = matches_of(db, world, 1)
    owner = world['organizer']
    diverge(http, db, world, one.id, (2, 1), (1, 2))
    diverge(http, db, world, two.id, (1, 0), (0, 1))
    db.refresh(one)

    to_decide = pending(http, owner, 'divergencia_para_decidir')
    assert sorted(item['payload']['match_id'] for item in to_decide) == sorted([one.id, two.id])
    item = next(item for item in to_decide if item['payload']['match_id'] == one.id)
    assert item['pending'] is True and item['action_until'] is None
    read(http, owner, item['id'])
    assert len(pending(http, owner, 'divergencia_para_decidir')) == 2
    sides = {match.id: reps(world, db, match.id) for match in (one, two)}
    for rep in (*sides[one.id].values(), *sides[two.id].values()):
        only(pending(http, rep['headers'], 'resultado_divergente'))

    # The organizer decides the first match: nothing is left to correct on either side.
    decide(http, world, one.id, score={'goals_a': 2, 'goals_b': 1}, justification='Conferido no vídeo da partida.')
    assert [item['payload']['match_id'] for item in pending(http, owner, 'divergencia_para_decidir')] == [two.id]
    for rep in sides[one.id].values():
        assert pending(http, rep['headers'], 'resultado_divergente') == []
        assert all(row.resolved_at is not None for row in row_of(db, rep['user_id'], 'resultado_divergente'))
    for rep in sides[two.id].values():
        assert len(pending(http, rep['headers'], 'resultado_divergente')) == 1

    # Cancelling the event cancels the open matches and closes what was left.
    cancelled = http.post(f'{API}/organizer/events/{world["event_id"]}/cancel', json={'reason': 'Quadra interditada.'},
                          headers=owner)
    assert cancelled.status_code == 200, cancelled.text
    assert pending(http, owner, 'divergencia_para_decidir') == []
    for rep in sides[two.id].values():
        assert pending(http, rep['headers'], 'resultado_divergente') == []


def test_organizer_divergence_stays_pending_after_the_athletes_deadline(client, monkeypatch):
    from app.services import notifications

    http, db = client
    world = started_world(http, db, monkeypatch, count=2)
    match = matches_of(db, world, 1)[0]
    diverge(http, db, world, match.id, (2, 1), (1, 2))
    db.refresh(match)
    after = match.result_deadline + timedelta(hours=1)
    monkeypatch.setattr(notifications, 'utcnow', lambda: after)
    world['clock'].set(after)
    [item] = pending(http, world['organizer'], 'divergencia_para_decidir')
    assert item['payload']['match_id'] == match.id and item['action_until'] is None
    decide(http, world, match.id, score={'goals_a': 2, 'goals_b': 1}, justification='Conferido após o prazo dos times.')
    assert pending(http, world['organizer'], 'divergencia_para_decidir') == []

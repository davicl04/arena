"""Payment receipts, the authorized file route and Pix refunds (confirm, contest, administration) on PostgreSQL."""
from datetime import timedelta

from app.models.events import EntryReceipt, EventEntry
from app.models.identity import utcnow
from app.services import media as media_service
from tests.integration.entry_helpers import (
    PDF,
    FakeStorage,
    account,
    gif,
    image_file,
    organizer,
    pdf_file,
    race_event,
    receipts_of,
    tennis_event,
)
from tests.integration.team_helpers import audit_actions, notifications


def test_receipt_goes_to_analysis_and_a_resend_keeps_the_refused_one(client, monkeypatch):
    http, db = client
    storage = FakeStorage()
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    owner, owner_id, permission = organizer(http, db)
    athlete, athlete_id = account(http, db, 'ana')
    admin, _ = account(http, db, 'admin', admin=True)
    stranger, _ = account(http, db, 'estranho')
    event = race_event(db, owner_id, permission)

    detail = http.get(f'/api/v1/events/{event.id}', headers=athlete).json()
    assert detail['pix'] == {'beneficiary': 'Rafa Nunes', 'key_type': 'email', 'key': 'copa@pix.com',
                             'copy_paste': '00020126copa', 'instructions': None}
    entry = http.post(f'/api/v1/events/{event.id}/entries', json={}, headers=athlete).json()
    url = f"/api/v1/entries/{entry['id']}/receipt"

    not_multipart = http.put(url, json={}, headers=athlete)
    assert (not_multipart.status_code, not_multipart.json()['detail']) == (
        415, 'Envie o arquivo (imagem ou PDF) em multipart/form-data.')
    wrong = http.put(url, files={'file': ('anim.gif', gif(), 'image/gif')}, headers=athlete)
    assert (wrong.status_code, wrong.json()['detail']) == (
        415, 'Envie o comprovante como imagem (JPEG, PNG ou WebP) ou PDF.')
    assert http.put(url, files=image_file(), headers=stranger).status_code == 404
    assert http.put(url, files=image_file(), headers=owner).json()['detail'] == (
        'Só o atleta inscrito envia o comprovante.')
    assert storage.objects == {}

    sent = http.put(url, files=image_file(), headers=athlete)
    assert sent.status_code == 201, sent.text
    body = sent.json()
    assert (body['state'], body['can_send_receipt'], body['can_cancel']) == ('em_analise', False, False)
    payment = body['latest_payment']
    assert (payment['kind'], payment['file_type'], payment['decision']) == ('pagamento', 'imagem', None)
    assert payment['uploaded_by']['id'] == athlete_id
    received = notifications(http, owner, 'comprovante_recebido')
    assert [item['payload'] for item in received] == [{'event_id': event.id, 'event_name': event.name,
                                                       'entry_id': entry['id'], 'receipt_id': payment['id']}]
    assert audit_actions(db, 'entry_receipt', payment['id']) == [('comprovante.enviado', {
        'entry_id': entry['id'], 'event_id': event.id, 'attempt': 1, 'file_type': 'imagem'})]
    twice = http.put(url, files=image_file(), headers=athlete)
    assert (twice.status_code, twice.json()['detail']) == (409, 'Esta inscrição não aguarda comprovante.')
    paid_cancel = http.delete(f"/api/v1/entries/{entry['id']}", headers=athlete)
    assert (paid_cancel.status_code, paid_cancel.json()['detail']) == (
        409, 'Para desistir de uma inscrição paga, fale com o organizador.')

    # Refusal by the organizer (decided in the database: the decision route belongs to the organizer front).
    first = receipts_of(db, entry['id'])[0]
    first.decision, first.reason_code, first.decided_at, first.decided_by_id = (
        'recusado', 'valor_diferente', utcnow(), owner_id)
    db.get(EventEntry, entry['id']).state = 'rejeitada'
    db.flush()
    refused = http.get(f"/api/v1/entries/{entry['id']}", headers=athlete).json()
    assert (refused['state'], refused['can_send_receipt'], refused['can_cancel']) == ('rejeitada', True, True)
    assert (refused['latest_payment']['decision'], refused['latest_payment']['reason_code']) == (
        'recusado', 'valor_diferente')

    resent = http.put(url, files=pdf_file(), headers=athlete)
    assert resent.status_code == 201 and resent.json()['state'] == 'em_analise'
    history = http.get(f"/api/v1/entries/{entry['id']}/receipts", headers=athlete).json()['items']
    assert [(item['file_type'], item['decision']) for item in history] == [('pdf', None), ('imagem', 'recusado')]
    assert len(storage.objects) == 2 and all(key.startswith('receipts/') for _, key in storage.objects)
    assert http.get(f"/api/v1/entries/{entry['id']}/receipts", headers=owner).status_code == 200
    assert http.get(f"/api/v1/entries/{entry['id']}/receipts", headers=stranger).status_code == 404

    pdf_url, image_url = history[0]['file_url'], history[1]['file_url']
    own = http.get(pdf_url, headers=athlete)
    assert (own.status_code, own.content, own.headers['content-type']) == (200, PDF, 'application/pdf')
    assert own.headers['content-disposition'] == f"inline; filename=\"comprovante-{history[0]['id']}.pdf\""
    assert 'no-store' in own.headers['cache-control'] and own.headers['x-content-type-options'] == 'nosniff'
    by_owner = http.get(image_url, headers=owner)
    assert by_owner.status_code == 200 and by_owner.content.startswith(b'RIFF')
    assert http.get(pdf_url, headers=admin).status_code == 200
    hidden = http.get(pdf_url, headers=stranger)
    assert (hidden.status_code, hidden.json()['detail']) == (404, 'Comprovante não encontrado.')
    assert http.get('/api/v1/receipts/999999/file', headers=athlete).status_code == 404
    assert http.get(pdf_url).status_code == 401
    assert http.get(f"/api/v1/entries/{entry['id']}", headers=admin).json()['my_role'] == 'administracao'


def test_receipt_commit_failure_removes_the_uploaded_object(client, monkeypatch):
    http, db = client
    storage = FakeStorage()
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    _, owner_id, permission = organizer(http, db)
    athlete, _ = account(http, db, 'ana')
    event = race_event(db, owner_id, permission)
    entry = http.post(f'/api/v1/events/{event.id}/entries', json={}, headers=athlete).json()

    def broken_commit():
        raise RuntimeError('commit perdido')

    monkeypatch.setattr(db, 'commit', broken_commit)
    try:
        http.put(f"/api/v1/entries/{entry['id']}/receipt", files=pdf_file(), headers=athlete)
    except RuntimeError:
        pass
    assert storage.objects == {}


def cancel_with_refunds(db, event, owner_id, *entry_ids):
    """Cancellation as the organizer front does it: paid entries that declared the payment wait for the refund."""
    event.state, event.cancelled_at, event.cancel_reason, event.cancelled_by_id = (
        'cancelado', utcnow(), 'Quadra interditada', owner_id)
    for entry_id in entry_ids:
        db.get(EventEntry, entry_id).state = 'devolucao_pendente'
    db.flush()


def test_refund_is_confirmed_contested_and_decided_by_the_administration(client, monkeypatch):
    http, db = client
    storage = FakeStorage()
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    owner, owner_id, permission = organizer(http, db)
    (ana, _), (bia, bia_id), (caio, _) = (account(http, db, name) for name in ('ana', 'bia', 'caio'))
    admin, admin_id = account(http, db, 'admin', admin=True)
    event = tennis_event(db, owner_id, permission, price_cents=12000, pix_beneficiary='Rafa Nunes',
                         pix_key_type='email', pix_key='copa@pix.com')
    ids = [http.post(f'/api/v1/events/{event.id}/entries', json={}, headers=person).json()['id']
           for person in (ana, bia, caio)]
    cancel_with_refunds(db, event, owner_id, *ids)
    ana_entry, bia_entry, caio_entry = ids

    waiting = http.get(f'/api/v1/entries/{ana_entry}', headers=ana).json()
    assert (waiting['state'], waiting['refund'], waiting['can_respond_refund']) == ('devolucao_pendente', None, False)
    assert http.get(f'/api/v1/events/{event.id}', headers=ana).json()['my_entry']['state'] == 'devolucao_pendente'
    refund_url = f'/api/v1/entries/{ana_entry}/refund-receipt'
    for headers in (ana, admin):
        response = http.put(refund_url, files=pdf_file(), headers=headers)
        assert (response.status_code, response.json()['detail']) == (
            403, 'Só o organizador do evento envia a devolução.')
    sent = http.put(refund_url, files=pdf_file(), headers=owner)
    assert sent.status_code == 201, sent.text
    organizer_entry = sent.json()
    assert organizer_entry['refund']['kind'] == 'devolucao' and organizer_entry['refund']['auto_confirm_at']
    assert organizer_entry['registered_by']['username'] and organizer_entry['state'] == 'devolucao_pendente'
    again = http.put(refund_url, files=pdf_file(), headers=owner)
    assert (again.status_code, again.json()['detail']) == (
        409, 'A devolução já foi enviada; aguarde a resposta do participante.')
    receipt_id = organizer_entry['refund']['id']
    assert [item['payload']['receipt_id'] for item in notifications(http, ana, 'devolucao_enviada')] == [receipt_id]
    assert http.get(f'/api/v1/entries/{ana_entry}', headers=ana).json()['can_respond_refund'] is True

    confirmed = http.post(f'/api/v1/entries/{ana_entry}/refund-response', json={'response': 'confirmar'},
                          headers=ana)
    assert confirmed.status_code == 200
    assert (confirmed.json()['state'], confirmed.json()['refund']['participant_response']) == (
        'devolvida', 'confirmada')
    assert confirmed.json()['refunded_at'] is not None
    assert [item['payload']['automatic'] for item in notifications(http, owner, 'devolucao_confirmada')] == [False]
    assert [action for action, _ in audit_actions(db, 'entry_receipt', receipt_id)] == [
        'devolucao.enviada', 'devolucao.confirmada']
    late = http.post(f'/api/v1/entries/{ana_entry}/refund-response', json={'response': 'confirmar'}, headers=ana)
    assert (late.status_code, late.json()['detail']) == (409, 'Nenhuma devolução aguarda a sua resposta.')

    # Bia contests; the administration sends it back to the organizer and later keeps the second refund.
    assert http.put(f'/api/v1/entries/{bia_entry}/refund-receipt', files=image_file(), headers=owner).status_code == 201
    short = http.post(f'/api/v1/entries/{bia_entry}/refund-response',
                      json={'response': 'contestar', 'reason': 'não'}, headers=bia)
    assert (short.status_code, short.json()['detail']) == (422, 'Conte o que aconteceu com a devolução.')
    contested = http.post(f'/api/v1/entries/{bia_entry}/refund-response',
                          json={'response': 'contestar', 'reason': 'O Pix não caiu na minha conta.'}, headers=bia)
    assert contested.json()['state'] == 'devolucao_contestada'
    assert contested.json()['refund']['contest_reason'] == 'O Pix não caiu na minha conta.'
    assert len(notifications(http, owner, 'devolucao_contestada')) == 1
    assert len(notifications(http, admin, 'devolucao_contestada')) == 1
    blocked = http.put(f'/api/v1/entries/{bia_entry}/refund-receipt', files=pdf_file(), headers=owner)
    assert (blocked.status_code, blocked.json()['detail']) == (409, 'Esta inscrição não aguarda devolução.')

    assert http.get('/api/v1/admin/refund-disputes', headers=owner).status_code == 403
    queue = http.get('/api/v1/admin/refund-disputes', headers=admin).json()
    assert [item['entry']['id'] for item in queue['items']] == [bia_entry] and queue['next_cursor'] is None
    dispute = queue['items'][0]
    assert dispute['organizer']['id'] == owner_id and dispute['event']['state'] == 'cancelado'
    assert dispute['entry']['refund']['participant_response'] == 'contestada' and dispute['contested_at']
    first_refund = dispute['entry']['refund']['id']
    assert http.get(dispute['entry']['refund']['file_url'], headers=admin).status_code == 200
    assert http.get(dispute['entry']['refund']['file_url'], headers=ana).status_code == 404

    decision_url = f'/api/v1/admin/entries/{bia_entry}/refund-decision'
    not_contested = http.post(f'/api/v1/admin/entries/{ana_entry}/refund-decision',
                              json={'decision': 'devolvida', 'reason': 'Comprovante legível.'}, headers=admin)
    assert (not_contested.status_code, not_contested.json()['detail']) == (409, 'Esta devolução não está contestada.')
    assert http.post('/api/v1/admin/entries/999999/refund-decision', json={'decision': 'devolvida', 'reason': 'Teste ok'},
                     headers=admin).status_code == 404
    vague = http.post(decision_url, json={'decision': 'pendente', 'reason': 'ok'}, headers=admin)
    assert (vague.status_code, vague.json()['detail']) == (422, 'Descreva a decisão.')
    assert http.post(decision_url, json={'decision': 'pendente', 'reason': 'Comprovante ilegível.'},
                     headers=bia).status_code == 403
    back = http.post(decision_url, json={'decision': 'pendente', 'reason': 'Comprovante ilegível.'}, headers=admin)
    assert back.status_code == 200, back.text
    assert back.json()['entry']['state'] == 'devolucao_pendente'
    assert (back.json()['entry']['refund']['resolution'], back.json()['entry']['refund']['resolution_reason']) == (
        'pendente', 'Comprovante ilegível.')
    decided = notifications(http, bia, 'devolucao_decidida') + notifications(http, owner, 'devolucao_decidida')
    assert [(item['payload']['decision'], item['actor']) for item in decided] == [('pendente', None)] * 2
    assert ('devolucao.decidida', {'entry_id': bia_entry, 'event_id': event.id, 'decision': 'pendente',
                                   'reason': 'Comprovante ilegível.'}) in audit_actions(db, 'entry_receipt',
                                                                                         first_refund)
    assert http.get('/api/v1/admin/refund-disputes', headers=admin).json()['items'] == []

    assert http.put(f'/api/v1/entries/{bia_entry}/refund-receipt', files=pdf_file(), headers=owner).status_code == 201
    http.post(f'/api/v1/entries/{bia_entry}/refund-response',
              json={'response': 'contestar', 'reason': 'Valor menor que o pago.'}, headers=bia)
    kept = http.post(decision_url, json={'decision': 'devolvida', 'reason': 'O extrato confirma o valor.'},
                     headers=admin)
    assert kept.json()['entry']['state'] == 'devolvida'
    assert db.get(EventEntry, bia_entry).refunded_at is not None
    history = http.get(f'/api/v1/entries/{bia_entry}/receipts', headers=bia).json()['items']
    assert [(item['participant_response'], item['resolution']) for item in history] == [
        ('contestada', 'devolvida'), ('contestada', 'pendente')]
    assert bia_id != admin_id

    # Caio did not answer for 7 days: the refund counts as received and the answer is closed.
    assert http.put(f'/api/v1/entries/{caio_entry}/refund-receipt', files=pdf_file(),
                    headers=owner).status_code == 201
    stale = db.query(EntryReceipt).filter(EntryReceipt.entry_id == caio_entry).one()
    stale.created_at = utcnow() - timedelta(days=7, minutes=1)
    db.flush()
    assert http.get(f'/api/v1/entries/{caio_entry}', headers=caio).json()['can_respond_refund'] is False
    closed = http.post(f'/api/v1/entries/{caio_entry}/refund-response', json={'response': 'confirmar'},
                       headers=caio)
    assert (closed.status_code, closed.json()['detail']) == (409, 'Nenhuma devolução aguarda a sua resposta.')
    assert http.post(f'/api/v1/entries/{caio_entry}/refund-response', json={'response': 'confirmar'},
                     headers=owner).json()['detail'] == 'Só o atleta inscrito responde à devolução.'
    actives = http.get('/api/v1/me/entries', headers=caio).json()['items']
    assert [(item['id'], item['state']) for item in actives] == [(caio_entry, 'devolucao_pendente')]

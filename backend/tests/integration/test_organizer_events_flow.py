"""Eventos do organizador e decisões da administração no PostgreSQL (docs/decisoes/0003, seções 14 e 15).

Inscrições e comprovantes são criados direto no banco: as rotas do atleta pertencem a outra frente.
"""
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.events import EntryReceipt, Event, EventEntry, EventMessage
from app.models.identity import MediaObject, User
from app.models.notifications import Notification
from app.models.organizers import Organizer
from app.models.teams import Team, TeamMember
from app.schemas.organizer_events import ReceiptDecisionInput
from app.services import events, organizers
from tests.integration.team_helpers import CITY, audit_actions, register
from tests.integration.test_organizers_flow import run_together

ORGANIZER_ONLY = {'detail': 'Você precisa ser organizador para criar eventos.'}
NOT_FOUND = {'detail': 'Evento não encontrado.'}
PENDING_REVOCATION = {'detail': 'A administração está decidindo sobre este evento.'}


def now():
    return datetime.now(timezone.utc)


def organizer(http, db, email, name='Rafa Organiza', display_name='Liga do Cerrado'):
    headers, user_id = register(http, email, name)
    db.add(Organizer(user_id=user_id, display_name=display_name, approved_at=now()))
    db.commit()
    return headers, user_id


def admin(http, db, email='events-admin@example.com'):
    headers, user_id = register(http, email, 'Admin Arena')
    db.get(User, user_id).is_admin = True
    db.commit()
    return headers, user_id


def dates(days=10, closes=7):
    moment = now().replace(microsecond=0)
    return {'starts_at': (moment + timedelta(days=days)).isoformat(),
            'registration_closes_at': (moment + timedelta(days=closes)).isoformat()}


FREE_TENNIS = {'sport': 'tenis', 'competition_type': 'eliminacao_simples', 'capacity': 8, 'accepted_tiers': None,
               'city_id': CITY, 'venue': 'Clube do Lago', 'price_cents': 0}
PAID_FOOTBALL = {'sport': 'futebol', 'format': 'society', 'competition_type': 'todos_contra_todos', 'capacity': 10,
                 'accepted_tiers': ['ouro', 'prata'], 'city_id': CITY, 'venue': 'Arena Sudoeste', 'price_cents': 24000,
                 'pix_beneficiary': 'Rafa Nunes', 'pix_key_type': 'email', 'pix_key': ' Copa@Pix.com ',
                 'pix_instructions': 'Envie o comprovante pelo app.', 'contact': '(61) 99999-0000'}


def create(http, headers, **body):
    return http.post('/api/v1/organizer/events', json={'name': 'Copa do Lago', **body}, headers=headers)


def action(http, headers, event_id, name, body=None):
    return http.post(f'/api/v1/organizer/events/{event_id}/{name}', json=body or {}, headers=headers)


def detail(http, headers, event_id):
    response = http.get(f'/api/v1/organizer/events/{event_id}', headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def counts(http, headers):
    response = http.get('/api/v1/admin/queue-counts', headers=headers)
    assert response.status_code == 200
    return response.json()


def notes(db, user_id, type_):
    return list(db.scalars(select(Notification).where(Notification.user_id == user_id, Notification.type == type_)
                           .order_by(Notification.id)))


def published_event(db, owner_id, **values):
    moment = now()
    base = dict(organizer_user_id=owner_id, name='Copa Sudoeste Society', sport='futebol', format='society',
                competition_type='eliminacao_simples', capacity=8, city_id=CITY, venue='Arena Sudoeste',
                starts_at=moment + timedelta(days=10), registration_closes_at=moment + timedelta(days=7),
                price_cents=24000, pix_beneficiary='Rafa Nunes', pix_key_type='email', pix_key='copa@pix.com',
                state='publicado', published_at=moment - timedelta(days=1))
    base.update(values)
    event = Event(**base)
    db.add(event)
    db.commit()
    return event


def team(db, representative_id, *member_ids, name='Ferrugem FC'):
    item = Team(name=name, city_id=CITY, state='ativo')
    db.add(item)
    db.flush()
    db.add(TeamMember(team_id=item.id, user_id=representative_id, role='representante', joined_via='criacao'))
    for member_id in member_ids:
        db.add(TeamMember(team_id=item.id, user_id=member_id, role='membro', joined_via='convite'))
    db.commit()
    return item


def entry(db, event, state, *, until=None, **subject):
    moment = now()
    paid = event.price_cents > 0
    values = dict(event_id=event.id, state=state, price_cents=event.price_cents,
                  reserved_until=(until or moment + timedelta(hours=40)) if paid else None,
                  registered_by_id=subject.get('user_id'), created_at=moment - timedelta(hours=1))
    if state == 'confirmada':
        values['confirmed_at'] = moment
    if state == 'expirada':
        values['expired_at'] = moment
    if state == 'cancelada':
        values.update(cancelled_at=moment, cancel_origin='participante', cancelled_by_id=subject.get('user_id'))
    item = EventEntry(**values, **subject)
    db.add(item)
    db.commit()
    return item


def receipt(db, item, uploader_id, *, kind='pagamento', created_at=None, **decision):
    media = MediaObject(id=uuid.uuid4(), user_id=uploader_id, bucket='arena-media',
                        object_key=f'receipts/{uuid.uuid4()}.webp', content_type='image/webp', size_bytes=2048,
                        width=10, height=10)
    db.add(media)
    db.flush()
    row = EntryReceipt(entry_id=item.id, kind=kind, media_id=media.id, uploaded_by_id=uploader_id,
                       created_at=created_at or now(), **decision)
    db.add(row)
    db.commit()
    return row


def test_draft_checklist_free_event_publishes_and_edits_after_publication(client):
    http, db = client
    athlete, _ = register(http, 'events-athlete@example.com')
    assert create(http, athlete).json() == ORGANIZER_ONLY
    assert http.get('/api/v1/organizer/events', headers=athlete).json() == {'items': [], 'next_cursor': None}
    owner, owner_id = organizer(http, db, 'events-owner@example.com')
    wrong = create(http, owner, price_cents=5000, pix_key_type='telefone', pix_key='123')
    assert wrong.status_code == 422
    assert wrong.json()['fields'] == [{'field': 'pix_key', 'message': 'Informe o telefone com DDD.'}]

    created = create(http, owner)
    assert created.status_code == 201, created.text
    draft = created.json()
    event_id = draft['id']
    assert (draft['state'], draft['phase'], draft['can_submit'], draft['pix']) == ('rascunho', 'rascunho', False, None)
    assert [item['key'] for item in draft['checklist'] if not item['done']] == [
        'nome_modalidade', 'formato_tipo', 'vagas_elos', 'datas', 'local', 'inscricao']
    assert draft['next_action'] == {'kind': 'completar_rascunho', 'count': None, 'deadline': None}
    assert draft['editable_fields'][0] == 'name' and draft['entries_by_state'] == {}

    incomplete = action(http, owner, event_id, 'submit')
    assert incomplete.status_code == 422
    assert incomplete.json()['detail'] == 'Complete o rascunho para publicar.'
    assert [field['field'] for field in incomplete.json()['fields']][0] == 'nome_modalidade'

    patch = lambda **body: http.patch(f'/api/v1/organizer/events/{event_id}', json=body, headers=owner)  # noqa: E731
    assert patch(city_id=999).json() == {'detail': 'Selecione uma cidade do catálogo.'}
    inverted = dates(days=3, closes=5)
    assert patch(**inverted).json() == {'detail': 'As inscrições precisam fechar antes do início do evento.'}
    wrong_key = patch(price_cents=5000, pix_key_type='cpf', pix_key='111.111.111-11')
    assert wrong_key.status_code == 422
    assert wrong_key.json()['fields'] == [{'field': 'pix_key', 'message': 'Informe um CPF válido.'}]
    assert patch().status_code == 422
    assert patch(owner_id=1).status_code == 422

    ready = patch(**FREE_TENNIS, **dates(), course_notes='Ignorado fora da corrida')
    assert ready.status_code == 200, ready.text
    body = ready.json()
    assert body['can_submit'] and body['next_action']['kind'] == 'publicar' and body['course_notes'] is None
    assert body['tennis_bonus'] == {'champion': 40, 'runner_up': 20, 'semifinalist': 10, 'min_entries': 4,
                                    'applies': False}

    published = action(http, owner, event_id, 'submit')
    assert published.status_code == 200, published.text
    body = published.json()
    assert (body['state'], body['phase'], body['published_at'] is not None) == ('publicado', 'inscricoes_abertas', True)
    assert body['checklist'] == [] and body['editable_fields'] == ['venue', 'course_notes', 'pix_instructions',
                                                                   'contact']
    assert body['next_action']['kind'] == 'acompanhar_inscricoes'
    assert action(http, owner, event_id, 'submit').json() == {'detail': 'Só rascunhos podem ser enviados.'}
    assert patch(name='Outro nome').json() == {
        'detail': 'Depois de publicado, só local, percurso, instruções e contato podem mudar.'}
    assert patch(venue=None).json() == {'detail': 'Informe o local com 2 a 120 caracteres.'}
    moved = patch(venue='Clube do Lago, quadra 2')
    assert moved.status_code == 200 and moved.json()['venue'] == 'Clube do Lago, quadra 2'
    assert patch(venue='Clube do Lago, quadra 2').status_code == 200
    assert http.delete(f'/api/v1/organizer/events/{event_id}', headers=owner).json() == {
        'detail': 'Só rascunhos podem ser excluídos.'}
    assert [name for name, _ in audit_actions(db, 'event', event_id)] == [
        'evento.criado', 'evento.editado', 'evento.publicado', 'evento.editado']

    other = create(http, owner, name='Rascunho descartado').json()
    listed = http.get('/api/v1/organizer/events?scope=abertos', headers=owner).json()
    # Dated events first, then the undated draft.
    assert [item['id'] for item in listed['items']] == [event_id, other['id']] and listed['next_cursor'] is None
    assert listed['items'][0]['pending']['total'] == 0
    assert http.delete(f"/api/v1/organizer/events/{other['id']}", headers=owner).status_code == 204
    assert db.get(Event, other['id']) is None
    assert [name for name, _ in audit_actions(db, 'event', other['id'])] == ['evento.criado',
                                                                            'evento.rascunho_excluido']
    assert http.get('/api/v1/organizer/events?scope=encerrados', headers=owner).json()['items'] == []
    assert notes(db, owner_id, 'evento_para_aprovar') == []


def test_paid_event_goes_through_review_refusal_resubmission_and_approval(client):
    http, db = client
    staff, staff_id = admin(http, db)
    owner, owner_id = organizer(http, db, 'paid-owner@example.com')
    draft = create(http, owner, **PAID_FOOTBALL, **dates()).json()
    event_id = draft['id']
    assert draft['pix'] == {'beneficiary': 'Rafa Nunes', 'key_type': 'email', 'key': 'copa@pix.com',
                            'copy_paste': None, 'instructions': 'Envie o comprovante pelo app.'}
    assert draft['accepted_tiers'] == ['prata', 'ouro'] and draft['can_submit']

    sent = action(http, owner, event_id, 'submit')
    assert sent.status_code == 200, sent.text
    assert (sent.json()['state'], sent.json()['next_action']['kind']) == ('em_aprovacao', 'aguardar_aprovacao')
    alert = notes(db, staff_id, 'evento_para_aprovar')
    assert [(item.actor_id, item.payload) for item in alert] == [
        (owner_id, {'event_id': event_id, 'event_name': 'Copa do Lago'})]
    assert counts(http, staff) == {'organizer_requests': 0, 'reports': 0, 'paid_events': 1, 'revoked_events': 0,
                                   'refund_disputes': 0,
                                   'court_suggestions': 0, 'walkover_disputes': 0}
    assert http.patch(f'/api/v1/organizer/events/{event_id}', json={'venue': 'Outro'}, headers=owner).json() == {
        'detail': 'Retire o evento da aprovação para editar.'}

    queue = http.get('/api/v1/admin/events?queue=em_aprovacao', headers=staff).json()
    assert [item['id'] for item in queue['items']] == [event_id]
    sheet = queue['items'][0]
    assert sheet['organizer']['display_name'] == 'Liga do Cerrado' and sheet['organizer']['active']
    assert sheet['pix']['key'] == 'copa@pix.com' and sheet['contact'] == '(61) 99999-0000'
    assert http.get(f'/api/v1/admin/events/{event_id}', headers=staff).json() == sheet
    assert http.get('/api/v1/admin/events', headers=owner).json() == {'detail': 'Acesso administrativo necessário.'}
    assert http.get('/api/v1/admin/events/999999', headers=staff).json() == NOT_FOUND
    assert http.post('/api/v1/admin/events/999999/decision', json={'decision': 'aprovar'},
                     headers=staff).json() == NOT_FOUND
    assert http.post('/api/v1/admin/events/999999/revocation-decision', json={'decision': 'seguir'},
                     headers=staff).json() == NOT_FOUND

    decide = lambda **body: http.post(f'/api/v1/admin/events/{event_id}/decision', json=body,  # noqa: E731
                                      headers=staff)
    assert decide(decision='recusar').json() == {'detail': 'Escolha o motivo da recusa.'}
    assert decide(decision='recusar', reason_code='outro', reason_detail='ruim').json() == {
        'detail': 'Descreva o motivo da recusa.'}
    refused = decide(decision='recusar', reason_code='pix_incompleto', reason_detail='Falta o Copia e Cola.')
    assert refused.status_code == 200, refused.text
    assert refused.json()['state'] == 'rascunho'
    assert decide(decision='aprovar').json() == {'detail': 'Este evento já foi decidido.'}
    body = detail(http, owner, event_id)
    assert body['refusal']['reason_code'] == 'pix_incompleto' and body['next_action']['kind'] == 'corrigir_recusa'
    assert body['refusal']['reason_detail'] == 'Falta o Copia e Cola.' and body['submitted_at'] is None
    decided = notes(db, owner_id, 'evento_decidido')
    assert decided[-1].actor_id is None and decided[-1].payload['decision'] == 'recusado'
    assert decided[-1].payload['reason_code'] == 'pix_incompleto'

    fixed = http.patch(f'/api/v1/organizer/events/{event_id}', json={'pix_copy_paste': '00020126...'}, headers=owner)
    assert fixed.status_code == 200 and fixed.json()['refusal'] is not None
    resent = action(http, owner, event_id, 'submit').json()
    assert resent['state'] == 'em_aprovacao' and resent['refusal'] is None
    withdrawn = action(http, owner, event_id, 'withdraw').json()
    assert withdrawn['state'] == 'rascunho' and withdrawn['submitted_at'] is None
    assert action(http, owner, event_id, 'withdraw').json() == {'detail': 'Este evento não está em aprovação.'}
    action(http, owner, event_id, 'submit')

    approved = decide(decision='aprovar')
    assert approved.status_code == 200, approved.text
    assert (approved.json()['state'], approved.json()['phase']) == ('publicado', 'inscricoes_abertas')
    assert notes(db, owner_id, 'evento_decidido')[-1].payload['decision'] == 'aprovado'
    assert counts(http, staff)['paid_events'] == 0
    actions = [name for name, _ in audit_actions(db, 'event', event_id)]
    assert actions == ['evento.criado', 'evento.enviado', 'evento.recusado', 'evento.editado', 'evento.enviado',
                       'evento.retirado', 'evento.enviado', 'evento.aprovado']

    # Approving after the registration deadline sends the organizer back to fix the dates.
    late = published_event(db, owner_id, state='em_aprovacao', published_at=None, submitted_at=now(),
                           starts_at=now() + timedelta(hours=6), registration_closes_at=now() + timedelta(hours=1))
    response = http.post(f'/api/v1/admin/events/{late.id}/decision', json={'decision': 'aprovar'}, headers=staff)
    assert response.json() == {'detail': 'As datas deste evento já passaram. Recuse para o organizador corrigir.'}


def test_only_the_owner_manages_and_only_organizers_create_or_submit(client):
    http, db = client
    owner, owner_id = organizer(http, db, 'owner-a@example.com')
    rival, _ = organizer(http, db, 'owner-b@example.com', display_name='Liga Rival')
    athlete, _ = register(http, 'plain-athlete@example.com')
    event_id = create(http, owner, **FREE_TENNIS, **dates()).json()['id']

    for headers in (rival, athlete):
        assert http.get(f'/api/v1/organizer/events/{event_id}', headers=headers).json() == NOT_FOUND
        assert http.patch(f'/api/v1/organizer/events/{event_id}', json={'venue': 'X Y'},
                          headers=headers).status_code in (403, 404)
        assert http.delete(f'/api/v1/organizer/events/{event_id}', headers=headers).json() == NOT_FOUND
        assert action(http, headers, event_id, 'withdraw').json() == NOT_FOUND
        assert action(http, headers, event_id, 'cancel', {'reason': 'Chuva forte'}).json() == NOT_FOUND
        assert http.get(f'/api/v1/organizer/events/{event_id}/entries', headers=headers).json() == NOT_FOUND
        assert http.get(f'/api/v1/organizer/events/{event_id}/receipts', headers=headers).json() == NOT_FOUND
    assert action(http, rival, event_id, 'submit').json() == NOT_FOUND
    assert action(http, athlete, event_id, 'submit').json() == ORGANIZER_ONLY
    assert http.patch(f'/api/v1/organizer/events/{event_id}', json={'venue': 'X Y'}, headers=athlete).json() == \
        NOT_FOUND
    assert http.get('/api/v1/organizer/events', headers=rival).json()['items'] == []

    # A revoked organizer keeps reading the draft but can no longer edit or send it.
    permission = db.scalar(select(Organizer).where(Organizer.user_id == owner_id))
    permission.revoked_at, permission.revoke_reason = now(), 'Revogado no teste'
    db.commit()
    body = detail(http, owner, event_id)
    assert body['editable_fields'] == [] and body['can_submit'] is False
    assert http.patch(f'/api/v1/organizer/events/{event_id}', json={'venue': 'Clube'}, headers=owner).json() == \
        ORGANIZER_ONLY
    assert action(http, owner, event_id, 'submit').json() == ORGANIZER_ONLY
    assert create(http, owner).json() == ORGANIZER_ONLY
    assert http.delete(f'/api/v1/organizer/events/{event_id}', headers=owner).status_code == 204


def test_receipt_decisions_refuse_with_reason_and_keep_previous_uploads(client):
    http, db = client
    staff, _ = admin(http, db)
    owner, owner_id = organizer(http, db, 'receipts-owner@example.com')
    runner, runner_id = register(http, 'receipts-runner@example.com', 'Ana Corredora')
    stranger, _ = register(http, 'receipts-stranger@example.com')
    event = published_event(db, owner_id, name='Corrida do Lago', sport='corrida', format=None,
                            competition_type=None, distance_km=10, capacity=150, price_cents=6000)
    item = entry(db, event, 'em_analise', user_id=runner_id)
    first = receipt(db, item, runner_id, created_at=now() - timedelta(minutes=30))

    poster = detail(http, owner, event.id)
    assert (poster['entries_count'], poster['confirmed_count'], poster['entries_by_state']) == (
        1, 0, {'em_analise': 1})
    page = http.get(f'/api/v1/organizer/events/{event.id}/receipts', headers=owner).json()
    assert [(row['receipt']['id'], row['attempt'], row['previous']) for row in page['items']] == [(first.id, 1, [])]
    row = page['items'][0]
    assert row['receipt']['file_url'] == f'/api/v1/receipts/{first.id}/file'
    assert row['receipt']['file_type'] == 'imagem' and row['entry']['subject']['athlete']['id'] == runner_id
    assert row['entry']['state'] == 'em_analise' and row['entry']['latest_payment']['id'] == first.id
    assert detail(http, owner, event.id)['next_action'] == {'kind': 'analisar_comprovantes', 'count': 1,
                                                           'deadline': None}
    assert http.get(f'/api/v1/organizer/events/{event.id}/receipts', headers=staff).status_code == 200

    decide = lambda headers, **body: http.post(f'/api/v1/receipts/{first.id}/decision',  # noqa: E731
                                               json=body, headers=headers)
    only_owner = {'detail': 'Só o organizador do evento decide os comprovantes.'}
    assert decide(staff, decision='aprovar').json() == only_owner
    assert decide(runner, decision='aprovar').json() == only_owner
    assert decide(stranger, decision='aprovar').json() == {'detail': 'Comprovante não encontrado.'}
    assert http.post('/api/v1/receipts/999999/decision', json={'decision': 'aprovar'}, headers=owner).json() == {
        'detail': 'Comprovante não encontrado.'}
    assert decide(owner, decision='recusar').json() == {'detail': 'Escolha o motivo da recusa.'}
    assert decide(owner, decision='recusar', reason_code='outro').json() == {'detail': 'Descreva o motivo da recusa.'}

    refused = decide(owner, decision='recusar', reason_code='valor_diferente', reason_detail='Faltaram R$ 10.')
    assert refused.status_code == 200, refused.text
    assert refused.json()['receipt']['decision'] == 'recusado' and refused.json()['entry']['state'] == 'rejeitada'
    assert decide(owner, decision='aprovar').json() == {'detail': 'Este comprovante já foi decidido.'}
    sent = notes(db, runner_id, 'comprovante_decidido')
    assert sent[-1].actor_id == owner_id and sent[-1].payload['decision'] == 'recusado'
    assert sent[-1].payload['reason_code'] == 'valor_diferente' and sent[-1].payload['reserved_until']

    # The athlete sends another one (E2's route), keeping the refused upload.
    item.state = 'em_analise'
    db.commit()
    second = receipt(db, item, runner_id)
    page = http.get(f'/api/v1/organizer/events/{event.id}/receipts?tab=para_analisar', headers=owner).json()
    assert [(row['receipt']['id'], row['attempt']) for row in page['items']] == [(second.id, 2)]
    assert [previous['id'] for previous in page['items'][0]['previous']] == [first.id]
    assert page['items'][0]['previous'][0]['reason_detail'] == 'Faltaram R$ 10.'

    approved = http.post(f'/api/v1/receipts/{second.id}/decision', json={'decision': 'aprovar'}, headers=owner)
    assert approved.status_code == 200, approved.text
    assert approved.json()['entry']['state'] == 'confirmada' and approved.json()['attempt'] == 2
    db.refresh(item)
    assert item.state == 'confirmada' and item.confirmed_at is not None
    decided = http.get(f'/api/v1/organizer/events/{event.id}/receipts?tab=decididos', headers=owner).json()
    assert [row['receipt']['id'] for row in decided['items']] == [second.id, first.id]
    entries = http.get(f'/api/v1/organizer/events/{event.id}/entries', headers=owner).json()['items']
    assert [(row['id'], row['state'], row['latest_payment']['id']) for row in entries] == [
        (item.id, 'confirmada', second.id)]
    assert http.get(f'/api/v1/organizer/events/{event.id}/entries?state=confirmada',
                    headers=staff).json()['items'][0]['id'] == item.id
    assert [name for name, _ in audit_actions(db, 'entry_receipt', first.id)] == ['comprovante.recusado']
    assert [name for name, _ in audit_actions(db, 'entry_receipt', second.id)] == ['comprovante.aprovado']

    # A refusal after the reservation ended frees the spot at once; a team's representatives are told.
    rep, rep_id = register(http, 'receipts-rep@example.com', 'Rep do Time')
    _, member_id = register(http, 'receipts-member@example.com', 'Membro do Time')
    football = published_event(db, owner_id)
    squad = team(db, rep_id, member_id)
    late = entry(db, football, 'em_analise', until=now() - timedelta(minutes=5), team_id=squad.id)
    late_receipt = receipt(db, late, rep_id)
    response = http.post(f'/api/v1/receipts/{late_receipt.id}/decision',
                         json={'decision': 'recusar', 'reason_code': 'fora_do_prazo'}, headers=owner)
    assert response.json()['entry']['state'] == 'expirada'
    assert response.json()['entry']['subject']['team']['initials'] == 'FF'
    assert len(notes(db, rep_id, 'comprovante_decidido')) == 1 and notes(db, member_id, 'comprovante_decidido') == []
    told = notes(db, rep_id, 'comprovante_decidido')[0].payload
    assert (told['reserved_until'], told['entry_state']) == (None, 'expirada')
    lapsed = http.get(f'/api/v1/organizer/events/{football.id}/entries?state=expirada', headers=owner).json()
    assert [row['id'] for row in lapsed['items']] == [late.id]


def test_cancelling_with_paid_entries_opens_refunds_and_posts_the_notice(client):
    http, db = client
    owner, owner_id = organizer(http, db, 'cancel-owner@example.com')
    users = {label: register(http, f'cancel-{label}@example.com', f'Atleta {label}') for label in
             ('rep1', 'member1', 'rep2', 'rep3', 'rep4', 'rep5')}
    ids = {label: value[1] for label, value in users.items()}
    event = published_event(db, owner_id)
    paid = entry(db, event, 'confirmada', team_id=team(db, ids['rep1'], ids['member1'], name='Time Um').id)
    analysing = entry(db, event, 'em_analise', team_id=team(db, ids['rep2'], name='Time Dois').id)
    reserved = entry(db, event, 'reservada', team_id=team(db, ids['rep3'], name='Time Tres').id)
    lapsed = entry(db, event, 'reservada', until=now() - timedelta(hours=1),
                   team_id=team(db, ids['rep4'], name='Time Quatro').id)
    gone = entry(db, event, 'expirada', team_id=team(db, ids['rep5'], name='Time Cinco').id)
    pending_receipt = receipt(db, analysing, ids['rep2'])
    running = http.get(f'/api/v1/organizer/events/{event.id}/entries?state=reservada', headers=owner).json()
    assert [row['id'] for row in running['items']] == [reserved.id]

    assert action(http, owner, event.id, 'cancel', {'reason': 'ruim'}).json() == {
        'detail': 'Descreva o motivo do cancelamento.'}
    response = action(http, owner, event.id, 'cancel', {'reason': 'Chuva forte no fim de semana'})
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body['state'], body['phase'], body['cancel_reason']) == ('cancelado', 'cancelado',
                                                                     'Chuva forte no fim de semana')
    assert body['pending'] == {'receipts': 0, 'refunds_to_send': 2, 'refunds_awaiting': 0, 'refund_disputes': 0,
                               'total': 2}
    assert body['next_action'] == {'kind': 'enviar_devolucoes', 'count': 2, 'deadline': None}
    assert body['entries_by_state'] == {'devolucao_pendente': 2, 'cancelada': 1, 'expirada': 2}
    for item in (paid, analysing, reserved, lapsed, gone):
        db.refresh(item)
    assert (paid.state, analysing.state, reserved.state, lapsed.state, gone.state) == (
        'devolucao_pendente', 'devolucao_pendente', 'cancelada', 'expirada', 'expirada')
    assert (reserved.cancel_origin, reserved.cancelled_by_id) == ('evento', owner_id)
    assert http.post(f'/api/v1/receipts/{pending_receipt.id}/decision', json={'decision': 'aprovar'},
                     headers=owner).json() == {'detail': 'Esta inscrição não está em análise.'}

    cancelled = {user_id: notes(db, user_id, 'evento_cancelado') for user_id in ids.values()}
    assert [item.payload['refund'] for item in cancelled[ids['rep1']]] == [True]
    assert [item.payload['refund'] for item in cancelled[ids['member1']]] == [True]
    assert [item.payload['refund'] for item in cancelled[ids['rep3']]] == [False]
    assert cancelled[ids['rep4']] == [] and cancelled[ids['rep5']] == []
    assert cancelled[ids['rep1']][0].actor_id == owner_id
    assert len(notes(db, ids['rep4'], 'reserva_expirada')) == 1

    member = users['member1'][0]
    channel = http.get(f'/api/v1/events/{event.id}/messages', headers=member).json()
    assert [(item['kind'], item['body'], item['author']['id']) for item in channel['items']] == [
        ('evento_cancelado', 'Chuva forte no fim de semana', owner_id)]
    assert http.get(f'/api/v1/events/{event.id}/messages', headers=users['rep4'][0]).json() == {
        'detail': 'Os avisos são só para os inscritos do evento.'}
    assert action(http, owner, event.id, 'cancel', {'reason': 'De novo, por engano'}).json() == {
        'detail': 'Só eventos publicados ou em andamento podem ser cancelados.'}
    cancelled_audit = audit_actions(db, 'event', event.id)[-1]
    assert cancelled_audit[0] == 'evento.cancelado'
    assert (cancelled_audit[1]['refunds'], cancelled_audit[1]['cancelled'], cancelled_audit[1]['expired']) == (2, 1, 1)
    listed = http.get('/api/v1/organizer/events?scope=encerrados', headers=owner).json()
    assert [item['id'] for item in listed['items']] == [event.id] and listed['items'][0]['pending']['total'] == 2

    # One refund sent and waiting for the participant, the other contested: nothing left to send.
    sent = receipt(db, paid, owner_id, kind='devolucao')
    body = detail(http, owner, event.id)
    assert body['pending'] == {'receipts': 0, 'refunds_to_send': 1, 'refunds_awaiting': 1, 'refund_disputes': 0,
                               'total': 1}
    refunds = http.get(f'/api/v1/organizer/events/{event.id}/entries?state=devolucao_pendente', headers=owner).json()
    assert [(row['id'], row['refund'] and row['refund']['id']) for row in refunds['items']] == [
        (paid.id, sent.id), (analysing.id, None)]
    assert refunds['items'][0]['refund']['auto_confirm_at'] is not None
    analysing.state = 'devolucao_contestada'
    db.commit()
    body = detail(http, owner, event.id)
    assert body['pending'] == {'receipts': 0, 'refunds_to_send': 0, 'refunds_awaiting': 1, 'refund_disputes': 1,
                               'total': 0}
    assert body['next_action'] == {'kind': 'aguardar_devolucoes', 'count': 2, 'deadline': None}


def test_revocation_suspends_open_events_until_the_administration_decides(client):
    http, db = client
    staff, _ = admin(http, db)
    owner, owner_id = organizer(http, db, 'revoked-owner@example.com')
    runner, runner_id = register(http, 'revoked-runner@example.com', 'Ana Corredora')
    draft = create(http, owner).json()
    reviewing = create(http, owner, name='Copa em análise', **PAID_FOOTBALL, **dates()).json()
    action(http, owner, reviewing['id'], 'submit')
    keep = published_event(db, owner_id, name='Torneio que segue', price_cents=0, pix_beneficiary=None,
                           pix_key_type=None, pix_key=None, sport='tenis', format=None)
    stop = published_event(db, owner_id, name='Corrida que para', sport='corrida', format=None,
                           competition_type=None, distance_km=5, capacity=100, price_cents=5000,
                           starts_at=now() + timedelta(days=20))
    paid_runner = entry(db, stop, 'confirmada', user_id=runner_id)
    permission = db.scalar(select(Organizer).where(Organizer.user_id == owner_id))

    revoked = http.post(f'/api/v1/admin/organizers/{permission.id}/revoke', json={'reason': 'Denúncias graves'},
                        headers=staff)
    assert revoked.status_code == 204, revoked.text
    assert detail(http, owner, reviewing['id'])['state'] == 'rascunho'
    assert detail(http, owner, draft['id'])['state'] == 'rascunho'
    suspended = detail(http, owner, keep.id)
    assert suspended['revocation_pending'] and suspended['revocation_decision'] == 'pendente'
    assert suspended['next_action']['kind'] == 'aguardar_revogacao' and suspended['editable_fields'] == []
    assert ('evento.retirado', {'automatico': True, 'organizer_id': permission.id}) in audit_actions(
        db, 'event', reviewing['id'])
    assert audit_actions(db, 'event', keep.id)[-1][0] == 'evento.revogacao_pendente'
    assert counts(http, staff) == {'organizer_requests': 0, 'reports': 0, 'paid_events': 0, 'revoked_events': 2,
                                   'refund_disputes': 0,
                                   'court_suggestions': 0, 'walkover_disputes': 0}

    assert http.patch(f'/api/v1/organizer/events/{keep.id}', json={'venue': 'Clube'}, headers=owner).json() == \
        PENDING_REVOCATION
    assert action(http, owner, keep.id, 'cancel', {'reason': 'Quero cancelar'}).json() == PENDING_REVOCATION
    assert http.post(f'/api/v1/events/{keep.id}/messages', json={'body': 'Oi'}, headers=owner).json() == \
        PENDING_REVOCATION

    queue = http.get('/api/v1/admin/events?queue=revogacao', headers=staff).json()
    assert [item['id'] for item in queue['items']] == [keep.id, stop.id]
    assert queue['items'][1]['organizer']['active'] is False
    assert queue['items'][1]['entries_by_state'] == {'confirmada': 1}

    decide = lambda event_id, **body: http.post(  # noqa: E731
        f'/api/v1/admin/events/{event_id}/revocation-decision', json=body, headers=staff)
    assert decide(draft['id'], decision='seguir').json() == {
        'detail': 'Este evento não aguarda decisão da administração.'}
    kept = decide(keep.id, decision='seguir')
    assert kept.status_code == 200 and kept.json()['revocation_decision'] == 'seguir'
    assert kept.json()['phase'] == 'inscricoes_abertas' and not kept.json()['revocation_pending']
    assert http.patch(f'/api/v1/organizer/events/{keep.id}', json={'venue': 'Clube'}, headers=owner).status_code == 200
    assert notes(db, owner_id, 'evento_revogacao_decidida')[-1].payload['decision'] == 'seguir'

    assert decide(stop.id, decision='cancelar').json() == {'detail': 'Descreva o motivo do cancelamento.'}
    stopped = decide(stop.id, decision='cancelar', reason='Organizador revogado; devolução por Pix.')
    assert stopped.status_code == 200, stopped.text
    assert (stopped.json()['state'], stopped.json()['revocation_decision']) == ('cancelado', 'cancelado')
    assert stopped.json()['pending']['refunds_to_send'] == 1
    db.refresh(paid_runner)
    assert paid_runner.state == 'devolucao_pendente'
    warned = notes(db, runner_id, 'evento_cancelado')
    assert [(item.actor_id, item.payload['refund']) for item in warned] == [(None, True)]
    notice = db.scalar(select(EventMessage).where(EventMessage.event_id == stop.id))
    assert (notice.kind, notice.author_id) == ('evento_cancelado', None)
    assert notes(db, owner_id, 'evento_revogacao_decidida')[-1].payload['decision'] == 'cancelado'
    assert [name for name, _ in audit_actions(db, 'event', stop.id)][-2:] == ['evento.cancelado',
                                                                             'evento.revogacao_decidida']
    assert counts(http, staff)['revoked_events'] == 0
    # The organizer still sends the refunds of the cancelled event: management of it stays readable.
    assert detail(http, owner, stop.id)['next_action']['kind'] == 'enviar_devolucoes'
    assert http.get(f'/api/v1/events/{stop.id}/messages', headers=runner).status_code == 200


def test_notice_channel_is_written_by_the_owner_and_read_by_participants(client):
    http, db = client
    staff, _ = admin(http, db)
    owner, owner_id = organizer(http, db, 'channel-owner@example.com')
    accounts = {label: register(http, f'channel-{label}@example.com', f'Atleta {label}') for label in
                ('ana', 'bia', 'caio', 'dani', 'rep', 'member', 'stranger')}
    ids = {label: value[1] for label, value in accounts.items()}
    event = published_event(db, owner_id, sport='tenis', format=None)
    entry(db, event, 'confirmada', user_id=ids['ana'])
    entry(db, event, 'cancelada', user_id=ids['bia'])
    entry(db, event, 'expirada', user_id=ids['caio'])
    # A lapsed reservation reads as expired before the sweep runs: no channel either.
    entry(db, event, 'reservada', until=now() - timedelta(minutes=1), user_id=ids['dani'])
    entry(db, event, 'confirmada', team_id=team(db, ids['rep'], ids['member']).id)

    assert http.post(f'/api/v1/events/{event.id}/messages', json={'body': '   '}, headers=owner).json() == {
        'detail': 'Escreva o aviso (até 1000 caracteres).'}
    posted = http.post(f'/api/v1/events/{event.id}/messages', json={'body': ' Chegar 30 min antes. '}, headers=owner)
    assert posted.status_code == 201, posted.text
    assert (posted.json()['kind'], posted.json()['body'], posted.json()['author']['id']) == (
        'aviso', 'Chegar 30 min antes.', owner_id)
    told = {label for label, user_id in ids.items() if notes(db, user_id, 'aviso_evento')}
    assert told == {'ana', 'rep', 'member'}
    assert notes(db, owner_id, 'aviso_evento') == []

    for label in ('ana', 'rep', 'member'):
        page = http.get(f'/api/v1/events/{event.id}/messages', headers=accounts[label][0]).json()
        assert [item['id'] for item in page['items']] == [posted.json()['id']]
    assert http.get(f'/api/v1/events/{event.id}/messages', headers=staff).status_code == 200
    for label in ('bia', 'caio', 'dani', 'stranger'):
        assert http.get(f'/api/v1/events/{event.id}/messages', headers=accounts[label][0]).json() == {
            'detail': 'Os avisos são só para os inscritos do evento.'}
    # The athlete's D2 uses the same rule (`events.can_read_channel`) for `can_read_messages`.
    readers = {label for label, (headers, _) in accounts.items()
               if http.get(f'/api/v1/events/{event.id}', headers=headers).json()['can_read_messages']}
    assert readers == {'ana', 'rep', 'member'}
    for headers in (owner, staff):
        assert http.get(f'/api/v1/events/{event.id}', headers=headers).json()['can_read_messages'] is True
    for headers in (accounts['ana'][0], staff):
        assert http.post(f'/api/v1/events/{event.id}/messages', json={'body': 'Oi'}, headers=headers).json() == {
            'detail': 'Só o organizador publica avisos.'}

    draft = create(http, owner).json()
    assert http.get(f"/api/v1/events/{draft['id']}/messages", headers=accounts['stranger'][0]).json() == NOT_FOUND
    assert http.post(f"/api/v1/events/{draft['id']}/messages", json={'body': 'Oi'},
                     headers=accounts['stranger'][0]).json() == NOT_FOUND
    assert http.get(f"/api/v1/events/{draft['id']}/messages", headers=owner).json() == {'items': [],
                                                                                      'next_cursor': None}
    assert http.post(f"/api/v1/events/{draft['id']}/messages", json={'body': 'Oi'}, headers=owner).json() == {
        'detail': 'Publique o evento antes de enviar avisos.'}
    assert http.get('/api/v1/events/999999/messages', headers=owner).json() == NOT_FOUND
    assert http.post('/api/v1/events/999999/messages', json={'body': 'Oi'}, headers=owner).json() == NOT_FOUND


def test_tennis_bonus_counts_only_confirmed_entries_in_both_views(client):
    """RN16 ("com 4 ou mais inscritos"): the organizer's G3 and the athlete's D2 apply the same rule, on the
    confirmed entries (reservations and receipts under analysis may still expire)."""
    http, db = client
    owner, owner_id = organizer(http, db, 'bonus-owner@example.com')
    viewer, _ = register(http, 'bonus-viewer@example.com', 'Atleta Visitante')
    players = [register(http, f'bonus-{index}@example.com', f'Atleta {index}')[1] for index in range(5)]
    event = published_event(db, owner_id, sport='tenis', format=None)
    for user_id in players[:3]:
        entry(db, event, 'confirmada', user_id=user_id)
    waiting = entry(db, event, 'em_analise', user_id=players[3])
    entry(db, event, 'reservada', user_id=players[4])

    def views():
        athlete_view = http.get(f'/api/v1/events/{event.id}', headers=viewer).json()
        return [(view['entries_count'], view['confirmed_count'], view['tennis_bonus']['applies'])
                for view in (athlete_view, detail(http, owner, event.id))]

    assert views() == [(5, 3, False)] * 2
    waiting.state, waiting.confirmed_at = 'confirmada', now()
    db.commit()
    assert views() == [(5, 4, True)] * 2


def test_queue_counts_include_paid_events_revocations_and_refund_disputes(client):
    http, db = client
    staff, _ = admin(http, db)
    _, owner_id = organizer(http, db, 'counts-owner@example.com')
    _, runner_id = register(http, 'counts-runner@example.com')
    assert counts(http, staff) == {'organizer_requests': 0, 'reports': 0, 'paid_events': 0, 'revoked_events': 0,
                                   'refund_disputes': 0,
                                   'court_suggestions': 0, 'walkover_disputes': 0}
    assert http.get('/api/v1/admin/events?queue=revogacao', headers=staff).json() == {'items': [],
                                                                                    'next_cursor': None}
    older = published_event(db, owner_id, state='em_aprovacao', published_at=None,
                            submitted_at=now() - timedelta(hours=2))
    newer = published_event(db, owner_id, state='em_aprovacao', published_at=None, submitted_at=now())
    first = http.get('/api/v1/admin/events?queue=em_aprovacao&limit=1', headers=staff).json()
    assert [item['id'] for item in first['items']] == [older.id] and first['next_cursor']
    second = http.get('/api/v1/admin/events', params={'queue': 'em_aprovacao', 'limit': 1,
                                                      'cursor': first['next_cursor']}, headers=staff).json()
    assert [item['id'] for item in second['items']] == [newer.id] and second['next_cursor'] is None
    newer.state, newer.submitted_at = 'rascunho', None
    db.commit()
    published_event(db, owner_id, revocation_decision='pendente')
    cancelled = published_event(db, owner_id, state='cancelado', cancelled_at=now(), cancel_reason='Chuva forte')
    entry(db, cancelled, 'devolucao_contestada', user_id=runner_id)
    assert counts(http, staff) == {'organizer_requests': 0, 'reports': 0, 'paid_events': 1, 'revoked_events': 1,
                                   'refund_disputes': 1,
                                   'court_suggestions': 0, 'walkover_disputes': 0}


def test_concurrent_decisions_cancellations_and_revocation_are_serialized(test_engine):
    """Real commits on separate connections: row locks let one receipt decision and one cancellation win, and a
    submission racing the revocation never leaves an event waiting for approval from a revoked organizer."""
    tag = uuid.uuid4().hex[:10]
    people = {label: User(name=f'Atleta {label}', username=f'{label}_{tag}', email=f'{label}-{tag}@example.com',
                          birth_date=date(1990, 1, 1), password_hash='x', is_admin=label == 'admin')
              for label in ('owner', 'runner', 'admin')}
    with Session(test_engine, expire_on_commit=False) as setup:
        setup.add_all(people.values())
        setup.flush()
        permission = Organizer(user_id=people['owner'].id, display_name='Liga Concorrente')
        setup.add(permission)
        moment = now()
        event = Event(organizer_user_id=people['owner'].id, name='Corrida Concorrente', sport='corrida',
                      distance_km=5, capacity=50, city_id=CITY, venue='Parque da Cidade',
                      starts_at=moment + timedelta(days=10), registration_closes_at=moment + timedelta(days=7),
                      price_cents=5000, pix_beneficiary='Rafa Nunes', pix_key_type='email', pix_key='a@pix.com',
                      state='publicado', published_at=moment)
        setup.add(event)
        setup.flush()
        item = EventEntry(event_id=event.id, user_id=people['runner'].id, state='em_analise', price_cents=5000,
                          reserved_until=moment + timedelta(hours=40))
        setup.add(item)
        setup.flush()
        media = MediaObject(id=uuid.uuid4(), user_id=people['runner'].id, bucket='arena-media',
                            object_key=f'receipts/{uuid.uuid4()}.pdf', content_type='application/pdf', size_bytes=9)
        setup.add(media)
        setup.flush()
        paid = EntryReceipt(entry_id=item.id, kind='pagamento', media_id=media.id, uploaded_by_id=people['runner'].id)
        setup.add(paid)
        draft = Event(organizer_user_id=people['owner'].id, name='Copa Concorrente', sport='tenis',
                      competition_type='eliminacao_simples', capacity=8, city_id=CITY, venue='Clube do Lago',
                      starts_at=moment + timedelta(days=10), registration_closes_at=moment + timedelta(days=7),
                      price_cents=4000, pix_beneficiary='Rafa Nunes', pix_key_type='email', pix_key='a@pix.com')
        setup.add(draft)
        setup.commit()
    owner_id, admin_id = people['owner'].id, people['admin'].id
    try:
        def decide(body):
            def run():
                with Session(test_engine, expire_on_commit=False) as db:
                    events.decide_receipt(db, db.get(User, owner_id), paid.id, ReceiptDecisionInput(**body))
            return run

        assert run_together(decide({'decision': 'aprovar'}),
                            decide({'decision': 'recusar', 'reason_code': 'valor_diferente'})) == [200, 409]

        def cancel():
            with Session(test_engine, expire_on_commit=False) as db:
                events.cancel_owned_event(db, db.get(User, owner_id), event.id, 'Parque fechado pela prefeitura')

        assert run_together(cancel, cancel) == [200, 409]

        def submit():
            with Session(test_engine, expire_on_commit=False) as db:
                events.submit_event(db, db.get(User, owner_id), draft.id)

        def revoke():
            with Session(test_engine, expire_on_commit=False) as db:
                organizers.revoke(db, db.get(User, admin_id), permission.id, 'Contato informado não responde.')

        assert run_together(submit, revoke) in ([200, 200], [200, 403])
        with Session(test_engine) as db:
            # Whichever decision won: an approved payment waits for the refund, a refused one is just cancelled.
            outcome = (db.get(EntryReceipt, paid.id).decision, db.get(EventEntry, item.id).state)
            assert outcome in {('aprovado', 'devolucao_pendente'), ('recusado', 'cancelada')}
            assert db.scalar(select(func.count()).select_from(Notification).where(
                Notification.user_id == people['runner'].id, Notification.type == 'comprovante_decidido')) == 1
            assert db.scalar(select(func.count()).select_from(EventMessage).where(
                EventMessage.event_id == event.id)) == 1
            # Either sent and then returned to draft by the revocation, or refused before sending.
            assert db.get(Event, draft.id).state == 'rascunho'
    finally:
        with Session(test_engine) as cleanup:
            ids = [person.id for person in people.values()]
            event_ids = select(Event.id).where(Event.organizer_user_id == owner_id)
            entry_ids = select(EventEntry.id).where(EventEntry.event_id.in_(event_ids))
            receipt_ids = select(EntryReceipt.id).where(EntryReceipt.entry_id.in_(entry_ids))
            cleanup.execute(delete(AuditLog).where(or_(
                AuditLog.actor_id.in_(ids),
                and_(AuditLog.target_type == 'event', AuditLog.target_id.in_(event_ids)),
                and_(AuditLog.target_type == 'event_entry', AuditLog.target_id.in_(entry_ids)),
                and_(AuditLog.target_type == 'entry_receipt', AuditLog.target_id.in_(receipt_ids)))))
            cleanup.execute(delete(EntryReceipt).where(EntryReceipt.id.in_(receipt_ids)))
            cleanup.execute(delete(Event).where(Event.organizer_user_id == owner_id))
            cleanup.execute(delete(User).where(User.id.in_(ids)))
            cleanup.commit()

import threading
import uuid
from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.identity import ContentReport, MediaObject, User, UserBlock
from app.models.notifications import Notification
from app.models.organizers import Organizer, OrganizerRequest
from app.schemas.organizers import OrganizerDecisionInput, OrganizerRequestInput
from app.services import organizers
from app.services.organizers import current_organizer

PASSWORD = 'organizer-test-password'
BRASILIA = {'id': 5300108, 'name': 'Brasília', 'state': 'DF'}
REQUEST = {'display_name': 'Liga do Cerrado', 'city_id': BRASILIA['id'], 'sports': ['tenis', 'futebol'],
           'experience': 'Organizo torneios de bairro desde 2019.', 'contact': '(61) 99999-0000',
           'link': 'https://instagram.com/ligadocerrado', 'accept_terms': True}
EMPTY_STATUS = {'state': 'sem_pedido', 'request': None, 'organizer': None, 'revocation': None}
FORBIDDEN = {'detail': 'Acesso administrativo necessário.'}


def register(http, email, name='Atleta Organizador'):
    data = {'name': name, 'email': email, 'birth_date': '1992-03-10', 'password': PASSWORD}
    assert http.post('/api/v1/auth/register', json=data).status_code == 201
    response = http.post('/api/v1/auth/login', json={'email': email, 'password': PASSWORD})
    return {'Authorization': f"Bearer {response.json()['token']}"}, response.json()['user']['id']


def admin_account(http, db, email='organizer-admin@example.com'):
    headers, admin_id = register(http, email, 'Admin Arena')
    db.get(User, admin_id).is_admin = True
    db.commit()
    return headers, admin_id


def status(http, headers):
    response = http.get('/api/v1/me/organizer-request', headers=headers)
    assert response.status_code == 200
    return response.json()


def submit(http, headers, **changes):
    return http.post('/api/v1/me/organizer-request', json={**REQUEST, **changes}, headers=headers)


def decide(http, headers, request_id, **body):
    return http.post(f'/api/v1/admin/organizer-requests/{request_id}/decision', json=body, headers=headers)


def audit_actions(db, target_type, target_id):
    return [(row.action, row.actor_id, row.data) for row in db.scalars(select(AuditLog).where(
        AuditLog.target_type == target_type, AuditLog.target_id == target_id).order_by(AuditLog.id))]


def notifications_of(db, user_id, type_):
    return list(db.scalars(select(Notification).where(Notification.user_id == user_id, Notification.type == type_)
                           .order_by(Notification.id)))


def test_athlete_requests_cancels_and_requests_again(client):
    http, db = client
    athlete, athlete_id = register(http, 'organizer-flow@example.com')
    assert status(http, athlete) == EMPTY_STATUS

    created = submit(http, athlete)
    assert created.status_code == 201
    body = created.json()
    assert body == {'id': body['id'], 'display_name': 'Liga do Cerrado', 'city': BRASILIA,
                    'sports': ['futebol', 'tenis'], 'experience': REQUEST['experience'], 'contact': '(61) 99999-0000',
                    'link': REQUEST['link'], 'state': 'em_analise', 'reason_code': None, 'reason_detail': None,
                    'created_at': body['created_at'], 'decided_at': None}
    assert status(http, athlete) == {'state': 'em_analise', 'request': body, 'organizer': None, 'revocation': None}
    row = db.get(OrganizerRequest, body['id'])
    assert row.user_id == athlete_id and row.terms_version == 1 and row.terms_accepted_at is not None

    duplicate = submit(http, athlete, display_name='Outra Liga')
    assert (duplicate.status_code, duplicate.json()) == (409, {'detail': 'Você já tem um pedido em análise.'})

    assert http.delete('/api/v1/me/organizer-request', headers=athlete).status_code == 204
    assert status(http, athlete) == EMPTY_STATUS
    db.refresh(row)
    assert (row.state, row.decided_by_id) == ('cancelado', athlete_id) and row.decided_at is not None
    again = http.delete('/api/v1/me/organizer-request', headers=athlete)
    assert (again.status_code, again.json()) == (404, {'detail': 'Nenhum pedido em análise.'})

    second = submit(http, athlete, experience='   ', link='')
    assert second.status_code == 201
    assert second.json()['id'] != body['id'] and (second.json()['experience'], second.json()['link']) == (None, None)
    assert status(http, athlete)['state'] == 'em_analise'
    assert audit_actions(db, 'organizer_request', body['id']) == [
        ('pedido_organizador.criado', athlete_id,
         {'city_id': BRASILIA['id'], 'sports': ['futebol', 'tenis'], 'terms_version': 1}),
        ('pedido_organizador.cancelado', athlete_id, {})]
    assert [action for action, _, _ in audit_actions(db, 'organizer_request', second.json()['id'])] == [
        'pedido_organizador.criado']
    assert notifications_of(db, athlete_id, 'pedido_organizador_decidido') == []


def test_request_validation_and_transport_rules(client):
    http, _ = client
    athlete, _ = register(http, 'organizer-validation@example.com')
    terms = submit(http, athlete, accept_terms=False)
    assert (terms.status_code, terms.json()) == (
        422, {'detail': 'Aceite as responsabilidades do organizador para enviar o pedido.'})
    city = submit(http, athlete, city_id=1)
    assert (city.status_code, city.json()) == (422, {'detail': 'Selecione uma cidade do catálogo.'})
    for changes, field in (({'sports': ['futebol', 'futebol']}, 'sports'), ({'sports': []}, 'sports'),
                           ({'link': 'ftp://liga.example'}, 'link'), ({'contact': '123'}, 'contact'),
                           ({'display_name': ' ab '}, 'display_name'), ({'user_id': 1}, 'user_id'),
                           ({'state': 'aprovado'}, 'state')):
        response = submit(http, athlete, **changes)
        assert response.status_code == 422 and response.json()['detail'] == 'Revise os campos informados.'
        assert field in [item['field'] for item in response.json()['fields']]
    assert http.get('/api/v1/me/organizer-request').status_code == 401
    assert http.post('/api/v1/me/organizer-request', json=REQUEST).status_code == 401
    assert http.delete('/api/v1/me/organizer-request').status_code == 401
    assert http.post('/api/v1/me/organizer-request', data={'display_name': 'x'}, headers=athlete).status_code == 415
    hostile = {**athlete, 'Origin': 'https://attacker.invalid'}
    assert http.post('/api/v1/me/organizer-request', json=REQUEST, headers=hostile).status_code == 403
    assert status(http, athlete) == EMPTY_STATUS


def test_admin_refuses_with_reason_then_approves_new_request(client):
    http, db = client
    admin, admin_id = admin_account(http, db)
    athlete, athlete_id = register(http, 'organizer-decided@example.com', 'Bruna Lima')
    first = submit(http, athlete).json()
    assert http.get('/api/v1/admin/queue-counts', headers=admin).json() == {'organizer_requests': 1, 'reports': 0}

    queue = http.get('/api/v1/admin/organizer-requests', headers=admin)
    assert queue.status_code == 200 and queue.json()['next_cursor'] is None
    item = queue.json()['items'][0]
    assert item == {**first, 'requester': {'id': athlete_id, 'name': 'Bruna Lima',
                                           'username': item['requester']['username'], 'avatar_url': None},
                    'decided_by': None}
    assert 'organizer-decided@example.com' not in queue.text and 'birth_date' not in queue.text

    missing = decide(http, admin, first['id'], decision='recusar')
    assert (missing.status_code, missing.json()) == (422, {'detail': 'Escolha o motivo da recusa.'})
    for detail in (None, ' abc '):
        other = decide(http, admin, first['id'], decision='recusar', reason_code='outro', reason_detail=detail)
        assert (other.status_code, other.json()) == (422, {'detail': 'Descreva o motivo da recusa.'})
    unknown = decide(http, admin, 999999, decision='aprovar')
    assert (unknown.status_code, unknown.json()) == (404, {'detail': 'Pedido não encontrado.'})

    refused = decide(http, admin, first['id'], decision='recusar', reason_code='pouca_informacao',
                     reason_detail='  Conte quais torneios já organizou.  ')
    assert refused.status_code == 200
    refused_body = refused.json()
    assert refused_body['state'] == 'recusado' and refused_body['decided_at'] is not None
    assert (refused_body['reason_code'], refused_body['reason_detail']) == (
        'pouca_informacao', 'Conte quais torneios já organizou.')
    assert refused_body['decided_by']['id'] == admin_id
    twice = decide(http, admin, first['id'], decision='aprovar')
    assert (twice.status_code, twice.json()) == (409, {'detail': 'Este pedido já foi decidido.'})

    card = status(http, athlete)
    assert card['state'] == 'recusado' and card['request']['id'] == first['id']
    assert card['request']['reason_code'] == 'pouca_informacao' and card['organizer'] is None
    [notice] = notifications_of(db, athlete_id, 'pedido_organizador_decidido')
    assert notice.actor_id is None and notice.payload == {
        'request_id': first['id'], 'decision': 'recusado', 'reason_code': 'pouca_informacao',
        'reason_detail': 'Conte quais torneios já organizou.'}
    listed = http.get('/api/v1/me/notifications', headers=athlete).json()['items'][0]
    assert listed['type'] == 'pedido_organizador_decidido' and listed['actor'] is None
    assert audit_actions(db, 'organizer_request', first['id'])[-1] == (
        'pedido_organizador.recusado', admin_id,
        {'user_id': athlete_id, 'reason_code': 'pouca_informacao',
         'reason_detail': 'Conte quais torneios já organizou.'})
    assert http.get('/api/v1/admin/queue-counts', headers=admin).json()['organizer_requests'] == 0
    decided = http.get('/api/v1/admin/organizer-requests?state=decididos', headers=admin).json()['items']
    assert [entry['id'] for entry in decided] == [first['id']]

    second = submit(http, athlete, display_name='Liga do Cerrado FC').json()
    assert [entry['id'] for entry in http.get('/api/v1/admin/organizer-requests', headers=admin).json()['items']] == [
        second['id']]
    approved = decide(http, admin, second['id'], decision='aprovar', reason_code='outro', reason_detail='ignorado')
    assert approved.status_code == 200
    assert approved.json()['state'] == 'aprovado' and approved.json()['reason_code'] is None
    assert approved.json()['reason_detail'] is None

    permission = db.scalar(select(Organizer).where(Organizer.user_id == athlete_id))
    assert (permission.request_id, permission.display_name, permission.approved_by_id) == (
        second['id'], 'Liga do Cerrado FC', admin_id)
    card = status(http, athlete)
    assert card['state'] == 'aprovado' and card['request']['id'] == second['id'] and card['revocation'] is None
    assert card['organizer'] == {'id': permission.id, 'display_name': 'Liga do Cerrado FC',
                                 'approved_at': card['organizer']['approved_at']}
    again = submit(http, athlete)
    assert (again.status_code, again.json()) == (409, {'detail': 'Você já é organizador.'})
    assert notifications_of(db, athlete_id, 'pedido_organizador_decidido')[-1].payload == {
        'request_id': second['id'], 'decision': 'aprovado', 'reason_code': None, 'reason_detail': None}
    assert audit_actions(db, 'organizer_request', second['id'])[-1] == (
        'pedido_organizador.aprovado', admin_id, {'user_id': athlete_id, 'organizer_id': permission.id})

    listed = http.get('/api/v1/admin/organizers', headers=admin).json()
    assert listed['next_cursor'] is None and len(listed['items']) == 1
    entry = listed['items'][0]
    assert (entry['id'], entry['display_name'], entry['request_id']) == (permission.id, 'Liga do Cerrado FC', second['id'])
    assert entry['user'] == item['requester'] and entry['approved_by']['id'] == admin_id
    assert entry['approved_at'] == card['organizer']['approved_at']
    assert current_organizer(user=db.get(User, athlete_id), db=db).id == permission.id


def test_admin_routes_require_administration(client):
    http, db = client
    admin, _ = admin_account(http, db, 'organizer-admin-rules@example.com')
    athlete, athlete_id = register(http, 'organizer-not-admin@example.com')
    request_id = submit(http, athlete).json()['id']
    permission = Organizer(user_id=athlete_id, display_name='Liga Manual')
    db.add(permission)
    db.commit()
    for method, path, body in (
            ('get', '/api/v1/admin/queue-counts', None),
            ('get', '/api/v1/admin/organizer-requests', None),
            ('get', '/api/v1/admin/organizer-requests?state=decididos', None),
            ('post', f'/api/v1/admin/organizer-requests/{request_id}/decision', {'decision': 'aprovar'}),
            ('get', '/api/v1/admin/organizers', None),
            ('post', f'/api/v1/admin/organizers/{permission.id}/revoke', {'reason': 'Contato falso'})):
        kwargs = {'json': body} if body is not None else {}
        forbidden = getattr(http, method)(path, headers=athlete, **kwargs)
        assert (forbidden.status_code, forbidden.json()) == (403, FORBIDDEN), path
        assert getattr(http, method)(path, **kwargs).status_code == 401, path
    assert db.get(OrganizerRequest, request_id).state == 'em_analise'
    assert db.get(Organizer, permission.id).revoked_at is None

    assert http.get('/api/v1/admin/organizer-requests?state=todos', headers=admin).status_code == 422
    assert http.get('/api/v1/admin/organizer-requests?cursor=!', headers=admin).status_code == 422
    assert http.get('/api/v1/admin/organizers?limit=51', headers=admin).status_code == 422
    assert decide(http, admin, request_id, decision='talvez').status_code == 422
    assert decide(http, admin, request_id, decision='aprovar', user_id=1).status_code == 422
    assert http.post(f'/api/v1/admin/organizer-requests/{request_id}/decision', data={'decision': 'aprovar'},
                     headers=admin).status_code == 415
    # A permission granted outside the flow blocks the approval; the request stays under review.
    conflict = decide(http, admin, request_id, decision='aprovar')
    assert (conflict.status_code, conflict.json()) == (409, {'detail': 'Este atleta já é organizador.'})
    assert db.get(OrganizerRequest, request_id).state == 'em_analise'
    assert decide(http, admin, request_id, decision='recusar', reason_code='pedido_repetido').status_code == 200


def test_revocation_ends_permission_keeps_history_and_allows_new_request(client):
    http, db = client
    admin, admin_id = admin_account(http, db, 'organizer-admin-revoke@example.com')
    athlete, athlete_id = register(http, 'organizer-revoked@example.com')
    first = submit(http, athlete).json()
    decide(http, admin, first['id'], decision='aprovar')
    permission = db.scalar(select(Organizer).where(Organizer.user_id == athlete_id))
    revoke = f'/api/v1/admin/organizers/{permission.id}/revoke'

    short = http.post(revoke, json={'reason': ' abc '}, headers=admin)
    assert short.status_code == 422 and short.json()['fields'][0]['field'] == 'reason'
    assert http.post(revoke, json={'reason': 'x' * 501}, headers=admin).status_code == 422
    assert http.post(revoke, json={}, headers=admin).status_code == 422
    unknown = http.post('/api/v1/admin/organizers/999999/revoke', json={'reason': 'Contato falso'}, headers=admin)
    assert (unknown.status_code, unknown.json()) == (404, {'detail': 'Organizador não encontrado.'})

    assert http.post(revoke, json={'reason': '  Contato informado não responde.  '}, headers=admin).status_code == 204
    again = http.post(revoke, json={'reason': 'Contato falso'}, headers=admin)
    assert (again.status_code, again.json()) == (404, {'detail': 'Organizador não encontrado.'})
    db.refresh(permission)
    assert (permission.revoked_by_id, permission.revoke_reason) == (admin_id, 'Contato informado não responde.')
    assert permission.revoked_at is not None and db.get(OrganizerRequest, first['id']).state == 'aprovado'

    card = status(http, athlete)
    assert card == {'state': 'revogado', 'request': None, 'organizer': None,
                    'revocation': {'revoked_at': card['revocation']['revoked_at'],
                                   'reason': 'Contato informado não responde.'}}
    with pytest.raises(HTTPException) as error:
        current_organizer(user=db.get(User, athlete_id), db=db)
    assert (error.value.status_code, error.value.detail) == (403, 'Você precisa ser organizador para criar eventos.')
    [notice] = notifications_of(db, athlete_id, 'organizador_revogado')
    assert notice.actor_id is None and notice.payload == {'reason': 'Contato informado não responde.'}
    assert audit_actions(db, 'organizer', permission.id) == [(
        'organizador.revogado', admin_id, {'user_id': athlete_id, 'reason': 'Contato informado não responde.'})]
    assert http.get('/api/v1/admin/organizers', headers=admin).json() == {'items': [], 'next_cursor': None}

    # A new request after the revocation: cancelled shows no request, refused shows the refusal.
    assert submit(http, athlete).status_code == 201
    assert status(http, athlete)['state'] == 'em_analise'
    http.delete('/api/v1/me/organizer-request', headers=athlete)
    assert status(http, athlete) == EMPTY_STATUS
    refused_id = submit(http, athlete).json()['id']
    decide(http, admin, refused_id, decision='recusar', reason_code='contato_nao_funciona')
    assert status(http, athlete)['state'] == 'recusado'
    approved_id = submit(http, athlete).json()['id']
    decide(http, admin, approved_id, decision='aprovar')
    card = status(http, athlete)
    assert card['state'] == 'aprovado' and card['organizer']['id'] != permission.id
    assert db.scalar(select(func.count()).select_from(Organizer).where(Organizer.user_id == athlete_id)) == 2


def test_queue_counts_cover_organizer_requests_and_pending_reports(client):
    http, db = client
    admin, admin_id = admin_account(http, db, 'organizer-admin-counts@example.com')
    assert http.get('/api/v1/admin/queue-counts', headers=admin).json() == {'organizer_requests': 0, 'reports': 0}
    people = [register(http, f'organizer-count-{index}@example.com') for index in range(3)]
    for headers, _ in people:
        submit(http, headers)
    http.delete('/api/v1/me/organizer-request', headers=people[2][0])
    reporter = people[0][1]
    db.add_all([ContentReport(reporter_id=reporter, target_type='user', target_id=admin_id, reason='spam'),
                ContentReport(reporter_id=reporter, target_type='user', target_id=people[1][1], reason='spam'),
                ContentReport(reporter_id=reporter, target_type='user', target_id=admin_id, reason='spam',
                              status='resolved')])
    db.commit()
    counts = http.get('/api/v1/admin/queue-counts', headers=admin).json()
    assert counts == {'organizer_requests': 2, 'reports': 2}
    pending_reports = http.get('/api/v1/admin/reports?limit=50', headers=admin).json()['items']
    assert len(pending_reports) == counts['reports']


def test_admin_queue_pages_newest_first_and_hides_avatar_on_block(client):
    http, db = client
    admin, admin_id = admin_account(http, db, 'organizer-admin-pages@example.com')
    people = [register(http, f'organizer-page-{index}@example.com', f'Atleta {index}') for index in range(3)]
    ids = [submit(http, headers, display_name=f'Liga {index}').json()['id'] for index, (headers, _) in enumerate(people)]
    for _, user_id in people[:2]:
        media = MediaObject(id=uuid.uuid4(), user_id=user_id, bucket='arena', object_key=f'avatars/{uuid.uuid4()}.webp',
                            content_type='image/webp', size_bytes=10, width=1, height=1)
        db.add(media)
        db.flush()
        db.get(User, user_id).avatar_media_id = media.id
    db.add(UserBlock(blocker_id=people[1][1], blocked_id=admin_id))
    db.commit()

    first = http.get('/api/v1/admin/organizer-requests?limit=2', headers=admin).json()
    assert [item['id'] for item in first['items']] == [ids[2], ids[1]] and first['next_cursor']
    assert first['items'][1]['requester']['avatar_url'] is None
    rest = http.get(f"/api/v1/admin/organizer-requests?limit=2&cursor={first['next_cursor']}", headers=admin).json()
    assert [item['id'] for item in rest['items']] == [ids[0]] and rest['next_cursor'] is None
    assert rest['items'][0]['requester']['avatar_url'].startswith(f'/api/v1/users/{people[0][1]}/avatar?v=')

    for request_id in (ids[1], ids[0], ids[2]):
        decide(http, admin, request_id, decision='aprovar')
    decided = http.get('/api/v1/admin/organizer-requests?state=decididos&limit=2', headers=admin).json()
    assert [item['id'] for item in decided['items']] == [ids[2], ids[0]] and decided['next_cursor']
    assert all(item['decided_by']['id'] == admin_id for item in decided['items'])
    organizers_page = http.get('/api/v1/admin/organizers?limit=2', headers=admin).json()
    assert [item['request_id'] for item in organizers_page['items']] == [ids[2], ids[0]]
    tail = http.get(f"/api/v1/admin/organizers?limit=2&cursor={organizers_page['next_cursor']}", headers=admin).json()
    assert [item['request_id'] for item in tail['items']] == [ids[1]] and tail['next_cursor'] is None
    assert tail['items'][0]['user']['avatar_url'] is None
    assert http.get('/api/v1/admin/queue-counts', headers=admin).json()['organizer_requests'] == 0


def test_administrator_can_decide_own_request_and_is_notified(client):
    http, db = client
    admin, admin_id = admin_account(http, db, 'organizer-admin-self@example.com')
    own = submit(http, admin).json()
    assert decide(http, admin, own['id'], decision='aprovar').json()['decided_by']['id'] == admin_id
    [notice] = notifications_of(db, admin_id, 'pedido_organizador_decidido')
    assert notice.payload['decision'] == 'aprovado'
    assert audit_actions(db, 'organizer_request', own['id'])[-1][:2] == ('pedido_organizador.aprovado', admin_id)
    assert status(http, admin)['state'] == 'aprovado'


def run_together(*actions):
    """Runs the actions in parallel threads, each with its own session, and returns the HTTP status of each."""
    barrier, results = threading.Barrier(len(actions)), [None] * len(actions)

    def worker(index, action):
        barrier.wait()
        try:
            action()
            results[index] = 200
        except HTTPException as error:
            results[index] = error.status_code
        except Exception as error:  # surfaced in the assertion instead of being lost in the thread
            results[index] = repr(error)

    threads = [threading.Thread(target=worker, args=item) for item in enumerate(actions)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(30)
    return sorted(results, key=str)


def test_concurrent_submissions_and_decisions_are_serialized(test_engine):
    """Real commits on separate connections: the row locks let only one submission and one decision win."""
    tag = uuid.uuid4().hex[:10]
    with Session(test_engine, expire_on_commit=False) as setup:
        athlete = User(name='Atleta Concorrente', username=f'conc_{tag}', email=f'conc-{tag}@example.com',
                       birth_date=date(1990, 1, 1), password_hash='x')
        admin = User(name='Admin Concorrente', username=f'adm_{tag}', email=f'adm-{tag}@example.com',
                     birth_date=date(1990, 1, 1), password_hash='x', is_admin=True)
        setup.add_all([athlete, admin])
        setup.commit()
    try:
        def submission():
            with Session(test_engine, expire_on_commit=False) as db:
                organizers.create_request(db, db.get(User, athlete.id), OrganizerRequestInput(**REQUEST))

        assert run_together(submission, submission) == [200, 409]

        with Session(test_engine) as db:
            [request_id] = db.scalars(select(OrganizerRequest.id).where(OrganizerRequest.user_id == athlete.id))

        def decision(body):
            def action():
                with Session(test_engine, expire_on_commit=False) as db:
                    organizers.decide_request(db, db.get(User, admin.id), request_id, OrganizerDecisionInput(**body))
            return action

        assert run_together(decision({'decision': 'aprovar'}),
                            decision({'decision': 'recusar', 'reason_code': 'pedido_repetido'})) == [200, 409]
        with Session(test_engine) as db:
            state = db.get(OrganizerRequest, request_id).state
            permissions = db.scalar(select(func.count()).select_from(Organizer).where(Organizer.user_id == athlete.id))
            notices = db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == athlete.id))
            assert (state, permissions, notices) in {('aprovado', 1, 1), ('recusado', 0, 1)}

        with Session(test_engine, expire_on_commit=False) as db:
            # The locked read phase 4 uses to create events against a concurrent revocation.
            permission = organizers.get_active_organizer(db, athlete.id, for_update=True)
            if permission is None:
                permission = Organizer(user_id=athlete.id, display_name='Liga Concorrente')
                db.add(permission)
            db.commit()

        def revocation():
            with Session(test_engine, expire_on_commit=False) as db:
                organizers.revoke(db, db.get(User, admin.id), permission.id, 'Contato informado não responde.')

        assert run_together(revocation, revocation) == [200, 404]
        with Session(test_engine) as db:
            assert organizers.get_active_organizer(db, athlete.id) is None
            assert db.scalar(select(func.count()).select_from(Notification).where(
                Notification.user_id == athlete.id, Notification.type == 'organizador_revogado')) == 1
    finally:
        with Session(test_engine) as cleanup:
            request_ids = select(OrganizerRequest.id).where(OrganizerRequest.user_id == athlete.id)
            permission_ids = select(Organizer.id).where(Organizer.user_id == athlete.id)
            cleanup.execute(delete(AuditLog).where(AuditLog.target_type == 'organizer_request',
                                                   AuditLog.target_id.in_(request_ids)))
            cleanup.execute(delete(AuditLog).where(AuditLog.target_type == 'organizer',
                                                   AuditLog.target_id.in_(permission_ids)))
            cleanup.execute(delete(User).where(User.id.in_([athlete.id, admin.id])))
            cleanup.commit()

from datetime import timedelta

from sqlalchemy import event as sa_event
from sqlalchemy import select

from app.models.identity import Follow, User, UserBlock, utcnow
from app.models.notifications import Notification
from app.services import notifications
from app.services.notifications import notify
from tests.integration.test_notifications_flow import TEAM, register

HOUR = timedelta(hours=1)
SUMMARY = '/api/v1/me/notifications/summary'
PENDING = '/api/v1/me/notifications/pending'
LIST = '/api/v1/me/notifications'
EVENT = {'event_id': 1, 'event_name': 'Copa Cerrado'}
INVITE = {**TEAM, 'invite_id': 1}
REQUEST = {**TEAM, 'request_id': 1}
PROPOSAL = {'match_id': 1, 'sport': 'tenis', 'format': 'simples', 'opponent_name': 'Caio', 'expires_at': 'x'}


def invite(db, user_id, number, **values):
    return notify(db, user_id, 'convite_time', {**TEAM, 'invite_id': number}, action_key=f'invite:{number}', **values)


def summary(http, headers):
    response = http.get(SUMMARY, headers=headers)
    assert response.status_code == 200
    return response.json()


def ids(response):
    assert response.status_code == 200
    return [item['id'] for item in response.json()['items']]


def test_summary_adds_unread_follow_requests_and_pending_for_the_owner_only(client):
    http, db = client
    owner, owner_id = register(http, 'actions-summary@example.com', 'Resumo Dono')
    other, other_id = register(http, 'actions-summary-other@example.com', 'Resumo Outro')
    _, plain_id = register(http, 'actions-plain@example.com', 'Solicitante Comum')
    _, blocked_id = register(http, 'actions-blocked@example.com', 'Solicitante Bloqueado')
    _, blocker_id = register(http, 'actions-blocker@example.com', 'Solicitante Bloqueador')
    _, inactive_id = register(http, 'actions-inactive@example.com', 'Solicitante Inativo')
    _, approved_id = register(http, 'actions-approved@example.com', 'Seguidor Aprovado')
    assert summary(http, owner) == {'unread_count': 0, 'follow_requests_count': 0, 'pending_count': 0,
                                    'unread_by_category': {'partidas': 0, 'times': 0, 'eventos': 0}}

    now = utcnow()
    invite(db, owner_id, 1, action_until=now + HOUR)                                       # pending, times, unread
    notify(db, owner_id, 'pedido_entrada', REQUEST, action_key='join_request:1')            # pending, times, unread
    notify(db, owner_id, 'proposta_partida', PROPOSAL, action_key='proposal:1:user:1',
           action_until=now - HOUR)                                                         # expired, partidas, unread
    notify(db, owner_id, 'tabela_publicada', EVENT)                                         # eventos, unread
    notify(db, owner_id, 'quadra_decidida', {'court_id': 1, 'court_name': 'Q', 'decision': 'aprovada'})  # conta
    resolved = invite(db, owner_id, 2)                                                      # resolved, times, unread
    resolved.resolved_at = now
    read = notify(db, owner_id, 'aviso_evento', {**EVENT, 'message_id': 1})                 # eventos, already read
    read.read_at = now
    invite(db, other_id, 3)                                                                 # belongs to another user
    notify(db, other_id, 'tabela_publicada', EVENT)

    db.add_all([Follow(follower_id=plain_id, followed_id=owner_id, approved=False),
                Follow(follower_id=blocked_id, followed_id=owner_id, approved=False),
                Follow(follower_id=blocker_id, followed_id=owner_id, approved=False),
                Follow(follower_id=inactive_id, followed_id=owner_id, approved=False),
                Follow(follower_id=approved_id, followed_id=owner_id, approved=True),
                Follow(follower_id=owner_id, followed_id=other_id, approved=False),
                UserBlock(blocker_id=owner_id, blocked_id=blocked_id),
                UserBlock(blocker_id=blocker_id, blocked_id=owner_id)])
    db.scalar(select(User).where(User.id == inactive_id)).active = False
    db.commit()

    assert summary(http, owner) == {
        'unread_count': 6, 'follow_requests_count': 1, 'pending_count': 2,
        'unread_by_category': {'partidas': 1, 'times': 3, 'eventos': 1}}
    assert summary(http, other) == {
        'unread_count': 2, 'follow_requests_count': 1, 'pending_count': 1,
        'unread_by_category': {'partidas': 0, 'times': 1, 'eventos': 1}}


def test_summary_runs_two_selects_regardless_of_the_amount_of_data(client):
    http, db = client
    _, owner_id = register(http, 'actions-trace@example.com', 'Resumo Consultas')
    for index in range(1, 6):
        invite(db, owner_id, index, action_until=utcnow() + HOUR)
        _, follower_id = register(http, f'actions-trace-{index}@example.com', f'Seguidor {index}')
        db.add(Follow(follower_id=follower_id, followed_id=owner_id, approved=False))
    db.commit()
    log = []
    connection = db.get_bind()
    owner = db.get(User, owner_id)

    def listener(conn, cursor, statement, parameters, context, executemany):
        log.append(statement)

    sa_event.listen(connection, 'before_cursor_execute', listener)
    try:
        result = notifications.summary(db, owner)
    finally:
        sa_event.remove(connection, 'before_cursor_execute', listener)
    assert (result.unread_count, result.pending_count, result.follow_requests_count) == (5, 5, 5)
    assert [item for item in log if item.lstrip().upper().startswith('SELECT')] == log and len(log) <= 2


def test_category_and_pending_filters_page_with_a_stable_cursor(client):
    http, db = client
    owner, owner_id = register(http, 'actions-filter@example.com', 'Filtro Dono')
    now = utcnow()
    created = {}
    for number in range(1, 6):
        created[f'times{number}'] = (invite(db, owner_id, number, action_until=now + HOUR) if number % 2
                                     else notify(db, owner_id, 'time_encerrado', TEAM))
    created['expired'] = invite(db, owner_id, 6, action_until=now - HOUR)
    created['resolved'] = invite(db, owner_id, 7)
    created['resolved'].resolved_at = now
    created['event'] = notify(db, owner_id, 'tabela_publicada', EVENT)
    created['match'] = notify(db, owner_id, 'proposta_partida', PROPOSAL, action_key='proposal:1:user:1')
    created['account'] = notify(db, owner_id, 'organizador_revogado', {'reason': 'x'})
    db.commit()
    key = {item.id: name for name, item in created.items()}

    def names(url):
        collected, cursor = [], ''
        for _ in range(10):
            response = http.get(f'{url}&cursor={cursor}' if cursor else url, headers=owner)
            assert response.status_code == 200
            collected += [key[item['id']] for item in response.json()['items']]
            cursor = response.json()['next_cursor']
            if cursor is None:
                return collected
        raise AssertionError('Paginação não terminou.')

    assert names(f'{LIST}?limit=2&categoria=times') == [
        'resolved', 'expired', 'times5', 'times4', 'times3', 'times2', 'times1']
    assert names(f'{LIST}?limit=2&categoria=times&pendente=true') == ['times5', 'times3', 'times1']
    assert names(f'{LIST}?limit=2&categoria=times&pendente=false') == [
        'resolved', 'expired', 'times4', 'times2']
    assert names(f'{LIST}?limit=2&categoria=eventos') == ['event']
    assert names(f'{LIST}?limit=2&categoria=partidas&pendente=true') == ['match']
    assert names(f'{LIST}?limit=3&pendente=true') == ['match', 'times5', 'times3', 'times1']
    assert names(f'{LIST}?limit=3&pendente=false') == ['account', 'event', 'resolved', 'expired', 'times4', 'times2']
    assert len(names(f'{LIST}?limit=4')) == 10
    first = http.get(f'{LIST}?limit=2&categoria=times', headers=owner).json()
    assert first['next_cursor'] and [(item['category'], item['pending']) for item in first['items']] == [
        ('times', False), ('times', False)]


def test_pending_orders_by_urgency_and_leaves_out_expired_and_resolved(client):
    http, db = client
    owner, owner_id = register(http, 'actions-order@example.com', 'Urgência Dono')
    other, other_id = register(http, 'actions-order-other@example.com', 'Urgência Outro')
    now = utcnow()
    late = invite(db, owner_id, 1, action_until=now + 5 * HOUR)
    soon = invite(db, owner_id, 2, action_until=now + HOUR)
    open_old = notify(db, owner_id, 'pedido_entrada', REQUEST, action_key='join_request:1')
    open_new = notify(db, owner_id, 'pedido_entrada', {**TEAM, 'request_id': 2}, action_key='join_request:2')
    tie = invite(db, owner_id, 3, action_until=now + 5 * HOUR)                  # same deadline as `late`, newer
    match = notify(db, owner_id, 'proposta_partida', PROPOSAL, action_key='proposal:1:user:1',
                   action_until=now + 2 * HOUR)
    invite(db, owner_id, 4, action_until=now - HOUR)                            # expired
    invite(db, owner_id, 5, action_until=now + HOUR).resolved_at = now          # resolved
    notify(db, owner_id, 'tabela_publicada', EVENT)                             # informative
    invite(db, other_id, 6, action_until=now + HOUR)                            # someone else's
    db.commit()

    body = http.get(PENDING, headers=owner).json()
    assert [item['id'] for item in body['items']] == [
        soon.id, match.id, tie.id, late.id, open_new.id, open_old.id]
    assert all(item['pending'] and item['read_at'] is None for item in body['items'])
    assert body['items'][0]['action_until'] and body['items'][4]['action_until'] is None
    assert ids(http.get(f'{PENDING}?limit=2', headers=owner)) == [soon.id, match.id]
    assert ids(http.get(f'{PENDING}?categoria=partidas', headers=owner)) == [match.id]
    assert ids(http.get(f'{PENDING}?categoria=eventos', headers=owner)) == []
    assert ids(http.get(f'{PENDING}?categoria=times&limit=3', headers=owner)) == [soon.id, tie.id, late.id]
    assert len(ids(http.get(PENDING, headers=other))) == 1


def test_resolve_actions_closes_one_key_for_everyone_or_only_for_chosen_users(client):
    http, db = client
    first, first_id = register(http, 'actions-resolve-1@example.com', 'Resolve Um')
    second, second_id = register(http, 'actions-resolve-2@example.com', 'Resolve Dois')
    for user_id in (first_id, second_id):
        notify(db, user_id, 'pedido_entrada', REQUEST, action_key='join_request:1')
        notify(db, user_id, 'pedido_entrada', {**TEAM, 'request_id': 2}, action_key='join_request:2')
        notify(db, user_id, 'evento_para_aprovar', EVENT, action_key='event_review:1')
    db.commit()
    assert [summary(http, headers)['pending_count'] for headers in (first, second)] == [3, 3]

    assert notifications.resolve_actions(db, 'join_request:1', user_ids=[first_id]) == 1
    db.commit()
    assert [summary(http, headers)['pending_count'] for headers in (first, second)] == [2, 3]
    assert notifications.resolve_actions(db, 'join_request:1') == 1      # the remaining recipient
    assert notifications.resolve_actions(db, 'join_request:1') == 0      # nothing open any more
    assert notifications.resolve_actions(db, 'inexistente:9') == 0
    assert notifications.resolve_actions(db, 'join_request:2', user_ids=[]) == 0
    db.commit()
    assert [summary(http, headers)['pending_count'] for headers in (first, second)] == [2, 2]
    stamps = db.scalars(select(Notification.resolved_at).where(Notification.action_key == 'join_request:1')).all()
    assert len(stamps) == 2 and all(stamp is not None for stamp in stamps)
    assert notifications.resolve_actions_many(db, ['join_request:2', 'event_review:1']) == 4
    db.commit()
    assert [summary(http, headers)['pending_count'] for headers in (first, second)] == [0, 0]
    assert ids(http.get(f'{LIST}?pendente=true', headers=first)) == []


def test_reading_keeps_the_action_open_and_returns_the_whole_summary(client):
    http, db = client
    owner, owner_id = register(http, 'actions-read@example.com', 'Leitura Dono')
    _, requester_id = register(http, 'actions-read-from@example.com', 'Leitura Origem')
    first = invite(db, owner_id, 1, action_until=utcnow() + HOUR)
    invite(db, owner_id, 2)
    notify(db, owner_id, 'tabela_publicada', EVENT)
    db.add(Follow(follower_id=requester_id, followed_id=owner_id, approved=False))
    db.commit()

    one = http.put(f'{LIST}/{first.id}/read', json={}, headers=owner)
    assert one.status_code == 200 and one.json() == {
        'unread_count': 2, 'follow_requests_count': 1, 'pending_count': 2,
        'unread_by_category': {'partidas': 0, 'times': 1, 'eventos': 1}}
    stamps = {item['id']: item['read_at'] for item in http.get(
        f'{LIST}?categoria=times&pendente=true', headers=owner).json()['items']}
    assert len(stamps) == 2 and stamps[first.id] is not None and list(stamps.values()).count(None) == 1
    everything = http.put(f'{LIST}/read-all', json={}, headers=owner)
    assert everything.json() == {'unread_count': 0, 'follow_requests_count': 1, 'pending_count': 2,
                                 'unread_by_category': {'partidas': 0, 'times': 0, 'eventos': 0}}
    assert len(ids(http.get(PENDING, headers=owner))) == 2
    assert db.get(Notification, first.id).resolved_at is None
    assert http.get('/api/v1/me/notifications/unread-count', headers=owner).json() == {'unread_count': 0}


def test_notification_item_exposes_category_pending_and_deadline(client):
    http, db = client
    owner, owner_id = register(http, 'actions-item@example.com', 'Item Dono')
    deadline = utcnow() + HOUR
    created = invite(db, owner_id, 1, action_until=deadline)
    db.commit()
    item = http.get(LIST, headers=owner).json()['items'][0]
    assert set(item) == {'id', 'type', 'category', 'payload', 'actor', 'created_at', 'read_at', 'pending',
                         'action_until'}
    assert (item['id'], item['type'], item['category'], item['pending']) == (created.id, 'convite_time', 'times', True)
    assert item['action_until'].startswith(deadline.strftime('%Y-%m-%dT%H:%M'))


def test_new_routes_require_session_and_validate_filters(client):
    http, _ = client
    owner, _ = register(http, 'actions-rules@example.com', 'Regras Ações')
    assert http.get(SUMMARY).status_code == 401
    assert http.get(PENDING).status_code == 401
    assert http.get(f'{LIST}?categoria=times').status_code == 401
    assert http.put(f'{LIST}/1/read', json={}).status_code == 401
    for url in (f'{LIST}?categoria=conta', f'{LIST}?categoria=x', f'{PENDING}?categoria=conta',
                f'{LIST}?pendente=talvez', f'{PENDING}?limit=0', f'{PENDING}?limit=51'):
        assert http.get(url, headers=owner).status_code == 422, url
    for url in (PENDING, f'{PENDING}?limit=1', f'{PENDING}?limit=50', f'{LIST}?pendente=true', f'{LIST}?pendente=false',
                f'{LIST}?categoria=eventos', SUMMARY):
        assert http.get(url, headers=owner).status_code == 200, url

from sqlalchemy import select

from app.models.identity import User, UserBlock
from app.services.notifications import notify, notify_many

PASSWORD = 'notification-test-password'
TEAM = {'team_id': 1, 'team_name': 'Leões do Cerrado'}


def register(http, email, name):
    data = {'name': name, 'email': email, 'birth_date': '1994-05-01', 'password': PASSWORD}
    assert http.post('/api/v1/auth/register', json=data).status_code == 201
    response = http.post('/api/v1/auth/login', json={'email': email, 'password': PASSWORD})
    return {'Authorization': f"Bearer {response.json()['token']}"}, response.json()['user']['id']


def test_notifications_are_listed_counted_and_read_only_by_their_owner(client):
    http, db = client
    owner, owner_id = register(http, 'notif-owner@example.com', 'Dona Notificações')
    other, other_id = register(http, 'notif-other@example.com', 'Caio Ramos')
    for index in range(3):
        notify(db, owner_id, 'convite_time', {**TEAM, 'invite_id': index + 1}, actor_id=other_id,
               action_key=f'invite:{index + 1}')
    notify(db, other_id, 'time_encerrado', TEAM, actor_id=owner_id)
    db.commit()

    assert http.get('/api/v1/me/notifications/unread-count', headers=owner).json() == {'unread_count': 3}
    first = http.get('/api/v1/me/notifications?limit=2', headers=owner).json()
    assert len(first['items']) == 2 and first['next_cursor']
    newest = first['items'][0]
    assert newest['type'] == 'convite_time' and newest['payload'] == {**TEAM, 'invite_id': 3}
    assert newest['actor'] == {'id': other_id, 'name': 'Caio Ramos', 'username': newest['actor']['username'],
                               'avatar_url': None}
    assert newest['read_at'] is None
    second = http.get(f"/api/v1/me/notifications?limit=2&cursor={first['next_cursor']}", headers=owner).json()
    assert [item['payload']['invite_id'] for item in second['items']] == [1] and second['next_cursor'] is None

    foreign_id = http.get('/api/v1/me/notifications', headers=other).json()['items'][0]['id']
    assert http.put(f'/api/v1/me/notifications/{foreign_id}/read', json={}, headers=owner).status_code == 404
    assert http.put(f"/api/v1/me/notifications/{newest['id']}/read", json={}, headers=other).status_code == 404
    read = http.put(f"/api/v1/me/notifications/{newest['id']}/read", json={}, headers=owner)
    assert read.status_code == 200 and read.json()['unread_count'] == 2
    stamp = http.get('/api/v1/me/notifications?limit=1', headers=owner).json()['items'][0]['read_at']
    assert stamp is not None
    assert http.put(f"/api/v1/me/notifications/{newest['id']}/read", json={}, headers=owner).json()['unread_count'] == 2
    assert http.get('/api/v1/me/notifications?limit=1', headers=owner).json()['items'][0]['read_at'] == stamp

    assert http.put('/api/v1/me/notifications/read-all', json={}, headers=owner).json()['unread_count'] == 0
    assert http.get('/api/v1/me/notifications/unread-count', headers=owner).json() == {'unread_count': 0}
    assert http.get('/api/v1/me/notifications/unread-count', headers=other).json() == {'unread_count': 1}


def test_notification_routes_require_session_json_and_known_fields(client):
    http, _ = client
    owner, _ = register(http, 'notif-rules@example.com', 'Regras Notificações')
    assert http.get('/api/v1/me/notifications').status_code == 401
    assert http.get('/api/v1/me/notifications/unread-count').status_code == 401
    assert http.put('/api/v1/me/notifications/read-all', json={}).status_code == 401
    assert http.put('/api/v1/me/notifications/read-all', headers=owner).status_code == 415
    assert http.put('/api/v1/me/notifications/read-all', json={'user_id': 2}, headers=owner).status_code == 422
    assert http.put('/api/v1/me/notifications/999999/read', json={}, headers=owner).status_code == 404
    assert http.get('/api/v1/me/notifications?cursor=!', headers=owner).status_code == 422
    assert http.get('/api/v1/me/notifications?limit=51', headers=owner).status_code == 422
    browser = {'Origin': 'https://attacker.invalid'}
    assert http.put('/api/v1/me/notifications/read-all', json={}, headers=browser).status_code == 403


def test_actor_is_hidden_when_blocked_or_suspended(client):
    http, db = client
    owner, owner_id = register(http, 'notif-block@example.com', 'Bloqueia Ator')
    _, blocked_id = register(http, 'notif-blocked@example.com', 'Ator Bloqueado')
    _, suspended_id = register(http, 'notif-suspended@example.com', 'Ator Suspenso')
    notify_many(db, [owner_id], 'removido_do_time', TEAM, actor_id=blocked_id)
    notify(db, owner_id, 'time_encerrado', TEAM, actor_id=suspended_id)
    notify(db, owner_id, 'organizador_revogado', {'reason': 'Contato falso'})
    db.add(UserBlock(blocker_id=owner_id, blocked_id=blocked_id))
    db.scalar(select(User).where(User.id == suspended_id)).active = False
    db.commit()
    items = http.get('/api/v1/me/notifications', headers=owner).json()['items']
    assert [(item['type'], item['actor']) for item in items] == [
        ('organizador_revogado', None), ('time_encerrado', None), ('removido_do_time', None)]

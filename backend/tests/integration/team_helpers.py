"""Helpers shared by the team integration tests (accounts, teams, follows and audit/notification reads)."""
from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.identity import Follow, utcnow

PASSWORD = 'team-test-password-123'
CITY = 5300108  # Brasília, in the migration catalog


def register(http, email, name='Atleta Time'):
    data = {'name': name, 'email': email, 'birth_date': '1993-02-03', 'password': PASSWORD}
    assert http.post('/api/v1/auth/register', json=data).status_code == 201
    response = http.post('/api/v1/auth/login', json={'email': email, 'password': PASSWORD})
    return {'Authorization': f"Bearer {response.json()['token']}"}, response.json()['user']['id']


def set_position(http, headers, position):
    response = http.put('/api/v1/me/sports-profiles/futebol', json={'city_id': CITY, 'position': position},
                        headers=headers)
    assert response.status_code == 200


def create_team(http, headers, name='Leões do Cerrado'):
    response = http.post('/api/v1/teams', json={'name': name, 'city_id': CITY}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def invite(http, headers, team_id, user_id, message=None):
    return http.post(f'/api/v1/teams/{team_id}/invites', json={'user_id': user_id, 'message': message},
                     headers=headers)


def join_by_invite(http, owner, team_id, guest, guest_id):
    created = invite(http, owner, team_id, guest_id)
    assert created.status_code == 201, created.text
    accepted = http.put(f"/api/v1/team-invites/{created.json()['id']}", json={'decision': 'aceitar'}, headers=guest)
    assert accepted.status_code == 200, accepted.text
    return accepted.json()


def link_token(http, headers, team_id):
    response = http.get(f'/api/v1/teams/{team_id}/invite-link', headers=headers)
    assert response.status_code == 200, response.text
    return response.json()['token']


def follow(db, follower_id, followed_id):
    db.add(Follow(follower_id=follower_id, followed_id=followed_id, approved=True, created_at=utcnow()))
    db.flush()


def notifications(http, headers, type_=None):
    items = http.get('/api/v1/me/notifications', headers=headers).json()['items']
    return [item for item in items if type_ is None or item['type'] == type_]


def audit_actions(db, target_type, target_id):
    return [(row.action, row.data) for row in db.scalars(select(AuditLog).where(
        AuditLog.target_type == target_type, AuditLog.target_id == target_id).order_by(AuditLog.id))]

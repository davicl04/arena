from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.identity import AuthSession, SportsProfile, User, utcnow
from app.schemas.identity import Register
from app.services.identity import register_user

ACCOUNT = {'name': 'Atleta Teste', 'email': 'athlete@example.com', 'birth_date': '1995-01-01', 'password': 'test-password-123'}
ORIGIN = {'Origin': 'http://localhost:5173'}


def token(client):
    assert client.post('/api/v1/auth/register', json=ACCOUNT).status_code == 201
    response = client.post('/api/v1/auth/login', json={k: ACCOUNT[k] for k in ('email', 'password')})
    assert response.status_code == 200
    return {'Authorization': f"Bearer {response.json()['token']}"}


def test_complete_native_flow_and_logout(client):
    http, db = client
    headers = token(http)
    assert http.get('/api/v1/me', headers=headers).json()['email'] == ACCOUNT['email']
    for sport in ('futebol', 'tenis', 'corrida'):
        path = f'/api/v1/me/sports-profiles/{sport}'
        body = {'city_id': 5300108, 'looking_for': True}
        first = http.put(path, json=body, headers=headers)
        assert first.status_code == 200
        assert first.json()['is_public'] is False and first.json()['level'] is None
        body['looking_for'] = False
        second = http.put(path, json=body, headers=headers)
        assert second.json()['id'] == first.json()['id']
        assert second.json()['looking_for'] is False
    assert len(db.scalars(select(SportsProfile)).all()) == 3
    assert http.patch('/api/v1/me', json={'name': 'Novo Nome'}, headers=headers).json()['name'] == 'Novo Nome'
    assert http.post('/api/v1/auth/logout', headers=headers).status_code == 204
    assert http.get('/api/v1/me', headers=headers).status_code == 401


def test_browser_cookie_and_origin_protection(client):
    http, _ = client
    http.post('/api/v1/auth/register', json=ACCOUNT, headers=ORIGIN)
    response = http.post('/api/v1/auth/login', json={k: ACCOUNT[k] for k in ('email', 'password')}, headers=ORIGIN)
    assert response.json()['token'] is None
    assert 'HttpOnly' in response.headers['set-cookie'] and 'SameSite=lax' in response.headers['set-cookie']
    assert http.get('/api/v1/me').status_code == 200
    assert http.patch('/api/v1/me', json={'name': 'Intruso'}).status_code == 403
    assert http.patch('/api/v1/me', json={'name': 'Intruso'}, headers={'Authorization': 'invalid'}).status_code == 401
    assert http.patch('/api/v1/me', json={'name': 'Intruso'}, headers={'Origin': 'https://other.example'}).status_code == 403
    assert http.patch('/api/v1/me', json={'name': 'Atleta Web'}, headers=ORIGIN).status_code == 200
    assert http.post('/api/v1/auth/logout', headers=ORIGIN).status_code == 204
    assert http.get('/api/v1/me').status_code == 401


def test_duplicates_minors_and_validation_privacy(client):
    http, _ = client
    http.post('/api/v1/auth/register', json=ACCOUNT)
    assert http.post('/api/v1/auth/register', json={**ACCOUNT, 'email': 'ATHLETE@EXAMPLE.COM'}).status_code == 409
    assert http.post('/api/v1/auth/register', json={**ACCOUNT, 'birth_date': '2020-01-01'}).status_code == 422
    response = http.post('/api/v1/auth/register', json={**ACCOUNT, 'password': 'secret'})
    assert response.status_code == 422 and 'secret' not in response.text
    assert http.post('/api/v1/auth/register', json={**ACCOUNT, 'birth_date': '2000-02-30'}).status_code == 422
    assert http.post('/api/v1/auth/login', json={'email': ACCOUNT['email'], 'password': 'incorrect'}).status_code == 401


def test_authorization_expiration_and_invalid_profile(client):
    http, db = client
    assert http.get('/api/v1/me').status_code == 401
    headers = token(http)
    profile = {'city_id': 5300108}
    assert http.put('/api/v1/me/sports-profiles/swimming', json=profile, headers=headers).status_code == 422
    assert http.put('/api/v1/me/sports-profiles/tenis', json={**profile, 'position': 'goleiro'}, headers=headers).status_code == 422
    assert http.put('/api/v1/me/sports-profiles/corrida', json={'city_id': 1}, headers=headers).status_code == 422
    for field in ('user_id', 'level', 'is_public'):
        assert http.put('/api/v1/me/sports-profiles/futebol', json={**profile, field: 1}, headers=headers).status_code == 422
    session = db.scalar(select(AuthSession))
    session.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    assert http.get('/api/v1/me', headers=headers).status_code == 401


def test_two_users_have_isolated_profiles(client):
    http, _ = client
    first = token(http)
    http.put('/api/v1/me/sports-profiles/futebol', json={'city_id': 5300108}, headers=first)
    other = {**ACCOUNT, 'email': 'other@example.com'}
    http.post('/api/v1/auth/register', json=other)
    response = http.post('/api/v1/auth/login', json={k: other[k] for k in ('email', 'password')})
    second = {'Authorization': f"Bearer {response.json()['token']}"}
    assert http.get('/api/v1/me/sports-profiles', headers=second).json() == []
    assert http.patch('/api/v1/me', json={'name': 'Outro'}, headers=second).status_code == 200
    assert http.get('/api/v1/me', headers=first).json()['name'] == ACCOUNT['name']


def test_concurrent_email_uniqueness_and_persistence(test_engine):
    data = Register(**{**ACCOUNT, 'email': 'concurrent@example.com'})
    def create():
        with Session(test_engine) as db:
            try:
                register_user(db, data)
                return 201
            except HTTPException as error:
                return error.status_code
    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(lambda _: create(), range(2))) == [201, 409]
    test_engine.dispose()
    with Session(test_engine) as db:
        users = db.scalars(select(User).where(User.email == data.email)).all()
        assert len(users) == 1 and users[0].password_hash != ACCOUNT['password']


@pytest.mark.parametrize('path', ['/api/v1/users/1', '/api/v1/users/1/sports-profiles'])
def test_no_arbitrary_user_route(client, path):
    http, _ = client
    assert http.get(path).status_code == 404

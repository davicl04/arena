from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from starlette.requests import Request

from app.core import security
from app.models.identity import User
from app.schemas.identity import Register
from app.services import identity


@pytest.fixture
def account():
    return User(id=42, name='Atleta', email='atleta@example.com', active=True,
                birth_date=datetime(1990, 1, 1).date(), password_hash=identity.passwords.hash('TestPassword123'))


def registration(**overrides):
    return Register(**({'name': ' Atleta ', 'email': 'Atleta@example.com',
                        'birth_date': '1990-01-01', 'password': 'TestPassword123'} | overrides))


def test_registration_hashes_password_and_normalizes_email():
    db = Mock()
    user = identity.register_user(db, registration())
    assert (user.name, user.email) == ('Atleta', 'atleta@example.com')
    assert user.password_hash != 'TestPassword123'
    assert identity.passwords.verify('TestPassword123', user.password_hash)
    db.add.assert_called_once_with(user)
    db.commit.assert_called_once()


def test_underage_registration_does_not_write(monkeypatch):
    monkeypatch.setattr(identity, 'is_adult', lambda _: False)
    db = Mock()
    with pytest.raises(HTTPException) as exc:
        identity.register_user(db, registration())
    assert exc.value.status_code == 422
    db.add.assert_not_called()


def test_duplicate_registration_rolls_back():
    db = Mock()
    db.commit.side_effect = IntegrityError('insert', {}, Exception('duplicate'))
    with pytest.raises(HTTPException) as exc:
        identity.register_user(db, registration())
    assert exc.value.status_code == 409
    db.rollback.assert_called_once()


def test_authentication_accepts_valid_active_account(account):
    db = Mock()
    db.scalar.return_value = account
    assert identity.authenticate(db, ' ATLETA@example.com ', 'TestPassword123') is account


@pytest.mark.parametrize('kind', ['unknown', 'wrong-password', 'inactive'])
def test_authentication_rejects_invalid_accounts_without_disclosing_reason(account, kind):
    db = Mock()
    db.scalar.return_value = None if kind == 'unknown' else account
    account.active = kind != 'inactive'
    with pytest.raises(HTTPException) as exc:
        identity.authenticate(db, account.email, 'wrong' if kind == 'wrong-password' else 'TestPassword123')
    assert exc.value.status_code == 401
    assert exc.value.detail == 'E-mail ou senha inválidos.'


def test_session_stores_digest_and_configured_expiration(account, monkeypatch):
    now = datetime(2026, 10, 9, tzinfo=timezone.utc)
    monkeypatch.setattr(identity, 'utcnow', lambda: now)
    monkeypatch.setattr(identity, 'get_settings', lambda: SimpleNamespace(session_hours=3))
    db = Mock()
    token, session = identity.create_session(db, account)
    assert session.user_id == account.id
    assert session.token_hash == identity.digest_token(token)
    assert session.token_hash != token
    assert session.expires_at == now + timedelta(hours=3)
    assert len(token) >= 43
    db.commit.assert_called_once()


def http_request(method='GET', token='test-token', origin=None, bearer=False):
    headers = []
    if token:
        headers.append((b'authorization', f'Bearer {token}'.encode()) if bearer
                       else (b'cookie', f'arena_session={token}'.encode()))
    if origin:
        headers.append((b'origin', origin.encode()))
    return Request({'type': 'http', 'method': method, 'headers': headers})


@pytest.mark.parametrize('method', ['POST', 'PUT', 'PATCH', 'DELETE'])
@pytest.mark.parametrize('origin', [None, 'https://untrusted.example'])
def test_cookie_writes_reject_unapproved_origin(method, origin):
    db = Mock()
    with pytest.raises(HTTPException) as exc:
        security.current_session(http_request(method=method, origin=origin), db)
    assert exc.value.status_code == 403
    db.scalar.assert_not_called()


@pytest.mark.parametrize('bearer', [False, True])
def test_valid_session_accepts_cookie_or_bearer(bearer):
    db = Mock()
    session = SimpleNamespace(expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
    db.scalar.return_value = session
    assert security.current_session(http_request(bearer=bearer), db) is session


def test_authorized_cookie_write_is_accepted():
    db = Mock()
    session = SimpleNamespace(expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
    db.scalar.return_value = session
    assert security.current_session(http_request(method='PUT', origin='http://localhost:5173'), db) is session


@pytest.mark.parametrize('kind', ['missing-token', 'missing-session', 'expired', 'invalid-bearer'])
def test_invalid_sessions_are_rejected(kind):
    db = Mock()
    db.scalar.return_value = None if kind == 'missing-session' else SimpleNamespace(
        expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    request = http_request(token=None if kind == 'missing-token' else 'test-token')
    if kind == 'invalid-bearer':
        request = Request({'type': 'http', 'method': 'GET', 'headers': [(b'authorization', b'Basic abc')]})
    with pytest.raises(HTTPException) as exc:
        security.current_session(request, db)
    assert exc.value.status_code == 401


@pytest.mark.parametrize('available', [True, False, None])
def test_current_user_requires_active_account(available, account):
    db = Mock()
    account.active = available
    db.get.return_value = account if available is not None else None
    if available:
        assert security.current_user(SimpleNamespace(user_id=42), db) is account
    else:
        with pytest.raises(HTTPException) as exc:
            security.current_user(SimpleNamespace(user_id=42), db)
        assert exc.value.status_code == 401

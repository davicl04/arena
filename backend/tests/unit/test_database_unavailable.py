"""Falha do banco: toda rota devolve 503 com `{detail}` em JSON, nunca o 500 em texto puro do Starlette.

Os clientes (web e Expo) tratam 502/503/504 como "servidor indisponível" (faixa de conexão e nova tentativa) e leem
`detail` do corpo JSON. Estes testes usam o app real, sem PostgreSQL: a dependência `get_db` é trocada por sessões
que levantam `OperationalError` em cada etapa possível (abertura, consulta, flush, commit e fechamento).
"""
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

import app.main as main_module
from app.core.database import get_db
from app.main import app
from app.models.identity import AuthSession, utcnow

DETAIL = 'Não foi possível acessar os dados. Tente novamente.'
LOGIN = {'email': 'ana@example.com', 'password': 'Senha-forte-123'}


def failure() -> OperationalError:
    return OperationalError('SELECT 1', {}, Exception('connection refused'))


class BrokenDb:
    """Sessão simulada que levanta `OperationalError` no método escolhido e se comporta como vazia nos demais."""

    def __init__(self, fails_on: str, session: AuthSession | None = None):
        self.fails_on = fails_on
        self.session = session

    def _check(self, name: str):
        if name == self.fails_on:
            raise failure()

    def scalar(self, *args, **kwargs):
        self._check('scalar')
        return self.session

    def scalars(self, *args, **kwargs):
        self._check('scalars')
        raise AssertionError('consulta inesperada')

    def delete(self, *args, **kwargs):
        self._check('flush')

    def commit(self):
        self._check('commit')

    def rollback(self):
        pass


@pytest.fixture
def http():
    # Sem `raise_server_exceptions`, um erro sem handler apareceria como o 500 em texto do Starlette.
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client
    app.dependency_overrides.clear()


def assert_json_503(response):
    assert response.status_code == 503
    assert response.headers['content-type'].startswith('application/json')
    assert response.json() == {'detail': DETAIL}


def valid_session() -> AuthSession:
    return AuthSession(token_hash='x', user_id=1, expires_at=utcnow() + timedelta(hours=1))


def test_dependency_function_raising_on_open_returns_json_503(http):
    def broken():
        raise failure()

    app.dependency_overrides[get_db] = broken
    assert_json_503(http.post('/api/v1/auth/login', json=LOGIN))
    assert_json_503(http.get('/api/v1/cities'))


def test_dependency_generator_raising_before_yield_returns_json_503(http):
    def broken():
        raise failure()
        yield  # pragma: no cover

    app.dependency_overrides[get_db] = broken
    assert_json_503(http.get('/api/v1/cities'))


@pytest.mark.parametrize('route', ['/api/v1/me', '/api/v1/me/sports-profiles', '/api/v1/me/notifications/unread-count'])
def test_authenticated_routes_return_json_503_when_the_session_query_fails(http, route):
    app.dependency_overrides[get_db] = lambda: BrokenDb('scalar')
    assert_json_503(http.get(route, headers={'Authorization': 'Bearer token'}))


@pytest.mark.parametrize('step', ['flush', 'commit'])
def test_flush_and_commit_failures_return_json_503(http, step):
    app.dependency_overrides[get_db] = lambda: BrokenDb(step, valid_session())
    assert_json_503(http.post('/api/v1/auth/logout', headers={'Authorization': 'Bearer token'}))


def test_failure_while_closing_the_session_after_the_route_is_not_a_text_500(http):
    """`with SessionLocal()` fecha a sessão no teardown do `yield`; um `close()` que falha não pode vazar texto."""
    def closing_fails():
        yield BrokenDb('never', valid_session())
        raise failure()

    app.dependency_overrides[get_db] = closing_fails
    response = http.post('/api/v1/auth/logout', headers={'Authorization': 'Bearer token'})
    # A rota já terminou com sucesso: o cliente recebe a resposta da rota (204) ou um 503 em JSON, nunca texto.
    assert response.status_code in (204, 503)
    if response.status_code == 503:
        assert_json_503(response)
    else:
        assert response.content == b''


def test_health_ready_returns_json_503_when_the_database_is_down(http, monkeypatch):
    class DownEngine:
        def connect(self):
            raise failure()

    monkeypatch.setattr(main_module, 'engine', DownEngine())
    assert_json_503(http.get('/health/ready'))


def test_health_ready_returns_json_503_when_the_query_fails(http, monkeypatch):
    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def execute(self, *args, **kwargs):
            raise failure()

    class Engine:
        def connect(self):
            return Connection()

    monkeypatch.setattr(main_module, 'engine', Engine())
    assert_json_503(http.get('/health/ready'))


def test_health_live_does_not_touch_the_database(http, monkeypatch):
    monkeypatch.setattr(main_module, 'engine', None)
    response = http.get('/health/live')
    assert (response.status_code, response.json()) == (200, {'status': 'ok'})

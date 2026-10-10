import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import HTTPException
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app.models.identity import User
from app.schemas.identity import Register
from app.services.identity import USERNAME_RE, register_user

PASSWORD = 'identity-test-password'


def register(http, email, name='Atleta Identidade'):
    data = {'name': name, 'email': email, 'birth_date': '1995-01-01', 'password': PASSWORD}
    created = http.post('/api/v1/auth/register', json=data)
    assert created.status_code == 201
    response = http.post('/api/v1/auth/login', json={'email': email, 'password': PASSWORD})
    return created.json(), {'Authorization': f"Bearer {response.json()['token']}"}


def test_registration_generates_unique_username_from_name(client):
    http, _ = client
    first, headers = register(http, 'joao-1@example.com', 'João da Silva')
    second, _ = register(http, 'joao-2@example.com', 'Joao  da Silva')
    reserved, _ = register(http, 'arena-name@example.com', 'Arena')
    assert first['username'] == 'joao.da.silva'
    assert second['username'] == 'joao.da.silva1'
    assert reserved['username'] == 'arena1'
    assert first['cover'] is None
    me = http.get('/api/v1/me', headers=headers).json()
    assert me['username'] == 'joao.da.silva' and me['cover'] is None


def test_username_update_validation_normalization_and_conflict(client):
    http, _ = client
    _, owner = register(http, 'username-owner@example.com', 'Dona do Perfil')
    other, other_headers = register(http, 'username-other@example.com', 'Outra Pessoa')

    updated = http.patch('/api/v1/me', json={'username': '  @Corrida.Livre '}, headers=owner)
    assert updated.status_code == 200 and updated.json()['username'] == 'corrida.livre'
    assert updated.json()['name'] == 'Dona do Perfil'

    for invalid in ('ab', '.corrida', 'corrida.', 'corrida..livre', 'corrida-livre', 'admin', 'x' * 31):
        assert http.patch('/api/v1/me', json={'username': invalid}, headers=owner).status_code == 422
    assert http.patch('/api/v1/me', json={}, headers=owner).status_code == 422

    taken = http.patch('/api/v1/me', json={'username': 'CORRIDA.LIVRE'}, headers=other_headers)
    assert taken.status_code == 409
    assert taken.json()['detail'] == 'Este nome de usuário já está em uso.'
    assert http.get('/api/v1/me', headers=other_headers).json()['username'] == other['username']

    both = http.patch('/api/v1/me', json={'name': 'Novo Nome', 'username': 'novo_nome'}, headers=owner).json()
    assert (both['name'], both['username']) == ('Novo Nome', 'novo_nome')
    assert http.get('/api/v1/me', headers=owner).json()['username'] == 'novo_nome'


def test_username_availability_requires_session_and_suggests_free_names(client):
    http, _ = client
    assert http.get('/api/v1/me/username-availability?u=livre').status_code == 401
    mine, owner = register(http, 'availability-owner@example.com', 'Pessoa Disponivel')
    other, _ = register(http, 'availability-other@example.com', 'Bola Murcha')

    def check(value):
        response = http.get('/api/v1/me/username-availability', params={'u': value}, headers=owner)
        assert response.status_code == 200
        return response.json()

    assert check(mine['username']) == {'available': True, 'reason': 'current', 'suggestions': []}
    assert check('@Nome.Livre') == {'available': True, 'reason': None, 'suggestions': []}
    assert check('a..b') == {'available': False, 'reason': 'invalid', 'suggestions': []}
    taken = check(other['username'].upper())
    assert taken['available'] is False and taken['reason'] == 'taken'
    assert taken['suggestions'] == ['bola.murcha1', 'bola.murcha2', 'bola.murcha3']
    reserved = check('suporte')
    assert reserved['reason'] == 'reserved' and len(reserved['suggestions']) == 3
    assert all(USERNAME_RE.fullmatch(item) for item in reserved['suggestions'])
    assert http.get('/api/v1/me/username-availability?u=', headers=owner).status_code == 422


def test_search_finds_people_by_username_and_ignores_like_wildcards(client):
    http, _ = client
    _, viewer = register(http, 'search-viewer@example.com', 'Quem Busca')
    target, target_headers = register(http, 'search-target@example.com', 'Pessoa Encontrada')
    http.patch('/api/v1/me', json={'username': 'tenis_de_mesa'}, headers=target_headers)
    found = http.get('/api/v1/users', params={'q': '@tenis_de'}, headers=viewer).json()['items']
    assert [item['id'] for item in found] == [target['id']]
    assert found[0]['username'] == 'tenis_de_mesa'
    assert http.get('/api/v1/users', params={'q': 'tenis%mesa'}, headers=viewer).json()['items'] == []
    assert http.get('/api/v1/users', params={'q': '@'}, headers=viewer).status_code == 422


def test_concurrent_registrations_with_same_name_receive_distinct_usernames(test_engine):
    marker = uuid.uuid4().hex[:8]

    def create(index):
        data = Register(name=f'Concorrente {marker}', email=f'concurrent-name-{marker}-{index}@example.com',
                        birth_date=date(1995, 1, 1), password=PASSWORD)
        with Session(test_engine) as db:
            try:
                return register_user(db, data).username
            except HTTPException as error:
                return error.status_code

    with ThreadPoolExecutor(max_workers=3) as executor:
        results = list(executor.map(create, range(3)))
    assert all(isinstance(item, str) for item in results) and len(set(results)) == 3
    test_engine.dispose()
    with Session(test_engine) as db:
        stored = db.scalars(select(User.username).where(User.email.like(f'concurrent-name-{marker}-%'))).all()
        assert sorted(stored) == sorted(results)


def test_migration_backfills_existing_accounts_with_unique_usernames():
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('Defina TEST_DATABASE_URL para executar integração com PostgreSQL.')
    admin = create_engine(url)
    schema = 'arena_test_' + uuid.uuid4().hex
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={'options': f'-csearch_path={schema}'})
    root = Path(__file__).resolve().parents[2]
    config = Config(str(root / 'alembic.ini'))
    config.set_main_option('script_location', str(root / 'migrations'))
    try:
        with engine.begin() as connection:
            config.attributes['connection'] = connection
            command.upgrade(config, '0003')
            names = ['João da Silva', 'Joao da Silva', 'Zé', 'Admin', '***', '***']
            for index, name in enumerate(names):
                connection.execute(text(
                    'INSERT INTO users (name, email, birth_date, password_hash, active, created_at, updated_at) '
                    "VALUES (:name, :email, '1990-01-01', 'hash', true, now(), now())"
                ), {'name': name, 'email': f'backfill-{index}@example.com'})
            command.upgrade(config, 'head')
            usernames = connection.execute(text('SELECT username FROM users ORDER BY id')).scalars().all()
            assert usernames == ['joao.da.silva', 'joao.da.silva1', 'ze.atleta', 'admin1', 'atleta', 'atleta1']
            assert all(USERNAME_RE.fullmatch(item) for item in usernames)
            command.downgrade(config, '0003')
            command.upgrade(config, 'head')
    finally:
        engine.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()

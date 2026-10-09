import os
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.main import app


@pytest.fixture(scope='session')
def test_engine():
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('Defina TEST_DATABASE_URL para executar integração com PostgreSQL.')
    admin = create_engine(url)
    schema = 'arena_test_' + uuid.uuid4().hex
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={'options': f'-csearch_path={schema}'})
    try:
        config = Config(str(Path(__file__).resolve().parents[2] / 'alembic.ini'))
        config.set_main_option('script_location', str(Path(__file__).resolve().parents[2] / 'migrations'))
        with engine.begin() as connection:
            config.attributes['connection'] = connection
            command.upgrade(config, 'head')
        yield engine
    finally:
        engine.dispose()
        # Only the random schema created by this fixture is removed.
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


@pytest.fixture
def client(test_engine):
    with test_engine.connect() as connection:
        transaction = connection.begin()
        with Session(bind=connection, join_transaction_mode='create_savepoint', expire_on_commit=False) as db:
            app.dependency_overrides[get_db] = lambda: db
            with TestClient(app) as client:
                yield client, db
            app.dependency_overrides.clear()
        transaction.rollback()

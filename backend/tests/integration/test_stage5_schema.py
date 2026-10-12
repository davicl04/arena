"""Migration 0011: the table of running marks, its constraints and the downgrade to 0009."""
import os
import uuid
from datetime import date
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from app.models.runs import Run
from tests.integration.match_helpers import NOW, make_user
from tests.integration.run_helpers import enter, race

BACKEND = Path(__file__).resolve().parents[2]


def test_migration_0011_downgrades_to_0009_and_upgrades_again():
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('Defina TEST_DATABASE_URL para executar integração com PostgreSQL.')
    admin = create_engine(url)
    schema = 'arena_mig5_' + uuid.uuid4().hex
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={'options': f'-csearch_path={schema}'})
    config = Config(str(BACKEND / 'alembic.ini'))
    config.set_main_option('script_location', str(BACKEND / 'migrations'))
    try:
        with engine.begin() as connection:
            config.attributes['connection'] = connection
            command.upgrade(config, 'head')
            assert 'runs' in inspect(connection).get_table_names()
            # The cuts of the five distances were inserted by 0005; this migration adds no data.
            assert connection.scalar(text(
                "SELECT count(*) FROM rank_cuts WHERE calc_version = 1 AND ranking LIKE 'corrida\\_%'")) == 5
            user_id = connection.scalar(text(
                "INSERT INTO users (name, username, email, birth_date, password_hash, active, social_public, is_admin, "
                "created_at, updated_at) VALUES ('Ana', 'ana.mig5', 'ana5@mig.com', '1990-01-01', 'x', true, false, "
                "false, now(), now()) RETURNING id"))
            connection.execute(text(
                "INSERT INTO standings (user_id, sport, distance_km, metric_value, matches_played, rank_position, "
                f"tier, calc_version, updated_at) VALUES ({user_id}, 'corrida', 5, 1500, 1, 1, 'ouro', 1, now())"))
            command.downgrade(config, '0009')
            assert 'runs' not in inspect(connection).get_table_names()
            assert connection.scalar(text('SELECT version_num FROM alembic_version')) == '0009'
            # The running rows of the ranking are derived from the marks that went away.
            assert connection.scalar(text("SELECT count(*) FROM standings WHERE sport = 'corrida'")) == 0
            command.upgrade(config, 'head')
            assert 'runs' in inspect(connection).get_table_names()
    finally:
        engine.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


def rejected(db, **values):
    base = dict(distance_m=5000, duration_s=1500, ran_on=date(2026, 10, 12), source='treino',
                standard_distance_km=5, verified=False, created_at=NOW)
    base.update(values)
    with pytest.raises(IntegrityError):
        with db.begin_nested():
            db.add(Run(**base))
            db.flush()


def test_the_table_keeps_a_mark_consistent(client):
    _, db = client
    owner, athlete = make_user(db, 'dono'), make_user(db, 'ana')
    event = race(db, owner)
    entry = enter(db, event, athlete)
    other = enter(db, race(db, owner, name='Outra prova'), make_user(db, 'bia'))
    user = athlete.id

    db.add(Run(user_id=user, distance_m=7000, duration_s=2400, ran_on=date(2026, 10, 12), source='treino',
               standard_distance_km=None, created_at=NOW))
    db.add(Run(user_id=user, distance_m=10000, duration_s=3000, ran_on=date(2026, 10, 12), source='prova',
               event_entry_id=entry.id, standard_distance_km=10, created_at=NOW))
    db.flush()
    assert db.query(Run).filter(Run.verified.is_(False)).count() == 2          # self-declared by default

    rejected(db, user_id=user, source='competicao')
    rejected(db, user_id=user, distance_m=999)
    rejected(db, user_id=user, distance_m=100001)
    rejected(db, user_id=user, duration_s=0)
    rejected(db, user_id=user, duration_s=86401)
    rejected(db, user_id=user, standard_distance_km=7)
    # A race mark hangs on an entry and carries the standard distance; a training mark has no entry.
    rejected(db, user_id=user, source='prova', event_entry_id=None)
    rejected(db, user_id=user, source='prova', event_entry_id=other.id, standard_distance_km=None)
    rejected(db, user_id=user, source='treino', event_entry_id=other.id)
    # A training mark is never verified; one mark per entry.
    rejected(db, user_id=user, verified=True)
    rejected(db, user_id=user, source='prova', event_entry_id=entry.id, standard_distance_km=10)
    rejected(db, user_id=999999)                      # the athlete must exist
    # Only a race mark may be verified (a later organizer confirmation); the service never sets it today.
    db.add(Run(user_id=user, distance_m=10000, duration_s=3100, ran_on=date(2026, 10, 12), source='prova',
               event_entry_id=other.id, standard_distance_km=10, verified=True, created_at=NOW))
    db.flush()
    rejected(db, user_id=user, source='prova', event_entry_id=other.id, standard_distance_km=10)

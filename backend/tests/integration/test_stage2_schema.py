"""Migration 0008: events, entries, receipts and notices; constraints and the downgrade path on PostgreSQL."""
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from app.models.events import EntryReceipt, Event, EventEntry, EventMessage
from app.models.identity import MediaObject, User
from app.models.teams import Team

STAGE_TWO_TABLES = {'events', 'event_entries', 'entry_receipts', 'event_messages'}
BACKEND = Path(__file__).resolve().parents[2]
NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
CITY = 5300108


def test_migration_0008_downgrades_to_0005_and_upgrades_again():
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('Defina TEST_DATABASE_URL para executar integração com PostgreSQL.')
    admin = create_engine(url)
    schema = 'arena_mig2_' + uuid.uuid4().hex
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={'options': f'-csearch_path={schema}'})
    config = Config(str(BACKEND / 'alembic.ini'))
    config.set_main_option('script_location', str(BACKEND / 'migrations'))
    try:
        with engine.begin() as connection:
            config.attributes['connection'] = connection
            command.upgrade(config, 'head')
            assert STAGE_TWO_TABLES <= set(inspect(connection).get_table_names())
            widths = {column['name']: column['nullable'] for column in inspect(connection).get_columns('media_objects')}
            assert widths['width'] and widths['height']
            user_id = connection.scalar(text(
                "INSERT INTO users (name, username, email, birth_date, password_hash, active, social_public, is_admin, "
                "created_at, updated_at) VALUES ('Ana', 'ana.mig', 'ana@mig.com', '1990-01-01', 'x', true, false, "
                "false, now(), now()) RETURNING id"))
            connection.execute(text(
                "INSERT INTO media_objects (id, user_id, bucket, object_key, content_type, size_bytes, created_at) "
                f"VALUES ('{uuid.uuid4()}', {user_id}, 'b', 'receipts/a.pdf', 'application/pdf', 10, now())"))
            command.downgrade(config, '0005')
            assert not STAGE_TWO_TABLES & set(inspect(connection).get_table_names())
            assert connection.scalar(text('SELECT version_num FROM alembic_version')) == '0005'
            # The PDF row survives the downgrade with a neutral size under the older NOT NULL columns.
            assert connection.scalar(text('SELECT width FROM media_objects')) == 0
            command.upgrade(config, 'head')
            head = ScriptDirectory.from_config(config).get_current_head()
            assert connection.scalar(text('SELECT version_num FROM alembic_version')) == head
    finally:
        engine.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


def make_user(db, label):
    user = User(name=f'Atleta {label}', username=f'{label}.{uuid.uuid4().hex[:8]}',
                email=f'{label}-{uuid.uuid4().hex[:8]}@example.com', birth_date='1990-01-01', password_hash='x',
                active=True)
    db.add(user)
    db.flush()
    return user


def rejected(db, *rows):
    with pytest.raises(IntegrityError):
        with db.begin_nested():
            db.add_all(rows)
            db.flush()


def accepted(db, *rows):
    db.add_all(rows)
    db.flush()


def published_event(owner, **values):
    base = dict(organizer_user_id=owner.id, name='Copa Sudoeste Society', sport='futebol', format='society',
                competition_type='eliminacao_simples', capacity=8, city_id=CITY, venue='Arena Sudoeste',
                starts_at=NOW + timedelta(days=10), registration_closes_at=NOW + timedelta(days=7), price_cents=24000,
                pix_beneficiary='Rafa Nunes', pix_key_type='email', pix_key='copa@pix.com', state='publicado',
                published_at=NOW)
    base.update(values)
    return Event(**base)


def media(owner):
    item = MediaObject(id=uuid.uuid4(), user_id=owner.id, bucket='arena-media',
                       object_key=f'receipts/{uuid.uuid4()}.pdf', content_type='application/pdf', size_bytes=100)
    return item


def test_drafts_may_be_incomplete_but_published_events_may_not(client):
    _, db = client
    owner = make_user(db, 'organiza')
    accepted(db, Event(organizer_user_id=owner.id, name='Rascunho', state='rascunho'),
             Event(organizer_user_id=owner.id, name='Elos', state='rascunho', accepted_tiers=['prata', 'ouro']))
    accepted(db, published_event(owner), published_event(owner, price_cents=0, pix_beneficiary=None, pix_key_type=None,
                                                         pix_key=None),
             published_event(owner, sport='corrida', format=None, competition_type=None, distance_km=10, capacity=150,
                             course_notes='Largada no Parque da Cidade'))
    rejected(db, Event(organizer_user_id=owner.id, name='AB', state='rascunho'))
    rejected(db, published_event(owner, venue=None))
    rejected(db, published_event(owner, pix_key=None))
    rejected(db, published_event(owner, published_at=None))
    rejected(db, published_event(owner, capacity=6))
    rejected(db, published_event(owner, sport='corrida', format=None, competition_type=None, distance_km=7))
    rejected(db, published_event(owner, sport='corrida', format=None, distance_km=10))
    rejected(db, published_event(owner, sport='tenis'))
    rejected(db, published_event(owner, accepted_tiers=[]))
    rejected(db, published_event(owner, accepted_tiers=['platina']))
    rejected(db, published_event(owner, price_cents=50))
    rejected(db, published_event(owner, registration_closes_at=NOW + timedelta(days=11)))
    rejected(db, published_event(owner, state='em_aprovacao', published_at=None))
    rejected(db, published_event(owner, state='cancelado'))
    rejected(db, published_event(owner, review_reason_code='pix_incompleto'))
    rejected(db, published_event(owner, revocation_decision='seguir'))
    rejected(db, published_event(owner, revocation_decision='cancelado', revocation_decided_at=NOW))
    accepted(db, published_event(owner, state='em_aprovacao', published_at=None, submitted_at=NOW),
             published_event(owner, state='cancelado', cancelled_at=NOW, cancel_reason='Chuva forte'),
             published_event(owner, revocation_decision='pendente'),
             Event(organizer_user_id=owner.id, name='Recusado', state='rascunho', review_reason_code='outro'))


def test_entries_hold_one_active_spot_per_team_or_athlete(client):
    _, db = client
    owner, athlete = make_user(db, 'organiza'), make_user(db, 'atleta')
    team = Team(name='Ferrugem FC', city_id=CITY, state='ativo')
    paid, free = published_event(owner), published_event(owner, price_cents=0, pix_beneficiary=None,
                                                          pix_key_type=None, pix_key=None)
    accepted(db, team, paid, free)
    reserved = dict(state='reservada', price_cents=24000, reserved_until=NOW + timedelta(hours=48))
    accepted(db, EventEntry(event_id=paid.id, team_id=team.id, **reserved),
             EventEntry(event_id=free.id, user_id=athlete.id, state='confirmada', price_cents=0, confirmed_at=NOW))
    rejected(db, EventEntry(event_id=paid.id, team_id=team.id, **reserved))
    rejected(db, EventEntry(event_id=free.id, user_id=athlete.id, state='confirmada', price_cents=0, confirmed_at=NOW))
    rejected(db, EventEntry(event_id=paid.id, team_id=team.id, user_id=athlete.id, **reserved))
    rejected(db, EventEntry(event_id=paid.id, user_id=owner.id, state='reservada', price_cents=24000))
    rejected(db, EventEntry(event_id=free.id, user_id=owner.id, state='reservada', price_cents=0))
    rejected(db, EventEntry(event_id=paid.id, user_id=owner.id, state='confirmada', **{
        k: v for k, v in reserved.items() if k != 'state'}))
    rejected(db, EventEntry(event_id=paid.id, user_id=owner.id, state='cancelada', cancelled_at=NOW,
                            **{k: v for k, v in reserved.items() if k != 'state'}))
    rejected(db, EventEntry(event_id=paid.id, user_id=owner.id, state='expirada', **{
        k: v for k, v in reserved.items() if k != 'state'}))
    # Finished entries free the spot: the same team may enter again.
    accepted(db, EventEntry(event_id=paid.id, user_id=athlete.id, state='expirada', expired_at=NOW, **{
        k: v for k, v in reserved.items() if k != 'state'}))
    accepted(db, EventEntry(event_id=paid.id, user_id=athlete.id, **reserved))


def test_receipts_keep_one_open_item_and_require_reasons(client):
    _, db = client
    owner, athlete = make_user(db, 'organiza'), make_user(db, 'atleta')
    event = published_event(owner)
    accepted(db, event)
    entry = EventEntry(event_id=event.id, user_id=athlete.id, state='em_analise', price_cents=24000,
                       reserved_until=NOW + timedelta(hours=48))
    accepted(db, entry)
    first = media(athlete)
    accepted(db, first)
    accepted(db, EntryReceipt(entry_id=entry.id, kind='pagamento', media_id=first.id))
    second = media(athlete)
    accepted(db, second)
    rejected(db, EntryReceipt(entry_id=entry.id, kind='pagamento', media_id=second.id))
    rejected(db, EntryReceipt(entry_id=entry.id, kind='pagamento', media_id=second.id, decision='recusado',
                              decided_at=NOW))
    rejected(db, EntryReceipt(entry_id=entry.id, kind='pagamento', media_id=second.id, decision='aprovado'))
    rejected(db, EntryReceipt(entry_id=entry.id, kind='pagamento', media_id=second.id, participant_response='confirmada',
                              responded_at=NOW))
    rejected(db, EntryReceipt(entry_id=entry.id, kind='devolucao', media_id=second.id, decision='aprovado',
                              decided_at=NOW))
    rejected(db, EntryReceipt(entry_id=entry.id, kind='recibo', media_id=second.id))
    # Refused receipts stay as history and do not block the next one.
    accepted(db, EntryReceipt(entry_id=entry.id, kind='pagamento', media_id=second.id, decision='recusado',
                              reason_code='valor_diferente', reason_detail='Veio R$ 200,00', decided_at=NOW))
    refund, other = media(owner), media(owner)
    accepted(db, refund, other)
    accepted(db, EntryReceipt(entry_id=entry.id, kind='devolucao', media_id=refund.id))
    rejected(db, EntryReceipt(entry_id=entry.id, kind='devolucao', media_id=other.id))
    rejected(db, EntryReceipt(entry_id=entry.id, kind='devolucao', media_id=other.id, participant_response='contestada',
                              responded_at=NOW))
    rejected(db, EntryReceipt(entry_id=entry.id, kind='devolucao', media_id=other.id, participant_response='confirmada',
                              responded_at=NOW, resolution='devolvida', resolved_at=NOW, resolution_reason='ok'))
    accepted(db, EntryReceipt(entry_id=entry.id, kind='devolucao', media_id=other.id, participant_response='contestada',
                              responded_at=NOW, contest_reason='Não recebi', resolution='pendente', resolved_at=NOW,
                              resolution_reason='Sem comprovante válido'))


def test_notice_body_is_required(client):
    _, db = client
    owner = make_user(db, 'organiza')
    event = published_event(owner)
    accepted(db, event)
    accepted(db, EventMessage(event_id=event.id, author_id=owner.id, kind='aviso', body='Jogos às 8h.'))
    rejected(db, EventMessage(event_id=event.id, author_id=owner.id, kind='aviso', body=''))

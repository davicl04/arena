"""Capacity under concurrency: simultaneous entries in separate transactions never pass the spots of the event.

Unlike the other integration tests, this one commits in several connections at once (the event lock is what is
being tested), so it creates its own rows with unique names and removes them at the end.
"""
import threading
import uuid
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import sessionmaker

from app.models.audit import AuditLog
from app.models.events import Event, EventEntry
from app.models.identity import User, utcnow
from app.services import entries

CITY = 5300108
ATHLETES = 5


def make_user(db, label):
    tag = uuid.uuid4().hex[:10]
    user = User(name=f'Corredor {label}', username=f'conc.{tag}', email=f'conc-{tag}@example.com',
                birth_date='1990-01-01', password_hash='x', active=True)
    db.add(user)
    db.flush()
    return user


def test_simultaneous_entries_respect_the_capacity(test_engine):
    factory = sessionmaker(bind=test_engine, expire_on_commit=False)
    now = utcnow()
    with factory() as db:
        owner = make_user(db, 'organizador')
        runners = [make_user(db, str(index)) for index in range(ATHLETES)]
        event = Event(organizer_user_id=owner.id, name='Corrida concorrida', sport='corrida', distance_km=5,
                      capacity=2, city_id=CITY, venue='Parque da Cidade', starts_at=now + timedelta(days=5),
                      registration_closes_at=now + timedelta(days=4), price_cents=0, state='publicado',
                      published_at=now)
        db.add(event)
        db.commit()
        event_id, owner_id, runner_ids = event.id, owner.id, [runner.id for runner in runners]

    barrier = threading.Barrier(ATHLETES)
    results: list[object] = []
    lock = threading.Lock()

    def enter(user_id):
        with factory() as db:
            user = db.get(User, user_id)
            barrier.wait()
            try:
                created = entries.create_entry(db, user, event_id, None)
                outcome: object = created.state
            except HTTPException as error:
                outcome = (error.status_code, error.detail)
            with lock:
                results.append(outcome)

    threads = [threading.Thread(target=enter, args=(user_id,)) for user_id in runner_ids]
    try:
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        assert sorted(map(str, results)) == sorted(
            ['confirmada'] * 2 + [str((409, 'As vagas deste evento acabaram.'))] * (ATHLETES - 2))
        with factory() as db:
            held = db.scalar(select(func.count()).select_from(EventEntry).where(EventEntry.event_id == event_id))
            assert held == 2
    finally:
        with factory() as db:
            entry_ids = db.scalars(select(EventEntry.id).where(EventEntry.event_id == event_id)).all()
            db.execute(delete(AuditLog).where(AuditLog.target_type == 'event_entry', AuditLog.target_id.in_(entry_ids)))
            db.execute(delete(Event).where(Event.id == event_id))
            db.execute(delete(User).where(User.id.in_([owner_id, *runner_ids])))
            db.commit()

"""Running marks under concurrency, in separate transactions and connections.

Two taps on "Salvar" for the same race entry leave one mark; marks of several athletes in the same distance, saved
at once, leave a ranking with every mark counted, positions 1..N without repeats and the order by time (the
advisory lock of the ranking serializes the recalculations, and each one reads the others' committed marks).
Like the other concurrency tests, it commits and removes its own rows.
"""
import threading
import uuid
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import sessionmaker

from app.models.audit import AuditLog
from app.models.events import Event, EventEntry
from app.models.identity import User, utcnow
from app.models.rankings import Standing
from app.models.runs import Run
from app.schemas.runs import RunInput
from app.services import runs
from app.services.match_rules import TransitionError
from tests.integration.sql_trace import first_index, ranking_lock, record_sql, row_lock

CITY = 5300108
ATHLETES = 6


def make_user(db, label):
    tag = uuid.uuid4().hex[:10]
    user = User(name=f'Corredor {label}', username=f'runc.{tag}', email=f'runc-{tag}@example.com',
                birth_date='1990-01-01', password_hash='x', active=True)
    db.add(user)
    db.flush()
    return user


def cleanup(factory, user_ids, event_ids=()):
    with factory() as db:
        run_ids = db.scalars(select(Run.id).where(Run.user_id.in_(user_ids))).all()
        db.execute(delete(AuditLog).where(AuditLog.target_type == 'run', AuditLog.target_id.in_(run_ids)))
        db.execute(delete(Run).where(Run.user_id.in_(user_ids)))
        db.execute(delete(Standing).where(Standing.user_id.in_(user_ids)))
        if event_ids:
            db.execute(delete(Event).where(Event.id.in_(event_ids)))
        db.execute(delete(User).where(User.id.in_(user_ids)))
        db.commit()


def run_together(workers):
    barrier = threading.Barrier(len(workers))
    outcomes: list[object] = []
    lock = threading.Lock()

    def target(work):
        barrier.wait()
        try:
            outcome: object = work()
        except (HTTPException, TransitionError) as error:
            outcome = (getattr(error, 'status_code', 409), str(getattr(error, 'detail', error)))
        with lock:
            outcomes.append(outcome)

    threads = [threading.Thread(target=target, args=(work,)) for work in workers]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    assert len(outcomes) == len(workers), 'a registration did not finish'
    return outcomes


def test_a_double_tap_on_a_race_mark_leaves_a_single_mark(test_engine):
    factory = sessionmaker(bind=test_engine, expire_on_commit=False)
    now = utcnow()
    with factory() as db:
        owner, athlete = make_user(db, 'organizador'), make_user(db, 'atleta')
        event = Event(organizer_user_id=owner.id, name='Corrida concorrida', sport='corrida', distance_km=10,
                      capacity=50, city_id=CITY, venue='Parque da Cidade', starts_at=now - timedelta(hours=3),
                      registration_closes_at=now - timedelta(days=2), price_cents=0, state='publicado',
                      published_at=now - timedelta(days=5))
        db.add(event)
        db.flush()
        entry = EventEntry(event_id=event.id, user_id=athlete.id, registered_by_id=athlete.id, state='confirmada',
                           price_cents=0, confirmed_at=now - timedelta(days=3), created_at=now - timedelta(days=3))
        db.add(entry)
        db.commit()
        owner_id, athlete_id, event_id, entry_id = owner.id, athlete.id, event.id, entry.id

    def tap():
        with factory() as db:
            user = db.get(User, athlete_id)
            data = RunInput(distance_m=10000, duration_s=3000, source='prova', entry_id=entry_id)
            return runs.create_run(db, user, data, now=utcnow()).run.id

    try:
        outcomes = run_together([tap, tap, tap])
        created = [item for item in outcomes if isinstance(item, int)]
        refused = [item for item in outcomes if isinstance(item, tuple)]
        assert len(created) == 1 and len(refused) == 2
        assert all(status == 409 for status, _ in refused)
        with factory() as db:
            assert len(db.scalars(select(Run.id).where(Run.event_entry_id == entry_id)).all()) == 1
            assert db.scalar(select(Standing.matches_played).where(Standing.user_id == athlete_id)) == 1
    finally:
        cleanup(factory, [owner_id, athlete_id], [event_id])


def test_marks_saved_at_once_leave_a_consistent_ranking(test_engine):
    factory = sessionmaker(bind=test_engine, expire_on_commit=False)
    with factory() as db:
        athletes = [make_user(db, str(index)) for index in range(ATHLETES)]
        db.commit()
        user_ids = [athlete.id for athlete in athletes]
    # Distinct times, in an order unrelated to the order the threads start.
    seconds = {user_id: 1500 + 37 * ((index * 5) % ATHLETES) for index, user_id in enumerate(user_ids)}

    def save(user_id):
        def work():
            with factory() as db:
                user = db.get(User, user_id)
                data = RunInput(distance_m=5000, duration_s=seconds[user_id], source='treino')
                return runs.create_run(db, user, data, now=utcnow()).run.id
        return work

    try:
        outcomes = run_together([save(user_id) for user_id in user_ids])
        assert all(isinstance(item, int) for item in outcomes), outcomes
        with factory() as db:
            rows = db.scalars(select(Standing).where(Standing.user_id.in_(user_ids), Standing.sport == 'corrida',
                                                     Standing.distance_km == 5).order_by(Standing.rank_position)).all()
        assert [row.rank_position for row in rows] == list(range(1, ATHLETES + 1))
        assert [row.user_id for row in rows] == sorted(user_ids, key=lambda user_id: seconds[user_id])
        assert [float(row.metric_value) for row in rows] == sorted(float(value) for value in seconds.values())
    finally:
        cleanup(factory, user_ids)


def test_a_mark_takes_its_locks_in_the_global_order_and_the_ranking_last(test_engine):
    """Order of 0003 section 19.1 (0002, 15.5): event FOR SHARE → entry FOR UPDATE → ranking of the distance. Removing
    a mark locks only the mark and then the ranking. Nothing waits for a lower level while holding a higher one."""
    factory = sessionmaker(bind=test_engine, expire_on_commit=False)
    now = utcnow()
    with factory() as db:
        owner, athlete = make_user(db, 'organizador'), make_user(db, 'atleta')
        event = Event(organizer_user_id=owner.id, name='Corrida em ordem', sport='corrida', distance_km=10,
                      capacity=50, city_id=CITY, venue='Parque da Cidade', starts_at=now - timedelta(hours=3),
                      registration_closes_at=now - timedelta(days=2), price_cents=0, state='publicado',
                      published_at=now - timedelta(days=5))
        db.add(event)
        db.flush()
        entry = EventEntry(event_id=event.id, user_id=athlete.id, registered_by_id=athlete.id, state='confirmada',
                           price_cents=0, confirmed_at=now - timedelta(days=3), created_at=now - timedelta(days=3))
        db.add(entry)
        db.commit()
        owner_id, athlete_id, event_id, entry_id = owner.id, athlete.id, event.id, entry.id

    def register(db):
        data = RunInput(distance_m=10000, duration_s=3000, source='prova', entry_id=entry_id)
        return runs.create_run(db, db.get(User, athlete_id), data, now=utcnow()).run.id

    try:
        log, run_id = record_sql(test_engine, register)
        shared = first_index(log, row_lock('events', event_id, share=True))
        locked = first_index(log, row_lock('event_entries', entry_id))
        assert shared < locked < first_index(log, ranking_lock)

        log, _ = record_sql(test_engine, lambda db: runs.delete_run(db, db.get(User, athlete_id), run_id, now=utcnow()))
        assert first_index(log, row_lock('runs', run_id)) < first_index(log, ranking_lock)
        assert not any('FROM events' in sql and 'FOR' in sql for sql, _ in log)      # removing needs no event lock
    finally:
        cleanup(factory, [owner_id, athlete_id], [event_id])

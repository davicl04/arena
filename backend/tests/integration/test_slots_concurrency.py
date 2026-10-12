"""Walk-in slots under real concurrency: separate connections and transactions that commit, in a dedicated schema.

One slot, one athlete: the offer holds the slot for a single walk-in, accepting fills it under the match, slot and
search locks, and the routes that release or open slots take the bucket of the city first. Each test starts its
operations together (a barrier) and checks the invariant that must hold whichever side wins the race:
- two walk-ins accepting the same slot, and a double tap of the one who holds it: a single one enters;
- "Quero jogar" against "Recusar" and against the representative closing the slot: the slot ends in one state;
- a walk-in enqueuing while another declines: no deadlock, the slot is offered to the one waiting;
- the same adjustment of the slots sent twice opens the slots once.
The accepted answers are the ones of the routes (`HTTPException`), so the tests call the services of the routes.
"""
import os
import threading
import time
import uuid
from datetime import timedelta
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from app.models.identity import User, utcnow
from app.models.matches import MatchLineup, MatchSearch, MatchSlot
from app.models.notifications import Notification
from app.services import slots as slot_service
from app.services.matchmaking_queue import queue
from tests.integration.match_helpers import make_team, make_user, scheduled_match, walkin_search

BACKEND = Path(__file__).resolve().parents[2]
PAUSE = 0.3
CITIES = (5300108, 3550308, 3304557, 2304400, 3106200, 5208707)


@pytest.fixture(scope='module')
def engine():
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('Defina TEST_DATABASE_URL para executar integração com PostgreSQL.')
    admin = create_engine(url)
    schema = 'arena_slots_' + uuid.uuid4().hex
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={'options': f'-csearch_path={schema}'}, pool_size=12)
    try:
        config = Config(str(BACKEND / 'alembic.ini'))
        config.set_main_option('script_location', str(BACKEND / 'migrations'))
        with engine.begin() as connection:
            config.attributes['connection'] = connection
            command.upgrade(config, 'head')
        yield engine
    finally:
        engine.dispose()
        # Only the schema created here is removed.
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


@pytest.fixture(autouse=True)
def slow_transactions(monkeypatch):
    """Widens the race window: the transaction of a fill or of a change of slots stays open (locks held) for a
    moment before it commits, so whoever comes second really has to wait for the locks."""
    accept_offer, plan_changes = queue.accept_offer, slot_service.plan_slot_changes

    def slow_accept(*args, **kwargs):
        result = accept_offer(*args, **kwargs)
        time.sleep(PAUSE)
        return result

    def slow_plan(*args, **kwargs):
        result = plan_changes(*args, **kwargs)
        time.sleep(PAUSE)
        return result

    monkeypatch.setattr(queue, 'accept_offer', slow_accept)
    monkeypatch.setattr(slot_service, 'plan_slot_changes', slow_plan)


def run_together(engine, jobs):
    """Runs each job in its own session and transaction, released at the same moment; commits each one."""
    # Open the connections first: connecting takes longer than the pause that widens the race window.
    for connection in [engine.connect() for _ in jobs]:
        connection.close()
    barrier = threading.Barrier(len(jobs))
    results, errors = [None] * len(jobs), []

    def worker(index, job):
        try:
            with Session(engine, expire_on_commit=False) as db:
                barrier.wait(timeout=10)
                results[index] = job(db)
                db.commit()
        except Exception as error:  # surfaced below with the thread's failure
            errors.append(error)

    threads = [threading.Thread(target=worker, args=(index, job)) for index, job in enumerate(jobs)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=60)
    assert not errors, errors
    return results


def setup(engine, build):
    with Session(engine, expire_on_commit=False) as db:
        result = build(db)
        db.commit()
    return result


def status(call):
    """The HTTP status the route would answer: 200 (or the given success status) or the error's."""
    def job(db):
        try:
            call(db)
        except HTTPException as error:
            return error.status_code
        return 200
    return job


def world(engine, city, *, slots_a, walkins=2):
    """Two teams with a scheduled match opening `slots_a`, and `walkins` athletes.

    Slots left open by an earlier round are closed first, so the offer of this round is for this match."""
    def build(db):
        db.execute(text("UPDATE match_slots SET state = 'fechada', closed_at = now() WHERE state = 'aberta'"))
        rep_a, rep_b = make_user(db, 'rep_a'), make_user(db, 'rep_b')
        team_a = make_team(db, rep_a, name='Time A', city_id=city)
        team_b = make_team(db, rep_b, name='Time B', city_id=city)
        now = utcnow()
        match = scheduled_match(db, team_a, team_b, city_id=city, slots_a=slots_a, now=now,
                                starts_at=now + timedelta(days=2))
        return rep_a, match, [make_user(db, f'avulso{index}') for index in range(walkins)]
    return setup(engine, build)


def enqueue(user, city, position='atacante'):
    def job(db):
        at = utcnow()
        pairing = queue.enqueue(db, walkin_search(user, position=position, started_at=at, city_id=city), now=at)
        return pairing.slot.id if pairing else None
    return job


def accept(user, slot_id):
    return status(lambda db: slot_service.accept_slot(db, db.get(User, user.id), slot_id))


def decline(user, slot_id):
    return status(lambda db: slot_service.decline_slot(db, db.get(User, user.id), slot_id))


def slot_state(engine, slot_id):
    with Session(engine) as db:
        slot = db.get(MatchSlot, slot_id)
        return slot.state, slot.filled_by_id


def search_state(engine, user):
    with Session(engine) as db:
        return db.scalar(select(MatchSearch.state).where(MatchSearch.user_id == user.id)
                         .order_by(MatchSearch.id.desc()))


def lineups(engine, match):
    with Session(engine) as db:
        return db.scalars(select(MatchLineup.user_id).where(MatchLineup.match_id == match.id)).all()


def test_two_walkins_accepting_the_same_slot_only_one_enters(engine):
    city = CITIES[0]
    _, match, (first, second) = world(engine, city, slots_a={'atacante': 1})
    offered = run_together(engine, [enqueue(first, city), enqueue(second, city)])
    # The offer reserves the slot for exactly one of them.
    assert sorted(item is None for item in offered) == [False, True]
    slot_id = next(item for item in offered if item is not None)

    answers = run_together(engine, [accept(first, slot_id), accept(second, slot_id)])
    assert sorted(answers) == [200, 404]
    winner = first if answers[0] == 200 else second
    loser = second if winner is first else first
    assert slot_state(engine, slot_id) == ('preenchida', winner.id)
    assert lineups(engine, match) == [winner.id]
    assert search_state(engine, winner) == 'concluida' and search_state(engine, loser) == 'ativa'
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(Notification).where(
            Notification.type == 'vaga_preenchida')) == 1


def test_a_double_tap_on_quero_jogar_fills_the_slot_once(engine):
    city = CITIES[1]
    _, match, (keeper,) = world(engine, city, slots_a={'goleiro': 1}, walkins=1)
    slot_id = run_together(engine, [enqueue(keeper, city, 'goleiro')])[0]
    answers = run_together(engine, [accept(keeper, slot_id), accept(keeper, slot_id)])
    # The second tap waits for the first one's locks: the offer is already used (409) or no longer pending (404).
    assert sorted(answers) in ([200, 404], [200, 409])
    assert slot_state(engine, slot_id) == ('preenchida', keeper.id)
    assert lineups(engine, match) == [keeper.id]


def test_accepting_and_declining_the_same_offer_end_in_one_state(engine):
    city = CITIES[2]
    for _ in range(3):
        _, match, (walkin,) = world(engine, city, slots_a={'atacante': 1}, walkins=1)
        slot_id = run_together(engine, [enqueue(walkin, city)])[0]
        accepted, declined = run_together(engine, [accept(walkin, slot_id), decline(walkin, slot_id)])
        if accepted == 200:
            # Accept won: the decline finds nothing to decline.
            assert declined in (404, 409)
            assert slot_state(engine, slot_id) == ('preenchida', walkin.id)
            assert (search_state(engine, walkin), lineups(engine, match)) == ('concluida', [walkin.id])
        else:
            # Decline won: the slot is open again and the accept is refused.
            assert (accepted, declined) in ((409, 200), (404, 200))
            assert slot_state(engine, slot_id) == ('aberta', None)
            assert (search_state(engine, walkin), lineups(engine, match)) == ('recusada', [])


def test_accepting_while_the_representative_closes_the_slot(engine):
    city = CITIES[3]
    for _ in range(3):
        rep, match, (walkin,) = world(engine, city, slots_a={'atacante': 1}, walkins=1)
        slot_id = run_together(engine, [enqueue(walkin, city)])[0]
        accepted, closed = run_together(engine, [
            accept(walkin, slot_id),
            status(lambda db, rep=rep, match=match: slot_service.update_slots(db, db.get(User, rep.id), match.id, {}))])
        assert closed == 200
        if accepted == 200:
            # The walk-in got in first: the filled slot stays and nothing else was closed.
            assert slot_state(engine, slot_id) == ('preenchida', walkin.id)
            assert lineups(engine, match) == [walkin.id]
        else:
            # The slot was closed first: the offer is gone and the walk-in waits again.
            assert accepted in (404, 409)
            assert slot_state(engine, slot_id) == ('fechada', None)
            assert (search_state(engine, walkin), lineups(engine, match)) == ('ativa', [])


def test_enqueuing_while_another_walkin_declines_does_not_deadlock(engine):
    city = CITIES[4]
    _, match, (first, second) = world(engine, city, slots_a={'atacante': 1})
    slot_id = run_together(engine, [enqueue(first, city)])[0]
    results = run_together(engine, [decline(first, slot_id), enqueue(second, city)])
    assert results[0] == 200
    # Whichever came first, the slot ends offered to the one who kept waiting.
    assert slot_state(engine, slot_id) == ('oferecida', None)
    assert (search_state(engine, first), search_state(engine, second)) == ('recusada', 'pareada')


def test_the_same_adjustment_sent_twice_opens_the_slots_once(engine):
    city = CITIES[5]
    rep, match, _ = world(engine, city, slots_a={'atacante': 1}, walkins=0)

    def adjust(db):
        slot_service.update_slots(db, db.get(User, rep.id), match.id, {'atacante': 2})

    assert run_together(engine, [status(adjust), status(adjust)]) == [200, 200]
    with Session(engine) as db:
        states = db.scalars(select(MatchSlot.state).where(MatchSlot.match_id == match.id)).all()
    assert states == ['aberta', 'aberta']

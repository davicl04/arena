"""Matchmaking under real concurrency: separate connections and transactions that commit, in a dedicated schema.

The pairing of a bucket is serialized by `pg_advisory_xact_lock`. These tests start the searches together (a
barrier) and widen the race window with a pause after reading the candidates, while the transaction is still open:
- two compatible searches created at the same moment end paired (none stays waiting);
- a search never enters two proposals, however many arrive together;
- without the bucket lock the same scenario leaves both searches waiting, which shows the test sees the race.
"""
import os
import threading
import time
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from app.models.identity import User
from app.models.matches import Match, MatchLineup, MatchSearch, MatchSide, MatchSlot
from app.services import matchmaking_queue
from app.services.matchmaking_queue import PostgresMatchmakingQueue
from tests.integration.match_helpers import (
    NOW,
    add,
    make_team,
    make_user,
    scheduled_match,
    team_search,
    tennis_search,
    walkin_search,
)

BACKEND = Path(__file__).resolve().parents[2]
PAUSE = 0.4


@pytest.fixture(scope='module')
def engine():
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('Defina TEST_DATABASE_URL para executar integração com PostgreSQL.')
    admin = create_engine(url)
    schema = 'arena_conc_' + uuid.uuid4().hex
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


def slow_queue(*, with_lock=True):
    """A queue that pauses after reading the candidates (the transaction and the bucket lock stay open)."""
    queue = PostgresMatchmakingQueue()
    read = queue._candidates

    def candidates(db, current, now):
        rows = read(db, current, now)
        time.sleep(PAUSE)
        return rows

    queue._candidates = candidates
    if not with_lock:
        queue.lock_bucket = lambda db, key: None
    return queue


def run_together(engine, jobs):
    """Runs each job in its own session and transaction, released at the same moment; commits each one."""
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


def teams(db, count, city_id):
    reps = [make_user(db, f'rep{index}') for index in range(count)]
    return [(make_team(db, rep, name=f'Time {index}', city_id=city_id), rep) for index, rep in enumerate(reps)]


def enqueue_job(queue, build_search):
    def job(db):
        pairing = queue.enqueue(db, build_search(), now=NOW)
        return pairing.match.id if pairing else None
    return job


@pytest.fixture(autouse=True)
def slow_fill(monkeypatch):
    """Widens the window between the state check of "Quero jogar" and its writes, with the locks (if any) held."""
    original = matchmaking_queue.next_search_state

    def slow(state, action):
        if action == 'concluir':
            time.sleep(PAUSE)
        return original(state, action)

    monkeypatch.setattr(matchmaking_queue, 'next_search_state', slow)


def accept_job(queue, slot_id, user_id):
    """"Quero jogar" of the athlete in its own session; the answer is True, False or the name of the error."""
    def accept(db):
        try:
            return queue.accept_offer(db, slot_id, db.get(User, user_id), now=NOW) is not None
        except Exception as error:  # the loser sees the slot already filled
            db.rollback()
            return type(error).__name__
    return accept


def searches(engine, ids):
    with Session(engine) as db:
        return db.scalars(select(MatchSearch).where(MatchSearch.id.in_(ids)).order_by(MatchSearch.id)).all()


def test_two_compatible_searches_created_together_end_paired(engine):
    for city in (5300108, 3550308, 3304557):
        pair = setup(engine, lambda db, city=city: teams(db, 2, city))
        results = run_together(engine, [enqueue_job(slow_queue(), lambda team=team, rep=rep, city=city:
                                                    team_search(team, rep, city_id=city)) for team, rep in pair])
        # Exactly one of the two found the other (the second to take the bucket lock).
        assert sorted(result is None for result in results) == [False, True]
        match_id = next(result for result in results if result is not None)
        with Session(engine) as db:
            states = db.scalars(select(MatchSearch.state).where(MatchSearch.match_id == match_id)).all()
            assert sorted(states) == ['pareada', 'pareada']
            assert db.scalar(select(Match.state).where(Match.id == match_id)) == 'proposta'


def test_without_the_bucket_lock_both_searches_would_keep_waiting(engine):
    players = setup(engine, lambda db: [make_user(db, 'tenista-a'), make_user(db, 'tenista-b')])
    results = run_together(engine, [enqueue_job(slow_queue(with_lock=False), lambda user=user: tennis_search(
        user, city_id=2304400)) for user in players])
    assert results == [None, None]
    with Session(engine) as db:
        waiting = db.scalars(select(MatchSearch.state).where(
            MatchSearch.user_id.in_([user.id for user in players]))).all()
        assert waiting == ['ativa', 'ativa']


def test_a_search_never_enters_two_proposals(engine):
    city = 3106200
    squads = setup(engine, lambda db: teams(db, 9, city))
    # The oldest search waits before the others arrive: the first one to take the lock pairs with it.
    waiting = setup(engine, lambda db: add(db, team_search(*squads[0], city_id=city)))
    results = run_together(engine, [enqueue_job(slow_queue(), lambda team=team, rep=rep: team_search(
        team, rep, city_id=city)) for team, rep in squads[1:]])
    matches = [result for result in results if result is not None]
    assert len(matches) == 4  # nine searches: four proposals and one search still waiting
    with Session(engine) as db:
        sides = db.execute(select(MatchSide.search_id, func.count()).join(Match, Match.id == MatchSide.match_id)
                           .where(Match.city_id == city).group_by(MatchSide.search_id)).all()
        assert all(total == 1 for _, total in sides) and len(sides) == 8
        rows = db.scalars(select(MatchSearch).where(MatchSearch.city_id == city)).all()
        assert sorted(row.state for row in rows) == ['ativa'] + ['pareada'] * 8
        assert len({row.match_id for row in rows if row.match_id}) == 4
        assert db.scalar(select(MatchSearch.state).where(MatchSearch.id == waiting.id)) == 'pareada'


def test_two_walkins_racing_for_one_slot_get_one_offer(engine):
    def build(db):
        (team_a, _), (team_b, _) = teams(db, 2, 5208707)
        scheduled_match(db, team_a, team_b, city_id=5208707, slots_a={'atacante': 1})
        return [make_user(db, 'avulso-a'), make_user(db, 'avulso-b')]

    walkins = setup(engine, build)
    queue = PostgresMatchmakingQueue()
    results = run_together(engine, [enqueue_job(queue, lambda user=user: walkin_search(
        user, position='atacante', city_id=5208707)) for user in walkins])
    assert sorted(result is None for result in results) == [False, True]
    with Session(engine) as db:
        rows = db.scalars(select(MatchSearch).where(MatchSearch.user_id.in_([user.id for user in walkins]))).all()
        assert sorted(row.state for row in rows) == ['ativa', 'pareada']
        offered = next(row for row in rows if row.state == 'pareada')
        assert db.scalar(select(MatchSlot.state).where(MatchSlot.id == offered.slot_id)) == 'oferecida'


def test_a_double_tap_on_quero_jogar_fills_the_slot_once(engine):
    def build(db):
        (team_a, _), (team_b, _) = teams(db, 2, 2304400)
        scheduled_match(db, team_a, team_b, city_id=2304400, slots_a={'goleiro': 1})
        return make_user(db, 'goleiro')

    keeper = setup(engine, build)
    queue = PostgresMatchmakingQueue()
    slot_id = setup(engine, lambda db: queue.enqueue(db, walkin_search(keeper, position='goleiro', city_id=2304400),
                                                     now=NOW).slot.id)

    results = run_together(engine, [accept_job(queue, slot_id, keeper.id)] * 2)
    # The second tap waits for the first one's lock and finds the slot filled (or no longer offered).
    assert sorted(map(str, results)) in (['TransitionError', 'True'], ['False', 'True'])
    with Session(engine) as db:
        slot = db.get(MatchSlot, slot_id)
        assert (slot.state, slot.filled_by_id) == ('preenchida', keeper.id)
        assert db.scalar(select(func.count()).select_from(MatchLineup).where(MatchLineup.slot_id == slot_id)) == 1


def test_without_the_row_locks_the_double_tap_would_break_the_unique_index(engine, monkeypatch):
    """The same double tap with the `FOR UPDATE` re-reads removed: both taps pass the state check and the second
    one hits the unique lineup (one athlete per match), so the test sees the race the locks close."""
    def build(db):
        (team_a, _), (team_b, _) = teams(db, 2, 5300108)
        scheduled_match(db, team_a, team_b, city_id=5300108, slots_a={'goleiro': 1})
        return make_user(db, 'goleiro-sem-trava')

    keeper = setup(engine, build)
    slot_id = setup(engine, lambda db: PostgresMatchmakingQueue().enqueue(
        db, walkin_search(keeper, position='goleiro', city_id=5300108), now=NOW).slot.id)
    unlocked = PostgresMatchmakingQueue()
    monkeypatch.setattr(matchmaking_queue, '_locked', lambda db, model, row_id, skip_locked=False: db.get(
        model, row_id, populate_existing=True))
    results = run_together(engine, [accept_job(unlocked, slot_id, keeper.id)] * 2)
    assert 'IntegrityError' in map(str, results)

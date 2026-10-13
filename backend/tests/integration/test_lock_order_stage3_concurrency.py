"""Global lock order of stage 3 under real concurrency (docs/decisoes/0002-jogar.md, section 15.1).

The order is team → match → ranking → bucket (advisory) → slot → search. Each test holds the first transaction open
at the moment it has taken its first locks (a pause inside the service) and starts a second one a moment later, on
separate connections that commit, in a dedicated schema. With the locks taken in any other order the two
transactions wait for each other and PostgreSQL aborts one of them with a deadlock error, which `run_together`
surfaces; with the order below both finish:
- the sweep of lapsed offers (`expire_offers`) against the representative closing the offered slot;
- a walk-in cancelling a search whose offer lapsed (the read applies the expiry) against the same closing;
- the second acceptance of the terms (which opens the declared slots and offers them) against the representative
  adjusting the slots of the same match;
- a sweep of lapsed proposals and offers over several cities, which commits between buckets and proposals.
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
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app.models.identity import User, utcnow
from app.models.matches import Court, Match, MatchSearch, MatchSide, MatchSlot, MatchTerms
from app.services import matches as match_service
from app.services import matchmaking, sweep
from app.services import slots as slot_service
from app.services.match_rules import court_key
from app.services.matchmaking_queue import queue
from tests.integration.match_helpers import (
    add,
    make_team,
    make_user,
    scheduled_match,
    team_search,
    walkin_search,
)

BACKEND = Path(__file__).resolve().parents[2]
HOLD = 0.6        # how long the first transaction stays open with its first locks held
LATE = 0.2        # when the second one starts, after the first took its locks
CITIES = (5300108, 3550308, 3304557, 2304400, 3106200)


@pytest.fixture(scope='module')
def engine():
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('Defina TEST_DATABASE_URL para executar integração com PostgreSQL.')
    admin = create_engine(url)
    schema = 'arena_order_' + uuid.uuid4().hex
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


def run_together(engine, jobs):
    """Runs each job in its own session and transaction, released at the same moment; commits each one."""
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
    """The HTTP status the route would answer: 200 or the error's."""
    def job(db):
        try:
            call(db)
        except HTTPException as error:
            return error.status_code
        return 200
    return job


def late(job, seconds=LATE):
    """The same job, started a moment after the other one has taken its first locks."""
    def delayed(db):
        time.sleep(seconds)
        return job(db)
    return delayed


def hold_in(monkeypatch, owner, name):
    """Pauses `owner.name` before it runs: the caller already holds its first locks and keeps them meanwhile."""
    original = getattr(owner, name)

    def paused(*args, **kwargs):
        time.sleep(HOLD)
        return original(*args, **kwargs)

    monkeypatch.setattr(owner, name, paused)


def offered_slot(engine, city):
    """A scheduled match whose atacante slot is offered to a walk-in, plus the representative of the side."""
    def build(db):
        db.execute(text("UPDATE match_slots SET state = 'fechada', closed_at = now() WHERE state = 'aberta'"))
        rep_a, rep_b = make_user(db, 'rep_a'), make_user(db, 'rep_b')
        team_a = make_team(db, rep_a, name='Time A', city_id=city)
        team_b = make_team(db, rep_b, name='Time B', city_id=city)
        now = utcnow()
        match = scheduled_match(db, team_a, team_b, city_id=city, slots_a={'atacante': 1}, now=now,
                                starts_at=now + timedelta(days=2))
        walkin = make_user(db, 'avulso')
        pairing = queue.enqueue(db, walkin_search(walkin, position='atacante', started_at=now, city_id=city),
                                now=now)
        return rep_a, match, walkin, pairing.slot.id, pairing.searches[0].id
    return setup(engine, build)


def slot_and_search(engine, slot_id, search_id):
    with Session(engine) as db:
        return db.scalar(select(MatchSlot.state).where(MatchSlot.id == slot_id)), db.scalar(
            select(MatchSearch.state).where(MatchSearch.id == search_id))


def test_the_sweep_of_lapsed_offers_does_not_deadlock_with_the_representative_closing_the_slot(engine, monkeypatch):
    rep, match, _, slot_id, search_id = offered_slot(engine, CITIES[0])
    hold_in(monkeypatch, queue, 'release_offer')
    later = utcnow() + timedelta(hours=3)
    expired, closed = run_together(engine, [
        lambda db: queue.expire_offers(db, later),
        late(status(lambda db: slot_service.update_slots(db, db.get(User, rep.id), match.id, {})))])
    assert closed == 200
    # Whichever came first, the slot ends closed; the walk-in ended without answer or went back to the queue.
    state, search = slot_and_search(engine, slot_id, search_id)
    assert state == 'fechada' and search in ('sem_resposta', 'ativa')
    assert (expired, search) in ((1, 'sem_resposta'), (0, 'ativa'))


def test_cancelling_a_search_with_a_lapsed_offer_does_not_deadlock_with_the_representative(engine, monkeypatch):
    rep, match, walkin, slot_id, search_id = offered_slot(engine, CITIES[1])
    hold_in(monkeypatch, queue, 'release_offer')
    later = utcnow() + timedelta(hours=3)
    cancelled, closed = run_together(engine, [
        status(lambda db: matchmaking.cancel_search(db, db.get(User, walkin.id), search_id, now=later)),
        late(status(lambda db: slot_service.update_slots(db, db.get(User, rep.id), match.id, {})))])
    assert closed == 200 and cancelled in (200, 409)
    state, search = slot_and_search(engine, slot_id, search_id)
    assert state == 'fechada' and search in ('sem_resposta', 'ativa')


def pending_terms(engine, city):
    """A match being arranged: side A declared one atacante slot and proposed terms that side B has yet to accept."""
    def build(db):
        rep_a, rep_b = make_user(db, 'rep_a'), make_user(db, 'rep_b')
        team_a = make_team(db, rep_a, name='Time A', city_id=city)
        team_b = make_team(db, rep_b, name='Time B', city_id=city)
        now = utcnow()
        court = add(db, Court(city_id=city, name='Quadra Central', name_key=court_key('Quadra Central'),
                              kind='society', state='publicada', published_at=now, reviewed_at=now, created_at=now))
        match = add(db, Match(sport='futebol', format='society', city_id=city, origin='amistoso', state='combinando',
                              created_at=now, updated_at=now))
        add(db, MatchSide(match_id=match.id, side='a', team_id=team_a.id, declared_slots={'atacante': 1},
                          accepted_at=now, created_at=now),
            MatchSide(match_id=match.id, side='b', team_id=team_b.id, declared_slots={}, accepted_at=now,
                      created_at=now))
        terms = add(db, MatchTerms(match_id=match.id, proposed_by_id=rep_a.id, proposed_by_side='a',
                                   starts_at=now + timedelta(days=2), court_id=court.id, booking_side='a',
                                   state='pendente', accepted_a_at=now, accepted_a_by_id=rep_a.id, created_at=now))
        waiting = make_user(db, 'avulso')
        search = add(db, walkin_search(waiting, position='atacante', started_at=now, city_id=city))
        return rep_a, rep_b, match, terms, waiting, search
    return setup(engine, build)


def test_accepting_the_terms_does_not_deadlock_with_the_representative_adjusting_the_slots(engine, monkeypatch):
    rep_a, rep_b, match, terms, _, search = pending_terms(engine, CITIES[2])
    # The pause comes after the acceptance locked the match and before it offers the slots (and takes the bucket).
    hold_in(monkeypatch, match_service, 'open_declared_slots')
    accepted, adjusted = run_together(engine, [
        status(lambda db: match_service.accept_terms(db, db.get(User, rep_b.id), match.id, terms.id, now=utcnow())),
        late(status(lambda db: slot_service.update_slots(db, db.get(User, rep_a.id), match.id, {'atacante': 2})))])
    assert (accepted, adjusted) == (200, 200)
    with Session(engine) as db:
        assert db.scalar(select(Match.state).where(Match.id == match.id)) == 'agendada'
        states = db.scalars(select(MatchSlot.state).where(MatchSlot.match_id == match.id)).all()
        # Two atacante slots: the declared one and the one added; the waiting walk-in holds one of them.
        assert sorted(states) == ['aberta', 'oferecida']
        assert db.scalar(select(MatchSearch.state).where(MatchSearch.id == search.id)) == 'pareada'


def test_the_sweep_commits_between_proposals_and_cities(engine):
    def build(db):
        squads = []
        for city in CITIES[3:5]:
            rep_a, rep_b = make_user(db, 'rep_a'), make_user(db, 'rep_b')
            team_a = make_team(db, rep_a, name='Time A', city_id=city)
            team_b = make_team(db, rep_b, name='Time B', city_id=city)
            now = utcnow() - timedelta(hours=3)
            queue.enqueue(db, team_search(team_a, rep_a, started_at=now, city_id=city), now=now)
            squads.append(queue.enqueue(db, team_search(team_b, rep_b, started_at=now, city_id=city),
                                        now=now).match.id)
        return squads

    proposals = setup(engine, build)
    commits = []

    def counted(db):
        def commit():
            commits.append(1)
            db.commit()
        # Both proposals lapsed (created 3 h ago): each ends in its own transaction.
        return queue.expire_proposals(db, utcnow(), commit=commit)

    assert run_together(engine, [counted]) == [2] and len(commits) == 2
    with Session(engine) as db:
        assert set(db.scalars(select(Match.state).where(Match.id.in_(proposals))).all()) == {'expirada'}
    # The task of the sweep does the same and is idempotent.
    with Session(engine) as db:
        assert sweep.expire_proposals(db, utcnow()) == 0

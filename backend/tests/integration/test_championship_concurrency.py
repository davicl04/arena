"""Campeonatos sob concorrência real: conexões separadas, transações que gravam, num esquema dedicado.

- Dois agendamentos no mesmo horário e na mesma quadra: a trava do evento serializa as transações, então o segundo
  enxerga o primeiro e recebe o conflito de 2 h (sem a trava os dois passariam).
- As duas semifinais confirmadas ao mesmo tempo levam os dois vencedores à final, sem impasse nem perda: a trava da
  partida seguinte serializa o avanço, e só o segundo vencedor encontra o adversário definido.
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
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from app.models.events import Event, EventEntry
from app.models.identity import User
from app.models.matches import Match, MatchMessage, MatchResult, MatchSide
from app.models.notifications import Notification
from app.schemas.brackets import ResultDecisionInput, ScheduleInput
from app.schemas.matches import ResultInput
from app.services import championship, championship_lifecycle, results
from tests.integration.match_helpers import CITY, NOW, add, make_team, make_user
from tests.integration.partida.helpers import make_court
from tests.integration.sql_trace import first_index, ranking_lock, record_sql, row_lock

BACKEND = Path(__file__).resolve().parents[2]
PAUSE = 0.4
H = timedelta(hours=1)


@pytest.fixture(scope='module')
def engine():
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('Defina TEST_DATABASE_URL para executar integração com PostgreSQL.')
    admin = create_engine(url)
    schema = 'arena_champ_' + uuid.uuid4().hex
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={'options': f'-csearch_path={schema}'}, pool_size=8)
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
    """Each job in its own session and transaction, released at the same moment; returns results and errors."""
    barrier = threading.Barrier(len(jobs))
    outcomes, errors = [None] * len(jobs), [None] * len(jobs)

    def worker(index, job):
        try:
            with Session(engine, expire_on_commit=False) as db:
                barrier.wait(timeout=10)
                outcomes[index] = job(db)
                db.commit()
        except Exception as error:  # surfaced by the test
            errors[index] = error

    threads = [threading.Thread(target=worker, args=(index, job)) for index, job in enumerate(jobs)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=60)
    return outcomes, errors


def slow(monkeypatch, module, name):
    """Pauses a step of the transaction while it is still open (and its locks are held)."""
    original = getattr(module, name)

    def paused(*args, **kwargs):
        value = original(*args, **kwargs)
        time.sleep(PAUSE)
        return value

    monkeypatch.setattr(module, name, paused)


def build_world(engine):
    """An event of four teams drawn and confirmed: two semifinals and a final, none scheduled."""
    with Session(engine, expire_on_commit=False) as db:
        owner = make_user(db, 'dono')
        reps = [make_user(db, f'rep{index}') for index in range(4)]
        teams = [make_team(db, rep, name=f'Time {index}') for index, rep in enumerate(reps)]
        event = add(db, Event(
            organizer_user_id=owner.id, name='Copa Concorrente', sport='futebol', format='society',
            competition_type='eliminacao_simples', capacity=8, city_id=CITY, venue='Arena', starts_at=NOW + 10 * 24 * H,
            registration_closes_at=NOW - 24 * H, price_cents=0, state='publicado', published_at=NOW - 20 * 24 * H))
        for rep, team in zip(reps, teams, strict=True):
            add(db, EventEntry(event_id=event.id, team_id=team.id, registered_by_id=rep.id, state='confirmada',
                               price_cents=0, confirmed_at=NOW - 3 * 24 * H))
        court = make_court(db, f'Quadra {uuid.uuid4().hex[:8]}')          # the schema is shared by both tests
        db.commit()
        championship.draw_bracket(db, owner, event.id, now=NOW)
        championship.confirm_bracket(db, owner, event.id, now=NOW)
        matches = db.scalars(select(Match).where(Match.event_id == event.id).order_by(Match.id)).all()
        return {'owner': owner.id, 'event': event.id, 'court': court.id,
                'rep_of': {team.id: rep.id for rep, team in zip(reps, teams, strict=True)},
                'semis': [match.id for match in matches if match.round_number == 1],
                'final': next(match.id for match in matches if match.round_number == 2)}


def schedule_job(owner_id, match_id, court_id, starts_at):
    def job(db):
        owner = db.get(User, owner_id)
        return championship.schedule_match(db, owner, match_id, ScheduleInput(starts_at=starts_at, court_id=court_id),
                                           now=NOW)
    return job


def test_two_schedules_on_the_same_court_at_the_same_time_leave_one_conflict(engine, monkeypatch):
    world = build_world(engine)
    first, second = world['semis']
    start = NOW + 3 * 24 * H
    slow(monkeypatch, championship, '_bookings')
    outcomes, errors = run_together(engine, [
        schedule_job(world['owner'], first, world['court'], start),
        schedule_job(world['owner'], second, world['court'], start + timedelta(minutes=30))])
    done = [error for error in errors if error is None]
    conflicts = [error for error in errors if isinstance(error, championship.ScheduleConflict)]
    assert len(done) == 1 and len(conflicts) == 1 and conflicts[0].conflict.kind == 'quadra'
    with Session(engine) as db:
        states = sorted(db.scalar(select(Match.state).where(Match.id == match_id)) for match_id in (first, second))
        assert states == ['agendada', 'combinando']


def report_job(user_id, match_id, goals_a, goals_b, now):
    def job(db):
        user = db.get(User, user_id)
        return results.report_score(db, user, match_id, ResultInput(goals_a=goals_a, goals_b=goals_b), now=now)
    return job


def test_both_semifinals_confirmed_together_seat_both_winners_in_the_final(engine, monkeypatch):
    world = build_world(engine)
    start = NOW + 3 * 24 * H
    with Session(engine, expire_on_commit=False) as db:
        owner = db.get(User, world['owner'])
        for index, match_id in enumerate(world['semis']):
            championship.schedule_match(db, owner, match_id, ScheduleInput(
                starts_at=start + 3 * H * index, court_id=world['court']), now=NOW)
        reporters = {}
        for match_id in world['semis']:
            teams = {side.side: side.team_id for side in db.scalars(select(MatchSide).where(
                MatchSide.match_id == match_id))}
            add(db, MatchResult(match_id=match_id, side='a', reported_by_id=world['rep_of'][teams['a']], score_a=2,
                                score_b=0, created_at=NOW, updated_at=NOW))
            reporters[match_id] = world['rep_of'][teams['b']]
        db.commit()
        late = start + 4 * H
        jobs = [report_job(reporters[match_id], match_id, 2, 0, late) for match_id in world['semis']]
    slow(monkeypatch, championship_lifecycle, 'advance_winner')
    outcomes, errors = run_together(engine, jobs)
    assert errors == [None, None] and all(outcome.state == 'realizada' for outcome in outcomes)
    with Session(engine) as db:
        sides = db.scalars(select(MatchSide).where(MatchSide.match_id == world['final']).order_by(MatchSide.side)).all()
        assert [side.side for side in sides] == ['a', 'b'] and len({side.team_id for side in sides}) == 2
        banners = db.scalars(select(MatchMessage).where(MatchMessage.match_id == world['final'],
                                                       MatchMessage.event_type == 'partida_combinando')).all()
        assert len(banners) == 2                      # the one made with the bracket, and "adversários definidos"
        told = db.scalars(select(Notification).where(Notification.type == 'adversario_definido')).all()
        assert len(told) == 2 and {item.payload['match_id'] for item in told} == {world['final']}


@pytest.mark.parametrize('via', ['report', 'decision'])
def test_a_score_locks_the_match_it_feeds_before_it_locks_the_rankings(engine, via):
    """Global lock order (0002 section 15.5): match → ranking. The winner goes to the following match, which is a
    match lock too, so it is taken before the advisory lock of the ranking that the same score recalculates."""
    world = build_world(engine)
    semi, other = world['semis']
    start = NOW + 3 * 24 * H
    with Session(engine, expire_on_commit=False) as db:
        owner = db.get(User, world['owner'])
        for index, match_id in enumerate(world['semis']):
            championship.schedule_match(db, owner, match_id, ScheduleInput(
                starts_at=start + 3 * H * index, court_id=world['court']), now=NOW)
        teams = {side.side: side.team_id for side in db.scalars(select(MatchSide).where(MatchSide.match_id == semi))}
        add(db, MatchResult(match_id=semi, side='a', reported_by_id=world['rep_of'][teams['a']], score_a=2, score_b=0,
                            created_at=NOW, updated_at=NOW))
        db.commit()
    late = start + 4 * H
    if via == 'report':
        job = report_job(world['rep_of'][teams['b']], semi, 2, 0, late)
    else:
        def job(db):
            return championship.decide_result(
                db, db.get(User, world['owner']), other,
                ResultDecisionInput(walkover_absent_side='b', justification='O time não compareceu.'), now=late)
        semi = other
    log, _ = record_sql(engine, job)
    own = first_index(log, row_lock('matches', semi))
    following = first_index(log, row_lock('matches', world['final']))
    ranking = first_index(log, ranking_lock)
    assert own < following < ranking
    with Session(engine) as db:         # and the winner did reach the final
        assert db.scalar(select(func.count()).select_from(MatchSide).where(MatchSide.match_id == world['final'])) == 1

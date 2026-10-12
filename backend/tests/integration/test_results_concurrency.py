"""Results under real concurrency: separate connections and transactions that commit, in a dedicated schema.

- Both sides reporting the same score at the same moment confirm the match exactly once: the match row lock
  serializes the reports, so the second one sees the first (without the lock both wait for an answer that never
  comes, which shows the test sees the race).
- Two matches of the same team confirmed together count both in the ranking: the category lock makes the second
  recalculation read the first one's committed match (without it the second insert breaks or counts one match).
"""
import os
import random
import threading
import time
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.identity import User
from app.models.matches import Match, MatchMessage, MatchResult
from app.models.rankings import Standing
from app.schemas.matches import ResultInput
from app.services import results, standings
from tests.integration.match_helpers import NOW, add, make_team, make_user, scheduled_match
from tests.integration.result_helpers import HOUR

BACKEND = Path(__file__).resolve().parents[2]
PAUSE = 0.4


@pytest.fixture(scope='module')
def engine():
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('Defina TEST_DATABASE_URL para executar integração com PostgreSQL.')
    admin = create_engine(url)
    schema = 'arena_res_' + uuid.uuid4().hex
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
    """Runs each job in its own session and transaction, released at the same moment; returns results and errors."""
    barrier = threading.Barrier(len(jobs))
    outcomes, errors = [None] * len(jobs), []

    def worker(index, job):
        try:
            with Session(engine, expire_on_commit=False) as db:
                barrier.wait(timeout=10)
                outcomes[index] = job(db)
                db.commit()
        except Exception as error:  # surfaced by the test
            errors.append(error)

    threads = [threading.Thread(target=worker, args=(index, job)) for index, job in enumerate(jobs)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=60)
    return outcomes, errors


def report_job(user_id, match_id, goals_a, goals_b):
    def job(db):
        user = db.get(User, user_id)
        return results.report_score(db, user, match_id, ResultInput(goals_a=goals_a, goals_b=goals_b), now=NOW)
    return job


def slow(monkeypatch, module, name):
    """Pauses a step of the transaction while it is still open (and its locks are held)."""
    original = getattr(module, name)

    def paused(*args, **kwargs):
        value = original(*args, **kwargs)
        time.sleep(PAUSE)
        return value

    monkeypatch.setattr(module, name, paused)


def build_world(engine, teams=3):
    """Teams, their representatives and, for each pair 'A vs team i', a match 'agendada' where A already reported."""
    with Session(engine, expire_on_commit=False) as db:
        reps = [make_user(db, f'rep{index}') for index in range(teams)]
        made = [make_team(db, rep, name=f'Time {index}') for index, rep in enumerate(reps)]
        matches = [scheduled_match(db, made[0], other, starts_at=NOW - 2 * HOUR, open_slots=False)
                   for other in made[1:]]
        for match in matches:
            add(db, MatchResult(match_id=match.id, side='a', reported_by_id=reps[0].id, score_a=2, score_b=1,
                                created_at=NOW, updated_at=NOW))
        db.commit()
        return [rep.id for rep in reps], [team.id for team in made], [match.id for match in matches]


def team_standing(engine, team_id):
    with Session(engine) as db:
        return db.scalar(select(Standing).where(Standing.team_id == team_id))


def test_both_sides_reporting_together_confirm_the_match_once(engine, monkeypatch):
    reps, teams, (match_id,) = build_world(engine, teams=2)
    with Session(engine) as db:
        # Rep A has not reported yet in this scenario: both reports arrive together.
        db.execute(text('DELETE FROM match_results WHERE match_id = :id'), {'id': match_id})
        db.commit()
    slow(monkeypatch, results, '_store_report')
    _, errors = run_together(engine, [report_job(reps[0], match_id, 2, 1), report_job(reps[1], match_id, 2, 1)])
    assert not errors, errors
    with Session(engine) as db:
        match = db.get(Match, match_id)
        confirmations = db.scalars(select(AuditLog).where(AuditLog.action == 'resultado.confirmado',
                                                          AuditLog.target_id == match_id)).all()
        banners = db.scalars(select(MatchMessage.event_type).where(MatchMessage.match_id == match_id)
                             .order_by(MatchMessage.id)).all()
    assert (match.state, match.score_a, match.score_b, match.result_source) == ('realizada', 2, 1, 'confirmacao')
    assert len(confirmations) == 1
    assert banners == ['placar_enviado', 'resultado_confirmado']
    assert team_standing(engine, teams[0]).matches_played == 1


def test_without_the_match_lock_both_reports_wait_for_each_other(engine, monkeypatch):
    reps, _, (match_id,) = build_world(engine, teams=2)
    with Session(engine) as db:
        db.execute(text('DELETE FROM match_results WHERE match_id = :id'), {'id': match_id})
        db.commit()
    original = results.load_match_for
    monkeypatch.setattr(results, 'load_match_for',
                        lambda db, match_id_, user, *, for_update=False: original(db, match_id_, user))
    slow(monkeypatch, results, '_store_report')
    _, errors = run_together(engine, [report_job(reps[0], match_id, 2, 1), report_job(reps[1], match_id, 2, 1)])
    assert not errors, errors
    with Session(engine) as db:
        match = db.get(Match, match_id)
        reported = db.scalars(select(MatchResult).where(MatchResult.match_id == match_id)).all()
    # The race: both stored a report and neither saw the other, so the equal scores never confirmed.
    assert (match.state, len(reported)) == ('agendada', 2)


def test_two_matches_of_one_team_confirmed_together_are_both_counted(engine, monkeypatch):
    reps, teams, matches = build_world(engine, teams=3)
    slow(monkeypatch, standings, '_team_records')
    _, errors = run_together(engine, [report_job(reps[1], matches[0], 2, 1), report_job(reps[2], matches[1], 2, 1)])
    assert not errors, errors
    first = team_standing(engine, teams[0])
    assert (first.matches_played, first.wins, first.metric_value) == (2, 2, 6)
    assert [team_standing(engine, team).matches_played for team in teams[1:]] == [1, 1]


def test_without_the_ranking_lock_the_second_recalculation_misses_the_first_match(engine, monkeypatch):
    reps, teams, matches = build_world(engine, teams=3)
    slow(monkeypatch, standings, '_team_records')
    monkeypatch.setattr(standings, 'ranking_lock_id', lambda key: random.getrandbits(62))
    _, errors = run_together(engine, [report_job(reps[1], matches[0], 2, 1), report_job(reps[2], matches[1], 2, 1)])
    first = team_standing(engine, teams[0])
    # Each transaction saw only its own match: the second insert breaks the unique row, or one match is lost.
    assert errors or first.matches_played != 2

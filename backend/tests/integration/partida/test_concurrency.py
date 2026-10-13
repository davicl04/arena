"""Transições da partida sob concorrência real: conexões e transações separadas que gravam, num schema dedicado.

Toda transição trava a partida primeiro (`FOR UPDATE`); estes testes largam as chamadas juntas (uma barreira) e conferem
que o resultado é o de alguma ordem possível, nunca um meio-termo:
- duas aceitações simultâneas das mesmas condições agendam a partida uma vez só (uma vaga, uma faixa);
- cancelar e aceitar ao mesmo tempo termina cancelada, sem vagas abertas;
- os dois lados registrando W.O. ao mesmo tempo: só um vale;
- a revisão de uma quadra espera a transação que propõe condições com ela e depois cancela essas condições.
"""
import os
import threading
import time
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import HTTPException
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app.models.identity import User
from app.models.matches import Court, Match, MatchMessage, MatchSide, MatchSlot, MatchTerms
from app.schemas.matches import CancelInput, CourtDecisionInput, TermsInput
from app.services import courts, matches
from app.services.match_rules import TransitionError
from tests.integration.match_helpers import NOW, add, make_team, make_user
from tests.integration.partida.helpers import DAY, HOUR, agreed_match, make_court, make_match

BACKEND = Path(__file__).resolve().parents[3]
DOMAIN_ERRORS = (HTTPException, TransitionError)


@pytest.fixture(scope='module')
def engine():
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('Defina TEST_DATABASE_URL para executar integração com PostgreSQL.')
    admin = create_engine(url)
    schema = 'arena_partida_' + uuid.uuid4().hex
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
    """Each job runs in its own session, released at the same moment; returns the results or the domain errors."""
    barrier = threading.Barrier(len(jobs))
    results, failures = [None] * len(jobs), []

    def worker(index, job):
        try:
            with Session(engine, expire_on_commit=False) as db:
                barrier.wait(timeout=10)
                try:
                    results[index] = job(db)
                except DOMAIN_ERRORS as error:
                    results[index] = error
        except Exception as error:  # surfaced below with the thread's failure
            failures.append(error)

    threads = [threading.Thread(target=worker, args=(index, job)) for index, job in enumerate(jobs)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=60)
    assert not failures, failures
    return results


def build(engine, make):
    """Creates the scenario in a committed session and returns plain ids for the threads."""
    with Session(engine, expire_on_commit=False) as db:
        scenario = make(db)
        db.commit()
    return scenario


def world_of(db):
    """Two teams (side B has two representatives) and a published court."""
    rep_a, rep_b, rep_b2 = (make_user(db, name) for name in ('a', 'b', 'b2'))
    team_a = make_team(db, rep_a, name=f'Time A {uuid.uuid4().hex[:6]}')
    team_b = make_team(db, rep_b, name=f'Time B {uuid.uuid4().hex[:6]}', extra_representatives=(rep_b2,))
    return {'rep_a': rep_a, 'rep_b': rep_b, 'rep_b2': rep_b2, 'team_a': team_a, 'team_b': team_b,
            'court': make_court(db, f'Quadra {uuid.uuid4().hex[:6]}')}


def declare_slots(db, match, **by_side):
    for side in db.scalars(select(MatchSide).where(MatchSide.match_id == match.id)):
        side.declared_slots = by_side.get(side.side, {})


def pending_terms(db, match, world, start):
    return add(db, MatchTerms(match_id=match.id, proposed_by_id=world['rep_a'].id, proposed_by_side='a',
                              starts_at=start, court_id=world['court'].id, booking_side='a', state='pendente',
                              accepted_a_at=NOW, created_at=NOW))


def user(db, user_id):
    return db.get(User, user_id)


def test_two_acceptances_at_once_schedule_the_match_a_single_time(engine):
    def make(db):
        world = world_of(db)
        match = make_match(db, 'combinando', [world['team_a'], world['team_b']])
        declare_slots(db, match, a={'atacante': 1})
        proposed = pending_terms(db, match, world, NOW + 2 * DAY)
        return {'rep_b': world['rep_b'].id, 'rep_b2': world['rep_b2'].id, 'match': match.id, 'terms': proposed.id}

    scenario = build(engine, make)

    def accept(who):
        return lambda db: matches.accept_terms(db, user(db, scenario[who]), scenario['match'], scenario['terms'],
                                               now=NOW)

    results = run_together(engine, [accept('rep_b'), accept('rep_b2')])
    assert [item.state for item in results] == ['agendada', 'agendada']
    with Session(engine) as db:
        assert db.get(Match, scenario['match']).state == 'agendada'
        slots = db.scalars(select(MatchSlot).where(MatchSlot.match_id == scenario['match'])).all()
        assert [(slot.side, slot.position) for slot in slots] == [('a', 'atacante')]
        events = [row.event_type for row in db.scalars(select(MatchMessage).where(
            MatchMessage.match_id == scenario['match']))]
        assert events.count('partida_agendada') == 1
        assert db.get(MatchTerms, scenario['terms']).state == 'aceita'


def test_cancelling_and_accepting_at_once_ends_cancelled_without_open_slots(engine):
    def make(db):
        world = world_of(db)
        match = make_match(db, 'combinando', [world['team_a'], world['team_b']])
        declare_slots(db, match, b={'goleiro': 1})
        proposed = pending_terms(db, match, world, NOW + 3 * DAY)
        return {'rep_a': world['rep_a'].id, 'rep_b': world['rep_b'].id, 'match': match.id, 'terms': proposed.id}

    scenario = build(engine, make)
    results = run_together(engine, [
        lambda db: matches.accept_terms(db, user(db, scenario['rep_b']), scenario['match'], scenario['terms'],
                                        now=NOW),
        lambda db: matches.cancel_match(db, user(db, scenario['rep_a']), scenario['match'],
                                        CancelInput(reason='Chuva'), now=NOW)])
    assert any(not isinstance(item, Exception) and item.state == 'cancelada' for item in results), results
    with Session(engine) as db:
        match = db.get(Match, scenario['match'])
        assert (match.state, match.cancel_reason) == ('cancelada', 'Chuva') and match.closed_at is not None
        slots = db.scalars(select(MatchSlot).where(MatchSlot.match_id == scenario['match'])).all()
        assert {slot.state for slot in slots} <= {'fechada'}
        assert db.get(MatchTerms, scenario['terms']).state in ('aceita', 'cancelada')


def test_both_sides_registering_a_walkover_at_once_leaves_a_single_one(engine):
    def make(db):
        world = world_of(db)
        match = agreed_match(db, world, starts_at=NOW - HOUR)
        return {'rep_a': world['rep_a'].id, 'rep_b': world['rep_b'].id, 'match': match.id}

    scenario = build(engine, make)
    results = run_together(engine, [
        lambda db: matches.register_walkover(db, user(db, scenario['rep_a']), scenario['match'], now=NOW),
        lambda db: matches.register_walkover(db, user(db, scenario['rep_b']), scenario['match'], now=NOW)])
    failures = [item for item in results if isinstance(item, Exception)]
    assert len(failures) == 1 and str(failures[0]) == 'Já há um W.O. registrado nesta partida.'
    winner = next(item for item in results if not isinstance(item, Exception))
    with Session(engine) as db:
        match = db.get(Match, scenario['match'])
        registrant = scenario['rep_a'] if match.walkover_absent_side == 'b' else scenario['rep_b']
        assert match.walkover_absent_side == winner.walkover.absent_side
        assert match.walkover_registered_by_id == registrant


def test_reviewing_a_court_waits_for_the_terms_that_use_it_and_then_cancels_them(engine, monkeypatch):
    def make(db):
        world = world_of(db)
        match = make_match(db, 'combinando', [world['team_a'], world['team_b']])
        suggestion = make_court(db, f'Sugestão {uuid.uuid4().hex[:6]}', state='em_revisao', origin=match)
        admin = make_user(db, 'admin', admin=True)
        return {'rep_a': world['rep_a'].id, 'match': match.id, 'suggestion': suggestion.id, 'admin': admin.id}

    scenario = build(engine, make)
    original = matches.usable_for_terms
    held = threading.Event()

    def slow(db, match, court_id):
        court = original(db, match, court_id)      # holds the match lock and a key-share lock on the court
        held.set()
        time.sleep(0.5)
        return court

    monkeypatch.setattr(matches, 'usable_for_terms', slow)

    def propose(db):
        data = TermsInput(starts_at=NOW + 2 * DAY, court_id=scenario['suggestion'], booking_side='a')
        return matches.propose_terms(db, user(db, scenario['rep_a']), scenario['match'], data, now=NOW)

    def reject(db):
        assert held.wait(timeout=10)
        data = CourtDecisionInput(decision='rejeitar', reason='Não existe esta quadra.')
        return courts.decide_court(db, user(db, scenario['admin']), scenario['suggestion'], data, now=NOW)

    results = run_together(engine, [propose, reject])
    assert not any(isinstance(item, Exception) for item in results), results
    with Session(engine) as db:
        rows = db.scalars(select(MatchTerms).where(MatchTerms.match_id == scenario['match'])).all()
        assert [terms.state for terms in rows] == ['cancelada']
        assert db.get(Court, scenario['suggestion']).state == 'rejeitada'

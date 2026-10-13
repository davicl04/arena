"""The matchmaking routes under real concurrency: requests on separate connections that commit, in a dedicated schema.

The foundation tests the queue itself (`test_matchmaking_concurrency.py`); these start whole HTTP requests together
(a barrier) and widen the race window with a pause after the candidates are read, while the bucket lock is held:
- two compatible searches sent at the same moment end paired, none stays waiting;
- six searches of one bucket form three proposals and no search enters two of them;
- the same team submitting twice at once ends with one search (one 201, the others 200);
- both representatives accepting at the same moment end in `combinando`, once;
- closing a team while it searches or while another team pairs with it never leaves a closed team in a search or a match.
"""
import os
import threading
import time
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.main import app
from app.models.matches import Match, MatchMessage, MatchSearch, MatchSide
from app.models.teams import Team
from app.services.matchmaking_queue import queue
from tests.integration.team_helpers import create_team, register, set_position

BACKEND = Path(__file__).resolve().parents[2]
SEARCHES = '/api/v1/matchmaking/searches'
PAUSE = 0.4


@pytest.fixture(scope='module')
def engine():
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('Defina TEST_DATABASE_URL para executar integração com PostgreSQL.')
    admin = create_engine(url)
    schema = 'arena_routes_' + uuid.uuid4().hex
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={'options': f'-csearch_path={schema}'}, pool_size=16)
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


@pytest.fixture(scope='module')
def api(engine):
    """Every request gets its own session on the dedicated schema and commits for real."""
    def session():
        with Session(engine, expire_on_commit=False) as db:
            yield db

    app.dependency_overrides[get_db] = session
    yield
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture(autouse=True)
def empty_queue(engine):
    """Searches left by an earlier test would pair with the next one: every test starts with an empty queue."""
    with engine.begin() as connection:
        connection.execute(text('DELETE FROM match_searches'))
        connection.execute(text('DELETE FROM matches'))


@pytest.fixture
def slow_candidates(monkeypatch):
    """Pauses after the candidates are read, with the transaction and the bucket lock still open."""
    read = queue._candidates

    def candidates(db, current, now):
        rows = read(db, current, now)
        time.sleep(PAUSE)
        return rows

    monkeypatch.setattr(queue, '_candidates', candidates)


def squads(count):
    """Representatives with a football profile and a team each, in the Brasília catalog city."""
    http = TestClient(app)
    result = []
    for index in range(count):
        headers, user_id = register(http, f'rota{index}-{uuid.uuid4().hex[:8]}@example.com', f'Atleta {index}')
        set_position(http, headers, 'atacante')
        result.append((headers, user_id, create_team(http, headers, f'Time {uuid.uuid4().hex[:6]}')['id']))
    return result


def together(jobs):
    """Runs each job in its own thread with its own client, released at the same moment."""
    barrier = threading.Barrier(len(jobs))
    results, errors = [None] * len(jobs), []

    def worker(index, job):
        try:
            http = TestClient(app)
            barrier.wait(timeout=10)
            results[index] = job(http)
        except Exception as error:  # surfaced below with the thread's failure
            errors.append(error)

    threads = [threading.Thread(target=worker, args=(index, job)) for index, job in enumerate(jobs)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=60)
    assert not errors, errors
    return results


def post_search(headers, team_id):
    def job(http):
        return http.post(SEARCHES, json={'sport': 'futebol', 'team_id': team_id, 'format': 'society'},
                         headers=headers)
    return job


def put_answer(headers, match_id, decision):
    def job(http):
        return http.put(f'/api/v1/matches/{match_id}/{decision}', json={}, headers=headers)
    return job


def rows(engine, statement):
    with Session(engine) as db:
        return db.execute(statement).all()


def test_two_compatible_searches_sent_together_end_paired(engine, api, slow_candidates):
    first, second = squads(2)
    responses = together([post_search(first[0], first[2]), post_search(second[0], second[2])])
    assert [response.status_code for response in responses] == [201, 201]
    proposals = [response.json()['proposal'] for response in responses if response.json()['proposal']]
    # The one that took the bucket lock second saw the first and closed the proposal; the other one waited for it.
    assert len(proposals) == 1
    searches = rows(engine, select(MatchSearch.team_id, MatchSearch.state, MatchSearch.match_id).where(
        MatchSearch.team_id.in_([first[2], second[2]])))
    assert sorted(state for _, state, _ in searches) == ['pareada', 'pareada']
    assert {match_id for _, _, match_id in searches} == {proposals[0]['match_id']}
    [match] = rows(engine, select(Match.state).where(Match.id == proposals[0]['match_id']))
    assert match.state == 'proposta'


def test_without_the_bucket_lock_the_race_is_visible(engine, api, slow_candidates, monkeypatch):
    """Control: with the lock off, the same requests leave both searches waiting, so the test above sees the race."""
    monkeypatch.setattr(queue, 'lock_bucket', lambda db, key: None)
    first, second = squads(2)
    responses = together([post_search(first[0], first[2]), post_search(second[0], second[2])])
    assert [response.json()['proposal'] for response in responses] == [None, None]
    searches = rows(engine, select(MatchSearch.state).where(MatchSearch.team_id.in_([first[2], second[2]])))
    assert [state for (state,) in searches] == ['ativa', 'ativa']


def test_a_search_never_enters_two_proposals(engine, api, slow_candidates):
    members = squads(6)
    responses = together([post_search(headers, team_id) for headers, _, team_id in members])
    assert [response.status_code for response in responses] == [201] * 6
    team_ids = [team_id for _, _, team_id in members]
    searches = rows(engine, select(MatchSearch.id, MatchSearch.state).where(MatchSearch.team_id.in_(team_ids)))
    assert [state for _, state in searches] == ['pareada'] * 6
    sides = rows(engine, select(MatchSide.search_id, MatchSide.match_id).where(
        MatchSide.team_id.in_(team_ids)))
    # Six searches, six sides: every search appears once, in three matches of two sides each.
    assert sorted(search_id for search_id, _ in sides) == sorted(search_id for search_id, _ in searches)
    per_match = {}
    for _, match_id in sides:
        per_match[match_id] = per_match.get(match_id, 0) + 1
    assert sorted(per_match.values()) == [2, 2, 2]
    states = rows(engine, select(Match.state).where(Match.id.in_(list(per_match))))
    assert {state for (state,) in states} == {'proposta'}


def test_the_same_team_submitting_twice_at_once_has_one_search(engine, api):
    headers, _, team_id = squads(1)[0]
    responses = together([post_search(headers, team_id) for _ in range(4)])
    codes = sorted(response.status_code for response in responses)
    assert codes == [200, 200, 200, 201], codes
    assert {response.json()['search']['id'] for response in responses} == {
        row.id for row in rows(engine, select(MatchSearch.id).where(MatchSearch.team_id == team_id))}
    [(count,)] = rows(engine, select(func.count()).select_from(MatchSearch).where(MatchSearch.team_id == team_id))
    assert count == 1


def test_both_representatives_accepting_together_close_it_once(engine, api):
    first, second = squads(2)
    http = TestClient(app)
    assert http.post(SEARCHES, json={'sport': 'futebol', 'team_id': first[2], 'format': 'society'},
                     headers=first[0]).status_code == 201
    match_id = http.post(SEARCHES, json={'sport': 'futebol', 'team_id': second[2], 'format': 'society'},
                         headers=second[0]).json()['proposal']['match_id']
    responses = together([put_answer(first[0], match_id, 'accept'), put_answer(second[0], match_id, 'accept')])
    assert sorted(response.status_code for response in responses) == [200, 200]
    assert sorted(response.json()['state'] for response in responses) == ['combinando', 'proposta']
    [match] = rows(engine, select(Match.state).where(Match.id == match_id))
    assert match.state == 'combinando'
    searches = rows(engine, select(MatchSearch.state).where(MatchSearch.team_id.in_([first[2], second[2]])))
    assert [state for (state,) in searches] == ['concluida', 'concluida']
    [(banners,)] = rows(engine, select(func.count()).select_from(MatchMessage).where(MatchMessage.match_id == match_id))
    assert banners == 1


def test_accepting_and_declining_together_leave_one_outcome(engine, api):
    first, second = squads(2)
    http = TestClient(app)
    assert http.post(SEARCHES, json={'sport': 'futebol', 'team_id': first[2], 'format': 'society'},
                     headers=first[0]).status_code == 201
    match_id = http.post(SEARCHES, json={'sport': 'futebol', 'team_id': second[2], 'format': 'society'},
                         headers=second[0]).json()['proposal']['match_id']
    # One side accepted already; the other declines at the very moment the first sends a second accept.
    assert put_answer(first[0], match_id, 'accept')(http).status_code == 200
    responses = together([put_answer(second[0], match_id, 'decline'), put_answer(second[0], match_id, 'accept')])
    codes = sorted(response.status_code for response in responses)
    [match] = rows(engine, select(Match.state).where(Match.id == match_id))
    assert codes == [200, 409], codes
    assert match.state in ('recusada', 'combinando')
    states = {team_id: state for team_id, state in rows(engine, select(MatchSearch.team_id, MatchSearch.state).where(
        MatchSearch.team_id.in_([first[2], second[2]])))}
    if match.state == 'recusada':
        assert states == {first[2]: 'ativa', second[2]: 'recusada'}
    else:
        assert states == {first[2]: 'concluida', second[2]: 'concluida'}


def post_close(headers, team_id):
    def job(http):
        return http.post(f'/api/v1/teams/{team_id}/close', json={}, headers=headers)
    return job


def test_closing_a_team_while_it_starts_a_search(engine, api):
    headers, _, team_id = squads(1)[0]
    search, closing = together([post_search(headers, team_id), post_close(headers, team_id)])
    [(team_state,)] = rows(engine, select(Team.state).where(Team.id == team_id))
    open_searches = rows(engine, select(MatchSearch.state).where(
        MatchSearch.team_id == team_id, MatchSearch.state.in_(('ativa', 'pareada'))))
    # Either the search came first (and closing cancelled it) or the team closed first (and the search was refused).
    assert (search.status_code, closing.status_code) in ((201, 204), (404, 204)), (search.status_code, closing.status_code)
    assert team_state == 'encerrado' and open_searches == []


def test_closing_a_team_while_another_team_pairs_with_it(engine, api, slow_candidates):
    waiting, newcomer = squads(2)
    http = TestClient(app)
    assert post_search(waiting[0], waiting[2])(http).status_code == 201
    arriving, closing = together([post_search(newcomer[0], newcomer[2]), post_close(waiting[0], waiting[2])])
    assert arriving.status_code == 201
    [(team_state,)] = rows(engine, select(Team.state).where(Team.id == waiting[2]))
    sides = rows(engine, select(MatchSide.match_id).where(MatchSide.team_id == waiting[2]))
    if closing.status_code == 204:
        # Closed first: the waiting search was cancelled and the newcomer keeps waiting.
        assert team_state == 'encerrado' and sides == [] and arriving.json()['proposal'] is None
    else:
        # Paired first: the team has a proposal and stays active.
        assert closing.status_code == 409 and team_state == 'ativo' and len(sides) == 1
        assert arriving.json()['proposal'] is not None

"""Match lifecycle (slots in the schedule and on cancellation, final score, result deadlines), text helpers and
the access lookups over a simulated session (no database)."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.audit import AuditLog
from app.models.matches import Match, MatchMessage, MatchSearch, MatchSide, MatchSlot
from app.models.notifications import Notification
from app.services import match_access, match_lifecycle
from app.services.match_access import MatchAccess
from app.services.match_rules import validate_football_score
from app.services.match_text import iso, side_name, side_names
from tests.unit.fakes import FakeDb

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
HOUR = timedelta(hours=1)
REP_A, MEMBER_A, REP_B, GUEST = 11, 12, 22, 33


def make_match(**values):
    start = values.pop('starts_at', NOW - 49 * HOUR)
    base = dict(id=1, sport='futebol', format='society', city_id=1, origin='amistoso', state='agendada',
                starts_at=start, result_deadline=start + 48 * HOUR, created_at=NOW - 72 * HOUR, updated_at=NOW)
    return Match(**{**base, **values})


def make_sides(match_id=1):
    return {'a': MatchSide(id=2 * match_id - 1, match_id=match_id, side='a', team_id=1,
                           declared_slots={'goleiro': 1, 'atacante': 1}),
            'b': MatchSide(id=2 * match_id, match_id=match_id, side='b', team_id=2, declared_slots={'defesa': 1})}


@pytest.fixture
def db():
    fake = FakeDb()
    fake.on('teams', [(1, 'Ferrugem FC'), (2, 'Tigres do Lago')])
    fake.on('team_members', [(1, REP_A), (1, MEMBER_A), (2, REP_B)])
    fake.on('match_slots', [])
    return fake


def kinds(db, model):
    return [row for row in db.added if isinstance(row, model)]


# ----- Slots --------------------------------------------------------------------------------------------------

def test_the_declared_slots_open_one_row_per_spot_in_position_order(db):
    sides = list(make_sides().values())
    db.on('match_sides', sides)
    opened = match_lifecycle.open_declared_slots(db, make_match(), now=NOW)
    assert [(slot.side, slot.position, slot.state, slot.opened_at) for slot in opened] == [
        ('a', 'goleiro', 'aberta', NOW), ('a', 'atacante', 'aberta', NOW), ('b', 'defesa', 'aberta', NOW)]
    assert all(slot.id is not None for slot in opened) and db.flushes == 1


def test_cancelling_closes_every_slot_and_returns_the_pending_offers(db):
    slots = [MatchSlot(id=1, match_id=1, side='a', position='goleiro', state='aberta'),
             MatchSlot(id=2, match_id=1, side='a', position='atacante', state='oferecida'),
             MatchSlot(id=3, match_id=1, side='b', position='defesa', state='preenchida', filled_by_id=GUEST)]
    waiting = MatchSearch(id=8, kind='avulso', sport='futebol', city_id=1, user_id=44, state='pareada', slot_id=2,
                          offer_expires_at=NOW + HOUR, started_at=NOW - HOUR, expires_at=NOW + 20 * HOUR)
    db.on('match_slots', slots).on('match_searches', [waiting]).then('teams', 'Ferrugem FC')
    guests = match_lifecycle.close_match_slots(db, make_match(state='cancelada'), now=NOW, actor_id=REP_A)
    assert guests == [GUEST] and {slot.state for slot in slots} == {'fechada'}
    assert (waiting.state, waiting.slot_id) == ('ativa', None)
    [notice] = kinds(db, Notification)
    assert (notice.type, notice.user_id, notice.actor_id) == ('oferta_retirada', 44, REP_A)
    assert (notice.payload['reason'], notice.payload['team_name']) == ('partida_cancelada', 'Ferrugem FC')
    [entry] = kinds(db, AuditLog)
    assert (entry.action, entry.actor_id) == ('vaga.oferta_devolvida', REP_A)


def test_cancelling_a_match_without_slots_closes_nothing(db):
    db.on('match_slots', [])
    assert match_lifecycle.close_match_slots(db, make_match(), now=NOW) == []


# ----- Final score and result deadlines -----------------------------------------------------------------------

def test_the_final_score_is_stored_with_its_source(db):
    match = make_match()
    match_lifecycle.apply_final_score(match, validate_football_score(3, 1), source='confirmacao', now=NOW)
    assert (match.score_a, match.score_b, match.winner_side, match.result_source, match.result_confirmed_at) == (
        3, 1, 'a', 'confirmacao', NOW)
    assert match.result_decided_by_id is None
    decided = make_match()
    match_lifecycle.apply_final_score(decided, validate_football_score(0, 3), source='administracao', now=NOW,
                                      decided_by_id=99, reason='Mantido.')
    assert (decided.winner_side, decided.result_decided_by_id, decided.result_decision_reason) == ('b', 99, 'Mantido.')


def test_the_deadline_closes_each_kind_of_match_and_recalculates_once(db, monkeypatch):
    recalculated = []
    monkeypatch.setattr(match_lifecycle, 'recalculate_rankings',
                        lambda _db, keys, *, now: recalculated.append(sorted(key.label for key in keys)))
    confirmed = make_match(id=1, state='realizada', score_a=2, score_b=0, winner_side='a')
    silent = make_match(id=2)
    walkover = make_match(id=3, walkover_absent_side='b')
    db.on('matches', [confirmed, silent, walkover]).on('match_lineups', ['atacante'])
    db.then('match_sides', list(make_sides(2).values()), list(make_sides(3).values()))     # for the two announced
    assert match_lifecycle.close_due_results(db, NOW) == 3
    assert (confirmed.state, silent.state, walkover.state) == ('encerrada', 'sem_resultado', 'encerrada')
    assert (walkover.score_a, walkover.score_b, walkover.result_source) == (3, 0, 'wo')
    assert all(match.closed_at == NOW for match in (confirmed, silent, walkover))
    # One recalculation for the batch: the team category and the position played, each once.
    assert recalculated == [['futebol_individual:society:atacante', 'futebol_time:society']]
    assert sorted(row.action for row in kinds(db, AuditLog)) == [
        'partida.encerrada', 'partida.sem_resultado', 'partida.wo_confirmado']
    assert sorted(row.event_type for row in kinds(db, MatchMessage)) == ['resultado_confirmado', 'sem_resultado']
    outcomes = sorted((row.payload['match_id'], row.payload['outcome']) for row in kinds(db, Notification))
    assert {outcome for _, outcome in outcomes} == {'sem_resultado', 'wo'}


def test_a_batch_without_confirmed_scores_recalculates_nothing(db, monkeypatch):
    monkeypatch.setattr(match_lifecycle, 'recalculate_rankings', lambda *args, **kwargs: pytest.fail('no ranking'))
    db.on('matches', [make_match()]).on('match_sides', list(make_sides().values()))
    assert match_lifecycle.close_due_results(db, NOW) == 1
    db.on('matches', [])
    assert match_lifecycle.close_due_results(db, NOW) == 0


# ----- Text helpers -------------------------------------------------------------------------------------------

def test_side_names_come_from_the_team_or_the_athlete(db):
    sides = make_sides()
    assert side_names(db, sides) == {'a': 'Ferrugem FC', 'b': 'Tigres do Lago'}
    assert side_name(db, sides, 'b') == 'Tigres do Lago'
    assert side_name(db, sides, None) == 'A administração' and side_name(db, sides, 'c') == 'A administração'
    assert iso(NOW) == '2026-10-12T15:00:00+00:00' and iso(None) is None
    tennis = {'a': MatchSide(id=3, match_id=2, side='a', user_id=51)}
    db.on('users', [(51, 'Heitor Lima')])
    assert side_names(db, tennis) == {'a': 'Heitor Lima'}


# ----- Who is who in a match ----------------------------------------------------------------------------------

def test_the_people_of_each_side_and_the_guests(db):
    sides = make_sides()
    users = match_access.side_users(db, list(sides.values()))
    assert users == {1: [REP_A, MEMBER_A], 2: [REP_B]}
    assert match_access.side_actors(db, sides['b']) == [REP_B]
    db.on('match_slots', [(GUEST, 'b')])
    assert match_access.guest_users(db, 1) == {GUEST: 'b'}
    match = make_match(state='agendada')
    assert match_access.audience(db, match, sides=sides) == [REP_A, MEMBER_A, REP_B, GUEST]
    assert match_access.audience(db, match, sides=sides, scope='representantes', include_guests=False) == [
        REP_A, MEMBER_A, REP_B]
    assert match_access.audience(db, make_match(state='cancelada'), sides=sides) == [REP_A, MEMBER_A, REP_B]


def test_the_access_of_a_viewer_follows_the_roles(db):
    sides = make_sides()
    tennis = {'a': MatchSide(id=3, match_id=2, side='a', user_id=51), 'b': MatchSide(id=4, match_id=2, side='b', user_id=52)}
    tennis_match = make_match(id=2, sport='tenis', format=None)
    player = SimpleNamespace(id=52, is_admin=False)
    assert match_access.match_access(db, tennis_match, player, sides=tennis) == MatchAccess('atleta', 'b')

    match = make_match()
    db.on('team_members', [(2, 'representante')]).on('match_lineups', [])
    rep = SimpleNamespace(id=REP_B, is_admin=False)
    # A representative of side B's team, without a lineup row, belongs to side B.
    assert match_access.match_access(db, match, rep, sides=sides) == MatchAccess('representante', 'b')
    db.on('team_members', [])
    db.on('match_slots', [(1, 'a')])
    guest = SimpleNamespace(id=GUEST, is_admin=False)
    assert match_access.match_access(db, match, guest, sides=sides) == MatchAccess('avulso', 'a')
    db.on('match_slots', [])
    admin = SimpleNamespace(id=99, is_admin=True)
    assert match_access.match_access(db, match, admin, sides=sides) == MatchAccess('administracao', None)
    assert match_access.match_access(db, match, SimpleNamespace(id=77, is_admin=False), sides=sides) is None


def test_loading_a_match_for_a_stranger_answers_404(db, monkeypatch):
    match = make_match()
    db.on('matches', match).on('match_sides', list(make_sides().values()))
    monkeypatch.setattr(match_access, 'match_access', lambda _db, m, user, sides=None: None)
    with pytest.raises(HTTPException) as error:
        match_access.load_match_for(db, 1, SimpleNamespace(id=77), for_update=True)
    assert (error.value.status_code, error.value.detail) == (404, 'Partida não encontrada.')
    db.on('matches', None)
    with pytest.raises(HTTPException):
        match_access.load_match_for(db, 9, SimpleNamespace(id=77))


def test_loading_a_match_returns_the_sides_and_the_role(db, monkeypatch):
    match = make_match()
    db.on('matches', match).on('match_sides', list(make_sides().values()))
    access = MatchAccess('representante', 'a')
    monkeypatch.setattr(match_access, 'match_access', lambda _db, m, user, sides=None: access)
    loaded, sides, found = match_access.load_match_for(db, 1, SimpleNamespace(id=REP_A))
    assert loaded is match and set(sides) == {'a', 'b'} and found is access

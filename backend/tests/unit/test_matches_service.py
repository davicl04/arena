"""The match service (terms, booking, cancellation, walkover, decision and chat) over a simulated session.

Each test runs the real service code on plain model instances: what it checks is the order of the rules, the
branches and what a transition writes (state, notifications, chat banner, audit, commit). The SQL and the locks are
covered by the PostgreSQL tests (`tests/integration/partida/`).
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.audit import AuditLog
from app.models.matches import Match, MatchMessage, MatchResult, MatchSide, MatchTerms
from app.models.notifications import Notification
from app.schemas.common import PersonOut
from app.schemas.matches import BookingInput, CancelInput, TermsInput, WalkoverDecisionInput
from app.services import matches
from app.services.match_access import MatchAccess
from app.services.match_rules import RuleError, TransitionError
from tests.unit.fakes import FakeDb

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
HOUR = timedelta(hours=1)
DAY = timedelta(days=1)
REP_A, REP_B, MEMBER_A, GUEST, ADMIN = 11, 22, 12, 33, 99


def make_match(**values):
    base = dict(id=1, sport='futebol', format='society', city_id=1, origin='amistoso', state='combinando',
                created_at=NOW - DAY, updated_at=NOW - DAY)
    return Match(**{**base, **values})


def make_sides():
    return {'a': MatchSide(id=1, match_id=1, side='a', team_id=1, declared_slots={'atacante': 1}),
            'b': MatchSide(id=2, match_id=1, side='b', team_id=2, declared_slots={})}


def scheduled(starts_in=2 * DAY, **values):
    start = NOW + starts_in
    return make_match(state='agendada', starts_at=start, result_deadline=start + 48 * HOUR, court_id=7,
                      booking_side='a', **values)


@pytest.fixture
def scene(monkeypatch):
    """A database that answers the lookups of names, representatives and walk-ins, and patched collaborators."""
    db = FakeDb()
    db.on('teams', [(1, 'Ferrugem FC'), (2, 'Tigres do Lago')])
    db.on('team_members', [(1, REP_A), (2, REP_B)])            # who acts for each side
    db.on('match_slots', [])
    calls = SimpleNamespace(offered=[], recalculated=[], closed=[])
    state = SimpleNamespace(db=db, calls=calls, match=None, sides=make_sides(), access=MatchAccess('representante', 'a'))

    def load(_db, match_id, user, *, for_update=False):
        return state.match, state.sides, state.access

    monkeypatch.setattr(matches, 'load_match_for', load)
    monkeypatch.setattr(matches, 'match_detail', lambda *args, **kwargs: 'detail')
    monkeypatch.setattr(matches.queue, 'offer_slots', lambda _db, match, *, now: calls.offered.append(match.id) or [])
    monkeypatch.setattr(matches, 'recalculate_for_match', lambda _db, match, *, now: calls.recalculated.append(match.id))
    monkeypatch.setattr(matches, 'close_match_slots', lambda _db, match, *, now, actor_id=None: calls.closed.append(
        actor_id) or [GUEST])
    return state


EVERYONE = [(1, REP_A), (1, MEMBER_A), (2, REP_B)]


def user(user_id=REP_A):
    return SimpleNamespace(id=user_id, name=f'Atleta {user_id}', is_admin=False)


def kinds(db, model):
    return [row for row in db.added if isinstance(row, model)]


def notified(db):
    return [(row.type, row.user_id) for row in kinds(db, Notification)]


def banners(db):
    return [row.event_type for row in kinds(db, MatchMessage)]


def audited(db):
    return [row.action for row in kinds(db, AuditLog)]


def court(**values):
    return SimpleNamespace(**{**dict(id=7, name='Quadra Central', city_id=1, state='publicada', kind='society',
                                     origin_match_id=None), **values})


# ----- Pure helpers -------------------------------------------------------------------------------------------

def test_clean_reason_trims_and_bounds():
    assert matches.clean_reason('  Estávamos lá.  ', low=5, high=500, message='x') == 'Estávamos lá.'
    for value in (None, '   ', 'oi', 'x' * 501):
        with pytest.raises(RuleError) as error:
            matches.clean_reason(value, low=5, high=500, message='Conte o que aconteceu.')
        assert (str(error.value), error.value.field) == ('Conte o que aconteceu.', 'reason')


# ----- Proposing terms ----------------------------------------------------------------------------------------

def propose_body(**values):
    return TermsInput(**{**dict(starts_at=NOW + 2 * DAY, court_id=7, booking_side='b'), **values})


def test_proposing_terms_replaces_the_pending_ones_and_tells_the_other_side(scene, monkeypatch):
    db = scene.db
    scene.match = make_match()
    monkeypatch.setattr(matches, 'usable_for_terms', lambda _db, match, court_id: court())
    pending = MatchTerms(id=5, match_id=1, state='pendente')
    db.then('match_terms', None, pending)
    result = matches.propose_terms(db, user(), 1, propose_body(), now=NOW)
    assert result == 'detail' and db.commits == 1
    [terms] = kinds(db, MatchTerms)
    assert (terms.state, terms.proposed_by_side, terms.court_id, terms.booking_side) == ('pendente', 'a', 7, 'b')
    assert terms.accepted_a_at == NOW and terms.accepted_a_by_id == REP_A and terms.accepted_b_at is None
    assert (pending.state, pending.decided_at) == ('substituida', NOW)
    assert notified(db) == [('condicoes_propostas', REP_B)]
    assert banners(db) == ['condicoes_propostas'] and audited(db) == ['condicoes.propostas']
    assert kinds(db, AuditLog)[0].data['replaced_terms_id'] == 5


def test_proposing_terms_refuses_what_the_rules_forbid(scene, monkeypatch):
    db = scene.db
    monkeypatch.setattr(matches, 'usable_for_terms', lambda _db, match, court_id: court())
    scene.match = make_match(origin='campeonato')
    with pytest.raises(TransitionError):
        matches.propose_terms(db, user(), 1, propose_body(), now=NOW)
    scene.match = make_match(state='realizada')
    with pytest.raises(TransitionError) as error:
        matches.propose_terms(db, user(), 1, propose_body(), now=NOW)
    assert str(error.value) == matches.TERMS_CLOSED
    scene.match = make_match()
    with pytest.raises(RuleError) as error:
        matches.propose_terms(db, user(), 1, propose_body(super_tiebreak=True), now=NOW)
    assert error.value.field == 'super_tiebreak'
    with pytest.raises(RuleError) as error:
        matches.propose_terms(db, user(), 1, propose_body(starts_at=NOW - HOUR), now=NOW)
    assert error.value.field == 'starts_at'
    scene.access = MatchAccess('membro', 'a')
    with pytest.raises(HTTPException) as error:
        matches.propose_terms(db, user(MEMBER_A), 1, propose_body(), now=NOW)
    assert (error.value.status_code, error.value.detail) == (403, 'Só os representantes propõem as condições.')
    assert db.commits == 0 and db.added == []


def test_the_agreed_terms_cannot_be_proposed_again(scene, monkeypatch):
    start = NOW + 2 * DAY
    scene.match = scheduled()
    monkeypatch.setattr(matches, 'usable_for_terms', lambda _db, match, court_id: court())
    scene.db.then('match_terms', MatchTerms(id=4, match_id=1, starts_at=start, court_id=7, booking_side='b',
                                            super_tiebreak=None, state='aceita'))
    with pytest.raises(TransitionError) as error:
        matches.propose_terms(scene.db, user(), 1, propose_body(starts_at=start), now=NOW)
    assert str(error.value) == 'Estas já são as condições combinadas.'


def test_tennis_terms_default_the_super_tiebreak_to_false(scene, monkeypatch):
    db = scene.db
    scene.match = make_match(sport='tenis', format=None)
    scene.sides = {'a': MatchSide(id=1, match_id=1, side='a', user_id=REP_A),
                   'b': MatchSide(id=2, match_id=1, side='b', user_id=REP_B)}
    scene.access = MatchAccess('atleta', 'a')
    monkeypatch.setattr(matches, 'usable_for_terms', lambda _db, match, court_id: court(kind='tenis'))
    db.on('users', [(REP_A, 'Rafa'), (REP_B, 'Davi')]).then('match_terms', None, None)
    matches.propose_terms(db, user(), 1, propose_body(), now=NOW)
    assert kinds(db, MatchTerms)[0].super_tiebreak is False
    assert notified(db) == [('condicoes_propostas', REP_B)]


# ----- Accepting terms ----------------------------------------------------------------------------------------

def pending_terms(**values):
    base = dict(id=5, match_id=1, proposed_by_side='a', starts_at=NOW + 2 * DAY, court_id=7, booking_side='b',
                super_tiebreak=None, state='pendente', accepted_a_at=NOW - HOUR)
    return MatchTerms(**{**base, **values})


def test_the_first_agreement_schedules_the_match_opens_the_slots_and_offers_them(scene):
    db = scene.db
    scene.match = make_match()
    scene.access = MatchAccess('representante', 'b')
    terms = pending_terms()
    db.then('match_terms', terms, None)
    db.put(matches.Court, court())
    db.on('team_members', EVERYONE)
    db.on('match_sides', list(scene.sides.values()))
    result = matches.accept_terms(db, user(REP_B), 1, 5, now=NOW)
    assert result == 'detail' and db.commits == 1
    match = scene.match
    assert (match.state, match.starts_at, match.court_id, match.booking_side) == (
        'agendada', terms.starts_at, 7, 'b')
    assert match.result_deadline == terms.starts_at + 48 * HOUR
    assert (terms.state, terms.accepted_b_at, terms.accepted_b_by_id) == ('aceita', NOW, REP_B)
    # The declared slot of side A opened and was offered to the walk-ins waiting.
    assert [(slot.side, slot.position, slot.state) for slot in db.added if hasattr(slot, 'position')] == [
        ('a', 'atacante', 'aberta')]
    assert scene.calls.offered == [1]
    assert {user_id for kind, user_id in notified(db) if kind == 'partida_agendada'} == {REP_A, MEMBER_A}
    assert all(row.payload['changed'] is False for row in kinds(db, Notification))
    assert banners(db) == ['partida_agendada'] and audited(db) == ['condicoes.aceitas', 'partida.agendada']


def test_new_terms_after_the_agreement_replace_the_old_ones_and_reopen_the_booking(scene):
    db = scene.db
    scene.match = scheduled()
    scene.match.booking_confirmed_at, scene.match.booking_confirmed_by_id = NOW - HOUR, REP_A
    scene.access = MatchAccess('representante', 'b')
    terms = pending_terms(starts_at=NOW + 3 * DAY)
    previous = MatchTerms(id=4, match_id=1, state='aceita')
    db.then('match_terms', terms, previous)
    db.put(matches.Court, court())
    matches.accept_terms(db, user(REP_B), 1, 5, now=NOW)
    assert (scene.match.state, scene.match.starts_at) == ('agendada', terms.starts_at)
    assert (previous.state, previous.decided_at) == ('substituida', NOW)
    assert scene.match.booking_confirmed_at is None and scene.match.booking_confirmed_by_id is None
    assert scene.calls.offered == []
    assert all(row.payload['changed'] is True for row in kinds(db, Notification))
    assert banners(db) == ['condicoes_aceitas'] and audited(db) == ['condicoes.aceitas']
    assert 'reserva volta' in kinds(db, MatchMessage)[0].body


def test_accepting_terms_checks_the_terms_before_changing_anything(scene):
    db = scene.db
    scene.access = MatchAccess('representante', 'b')
    scene.match = make_match()
    db.then('match_terms', None)
    with pytest.raises(HTTPException) as error:
        matches.accept_terms(db, user(REP_B), 1, 5, now=NOW)
    assert (error.value.status_code, error.value.detail) == (404, 'Condições não encontradas.')
    for state in ('substituida', 'cancelada'):
        db.then('match_terms', pending_terms(state=state))
        with pytest.raises(TransitionError) as error:
            matches.accept_terms(db, user(REP_B), 1, 5, now=NOW)
        assert 'substituídas' in str(error.value)
    db.then('match_terms', pending_terms(starts_at=NOW - HOUR))
    with pytest.raises(TransitionError) as error:
        matches.accept_terms(db, user(REP_B), 1, 5, now=NOW)
    assert str(error.value) == 'O horário proposto já passou. Proponha outro.'
    scene.match = make_match(state='realizada')
    db.then('match_terms', pending_terms())
    with pytest.raises(TransitionError) as error:
        matches.accept_terms(db, user(REP_B), 1, 5, now=NOW)
    assert str(error.value) == matches.TERMS_CLOSED
    scene.match = make_match(origin='campeonato')
    with pytest.raises(TransitionError):
        matches.accept_terms(db, user(REP_B), 1, 5, now=NOW)
    assert db.commits == 0 and db.added == []


def test_accepting_twice_for_the_same_side_changes_nothing(scene):
    scene.match = make_match()
    scene.db.then('match_terms', pending_terms(accepted_b_at=NOW - HOUR))
    scene.access = MatchAccess('representante', 'b')
    assert matches.accept_terms(scene.db, user(REP_B), 1, 5, now=NOW) == 'detail'
    assert scene.db.commits == 0 and scene.db.added == []


# ----- Booking and cancellation -------------------------------------------------------------------------------

def test_the_side_that_books_confirms_and_unconfirms_the_booking(scene):
    db = scene.db
    scene.match = scheduled()
    matches.set_booking(db, user(), 1, BookingInput(confirmed=True), now=NOW)
    assert (scene.match.booking_confirmed_at, scene.match.booking_confirmed_by_id) == (NOW, REP_A)
    assert banners(db) == ['reserva_atualizada'] and audited(db) == ['partida.reserva_atualizada']
    matches.set_booking(db, user(), 1, BookingInput(confirmed=True), now=NOW)       # same value: no new banner
    assert banners(db) == ['reserva_atualizada']
    matches.set_booking(db, user(), 1, BookingInput(confirmed=False), now=NOW + HOUR)
    assert scene.match.booking_confirmed_at is None and len(banners(db)) == 2 and db.commits == 3


def test_only_the_booking_side_before_the_start_changes_the_booking(scene):
    scene.match = scheduled()
    scene.access = MatchAccess('representante', 'b')
    with pytest.raises(HTTPException) as error:
        matches.set_booking(scene.db, user(REP_B), 1, BookingInput(confirmed=True), now=NOW)
    assert (error.value.status_code, error.value.detail) == (403, 'Só quem reserva confirma a reserva.')
    scene.access = MatchAccess('representante', 'a')
    for match in (make_match(booking_side='a'), scheduled(starts_in=-HOUR)):
        scene.match = match
        with pytest.raises(TransitionError):
            matches.set_booking(scene.db, user(), 1, BookingInput(confirmed=True), now=NOW)


def test_cancelling_closes_the_match_the_slots_and_tells_everyone(scene):
    db = scene.db
    scene.match = scheduled(starts_in=3 * DAY)
    db.then('match_terms', MatchTerms(id=5, match_id=1, state='pendente'))
    db.on('team_members', EVERYONE).on('match_slots', [(GUEST, 'a')])
    matches.cancel_match(db, user(), 1, CancelInput(reason='  Quadra interditada  '), now=NOW)
    match = scene.match
    assert (match.state, match.cancelled_by_id, match.cancel_reason, match.closed_at) == (
        'cancelada', REP_A, 'Quadra interditada', NOW)
    assert scene.calls.closed == [REP_A]
    assert {user_id for _, user_id in notified(db)} == {MEMBER_A, REP_B, GUEST}       # not the one who cancelled
    assert banners(db) == ['partida_cancelada'] and audited(db) == ['partida.cancelada']
    assert kinds(db, AuditLog)[0].data == {'reason': 'Quadra interditada', 'guests': [GUEST]}


def test_cancelling_follows_the_cancellation_rules(scene):
    scene.match = scheduled(starts_in=5 * HOUR)
    with pytest.raises(TransitionError) as error:
        matches.cancel_match(scene.db, user(), 1, CancelInput(), now=NOW)
    assert 'menos de 24 h' in str(error.value)
    scene.match = make_match(origin='campeonato')
    with pytest.raises(TransitionError):
        matches.cancel_match(scene.db, user(), 1, CancelInput(), now=NOW)
    scene.match = make_match()
    scene.access = MatchAccess('membro', 'a')
    with pytest.raises(HTTPException) as error:
        matches.cancel_match(scene.db, user(MEMBER_A), 1, CancelInput(), now=NOW)
    assert error.value.status_code == 403


# ----- Walkover -----------------------------------------------------------------------------------------------

def started(**values):
    return scheduled(starts_in=-2 * HOUR, **values)


def test_the_side_that_showed_up_registers_the_walkover_and_clears_its_own_score(scene):
    db = scene.db
    scene.match = started()
    mine = MatchResult(id=3, match_id=1, side='a', score_a=2, score_b=0)
    db.on('match_results', [mine])
    matches.register_walkover(db, user(), 1, now=NOW)
    match = scene.match
    assert (match.walkover_absent_side, match.walkover_registered_by_id, match.walkover_registered_at) == (
        'b', REP_A, NOW)
    assert db.deleted == [mine]
    assert notified(db) == [('wo_registrado', REP_B)]
    assert banners(db) == ['wo_registrado'] and audited(db) == ['partida.wo_registrado']
    assert kinds(db, AuditLog)[0].data == {'absent_side': 'b', 'cleared_report': True}


def test_the_walkover_is_refused_outside_its_window_and_after_the_other_side_reported(scene):
    db = scene.db
    db.on('match_results', [])
    cases = [(make_match(origin='campeonato'), 'organizador'), (make_match(), 'agendadas'),
             (scheduled(starts_in=HOUR), 'depois do horário'), (started(), None)]
    for match, text in cases[:3]:
        scene.match = match
        with pytest.raises(TransitionError) as error:
            matches.register_walkover(db, user(), 1, now=NOW)
        assert text in str(error.value)
    scene.match = started()
    late = NOW + 48 * HOUR
    with pytest.raises(TransitionError) as error:
        matches.register_walkover(db, user(), 1, now=late)
    assert error.value.args[0] == matches.WALKOVER_WINDOW_CLOSED
    scene.match = started(walkover_absent_side='b')
    with pytest.raises(TransitionError):
        matches.register_walkover(db, user(), 1, now=NOW)
    scene.match = started()
    db.on('match_results', [MatchResult(id=4, match_id=1, side='b', score_a=0, score_b=1)])
    with pytest.raises(TransitionError) as error:
        matches.register_walkover(db, user(), 1, now=NOW)
    assert 'já informou o placar' in str(error.value)
    assert db.commits == 0


def test_the_walkover_can_be_withdrawn_until_it_is_contested(scene):
    db = scene.db
    scene.match = started(walkover_absent_side='b', walkover_registered_by_id=REP_A, walkover_registered_at=NOW)
    matches.withdraw_walkover(db, user(), 1, now=NOW)
    assert scene.match.walkover_absent_side is None and scene.match.walkover_registered_by_id is None
    assert banners(db) == ['wo_retirado'] and audited(db) == ['partida.wo_retirado'] and db.commits == 1
    for match, text in ((started(), 'seu lado'), (started(walkover_absent_side='a'), 'seu lado'),
                        (started(walkover_absent_side='b', walkover_contested_at=NOW), 'contestado')):
        scene.match = match
        with pytest.raises(TransitionError) as error:
            matches.withdraw_walkover(db, user(), 1, now=NOW)
        assert text in str(error.value)
    scene.match = started(walkover_absent_side='b')
    with pytest.raises(TransitionError):
        matches.withdraw_walkover(db, user(), 1, now=NOW + 49 * HOUR)


def test_the_absent_side_contests_the_walkover_once_and_the_administration_is_told(scene):
    db = scene.db
    scene.match = started(walkover_absent_side='b')
    scene.access = MatchAccess('representante', 'b')
    db.on('users', [ADMIN])
    matches.contest_walkover(db, user(REP_B), 1, '  Estávamos na quadra.  ', now=NOW)
    match = scene.match
    assert (match.walkover_contested_by_id, match.walkover_contested_at, match.walkover_contest_reason) == (
        REP_B, NOW, 'Estávamos na quadra.')
    assert sorted(notified(db)) == [('wo_contestado', REP_A), ('wo_contestado', ADMIN)]
    assert banners(db) == ['wo_contestado'] and audited(db) == ['partida.wo_contestado']


def test_contesting_the_walkover_follows_the_rules(scene):
    db = scene.db
    scene.access = MatchAccess('representante', 'b')
    scene.match = started()
    with pytest.raises(TransitionError):
        matches.contest_walkover(db, user(REP_B), 1, 'Estávamos lá.', now=NOW)
    scene.match = started(walkover_absent_side='a')
    with pytest.raises(HTTPException) as error:
        matches.contest_walkover(db, user(REP_B), 1, 'Estávamos lá.', now=NOW)
    assert (error.value.status_code, error.value.detail) == (403, 'Só o lado ausente contesta o W.O.')
    scene.match = started(walkover_absent_side='b', walkover_contested_at=NOW)
    with pytest.raises(TransitionError) as error:
        matches.contest_walkover(db, user(REP_B), 1, 'Estávamos lá.', now=NOW)
    assert str(error.value) == 'O W.O. já foi contestado.'
    scene.match = started(walkover_absent_side='b')
    with pytest.raises(TransitionError):
        matches.contest_walkover(db, user(REP_B), 1, 'Estávamos lá.', now=NOW + 49 * HOUR)
    with pytest.raises(RuleError) as error:
        matches.contest_walkover(db, user(REP_B), 1, 'não', now=NOW)
    assert (str(error.value), error.value.field) == ('Conte o que aconteceu.', 'reason')


# ----- Administration decides a contested walkover ------------------------------------------------------------

def contested(**values):
    return started(walkover_absent_side='b', walkover_contested_at=NOW - HOUR, **values)


@pytest.fixture
def decision(scene, monkeypatch):
    scene.db.on('match_sides', list(scene.sides.values()))
    monkeypatch.setattr(matches, '_disputes_out', lambda _db, admin, rows, *, now: [f'dispute-{rows[0].id}'])
    return scene


def test_keeping_the_walkover_gives_the_win_to_who_showed_up(decision):
    db = decision.db
    decision.match = contested()
    db.on('matches', decision.match).on('match_slots', [(GUEST, 'a')]).on('team_members', EVERYONE)
    admin = user(ADMIN)
    out = matches.decide_walkover(db, admin, 1, WalkoverDecisionInput(decision='manter', reason='Sem prova.'), now=NOW)
    match = decision.match
    assert out == 'dispute-1' and db.commits == 1
    assert (match.state, match.score_a, match.score_b, match.winner_side, match.result_source) == (
        'encerrada', 3, 0, 'a', 'administracao')
    assert (match.walkover_decision, match.walkover_decided_by_id) == ('mantido', ADMIN)
    assert decision.calls.recalculated == [1]
    assert 'Ferrugem FC' in kinds(db, MatchMessage)[0].body and '3 × 0' in kinds(db, MatchMessage)[0].body
    types = [kind for kind, _ in notified(db)]
    assert types.count('wo_decidido') == 3 and types.count('resultado_partida') == 1     # members; the walk-in hears the result
    assert audited(db) == ['partida.wo_decidido']


def test_annulling_the_walkover_ends_the_match_without_result(decision):
    db = decision.db
    decision.match = contested()
    db.on('matches', decision.match).on('match_slots', []).on('team_members', EVERYONE)
    matches.decide_walkover(db, user(ADMIN), 1, WalkoverDecisionInput(decision='anular', reason='Houve falha.'),
                            now=NOW)
    match = decision.match
    assert (match.state, match.score_a, match.walkover_decision, match.closed_at) == (
        'sem_resultado', None, 'anulado', NOW)
    assert decision.calls.recalculated == []
    assert kinds(db, MatchMessage)[0].body == 'A administração anulou o W.O. A partida ficou sem resultado.'


def test_deciding_needs_a_contested_walkover_and_a_reason(decision):
    db = decision.db
    db.on('matches', None)
    with pytest.raises(HTTPException) as error:
        matches.decide_walkover(db, user(ADMIN), 9, WalkoverDecisionInput(decision='manter', reason='Motivo ok'),
                                now=NOW)
    assert error.value.status_code == 404
    for match in (started(), contested(walkover_decision='mantido'), make_match()):
        db.on('matches', match)
        with pytest.raises(TransitionError) as error:
            matches.decide_walkover(db, user(ADMIN), 1, WalkoverDecisionInput(decision='manter', reason='Motivo ok'),
                                    now=NOW)
        assert str(error.value) == 'Este W.O. não aguarda decisão.'
    db.on('matches', contested())
    with pytest.raises(RuleError) as error:
        matches.decide_walkover(db, user(ADMIN), 1, WalkoverDecisionInput(decision='manter', reason='x'), now=NOW)
    assert str(error.value) == 'Descreva a decisão.'
    assert db.commits == 0


def test_the_queue_counter_and_the_admin_ids(scene):
    scene.db.on('matches', 3).on('users', [5, 7])
    assert matches.dispute_count(scene.db) == 3
    assert matches._admin_ids(scene.db) == [5, 7]
    scene.db.on('matches', None)
    assert matches.dispute_count(scene.db) == 0


# ----- Chat ---------------------------------------------------------------------------------------------------

def message(message_id, author=REP_A, *, kind='texto', side='a', body='Oi', removed=False):
    return MatchMessage(id=message_id, match_id=1, author_id=author if kind == 'texto' else None, side=side,
                        kind=kind, event_type=None if kind == 'texto' else 'partida_agendada', body=body,
                        removed_at=NOW if removed else None, created_at=NOW)


@pytest.fixture
def chat(scene, monkeypatch):
    scene.match = scheduled()
    monkeypatch.setattr(matches, 'people_out', lambda _db, viewer, ids: {
        user_id: PersonOut(id=user_id, name=f'Atleta {user_id}', username=f'atleta{user_id}', avatar_url=None)
        for user_id in ids if user_id is not None})
    scene.db.on('team_members', [(REP_A, 1, 'representante'), (MEMBER_A, 1, 'membro')])
    scene.db.on('match_slots', [GUEST])
    return scene


def test_messages_page_returns_the_latest_in_ascending_order_with_the_author_role(chat):
    db = chat.db
    db.on('match_messages', [message(5, GUEST, side='b'), message(4, MEMBER_A), message(3, kind='evento'),
                             message(2, REP_A, removed=True)])
    page = matches.messages_page(db, user(), 1, after=None, before=None, limit=3)
    assert page.has_more is True and page.last_id == 5
    assert [item.id for item in page.items] == [3, 4, 5]
    by_id = {item.id: item for item in page.items}
    assert (by_id[3].author, by_id[3].author_role, by_id[3].is_mine) == (None, None, False)
    assert by_id[4].author_role == 'membro' and by_id[5].author_role == 'avulso' and not by_id[5].is_mine
    # The removed message keeps its place without its text.
    older = matches.messages_page(db, user(), 1, after=None, before=5, limit=10)
    removed = [item for item in older.items if item.id == 2][0]
    assert (removed.removed, removed.body) == (True, None)


def test_messages_page_polls_only_the_newer_messages(chat):
    db = chat.db
    db.on('match_messages', [message(8, REP_A), message(9, REP_A)])
    page = matches.messages_page(db, user(), 1, after=7, before=None, limit=10)
    assert [item.id for item in page.items] == [8, 9] and page.last_id == 9 and not page.has_more
    assert page.items[0].is_mine and page.items[0].author_role == 'representante'
    db.on('match_messages', [])
    quiet = matches.messages_page(db, user(), 1, after=9, before=None, limit=10)
    assert (quiet.items, quiet.last_id, quiet.has_more) == ([], 9, False)


def test_messages_page_refuses_conflicting_cursors_and_a_closed_chat(chat):
    with pytest.raises(RuleError) as error:
        matches.messages_page(chat.db, user(), 1, after=1, before=2, limit=10)
    assert error.value.field == 'before'
    chat.match = make_match(state='proposta')
    with pytest.raises(HTTPException) as error:
        matches.messages_page(chat.db, user(), 1, after=None, before=None, limit=10)
    assert (error.value.status_code, error.value.detail) == (403, matches.CHAT_NOT_OPEN)


def test_a_participant_posts_a_trimmed_message(chat):
    out = matches.post_message(chat.db, user(), 1, '  Chego em dez minutos.  ', now=NOW)
    [row] = kinds(chat.db, MatchMessage)
    assert (row.body, row.side, row.author_id, row.kind) == ('Chego em dez minutos.', 'a', REP_A, 'texto')
    assert chat.db.commits == 1 and out.body == 'Chego em dez minutos.' and out.is_mine


def test_posting_follows_the_chat_rules(chat):
    for access, state, status in ((MatchAccess('administracao', None), 'agendada', 403),
                                  (MatchAccess('membro', 'a'), 'proposta', 403),
                                  (MatchAccess('membro', 'a'), 'cancelada', 409)):
        chat.access, chat.match = access, make_match(state=state)
        with pytest.raises(HTTPException) as error:
            matches.post_message(chat.db, user(), 1, 'Oi', now=NOW)
        assert error.value.status_code == status
    chat.access, chat.match = MatchAccess('membro', 'a'), scheduled()
    for body in ('   ', 'x' * 1001):
        with pytest.raises(RuleError) as error:
            matches.post_message(chat.db, user(), 1, body, now=NOW)
        assert error.value.field == 'body'
    assert chat.db.added == [] and chat.db.commits == 0


def test_a_reader_reports_only_a_text_message_still_visible(scene, monkeypatch):
    db = scene.db
    match = scheduled()
    db.put(MatchMessage, message(5))
    db.put(Match, match)
    db.put(MatchMessage, message(6, kind='evento'))
    db.put(MatchMessage, message(7, removed=True))
    db.on('match_sides', list(scene.sides.values()))
    monkeypatch.setattr(matches, 'match_access', lambda _db, m, viewer, sides=None: MatchAccess('membro', 'a'))
    assert matches.reportable_message(db, user(), 5).id == 5
    for message_id in (6, 7, 404):
        with pytest.raises(HTTPException) as error:
            matches.reportable_message(db, user(), message_id)
        assert (error.value.status_code, error.value.detail) == (404, 'Conteúdo não encontrado.')
    monkeypatch.setattr(matches, 'match_access', lambda _db, m, viewer, sides=None: None)
    with pytest.raises(HTTPException):
        matches.reportable_message(db, user(), 5)


def test_the_match_label_names_both_sides(scene):
    scene.db.on('match_sides', list(scene.sides.values()))
    assert matches.match_label(scene.db, 1) == 'Ferrugem FC × Tigres do Lago'

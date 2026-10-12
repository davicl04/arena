"""Searches, proposals and the Jogar board over a simulated session (no database).

The real service code runs on plain model instances with the queue patched where pairing is not the subject: what
is checked is the order of the rules, the effective states a read shows before the sweep, and what each write
leaves behind. Pairing and SQL are checked on PostgreSQL (`tests/integration/test_matchmaking_*.py`).
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.models.audit import AuditLog
from app.models.identity import City
from app.models.matches import Match, MatchSearch, MatchSide, MatchSlot
from app.models.teams import Team
from app.schemas.matches import SearchInput
from app.services import matchmaking
from app.services.match_access import MatchAccess
from app.services.match_rules import TransitionError
from tests.unit.fakes import FakeDb

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
HOUR = timedelta(hours=1)
DAY = timedelta(days=1)
REP, MEMBER, GUEST = 11, 12, 33
CITY = City(id=1, name='Brasília', state='DF')
TEAM = Team(id=1, name='Ferrugem FC', city_id=1, state='ativo')


def make_search(search_id=10, *, kind='time', team_id=1, user_id=None, state='ativa', **values):
    base = dict(id=search_id, kind=kind, sport='tenis' if kind == 'tenis' else 'futebol', city_id=1,
                format='society' if kind == 'time' else None, team_id=team_id if kind == 'time' else None,
                user_id=user_id, position=None, tier=None, state=state, started_at=NOW - HOUR,
                expires_at=NOW + 20 * HOUR, open_slots={'goleiro': 0, 'defesa': 0, 'meio_campo': 0, 'atacante': 1}
                if kind == 'time' else None)
    return MatchSearch(**{**base, **values})


def make_match(**values):
    base = dict(id=1, sport='futebol', format='society', city_id=1, origin='amistoso', state='proposta',
                proposal_expires_at=NOW + HOUR, created_at=NOW - HOUR, updated_at=NOW - HOUR)
    return Match(**{**base, **values})


def user(user_id=REP):
    return SimpleNamespace(id=user_id, name=f'Atleta {user_id}')


def kinds(db, model):
    return [row for row in db.added if isinstance(row, model)]


@pytest.fixture
def db():
    fake = FakeDb()
    fake.on('cities', [CITY]).on('teams', [TEAM]).put(Team, TEAM)
    fake.on('team_members', [(1, 'representante')])
    return fake


# ----- Searches as the viewer sees them -----------------------------------------------------------------------

def test_a_waiting_search_can_be_cancelled_by_a_representative_and_not_by_a_member(db):
    search = make_search()
    [out] = matchmaking.searches_out(db, user(), [search], now=NOW)
    assert (out.id, out.state, out.can_cancel, out.match_id, out.team.name, out.city.name) == (
        10, 'ativa', True, None, 'Ferrugem FC', 'Brasília')
    assert out.open_slots.atacante == 1 and out.format == 'society'
    db.on('team_members', [(1, 'membro')])
    assert matchmaking.searches_out(db, user(MEMBER), [search], now=NOW)[0].can_cancel is False
    assert matchmaking.searches_out(db, user(), [], now=NOW) == []


def test_the_state_of_a_search_is_the_one_the_sweep_would_leave(db):
    expired = make_search(1, expires_at=NOW - HOUR)
    held = make_search(2, state='pareada', match_id=1)
    accepted_then_lapsed = make_search(3, state='pareada', match_id=2)
    walkin = make_search(4, kind='avulso', user_id=GUEST, state='pareada', slot_id=5, offer_expires_at=NOW - HOUR)
    offer = make_search(5, kind='avulso', user_id=GUEST, state='pareada', slot_id=6, offer_expires_at=NOW + HOUR)
    db.on('matches', [make_match(id=1), make_match(id=2, proposal_expires_at=NOW - HOUR)])
    db.on('match_sides', [MatchSide(id=1, match_id=1, side='a', search_id=2),
                          MatchSide(id=2, match_id=2, side='a', search_id=3, accepted_at=NOW - 2 * HOUR)])
    out = {item.id: item for item in matchmaking.searches_out(
        db, user(), [expired, held, accepted_then_lapsed, walkin, offer], now=NOW)}
    assert out[1].state == 'expirada' and not out[1].can_cancel
    assert (out[2].state, out[2].match_id) == ('pareada', 1)
    assert (out[3].state, out[3].match_id) == ('ativa', None)             # the side that accepted waits again
    assert (out[4].state, out[4].slot_id, out[4].offer_expires_at) == ('sem_resposta', None, None)
    assert (out[5].state, out[5].slot_id) == ('pareada', 6)


# ----- Proposals ----------------------------------------------------------------------------------------------

@pytest.fixture
def proposals(db, monkeypatch):
    sides = [MatchSide(id=1, match_id=1, side='a', team_id=1), MatchSide(id=2, match_id=1, side='b', team_id=2)]
    state = SimpleNamespace(access={1: MatchAccess('representante', 'a')})
    monkeypatch.setattr(matchmaking, 'load_sides', lambda _db, ids: {match_id: {s.side: s for s in sides} for match_id in ids})
    monkeypatch.setattr(matchmaking, 'match_accesses', lambda _db, matches, who, sides=None: state.access)
    monkeypatch.setattr(matchmaking, 'sides_out', lambda _db, viewer, sides, my_sides=None: {
        match_id: [f'side-{label}' for label in by_side] for match_id, by_side in sides.items()})
    monkeypatch.setattr(matchmaking, 'ProposalOut', lambda **kwargs: SimpleNamespace(**kwargs))
    return state


def test_a_proposal_shows_the_effective_state_and_whether_the_viewer_can_answer(db, proposals):
    [out] = matchmaking.proposals_out(db, user(), [make_match()], now=NOW)
    assert (out.match_id, out.state, out.my_side, out.my_role, out.can_respond) == (
        1, 'proposta', 'a', 'representante', True)
    assert out.sides == ['side-a', 'side-b'] and out.city.name == 'Brasília'
    [lapsed] = matchmaking.proposals_out(db, user(), [make_match(proposal_expires_at=NOW - HOUR)], now=NOW)
    assert (lapsed.state, lapsed.can_respond) == ('expirada', False)
    proposals.access = {1: MatchAccess('membro', 'a')}
    assert matchmaking.proposals_out(db, user(MEMBER), [make_match()], now=NOW)[0].can_respond is False
    # Already past the proposal (scheduled, cancelled...): left out.
    assert matchmaking.proposals_out(db, user(), [make_match(state='agendada', proposal_expires_at=None)], now=NOW) == []
    assert matchmaking.proposals_out(db, user(), [], now=NOW) == []


def test_a_proposal_of_a_stranger_is_not_found(db, proposals):
    proposals.access = {1: None}
    with pytest.raises(HTTPException) as error:
        matchmaking.proposals_out(db, user(77), [make_match()], now=NOW)
    assert (error.value.status_code, error.value.detail) == (404, matchmaking.MATCH_NOT_FOUND)


# ----- Creating a search --------------------------------------------------------------------------------------

@pytest.fixture
def creating(db, monkeypatch):
    state = SimpleNamespace(enqueued=[], error=None, resubmitted=None)

    def enqueue(_db, search, *, now):
        if state.error is not None:
            raise state.error
        state.enqueued.append(search)
        _db.add(search)
        return None

    monkeypatch.setattr(matchmaking.queue, 'enqueue', enqueue)
    monkeypatch.setattr(matchmaking, 'subject_tier', lambda *args, **kwargs: 'prata')
    monkeypatch.setattr(matchmaking, '_created_out', lambda _db, who, search, *, now: f'created-{search.id}')
    monkeypatch.setattr(matchmaking, 'settle', lambda _db, search_id, now: state.resubmitted)
    return state


def test_a_tennis_search_takes_the_city_of_the_profile_and_the_tier_of_the_player(db, creating):
    db.on('sports_profiles', 1).on('match_searches', None)
    out, is_new = matchmaking.create_search_with_status(db, user(), SearchInput(sport='tenis'), now=NOW)
    [search] = creating.enqueued
    assert is_new is True and out.startswith('created-')
    assert (search.kind, search.city_id, search.user_id, search.tier, search.state) == ('tenis', 1, REP, 'prata', 'ativa')
    assert (search.started_at, search.expires_at) == (NOW, NOW + DAY)
    [entry] = kinds(db, AuditLog)
    assert (entry.action, entry.data['kind'], entry.data['tier']) == ('busca.criada', 'tenis', 'prata') and db.commits == 1


def test_a_walkin_search_has_no_tier_and_keeps_the_position(db, creating):
    db.on('sports_profiles', 1).on('match_searches', None)
    matchmaking.create_search(db, user(GUEST), SearchInput(sport='futebol', position='goleiro'), now=NOW)
    [search] = creating.enqueued
    assert (search.kind, search.position, search.tier, search.format, search.team_id) == (
        'avulso', 'goleiro', None, None, None)


def test_a_team_search_needs_a_representative_and_declares_the_slots(db, creating):
    db.then('team_members', 'representante', 'representante').on('match_searches', None)
    db.then('teams', TEAM)
    body = SearchInput(sport='futebol', team_id=1, format='society', open_slots={'atacante': 1, 'goleiro': 1})
    matchmaking.create_search(db, user(), body, now=NOW)
    [search] = creating.enqueued
    assert (search.kind, search.team_id, search.user_id, search.city_id, search.tier) == ('time', 1, None, 1, 'prata')
    assert search.open_slots == {'goleiro': 1, 'defesa': 0, 'meio_campo': 0, 'atacante': 1}
    assert kinds(db, AuditLog)[0].data['open_slots'] == search.open_slots


@pytest.mark.parametrize(('roles', 'status', 'message'), [
    ([None], 404, matchmaking.TEAM_NOT_FOUND), (['membro'], 403, matchmaking.ONLY_REP_SEARCH),
    (['representante', None], 404, matchmaking.TEAM_NOT_FOUND),
    (['representante', 'membro'], 403, matchmaking.ONLY_REP_SEARCH)])
def test_a_team_search_of_who_is_not_a_representative_is_refused(db, creating, roles, status, message):
    db.then('team_members', *roles).then('teams', TEAM)
    with pytest.raises(HTTPException) as error:
        matchmaking.create_search(db, user(), SearchInput(sport='futebol', team_id=1, format='society'), now=NOW)
    assert (error.value.status_code, error.value.detail) == (status, message)
    assert creating.enqueued == [] and db.commits == 0


def test_a_search_needs_the_city_of_the_profile(db, creating):
    db.on('sports_profiles', None)
    with pytest.raises(HTTPException) as error:
        matchmaking.create_search(db, user(), SearchInput(sport='tenis'), now=NOW)
    assert (error.value.status_code, error.value.detail) == (409, matchmaking.PROFILE_CITY['tenis'])
    with pytest.raises(HTTPException) as error:
        matchmaking.create_search(db, user(), SearchInput(sport='futebol'), now=NOW)
    assert error.value.detail == matchmaking.PROFILE_CITY['futebol']


def test_a_search_that_is_already_open_is_returned_untouched(db, creating):
    db.on('sports_profiles', 1).on('match_searches', 10)
    creating.resubmitted = make_search()
    out, is_new = matchmaking.create_search_with_status(db, user(), SearchInput(sport='tenis'), now=NOW)
    assert (out, is_new) == ('created-10', False) and creating.enqueued == [] and db.commits == 1


def test_a_double_submission_that_loses_the_race_returns_the_winner(db, creating, monkeypatch):
    db.on('sports_profiles', 1).then('match_searches', None, 10)
    creating.error = IntegrityError('insert', {}, Exception('uq_match_searches_open_user'))
    # The first look finds nothing; the insert collides; the second look finds the search of the other request.
    monkeypatch.setattr(matchmaking, 'settle', lambda _db, search_id, now: make_search() if search_id == 10 else None)
    out, is_new = matchmaking.create_search_with_status(db, user(), SearchInput(sport='tenis'), now=NOW)
    assert (out, is_new) == ('created-10', False) and db.commits == 1


def test_an_integrity_error_without_a_winner_is_not_hidden(db, creating):
    db.on('sports_profiles', 1).on('match_searches', None)
    creating.error = IntegrityError('insert', {}, Exception('other'))
    with pytest.raises(IntegrityError):
        matchmaking.create_search(db, user(), SearchInput(sport='tenis'), now=NOW)
    assert db.commits == 0


# ----- Cancelling ---------------------------------------------------------------------------------------------

def test_the_owner_cancels_a_waiting_search(db, monkeypatch):
    search = make_search()
    db.put(MatchSearch, search)
    monkeypatch.setattr(matchmaking, 'settle', lambda _db, search_id, now: search)
    matchmaking.cancel_search(db, user(), 10, now=NOW)
    assert (search.state, search.ended_at) == ('cancelada', NOW) and db.commits == 1
    assert [row.action for row in kinds(db, AuditLog)] == ['busca.cancelada']


@pytest.mark.parametrize(('search', 'roles', 'viewer', 'status', 'text'), [
    (None, [], REP, 404, matchmaking.SEARCH_NOT_FOUND),
    (make_search(), [], REP, 404, matchmaking.SEARCH_NOT_FOUND),
    (make_search(), [(1, 'membro')], MEMBER, 403, matchmaking.ONLY_REP_CANCEL),
    (make_search(kind='tenis', user_id=51), [], REP, 404, matchmaking.SEARCH_NOT_FOUND)])
def test_cancelling_is_for_the_owner_of_the_search(db, search, roles, viewer, status, text):
    if search is not None:
        db.put(MatchSearch, search)
    db.on('team_members', roles)
    with pytest.raises(HTTPException) as error:
        matchmaking.cancel_search(db, user(viewer), 10, now=NOW)
    assert (error.value.status_code, error.value.detail) == (status, text) and db.commits == 0


@pytest.mark.parametrize(('settled', 'message'), [
    (None, matchmaking.SEARCH_ENDED), (make_search(state='pareada'), matchmaking.SEARCH_PAIRED),
    (make_search(kind='avulso', user_id=GUEST, state='pareada'), matchmaking.SEARCH_OFFERED)])
def test_a_search_that_ended_or_holds_a_proposal_is_not_cancelled(db, monkeypatch, settled, message):
    owner = GUEST if settled is not None and settled.kind == 'avulso' else REP
    db.put(MatchSearch, settled or make_search(10))
    monkeypatch.setattr(matchmaking, 'settle', lambda _db, search_id, now: settled)
    with pytest.raises(HTTPException) as error:
        matchmaking.cancel_search(db, user(owner), 10, now=NOW)
    assert (error.value.status_code, error.value.detail) == (409, message) and db.commits == 1


# ----- Settling a lapsed hold before a write ----------------------------------------------------------------

def test_settling_releases_a_lapsed_slot_offer_under_the_bucket_of_the_city(db, monkeypatch):
    search = make_search(4, kind='avulso', user_id=GUEST, state='pareada', slot_id=5, offer_expires_at=NOW - HOUR)
    slot = MatchSlot(id=5, match_id=1, side='a', position='goleiro', state='oferecida', opened_at=NOW - HOUR)
    db.put(MatchSearch, search).on('match_searches', search).on('match_slots', slot).put(Match, make_match(id=1))
    offered = []
    monkeypatch.setattr(matchmaking.queue, 'offer_slots', lambda _db, match, *, now: offered.append(match.id) or [])
    assert matchmaking.settle(db, 4, NOW) is None                           # the search ended: no longer open
    assert (search.state, slot.state) == ('sem_resposta', 'aberta') and offered == [1]
    assert db.statements[0] == 'advisory'                                   # the bucket first, then slot and search


def test_settling_dissolves_a_lapsed_proposal_and_pairs_the_others_again(db, monkeypatch):
    search = make_search(10, state='pareada', match_id=1)
    other = make_search(11, team_id=2, state='ativa')
    match = make_match(proposal_expires_at=NOW - HOUR)
    db.put(MatchSearch, search).on('match_searches', search).on('matches', match)
    tried = []
    monkeypatch.setattr(matchmaking.queue, 'dissolve_proposal', lambda _db, held, *, outcome, now, **kw: [search, other])
    monkeypatch.setattr(matchmaking.queue, 'try_match', lambda _db, found, *, now: tried.append(found.id))
    matchmaking.settle(db, 10, NOW)
    assert tried == [11]                                                    # the settled search itself is skipped


def test_settling_expires_a_search_past_its_24_hours_and_keeps_an_open_one(db):
    expired = make_search(10, expires_at=NOW - HOUR)
    db.put(MatchSearch, expired).on('match_searches', expired)
    assert matchmaking.settle(db, 10, NOW) is None
    assert (expired.state, expired.ended_at) == ('expirada', NOW)
    assert [row.action for row in kinds(db, AuditLog)] == ['busca.expirada']
    open_search = make_search(12)
    db.put(MatchSearch, open_search).on('match_searches', open_search)
    assert matchmaking.settle(db, 12, NOW) is open_search
    assert matchmaking.settle(db, 404, NOW) is None


# ----- Answering a proposal -----------------------------------------------------------------------------------

@pytest.fixture
def answering(db, monkeypatch):
    state = SimpleNamespace(match=make_match(), access=MatchAccess('representante', 'a'), calls=[])
    monkeypatch.setattr(matchmaking, 'load_match_for', lambda _db, match_id, who, *, for_update=False: (
        state.match, {}, state.access))
    monkeypatch.setattr(matchmaking.queue, 'accept_proposal', lambda _db, match, side, who, *, now: state.calls.append(
        ('accept', side)))
    monkeypatch.setattr(matchmaking.queue, 'decline_proposal', lambda _db, match, side, who, *, now: state.calls.append(
        ('decline', side)))
    monkeypatch.setattr(matchmaking, 'proposals_out', lambda _db, who, rows, *, now: ['proposal'])
    return state


def test_the_representative_accepts_or_declines_for_the_side(db, answering):
    assert matchmaking.respond_to_proposal(db, user(), 1, 'aceitar', now=NOW) == 'proposal'
    assert matchmaking.respond_to_proposal(db, user(), 1, 'recusar', now=NOW) == 'proposal'
    assert answering.calls == [('accept', 'a'), ('decline', 'a')] and db.commits == 2


def test_a_member_cannot_answer_and_a_closed_proposal_answers_409(db, answering, monkeypatch):
    answering.access = MatchAccess('membro', 'a')
    with pytest.raises(HTTPException) as error:
        matchmaking.respond_to_proposal(db, user(MEMBER), 1, 'aceitar', now=NOW)
    assert (error.value.status_code, error.value.detail) == (403, matchmaking.ONLY_REP_ANSWER)
    answering.access = MatchAccess('representante', 'a')

    def closed(_db, match, side, who, *, now):
        raise TransitionError(matchmaking.PROPOSAL_CLOSED)

    monkeypatch.setattr(matchmaking.queue, 'accept_proposal', closed)
    with pytest.raises(HTTPException) as error:
        matchmaking.respond_to_proposal(db, user(), 1, 'aceitar', now=NOW)
    assert (error.value.status_code, error.value.detail) == (409, matchmaking.PROPOSAL_CLOSED) and db.commits == 0


def test_a_lapsed_proposal_is_ended_first_and_then_refused(db, answering, monkeypatch):
    answering.match = make_match(proposal_expires_at=NOW - HOUR)
    dissolved = []
    monkeypatch.setattr(matchmaking.queue, 'dissolve_proposal', lambda _db, match, *, outcome, now, **kw: (
        dissolved.append(outcome) or []))
    with pytest.raises(HTTPException) as error:
        matchmaking.respond_to_proposal(db, user(), 1, 'aceitar', now=NOW)
    assert error.value.status_code == 409 and dissolved == ['expirada'] and db.commits == 1 and answering.calls == []


# ----- Closing a team -----------------------------------------------------------------------------------------

def test_a_team_with_a_match_in_play_cannot_close(db):
    team = Team(id=1, name='Ferrugem FC', state='ativo')
    db.then('matches', 7)
    with pytest.raises(HTTPException) as error:
        matchmaking.team_ensure_no_active_match(db, team, now=NOW)
    assert (error.value.status_code, error.value.detail) == (409, matchmaking.TEAM_HAS_ACTIVE_MATCH)


def test_closing_applies_the_expiry_of_a_lapsed_proposal_and_refuses_a_held_search(db, monkeypatch):
    team = Team(id=1, name='Ferrugem FC', state='ativo')
    lapsed = make_match(proposal_expires_at=NOW - HOUR)
    held = make_search(10, state='pareada')
    db.then('matches', None, [1], lapsed, None)       # no blocking match; the lapsed one is found and locked; none left
    db.on('match_searches', [held])
    monkeypatch.setattr(matchmaking.queue, 'dissolve_proposal', lambda _db, match, *, outcome, now, **kw: [])
    with pytest.raises(HTTPException) as error:
        matchmaking.team_ensure_no_active_match(db, team, now=NOW)
    assert error.value.status_code == 409
    db.then('matches', None, [], None)
    db.on('match_searches', [make_search(10)])
    matchmaking.team_ensure_no_active_match(db, team, now=NOW)       # only a waiting search: it is cancelled later


def test_closing_a_team_cancels_its_waiting_searches(db):
    rows = [make_search(10), make_search(11, team_id=1)]
    db.on('match_searches', rows)
    ids = matchmaking.cancel_team_searches(db, Team(id=1, name='Ferrugem FC'), actor_id=REP, now=NOW)
    assert ids == [10, 11] and [row.state for row in rows] == ['cancelada', 'cancelada']
    assert [row.data['time_encerrado'] for row in kinds(db, AuditLog)] == [True, True]


# ----- The board and the lists --------------------------------------------------------------------------------

@pytest.fixture
def board(db, monkeypatch):
    state = SimpleNamespace(searches=[], proposals=[], offers=[], cards=[])
    monkeypatch.setattr(matchmaking, '_my_team_roles', lambda _db, who: {1: 'representante'})
    monkeypatch.setattr(matchmaking, '_open_search_rows', lambda _db, who, ids: ['row'])
    monkeypatch.setattr(matchmaking, 'searches_out', lambda _db, who, rows, *, now: state.searches)
    monkeypatch.setattr(matchmaking, 'my_proposals', lambda _db, who, *, now: state.proposals)
    monkeypatch.setattr(matchmaking, 'slot_offers', lambda _db, who, *, now: state.offers)
    monkeypatch.setattr(matchmaking, '_upcoming_matches', lambda _db, who: ['match'])
    monkeypatch.setattr(matchmaking, 'match_cards', lambda _db, who, rows, *, now: state.cards)
    monkeypatch.setattr(matchmaking, 'PlayBoardOut', lambda **kwargs: SimpleNamespace(**kwargs))
    return state


def test_the_board_lights_the_dot_for_what_waits_for_the_viewer(db, board):
    assert matchmaking.play_board(db, user(), now=NOW).attention is False
    board.searches = [SimpleNamespace(state='ativa'), SimpleNamespace(state='expirada')]
    out = matchmaking.play_board(db, user(), now=NOW)
    assert out.attention is True and [item.state for item in out.searches] == ['ativa']
    board.searches = []
    board.proposals = ['proposal']
    assert matchmaking.play_board(db, user(), now=NOW).attention is True
    board.proposals, board.offers = [], ['offer']
    assert matchmaking.play_board(db, user(), now=NOW).attention is True
    board.offers, board.cards = [], [SimpleNamespace(state='agendada')]
    assert matchmaking.play_board(db, user(), now=NOW).attention is False
    board.cards = [SimpleNamespace(state='combinando')]
    assert matchmaking.play_board(db, user(), now=NOW).attention is True


def test_the_lists_of_the_viewer(db, board, monkeypatch):
    board.searches = [SimpleNamespace(state='ativa'), SimpleNamespace(state='cancelada')]
    assert [item.state for item in matchmaking.my_searches(db, user(), now=NOW)] == ['ativa']
    board.cards = ['card']
    assert matchmaking.my_matches(db, user(), 'proximas', None, 20, now=NOW) == (['card'], None)
    monkeypatch.setattr(matchmaking, 'paginate', lambda statement, cursor, limit, stamp, key, _db: (['row'], 'next'))
    assert matchmaking.my_matches(db, user(), 'historico', None, 20, now=NOW) == (['card'], 'next')

"""The court catalog, suggestions and the administration's review over a simulated session (no database)."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.audit import AuditLog
from app.models.identity import City
from app.models.matches import Court, Match, MatchMessage, MatchSide
from app.models.notifications import Notification
from app.schemas.common import PersonOut
from app.schemas.matches import CourtDecisionInput, CourtSuggestionInput
from app.services import courts
from app.services.match_access import MatchAccess
from app.services.match_rules import RuleError, TransitionError, court_key
from tests.unit.fakes import FakeDb

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
DAY = timedelta(days=1)
REP_A, ADMIN = 11, 99
CITY = City(id=1, name='Brasília', state='DF')


def make_court(court_id=7, name='Arena Central', **values):
    base = dict(id=court_id, city_id=1, name=name, name_key=court_key(name), kind='society', state='publicada',
                address=None, suggested_by_id=REP_A, origin_match_id=1, created_at=NOW - DAY)
    return Court(**{**base, **values})


def make_match(**values):
    base = dict(id=1, sport='futebol', format='society', city_id=1, origin='amistoso', state='combinando',
                created_at=NOW - DAY, updated_at=NOW - DAY)
    return Match(**{**base, **values})


def person(user_id):
    return PersonOut(id=user_id, name=f'Atleta {user_id}', username=f'atleta{user_id}', avatar_url=None)


@pytest.fixture
def scene(monkeypatch):
    db = FakeDb()
    db.on('teams', [(1, 'Ferrugem FC'), (2, 'Tigres do Lago')])
    db.put(City, CITY)
    sides = {'a': MatchSide(id=1, match_id=1, side='a', team_id=1), 'b': MatchSide(id=2, match_id=1, side='b', team_id=2)}
    state = SimpleNamespace(db=db, match=make_match(), sides=sides, access=MatchAccess('representante', 'a'))
    monkeypatch.setattr(courts, 'load_match_for', lambda _db, match_id, user, *, for_update=False: (
        state.match, state.sides, state.access))
    monkeypatch.setattr(courts, 'people_out', lambda _db, viewer, ids: {i: person(i) for i in ids if i is not None})
    return state


def kinds(db, model):
    return [row for row in db.added if isinstance(row, model)]


def user(user_id=REP_A):
    return SimpleNamespace(id=user_id, is_admin=user_id == ADMIN)


# ----- Reading the catalog ------------------------------------------------------------------------------------

def test_the_catalog_lists_the_published_courts_of_the_city_and_marks_the_suggestions(scene):
    db = scene.db
    pending = make_court(8, 'Quadra do Parque', state='em_revisao')
    db.then('courts', [pending], [make_court(7)])
    result = courts.catalog(db, user(), city_id=1, kind='society', q='  Arena  ', match_id=1)
    assert [(item.id, item.provisional) for item in result.items] == [(8, True), (7, False)]
    assert result.items[0].city.name == 'Brasília'
    db.then('courts', [make_court(7)])
    assert [item.id for item in courts.catalog(db, user(), city_id=1, kind=None, q=None, match_id=None).items] == [7]
    assert courts.catalog(db, user(), city_id=999, kind=None, q=None, match_id=None).items == []


def test_possible_duplicates_come_from_the_same_city_and_kind(scene):
    suggestion = make_court(9, 'Arena Central Sul', state='em_revisao')
    scene.db.on('courts', [make_court(7)])
    assert [item.id for item in courts.court_duplicates(scene.db, suggestion)] == [7]


# ----- Courts usable in a terms proposal ----------------------------------------------------------------------

@pytest.mark.parametrize(('row', 'message'), [
    (None, 'Escolha uma quadra do catálogo da cidade ou a sugerida nesta partida.'),
    (make_court(city_id=2), 'Escolha uma quadra do catálogo da cidade ou a sugerida nesta partida.'),
    (make_court(state='rejeitada'), 'Escolha uma quadra do catálogo da cidade ou a sugerida nesta partida.'),
    (make_court(state='em_revisao', origin_match_id=2), 'Escolha uma quadra do catálogo da cidade ou a sugerida nesta partida.'),
    (make_court(kind='tenis'), 'Escolha uma quadra de society.')])
def test_terms_refuse_courts_that_do_not_fit_the_match(scene, row, message):
    scene.db.on('courts', row)
    with pytest.raises(RuleError) as error:
        courts.usable_for_terms(scene.db, scene.match, 7)
    assert (str(error.value), error.value.field) == (message, 'court_id')


def test_terms_accept_a_published_court_or_the_suggestion_of_this_very_match(scene):
    scene.db.on('courts', make_court())
    assert courts.usable_for_terms(scene.db, scene.match, 7).id == 7
    scene.db.on('courts', make_court(state='em_revisao', origin_match_id=1))
    assert courts.usable_for_terms(scene.db, scene.match, 7).state == 'em_revisao'


# ----- Suggesting ---------------------------------------------------------------------------------------------

def suggestion(**values):
    return CourtSuggestionInput(**{**dict(match_id=1, name='  Arena   Sul  ', address=' SGAS 910 '), **values})


def test_a_representative_suggests_a_court_that_waits_for_the_review(scene):
    db = scene.db
    db.then('courts', None).then('courts', 0)
    out, created = courts.suggest_court(db, user(), suggestion(), now=NOW)
    assert created is True and out.existing is False and out.court.provisional
    [court] = kinds(db, Court)
    assert (court.name, court.address, court.kind, court.state, court.origin_match_id, court.suggested_by_id) == (
        'Arena Sul', 'SGAS 910', 'society', 'em_revisao', 1, REP_A)
    [banner] = kinds(db, MatchMessage)
    assert banner.event_type == 'quadra_sugerida' and 'Ferrugem FC sugeriu a quadra Arena Sul' in banner.body
    assert [row.action for row in kinds(db, AuditLog)] == ['quadra.sugerida'] and db.commits == 1


def test_a_suggestion_that_already_exists_is_returned_not_duplicated(scene):
    scene.db.on('courts', make_court(8, 'Arena Sul', state='em_revisao'))
    out, created = courts.suggest_court(scene.db, user(), suggestion(), now=NOW)
    assert (created, out.existing, out.court.id) == (False, True, 8)
    assert scene.db.added == [] and scene.db.commits == 0


def test_suggesting_follows_the_rules_of_the_match(scene):
    db = scene.db
    scene.access = MatchAccess('membro', 'a')
    with pytest.raises(HTTPException) as error:
        courts.suggest_court(db, user(12), suggestion(), now=NOW)
    assert error.value.status_code == 403
    scene.access = MatchAccess('representante', 'a')
    scene.match = make_match(origin='campeonato')
    with pytest.raises(TransitionError) as error:
        courts.suggest_court(db, user(), suggestion(), now=NOW)
    assert str(error.value) == courts.CHAMPIONSHIP_TERMS
    scene.match = make_match(state='realizada')
    with pytest.raises(TransitionError):
        courts.suggest_court(db, user(), suggestion(), now=NOW)
    # Scheduled but already started: the court is no longer suggested (permissions.suggest_court says the same).
    scene.match = make_match(state='agendada', starts_at=NOW - timedelta(hours=1))
    with pytest.raises(TransitionError) as error:
        courts.suggest_court(db, user(), suggestion(), now=NOW)
    assert str(error.value) == courts.STARTED_SUGGESTION
    scene.match = make_match()
    with pytest.raises(RuleError) as error:
        courts.suggest_court(db, user(), suggestion(kind='tenis'), now=NOW)
    assert (str(error.value), error.value.field) == ('A quadra sugerida precisa ser de society.', 'kind')
    with pytest.raises(RuleError):
        courts.suggest_court(db, user(), suggestion(name='A'), now=NOW)
    db.then('courts', None).then('courts', courts.MAX_REVIEW_SUGGESTIONS)
    with pytest.raises(TransitionError) as error:
        courts.suggest_court(db, user(), suggestion(), now=NOW)
    assert 'já tem 3 sugestões' in str(error.value)
    assert db.added == [] and db.commits == 0


# ----- The administration's queue -----------------------------------------------------------------------------

def test_the_queue_lists_the_suggestions_with_their_context(scene):
    db = scene.db
    suggested = make_court(8, 'Arena Central Sul', state='em_revisao')
    db.then('courts', [suggested], [make_court(7)])
    db.on('cities', [CITY]).on('matches', [make_match()])
    items, cursor = courts.court_queue(db, user(ADMIN), 'em_revisao', None, 20, now=NOW)
    assert cursor is None and len(items) == 1
    item = items[0]
    assert (item.court.id, item.court.provisional, item.suggested_by.id) == (8, True, REP_A)
    assert [other.id for other in item.possible_duplicates] == [7]
    assert (item.origin_match.id, item.origin_match.state) == (1, 'combinando')


def test_the_decided_queue_shows_the_duplicate_the_court_was_rejected_for(scene):
    db = scene.db
    rejected = make_court(8, 'Arena Central', state='rejeitada', reviewed_at=NOW, duplicate_of_id=7,
                          review_reason='Duplicada')
    db.then('courts', [rejected]).then('courts', [make_court(7)])
    db.on('cities', [CITY]).on('matches', [])
    items, _ = courts.court_queue(db, user(ADMIN), 'decididas', None, 20, now=NOW)
    assert items[0].duplicate_of.id == 7 and items[0].possible_duplicates == [] and items[0].origin_match is None
    assert items[0].review_reason == 'Duplicada'


def test_the_pending_counter(scene):
    scene.db.on('courts', 4)
    assert courts.pending_count(scene.db) == 4
    scene.db.on('courts', None)
    assert courts.pending_count(scene.db) == 0


# ----- Deciding -----------------------------------------------------------------------------------------------

@pytest.fixture
def review(scene):
    scene.db.on('cities', [CITY]).on('matches', [make_match()]).on('courts', [])
    return scene


def decide(scene, court_id=8, **body):
    return courts.decide_court(scene.db, user(ADMIN), court_id, CourtDecisionInput(**body), now=NOW)


def test_publishing_corrects_the_name_and_tells_who_suggested(review):
    db = review.db
    row = make_court(8, 'arena sul', state='em_revisao')
    db.put(Court, row)
    db.then('courts', row, None)                      # the lock of the court, then the check for a published clash
    out = decide(review, decision='publicar', name='Arena Sul', address='SGAS 910')
    assert (row.state, row.name, row.address, row.published_at, row.reviewed_by_id) == (
        'publicada', 'Arena Sul', 'SGAS 910', NOW, ADMIN)
    assert out.court.id == 8 and db.commits == 1
    [notice] = kinds(db, Notification)
    assert (notice.type, notice.user_id, notice.payload['decision']) == ('quadra_decidida', REP_A, 'publicada')
    assert [m.event_type for m in kinds(db, MatchMessage)] == ['quadra_sugerida']
    assert [a.action for a in kinds(db, AuditLog)] == ['quadra.publicada']


def test_a_name_that_clashes_with_a_published_court_is_refused(review):
    row = make_court(8, 'Arena Sul', state='em_revisao')
    review.db.put(Court, row)
    review.db.then('courts', row, 77)
    with pytest.raises(HTTPException) as error:
        decide(review, decision='publicar')
    assert (error.value.status_code, error.value.detail) == (409, courts.DUPLICATE_PUBLISHED)


def test_rejecting_without_a_duplicate_cancels_the_pending_terms_and_needs_a_reason(review):
    db = review.db
    row = make_court(8, 'Arena Sul', state='em_revisao')
    db.put(Court, row)
    db.then('courts', row, row)
    db.on('match_terms', [5])                           # ids of the pending terms that used the court
    with pytest.raises(RuleError) as error:
        decide(review, decision='rejeitar')
    assert (str(error.value), error.value.field) == ('Descreva o motivo da recusa.', 'reason')
    decide(review, decision='rejeitar', reason='Endereço não confere.')
    assert (row.state, row.review_reason, row.published_at, row.duplicate_of_id) == (
        'rejeitada', 'Endereço não confere.', None, None)
    assert any(statement == 'update' for statement in db.statements)           # the pending terms were cancelled
    [notice] = kinds(db, Notification)
    assert notice.payload['decision'] == 'rejeitada' and notice.payload['reason'] == 'Endereço não confere.'
    assert 'As condições que a usavam foram canceladas' in kinds(db, MatchMessage)[0].body


def test_rejecting_as_a_duplicate_moves_the_match_to_the_published_court(review):
    db = review.db
    row = make_court(8, 'Arena Sul', state='em_revisao')
    original = make_court(7, 'Arena Sul Society')
    db.put(Court, row)
    db.then('courts', row, original)                   # the lock, then the published court it duplicates
    decide(review, decision='rejeitar', duplicate_of_id=7)
    assert (row.state, row.duplicate_of_id) == ('rejeitada', 7)
    assert sum(1 for statement in db.statements if statement == 'update') == 2      # terms and matches follow
    [notice] = kinds(db, Notification)
    assert notice.payload['duplicate_of_id'] == 7
    assert 'já existe no catálogo como Arena Sul Society' in kinds(db, MatchMessage)[0].body


def test_a_duplicate_must_be_a_published_court_of_the_same_city_and_kind(review):
    db = review.db
    row = make_court(8, 'Arena Sul', state='em_revisao')
    db.put(Court, row)
    db.then('courts', row, None)
    with pytest.raises(RuleError) as error:
        decide(review, decision='rejeitar', duplicate_of_id=7)
    assert error.value.field == 'duplicate_of_id'
    db.then('courts', row)
    with pytest.raises(RuleError) as error:
        decide(review, decision='publicar', duplicate_of_id=7)
    assert str(error.value) == 'Só se indica a quadra duplicada ao rejeitar.'


def test_deciding_needs_an_existing_suggestion_still_under_review(review):
    with pytest.raises(HTTPException) as error:
        decide(review, court_id=404, decision='publicar')
    assert (error.value.status_code, error.value.detail) == (404, 'Sugestão não encontrada.')
    done = make_court(8, state='publicada')
    review.db.put(Court, done)
    review.db.then('courts', done)
    with pytest.raises(HTTPException) as error:
        decide(review, decision='rejeitar', reason='Motivo qualquer')
    assert (error.value.status_code, error.value.detail) == (409, 'Esta sugestão já foi decidida.')
    assert review.db.commits == 0


def test_a_short_reason_is_refused_when_publishing(review):
    row = make_court(8, 'Arena Sul', state='em_revisao')
    review.db.put(Court, row)
    review.db.then('courts', row)
    with pytest.raises(RuleError) as error:
        decide(review, decision='publicar', reason='ok')
    assert 'pelo menos 5 caracteres' in str(error.value)

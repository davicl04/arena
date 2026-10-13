"""Walk-in offers, "Quero jogar", the representative's slots and guest removal over a simulated session."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.models.audit import AuditLog
from app.models.matches import Match, MatchLineup, MatchMessage, MatchSearch, MatchSide, MatchSlot
from app.models.notifications import Notification
from app.services import slots
from app.services.match_access import MatchAccess
from app.services.match_rules import RuleError, TransitionError
from tests.unit.fakes import FakeDb

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
HOUR = timedelta(hours=1)
DAY = timedelta(days=1)
REP_A, GUEST, OTHER = 11, 33, 44


def make_match(**values):
    base = dict(id=1, sport='futebol', format='society', city_id=1, origin='amistoso', state='agendada',
                starts_at=NOW + 2 * DAY, created_at=NOW - DAY, updated_at=NOW - DAY)
    return Match(**{**base, **values})


def make_slot(slot_id, position='atacante', state='aberta', hours=0, **values):
    return MatchSlot(id=slot_id, match_id=1, side='a', position=position, state=state, opened_at=NOW - hours * HOUR,
                     **values)


def make_search(search_id, user_id=GUEST, **values):
    base = dict(id=search_id, kind='avulso', sport='futebol', city_id=1, user_id=user_id, state='pareada', slot_id=None,
                started_at=NOW - HOUR, expires_at=NOW + 20 * HOUR)
    return MatchSearch(**{**base, **values})


def sides():
    return {'a': MatchSide(id=1, match_id=1, side='a', team_id=1, declared_slots={'atacante': 1}),
            'b': MatchSide(id=2, match_id=1, side='b', team_id=2, declared_slots={})}


def user(user_id=GUEST):
    return SimpleNamespace(id=user_id, name=f'Atleta {user_id}')


def kinds(db, model):
    return [row for row in db.added if isinstance(row, model)]


@pytest.fixture
def scene(monkeypatch):
    db = FakeDb()
    db.on('teams', [(1, 'Ferrugem FC'), (2, 'Tigres do Lago')]).on('users', 'Fabio Gomes')
    db.on('team_members', [(1, REP_A), (2, 22)])
    state = SimpleNamespace(db=db, match=make_match(), sides=sides(), access=MatchAccess('representante', 'a'),
                            offered=[], tried=[], locked=[])
    monkeypatch.setattr(slots, 'load_match_for', lambda _db, match_id, who, *, for_update=False: (
        state.match, state.sides, state.access))
    monkeypatch.setattr(slots, 'match_detail', lambda *args, **kwargs: 'detail')
    monkeypatch.setattr(slots, 'utcnow', lambda: NOW)
    monkeypatch.setattr(slots.queue, 'lock_bucket', lambda _db, key: state.locked.append(key))
    monkeypatch.setattr(slots.queue, 'offer_slots', lambda _db, match, *, now: state.offered.append(match.id) or [1])
    monkeypatch.setattr(slots.queue, 'try_match', lambda _db, search, *, now: state.tried.append(search.id))
    return state


# ----- Offers of the walk-in ----------------------------------------------------------------------------------

def test_the_offers_of_the_walkin_come_with_the_match_card(scene, monkeypatch):
    db = scene.db
    search = make_search(5, slot_id=9, offer_expires_at=NOW + HOUR)
    slot = make_slot(9, 'goleiro', 'oferecida')
    db.on('match_searches', [(search, slot, scene.match)])
    monkeypatch.setattr(slots, 'match_cards', lambda _db, viewer, rows, *, now: [f'card-{row.id}' for row in rows])
    monkeypatch.setattr(slots, 'SlotOfferOut', lambda **kwargs: SimpleNamespace(**kwargs))
    [offer] = slots.slot_offers(db, user(), now=NOW)
    assert (offer.slot_id, offer.search_id, offer.position, offer.side, offer.expires_at, offer.match) == (
        9, 5, 'goleiro', 'a', NOW + HOUR, 'card-1')
    db.on('match_searches', [])
    assert slots.slot_offers(db, user(), now=NOW) == []


def test_accepting_a_slot_returns_the_match_as_the_guest_sees_it(scene, monkeypatch):
    db = scene.db
    db.put(Match, scene.match)
    monkeypatch.setattr(slots.queue, 'accept_offer', lambda _db, slot_id, who, *, now: MatchLineup(match_id=1))
    assert slots.accept_slot(db, user(), 9) == 'detail' and db.commits == 1


def test_accepting_a_slot_answers_the_errors_of_the_route(scene, monkeypatch):
    db = scene.db

    def fail(error):
        def accept(_db, slot_id, who, *, now):
            raise error
        monkeypatch.setattr(slots.queue, 'accept_offer', accept)

    monkeypatch.setattr(slots.queue, 'accept_offer', lambda _db, slot_id, who, *, now: None)
    with pytest.raises(HTTPException) as error:
        slots.accept_slot(db, user(), 9)
    assert (error.value.status_code, error.value.detail) == (404, slots.OFFER_NOT_FOUND)
    fail(TransitionError('Esta vaga não está mais reservada para você.'))
    with pytest.raises(HTTPException) as error:
        slots.accept_slot(db, user(), 9)
    assert (error.value.status_code, db.rollbacks) == (409, 1)
    fail(IntegrityError('insert', {}, Exception('uq_match_lineups_user')))
    with pytest.raises(HTTPException) as error:
        slots.accept_slot(db, user(), 9)
    assert (error.value.status_code, error.value.detail, db.rollbacks) == (409, slots.ALREADY_IN_MATCH, 2)
    assert db.commits == 0


def test_declining_takes_the_match_then_the_bucket_and_offers_the_slot_again(scene, monkeypatch):
    db = scene.db
    db.on('match_slots', [(1, 1)]).on('matches', scene.match)
    seen = []
    monkeypatch.setattr(slots.queue, 'decline_offer', lambda _db, slot_id, who, *, now: seen.append(
        ('declined', tuple(scene.locked))) or True)
    slots.decline_slot(db, user(), 9)
    # The bucket of the walk-ins of the city is taken after the match lock, before the slot.
    assert seen == [('declined', ('futebol:avulso:1',))] and db.commits == 1
    assert db.statements[:2] == ['match_slots', 'matches']


def test_declining_answers_404_without_an_offer_and_409_when_it_lost_the_race(scene, monkeypatch):
    db = scene.db
    db.on('match_slots', None)
    with pytest.raises(HTTPException) as error:
        slots.decline_slot(db, user(), 9)
    assert error.value.status_code == 404
    db.on('match_slots', [(1, 1)]).on('matches', scene.match)
    monkeypatch.setattr(slots.queue, 'decline_offer', lambda _db, slot_id, who, *, now: False)
    with pytest.raises(HTTPException) as error:
        slots.decline_slot(db, user(), 9)
    assert (error.value.status_code, db.rollbacks) == (404, 1)

    def lost(_db, slot_id, who, *, now):
        raise TransitionError('Esta vaga não está mais reservada para você.')

    monkeypatch.setattr(slots.queue, 'decline_offer', lost)
    with pytest.raises(HTTPException) as error:
        slots.decline_slot(db, user(), 9)
    assert (error.value.status_code, db.rollbacks) == (409, 2) and db.commits == 0


# ----- Slots declared by the team -----------------------------------------------------------------------------

def adjust(scene, wanted, **kwargs):
    return slots.set_open_slots(scene.db, scene.match, 'a', wanted, now=NOW, actor_id=REP_A, **kwargs)


def test_while_arranging_the_declaration_is_only_stored(scene):
    db = scene.db
    scene.match = make_match(state='combinando', starts_at=None)
    db.on('match_sides', scene.sides['a']).on('match_slots', [])
    change = adjust(scene, {'atacante': 2, 'goleiro': 1})
    assert change.changed and change.after == {'goleiro': 1, 'defesa': 0, 'meio_campo': 0, 'atacante': 2}
    assert change.before['atacante'] == 1 and change.opened == 0
    assert scene.sides['a'].declared_slots == change.after
    assert db.of(MatchSlot) == [] and scene.offered == []
    assert [m.event_type for m in kinds(db, MatchMessage)] == ['vagas_atualizadas']
    assert [a.action for a in kinds(db, AuditLog)] == ['vagas.atualizadas']


def test_nothing_changes_when_the_slots_are_already_as_asked(scene):
    db = scene.db
    db.on('match_sides', scene.sides['a']).on('match_slots', [make_slot(1, 'atacante')])
    change = adjust(scene, {'atacante': 1})
    assert change.changed is False and db.added == [] and scene.offered == []


def test_increasing_opens_slots_and_offers_them_to_the_walkins_waiting(scene):
    db = scene.db
    db.on('match_sides', scene.sides['a']).on('match_slots', [make_slot(1, 'atacante')])
    change = adjust(scene, {'atacante': 3})
    assert change.opened == 2 and change.closed == () and change.offered == 1
    assert [(slot.position, slot.state) for slot in db.of(MatchSlot)] == [('atacante', 'aberta')] * 2
    assert scene.offered == [1]
    assert 'Atacante (3)' in kinds(db, MatchMessage)[0].body


def test_reducing_closes_the_open_slots_first_and_returns_the_offered_walkin_to_the_queue(scene):
    db = scene.db
    open_slot, offered = make_slot(1, 'atacante', hours=2), make_slot(2, 'atacante', 'oferecida', hours=1)
    waiting = make_search(5, slot_id=2, offer_expires_at=NOW + HOUR)
    db.on('match_sides', scene.sides['a']).on('match_slots', [open_slot, offered]).on('match_searches', [waiting])
    db.then('teams', 'Ferrugem FC')                                                   # for the withdrawn offer
    change = adjust(scene, {})
    assert change.closed == (1, 2)                              # the open one first, the offered one last
    assert (open_slot.state, offered.state) == ('fechada', 'fechada')
    assert open_slot.closed_at == NOW and offered.closed_at == NOW
    # The walk-in goes back to the queue, is told, and looks at the slots of other matches too.
    assert (waiting.state, waiting.slot_id) == ('ativa', None) and change.returned == (5,)
    assert scene.tried == [5]
    [notice] = kinds(db, Notification)
    assert (notice.type, notice.user_id, notice.actor_id) == ('oferta_retirada', GUEST, REP_A)
    assert notice.payload['reason'] == 'vagas_reduzidas' and notice.payload['requeued'] is True
    assert (notice.payload['team_name'], notice.payload['position'], notice.payload['slot_id']) == (
        'Ferrugem FC', 'atacante', 2)
    assert [a.action for a in kinds(db, AuditLog)] == ['vaga.oferta_devolvida', 'vagas.atualizadas']


def test_the_limits_count_the_walkins_already_in(scene):
    db = scene.db
    filled = make_slot(3, 'goleiro', 'preenchida', filled_by_id=OTHER)
    db.on('match_sides', scene.sides['a']).on('match_slots', [filled])
    with pytest.raises(RuleError) as error:
        adjust(scene, {'goleiro': 1})
    assert (str(error.value), error.value.field) == ('No máximo uma vaga de goleiro.', 'open_slots')
    with pytest.raises(RuleError):
        adjust(scene, {'atacante': 6})
    assert db.added == []


def test_the_representative_adjusts_after_taking_the_match_and_the_bucket(scene, monkeypatch):
    db = scene.db
    db.on('match_sides', scene.sides['a']).on('match_slots', [make_slot(1)])
    out = slots.update_slots(db, user(REP_A), 1, {'atacante': 2})
    assert out == 'detail' and db.commits == 1
    assert scene.locked == ['futebol:avulso:1']
    assert scene.offered == [1]


def test_the_adjustment_is_refused_before_any_lock_to_who_cannot_make_it(scene):
    scene.access = MatchAccess('membro', 'a')
    with pytest.raises(HTTPException) as error:
        slots.update_slots(scene.db, user(12), 1, {'atacante': 2})
    assert (error.value.status_code, error.value.detail) == (403, slots.SLOTS_ONLY_REPRESENTATIVES)
    assert scene.locked == [] and scene.db.commits == 0


# ----- Removing a guest ---------------------------------------------------------------------------------------

def filled_slot():
    return make_slot(4, 'defesa', 'preenchida', filled_by_id=GUEST, filled_at=NOW - HOUR)


def test_the_representative_removes_a_guest_before_the_start(scene):
    db = scene.db
    slot = filled_slot()
    db.on('match_slots', slot).on('match_sides', [scene.sides['a'], scene.sides['b']])
    db.on('users', 'Fabio Gomes')
    removed = slots.remove_guest(db, scene.match, GUEST, now=NOW, actor_id=REP_A, side='a')
    assert removed is slot and (slot.state, slot.removed_by_id, slot.closed_at) == ('fechada', REP_A, NOW)
    [notice] = kinds(db, Notification)
    assert (notice.type, notice.user_id, notice.payload['team_name']) == ('removido_da_partida', GUEST, 'Ferrugem FC')
    assert [m.event_type for m in kinds(db, MatchMessage)] == ['avulso_removido']
    assert [a.action for a in kinds(db, AuditLog)] == ['avulso.removido']
    assert 'update' in db.statements                                  # the lineup row gets `removed_at`


def test_removing_a_guest_follows_the_rules(scene):
    db = scene.db
    db.on('match_slots', None)
    with pytest.raises(HTTPException) as error:
        slots.remove_guest(db, scene.match, GUEST, now=NOW, actor_id=REP_A)
    assert (error.value.status_code, error.value.detail) == (404, slots.GUEST_NOT_FOUND)
    db.on('match_slots', filled_slot())
    with pytest.raises(HTTPException) as error:
        slots.remove_guest(db, scene.match, GUEST, now=NOW, actor_id=22, side='b')
    assert error.value.status_code == 403
    scene.match = make_match(starts_at=NOW - HOUR)
    with pytest.raises(HTTPException) as error:
        slots.remove_guest(db, scene.match, GUEST, now=NOW, actor_id=REP_A, side='a')
    assert (error.value.status_code, error.value.detail) == (409, slots.GUEST_STARTED)
    assert db.added == []


def test_the_route_entry_removes_only_for_a_representative_of_the_guest_side(scene):
    db = scene.db
    db.on('match_slots', filled_slot()).on('match_sides', [scene.sides['a'], scene.sides['b']])
    slots.delete_guest(db, user(REP_A), 1, GUEST)
    assert db.commits == 1
    scene.access = MatchAccess('membro', 'a')
    with pytest.raises(HTTPException) as error:
        slots.delete_guest(db, user(12), 1, GUEST)
    assert (error.value.status_code, error.value.detail) == (403, slots.GUEST_ONLY_REPRESENTATIVES)

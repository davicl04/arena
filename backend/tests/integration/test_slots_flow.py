"""Walk-ins and slots through the API on PostgreSQL: offer, "Quero jogar", decline, tiers, declared slots, removal.

Accounts come from the API (Bearer); teams, matches, slots and searches are rows or queue calls with the real
clock, because the routes read it. Contract: docs/decisoes/0002-jogar.md, section 11.2.
"""
import uuid
from datetime import timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.models.identity import User, utcnow
from app.models.matches import Match, MatchLineup, MatchMessage, MatchSearch, MatchSide, MatchSlot
from app.models.rankings import Standing
from app.services.match_access import match_access
from app.services.match_lifecycle import open_declared_slots
from app.services.match_rules import TransitionError, result_deadline
from app.services.matchmaking_queue import queue
from tests.integration.match_helpers import (
    CITY,
    add,
    audit_actions,
    make_standing,
    make_team,
    notifications_of,
    scheduled_match,
    walkin_search,
)
from tests.integration.team_helpers import register

HOUR = timedelta(hours=1)
DAY = timedelta(days=1)
ACCEPTED = 'Esta vaga não está mais reservada para você.'


def actors(http, db, *names):
    result = {}
    for name in names:
        headers, user_id = register(http, f'{name}-{uuid.uuid4().hex[:8]}@example.com', name=f'Atleta {name}')
        result[name] = SimpleNamespace(headers=headers, user=db.get(User, user_id))
    return result


@pytest.fixture
def world(client):
    """Ferrugem FC (representative + member), Tigres do Lago (representative), walk-ins and an administrator."""
    http, db = client
    people = actors(http, db, 'rep_a', 'member_a', 'rep_b', 'guest', 'other', 'stranger', 'admin')
    people['admin'].user.is_admin = True
    team_a = make_team(db, people['rep_a'].user, people['member_a'].user, name='Ferrugem FC')
    team_b = make_team(db, people['rep_b'].user, name='Tigres do Lago')
    db.commit()
    return SimpleNamespace(http=http, db=db, people=people, team_a=team_a, team_b=team_b)


def new_match(world, *, slots_a=None, slots_b=None, **values):
    """A scheduled friendly two days from now with the declared slots open."""
    now = utcnow()
    values.setdefault('starts_at', now + 2 * DAY)
    match = scheduled_match(world.db, world.team_a, world.team_b, slots_a=slots_a, slots_b=slots_b, now=now, **values)
    world.db.commit()
    return match


def wait(db, user, *, position='atacante', at=None):
    """The walk-in starts looking for a slot (the search itself is the pairing front's route)."""
    at = at or utcnow()
    pairing = queue.enqueue(db, walkin_search(user, position=position, started_at=at), now=at)
    db.commit()
    return pairing


def slots_of(db, match, *states):
    statement = select(MatchSlot).where(MatchSlot.match_id == match.id).order_by(MatchSlot.id)
    if states:
        statement = statement.where(MatchSlot.state.in_(states))
    return db.scalars(statement).all()


def offers(world, who):
    response = world.http.get('/api/v1/me/slot-offers', headers=world.people[who].headers)
    assert response.status_code == 200, response.text
    return response.json()['items']


def accept(world, who, slot_id):
    return world.http.put(f'/api/v1/match-slots/{slot_id}/accept', json={}, headers=world.people[who].headers)


def decline(world, who, slot_id):
    return world.http.put(f'/api/v1/match-slots/{slot_id}/decline', json={}, headers=world.people[who].headers)


def set_slots(world, who, match, open_slots):
    return world.http.put(f'/api/v1/matches/{match.id}/slots', json={'open_slots': open_slots},
                          headers=world.people[who].headers)


def remove(world, who, match, guest):
    return world.http.delete(f'/api/v1/matches/{match.id}/guests/{guest.user.id}', headers=world.people[who].headers)


def search_of(db, user):
    return db.scalar(select(MatchSearch).where(MatchSearch.user_id == user.id).order_by(MatchSearch.id.desc()))


# ----- Offer, "Quero jogar" and the chat --------------------------------------------------------------------

def test_offer_accept_puts_the_walkin_in_the_lineup_and_opens_the_chat(world):
    db, guest = world.db, world.people['guest'].user
    match = new_match(world, slots_a={'atacante': 1})
    assert wait(db, guest).kind == 'oferta'

    listed = offers(world, 'guest')
    assert len(listed) == 1
    offer = listed[0]
    slot = slots_of(db, match)[0]
    assert (offer['slot_id'], offer['position'], offer['side']) == (slot.id, 'atacante', 'a')
    assert offer['search_id'] == search_of(db, guest).id
    card = offer['match']
    # The walk-in sees the card of the match as 'avulso' on the side that opened the slot, with nothing to answer there.
    assert (card['id'], card['state'], card['my_role'], card['my_side'], card['needs_my_action']) == (
        match.id, 'agendada', 'avulso', 'a', False)
    assert [side['team']['name'] for side in card['sides']] == ['Ferrugem FC', 'Tigres do Lago']
    expires = search_of(db, guest).offer_expires_at
    assert 0 < (expires - utcnow()).total_seconds() <= 2 * 3600
    # Others have no offers; the offer alone gives no access to the match.
    assert offers(world, 'stranger') == [] and offers(world, 'rep_a') == []
    assert match_access(db, match, guest) is None

    response = accept(world, 'guest', slot.id)
    assert response.status_code == 200, response.text
    detail = response.json()
    assert (detail['id'], detail['my_role'], detail['my_side']) == (match.id, 'avulso', 'a')
    assert detail['permissions']['read_chat'] and detail['permissions']['write_chat']
    assert not detail['permissions']['manage_slots'] and not detail['permissions']['cancel']
    assert [(item['id'], item['state'], item['guest']['id']) for item in detail['slots']] == [
        (slot.id, 'preenchida', guest.id)]

    db.refresh(slot)
    assert (slot.state, slot.filled_by_id) == ('preenchida', guest.id) and slot.filled_at is not None
    search = search_of(db, guest)
    assert (search.state, search.match_id) == ('concluida', match.id) and search.ended_at is not None
    lineup = db.scalar(select(MatchLineup).where(MatchLineup.match_id == match.id, MatchLineup.user_id == guest.id))
    assert (lineup.guest, lineup.side, lineup.team_id, lineup.position, lineup.slot_id, lineup.present) == (
        True, 'a', world.team_a.id, 'atacante', slot.id, None)
    # Guest of this match only: no membership in the team.
    assert db.scalar(select(MatchSide.id).where(MatchSide.match_id == match.id, MatchSide.user_id == guest.id)) is None
    access = match_access(db, match, guest)
    assert (access.role, access.side) == ('avulso', 'a')
    assert offers(world, 'guest') == []

    banner = db.scalars(select(MatchMessage).where(MatchMessage.match_id == match.id,
                                                   MatchMessage.event_type == 'avulso_entrou')).all()
    assert len(banner) == 1 and banner[0].side == 'a' and 'Atleta guest' in banner[0].body
    assert banner[0].payload == {'user_id': guest.id, 'slot_id': slot.id, 'position': 'atacante'}
    # The representative of the side is told; the member and the other side are not.
    filled = notifications_of(db, 'vaga_preenchida')
    assert [(item.user_id, item.actor_id) for item in filled] == [(world.people['rep_a'].user.id, guest.id)]
    assert filled[0].payload == {'match_id': match.id, 'slot_id': slot.id, 'position': 'atacante'}
    assert [(row.actor_id, row.data['position']) for row in audit_actions(db, 'vaga.preenchida')] == [
        (guest.id, 'atacante')]


def test_accepting_twice_or_an_offer_that_is_not_mine_changes_nothing(world):
    db = world.db
    match = new_match(world, slots_a={'atacante': 1})
    wait(db, world.people['guest'].user)
    slot = slots_of(db, match)[0]
    for who in ('stranger', 'other', 'rep_a', 'rep_b'):
        for answer in (accept, decline):
            response = answer(world, who, slot.id)
            assert response.status_code == 404 and response.json() == {'detail': 'Oferta de vaga não encontrada.'}
    assert answer(world, 'guest', 999999).status_code == 404
    db.refresh(slot)
    assert slot.state == 'oferecida' and slot.filled_by_id is None

    assert accept(world, 'guest', slot.id).status_code == 200
    again = accept(world, 'guest', slot.id)
    assert again.status_code == 404 and again.json() == {'detail': 'Oferta de vaga não encontrada.'}
    assert decline(world, 'guest', slot.id).status_code == 404
    assert len(notifications_of(db, 'vaga_preenchida')) == 1
    assert len(slots_of(db, match, 'preenchida')) == 1


def test_the_routes_need_a_session_and_json(world):
    http = world.http
    assert http.get('/api/v1/me/slot-offers').status_code == 401
    assert http.put('/api/v1/match-slots/1/accept', json={}).status_code == 401
    assert http.put('/api/v1/match-slots/1/decline', json={}).status_code == 401
    assert http.put('/api/v1/matches/1/slots', json={'open_slots': {}}).status_code == 401
    assert http.delete('/api/v1/matches/1/guests/2').status_code == 401
    headers = world.people['guest'].headers
    assert http.put('/api/v1/match-slots/1/accept', headers=headers).status_code == 415
    assert http.put('/api/v1/match-slots/1/accept', json={'user_id': 1}, headers=headers).status_code == 422


def test_accepting_a_slot_of_a_match_the_walkin_already_plays_is_refused(world):
    db, guest = world.db, world.people['guest'].user
    match = new_match(world, slots_a={'atacante': 1})
    wait(db, guest)
    slot = slots_of(db, match)[0]
    # Becomes part of the lineup after the offer (for example, invited to the team meanwhile).
    add(db, MatchLineup(match_id=match.id, side='b', user_id=guest.id, team_id=world.team_b.id, guest=False,
                        created_at=utcnow(), updated_at=utcnow()))
    db.commit()
    response = accept(world, 'guest', slot.id)
    assert response.status_code == 409 and response.json() == {'detail': 'Você já está nesta partida.'}
    db.refresh(slot)
    assert slot.state == 'oferecida' and search_of(db, guest).state == 'pareada'


def test_a_match_that_no_longer_takes_walkins_refuses_the_offer(world):
    db, guest = world.db, world.people['guest'].user
    match = new_match(world, slots_a={'atacante': 1})
    wait(db, guest)
    slot = slots_of(db, match)[0]
    match.state, match.cancelled_at, match.closed_at = 'cancelada', utcnow(), utcnow()
    db.commit()
    assert offers(world, 'guest') == []
    response = accept(world, 'guest', slot.id)
    assert response.status_code == 409 and response.json() == {'detail': 'Esta partida não recebe mais avulsos.'}
    assert len(slots_of(db, match, 'preenchida')) == 0


def test_a_decline_that_loses_a_race_changes_nothing(world, monkeypatch):
    db, guest = world.db, world.people['guest'].user
    match = new_match(world, slots_a={'atacante': 1})
    wait(db, guest)
    slot = slots_of(db, match)[0]

    def taken(*args, **kwargs):
        raise TransitionError(ACCEPTED)

    monkeypatch.setattr(queue, 'decline_offer', taken)
    response = decline(world, 'guest', slot.id)
    assert response.status_code == 409 and response.json() == {'detail': ACCEPTED}
    monkeypatch.setattr(queue, 'decline_offer', lambda *args, **kwargs: False)
    assert decline(world, 'guest', slot.id).status_code == 404
    db.refresh(slot)
    assert slot.state == 'oferecida' and search_of(db, guest).state == 'pareada'


# ----- Decline, expiry and the next walk-in -----------------------------------------------------------------

def test_declining_ends_the_search_and_offers_the_slot_to_the_next_walkin(world):
    db = world.db
    first, second = world.people['guest'].user, world.people['other'].user
    match = new_match(world, slots_a={'atacante': 1})
    start = utcnow()
    assert wait(db, first, at=start - 2 * HOUR).kind == 'oferta'
    assert wait(db, second, at=start - HOUR) is None
    slot = slots_of(db, match)[0]
    assert search_of(db, second).state == 'ativa' and offers(world, 'other') == []

    response = decline(world, 'guest', slot.id)
    assert response.status_code == 204 and response.content == b''
    refused, next_search = search_of(db, first), search_of(db, second)
    assert refused.state == 'recusada' and refused.ended_at is not None
    # The slot stays reserved, now for the next one in the queue.
    db.refresh(slot)
    assert (slot.state, next_search.state, next_search.slot_id) == ('oferecida', 'pareada', slot.id)
    assert offers(world, 'guest') == []
    assert [item['slot_id'] for item in offers(world, 'other')] == [slot.id]
    assert [item.user_id for item in notifications_of(db, 'vaga_encontrada')] == [first.id, second.id]
    assert [(row.actor_id, row.data['search_id']) for row in audit_actions(db, 'vaga.oferta_recusada')] == [
        (first.id, refused.id)]
    assert decline(world, 'guest', slot.id).status_code == 404

    assert accept(world, 'other', slot.id).status_code == 200
    assert [item.filled_by_id for item in slots_of(db, match, 'preenchida')] == [second.id]


def test_declining_without_anyone_waiting_reopens_the_slot(world):
    db = world.db
    match = new_match(world, slots_a={'goleiro': 1})
    wait(db, world.people['guest'].user, position='goleiro')
    slot = slots_of(db, match)[0]
    assert decline(world, 'guest', slot.id).status_code == 204
    db.refresh(slot)
    assert slot.state == 'aberta'
    # A walk-in that arrives later takes it.
    assert wait(db, world.people['other'].user, position='goleiro').slot.id == slot.id


def test_a_lapsed_offer_is_not_listed_cannot_be_accepted_and_passes_to_the_next_walkin(world):
    db = world.db
    first, second = world.people['guest'].user, world.people['other'].user
    match = new_match(world, slots_a={'atacante': 1})
    long_ago = utcnow() - 3 * HOUR
    assert wait(db, first, at=long_ago).kind == 'oferta'
    assert wait(db, second, at=long_ago + HOUR) is None
    slot = slots_of(db, match)[0]
    assert search_of(db, first).offer_expires_at < utcnow()

    assert offers(world, 'guest') == []
    response = accept(world, 'guest', slot.id)
    assert response.status_code == 409 and response.json() == {'detail': 'O prazo para aceitar esta vaga acabou.'}
    assert len(slots_of(db, match, 'preenchida')) == 0

    # The sweep releases it and the slot goes to the next one.
    assert queue.expire_offers(db, utcnow()) == 1
    db.commit()
    assert search_of(db, first).state == 'sem_resposta'
    assert [item['slot_id'] for item in offers(world, 'other')] == [slot.id]
    assert accept(world, 'other', slot.id).status_code == 200


def test_the_offer_never_outlasts_the_start_of_the_match(world):
    db, guest = world.db, world.people['guest'].user
    start = utcnow() + 30 * timedelta(minutes=1)
    match = new_match(world, slots_a={'atacante': 1}, starts_at=start)
    wait(db, guest)
    assert search_of(db, guest).offer_expires_at == start
    assert len(offers(world, 'guest')) == 1
    assert slots_of(db, match)[0].state == 'oferecida'


# ----- Tiers of the slot (position and format) ------------------------------------------------------------------

@pytest.mark.parametrize(('standing', 'offered'), [
    (None, True),                                       # no matches: in placement, faces any level
    (('atacante', 'society', 'ouro'), False),           # Ouro in the position and format of the slot vs a Bronze team
    (('atacante', 'society', 'diamante'), False),
    (('atacante', 'society', 'prata'), True),           # a neighbour of Bronze
    (('atacante', 'society', 'bronze'), True),
    (('goleiro', 'society', 'ouro'), True),             # Ouro as a goalkeeper says nothing about being a forward
    (('atacante', 'futsal', 'ouro'), True),             # nor does Ouro in futsal about society
    (('atacante', 'society', None), True),              # still being classified (2 matches): any level
])
def test_the_tier_compared_is_the_one_of_the_position_and_format_of_the_slot(world, standing, offered):
    db, guest = world.db, world.people['guest'].user
    new_match(world, slots_a={'atacante': 1}, tier_a='bronze')
    if standing is not None:
        position, format_, tier = standing
        if tier is None:
            add(db, Standing(user_id=guest.id, sport='futebol', format=format_, position=position, metric_value=0,
                             matches_played=2, calc_version=1))
        else:
            make_standing(db, tier=tier, user=guest, format_=format_, position=position)
    db.commit()
    wait(db, guest)
    assert len(offers(world, 'guest')) == (1 if offered else 0)
    assert search_of(db, guest).state == ('pareada' if offered else 'ativa')


def test_a_walkin_of_any_position_skips_the_older_search_that_cannot_face_the_team(world):
    db = world.db
    first, second = world.people['guest'].user, world.people['other'].user
    new_match(world, slots_a={'defesa': 1}, tier_a='ouro')
    # The older search is Bronze as a defender (the Ouro team is not a neighbour); the newer one is in placement.
    make_standing(db, tier='bronze', user=first, format_='society', position='defesa')
    db.commit()
    start = utcnow()
    assert wait(db, first, position=None, at=start - 2 * HOUR) is None
    assert wait(db, second, position=None, at=start - HOUR).kind == 'oferta'
    assert offers(world, 'guest') == [] and len(offers(world, 'other')) == 1


# ----- The representative adjusts the slots ----------------------------------------------------------------------

def test_opening_slots_offers_them_to_the_walkins_waiting(world):
    db, keeper = world.db, world.people['guest'].user
    match = new_match(world, slots_a={'atacante': 1})
    assert wait(db, keeper, position='goleiro') is None

    response = set_slots(world, 'rep_a', match, {'atacante': 1, 'goleiro': 1})
    assert response.status_code == 200, response.text
    detail = response.json()
    assert detail['permissions']['manage_slots'] and detail['my_role'] == 'representante'
    assert sorted((item['side'], item['position'], item['state']) for item in detail['slots']) == [
        ('a', 'atacante', 'aberta'), ('a', 'goleiro', 'oferecida')]
    assert [(item.position, item.state) for item in slots_of(db, match)] == [
        ('atacante', 'aberta'), ('goleiro', 'oferecida')]
    assert search_of(db, keeper).state == 'pareada' and len(offers(world, 'guest')) == 1
    side = db.scalar(select(MatchSide).where(MatchSide.match_id == match.id, MatchSide.side == 'a'))
    db.refresh(side)
    assert side.declared_slots == {'goleiro': 1, 'defesa': 0, 'meio_campo': 0, 'atacante': 1}
    # The other side is untouched.
    assert [item.side for item in slots_of(db, match)] == ['a', 'a']

    banners = db.scalars(select(MatchMessage).where(MatchMessage.event_type == 'vagas_atualizadas')).all()
    assert len(banners) == 1 and banners[0].side == 'a'
    assert banners[0].body == 'Ferrugem FC atualizou as vagas para avulsos: Goleiro (1), Atacante (1).'
    audit = audit_actions(db, 'vagas.atualizadas')
    assert len(audit) == 1 and audit[0].actor_id == world.people['rep_a'].user.id
    assert audit[0].data['before']['goleiro'] == 0 and audit[0].data['after']['goleiro'] == 1
    assert audit[0].data['closed_slot_ids'] == [] and audit[0].data['returned_search_ids'] == []

    # Same request again: nothing changes, no new banner or audit row.
    assert set_slots(world, 'rep_a', match, {'atacante': 1, 'goleiro': 1}).status_code == 200
    assert len(slots_of(db, match)) == 2
    assert len(db.scalars(select(MatchMessage).where(MatchMessage.event_type == 'vagas_atualizadas')).all()) == 1
    assert len(audit_actions(db, 'vagas.atualizadas')) == 1


def test_reducing_closes_open_slots_first_and_returns_an_offered_walkin_to_the_queue(world):
    db = world.db
    keeper = world.people['guest'].user
    match = new_match(world, slots_a={'atacante': 2, 'goleiro': 1})
    wait(db, keeper, position='goleiro')
    goalkeeper_slot = next(slot for slot in slots_of(db, match) if slot.position == 'goleiro')
    assert goalkeeper_slot.state == 'oferecida'

    # One forward fewer: an open slot closes, the offer stays.
    response = set_slots(world, 'rep_a', match, {'atacante': 1, 'goleiro': 1})
    assert response.status_code == 200
    assert sorted((slot.position, slot.state) for slot in slots_of(db, match)) == [
        ('atacante', 'aberta'), ('atacante', 'fechada'), ('goleiro', 'oferecida')]
    assert search_of(db, keeper).state == 'pareada'
    assert notifications_of(db, 'oferta_retirada') == []

    # No goalkeeper: the offer is withdrawn, the walk-in goes back to waiting and the slot closes for good.
    response = set_slots(world, 'rep_a', match, {'atacante': 1})
    assert response.status_code == 200
    db.refresh(goalkeeper_slot)
    assert goalkeeper_slot.state == 'fechada' and goalkeeper_slot.closed_at is not None
    returned = search_of(db, keeper)
    assert (returned.state, returned.slot_id, returned.offer_expires_at, returned.ended_at) == (
        'ativa', None, None, None)
    assert offers(world, 'guest') == []
    assert [slot['position'] for slot in response.json()['slots']] == ['atacante']
    returned_audit = audit_actions(db, 'vaga.oferta_devolvida')
    assert len(returned_audit) == 1 and returned_audit[0].actor_id == world.people['rep_a'].user.id
    # The walk-in is told the offer left, by whom, and that the search goes on.
    told = notifications_of(db, 'oferta_retirada')
    assert [(item.user_id, item.actor_id) for item in told] == [(keeper.id, world.people['rep_a'].user.id)]
    assert told[0].payload == {'match_id': match.id, 'slot_id': goalkeeper_slot.id, 'position': 'goleiro',
                               'team_name': 'Ferrugem FC', 'reason': 'vagas_reduzidas', 'requeued': True}
    last = audit_actions(db, 'vagas.atualizadas')[-1]
    assert last.data['closed_slot_ids'] == [goalkeeper_slot.id] and last.data['returned_search_ids'] == [returned.id]

    # The walk-in is offered again when a goalkeeper slot opens.
    assert set_slots(world, 'rep_a', match, {'atacante': 1, 'goleiro': 1}).status_code == 200
    assert search_of(db, keeper).state == 'pareada'
    assert len(offers(world, 'guest')) == 1


def test_a_returned_walkin_is_offered_slots_of_other_matches_too(world):
    db = world.db
    keeper = world.people['guest'].user
    match = new_match(world, slots_a={'goleiro': 1})
    other = new_match(world, slots_a={'goleiro': 1}, slots_b={'goleiro': 1})
    # `other` has two keeper slots; the walk-in holds the oldest slot of the first match.
    wait(db, keeper, position='goleiro')
    held = search_of(db, keeper).slot_id
    owner = match if held in [slot.id for slot in slots_of(db, match)] else other
    free = [slot for slot in slots_of(db, other) if slot.id != held]
    assert free and all(slot.state == 'aberta' for slot in free)
    response = set_slots(world, 'rep_a', owner, {})
    assert response.status_code == 200, response.text
    returned = search_of(db, keeper)
    assert returned.state == 'pareada' and returned.slot_id in [slot.id for slot in free]


def test_declared_slots_respect_the_limits_counting_the_filled_ones(world):
    db, guest = world.db, world.people['guest'].user
    match = new_match(world, slots_a={'atacante': 1})
    for body, message in (
            ({'goleiro': 2}, 'No máximo uma vaga de goleiro.'),
            ({'atacante': 7}, 'No society cabem até 6 vagas para avulsos.'),
            ({'defesa': 3, 'meio_campo': 2, 'atacante': 2}, 'No society cabem até 6 vagas para avulsos.'),
            ({'atacante': -1}, 'Informe as vagas com números inteiros a partir de zero.')):
        response = set_slots(world, 'rep_a', match, body)
        assert response.status_code == 422, (body, response.text)
        assert response.json() == {'detail': message, 'fields': [{'field': 'open_slots', 'message': message}]}
    assert [slot.state for slot in slots_of(db, match)] == ['aberta']

    # Unknown position and unknown field are rejected by the schema.
    assert world.http.put(f'/api/v1/matches/{match.id}/slots', json={'open_slots': {'lateral': 1}},
                          headers=world.people['rep_a'].headers).status_code == 422
    assert world.http.put(f'/api/v1/matches/{match.id}/slots', json={'open_slots': {}, 'side': 'b'},
                          headers=world.people['rep_a'].headers).status_code == 422

    # A filled slot counts toward the six allowed.
    wait(db, guest)
    assert accept(world, 'guest', slots_of(db, match)[0].id).status_code == 200
    too_many = set_slots(world, 'rep_a', match, {'atacante': 6})
    assert too_many.status_code == 422
    assert too_many.json()['detail'] == 'No society cabem até 6 vagas para avulsos.'
    assert set_slots(world, 'rep_a', match, {'atacante': 5}).status_code == 200
    states = sorted(slot.state for slot in slots_of(db, match))
    assert states == ['aberta'] * 5 + ['preenchida']
    # Reducing never touches the guest who is already in: zero open slots leave the filled one alone.
    assert set_slots(world, 'rep_a', match, {}).status_code == 200
    assert sorted(slot.state for slot in slots_of(db, match)) == ['fechada'] * 5 + ['preenchida']


def test_each_representative_adjusts_only_their_own_side(world):
    db = world.db
    match = new_match(world, slots_a={'atacante': 1})
    assert set_slots(world, 'rep_b', match, {'defesa': 2}).status_code == 200
    assert sorted((slot.side, slot.position, slot.state) for slot in slots_of(db, match)) == [
        ('a', 'atacante', 'aberta'), ('b', 'defesa', 'aberta'), ('b', 'defesa', 'aberta')]
    detail = set_slots(world, 'rep_a', match, {}).json()
    assert [(item['side'], item['position']) for item in detail['slots']] == [('b', 'defesa'), ('b', 'defesa')]


def test_only_a_representative_adjusts_the_slots(world):
    db = world.db
    match = new_match(world, slots_a={'atacante': 1})
    wait(db, world.people['guest'].user)
    assert accept(world, 'guest', slots_of(db, match)[0].id).status_code == 200
    for who in ('member_a', 'guest', 'admin'):
        response = set_slots(world, who, match, {'atacante': 2})
        assert response.status_code == 403, (who, response.text)
        assert response.json() == {'detail': 'Só os representantes ajustam as vagas.'}
    assert set_slots(world, 'stranger', match, {'atacante': 2}).status_code == 404
    assert world.http.put('/api/v1/matches/999999/slots', json={'open_slots': {}},
                          headers=world.people['rep_a'].headers).status_code == 404
    assert len(slots_of(db, match)) == 1


def test_slots_change_only_before_the_start_and_only_in_friendly_football(world):
    db = world.db
    match = new_match(world, slots_a={'atacante': 1})
    started = utcnow() - HOUR
    match.starts_at, match.result_deadline = started, result_deadline(started)
    db.commit()
    response = set_slots(world, 'rep_a', match, {'atacante': 2})
    assert response.status_code == 409 and response.json() == {'detail': 'As vagas só mudam antes do início da partida.'}

    proposal = add(db, Match(sport='futebol', format='society', city_id=CITY, origin='amistoso', state='proposta',
                             proposal_expires_at=utcnow() + HOUR, created_at=utcnow(), updated_at=utcnow()))
    for label, team in (('a', world.team_a), ('b', world.team_b)):
        add(db, MatchSide(match_id=proposal.id, side=label, team_id=team.id, created_at=utcnow()))
    db.commit()
    response = set_slots(world, 'rep_a', proposal, {'atacante': 1})
    assert response.status_code == 409
    assert response.json() == {'detail': 'As vagas só mudam enquanto a partida está sendo combinada ou antes do início.'}

    players = [world.people['guest'].user, world.people['other'].user]
    tennis = add(db, Match(sport='tenis', city_id=CITY, origin='amistoso', state='combinando', created_at=utcnow(),
                           updated_at=utcnow()))
    for label, player in zip('ab', players, strict=True):
        add(db, MatchSide(match_id=tennis.id, side=label, user_id=player.id, accepted_at=utcnow(),
                          created_at=utcnow()))
    db.commit()
    response = set_slots(world, 'guest', tennis, {})
    assert response.status_code == 409
    assert response.json() == {'detail': 'Só partidas amistosas de futebol têm vagas para avulsos.'}


def test_while_arranging_the_declaration_is_stored_and_opens_with_the_schedule(world):
    db = world.db
    match = add(db, Match(sport='futebol', format='society', city_id=CITY, origin='amistoso', state='combinando',
                          created_at=utcnow(), updated_at=utcnow()))
    for label, team in (('a', world.team_a), ('b', world.team_b)):
        add(db, MatchSide(match_id=match.id, side=label, team_id=team.id, declared_slots={}, accepted_at=utcnow(),
                          created_at=utcnow()))
    db.commit()

    response = set_slots(world, 'rep_b', match, {'goleiro': 1, 'atacante': 2})
    assert response.status_code == 200, response.text
    assert response.json()['slots'] == [] and response.json()['permissions']['manage_slots']
    side = db.scalar(select(MatchSide).where(MatchSide.match_id == match.id, MatchSide.side == 'b'))
    db.refresh(side)
    assert side.declared_slots == {'goleiro': 1, 'defesa': 0, 'meio_campo': 0, 'atacante': 2}
    assert slots_of(db, match) == []
    assert [item.event_type for item in db.scalars(select(MatchMessage).where(MatchMessage.match_id == match.id))
            ] == ['vagas_atualizadas']
    assert set_slots(world, 'rep_b', match, {'goleiro': 2}).status_code == 422

    # The first scheduling opens what was declared (done by the match front when the terms are accepted).
    opened = open_declared_slots(db, match, now=utcnow())
    assert sorted((slot.side, slot.position) for slot in opened) == [('b', 'atacante'), ('b', 'atacante'),
                                                                     ('b', 'goleiro')]


# ----- The representative removes a guest ------------------------------------------------------------------------

def test_the_representative_removes_the_guest_who_loses_access_and_is_told(world):
    db, guest = world.db, world.people['guest']
    match = new_match(world, slots_a={'atacante': 1})
    wait(db, guest.user)
    slot = slots_of(db, match)[0]
    assert accept(world, 'guest', slot.id).status_code == 200

    for who in ('rep_b', 'member_a', 'guest', 'admin'):
        response = remove(world, who, match, guest)
        assert response.status_code == 403, (who, response.text)
        assert response.json() == {'detail': 'Só os representantes do time do avulso o removem da partida.'}
    assert remove(world, 'stranger', match, guest).status_code == 404
    assert world.http.delete(f'/api/v1/matches/{match.id}/guests/999999',
                             headers=world.people['rep_a'].headers).json() == {
        'detail': 'Avulso não encontrado nesta partida.'}
    assert match_access(db, match, guest.user) is not None

    response = remove(world, 'rep_a', match, guest)
    assert response.status_code == 204 and response.content == b''
    db.refresh(slot)
    assert (slot.state, slot.filled_by_id, slot.removed_by_id) == ('fechada', guest.user.id,
                                                                    world.people['rep_a'].user.id)
    assert slot.removed_at is not None and slot.closed_at is not None
    lineup = db.scalar(select(MatchLineup).where(MatchLineup.match_id == match.id,
                                                 MatchLineup.user_id == guest.user.id))
    assert lineup.removed_at is not None and lineup.guest
    assert match_access(db, match, guest.user) is None
    # The slot does not reopen by itself.
    assert [item.state for item in slots_of(db, match)] == ['fechada']
    told = notifications_of(db, 'removido_da_partida')
    assert [(item.user_id, item.actor_id, item.payload) for item in told] == [
        (guest.user.id, world.people['rep_a'].user.id, {'match_id': match.id, 'team_name': 'Ferrugem FC'})]
    banner = db.scalars(select(MatchMessage).where(MatchMessage.event_type == 'avulso_removido')).all()
    assert len(banner) == 1 and banner[0].side == 'a' and banner[0].payload['user_id'] == guest.user.id
    assert [(row.actor_id, row.data['user_id']) for row in audit_actions(db, 'avulso.removido')] == [
        (world.people['rep_a'].user.id, guest.user.id)]
    assert remove(world, 'rep_a', match, guest).status_code == 404

    # Removed for good from this match: new slots are not offered to the same person again.
    wait(db, guest.user)
    assert set_slots(world, 'rep_a', match, {'atacante': 1}).status_code == 200
    assert search_of(db, guest.user).state == 'ativa' and offers(world, 'guest') == []


def test_a_guest_cannot_be_removed_after_the_start(world):
    db, guest = world.db, world.people['guest']
    match = new_match(world, slots_a={'atacante': 1})
    wait(db, guest.user)
    assert accept(world, 'guest', slots_of(db, match)[0].id).status_code == 200
    started = utcnow() - HOUR
    match.starts_at, match.result_deadline = started, result_deadline(started)
    db.commit()
    response = remove(world, 'rep_a', match, guest)
    assert response.status_code == 409
    assert response.json() == {'detail': 'Depois do início, o avulso só fica de fora pela presença.'}
    assert [item.state for item in slots_of(db, match)] == ['preenchida']
    assert match_access(db, match, guest.user).role == 'avulso'

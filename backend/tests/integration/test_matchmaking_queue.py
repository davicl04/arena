"""Matchmaking queue on PostgreSQL (one session): pairing order, buckets, proposals, walk-in offers and expiry."""
from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models.matches import Match, MatchLineup, MatchMessage, MatchSearch, MatchSide, MatchSlot
from app.models.teams import TeamMember
from app.services.match_lifecycle import close_match_slots, open_declared_slots
from app.services.match_rules import TransitionError
from app.services.matchmaking_queue import queue
from tests.integration.match_helpers import (
    NOW,
    OTHER_CITY,
    add,
    audit_actions,
    make_standing,
    make_team,
    make_user,
    notifications_of,
    scheduled_match,
    team_search,
    tennis_search,
    walkin_search,
)


def teams(db, count, **kwargs):
    reps = [make_user(db, f'rep{index}') for index in range(count)]
    return reps, [make_team(db, rep, name=f'Time {index}', **kwargs) for index, rep in enumerate(reps)]


def sides_of(db, match):
    return {side.side: side for side in db.scalars(select(MatchSide).where(MatchSide.match_id == match.id))}


def test_two_compatible_team_searches_become_a_proposal(client):
    _, db = client
    (rep_a, rep_b), (team_a, team_b) = teams(db, 2)
    member = make_user(db, 'membro')
    waiting = team_search(team_a, rep_a, tier='prata', started_at=NOW - timedelta(hours=3),
                          open_slots={'atacante': 2})
    assert queue.enqueue(db, waiting, now=NOW - timedelta(hours=3)) is None
    assert waiting.state == 'ativa' and waiting.match_id is None

    newcomer = team_search(team_b, rep_b, tier='ouro')
    pairing = queue.enqueue(db, newcomer, now=NOW)
    assert pairing.kind == 'proposta' and pairing.searches == (waiting, newcomer)
    match = pairing.match
    assert (match.state, match.sport, match.format, match.city_id, match.origin) == (
        'proposta', 'futebol', 'society', waiting.city_id, 'amistoso')
    assert match.proposal_expires_at == NOW + timedelta(hours=2)
    sides = sides_of(db, match)
    # Side A is the search that waited; tiers and declared slots are copied from the searches.
    assert (sides['a'].team_id, sides['a'].tier, sides['a'].search_id) == (team_a.id, 'prata', waiting.id)
    assert (sides['b'].team_id, sides['b'].tier, sides['b'].search_id) == (team_b.id, 'ouro', newcomer.id)
    assert sides['a'].declared_slots == {'goleiro': 0, 'defesa': 0, 'meio_campo': 0, 'atacante': 2}
    assert all(item.state == 'pareada' and item.match_id == match.id for item in (waiting, newcomer))
    sent = notifications_of(db, 'proposta_partida')
    assert sorted((item.user_id, item.payload['opponent_name']) for item in sent) == sorted(
        [(rep_a.id, 'Time 1'), (rep_b.id, 'Time 0')])
    assert all(item.payload['expires_at'] == (NOW + timedelta(hours=2)).isoformat() for item in sent)
    assert member.id not in {item.user_id for item in sent}
    assert [row.data['search_ids'] for row in audit_actions(db, 'partida.proposta_criada')] == [
        [waiting.id, newcomer.id]]


def test_pairing_order_same_tier_then_neighbour_then_oldest(client):
    _, db = client
    reps, squads = teams(db, 8)
    hours = iter(range(10, 0, -1))
    ouro, prata, sem, diamante = (add(db, team_search(squads[index], reps[index], tier=tier,
                                                      started_at=NOW - timedelta(hours=next(hours))))
                                  for index, tier in enumerate(('ouro', 'prata', None, 'diamante')))
    # Prata pairs with Prata first, although Ouro and the placement search waited longer.
    first = queue.enqueue(db, team_search(squads[4], reps[4], tier='prata'), now=NOW)
    assert first.searches[0] == prata
    # Next Prata: the neighbour (Ouro) before the placement search.
    second = queue.enqueue(db, team_search(squads[5], reps[5], tier='prata'), now=NOW)
    assert second.searches[0] == ouro
    third = queue.enqueue(db, team_search(squads[6], reps[6], tier='prata'), now=NOW)
    assert third.searches[0] == sem
    # Diamante never faces Prata: the last Prata waits.
    assert queue.enqueue(db, team_search(squads[7], reps[7], tier='prata'), now=NOW) is None
    assert diamante.state == 'ativa'


def test_buckets_keep_formats_cities_and_sports_apart(client):
    _, db = client
    reps, squads = teams(db, 4)
    tennis_a, tennis_b = make_user(db, 'tenista-a'), make_user(db, 'tenista-b')
    add(db, team_search(squads[0], reps[0], format_='futsal', started_at=NOW - timedelta(hours=1)))
    assert queue.enqueue(db, team_search(squads[1], reps[1], format_='society'), now=NOW) is None
    assert queue.enqueue(db, team_search(squads[2], reps[2], city_id=OTHER_CITY), now=NOW) is None
    assert queue.enqueue(db, tennis_search(tennis_a, city_id=OTHER_CITY), now=NOW) is None
    pairing = queue.enqueue(db, tennis_search(tennis_b, city_id=OTHER_CITY), now=NOW)
    assert pairing.match.sport == 'tenis' and pairing.match.format is None
    assert {side.user_id for side in sides_of(db, pairing.match).values()} == {tennis_a.id, tennis_b.id}
    # One open search per team and sport.
    with pytest.raises(IntegrityError):
        with db.begin_nested():
            add(db, team_search(squads[1], reps[1], format_='campo'))


def test_expired_or_inactive_candidates_are_skipped(client):
    _, db = client
    reps, squads = teams(db, 3)
    lapsed = add(db, team_search(squads[0], reps[0], started_at=NOW - timedelta(hours=25)))
    closed = add(db, team_search(squads[1], reps[1], started_at=NOW - timedelta(hours=2)))
    squads[1].state, squads[1].closed_at = 'encerrado', NOW
    db.flush()
    assert queue.enqueue(db, team_search(squads[2], reps[2]), now=NOW) is None
    assert lapsed.state == 'ativa' and closed.state == 'ativa'
    # A search past its own 24 h never pairs.
    stale = add(db, tennis_search(make_user(db, 'velho'), started_at=NOW - timedelta(hours=30)))
    add(db, tennis_search(make_user(db, 'novo'), started_at=NOW - timedelta(hours=1)))
    assert queue.try_match(db, stale, now=NOW) is None


def test_teams_sharing_a_representative_never_face_each_other(client):
    _, db = client
    shared, other = make_user(db, 'capitao'), make_user(db, 'outro')
    first = make_team(db, shared, name='Ferrugem')
    second = make_team(db, other, name='Ferrugem B', extra_representatives=(shared,))
    rival = make_user(db, 'rival')
    third = make_team(db, rival, name='Leões')
    assert queue.enqueue(db, team_search(first, shared, started_at=NOW - timedelta(hours=2)),
                         now=NOW - timedelta(hours=2)) is None
    assert queue.enqueue(db, team_search(second, other, started_at=NOW - timedelta(hours=1)),
                         now=NOW - timedelta(hours=1)) is None
    pairing = queue.enqueue(db, team_search(third, rival), now=NOW)
    assert {side.team_id for side in sides_of(db, pairing.match).values()} == {first.id, third.id}


def test_both_acceptances_open_the_chat(client):
    _, db = client
    (rep_a, rep_b), (team_a, team_b) = teams(db, 2)
    member_b = make_user(db, 'membro-b')
    add(db, TeamMember(team_id=team_b.id, user_id=member_b.id, role='membro', joined_via='convite'))
    add(db, team_search(team_a, rep_a, started_at=NOW - timedelta(minutes=30)))
    match = queue.enqueue(db, team_search(team_b, rep_b), now=NOW).match

    assert queue.accept_proposal(db, match, 'a', rep_a, now=NOW + timedelta(minutes=5)) is False
    assert queue.accept_proposal(db, match, 'a', rep_a, now=NOW + timedelta(minutes=6)) is False  # idempotent
    waiting = notifications_of(db, 'proposta_aceita')
    assert [(item.user_id, item.payload['complete']) for item in waiting] == [(rep_b.id, False)]
    assert match.state == 'proposta'

    assert queue.accept_proposal(db, match, 'b', rep_b, now=NOW + timedelta(minutes=10)) is True
    assert match.state == 'combinando'
    searches = db.scalars(select(MatchSearch).where(MatchSearch.match_id == match.id)).all()
    assert {item.state for item in searches} == {'concluida'} and all(item.ended_at for item in searches)
    complete = [item for item in notifications_of(db, 'proposta_aceita') if item.payload['complete']]
    assert sorted(item.user_id for item in complete) == sorted([rep_a.id, member_b.id])
    banner = db.scalar(select(MatchMessage).where(MatchMessage.match_id == match.id))
    assert (banner.kind, banner.event_type) == ('evento', 'partida_combinando')
    assert [row.data for row in audit_actions(db, 'partida.proposta_aceita')] == [
        {'side': 'a', 'complete': False}, {'side': 'b', 'complete': True}]
    with pytest.raises(TransitionError, match='não está mais aberta'):
        queue.accept_proposal(db, match, 'b', rep_b, now=NOW + timedelta(minutes=11))


def test_acceptance_after_two_hours_is_refused(client):
    _, db = client
    (rep_a, rep_b), (team_a, team_b) = teams(db, 2)
    add(db, team_search(team_a, rep_a, started_at=NOW - timedelta(minutes=30)))
    match = queue.enqueue(db, team_search(team_b, rep_b), now=NOW).match
    with pytest.raises(TransitionError):
        queue.accept_proposal(db, match, 'a', rep_a, now=NOW + timedelta(hours=2))
    with pytest.raises(TransitionError):
        queue.decline_proposal(db, match, 'a', rep_a, now=NOW + timedelta(hours=2))


def test_decline_ends_the_decliner_and_pairs_the_other_side_again(client):
    _, db = client
    reps, squads = teams(db, 3)
    first = add(db, team_search(squads[0], reps[0], started_at=NOW - timedelta(hours=3)))
    second = team_search(squads[1], reps[1], started_at=NOW - timedelta(hours=2))
    match = queue.enqueue(db, second, now=NOW - timedelta(hours=2)).match
    third = team_search(squads[2], reps[2], started_at=NOW - timedelta(hours=1))
    assert queue.enqueue(db, third, now=NOW - timedelta(hours=1)) is None

    moment = NOW - timedelta(minutes=30)
    pairings = queue.decline_proposal(db, match, 'b', reps[1], now=moment)
    assert match.state == 'recusada' and match.closed_at == moment
    assert (second.state, second.ended_at) == ('recusada', moment)
    assert sides_of(db, match)['b'].declined_by_id == reps[1].id
    # The side that did not decline went back to the queue and met the third team at once.
    assert len(pairings) == 1 and pairings[0].searches == (third, first)
    assert first.state == 'pareada' and first.match_id == pairings[0].match.id
    assert first.expires_at == NOW - timedelta(hours=3) + timedelta(hours=24)
    ended = notifications_of(db, 'proposta_encerrada')
    assert [(item.user_id, item.payload['reason'], item.payload['requeued']) for item in ended] == [
        (reps[0].id, 'recusada', True)]
    assert audit_actions(db, 'partida.proposta_recusada')[0].data == {'requeued_search_ids': [first.id], 'side': 'b'}


def test_expired_proposal_returns_the_side_that_accepted_with_its_original_deadline(client):
    _, db = client
    reps, squads = teams(db, 4)
    accepted_search = add(db, team_search(squads[0], reps[0], started_at=NOW - timedelta(hours=5)))
    silent = team_search(squads[1], reps[1], started_at=NOW)
    match = queue.enqueue(db, silent, now=NOW).match
    queue.accept_proposal(db, match, 'a', reps[0], now=NOW + timedelta(minutes=20))
    # Another proposal whose accepted side already used its 24 h.
    old = add(db, team_search(squads[2], reps[2], started_at=NOW - timedelta(hours=23)))
    late = queue.enqueue(db, team_search(squads[3], reps[3], started_at=NOW), now=NOW).match
    queue.accept_proposal(db, late, 'a', reps[2], now=NOW + timedelta(minutes=30))

    assert queue.expire_proposals(db, NOW + timedelta(hours=2) - timedelta(seconds=1)) == 0
    moment = NOW + timedelta(hours=2)
    assert queue.expire_proposals(db, moment) == 2
    assert match.state == late.state == 'expirada'
    assert (accepted_search.state, accepted_search.expires_at) == ('ativa', NOW - timedelta(hours=5) + timedelta(hours=24))
    assert accepted_search.match_id is None
    assert (silent.state, silent.ended_at) == ('sem_resposta', moment)
    assert (old.state, old.ended_at) == ('expirada', moment)
    payloads = {item.user_id: item.payload for item in notifications_of(db, 'proposta_encerrada')}
    assert payloads[reps[0].id]['requeued'] and not payloads[reps[1].id]['requeued']
    assert payloads[reps[2].id] == {'match_id': late.id, 'opponent_name': 'Time 3', 'reason': 'expirada',
                                    'requeued': False}
    assert all(row.data.get('automatico') for row in audit_actions(db, 'partida.proposta_expirada'))
    # Running again changes nothing.
    assert queue.expire_proposals(db, moment) == 0


def test_waiting_searches_expire_after_24_hours(client):
    _, db = client
    reps, squads = teams(db, 2)
    due = add(db, team_search(squads[0], reps[0], started_at=NOW - timedelta(hours=24)))
    running = add(db, team_search(squads[1], reps[1], format_='campo', started_at=NOW - timedelta(hours=23)))
    assert queue.expire_searches(db, NOW) == 1
    assert (due.state, due.ended_at, running.state) == ('expirada', NOW, 'ativa')
    assert queue.expire_searches(db, NOW) == 0
    assert audit_actions(db, 'busca.expirada')[0].target_id == due.id
    assert queue.expire(db, NOW + timedelta(hours=1)) == {'buscas': 1, 'propostas': 0, 'ofertas': 0}


def test_requeue_clears_the_proposal_and_enqueue_takes_only_new_searches(client):
    _, db = client
    (rep_a,), (team_a,) = teams(db, 1)
    search = add(db, team_search(team_a, rep_a, started_at=NOW - timedelta(hours=1)))
    proposal = add(db, Match(sport='futebol', format='society', city_id=team_a.city_id, origin='amistoso',
                             state='proposta', proposal_expires_at=NOW + timedelta(hours=2), created_at=NOW,
                             updated_at=NOW))
    search.state, search.match_id = 'pareada', proposal.id
    db.flush()
    assert queue.requeue(db, search, now=NOW) is True
    assert (search.state, search.match_id) == ('ativa', None)
    search.state = 'cancelada'
    search.ended_at = NOW
    with pytest.raises(ValueError, match='Só buscas ativas'):
        queue.enqueue(db, search, now=NOW)


# ----- Walk-ins ----------------------------------------------------------------------------------------------

def walkin_setup(db, **match_kwargs):
    (rep_a, rep_b), (team_a, team_b) = teams(db, 2)
    match = scheduled_match(db, team_a, team_b, slots_a={'atacante': 1, 'goleiro': 1}, **match_kwargs)
    return rep_a, rep_b, team_a, team_b, match


def slots_of(db, match):
    return {slot.position: slot for slot in db.scalars(select(MatchSlot).where(MatchSlot.match_id == match.id))}


def test_walkins_get_compatible_slot_offers(client):
    _, db = client
    rep_a, _, team_a, _, match = walkin_setup(db, tier_a='bronze')
    slots = slots_of(db, match)
    assert {slot.state for slot in slots.values()} == {'aberta'} and set(slots) == {'atacante', 'goleiro'}

    striker = make_user(db, 'atacante')
    offer = queue.enqueue(db, walkin_search(striker, position='atacante'), now=NOW)
    assert offer.kind == 'oferta' and offer.slot == slots['atacante'] and offer.match == match
    search = offer.searches[0]
    assert (search.state, search.slot_id, search.offer_expires_at) == ('pareada', slots['atacante'].id,
                                                                       NOW + timedelta(hours=2))
    assert slots['atacante'].state == 'oferecida'
    sent = notifications_of(db, 'vaga_encontrada')[0]
    assert (sent.user_id, sent.payload['position'], sent.payload['team_name'], sent.payload['format']) == (
        striker.id, 'atacante', team_a.name, 'society')

    # A Diamante striker never takes a Bronze team's slot; "any position" takes the goalkeeper spot.
    star = make_user(db, 'craque')
    make_standing(db, user=star, tier='diamante', format_='society', position='goleiro')
    assert queue.enqueue(db, walkin_search(star), now=NOW) is None
    anyone = make_user(db, 'coringa')
    assert queue.enqueue(db, walkin_search(anyone), now=NOW).slot == slots['goleiro']
    # No slot for defenders: the search waits.
    defender = make_user(db, 'zagueiro')
    assert queue.enqueue(db, walkin_search(defender, position='defesa'), now=NOW) is None


def test_walkin_from_the_team_or_other_city_is_never_offered(client):
    _, db = client
    rep_a, rep_b, team_a, team_b, match = walkin_setup(db)
    member = make_user(db, 'membro')
    add(db, TeamMember(team_id=team_b.id, user_id=member.id, role='membro', joined_via='convite'))
    assert queue.enqueue(db, walkin_search(member), now=NOW) is None
    assert queue.enqueue(db, walkin_search(make_user(db, 'longe'), city_id=OTHER_CITY), now=NOW) is None
    # A match that already started does not take walk-ins.
    match.starts_at, match.result_deadline = NOW - timedelta(minutes=1), NOW + timedelta(hours=47)
    db.flush()
    assert queue.enqueue(db, walkin_search(make_user(db, 'atrasado')), now=NOW) is None
    assert queue.offer_slots(db, match, now=NOW) == []


def test_accepting_an_offer_fills_the_slot_once(client):
    _, db = client
    rep_a, _, team_a, _, match = walkin_setup(db)
    striker = make_user(db, 'atacante')
    offer = queue.enqueue(db, walkin_search(striker, position='atacante'), now=NOW)
    lineup = queue.accept_offer(db, offer.slot.id, striker, now=NOW + timedelta(minutes=10))
    assert (lineup.side, lineup.guest, lineup.position, lineup.team_id, lineup.slot_id) == (
        'a', True, 'atacante', team_a.id, offer.slot.id)
    assert (offer.slot.state, offer.slot.filled_by_id) == ('preenchida', striker.id)
    assert (offer.searches[0].state, offer.searches[0].match_id) == ('concluida', match.id)
    assert [item.user_id for item in notifications_of(db, 'vaga_preenchida')] == [rep_a.id]
    banner = db.scalar(select(MatchMessage).where(MatchMessage.event_type == 'avulso_entrou'))
    assert banner.side == 'a' and 'Atacante' in banner.body
    # Nobody else (nor the same athlete) can take the filled slot.
    assert queue.accept_offer(db, offer.slot.id, striker, now=NOW + timedelta(minutes=11)) is None
    assert queue.accept_offer(db, offer.slot.id, make_user(db, 'intruso'), now=NOW) is None
    assert audit_actions(db, 'vaga.preenchida')[0].actor_id == striker.id


def test_offer_deadline_and_closed_match_refuse_the_acceptance(client):
    _, db = client
    _, _, _, _, match = walkin_setup(db)
    striker, keeper = make_user(db, 'atacante'), make_user(db, 'goleiro')
    late = queue.enqueue(db, walkin_search(striker, position='atacante'), now=NOW)
    with pytest.raises(TransitionError, match='prazo para aceitar'):
        queue.accept_offer(db, late.slot.id, striker, now=NOW + timedelta(hours=2))
    other = queue.enqueue(db, walkin_search(keeper, position='goleiro'), now=NOW)
    match.state, match.cancelled_at, match.closed_at = 'cancelada', NOW, NOW
    db.flush()
    with pytest.raises(TransitionError, match='não recebe mais avulsos'):
        queue.accept_offer(db, other.slot.id, keeper, now=NOW + timedelta(minutes=5))


def test_declined_or_unanswered_offers_go_to_the_next_walkin(client):
    _, db = client
    _, _, _, _, match = walkin_setup(db)
    slot = slots_of(db, match)['atacante']
    first, second, third = (make_user(db, name) for name in ('primeiro', 'segundo', 'terceiro'))
    offer = queue.enqueue(db, walkin_search(first, position='atacante', started_at=NOW - timedelta(hours=3)), now=NOW)
    waiting = add(db, walkin_search(second, position='atacante', started_at=NOW - timedelta(hours=2)))
    later = add(db, walkin_search(third, position='atacante', started_at=NOW - timedelta(hours=1)))
    assert offer.slot == slot

    assert queue.decline_offer(db, slot.id, first, now=NOW + timedelta(minutes=5)) is True
    assert offer.searches[0].state == 'recusada'
    assert (waiting.state, waiting.slot_id, slot.state) == ('pareada', slot.id, 'oferecida')
    assert queue.decline_offer(db, slot.id, first, now=NOW) is False

    deadline = waiting.offer_expires_at
    assert queue.expire_offers(db, deadline - timedelta(seconds=1)) == 0
    assert queue.expire_offers(db, deadline) == 1
    assert (waiting.state, later.state, later.slot_id) == ('sem_resposta', 'pareada', slot.id)
    assert queue.expire_offers(db, deadline) == 0
    assert [row.data.get('automatico') for row in audit_actions(db, 'vaga.oferta_sem_resposta')] == [True]


def test_slots_opened_later_are_offered_to_walkins_already_waiting(client):
    _, db = client
    (rep_a, rep_b), (team_a, team_b) = teams(db, 2)
    keeper = add(db, walkin_search(make_user(db, 'goleiro'), position='goleiro', started_at=NOW - timedelta(hours=1)))
    assert queue.try_match(db, keeper, now=NOW) is None
    match = scheduled_match(db, team_a, team_b, slots_b={'goleiro': 1, 'defesa': 1}, open_slots=False)
    opened = open_declared_slots(db, match, now=NOW)
    assert sorted((slot.side, slot.position) for slot in opened) == [('b', 'defesa'), ('b', 'goleiro')]
    pairings = queue.offer_slots(db, match, now=NOW)
    assert [(item.slot.position, item.searches[0]) for item in pairings] == [('goleiro', keeper)]


def test_a_withdrawn_offer_tells_the_walkin_even_when_the_search_itself_lapsed(client):
    _, db = client
    _, _, _, _, match = walkin_setup(db)
    keeper = make_user(db, 'goleiro')
    pending = queue.enqueue(db, walkin_search(keeper, position='goleiro', started_at=NOW - timedelta(hours=23)),
                            now=NOW)
    search, slot = pending.searches[0], pending.slot
    # The 24 h of the search end before the offer returns: it expires instead of waiting again.
    queue.release_offer(db, search, slot, outcome='devolvida', now=NOW + timedelta(hours=2), actor_id=None,
                        reason='partida_cancelada')
    assert (search.state, search.ended_at) == ('expirada', NOW + timedelta(hours=2))
    told = notifications_of(db, 'oferta_retirada')
    assert [(item.user_id, item.actor_id) for item in told] == [(keeper.id, None)]
    assert (told[0].payload['reason'], told[0].payload['requeued']) == ('partida_cancelada', False)


def test_cancelled_match_closes_slots_and_returns_pending_offers_to_the_queue(client):
    _, db = client
    _, _, _, _, match = walkin_setup(db)
    striker, keeper = make_user(db, 'atacante'), make_user(db, 'goleiro')
    filled = queue.enqueue(db, walkin_search(striker, position='atacante'), now=NOW)
    queue.accept_offer(db, filled.slot.id, striker, now=NOW)
    pending = queue.enqueue(db, walkin_search(keeper, position='goleiro'), now=NOW)
    guests = close_match_slots(db, match, now=NOW + timedelta(minutes=1))
    assert guests == [striker.id]
    assert {slot.state for slot in slots_of(db, match).values()} == {'fechada'}
    search = pending.searches[0]
    assert (search.state, search.slot_id, search.offer_expires_at) == ('ativa', None, None)
    assert audit_actions(db, 'vaga.oferta_devolvida')[0].data['search_id'] == search.id
    # The guest keeps the lineup row (history); the slot row is closed.
    assert db.scalar(select(MatchLineup).where(MatchLineup.user_id == striker.id)).guest is True

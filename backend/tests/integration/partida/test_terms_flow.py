"""Condições da partida, reserva e cancelamento (etapa 3, frente de partida) em PostgreSQL, pelas rotas."""
from sqlalchemy import func, select

from app.models.matches import Match, MatchSearch, MatchSide, MatchSlot, MatchTerms
from app.models.notifications import Notification
from tests.integration.entry_helpers import make_event
from tests.integration.match_helpers import CITY, OTHER_CITY, audit_actions, notifications_of, walkin_search
from tests.integration.partida.helpers import (
    API,
    DAY,
    HOUR,
    MINUTE,
    NOW,
    accepted_terms,
    agreed_match,
    events_of,
    fill_slot,
    make_court,
    make_match,
)


def proposal(world, *, starts_at=None, court=None, booking_side='a', **extra):
    return {'starts_at': (starts_at or NOW + 2 * DAY).isoformat(), 'court_id': (court or world['court']).id,
            'booking_side': booking_side, **extra}


def combining(db, world):
    return make_match(db, 'combinando', [world['team_a'], world['team_b']])


def propose(http, world, match, who='rep_a', **fields):
    return http.post(f'{API}/matches/{match.id}/terms', json=proposal(world, **fields), headers=world['h'][who])


def accept(http, world, match, terms_id, who='rep_b'):
    return http.put(f'{API}/matches/{match.id}/terms/{terms_id}/accept', json={}, headers=world['h'][who])


# ----- Reading --------------------------------------------------------------------------------------------------

def test_detail_is_for_participants_only(client, world, clock):
    http, db = client
    match = combining(db, world)
    for who in ('rep_a', 'member_b', 'admin'):
        response = http.get(f'{API}/matches/{match.id}', headers=world['h'][who])
        assert response.status_code == 200, who
        assert response.json()['id'] == match.id
    for who in ('stranger', 'guest'):
        response = http.get(f'{API}/matches/{match.id}', headers=world['h'][who])
        assert (response.status_code, response.json()['detail']) == (404, 'Partida não encontrada.')
    assert http.get(f'{API}/matches/99999999', headers=world['h']['rep_a']).status_code == 404
    assert http.get(f'{API}/matches/{match.id}').status_code == 401


# ----- Proposing and accepting ------------------------------------------------------------------------------------

def test_two_acceptances_schedule_the_match(client, world, clock):
    http, db = client
    match = combining(db, world)
    for side in match_sides(db, match):
        side.declared_slots = {'atacante': 1} if side.side == 'a' else {}

    created = propose(http, world, match)
    assert created.status_code == 201, created.text
    body = created.json()
    pending = body['terms']['pending']
    assert (body['state'], body['starts_at'], body['terms']['current']) == ('combinando', None, None)
    assert (pending['state'], pending['proposed_by_side'], pending['booking_side']) == ('pendente', 'a', 'a')
    assert pending['accepted_a_at'] is not None and pending['accepted_b_at'] is None
    assert pending['court']['name'] == 'Quadra Central' and pending['super_tiebreak'] is None
    assert body['permissions']['propose_terms'] and not body['permissions']['accept_terms']
    # Only who acts for the other side is told; the banner and the audit entry are written.
    assert [n.user_id for n in notifications_of(db, 'condicoes_propostas')] == [world['rep_b'].id]
    assert notifications_of(db, 'condicoes_propostas')[0].payload['court_name'] == 'Quadra Central'
    assert len(events_of(db, match, 'condicoes_propostas')) == 1
    assert [a.action for a in audit_actions(db, 'condicoes.propostas')] == ['condicoes.propostas']

    terms_id = pending['id']
    seen = http.get(f'{API}/matches/{match.id}', headers=world['h']['rep_b']).json()
    assert seen['permissions']['accept_terms'] and seen['needs_my_action']

    # Members do not accept; the proposer's own call changes nothing; the other representative closes it.
    refused = accept(http, world, match, terms_id, 'member_b')
    assert (refused.status_code, refused.json()['detail']) == (403, 'Só os representantes aceitam.')
    again = accept(http, world, match, terms_id, 'rep_a')
    assert again.status_code == 200 and again.json()['state'] == 'combinando'

    done = accept(http, world, match, terms_id)
    assert done.status_code == 200, done.text
    detail = done.json()
    assert (detail['state'], detail['phase']) == ('agendada', 'agendada')
    assert detail['starts_at'] == (NOW + 2 * DAY).isoformat().replace('+00:00', 'Z')
    assert detail['court']['id'] == world['court'].id and detail['terms']['pending'] is None
    assert detail['terms']['current']['state'] == 'aceita'
    assert detail['terms']['current']['accepted_b_at'] is not None
    assert detail['booking'] == {'side': 'a', 'state': 'a_confirmar', 'confirmed_at': None}
    assert detail['cancel_until'].startswith((NOW + DAY).isoformat()[:13])
    db.refresh(match)
    assert match.result_deadline == NOW + 2 * DAY + 48 * HOUR and match.state == 'agendada'
    # The first agreement opens the slots the sides declared, tells every member and writes the banner.
    slots = db.scalars(select(MatchSlot).where(MatchSlot.match_id == match.id)).all()
    assert [(slot.side, slot.position, slot.state) for slot in slots] == [('a', 'atacante', 'aberta')]
    scheduled = notifications_of(db, 'partida_agendada')
    assert {n.user_id for n in scheduled} == {world[name].id for name in ('rep_a', 'member_a', 'member_b')}
    assert all(n.payload['changed'] is False for n in scheduled)
    assert len(events_of(db, match, 'partida_agendada')) == 1
    assert [a.action for a in audit_actions(db, 'partida.agendada')] == ['partida.agendada']
    assert len(audit_actions(db, 'condicoes.aceitas')) == 1


def match_sides(db, match):
    return db.scalars(select(MatchSide).where(MatchSide.match_id == match.id)).all()


def test_the_first_agreement_offers_the_opened_slots_to_the_walkins_waiting(client, world, clock):
    http, db = client
    match = combining(db, world)
    for side in match_sides(db, match):
        side.declared_slots = {'atacante': 1} if side.side == 'a' else {}
    waiting = walkin_search(world['guest'], position='atacante', started_at=NOW - HOUR, city_id=CITY)
    other_city = walkin_search(world['stranger'], position='atacante', started_at=NOW - 2 * HOUR, city_id=OTHER_CITY)
    db.add_all([waiting, other_city])
    db.flush()

    terms_id = propose(http, world, match).json()['terms']['pending']['id']
    assert db.scalar(select(func.count()).select_from(MatchSlot).where(MatchSlot.match_id == match.id)) == 0
    assert accept(http, world, match, terms_id).status_code == 200

    # The slot opened by the agreement went to the walk-in waiting in the city, held for 2 h; the one of another
    # city kept waiting.
    slot = db.scalar(select(MatchSlot).where(MatchSlot.match_id == match.id))
    assert (slot.side, slot.position, slot.state) == ('a', 'atacante', 'oferecida')
    db.refresh(waiting)
    db.refresh(other_city)
    assert (waiting.state, waiting.slot_id, waiting.offer_expires_at) == ('pareada', slot.id, NOW + 2 * HOUR)
    assert other_city.state == 'ativa'
    offers = notifications_of(db, 'vaga_encontrada')
    assert [(item.user_id, item.payload['match_id'], item.payload['slot_id']) for item in offers] == [
        (world['guest'].id, match.id, slot.id)]
    assert [item.target_id for item in audit_actions(db, 'vaga.oferecida')] == [slot.id]


def test_a_change_after_the_agreement_needs_both_acceptances_again(client, world, clock):
    http, db = client
    first = NOW + 2 * DAY
    match = agreed_match(db, world, starts_at=first)
    match.booking_confirmed_at, match.booking_confirmed_by_id = NOW - HOUR, world['rep_a'].id
    other_court = make_court(db, 'Quadra Sul')
    db.flush()

    same = propose(http, world, match, 'rep_b', starts_at=first, booking_side='a')
    assert (same.status_code, same.json()['detail']) == (409, 'Estas já são as condições combinadas.')

    later = first + HOUR
    created = propose(http, world, match, 'rep_b', starts_at=later, court=other_court, booking_side='b')
    assert created.status_code == 201
    body = created.json()
    # The agreed terms stay valid while the new proposal is pending; the proposer (side B) accepted already.
    assert body['state'] == 'agendada' and body['starts_at'] == first.isoformat().replace('+00:00', 'Z')
    assert body['terms']['current']['court']['name'] == 'Quadra Central'
    assert body['terms']['pending']['accepted_b_at'] is not None and body['terms']['pending']['accepted_a_at'] is None
    old_pending_id = body['terms']['pending']['id']

    # A newer proposal of side A replaces it; the replaced one cannot be accepted anymore.
    replaced = propose(http, world, match, 'rep_a', starts_at=later + HOUR, court=other_court)
    assert replaced.status_code == 201
    stale = accept(http, world, match, old_pending_id, 'rep_a')
    assert (stale.status_code, stale.json()['detail']) == (
        409, 'Estas condições foram substituídas. Confira a proposta atual.')
    current = replaced.json()['terms']['pending']['id']
    assert db.get(MatchTerms, old_pending_id).state == 'substituida'

    done = accept(http, world, match, current)
    assert done.status_code == 200, done.text
    detail = done.json()
    assert detail['state'] == 'agendada' and detail['court']['name'] == 'Quadra Sul'
    assert detail['starts_at'] == (later + HOUR).isoformat().replace('+00:00', 'Z')
    assert detail['terms']['current']['id'] == current
    # The booking goes back to "a confirmar" because the court and the time changed.
    assert detail['booking'] == {'side': 'a', 'state': 'a_confirmar', 'confirmed_at': None}
    db.refresh(match)
    assert match.result_deadline == later + HOUR + 48 * HOUR
    states = [terms.state for terms in db.scalars(select(MatchTerms).where(MatchTerms.match_id == match.id)
                                                  .order_by(MatchTerms.id))]
    assert states == ['substituida', 'substituida', 'aceita']
    changed = [n for n in notifications_of(db, 'partida_agendada') if n.payload['changed']]
    assert changed and len(events_of(db, match, 'condicoes_aceitas')) == 1
    assert len(db.scalars(select(MatchSlot).where(MatchSlot.match_id == match.id)).all()) == 0


def test_booking_only_resets_when_court_time_or_who_books_changed(client, world, clock):
    http, db = client
    start = NOW + 2 * DAY
    match = make_match(db, 'agendada', [world['tenista_a'], world['tenista_b']], sport='tenis', starts_at=start,
                       court=world['tennis_court'], super_tiebreak=False)
    accepted_terms(db, match, world['tennis_court'], start, super_tiebreak=False)
    match.booking_confirmed_at, match.booking_confirmed_by_id = NOW - HOUR, world['tenista_a'].id
    db.flush()
    body = {'starts_at': start.isoformat(), 'court_id': world['tennis_court'].id, 'booking_side': 'a',
            'super_tiebreak': True}
    created = http.post(f'{API}/matches/{match.id}/terms', json=body, headers=world['h']['tenista_b'])
    assert created.status_code == 201, created.text
    assert created.json()['terms']['pending']['super_tiebreak'] is True
    done = accept(http, world, match, created.json()['terms']['pending']['id'], 'tenista_a')
    detail = done.json()
    assert detail['super_tiebreak'] is True and detail['booking']['state'] == 'confirmada'


def test_terms_are_validated_on_the_server(client, world, clock):
    http, db = client
    match = combining(db, world)
    other_city = make_court(db, 'Quadra Paulista', city_id=OTHER_CITY)
    wrong_kind = make_court(db, 'Quadra de Tênis', kind='tenis')
    foreign = make_court(db, 'Sugerida fora', state='em_revisao', suggested_by=world['rep_b'])
    hidden = make_court(db, 'Recusada', state='rejeitada')

    def code(**fields):
        response = propose(http, world, match, **fields)
        return response.status_code, response.json()

    status, body = code(starts_at=NOW - HOUR)
    assert status == 422 and body['fields'][0]['field'] == 'starts_at'
    assert code(starts_at=NOW + 61 * DAY)[0] == 422
    assert code(starts_at=NOW + DAY + 7 * MINUTE)[0] == 422                     # 15:07: off the 15-minute step
    naive = http.post(f'{API}/matches/{match.id}/terms', headers=world['h']['rep_a'],
                      json={**proposal(world), 'starts_at': '2026-10-14T15:00:00'})
    assert naive.status_code == 422 and naive.json()['fields'][0]['field'] == 'starts_at'
    for court in (other_city, foreign, hidden):
        status, body = code(court=court)
        assert (status, body['detail'], body['fields'][0]['field']) == (
            422, 'Escolha uma quadra do catálogo da cidade ou a sugerida nesta partida.', 'court_id')
    status, body = code(court=wrong_kind)
    assert (status, body['detail']) == (422, 'Escolha uma quadra de society.')
    status, body = code(super_tiebreak=True)
    assert (status, body['detail']) == (422, 'Super tie-break só no tênis.')
    assert propose(http, world, match, booking_side='c').status_code == 422
    assert code(court=world['court'])[0] == 201
    assert db.scalar(select(Match.state).where(Match.id == match.id)) == 'combinando'


def test_only_representatives_of_a_friendly_in_the_right_state_propose(client, world, clock):
    http, db = client
    match = combining(db, world)
    for who in ('member_a', 'guest'):
        response = propose(http, world, match, who)
        assert response.status_code in (403, 404)
    assert propose(http, world, match, 'member_a').json()['detail'] == 'Só os representantes propõem as condições.'
    assert propose(http, world, match, 'stranger').status_code == 404
    assert propose(http, world, match, 'admin').status_code == 403

    waiting = make_match(db, 'proposta', [world['team_a'], world['team_b']])
    closed = make_match(db, 'cancelada', [world['team_a'], world['team_b']])
    started = agreed_match(db, world, starts_at=NOW - HOUR)
    for blocked in (waiting, closed, started):
        response = propose(http, world, blocked)
        assert (response.status_code, response.json()['detail']) == (
            409, 'As condições só mudam enquanto a partida está sendo combinada ou antes do início.')
    championship = make_match(db, 'combinando', [world['team_a'], world['team_b']], origin='campeonato',
                              event_id=_event(db, world), round_number=1, bracket_position=1)
    response = propose(http, world, championship)
    assert (response.status_code, response.json()['detail']) == (
        409, 'Num campeonato, o organizador define data, horário e quadra.')


def _event(db, world):
    return make_event(db, world['admin'].id).id


def test_accepting_checks_the_terms_and_the_time(client, world, clock):
    http, db = client
    match = combining(db, world)
    other = combining(db, world)
    created = propose(http, world, match).json()['terms']['pending']['id']
    assert accept(http, world, match, 999999).status_code == 404
    assert accept(http, world, other, created).status_code == 404         # terms of another match
    assert accept(http, world, match, created, 'stranger').status_code == 404
    clock['now'] = NOW + 2 * DAY + HOUR                                    # the proposed time has passed
    late = accept(http, world, match, created)
    assert (late.status_code, late.json()['detail']) == (409, 'O horário proposto já passou. Proponha outro.')
    assert db.scalar(select(Match.state).where(Match.id == match.id)) == 'combinando'


def test_accepting_after_the_agreed_match_started_is_refused(client, world, clock):
    http, db = client
    match = agreed_match(db, world, starts_at=NOW + DAY)
    later = MatchTerms(match_id=match.id, proposed_by_id=world['rep_a'].id, proposed_by_side='a',
                       starts_at=NOW + 4 * DAY, court_id=world['court'].id, booking_side='a', state='pendente',
                       accepted_a_at=NOW, created_at=NOW)
    db.add(later)
    db.flush()
    clock['now'] = NOW + 2 * DAY                                           # the agreed time has passed
    response = accept(http, world, match, later.id)
    assert (response.status_code, response.json()['detail']) == (
        409, 'As condições só mudam enquanto a partida está sendo combinada ou antes do início.')


# ----- Booking --------------------------------------------------------------------------------------------------

def test_booking_is_recorded_by_the_side_that_books(client, world, clock):
    http, db = client
    match = agreed_match(db, world)
    url = f'{API}/matches/{match.id}/booking'
    refused = http.put(url, json={'confirmed': True}, headers=world['h']['rep_b'])
    assert (refused.status_code, refused.json()['detail']) == (403, 'Só quem reserva confirma a reserva.')
    assert http.put(url, json={'confirmed': True}, headers=world['h']['member_a']).status_code == 403

    first = http.put(url, json={'confirmed': True}, headers=world['h']['rep_a'])
    assert first.status_code == 200 and first.json()['booking']['state'] == 'confirmada'
    db.refresh(match)
    assert match.booking_confirmed_by_id == world['rep_a'].id
    # Repeating the same state writes no second banner; undoing it goes back to "a confirmar".
    assert http.put(url, json={'confirmed': True}, headers=world['h']['rep_a']).status_code == 200
    assert len(events_of(db, match, 'reserva_atualizada')) == 1
    undone = http.put(url, json={'confirmed': False}, headers=world['h']['rep_a'])
    assert undone.json()['booking'] == {'side': 'a', 'state': 'a_confirmar', 'confirmed_at': None}
    assert len(events_of(db, match, 'reserva_atualizada')) == 2
    assert [a.data['confirmed'] for a in audit_actions(db, 'partida.reserva_atualizada')] == [True, False]

    clock['now'] = NOW + 3 * DAY + HOUR                                    # after the start
    late = http.put(url, json={'confirmed': True}, headers=world['h']['rep_a'])
    assert (late.status_code, late.json()['detail']) == (
        409, 'A reserva só muda com a partida agendada e antes do início.')
    combining_match = combining(db, world)
    combining_match.booking_side = 'a'
    early = http.put(f'{API}/matches/{combining_match.id}/booking', json={'confirmed': True},
                     headers=world['h']['rep_a'])
    assert early.status_code == 409
    assert http.put(url, json={}, headers=world['h']['rep_a']).status_code == 422


# ----- Cancellation ---------------------------------------------------------------------------------------------

def cancel(http, world, match, who='rep_b', **body):
    return http.post(f'{API}/matches/{match.id}/cancel', json=body, headers=world['h'][who])


def test_a_representative_cancels_until_24_hours_before(client, world, clock):
    http, db = client
    start = NOW + 3 * DAY
    match = agreed_match(db, world, starts_at=start)
    fill_slot(db, match, world['guest'])
    pending = propose(http, world, match, 'rep_b', starts_at=start + HOUR, booking_side='b').json()
    assert pending['terms']['pending'] is not None

    assert cancel(http, world, match, 'member_a').status_code == 403
    assert cancel(http, world, match, 'guest').status_code == 403
    assert cancel(http, world, match, 'stranger').status_code == 404
    response = cancel(http, world, match, reason='  Chuva forte na quadra  ')
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body['state'], body['phase'], body['cancellation']['reason']) == ('cancelada', 'cancelada',
                                                                              'Chuva forte na quadra')
    assert body['cancellation']['by']['id'] == world['rep_b'].id and body['terms']['pending'] is None
    db.refresh(match)
    assert match.closed_at is not None and match.cancelled_by_id == world['rep_b'].id
    assert db.scalar(select(MatchTerms.state).where(MatchTerms.match_id == match.id).order_by(MatchTerms.id.desc())
                     .limit(1)) == 'cancelada'
    # The members of both sides and the scheduled walk-in are told (not who cancelled); the slots close.
    told = {n.user_id for n in notifications_of(db, 'partida_cancelada')}
    assert told == {world[name].id for name in ('rep_a', 'member_a', 'member_b', 'guest')}
    assert notifications_of(db, 'partida_cancelada')[0].payload['reason'] == 'Chuva forte na quadra'
    assert {slot.state for slot in db.scalars(select(MatchSlot).where(MatchSlot.match_id == match.id))} == {'fechada'}
    assert len(events_of(db, match, 'partida_cancelada')) == 1
    assert audit_actions(db, 'partida.cancelada')[0].data == {'reason': 'Chuva forte na quadra',
                                                              'guests': [world['guest'].id]}
    # Once cancelled, the chat stays readable for the sides and the walk-in loses access.
    assert http.get(f'{API}/matches/{match.id}/messages', headers=world['h']['rep_a']).status_code == 200
    assert http.get(f'{API}/matches/{match.id}', headers=world['h']['guest']).status_code == 404
    again = cancel(http, world, match)
    assert (again.status_code, again.json()['detail']) == (
        409, 'Só partidas combinando ou agendadas podem ser canceladas.')


def test_cancelling_less_than_24_hours_before_is_refused(client, world, clock):
    http, db = client
    start = NOW + 3 * DAY
    match = agreed_match(db, world, starts_at=start)
    clock['now'] = start - 24 * HOUR - MINUTE                              # 24 h and one minute before
    assert cancel(http, world, match).status_code == 200
    other = agreed_match(db, world, starts_at=start)
    clock['now'] = start - 24 * HOUR                                       # exactly 24 h: the window closed
    response = cancel(http, world, other)
    assert (response.status_code, response.json()['detail']) == (
        409, 'Faltam menos de 24 h para a partida. Quem não comparecer perde por W.O.')
    clock['now'] = start - 5 * HOUR
    assert cancel(http, world, other).status_code == 409
    assert db.scalar(select(Match.state).where(Match.id == other.id)) == 'agendada'


def test_a_match_being_arranged_cancels_at_any_time_and_returns_offers_to_the_queue(client, world, clock):
    http, db = client
    match = combining(db, world)
    response = cancel(http, world, match, 'rep_a')
    assert response.status_code == 200 and response.json()['cancellation']['reason'] is None

    scheduled = agreed_match(db, world)
    slot = fill_slot(db, scheduled, world['guest'], side='a', position='atacante')
    slot.state, slot.filled_by_id, slot.filled_at = 'oferecida', None, None
    search = walkin_search(world['stranger'], position='atacante', started_at=NOW - HOUR)
    search.state, search.slot_id, search.offer_expires_at = 'pareada', slot.id, NOW + HOUR
    db.add(search)
    db.flush()
    assert cancel(http, world, scheduled, 'rep_a').status_code == 200
    db.refresh(search)
    assert search.state == 'ativa' and search.slot_id is None                # the walk-in goes back to the queue
    db.refresh(slot)
    assert slot.state == 'fechada'
    assert db.get(MatchSearch, search.id) is search
    assert not [n for n in db.scalars(select(Notification).where(Notification.type == 'partida_cancelada',
                                                                 Notification.user_id == world['stranger'].id))]
    # ...and is told that the offer was withdrawn because the match was cancelled.
    told = notifications_of(db, 'oferta_retirada')
    assert [(item.user_id, item.actor_id) for item in told] == [(world['stranger'].id, world['rep_a'].id)]
    assert told[0].payload == {'match_id': scheduled.id, 'slot_id': slot.id, 'position': 'atacante',
                               'team_name': 'Ferrugem FC', 'reason': 'partida_cancelada', 'requeued': True}


def test_tennis_athletes_arrange_and_cancel_their_match(client, world, clock):
    http, db = client
    match = make_match(db, 'combinando', [world['tenista_a'], world['tenista_b']], sport='tenis')
    body = {'starts_at': (NOW + 5 * DAY).isoformat(), 'court_id': world['tennis_court'].id, 'booking_side': 'b'}
    created = http.post(f'{API}/matches/{match.id}/terms', json=body, headers=world['h']['tenista_a'])
    assert created.status_code == 201, created.text
    assert created.json()['terms']['pending']['super_tiebreak'] is False
    assert [n.user_id for n in notifications_of(db, 'condicoes_propostas')] == [world['tenista_b'].id]
    done = accept(http, world, match, created.json()['terms']['pending']['id'], 'tenista_b')
    assert done.status_code == 200 and done.json()['state'] == 'agendada' and done.json()['super_tiebreak'] is False
    assert done.json()['booking']['side'] == 'b'
    assert db.scalars(select(MatchSlot).where(MatchSlot.match_id == match.id)).all() == []
    booked = http.put(f'{API}/matches/{match.id}/booking', json={'confirmed': True}, headers=world['h']['tenista_b'])
    assert booked.status_code == 200 and booked.json()['booking']['state'] == 'confirmada'
    assert http.put(f'{API}/matches/{match.id}/booking', json={'confirmed': True},
                    headers=world['h']['tenista_a']).status_code == 403
    cancelled = cancel(http, world, match, 'tenista_a')
    assert cancelled.status_code == 200 and cancelled.json()['state'] == 'cancelada'
    assert cancel(http, world, match, 'tenista_b').status_code == 409

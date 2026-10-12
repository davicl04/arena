"""Quadras: catálogo por cidade, sugestão em revisão na partida e decisão da administração (RN07)."""
from sqlalchemy import select

from app.models.matches import Court, Match, MatchTerms
from tests.integration.entry_helpers import make_event
from tests.integration.match_helpers import OTHER_CITY, audit_actions, notifications_of
from tests.integration.partida.helpers import (
    API,
    DAY,
    NOW,
    agreed_match,
    events_of,
    make_court,
    make_match,
)

CITY = 5300108


def combining(db, world):
    return make_match(db, 'combinando', [world['team_a'], world['team_b']])


def catalog(http, world, who='rep_a', query=f'city_id={CITY}'):
    return http.get(f'{API}/courts?{query}', headers=world['h'][who])


def names(response):
    return [item['name'] for item in response.json()['items']]


def suggest(http, world, match, name='Quadra do Parque', who='rep_a', **fields):
    return http.post(f'{API}/courts/suggestions', json={'match_id': match.id, 'name': name, **fields},
                     headers=world['h'][who])


def propose(http, world, match, court, who='rep_a', days=2):
    return http.post(f'{API}/matches/{match.id}/terms', headers=world['h'][who], json={
        'starts_at': (NOW + days * DAY).isoformat(), 'court_id': court['id'] if isinstance(court, dict) else court.id,
        'booking_side': 'a'})


def decide(http, world, court_id, decision='publicar', who='admin', **fields):
    return http.post(f'{API}/admin/court-suggestions/{court_id}/decision', json={'decision': decision, **fields},
                     headers=world['h'][who])


def queue(http, world, state='em_revisao'):
    return http.get(f'{API}/admin/court-suggestions?state={state}', headers=world['h']['admin']).json()['items']


# ----- Catalog ----------------------------------------------------------------------------------------------------

def test_the_catalog_lists_only_published_courts_of_the_city(client, world, clock):
    http, db = client
    empty = catalog(http, world, query=f'city_id={OTHER_CITY}')
    assert empty.status_code == 200 and empty.json() == {'items': []}
    assert catalog(http, world, query='city_id=1').json() == {'items': []}               # a city that does not exist
    make_court(db, 'Ginásio Árena', kind='futsal', address='Asa Sul')
    make_court(db, 'Quadra Paulista', city_id=OTHER_CITY)
    make_court(db, 'Quadra Recusada', state='rejeitada')
    make_court(db, 'Sugerida por outro', state='em_revisao', suggested_by=world['rep_b'])

    response = catalog(http, world)
    assert names(response) == ['Ginásio Árena', 'Quadra Central', 'Saibro Norte']
    first = response.json()['items'][0]
    assert (first['kind'], first['address'], first['state'], first['provisional'], first['city']['id']) == (
        'futsal', 'Asa Sul', 'publicada', False, CITY)
    assert names(catalog(http, world, query=f'city_id={CITY}&kind=society')) == ['Quadra Central']
    assert names(catalog(http, world, query=f'city_id={CITY}&q=GINASIO')) == ['Ginásio Árena']
    assert names(catalog(http, world, query=f'city_id={CITY}&q=ár')) == ['Ginásio Árena']
    assert names(catalog(http, world, query=f'city_id={CITY}&q=central')) == ['Quadra Central']
    assert names(catalog(http, world, query=f'city_id={CITY}&q=xyz')) == []
    assert names(catalog(http, world, query=f'city_id={OTHER_CITY}')) == ['Quadra Paulista']
    assert names(catalog(http, world, 'stranger')) == ['Ginásio Árena', 'Quadra Central', 'Saibro Norte']
    assert catalog(http, world, query='').status_code == 422
    assert catalog(http, world, query=f'city_id={CITY}&kind=basquete').status_code == 422
    assert http.get(f'{API}/courts?city_id={CITY}').status_code == 401


def test_the_suggestions_of_a_match_come_first_for_its_participants(client, world, clock):
    http, db = client
    match = combining(db, world)
    other = combining(db, world)
    mine = make_court(db, 'Quadra do Parque', state='em_revisao', suggested_by=world['rep_a'], origin=match)
    make_court(db, 'Quadra do Vizinho', state='em_revisao', suggested_by=world['rep_b'], origin=other)
    response = catalog(http, world, query=f'city_id={CITY}&match_id={match.id}')
    assert names(response) == ['Quadra do Parque', 'Quadra Central', 'Saibro Norte']
    first = response.json()['items'][0]
    assert (first['id'], first['state'], first['provisional']) == (mine.id, 'em_revisao', True)
    assert names(catalog(http, world, 'member_b', f'city_id={CITY}&match_id={match.id}'))[0] == 'Quadra do Parque'
    assert names(catalog(http, world)) == ['Quadra Central', 'Saibro Norte']
    hidden = catalog(http, world, 'stranger', f'city_id={CITY}&match_id={match.id}')
    assert (hidden.status_code, hidden.json()['detail']) == (404, 'Partida não encontrada.')
    assert names(catalog(http, world, query=f'city_id={CITY}&match_id={match.id}&q=parque')) == ['Quadra do Parque']


# ----- Suggesting -------------------------------------------------------------------------------------------------

def test_a_representative_suggests_a_court_that_is_only_valid_in_the_match(client, world, clock):
    http, db = client
    match = combining(db, world)
    other = combining(db, world)
    created = suggest(http, world, match, '  Quadra   do   Parque ', address=' SQN 100 ')
    assert created.status_code == 201, created.text
    body = created.json()
    court = body['court']
    assert body['existing'] is False
    assert (court['name'], court['address'], court['kind'], court['state'], court['provisional']) == (
        'Quadra do Parque', 'SQN 100', 'society', 'em_revisao', True)
    row = db.get(Court, court['id'])
    assert (row.origin_match_id, row.suggested_by_id, row.name_key, row.city_id) == (
        match.id, world['rep_a'].id, 'quadra do parque', CITY)
    assert len(events_of(db, match, 'quadra_sugerida')) == 1
    assert audit_actions(db, 'quadra.sugerida')[0].data == {'match_id': match.id, 'kind': 'society'}

    # The same suggestion again (other case, accents) returns the one already made, and so does a published name.
    again = suggest(http, world, match, 'QUADRA DO PARQUE', who='rep_b')
    assert again.status_code == 200 and (again.json()['existing'], again.json()['court']['id']) == (True, row.id)
    published = suggest(http, world, match, 'quadra  CENTRAL')
    assert published.status_code == 200 and published.json()['existing'] is True
    assert published.json()['court']['state'] == 'publicada'
    assert db.scalars(select(Court).where(Court.origin_match_id == match.id)).all() == [row]

    # Only the match that suggested it can use the court, and only until the review.
    refused = propose(http, world, other, court)
    assert (refused.status_code, refused.json()['detail']) == (
        422, 'Escolha uma quadra do catálogo da cidade ou a sugerida nesta partida.')
    used = propose(http, world, match, court)
    assert used.status_code == 201 and used.json()['terms']['pending']['court']['provisional'] is True
    agreed = http.put(f"{API}/matches/{match.id}/terms/{used.json()['terms']['pending']['id']}/accept", json={},
                      headers=world['h']['rep_b'])
    assert agreed.status_code == 200 and agreed.json()['state'] == 'agendada'
    assert agreed.json()['court']['state'] == 'em_revisao' and agreed.json()['court']['provisional'] is True


def test_suggestion_rules(client, world, clock):
    http, db = client
    match = combining(db, world)
    assert suggest(http, world, match, who='member_a').json()['detail'] == 'Só os representantes sugerem quadras.'
    assert suggest(http, world, match, who='stranger').status_code == 404
    assert suggest(http, world, match, who='admin').status_code == 403
    short = suggest(http, world, match, 'A')
    assert (short.status_code, short.json()['detail']) == (422, 'O nome da quadra precisa ter de 2 a 80 caracteres.')
    assert short.json()['fields'][0]['field'] == 'name'
    assert suggest(http, world, match, '!!!').status_code == 422
    assert suggest(http, world, match, 'x' * 121).status_code == 422
    wrong = suggest(http, world, match, kind='tenis')
    assert (wrong.status_code, wrong.json()['detail']) == (422, 'A quadra sugerida precisa ser de society.')
    assert suggest(http, world, match, 'Quadra A', kind='society').status_code == 201
    assert suggest(http, world, match, 'Quadra B').status_code == 201
    assert suggest(http, world, match, 'Quadra C').status_code == 201
    limit = suggest(http, world, match, 'Quadra D')
    assert (limit.status_code, limit.json()['detail']) == (409, 'Esta partida já tem 3 sugestões de quadra em revisão.')
    assert suggest(http, world, match, 'Quadra A').status_code == 200            # an existing one is still returned

    for state in ('proposta', 'cancelada', 'recusada'):
        closed = make_match(db, state, [world['team_a'], world['team_b']])
        response = suggest(http, world, closed)
        assert response.status_code == 409, state
    championship = make_match(db, 'combinando', [world['team_a'], world['team_b']], origin='campeonato',
                              event_id=_event(db, world), round_number=1, bracket_position=1)
    assert suggest(http, world, championship).json()['detail'] == (
        'Num campeonato, o organizador define data, horário e quadra.')
    tennis = make_match(db, 'combinando', [world['tenista_a'], world['tenista_b']], sport='tenis')
    created = suggest(http, world, tennis, 'Saibro Leste', who='tenista_a')
    assert created.status_code == 201 and created.json()['court']['kind'] == 'tenis'


def _event(db, world):
    return make_event(db, world['admin'].id).id


# ----- Administration ---------------------------------------------------------------------------------------------

def test_the_queue_shows_suggestions_oldest_first_with_possible_duplicates(client, world, clock):
    http, db = client
    first = combining(db, world)
    second = combining(db, world)
    older = make_court(db, 'Quadra Central Sul', state='em_revisao', suggested_by=world['rep_a'], origin=first)
    older.created_at = NOW - 2 * DAY
    newer = make_court(db, 'Parque', state='em_revisao', suggested_by=world['rep_b'], origin=second)
    make_court(db, 'Central', kind='futsal')                           # same words, other kind: not a duplicate
    db.flush()

    items = queue(http, world)
    assert [item['court']['id'] for item in items] == [older.id, newer.id]
    row = items[0]
    assert [court['name'] for court in row['possible_duplicates']] == ['Quadra Central']
    assert (row['suggested_by']['id'], row['origin_match']['id'], row['origin_match']['state'],
            row['reviewed_at'], row['duplicate_of']) == (world['rep_a'].id, first.id, 'combinando', None, None)
    assert items[1]['possible_duplicates'] == []
    assert queue(http, world, 'decididas') == []
    page = http.get(f'{API}/admin/court-suggestions?limit=1', headers=world['h']['admin']).json()
    assert len(page['items']) == 1 and page['next_cursor'] is not None
    assert http.get(f'{API}/admin/court-suggestions', headers=world['h']['rep_a']).status_code == 403
    assert http.get(f'{API}/admin/court-suggestions?state=todas', headers=world['h']['admin']).status_code == 422
    assert http.get(f'{API}/admin/queue-counts', headers=world['h']['admin']).json()['court_suggestions'] == 2


def test_publishing_a_suggestion_puts_it_in_the_catalog(client, world, clock):
    http, db = client
    match = combining(db, world)
    court = suggest(http, world, match, 'Quadra do parque').json()['court']
    terms = propose(http, world, match, court)
    assert terms.status_code == 201

    response = decide(http, world, court['id'], 'publicar', name='Quadra do Parque Norte', address=' SQN 100 ',
                      reason='Conferida')
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body['court']['name'], body['court']['address'], body['court']['state'], body['court']['provisional']) == (
        'Quadra do Parque Norte', 'SQN 100', 'publicada', False)
    assert (body['review_reason'], body['reviewed_at'] is not None, body['possible_duplicates']) == (
        'Conferida', True, [])
    row = db.get(Court, court['id'])
    assert (row.name_key, row.published_at is not None, row.reviewed_by_id) == (
        'quadra do parque norte', True, world['admin'].id)
    told = notifications_of(db, 'quadra_decidida')
    assert [(n.user_id, n.payload['decision'], n.payload['court_name']) for n in told] == [
        (world['rep_a'].id, 'publicada', 'Quadra do Parque Norte')]
    assert told[0].actor_id is None
    assert audit_actions(db, 'quadra.publicada')[0].data['match_id'] == match.id
    assert 'Quadra do Parque Norte' in names(catalog(http, world, 'stranger'))
    assert [item['court']['id'] for item in queue(http, world, 'decididas')] == [court['id']]
    assert queue(http, world) == []
    assert http.get(f'{API}/admin/queue-counts', headers=world['h']['admin']).json()['court_suggestions'] == 0
    # The pending terms keep the court, now published, and the other match can use it too.
    pending = http.get(f'{API}/matches/{match.id}', headers=world['h']['rep_b']).json()['terms']['pending']
    assert pending['court']['state'] == 'publicada'
    assert propose(http, world, combining(db, world), court, 'rep_b').status_code == 201

    again = decide(http, world, court['id'], 'rejeitar', reason='Tarde demais')
    assert (again.status_code, again.json()['detail']) == (409, 'Esta sugestão já foi decidida.')
    assert decide(http, world, 99999999).status_code == 404


def test_publishing_checks_names_and_roles(client, world, clock):
    http, db = client
    first, second = combining(db, world), combining(db, world)
    one = suggest(http, world, first, 'Arena Norte').json()['court']
    two = suggest(http, world, second, 'arena  norte', who='rep_b').json()['court']
    assert one['id'] != two['id']
    assert decide(http, world, one['id'], who='rep_a').status_code == 403
    assert decide(http, world, one['id'], 'publicar', duplicate_of_id=one['id']).status_code == 422
    short = decide(http, world, one['id'], 'publicar', reason='ok')
    assert (short.status_code, short.json()['fields'][0]['field']) == (422, 'reason')
    assert decide(http, world, one['id'], 'publicar', name='x').status_code == 422
    assert decide(http, world, one['id']).status_code == 200
    clash = decide(http, world, two['id'])
    assert (clash.status_code, clash.json()['detail']) == (
        409, 'Já existe uma quadra publicada com este nome nesta cidade. Rejeite como duplicada.')
    assert db.get(Court, two['id']).state == 'em_revisao'
    corrected = decide(http, world, two['id'], name='Quadra Central')
    assert corrected.status_code == 409
    # The duplicate is rejected pointing at the published court.
    rejected = decide(http, world, two['id'], 'rejeitar', duplicate_of_id=one['id'])
    assert rejected.status_code == 200 and rejected.json()['duplicate_of']['id'] == one['id']


def test_rejecting_a_suggestion_cancels_the_pending_terms_and_keeps_the_agreed_court(client, world, clock):
    http, db = client
    pending_match = combining(db, world)
    asked = suggest(http, world, pending_match, 'Quadra Fantasma').json()['court']
    assert propose(http, world, pending_match, asked).status_code == 201

    agreed = agreed_match(db, world, starts_at=NOW + 4 * DAY)
    agreed_court = make_court(db, 'Quadra Provisória', state='em_revisao', suggested_by=world['rep_a'], origin=agreed)
    agreed.court_id = agreed_court.id
    db.query(MatchTerms).filter(MatchTerms.match_id == agreed.id).update({'court_id': agreed_court.id})
    db.flush()

    for court_id in (asked['id'], agreed_court.id):
        short = decide(http, world, court_id, 'rejeitar', reason='  nao ')
        assert (short.status_code, short.json()['detail']) == (422, 'Descreva o motivo da recusa.')
        assert decide(http, world, court_id, 'rejeitar').status_code == 422
    done = decide(http, world, asked['id'], 'rejeitar', reason='  Quadra inexistente no endereço.  ')
    assert done.status_code == 200, done.text
    assert (done.json()['court']['state'], done.json()['review_reason'], done.json()['duplicate_of']) == (
        'rejeitada', 'Quadra inexistente no endereço.', None)
    assert db.query(MatchTerms.state).filter(MatchTerms.match_id == pending_match.id).scalar() == 'cancelada'
    detail = http.get(f'{API}/matches/{pending_match.id}', headers=world['h']['rep_a']).json()
    assert detail['terms']['pending'] is None and detail['state'] == 'combinando'
    told = [n for n in notifications_of(db, 'quadra_decidida') if n.payload['decision'] == 'rejeitada']
    assert told[0].payload['reason'] == 'Quadra inexistente no endereço.' and 'duplicate_of_id' not in told[0].payload
    assert len(events_of(db, pending_match, 'quadra_sugerida')) == 2
    # A rejected court can no longer be chosen in a new proposal.
    assert propose(http, world, pending_match, asked).status_code == 422

    # The agreed match keeps the court it agreed on; the clients show it as a refused suggestion.
    assert decide(http, world, agreed_court.id, 'rejeitar', reason='Sem cadastro no local.').status_code == 200
    kept = http.get(f'{API}/matches/{agreed.id}', headers=world['h']['rep_a']).json()
    assert (kept['state'], kept['court']['id'], kept['court']['state'], kept['court']['provisional']) == (
        'agendada', agreed_court.id, 'rejeitada', False)
    assert kept['terms']['current']['court']['id'] == agreed_court.id


def test_rejecting_as_a_duplicate_moves_the_match_to_the_published_court(client, world, clock):
    http, db = client
    start = NOW + 4 * DAY
    agreed = agreed_match(db, world, starts_at=start)
    suggestion = make_court(db, 'Quadra  central ', state='em_revisao', suggested_by=world['rep_b'], origin=agreed)
    suggestion.name = 'Quadra Centro'
    suggestion.name_key = 'quadra centro'
    agreed.court_id = suggestion.id
    db.query(MatchTerms).filter(MatchTerms.match_id == agreed.id).update({'court_id': suggestion.id})
    db.add(MatchTerms(match_id=agreed.id, proposed_by_id=world['rep_b'].id, proposed_by_side='b',
                                starts_at=start + DAY, court_id=suggestion.id, booking_side='b', state='pendente',
                                accepted_b_at=NOW, created_at=NOW))
    db.flush()
    other_kind = world['tennis_court']
    other_city = make_court(db, 'Quadra Paulista', city_id=OTHER_CITY)
    unpublished = make_court(db, 'Quadra Recusada', state='rejeitada')

    for bad in (other_kind, other_city, unpublished, suggestion):
        response = decide(http, world, suggestion.id, 'rejeitar', duplicate_of_id=bad.id)
        assert (response.status_code, response.json()['detail']) == (
            422, 'Escolha uma quadra publicada da mesma cidade e tipo.'), bad.name
    response = decide(http, world, suggestion.id, 'rejeitar', duplicate_of_id=world['court'].id)
    assert response.status_code == 200, response.text
    assert response.json()['duplicate_of']['name'] == 'Quadra Central' and response.json()['review_reason'] is None
    detail = http.get(f'{API}/matches/{agreed.id}', headers=world['h']['rep_a']).json()
    assert detail['court']['id'] == world['court'].id and detail['terms']['current']['court']['id'] == world['court'].id
    assert detail['terms']['pending']['court']['id'] == world['court'].id
    assert detail['state'] == 'agendada' and detail['terms']['pending']['state'] == 'pendente'
    assert db.scalar(select(Match.court_id).where(Match.id == agreed.id)) == world['court'].id
    payload = notifications_of(db, 'quadra_decidida')[0].payload
    assert (payload['decision'], payload['duplicate_of_id']) == ('rejeitada', world['court'].id)
    assert [item['court']['id'] for item in queue(http, world, 'decididas')] == [suggestion.id]
    assert queue(http, world, 'decididas')[0]['court']['state'] == 'rejeitada'

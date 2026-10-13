"""Search, pairing, proposals and the Jogar board through the API on PostgreSQL (Jogar, fase 2; etapa 3)."""
import uuid
from datetime import timedelta

from sqlalchemy import select

from app.models.identity import utcnow
from app.models.matches import Match, MatchMessage, MatchSearch, MatchSide
from app.models.teams import Team
from tests.integration.match_helpers import audit_actions, make_standing, scheduled_match
from tests.integration.team_helpers import (
    CITY,
    create_team,
    join_by_invite,
    notifications,
    register,
    set_position,
)

SEARCHES = '/api/v1/matchmaking/searches'
SAO_PAULO = 3550308


def athlete(http, label, *, position='atacante'):
    headers, user_id = register(http, f'{label}-{uuid.uuid4().hex[:8]}@example.com', f'Atleta {label}')
    if position:
        set_position(http, headers, position)
    return headers, user_id


def squad(http, label, *, name=None):
    """A representative with a football profile and a team of the Brasília catalog city."""
    headers, user_id = athlete(http, label)
    team = create_team(http, headers, name or f'Time {label}')
    return headers, user_id, team['id']


def team_body(team_id, **extra):
    return {'sport': 'futebol', 'team_id': team_id, 'format': 'society', **extra}


def search(http, headers, body):
    return http.post(SEARCHES, json=body, headers=headers)


def play(http, headers):
    response = http.get('/api/v1/me/play', headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def pair(http, first, second):
    """Two team searches of the same bucket: the second one closes the proposal. Returns (match_id, response)."""
    assert search(http, first[0], team_body(first[2])).status_code == 201
    response = search(http, second[0], team_body(second[2]))
    assert response.status_code == 201, response.text
    return response.json()['proposal']['match_id'], response


def accept(http, headers, match_id):
    return http.put(f'/api/v1/matches/{match_id}/accept', json={}, headers=headers)


def decline(http, headers, match_id):
    return http.put(f'/api/v1/matches/{match_id}/decline', json={}, headers=headers)


def search_row(db, search_id):
    db.expire_all()
    return db.get(MatchSearch, search_id)


# ----- Creating searches -------------------------------------------------------------------------------------

def test_team_search_is_created_for_the_representative(client):
    http, db = client
    assert http.post(SEARCHES, json=team_body(1)).status_code == 401
    headers, rep_id, team_id = squad(http, 'rep')

    response = search(http, headers, team_body(team_id, open_slots={'goleiro': 1, 'atacante': 2}))
    assert response.status_code == 201, response.text
    body = response.json()
    created = body['search']
    assert (body['proposal'], body['offer']) == (None, None)
    assert (created['kind'], created['sport'], created['state'], created['format'], created['position']) == (
        'time', 'futebol', 'ativa', 'society', None)
    assert created['city'] == {'id': CITY, 'name': 'Brasília', 'state': 'DF'}
    assert created['team']['id'] == team_id and created['tier'] is None
    assert created['open_slots'] == {'goleiro': 1, 'defesa': 0, 'meio_campo': 0, 'atacante': 2}
    assert (created['match_id'], created['slot_id'], created['offer_expires_at'], created['can_cancel']) == (
        None, None, None, True)
    started, expires = created['started_at'], created['expires_at']
    assert started < expires

    row = db.get(MatchSearch, created['id'])
    assert (row.created_by_id, row.team_id, row.user_id, row.tier, row.state) == (rep_id, team_id, None, None, 'ativa')
    assert row.expires_at - row.started_at == timedelta(hours=24)
    [entry] = audit_actions(db, 'busca.criada')
    assert (entry.actor_id, entry.target_id, entry.data['kind'], entry.data['team_id']) == (
        rep_id, row.id, 'time', team_id)
    assert http.get('/api/v1/me/searches', headers=headers).json() == {'items': [created]}


def test_team_search_records_the_tier_at_the_time_of_the_search(client):
    http, db = client
    headers, _, team_id = squad(http, 'elo')
    make_standing(db, tier='ouro', team=db.get(Team, team_id), format_='society', rank=2)
    created = search(http, headers, team_body(team_id)).json()['search']
    assert created['tier'] == 'ouro'
    # Another format of the same team is still in placement: no tier is assigned.
    other = search(http, headers, team_body(team_id, format='futsal'))
    assert other.status_code == 200 and other.json()['search']['id'] == created['id']


def test_tennis_search_needs_the_profile_with_a_city(client):
    http, db = client
    headers, user_id = athlete(http, 'tenista', position=None)
    missing = search(http, headers, {'sport': 'tenis'})
    assert missing.status_code == 409
    assert missing.json()['detail'] == 'Complete seu perfil de tênis com a cidade para buscar partidas.'
    assert http.put('/api/v1/me/sports-profiles/tenis', json={'city_id': SAO_PAULO}, headers=headers).status_code == 200

    response = search(http, headers, {'sport': 'tenis'})
    assert response.status_code == 201, response.text
    created = response.json()['search']
    assert (created['kind'], created['sport'], created['team'], created['format'], created['open_slots']) == (
        'tenis', 'tenis', None, None, None)
    assert created['city']['id'] == SAO_PAULO and created['can_cancel'] is True
    row = db.get(MatchSearch, created['id'])
    assert (row.user_id, row.team_id, row.created_by_id) == (user_id, None, user_id)

    for extra in ({'team_id': 1}, {'format': 'society'}, {'position': 'goleiro'}, {'open_slots': {'goleiro': 1}}):
        invalid = search(http, headers, {'sport': 'tenis', **extra})
        assert invalid.status_code == 422
        assert invalid.json()['detail'] == 'Busca de tênis não tem time, formato nem posição.'
        assert invalid.json()['fields'][0]['field'] == next(iter(extra))


def test_walkin_search_takes_the_football_profile(client):
    http, db = client
    headers, user_id = athlete(http, 'avulso', position=None)
    missing = search(http, headers, {'sport': 'futebol'})
    assert missing.status_code == 409
    assert missing.json()['detail'] == 'Complete seu perfil de futebol com a cidade para buscar vaga.'
    set_position(http, headers, 'meio_campo')

    any_position = search(http, headers, {'sport': 'futebol'})
    assert any_position.status_code == 201
    created = any_position.json()['search']
    assert (created['kind'], created['position'], created['format'], created['team'], created['tier']) == (
        'avulso', None, None, None, None)
    assert created['open_slots'] is None and created['city']['id'] == CITY
    assert http.delete(f"{SEARCHES}/{created['id']}", headers=headers).status_code == 204

    specific = search(http, headers, {'sport': 'futebol', 'position': 'goleiro'})
    assert specific.status_code == 201 and specific.json()['search']['position'] == 'goleiro'
    assert db.get(MatchSearch, specific.json()['search']['id']).user_id == user_id


def test_invalid_bodies_and_team_access(client):
    http, db = client
    headers, _, team_id = squad(http, 'valida')
    member, member_id = athlete(http, 'membro')
    join_by_invite(http, headers, team_id, member, member_id)
    stranger, _ = athlete(http, 'fora')

    def refused(who, body, status, detail, field=None):
        response = search(http, who, body)
        assert response.status_code == status, response.text
        assert response.json()['detail'] == detail
        if field:
            assert response.json()['fields'] == [{'field': field, 'message': detail}]

    refused(headers, {'sport': 'futebol', 'team_id': team_id}, 422, 'Escolha o formato da partida.', 'format')
    refused(headers, team_body(team_id, position='goleiro'), 422, 'A posição é só da busca de avulso.', 'position')
    refused(headers, {'sport': 'futebol', 'format': 'society'}, 422, 'O avulso aceita qualquer formato.', 'format')
    refused(headers, {'sport': 'futebol', 'open_slots': {'goleiro': 1}}, 422, 'O avulso aceita qualquer formato.',
            'open_slots')
    refused(headers, team_body(team_id, open_slots={'goleiro': 2}), 422, 'No máximo uma vaga de goleiro.',
            'open_slots')
    refused(headers, team_body(team_id, open_slots={'defesa': 7}), 422, 'No society cabem até 6 vagas para avulsos.',
            'open_slots')
    refused(headers, team_body(team_id, format='futsal', open_slots={'defesa': 5}), 422,
            'No futsal cabem até 4 vagas para avulsos.', 'open_slots')
    refused(headers, team_body(team_id, team_complete=True, open_slots={'defesa': 1}), 422,
            'Com o time completo, não há vagas para avulsos.', 'open_slots')
    refused(headers, team_body(team_id, open_slots={'lateral': 1}), 422, 'Revise os campos informados.')
    refused(headers, team_body(team_id, extra=1), 422, 'Revise os campos informados.')
    refused(headers, team_body(team_id, format='tenis'), 422, 'Revise os campos informados.')
    refused(headers, team_body(team_id, open_slots={'defesa': -1}), 422,
            'Informe as vagas com números inteiros a partir de zero.', 'open_slots')

    refused(member, team_body(team_id), 403, 'Só representantes buscam partida para o time.')
    refused(stranger, team_body(team_id), 404, 'Time não encontrado.')
    refused(headers, team_body(999999), 404, 'Time não encontrado.')
    assert db.scalars(select(MatchSearch)).all() == []
    complete = search(http, headers, team_body(team_id, team_complete=True))
    assert complete.status_code == 201 and complete.json()['search']['open_slots'] == {
        'goleiro': 0, 'defesa': 0, 'meio_campo': 0, 'atacante': 0}


def test_closed_team_cannot_search(client):
    http, _ = client
    headers, _, team_id = squad(http, 'encerrado')
    assert http.post(f'/api/v1/teams/{team_id}/close', json={}, headers=headers).status_code == 204
    assert search(http, headers, team_body(team_id)).status_code == 404


def test_a_second_search_returns_the_open_one(client):
    http, db = client
    headers, _, team_id = squad(http, 'repete')
    first = search(http, headers, team_body(team_id))
    again = search(http, headers, team_body(team_id, format='futsal', open_slots={'defesa': 1}))
    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json()['search']['id'] == first.json()['search']['id']
    assert again.json()['search']['format'] == 'society'
    assert len(db.scalars(select(MatchSearch)).all()) == 1
    assert len(audit_actions(db, 'busca.criada')) == 1


# ----- Pairing -------------------------------------------------------------------------------------------------

def test_two_compatible_searches_form_a_proposal(client):
    http, db = client
    first, second = squad(http, 'a'), squad(http, 'b')
    waiting = search(http, first[0], team_body(first[2], open_slots={'atacante': 1}))
    assert waiting.status_code == 201 and waiting.json()['proposal'] is None

    response = search(http, second[0], team_body(second[2]))
    assert response.status_code == 201, response.text
    body = response.json()
    proposal = body['proposal']
    assert body['search']['state'] == 'pareada' and body['search']['match_id'] == proposal['match_id']
    assert body['search']['can_cancel'] is False
    assert (proposal['state'], proposal['sport'], proposal['format'], proposal['city']['id']) == (
        'proposta', 'futebol', 'society', CITY)
    assert (proposal['my_side'], proposal['my_role'], proposal['can_respond']) == ('b', 'representante', True)
    assert [(side['side'], side['kind'], side['team']['id'], side['is_mine'], side['accepted_at'], side['tier'])
            for side in proposal['sides']] == [('a', 'time', first[2], False, None, None),
                                               ('b', 'time', second[2], True, None, None)]
    match = db.get(Match, proposal['match_id'])
    assert match.state == 'proposta' and match.proposal_expires_at - match.created_at == timedelta(hours=2)
    assert proposal['expires_at'] == match.proposal_expires_at.isoformat().replace('+00:00', 'Z')

    # The first team's search is now held by the proposal; both representatives were notified.
    held = http.get('/api/v1/me/searches', headers=first[0]).json()['items']
    assert [(item['state'], item['match_id'], item['can_cancel']) for item in held] == [
        ('pareada', match.id, False)]
    mine = held[0]['id']
    for headers, opponent in ((first[0], 'Time b'), (second[0], 'Time a')):
        [sent] = notifications(http, headers, 'proposta_partida')
        assert sent['payload']['match_id'] == match.id and sent['payload']['opponent_name'] == opponent
        listed = http.get('/api/v1/me/proposals', headers=headers).json()['items']
        assert [item['match_id'] for item in listed] == [match.id]
    own = http.get('/api/v1/me/proposals', headers=first[0]).json()['items'][0]
    assert (own['my_side'], own['can_respond']) == ('a', True)
    # A resubmission while held by the proposal returns the same search with its proposal.
    again = search(http, first[0], team_body(first[2]))
    assert again.status_code == 200 and again.json()['search']['id'] == mine and again.json()['proposal'] == own
    assert len(audit_actions(db, 'partida.proposta_criada')) == 1


def test_neighbouring_tiers_pair_and_distant_ones_do_not(client):
    http, db = client
    gold, silver, bronze = squad(http, 'ouro'), squad(http, 'prata'), squad(http, 'bronze')
    for member, tier in ((gold, 'ouro'), (silver, 'prata'), (bronze, 'bronze')):
        make_standing(db, tier=tier, team=db.get(Team, member[2]), format_='society', rank=1)
    assert search(http, gold[0], team_body(gold[2])).json()['search']['tier'] == 'ouro'
    # Bronze does not face Ouro: the search keeps waiting.
    far = search(http, bronze[0], team_body(bronze[2])).json()
    assert far['proposal'] is None and far['search']['tier'] == 'bronze'
    # Prata is the neighbour of both; the oldest search among equals goes first (Ouro).
    near = search(http, silver[0], team_body(silver[2])).json()
    assert near['proposal']['sides'][0]['team']['id'] == gold[2]
    assert [side['tier'] for side in near['proposal']['sides']] == ['ouro', 'prata']
    assert play(http, bronze[0])['searches'][0]['state'] == 'ativa'


def test_different_format_or_city_does_not_pair(client):
    http, db = client
    first, second, third = squad(http, 'f1'), squad(http, 'f2'), squad(http, 'f3')
    assert search(http, first[0], team_body(first[2])).status_code == 201
    futsal = search(http, second[0], team_body(second[2], format='futsal'))
    assert futsal.status_code == 201 and futsal.json()['proposal'] is None
    # A team of another city never pairs with the waiting ones.
    assert http.patch(f'/api/v1/teams/{third[2]}', json={'city_id': SAO_PAULO}, headers=third[0]).status_code == 200
    other_city = search(http, third[0], team_body(third[2]))
    assert other_city.status_code == 201 and other_city.json()['proposal'] is None
    assert {row.state for row in db.scalars(select(MatchSearch))} == {'ativa'}
    assert db.scalars(select(Match)).all() == []


def test_tennis_searches_pair_in_the_same_city(client):
    http, db = client
    players = []
    for label in ('t1', 't2'):
        headers, user_id = athlete(http, label, position=None)
        assert http.put('/api/v1/me/sports-profiles/tenis', json={'city_id': CITY}, headers=headers).status_code == 200
        players.append((headers, user_id))
    assert search(http, players[0][0], {'sport': 'tenis'}).json()['proposal'] is None
    proposal = search(http, players[1][0], {'sport': 'tenis'}).json()['proposal']
    assert (proposal['sport'], proposal['format'], proposal['my_role'], proposal['can_respond']) == (
        'tenis', None, 'atleta', True)
    assert [(side['kind'], side['athlete']['id']) for side in proposal['sides']] == [
        ('atleta', players[0][1]), ('atleta', players[1][1])]
    both = accept(http, players[0][0], proposal['match_id'])
    assert both.status_code == 200 and both.json()['state'] == 'proposta'
    done = accept(http, players[1][0], proposal['match_id'])
    assert done.status_code == 200 and done.json()['state'] == 'combinando'


def test_representatives_in_common_are_never_paired(client):
    http, _ = client
    headers, user_id = athlete(http, 'duplo')
    first = create_team(http, headers, 'Primeiro Time')
    second = create_team(http, headers, 'Segundo Time')
    assert search(http, headers, team_body(first['id'])).status_code == 201
    other = search(http, headers, team_body(second['id']))
    assert other.status_code == 201 and other.json()['proposal'] is None
    assert [item['state'] for item in http.get('/api/v1/me/searches', headers=headers).json()['items']] == [
        'ativa', 'ativa']


# ----- Accepting and declining -----------------------------------------------------------------------------

def test_both_sides_accepting_leads_to_combinando(client):
    http, db = client
    first, second = squad(http, 'ac1'), squad(http, 'ac2')
    member, member_id = athlete(http, 'torcedor')
    join_by_invite(http, second[0], second[2], member, member_id)
    match_id, _ = pair(http, first, second)

    assert accept(http, member, match_id).status_code == 403
    assert accept(http, member, match_id).json()['detail'] == 'Só os representantes aceitam.'
    stranger, _ = athlete(http, 'estranho')
    assert accept(http, stranger, match_id).status_code == 404
    assert accept(http, first[0], 999999).status_code == 404

    waiting = accept(http, first[0], match_id)
    assert waiting.status_code == 200, waiting.text
    assert waiting.json()['state'] == 'proposta' and waiting.json()['can_respond'] is False
    assert [side['accepted_at'] is not None for side in waiting.json()['sides']] == [True, False]
    # Idempotent for the side that already accepted: no second notification or audit entry.
    assert accept(http, first[0], match_id).status_code == 200
    [heard] = notifications(http, second[0], 'proposta_aceita')
    assert heard['payload'] == {'match_id': match_id, 'opponent_name': 'Time ac1', 'complete': False}
    assert len(audit_actions(db, 'partida.proposta_aceita')) == 1
    assert db.get(Match, match_id).state == 'proposta'

    done = accept(http, second[0], match_id)
    assert done.status_code == 200 and done.json()['state'] == 'combinando'
    assert done.json()['can_respond'] is False
    assert db.get(Match, match_id).state == 'combinando'
    assert {row.state for row in db.scalars(select(MatchSearch))} == {'concluida'}
    assert {row.ended_at is not None for row in db.scalars(select(MatchSearch))} == {True}
    banner = db.scalar(select(MatchMessage).where(MatchMessage.match_id == match_id))
    assert (banner.kind, banner.event_type) == ('evento', 'partida_combinando')
    # The members of both sides hear it, except the representative who just accepted (nobody is told of their own act).
    for headers, expected in ((first[0], 1), (member, 1), (second[0], 0)):
        complete = [item for item in notifications(http, headers, 'proposta_aceita') if item['payload']['complete']]
        assert len(complete) == expected
    assert accept(http, first[0], match_id).status_code == 409
    assert decline(http, first[0], match_id).json()['detail'] == 'Esta proposta não está mais aberta.'

    # The teams are free to search again; the match is in play for both.
    assert http.get('/api/v1/me/proposals', headers=first[0]).json() == {'items': []}
    assert search(http, first[0], team_body(first[2])).status_code == 201


def test_declining_ends_the_search_and_requeues_the_other_side(client):
    http, db = client
    first, second, third = squad(http, 'd1'), squad(http, 'd2'), squad(http, 'd3')
    match_id, response = pair(http, first, second)
    assert response.json()['proposal']['sides'][0]['team']['id'] == first[2]
    waiting_ids = [row.id for row in db.scalars(select(MatchSearch).order_by(MatchSearch.id))]
    # A third team arrives while the first two are held by the proposal.
    assert search(http, third[0], team_body(third[2])).json()['proposal'] is None

    refused = decline(http, second[0], match_id)
    assert refused.status_code == 200, refused.text
    assert refused.json()['state'] == 'recusada' and refused.json()['can_respond'] is False
    searches = {search_id: search_row(db, search_id) for search_id in waiting_ids}
    assert searches[waiting_ids[1]].state == 'recusada' and searches[waiting_ids[1]].ended_at is not None
    # The first team went back to the queue with its original deadline and was paired with the third team at once.
    assert searches[waiting_ids[0]].state == 'pareada'
    assert searches[waiting_ids[0]].match_id != match_id
    assert db.get(Match, match_id).state == 'recusada' and db.get(Match, match_id).closed_at is not None
    sides = db.scalars(select(MatchSide).where(MatchSide.match_id == match_id).order_by(MatchSide.side)).all()
    assert (sides[1].declined_at is not None, sides[0].declined_at) == (True, None)
    [ended] = notifications(http, first[0], 'proposta_encerrada')
    assert ended['payload']['reason'] == 'recusada' and ended['payload']['requeued'] is True
    assert notifications(http, second[0], 'proposta_encerrada') == []
    [entry] = audit_actions(db, 'partida.proposta_recusada')
    assert entry.data['side'] == 'b' and entry.data['requeued_search_ids'] == [waiting_ids[0]]
    new_proposal = http.get('/api/v1/me/proposals', headers=first[0]).json()['items']
    assert len(new_proposal) == 1 and new_proposal[0]['match_id'] != match_id
    assert {side['team']['id'] for side in new_proposal[0]['sides']} == {first[2], third[2]}
    assert decline(http, second[0], match_id).status_code == 409
    # The team that refused may search again.
    assert search(http, second[0], team_body(second[2])).status_code == 201


def test_a_lapsed_proposal_is_read_as_expired(client):
    http, db = client
    first, second = squad(http, 'e1'), squad(http, 'e2')
    match_id, _ = pair(http, first, second)
    assert accept(http, first[0], match_id).status_code == 200
    match = db.get(Match, match_id)
    match.proposal_expires_at = utcnow() - timedelta(minutes=1)
    db.flush()

    # Reads do not show it as pending; the side that accepted is back in the queue, the other one is over.
    assert http.get('/api/v1/me/proposals', headers=first[0]).json() == {'items': []}
    assert http.get('/api/v1/me/proposals', headers=second[0]).json() == {'items': []}
    board = play(http, first[0])
    assert (board['proposals'], board['attention']) == ([], True)
    assert [(item['state'], item['match_id'], item['can_cancel']) for item in board['searches']] == [
        ('ativa', None, True)]
    quiet = play(http, second[0])
    assert (quiet['searches'], quiet['proposals'], quiet['attention']) == ([], [], False)
    assert http.get('/api/v1/me/searches', headers=second[0]).json() == {'items': []}
    # Nothing was written by the reads.
    assert db.get(Match, match_id).state == 'proposta'

    # Answering a lapsed proposal is refused, and the expiry is applied then (as the sweep would).
    late = accept(http, second[0], match_id)
    assert late.status_code == 409 and late.json()['detail'] == 'Esta proposta não está mais aberta.'
    db.expire_all()
    assert db.get(Match, match_id).state == 'expirada' and db.get(Match, match_id).closed_at is not None
    states = {row.team_id: row.state for row in db.scalars(select(MatchSearch))}
    assert states == {first[2]: 'ativa', second[2]: 'sem_resposta'}
    assert len(audit_actions(db, 'partida.proposta_expirada')) == 1
    # The team that did not answer may search again, and meets the one that went back to the queue.
    retry = search(http, second[0], team_body(second[2]))
    assert retry.status_code == 201 and retry.json()['proposal']['sides'][0]['team']['id'] == first[2]


def test_cancelling_a_search_held_by_a_lapsed_proposal_applies_its_expiry(client):
    http, db = client
    first, second = squad(http, 'x1'), squad(http, 'x2')
    match_id, response = pair(http, first, second)
    second_search = response.json()['search']['id']
    assert http.delete(f'{SEARCHES}/{second_search}', headers=second[0]).status_code == 409
    db.get(Match, match_id).proposal_expires_at = utcnow() - timedelta(minutes=5)
    db.flush()
    # The lapsed proposal no longer holds the search: it ended without an answer, so there is nothing to cancel.
    ended = http.delete(f'{SEARCHES}/{second_search}', headers=second[0])
    assert ended.status_code == 409 and ended.json()['detail'] == 'Esta busca já foi encerrada.'
    assert search_row(db, second_search).state == 'sem_resposta'
    # The other team (never answered either) is also over; a new search is accepted at once.
    assert search(http, second[0], team_body(second[2])).status_code == 201


def test_a_waiting_search_past_24_hours_is_read_as_expired(client):
    http, db = client
    headers, _, team_id = squad(http, 'vencida')
    first = search(http, headers, team_body(team_id)).json()['search']
    row = db.get(MatchSearch, first['id'])
    row.started_at = utcnow() - timedelta(hours=25)
    row.expires_at = utcnow() - timedelta(hours=1)
    db.flush()
    assert http.get('/api/v1/me/searches', headers=headers).json() == {'items': []}
    board = play(http, headers)
    assert (board['searches'], board['attention']) == ([], False)
    # A new search is accepted: the old one is expired first (audit entry by the system).
    second = search(http, headers, team_body(team_id))
    assert second.status_code == 201 and second.json()['search']['id'] != first['id']
    assert search_row(db, first['id']).state == 'expirada'
    [entry] = audit_actions(db, 'busca.expirada')
    assert entry.actor_id is None and entry.data == {'automatico': True}


# ----- Cancelling ---------------------------------------------------------------------------------------------

def test_cancelling_a_search(client):
    http, db = client
    headers, rep_id, team_id = squad(http, 'cancela')
    member, member_id = athlete(http, 'reserva')
    join_by_invite(http, headers, team_id, member, member_id)
    stranger, _ = athlete(http, 'outro')
    created = search(http, headers, team_body(team_id)).json()['search']
    path = f"{SEARCHES}/{created['id']}"

    assert http.delete(path).status_code == 401
    # A member sees the team's search, but cannot cancel it.
    seen = http.get('/api/v1/me/searches', headers=member).json()['items']
    assert [(item['id'], item['can_cancel']) for item in seen] == [(created['id'], False)]
    forbidden = http.delete(path, headers=member)
    assert forbidden.status_code == 403 and forbidden.json()['detail'] == 'Só representantes cancelam a busca do time.'
    assert http.delete(path, headers=stranger).status_code == 404
    assert http.delete(f'{SEARCHES}/999999', headers=headers).status_code == 404
    assert http.get('/api/v1/me/searches', headers=stranger).json() == {'items': []}

    assert http.delete(path, headers=headers).status_code == 204
    row = search_row(db, created['id'])
    assert row.state == 'cancelada' and row.ended_at is not None
    [entry] = audit_actions(db, 'busca.cancelada')
    assert (entry.actor_id, entry.target_id) == (rep_id, created['id'])
    again = http.delete(path, headers=headers)
    assert again.status_code == 409 and again.json()['detail'] == 'Esta busca já foi encerrada.'
    assert http.get('/api/v1/me/searches', headers=headers).json() == {'items': []}
    assert search(http, headers, team_body(team_id)).status_code == 201


def test_a_search_with_a_proposal_must_be_answered_instead(client):
    http, _ = client
    first, second = squad(http, 'p1'), squad(http, 'p2')
    _, response = pair(http, first, second)
    refused = http.delete(f"{SEARCHES}/{response.json()['search']['id']}", headers=second[0])
    assert refused.status_code == 409
    assert refused.json()['detail'] == 'A busca já encontrou uma partida. Responda à proposta.'


# ----- The board and the lists -------------------------------------------------------------------------------

def test_play_board_for_each_state(client):
    http, db = client
    assert http.get('/api/v1/me/play').status_code == 401
    first, second = squad(http, 'pl1'), squad(http, 'pl2')
    empty = play(http, first[0])
    assert empty == {'attention': False, 'searches': [], 'proposals': [], 'offers': [], 'matches': []}

    # Waiting search.
    assert search(http, first[0], team_body(first[2])).status_code == 201
    waiting = play(http, first[0])
    assert waiting['attention'] is True and [item['state'] for item in waiting['searches']] == ['ativa']
    assert (waiting['proposals'], waiting['matches']) == ([], [])

    # Pending proposal: it shows up on the board of both teams.
    response = search(http, second[0], team_body(second[2]))
    match_id = response.json()['proposal']['match_id']
    for headers in (first[0], second[0]):
        board = play(http, headers)
        assert board['attention'] is True
        assert [item['match_id'] for item in board['proposals']] == [match_id]
        assert [item['state'] for item in board['searches']] == ['pareada']
        assert board['matches'] == []

    # Match being arranged: the mint dot stays on; the card needs no action from the one who already accepted.
    assert accept(http, first[0], match_id).status_code == 200
    assert accept(http, second[0], match_id).status_code == 200
    board = play(http, first[0])
    assert (board['attention'], board['searches'], board['proposals']) == (True, [], [])
    [card] = board['matches']
    assert (card['id'], card['state'], card['phase'], card['my_side'], card['my_role']) == (
        match_id, 'combinando', 'combinando', 'a', 'representante')
    assert card['starts_at'] is None and card['court'] is None and card['score'] is None

    # A scheduled match no longer asks for attention.
    match = db.get(Match, match_id)
    start = utcnow() + timedelta(days=2)
    match.state, match.starts_at = 'agendada', start.replace(second=0, microsecond=0)
    match.result_deadline = match.starts_at + timedelta(hours=48)
    db.flush()
    board = play(http, second[0])
    assert board['attention'] is False and [item['phase'] for item in board['matches']] == ['agendada']


def test_a_walkin_offer_appears_in_the_board(client):
    http, db = client
    first, second = squad(http, 'o1'), squad(http, 'o2')
    now = utcnow()
    scheduled_match(db, db.get(Team, first[2]), db.get(Team, second[2]), slots_a={'goleiro': 1},
                    starts_at=now + timedelta(days=3), now=now)
    walkin, walkin_id = athlete(http, 'goleiro', position='goleiro')

    response = search(http, walkin, {'sport': 'futebol', 'position': 'goleiro'})
    assert response.status_code == 201, response.text
    body = response.json()
    assert body['proposal'] is None and body['search']['state'] == 'pareada'
    offer = body['offer']
    assert offer['position'] == 'goleiro' and offer['side'] == 'a' and offer['slot_id'] == body['search']['slot_id']
    assert offer['search_id'] == body['search']['id']
    assert (offer['match']['my_role'], offer['match']['needs_my_action']) == ('avulso', False)
    assert body['search']['offer_expires_at'] == offer['expires_at']

    board = play(http, walkin)
    assert board['attention'] is True
    assert [item['slot_id'] for item in board['offers']] == [offer['slot_id']]
    assert [(item['state'], item['can_cancel']) for item in board['searches']] == [('pareada', False)]
    refused = http.delete(f"{SEARCHES}/{body['search']['id']}", headers=walkin)
    assert refused.status_code == 409
    assert refused.json()['detail'] == 'A busca já encontrou uma partida. Responda à oferta de vaga.'
    # A resubmission returns the offer again.
    again = search(http, walkin, {'sport': 'futebol'})
    assert again.status_code == 200 and again.json()['offer']['slot_id'] == offer['slot_id']

    # The offer lapses after its 2 h: the board no longer lists it and a new search is possible.
    held = db.get(MatchSearch, body['search']['id'])
    held.offer_expires_at = utcnow() - timedelta(minutes=1)
    db.flush()
    board = play(http, walkin)
    assert (board['offers'], board['searches'], board['attention']) == ([], [], False)
    assert walkin_id and search(http, walkin, {'sport': 'futebol', 'position': 'goleiro'}).status_code == 201


def test_my_matches_proximas_and_historico(client):
    http, db = client
    first, second, third = squad(http, 'm1'), squad(http, 'm2'), squad(http, 'm3')
    assert http.get('/api/v1/me/matches').status_code == 401
    assert http.get('/api/v1/me/matches', params={'scope': 'outros'}, headers=first[0]).status_code == 422
    assert http.get('/api/v1/me/matches', headers=first[0]).json() == {'items': [], 'next_cursor': None}

    match_id, _ = pair(http, first, second)
    assert accept(http, first[0], match_id).status_code == 200
    assert accept(http, second[0], match_id).status_code == 200
    now = utcnow()
    team_a, team_c = db.get(Team, first[2]), db.get(Team, third[2])
    dated = scheduled_match(db, team_a, team_c, starts_at=(now + timedelta(days=2)).replace(second=0, microsecond=0),
                            now=now)

    proximas = http.get('/api/v1/me/matches', params={'scope': 'proximas'}, headers=first[0]).json()
    # The match without a date comes first, then by start.
    assert [(item['id'], item['state']) for item in proximas['items']] == [
        (match_id, 'combinando'), (dated.id, 'agendada')]
    assert proximas['next_cursor'] is None
    assert [item['id'] for item in http.get('/api/v1/me/matches', headers=second[0]).json()['items']] == [match_id]
    assert [item['id'] for item in http.get('/api/v1/me/matches', headers=third[0]).json()['items']] == [dated.id]

    closed = []
    for index in range(3):
        stamp = now - timedelta(days=index + 1)
        match = Match(sport='futebol', format='society', city_id=CITY, origin='amistoso', state='cancelada',
                      cancelled_at=stamp, closed_at=stamp, created_at=stamp - timedelta(days=1), updated_at=stamp)
        db.add(match)
        db.flush()
        for label, team_id in (('a', first[2]), ('b', second[2])):
            db.add(MatchSide(match_id=match.id, side=label, team_id=team_id, created_at=stamp))
        closed.append(match.id)
    db.flush()
    page = http.get('/api/v1/me/matches', params={'scope': 'historico', 'limit': 2}, headers=first[0]).json()
    assert [item['id'] for item in page['items']] == closed[:2] and page['next_cursor']
    assert {item['state'] for item in page['items']} == {'cancelada'}
    rest = http.get('/api/v1/me/matches', params={'scope': 'historico', 'limit': 2, 'cursor': page['next_cursor']},
                    headers=first[0]).json()
    assert [item['id'] for item in rest['items']] == closed[2:] and rest['next_cursor'] is None
    assert http.get('/api/v1/me/matches', params={'scope': 'historico'}, headers=third[0]).json()['items'] == []


# ----- Closing a team --------------------------------------------------------------------------------------

BLOCKED = 'Encerre ou cancele as partidas agendadas e as inscrições ativas antes de encerrar o time.'


def close(http, member):
    return http.post(f'/api/v1/teams/{member[2]}/close', json={}, headers=member[0])


def test_closing_a_team_cancels_its_waiting_search(client):
    http, db = client
    team = squad(http, 'fecha')
    created = search(http, team[0], team_body(team[2])).json()['search']
    assert close(http, team).status_code == 204
    row = search_row(db, created['id'])
    assert row.state == 'cancelada' and row.ended_at is not None
    entry = next(item for item in audit_actions(db, 'busca.cancelada') if item.target_id == created['id'])
    assert entry.data['time_encerrado'] is True and entry.actor_id is not None
    assert http.get('/api/v1/me/searches', headers=team[0]).json() == {'items': []}


def test_a_team_with_an_active_match_cannot_close(client):
    http, db = client
    first, second, third = squad(http, 'z1'), squad(http, 'z2'), squad(http, 'z3')
    match_id, _ = pair(http, first, second)

    # Proposal running.
    blocked = close(http, first)
    assert blocked.status_code == 409 and blocked.json()['detail'] == BLOCKED
    assert close(http, second).status_code == 409
    db.expire_all()
    assert {row.state for row in db.scalars(select(MatchSearch))} == {'pareada'}

    # Being arranged.
    assert accept(http, first[0], match_id).status_code == 200
    assert accept(http, second[0], match_id).status_code == 200
    assert close(http, first).status_code == 409

    # Scheduled.
    match = db.get(Match, match_id)
    match.state, match.starts_at = 'agendada', (utcnow() + timedelta(days=2)).replace(second=0, microsecond=0)
    match.result_deadline = match.starts_at + timedelta(hours=48)
    db.flush()
    assert close(http, second).status_code == 409
    assert db.get(Team, second[2]).state == 'ativo'

    # A team without matches closes; so does a team whose match was cancelled.
    assert close(http, third).status_code == 204
    match.state = 'cancelada'
    match.cancelled_at = match.closed_at = utcnow()
    db.flush()
    assert close(http, second).status_code == 204
    assert db.get(Team, second[2]).state == 'encerrado'


def test_a_lapsed_proposal_does_not_keep_a_team_open(client):
    http, db = client
    first, second, third = squad(http, 'l1'), squad(http, 'l2'), squad(http, 'l3')
    match_id, _ = pair(http, first, second)
    assert accept(http, second[0], match_id).status_code == 200
    db.get(Match, match_id).proposal_expires_at = utcnow() - timedelta(minutes=1)
    db.flush()
    # A third team waits meanwhile; closing the first team applies the expiry and must not pair it with the closing one.
    assert search(http, third[0], team_body(third[2])).json()['proposal'] is None
    assert close(http, first).status_code == 204
    db.expire_all()
    assert db.get(Match, match_id).state == 'expirada'
    by_team = {row.team_id: row for row in db.scalars(select(MatchSearch))}
    assert by_team[first[2]].state == 'sem_resposta'
    # The team that had accepted is back in the queue and pairs with the one that was waiting.
    assert by_team[second[2]].state == 'pareada' and by_team[third[2]].state == 'pareada'
    assert by_team[second[2]].match_id == by_team[third[2]].match_id != match_id

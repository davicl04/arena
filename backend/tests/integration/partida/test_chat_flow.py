"""Chat da partida: acesso, leitura periódica (`after`), paginação, papéis, bloqueio e fim do acesso do avulso."""
import uuid

from app.models.identity import MediaObject, UserBlock
from app.services.match_events import post_event
from tests.integration.entry_helpers import make_event
from tests.integration.partida.helpers import API, NOW, agreed_match, fill_slot, make_match, messages_of

CHAT_CLOSED = 'O chat desta partida está fechado.'
CHAT_NOT_OPEN = 'O chat abre quando os dois lados aceitam a proposta.'


def combining(db, world):
    return make_match(db, 'combinando', [world['team_a'], world['team_b']])


def say(http, world, match, who, body):
    return http.post(f'{API}/matches/{match.id}/messages', json={'body': body}, headers=world['h'][who])


def read(http, world, match, who='rep_a', query=''):
    return http.get(f'{API}/matches/{match.id}/messages{query}', headers=world['h'][who])


def ids(response):
    return [item['id'] for item in response.json()['items']]


# ----- Access -----------------------------------------------------------------------------------------------------

def test_only_the_two_rosters_and_the_administration_see_the_chat(client, world, clock):
    http, db = client
    match = combining(db, world)
    for who in ('rep_a', 'member_a', 'rep_b', 'member_b', 'admin'):
        assert read(http, world, match, who).status_code == 200, who
    for who in ('stranger', 'guest', 'tenista_a'):
        response = read(http, world, match, who)
        assert (response.status_code, response.json()['detail']) == (404, 'Partida não encontrada.'), who
        assert say(http, world, match, who, 'Oi').status_code == 404
    assert read(http, world, match, 'rep_a').json() == {'items': [], 'has_more': False, 'last_id': None}
    assert http.get(f'{API}/matches/{match.id}/messages').status_code == 401


def test_the_chat_opens_when_both_sides_accept_and_closes_with_the_match(client, world, clock):
    http, db = client
    proposal = make_match(db, 'proposta', [world['team_a'], world['team_b']])
    for response in (read(http, world, proposal), say(http, world, proposal, 'rep_a', 'Oi')):
        assert (response.status_code, response.json()['detail']) == (403, CHAT_NOT_OPEN)
    declined = make_match(db, 'recusada', [world['team_a'], world['team_b']])
    assert read(http, world, declined).status_code == 403

    scheduled = agreed_match(db, world)
    assert say(http, world, scheduled, 'member_a', 'Bora').status_code == 201
    closed = make_match(db, 'cancelada', [world['team_a'], world['team_b']])
    assert read(http, world, closed).status_code == 200
    response = say(http, world, closed, 'rep_a', 'Ainda aí?')
    assert (response.status_code, response.json()['detail']) == (409, CHAT_CLOSED)


def test_the_administration_reads_but_does_not_write(client, world, clock):
    http, db = client
    match = combining(db, world)
    response = say(http, world, match, 'admin', 'Oi')
    assert (response.status_code, response.json()['detail']) == (403, 'A administração só lê o chat.')
    assert messages_of(db, match) == []


def test_messages_are_trimmed_and_limited(client, world, clock):
    http, db = client
    match = combining(db, world)
    created = say(http, world, match, 'rep_a', '  Podemos jogar às 19h?\n ')
    assert created.status_code == 201, created.text
    body = created.json()
    assert (body['body'], body['kind'], body['side'], body['is_mine'], body['removed']) == (
        'Podemos jogar às 19h?', 'texto', 'a', True, False)
    for text in ('', '   \n '):
        response = say(http, world, match, 'rep_a', text)
        assert (response.status_code, response.json()['detail']) == (422, 'Escreva uma mensagem de 1 a 1000 caracteres.')
        assert response.json()['fields'][0]['field'] == 'body'
    assert say(http, world, match, 'rep_a', 'x' * 1000).status_code == 201
    assert say(http, world, match, 'rep_a', 'x' * 1001).status_code == 422
    assert http.post(f'{API}/matches/{match.id}/messages', json={}, headers=world['h']['rep_a']).status_code == 422
    assert len(messages_of(db, match)) == 2


# ----- Reading ----------------------------------------------------------------------------------------------------

def test_polling_with_after_returns_only_what_is_new(client, world, clock):
    http, db = client
    match = combining(db, world)
    post_event(db, match.id, 'partida_combinando', 'Proposta aceita pelos dois lados.', now=NOW)
    db.flush()
    for index in range(4):
        assert say(http, world, match, ('rep_a', 'rep_b')[index % 2], f'mensagem {index}').status_code == 201
    everything = read(http, world, match)
    assert everything.status_code == 200 and everything.json()['has_more'] is False
    first, *_, last = ids(everything)
    assert ids(everything) == sorted(ids(everything)) and len(ids(everything)) == 5
    assert everything.json()['last_id'] == last

    nothing = read(http, world, match, query=f'?after={last}')
    assert nothing.json() == {'items': [], 'has_more': False, 'last_id': last}
    assert say(http, world, match, 'member_b', 'cheguei').status_code == 201
    news = read(http, world, match, query=f'?after={last}')
    assert [item['body'] for item in news.json()['items']] == ['cheguei'] and news.json()['last_id'] > last

    paged = read(http, world, match, query=f'?after={first}&limit=2')
    assert ids(paged) == [first + 1, first + 2] and paged.json()['has_more'] is True
    assert paged.json()['last_id'] == first + 2
    tail = read(http, world, match, query='?limit=2')
    assert [item['body'] for item in tail.json()['items']] == ['mensagem 3', 'cheguei'] and tail.json()['has_more']
    older = read(http, world, match, query=f"?before={tail.json()['items'][0]['id']}&limit=2")
    assert [item['body'] for item in older.json()['items']] == ['mensagem 1', 'mensagem 2']
    assert older.json()['has_more'] is True
    oldest = read(http, world, match, query=f"?before={older.json()['items'][0]['id']}&limit=10")
    assert [item['body'] for item in oldest.json()['items']] == [everything.json()['items'][0]['body'], 'mensagem 0']
    assert oldest.json()['has_more'] is False


def test_the_query_is_validated(client, world, clock):
    http, db = client
    match = combining(db, world)
    both = read(http, world, match, query='?after=1&before=5')
    assert (both.status_code, both.json()['detail']) == (422, 'Use só after ou só before.')
    for query in ('?limit=0', '?limit=101', '?after=-1', '?after=x'):
        assert read(http, world, match, query=query).status_code == 422, query
    assert read(http, world, match, query='?limit=100').status_code == 200


def test_authors_carry_their_role_side_and_ownership(client, world, clock):
    http, db = client
    match = agreed_match(db, world)
    fill_slot(db, match, world['guest'])
    post_event(db, match.id, 'partida_agendada', 'Partida agendada.', side='a', author_id=world['rep_a'].id, now=NOW)
    for who in ('rep_a', 'member_a', 'rep_b', 'guest'):
        assert say(http, world, match, who, f'oi de {who}').status_code == 201
    items = read(http, world, match, 'member_b').json()['items']
    summary = [(item['kind'], item['author']['username'] if item['author'] else None, item['author_role'], item['side'],
                item['is_mine']) for item in items]
    assert summary == [
        ('evento', None, None, 'a', False),
        ('texto', world['rep_a'].username, 'representante', 'a', False),
        ('texto', world['member_a'].username, 'membro', 'a', False),
        ('texto', world['rep_b'].username, 'representante', 'b', False),
        ('texto', world['guest'].username, 'avulso', 'b', False)]
    assert items[0]['event_type'] == 'partida_agendada' and items[0]['body'] == 'Partida agendada.'
    mine = read(http, world, match, 'guest').json()['items']
    assert [item['is_mine'] for item in mine] == [False, False, False, False, True]


def test_tennis_athletes_are_athletes_in_the_chat(client, world, clock):
    http, db = client
    match = make_match(db, 'combinando', [world['tenista_a'], world['tenista_b']], sport='tenis')
    assert say(http, world, match, 'tenista_a', 'Quinta, 19h?').status_code == 201
    items = read(http, world, match, 'tenista_b').json()['items']
    assert [(item['author_role'], item['side']) for item in items] == [('atleta', 'a')]
    assert say(http, world, match, 'rep_a', 'Oi').status_code == 404


def test_the_organizer_of_a_championship_match_chats_as_organizer(client, world, clock):
    http, db = client
    event = make_event(db, world['stranger'].id)
    match = make_match(db, 'combinando', [world['team_a'], world['team_b']], origin='campeonato', event_id=event.id,
                       round_number=1, bracket_position=1)
    assert say(http, world, match, 'stranger', 'Abertura às 9h').status_code == 201
    item = read(http, world, match, 'rep_a').json()['items'][0]
    assert (item['author_role'], item['side'], item['body']) == ('organizador', None, 'Abertura às 9h')


def test_a_block_hides_the_avatar_but_not_the_message(client, world, clock):
    http, db = client
    match = combining(db, world)
    author = world['rep_a']
    media = MediaObject(id=uuid.uuid4(), user_id=author.id, bucket='arena', object_key=f'avatars/{uuid.uuid4()}.webp',
                        content_type='image/webp', size_bytes=10, width=1, height=1)
    db.add(media)
    db.flush()
    author.avatar_media_id = media.id
    db.add(UserBlock(blocker_id=world['member_b'].id, blocked_id=author.id))
    db.flush()
    assert say(http, world, match, 'rep_a', 'Boa noite').status_code == 201
    seen = read(http, world, match, 'rep_b').json()['items'][0]
    assert seen['author']['avatar_url'].startswith(f'/api/v1/users/{author.id}/avatar?v=')
    hidden = read(http, world, match, 'member_b').json()['items'][0]
    assert hidden['body'] == 'Boa noite' and hidden['author']['name'] == author.name
    assert hidden['author']['avatar_url'] is None


def test_removed_messages_lose_their_text_for_everyone(client, world, clock):
    http, db = client
    match = combining(db, world)
    message = say(http, world, match, 'rep_a', 'Texto ofensivo').json()
    row = messages_of(db, match)[0]
    row.removed_at, row.removed_by_id = NOW, world['admin'].id
    db.flush()
    for who in ('rep_a', 'rep_b', 'admin'):
        item = read(http, world, match, who).json()['items'][0]
        assert (item['id'], item['body'], item['removed']) == (message['id'], None, True)
    assert 'Texto ofensivo' not in read(http, world, match, 'rep_b').text


# ----- Walk-ins ---------------------------------------------------------------------------------------------------

def test_a_walk_in_chats_until_the_match_ends(client, world, clock):
    http, db = client
    match = agreed_match(db, world)
    fill_slot(db, match, world['guest'])
    assert say(http, world, match, 'guest', 'Cheguei cedo').status_code == 201
    assert read(http, world, match, 'guest').status_code == 200
    assert http.get(f'{API}/matches/{match.id}', headers=world['h']['guest']).json()['my_role'] == 'avulso'

    # A confirmed result keeps the stats window (and the walk-in) open.
    match.state, match.score_a, match.score_b, match.winner_side = 'realizada', 1, 0, 'a'
    match.result_source, match.result_confirmed_at = 'confirmacao', NOW
    db.flush()
    assert say(http, world, match, 'guest', 'Ganhamos').status_code == 201

    # When the match ends the walk-in loses the access; the rosters keep reading and no one writes.
    match.state, match.closed_at = 'encerrada', NOW
    db.flush()
    for response in (read(http, world, match, 'guest'), say(http, world, match, 'guest', 'Oi')):
        assert (response.status_code, response.json()['detail']) == (404, 'Partida não encontrada.')
    assert len(read(http, world, match, 'rep_a').json()['items']) == 2
    assert say(http, world, match, 'rep_a', 'Valeu').status_code == 409

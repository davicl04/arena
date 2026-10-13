"""Denúncia de mensagem do chat (`target_type = 'match_message'`) na fila de Denúncias existente."""
from sqlalchemy import select

from app.models.identity import AuthSession, ContentReport, ModerationAction, User
from app.models.matches import MatchMessage
from app.services.match_events import post_event
from tests.integration.partida.helpers import API, NOW, agreed_match, fill_slot, make_match, messages_of

PREVIEW_PRIVACY = 'O chat é privado: o texto aparece só enquanto a denúncia está pendente.'


def say(http, world, match, who, body='Mensagem de teste'):
    response = http.post(f'{API}/matches/{match.id}/messages', json={'body': body}, headers=world['h'][who])
    assert response.status_code == 201, response.text
    return response.json()['id']


def report(http, world, message_id, who='rep_b', **fields):
    body = {'target_type': 'match_message', 'target_id': message_id, 'reason': 'assedio', **fields}
    return http.post(f'{API}/reports', json=body, headers=world['h'][who])


def pending(http, world):
    return http.get(f'{API}/admin/reports', headers=world['h']['admin']).json()['items']


def moderate(http, world, report_id, action, justification='Mensagem ofensiva.'):
    return http.post(f'{API}/admin/reports/{report_id}/decision', headers=world['h']['admin'],
                     json={'action': action, 'justification': justification})


def test_a_reader_reports_a_text_message_and_the_administration_sees_it(client, world, clock):
    http, db = client
    match = agreed_match(db, world)
    fill_slot(db, match, world['guest'])
    message_id = say(http, world, match, 'rep_a', 'Vocês são fracos.')

    for who in ('rep_b', 'member_a', 'guest'):
        created = report(http, world, message_id, who, description='  Ofensa  ')
        assert created.status_code == 201, (who, created.text)
        assert created.json()['status'] == 'pending'
    row = db.scalars(select(ContentReport).order_by(ContentReport.id)).first()
    assert (row.target_type, row.target_id, row.description) == ('match_message', message_id, 'Ofensa')

    queue = pending(http, world)
    assert len(queue) == 3
    item = queue[0]
    assert (item['target_type'], item['target_id'], item['target_user_id'], item['target_user_active']) == (
        'match_message', message_id, world['rep_a'].id, True)
    assert item['target_preview'] == {'body': 'Vocês são fracos.', 'removed': False, 'author': world['rep_a'].name,
                                      'match_id': match.id, 'match': 'Ferrugem FC × Tigres do Lago'}
    counts = http.get(f'{API}/admin/queue-counts', headers=world['h']['admin']).json()
    assert counts['reports'] == 3


def test_only_readers_report_and_only_text_messages(client, world, clock):
    http, db = client
    match = agreed_match(db, world)
    message_id = say(http, world, match, 'rep_a')
    post_event(db, match.id, 'partida_agendada', 'Partida agendada.', now=NOW)
    db.flush()
    banner = [row for row in messages_of(db, match) if row.kind == 'evento'][0]
    other = make_match(db, 'proposta', [world['team_a'], world['team_b']])
    db.add(MatchMessage(match_id=other.id, author_id=world['rep_a'].id, side='a', kind='texto', body='antes do aceite',
                        created_at=NOW))
    db.flush()
    early = messages_of(db, other)[0]

    for who, target in (('stranger', message_id), ('guest', message_id), ('rep_b', banner.id), ('rep_b', early.id),
                        ('rep_b', 99999999)):
        response = report(http, world, target, who)
        assert (response.status_code, response.json()['detail']) == (404, 'Conteúdo não encontrado.'), (who, target)
    assert report(http, world, message_id, 'admin').status_code == 201        # the administration reads the chat too
    assert http.post(f'{API}/reports', headers=world['h']['rep_b'],
                     json={'target_type': 'chat', 'target_id': 1, 'reason': 'spam'}).status_code == 422
    assert http.post(f'{API}/reports', headers=world['h']['rep_b'],
                     json={'target_type': 'match_message', 'target_id': message_id, 'reason': 'outro',
                           'extra': True}).status_code == 422


def test_removing_a_reported_message_hides_its_text_for_everyone(client, world, clock):
    http, db = client
    match = agreed_match(db, world)
    message_id = say(http, world, match, 'rep_a', 'Texto removível')
    other_id = say(http, world, match, 'rep_a', 'Texto que fica')
    first = report(http, world, message_id).json()['id']
    second = report(http, world, message_id, 'member_b').json()['id']
    third = report(http, world, other_id).json()['id']
    cursor = http.get(f'{API}/matches/{match.id}/messages', headers=world['h']['rep_b']).json()['last_id']

    dismissed = moderate(http, world, third, 'dismiss')
    assert dismissed.status_code == 200 and dismissed.json()['status'] == 'resolved'
    assert not db.get(MatchMessage, other_id).removed_at

    removed = moderate(http, world, first, 'remove')
    assert removed.status_code == 200 and removed.json() == {'report_id': first, 'status': 'resolved',
                                                             'action': 'remove'}
    row = db.get(MatchMessage, message_id)
    assert row.removed_at is not None and row.removed_by_id == world['admin'].id and row.body == 'Texto removível'
    for who in ('rep_a', 'rep_b', 'admin'):
        items = http.get(f'{API}/matches/{match.id}/messages', headers=world['h'][who]).json()['items']
        assert [(item['body'], item['removed']) for item in items if item['kind'] == 'texto'] == [
            (None, True), ('Texto que fica', False)]
    updates = http.get(f'{API}/matches/{match.id}/messages', params={'after': cursor},
                       headers=world['h']['rep_b']).json()['items']
    assert len(updates) == 1 and updates[0]['event_type'] == 'mensagem_removida'
    assert updates[0]['payload'] == {'message_id': message_id} and updates[0]['author'] is None
    action = db.scalars(select(ModerationAction).where(ModerationAction.report_id == first)).one()
    assert (action.target_type, action.target_id, action.action, action.admin_id) == (
        'match_message', message_id, 'remove', world['admin'].id)

    # The second report of the same message still waits; its preview no longer carries the text.
    preview = [item for item in pending(http, world) if item['id'] == second][0]['target_preview']
    assert (preview['body'], preview['removed']) == (None, True)
    # A removed message cannot be reported again; a resolved report shows no preview of the private chat.
    assert report(http, world, message_id).status_code == 404
    resolved = http.get(f'{API}/admin/reports?status=resolved', headers=world['h']['admin']).json()['items']
    assert {item['id'] for item in resolved} == {first, third}
    assert all(item['target_preview'] is None for item in resolved)
    assert moderate(http, world, second, 'dismiss').status_code == 200


def test_suspending_the_author_of_a_reported_message(client, world, clock):
    http, db = client
    match = agreed_match(db, world)
    message_id = say(http, world, match, 'member_a', 'Ameaça')
    report_id = report(http, world, message_id).json()['id']
    suspended = moderate(http, world, report_id, 'suspend', 'Ameaças no chat.')
    assert suspended.status_code == 200 and suspended.json()['action'] == 'suspend'
    author = db.get(User, world['member_a'].id)
    assert author.active is False
    assert db.scalars(select(AuthSession).where(AuthSession.user_id == author.id)).all() == []
    assert db.get(MatchMessage, message_id).removed_at is None
    assert http.get(f'{API}/matches/{match.id}', headers=world['h']['member_a']).status_code == 401
    # The preview of a suspended author's pending report would show an inactive account.
    again = report(http, world, message_id, 'rep_b').json()['id']
    item = [entry for entry in pending(http, world) if entry['id'] == again][0]
    assert item['target_user_active'] is False

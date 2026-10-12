"""Athlete side of events on PostgreSQL: list and detail, entries, eligibility (RN18), teams and giving up."""
from datetime import timedelta

from app.models.events import EventEntry
from app.models.identity import utcnow
from app.services import media as media_service
from tests.integration.entry_helpers import (
    FakeStorage,
    account,
    image_file,
    make_event,
    organizer,
    race_event,
    receipts_of,
    standing,
    tennis_event,
)
from tests.integration.team_helpers import audit_actions, create_team, join_by_invite, notifications

TEAM_BUSY = 'Encerre ou cancele as partidas agendadas e as inscrições ativas antes de encerrar o time.'


def card_of(http, headers, event_id, **params):
    items = http.get('/api/v1/events', params=params, headers=headers).json()['items']
    return next((item for item in items if item['id'] == event_id), None)


def test_free_entry_is_confirmed_listed_and_can_be_given_up(client):
    http, db = client
    owner, owner_id, permission = organizer(http, db)
    athlete, athlete_id = account(http, db, 'ana')
    event = tennis_event(db, owner_id, permission)

    card = card_of(http, athlete, event.id)
    assert card['organizer_name'] == 'Rafa Eventos' and card['phase'] == 'inscricoes_abertas'
    assert card['eligibility'] == {'eligible': True, 'reason': None, 'message': None, 'tier': None, 'teams': None}
    assert card['my_entry'] is None and card['price_cents'] == 0

    created = http.post(f'/api/v1/events/{event.id}/entries', json={}, headers=athlete)
    assert created.status_code == 201, created.text
    entry = created.json()
    assert (entry['state'], entry['my_role'], entry['price_cents'], entry['reserved_until']) == (
        'confirmada', 'atleta', 0, None)
    assert entry['subject']['kind'] == 'atleta' and entry['subject']['athlete']['id'] == athlete_id
    assert (entry['can_cancel'], entry['can_send_receipt'], entry['can_respond_refund']) == (True, False, False)
    assert (entry['event']['entries_count'], entry['event']['confirmed_count']) == (1, 1)
    assert entry['confirmed_at'] is not None and entry['latest_payment'] is None
    assert [action for action, _ in audit_actions(db, 'event_entry', entry['id'])] == ['inscricao.criada']

    again = http.post(f'/api/v1/events/{event.id}/entries', json={}, headers=athlete)
    assert (again.status_code, again.json()['detail']) == (409, 'Você já está inscrito.')
    assert card_of(http, athlete, event.id)['my_entry'] == {
        'id': entry['id'], 'state': 'confirmada', 'team': None, 'reserved_until': None}

    detail = http.get(f'/api/v1/events/{event.id}', headers=athlete).json()
    assert (detail['registration_open'], detail['spots_left'], detail['pix'], detail['is_organizer']) == (
        True, 7, None, False)
    assert detail['tennis_bonus'] == {'champion': 40, 'runner_up': 20, 'semifinalist': 10, 'min_entries': 4,
                                      'applies': False}
    assert detail['organizer']['display_name'] == 'Rafa Eventos'
    assert detail['organizer']['person']['id'] == owner_id and detail['can_read_messages'] is True
    public = http.get(f'/api/v1/events/{event.id}/entries', headers=athlete).json()
    assert [item['id'] for item in public['items']] == [entry['id']] and public['next_cursor'] is None

    # The organizer sees the event but does not enter it.
    own = http.post(f'/api/v1/events/{event.id}/entries', json={}, headers=owner)
    assert (own.status_code, own.json()['detail']) == (409, 'Você não se inscreve no próprio evento.')
    owner_view = http.get(f'/api/v1/events/{event.id}', headers=owner).json()
    assert owner_view['is_organizer'] is True and owner_view['can_read_messages'] is True
    assert http.get(f"/api/v1/entries/{entry['id']}", headers=owner).json()['my_role'] == 'organizador'

    assert http.delete(f"/api/v1/entries/{entry['id']}", headers=athlete).status_code == 204
    cancelled = http.get(f"/api/v1/entries/{entry['id']}", headers=athlete).json()
    assert (cancelled['state'], cancelled['can_cancel']) == ('cancelada', False)
    assert db.get(EventEntry, entry['id']).cancel_origin == 'participante'
    assert http.delete(f"/api/v1/entries/{entry['id']}", headers=athlete).json()['detail'] == (
        'Esta inscrição já foi encerrada.')
    # Who cancelled leaves the notice channel; the entry moves to the history.
    assert http.get(f'/api/v1/events/{event.id}', headers=athlete).json()['can_read_messages'] is False
    assert http.get('/api/v1/me/entries', headers=athlete).json()['items'] == []
    history = http.get('/api/v1/me/entries', params={'scope': 'historico'}, headers=athlete).json()['items']
    assert [item['id'] for item in history] == [entry['id']]
    assert [action for action, _ in audit_actions(db, 'event_entry', entry['id'])] == [
        'inscricao.criada', 'inscricao.cancelada']
    assert http.get('/api/v1/me/entries', params={'scope': 'outra'}, headers=athlete).status_code == 422


def test_paid_reservation_expires_in_reads_frees_the_spot_and_retries(client, monkeypatch):
    http, db = client
    storage = FakeStorage()
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    _, owner_id, permission = organizer(http, db)
    (ana, ana_id), (bia, _), (caio, _) = (account(http, db, name) for name in ('ana', 'bia', 'caio'))
    event = race_event(db, owner_id, permission, capacity=2)

    first = http.post(f'/api/v1/events/{event.id}/entries', json={}, headers=ana).json()
    assert (first['state'], first['price_cents'], first['can_send_receipt'], first['can_cancel']) == (
        'reservada', 6000, True, True)
    reserved_until = db.get(EventEntry, first['id']).reserved_until
    assert timedelta(hours=47, minutes=59) < reserved_until - utcnow() <= timedelta(hours=48)
    second = http.post(f'/api/v1/events/{event.id}/entries', json={}, headers=bia).json()
    full = http.post(f'/api/v1/events/{event.id}/entries', json={}, headers=caio)
    assert (full.status_code, full.json()['detail']) == (409, 'As vagas deste evento acabaram.')

    # Ana's reservation lapses: reads show it expired and the spot is free before the sweep runs.
    db.get(EventEntry, first['id']).reserved_until = utcnow() - timedelta(minutes=1)
    db.flush()
    lapsed = http.get(f"/api/v1/entries/{first['id']}", headers=ana).json()
    assert (lapsed['state'], lapsed['can_send_receipt'], lapsed['can_cancel']) == ('expirada', False, False)
    late = http.put(f"/api/v1/entries/{first['id']}/receipt", files=image_file(), headers=ana)
    assert (late.status_code, late.json()['detail']) == (409, 'O prazo da reserva acabou.')
    detail = http.get(f'/api/v1/events/{event.id}', headers=caio).json()
    assert (detail['spots_left'], detail['entries_count']) == (1, 1)
    assert card_of(http, ana, event.id)['my_entry']['state'] == 'expirada'
    assert http.post(f'/api/v1/events/{event.id}/entries', json={}, headers=caio).status_code == 201
    retry = http.post(f'/api/v1/events/{event.id}/entries', json={}, headers=ana)
    assert retry.json()['detail'] == 'As vagas deste evento acabaram.'

    # Bia gives up (a reservation without payment); Ana's stale reservation expires at once and she enters again.
    assert http.delete(f"/api/v1/entries/{second['id']}", headers=bia).status_code == 204
    again = http.post(f'/api/v1/events/{event.id}/entries', json={}, headers=ana)
    assert again.status_code == 201 and again.json()['id'] != first['id']
    old = db.get(EventEntry, first['id'])
    assert old.state == 'expirada' and old.expired_at is not None
    assert [item['payload']['entry_id'] for item in notifications(http, ana, 'reserva_expirada')] == [first['id']]
    assert ('inscricao.expirada', {'event_id': event.id, 'automatico': True}) in audit_actions(
        db, 'event_entry', first['id'])
    active = http.get('/api/v1/me/entries', headers=ana).json()['items']
    history = http.get('/api/v1/me/entries', params={'scope': 'historico'}, headers=ana).json()['items']
    assert [item['id'] for item in active] == [again.json()['id']]
    assert [item['id'] for item in history] == [first['id']] and history[0]['state'] == 'expirada'
    assert card_of(http, ana, event.id)['my_entry']['id'] == again.json()['id']


def test_eligibility_follows_the_tier_of_the_category(client):
    http, db = client
    _, owner_id, permission = organizer(http, db)
    (ana, ana_id), (bia, bia_id) = account(http, db, 'ana'), account(http, db, 'bia')
    restricted = tennis_event(db, owner_id, permission, accepted_tiers=['prata', 'ouro'])
    open_event = tennis_event(db, owner_id, permission, name='Aberto do Lago')

    placement = card_of(http, ana, restricted.id)['eligibility']
    assert placement == {'eligible': False, 'reason': 'em_classificacao', 'tier': None, 'teams': None,
                         'message': 'Quem está em classificação só se inscreve em evento aberto a todos.'}
    refused = http.post(f'/api/v1/events/{restricted.id}/entries', json={}, headers=ana)
    assert (refused.status_code, refused.json()['detail']) == (403, placement['message'])
    assert http.post(f'/api/v1/events/{open_event.id}/entries', json={}, headers=ana).status_code == 201

    low = standing(db, user_id=bia_id, sport='tenis', tier='bronze')
    outside = card_of(http, bia, restricted.id)['eligibility']
    assert (outside['eligible'], outside['reason'], outside['tier'], outside['message']) == (
        False, 'fora_da_faixa', 'bronze', 'Este evento aceita só Prata e Ouro.')
    assert http.post(f'/api/v1/events/{restricted.id}/entries', json={}, headers=bia).json()['detail'] == (
        'Este evento aceita só Prata e Ouro.')
    low.tier = 'prata'
    db.flush()
    assert card_of(http, bia, restricted.id)['eligibility']['eligible'] is True
    assert http.post(f'/api/v1/events/{restricted.id}/entries', json={}, headers=bia).status_code == 201

    # Running looks at the distance of the race: Ouro at 10 km says nothing about 5 km.
    standing(db, user_id=ana_id, sport='corrida', distance_km=10, tier='ouro')
    five = race_event(db, owner_id, permission, distance_km=5, accepted_tiers=['ouro'], price_cents=0)
    ten = race_event(db, owner_id, permission, accepted_tiers=['ouro'], price_cents=0)
    assert card_of(http, ana, five.id)['eligibility']['reason'] == 'em_classificacao'
    assert card_of(http, ana, ten.id)['eligibility'] == {'eligible': True, 'reason': None, 'message': None,
                                                         'tier': 'ouro', 'teams': None}


def test_football_entry_belongs_to_the_team_and_blocks_closing_it(client, monkeypatch):
    http, db = client
    storage = FakeStorage()
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    owner, owner_id, permission = organizer(http, db)
    (rep, _), (member, member_id), (outsider, _) = (account(http, db, name) for name in ('rep', 'membro', 'fora'))
    team = create_team(http, rep)
    join_by_invite(http, rep, team['id'], member, member_id)
    event = make_event(db, owner_id, permission)
    tennis = tennis_event(db, owner_id, permission)

    rep_card = card_of(http, rep, event.id)['eligibility']
    assert rep_card['eligible'] is True and rep_card['reason'] is None
    assert [(item['team']['id'], item['tier'], item['eligible'], item['entry_id']) for item in rep_card['teams']] == [
        (team['id'], None, True, None)]
    assert card_of(http, member, event.id)['eligibility'] == {
        'eligible': False, 'reason': 'sem_time', 'tier': None, 'teams': [],
        'message': 'Para inscrever um time, você precisa ser representante dele.'}

    url = f'/api/v1/events/{event.id}/entries'
    cases = [(member, {'team_id': team['id']}, 403, 'Só representantes inscrevem o time.'),
             (outsider, {'team_id': team['id']}, 404, 'Time não encontrado.'),
             (rep, {'team_id': team['id'] + 999}, 404, 'Time não encontrado.'),
             (rep, {}, 422, 'Escolha o time que vai se inscrever.')]
    for headers, body, status, message in cases:
        response = http.post(url, json=body, headers=headers)
        assert (response.status_code, response.json()['detail']) == (status, message)
    by_team = http.post(f'/api/v1/events/{tennis.id}/entries', json={'team_id': team['id']}, headers=rep)
    assert (by_team.status_code, by_team.json()['detail']) == (422, 'Inscrição por time só no futebol.')
    assert http.post(url, json={'team_id': team['id'], 'extra': 1}, headers=rep).status_code == 422

    created = http.post(url, json={'team_id': team['id']}, headers=rep)
    assert created.status_code == 201, created.text
    entry = created.json()
    assert (entry['state'], entry['my_role'], entry['subject']['kind']) == ('reservada', 'representante', 'time')
    assert entry['subject']['team']['initials'] == 'LC'
    sent = notifications(http, member, 'time_inscrito')
    assert [item['payload'] for item in sent] == [{'event_id': event.id, 'event_name': event.name,
                                                   'entry_id': entry['id'], 'team_id': team['id'],
                                                   'team_name': team['name']}]
    assert notifications(http, rep, 'time_inscrito') == []
    assert http.post(url, json={'team_id': team['id']}, headers=rep).json()['detail'] == 'Este time já está inscrito.'
    entered = card_of(http, rep, event.id)
    assert (entered['eligibility']['eligible'], entered['eligibility']['reason']) == (False, None)
    assert entered['eligibility']['teams'][0]['entry_id'] == entry['id']
    assert entered['my_entry']['team']['id'] == team['id']

    # Members follow the entry; only representatives act and see the receipts.
    seen = http.get(f"/api/v1/entries/{entry['id']}", headers=member).json()
    assert (seen['my_role'], seen['latest_payment'], seen['can_send_receipt'], seen['can_cancel']) == (
        'membro', None, False, False)
    assert http.get(f"/api/v1/entries/{entry['id']}", headers=outsider).status_code == 404
    refused = http.put(f"/api/v1/entries/{entry['id']}/receipt", files=image_file(), headers=member)
    assert (refused.status_code, refused.json()['detail']) == (403, 'Só representantes enviam o comprovante do time.')
    sent_receipt = http.put(f"/api/v1/entries/{entry['id']}/receipt", files=image_file(), headers=rep)
    assert sent_receipt.status_code == 201 and sent_receipt.json()['state'] == 'em_analise'
    file_url = sent_receipt.json()['latest_payment']['file_url']
    assert http.get(file_url, headers=rep).status_code == 200
    assert http.get(file_url, headers=member).status_code == 404
    assert http.get(f"/api/v1/entries/{entry['id']}/receipts", headers=member).status_code == 404
    assert http.delete(f"/api/v1/entries/{entry['id']}", headers=member).json()['detail'] == (
        'Só representantes cancelam a inscrição do time.')
    mine = http.get('/api/v1/me/entries', headers=member).json()['items']
    assert [(item['id'], item['my_role']) for item in mine] == [(entry['id'], 'membro')]

    closing = http.post(f"/api/v1/teams/{team['id']}/close", json={}, headers=rep)
    assert (closing.status_code, closing.json()['detail']) == (409, TEAM_BUSY)

    # The organizer refuses the receipt (decided in the database: the decision route is the organizer front's);
    # the representative gives up during the resend window, and then the team can close.
    receipt = receipts_of(db, entry['id'])[0]
    receipt.decision, receipt.reason_code, receipt.decided_at, receipt.decided_by_id = (
        'recusado', 'valor_diferente', utcnow(), owner_id)
    db.get(EventEntry, entry['id']).state = 'rejeitada'
    db.flush()
    assert http.delete(f"/api/v1/entries/{entry['id']}", headers=rep).status_code == 204
    assert http.post(f"/api/v1/teams/{team['id']}/close", json={}, headers=rep).status_code == 204


def test_restricted_football_uses_the_team_tier_in_the_event_format(client):
    http, db = client
    _, owner_id, permission = organizer(http, db)
    rep, _ = account(http, db, 'rep')
    team = create_team(http, rep)
    standing(db, team_id=team['id'], sport='futebol', format='society', tier='prata')
    gold = make_event(db, owner_id, permission, accepted_tiers=['ouro'])
    silver = make_event(db, owner_id, permission, accepted_tiers=['prata'], name='Copa Prata')
    futsal = make_event(db, owner_id, permission, accepted_tiers=['prata'], format='futsal', name='Copa Futsal')

    outside = card_of(http, rep, gold.id)['eligibility']
    assert (outside['eligible'], outside['reason'], outside['message']) == (
        False, 'fora_da_faixa', 'Este evento aceita só Ouro.')
    assert outside['teams'][0]['tier'] == 'prata'
    refused = http.post(f'/api/v1/events/{gold.id}/entries', json={'team_id': team['id']}, headers=rep)
    assert (refused.status_code, refused.json()['detail']) == (403, 'Este evento aceita só Ouro.')
    assert card_of(http, rep, futsal.id)['eligibility']['reason'] == 'em_classificacao'
    assert http.post(f'/api/v1/events/{silver.id}/entries', json={'team_id': team['id']},
                     headers=rep).status_code == 201


def test_closed_hidden_and_filtered_events(client):
    http, db = client
    owner, owner_id, permission = organizer(http, db)
    athlete, _ = account(http, db, 'ana')
    now = utcnow()
    draft = make_event(db, owner_id, permission, state='rascunho', published_at=None, name='Rascunho')
    closed = tennis_event(db, owner_id, permission, name='Fechado', registration_closes_at=now - timedelta(hours=1))
    suspended = tennis_event(db, owner_id, permission, name='Suspenso', revocation_decision='pendente')
    cancelled = tennis_event(db, owner_id, permission, name='Cancelado', state='cancelado', cancelled_at=now,
                             cancel_reason='Chuva forte', cancelled_by_id=owner_id)
    paid_soon = race_event(db, owner_id, permission, name='Corrida amanhã', starts_at=now + timedelta(hours=11),
                           registration_closes_at=now + timedelta(hours=10))
    # Published, but the start passed: nothing marks it as running before fase 6, so it leaves the list.
    started = tennis_event(db, owner_id, permission, name='Já começou', starts_at=now - timedelta(hours=2),
                           registration_closes_at=now - timedelta(hours=3))
    tennis_event(db, owner_id, permission, name='Em andamento', state='em_andamento',
                 starts_at=now - timedelta(days=1), registration_closes_at=now - timedelta(days=2))

    for event_id in (draft.id,):
        assert http.get(f'/api/v1/events/{event_id}', headers=athlete).json()['detail'] == 'Evento não encontrado.'
        assert http.post(f'/api/v1/events/{event_id}/entries', json={}, headers=athlete).status_code == 404
        assert http.get(f'/api/v1/events/{event_id}/entries', headers=athlete).status_code == 404
    for event in (closed, suspended, cancelled, paid_soon, started):
        response = http.post(f'/api/v1/events/{event.id}/entries', json={}, headers=athlete)
        assert (response.status_code, response.json()['detail']) == (409, 'As inscrições deste evento estão fechadas.')
    shown = http.get(f'/api/v1/events/{cancelled.id}', headers=athlete).json()
    assert (shown['state'], shown['cancel_reason'], shown['registration_open']) == ('cancelado', 'Chuva forte', False)
    closed_view = http.get(f'/api/v1/events/{closed.id}', headers=athlete).json()
    assert (closed_view['phase'], closed_view['registration_open']) == ('inscricoes_encerradas', False)
    started_view = http.get(f'/api/v1/events/{started.id}', headers=athlete).json()
    assert (started_view['state'], started_view['phase']) == ('publicado', 'inscricoes_encerradas')

    listed = http.get('/api/v1/events', headers=athlete).json()
    names = [item['name'] for item in listed['items']]
    assert 'Rascunho' not in names and 'Cancelado' not in names and 'Já começou' not in names
    assert names[:2] == ['Em andamento', 'Corrida amanhã']  # soonest first
    assert next(item for item in listed['items'] if item['name'] == 'Suspenso')['revocation_pending'] is True
    running = http.get('/api/v1/events', params={'sport': 'corrida'}, headers=athlete).json()['items']
    assert [item['name'] for item in running] == ['Corrida amanhã']
    assert http.get('/api/v1/events', params={'city_id': 3550308}, headers=athlete).json()['items'] == []
    assert http.get('/api/v1/events', params={'sport': 'golfe'}, headers=athlete).status_code == 422
    first = http.get('/api/v1/events', params={'limit': 1}, headers=athlete).json()
    rest = http.get('/api/v1/events', params={'limit': 50, 'cursor': first['next_cursor']}, headers=athlete).json()
    assert [item['name'] for item in first['items'] + rest['items']] == names and rest['next_cursor'] is None
    assert http.get('/api/v1/events').status_code == 401


def test_my_active_entries_page_by_the_event_start(client):
    http, db = client
    _, owner_id, permission = organizer(http, db)
    athlete, _ = account(http, db, 'ana')
    now = utcnow()
    events = [tennis_event(db, owner_id, permission, name=f'Torneio {days}', starts_at=now + timedelta(days=days),
                           registration_closes_at=now + timedelta(days=days - 1)) for days in (9, 3, 6)]
    for event in events:
        assert http.post(f'/api/v1/events/{event.id}/entries', json={}, headers=athlete).status_code == 201
    first = http.get('/api/v1/me/entries', params={'limit': 2}, headers=athlete).json()
    assert [item['event']['name'] for item in first['items']] == ['Torneio 3', 'Torneio 6'] and first['next_cursor']
    rest = http.get('/api/v1/me/entries', params={'limit': 2, 'cursor': first['next_cursor']}, headers=athlete).json()
    assert [item['event']['name'] for item in rest['items']] == ['Torneio 9'] and rest['next_cursor'] is None
    assert http.get('/api/v1/entries/999999', headers=athlete).json()['detail'] == 'Inscrição não encontrada.'
    assert http.get('/api/v1/me/entries', params={'cursor': 'x'}, headers=athlete).status_code == 422


def test_free_entry_cannot_be_given_up_after_the_start(client):
    http, db = client
    _, owner_id, permission = organizer(http, db)
    athlete, _ = account(http, db, 'ana')
    event = tennis_event(db, owner_id, permission)
    entry = http.post(f'/api/v1/events/{event.id}/entries', json={}, headers=athlete).json()
    now = utcnow()
    event.registration_closes_at, event.starts_at, event.state = now - timedelta(hours=2), now - timedelta(hours=1), \
        'em_andamento'
    db.flush()
    assert http.get(f"/api/v1/entries/{entry['id']}", headers=athlete).json()['can_cancel'] is False
    response = http.delete(f"/api/v1/entries/{entry['id']}", headers=athlete)
    assert (response.status_code, response.json()['detail']) == (409, 'O evento já começou.')
    assert http.get(f'/api/v1/events/{event.id}', headers=athlete).json()['phase'] == 'em_andamento'

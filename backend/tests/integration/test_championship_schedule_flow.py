"""Agenda das partidas do campeonato no PostgreSQL (docs/decisoes/0003, seção 21; 0002, seção 17): horário livre,
conflito de 2 h, elencos avisados, permissões do organizador, chat e lista S1."""
from datetime import timedelta

from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.identity import City, User
from app.models.matches import Court, Match, MatchMessage
from app.models.notifications import Notification
from tests.integration.championship_helpers import (
    API,
    bracket,
    confirm,
    confirmed_world,
    draw,
    event_matches,
    install_clock,
    kickoff,
    organizer_with_teams,
    schedule,
    sides_of,
)
from tests.integration.partida.helpers import make_court
from tests.integration.team_helpers import register

H = timedelta(hours=1)


def matches_of(db, world):
    return list(db.scalars(select(Match).where(Match.event_id == world['event_id']).order_by(Match.id)))


def rows(http, world):
    return {item['label']: item for item in event_matches(http, world)['items']}


def notes(db, user_id, type_):
    return list(db.scalars(select(Notification).where(Notification.user_id == user_id, Notification.type == type_)
                           .order_by(Notification.id)))


def test_scheduling_sets_a_free_time_and_a_court_and_tells_both_rosters(client):
    http, db = client
    world = confirmed_world(http, db, 4)
    first, second = [match for match in matches_of(db, world) if match.round_number == 1]
    start = kickoff() + timedelta(minutes=7)           # free time: no 15-minute steps
    row = schedule(http, world, first.id, start)
    assert row['label'] == 'J1' and row['stage'] == 'Semifinal' and row['can_schedule'] is True
    assert row['card']['state'] == 'agendada' and row['card']['phase'] == 'agendada'
    assert row['card']['origin'] == 'campeonato' and row['card']['my_role'] == 'organizador'
    assert row['card']['court']['id'] == world['court'].id and row['card']['starts_at'].startswith(
        start.isoformat()[:16])
    assert row['placeholders'] == [None, None] and row['awaiting_decision'] is False
    db.refresh(first)
    assert first.state == 'agendada' and first.starts_at == start and first.court_id == world['court'].id
    assert first.result_deadline == start + 48 * H and first.booking_side is None
    sides = sides_of(db, world, first.id)
    for team in world['teams']:
        got = notes(db, team['user_id'], 'partida_agendada')
        if team['team_id'] in sides.values():
            assert len(got) == 1
            assert got[0].payload['match_id'] == first.id and got[0].payload['changed'] is False
            assert got[0].payload['terms_id'] is None and got[0].payload['event_name'] == 'Copa do Lago'
            assert got[0].actor_id == world['owner_id']
        else:
            assert got == []
    banner = db.scalars(select(MatchMessage).where(MatchMessage.match_id == first.id, MatchMessage.kind == 'evento',
                                                   MatchMessage.event_type == 'partida_agendada')).one()
    assert banner.author_id == world['owner_id'] and 'Quadra Central' in banner.body
    audit = db.scalar(select(AuditLog).where(AuditLog.action == 'partida.agendada', AuditLog.target_id == first.id))
    assert audit.data['court_id'] == world['court'].id and audit.actor_id == world['owner_id']
    db.refresh(second)
    assert second.state == 'combinando'


def test_same_court_less_than_two_hours_apart_is_a_conflict_with_the_match_that_clashes(client):
    http, db = client
    world = confirmed_world(http, db, 8)
    one, two, three, four = [match for match in matches_of(db, world) if match.round_number == 1]
    start = kickoff()
    schedule(http, world, one.id, start)
    clash = schedule(http, world, two.id, start + timedelta(minutes=119), expected=409)
    assert clash['conflict'] == {
        'kind': 'quadra', 'match_id': one.id, 'label': 'J1', 'stage': 'Quartas de final',
        'starts_at': clash['conflict']['starts_at'], 'court_name': 'Quadra Central'}
    assert 'Quadra Central já tem o J1 a menos de 2 h' in clash['detail']
    # The same time before the other match conflicts too, and nothing was written for the refused match.
    assert schedule(http, world, two.id, start - timedelta(minutes=90), expected=409)['conflict']['match_id'] == one.id
    db.refresh(two)
    assert two.state == 'combinando' and two.starts_at is None
    assert not any(notes(db, team['user_id'], 'partida_agendada') for team in world['teams']
                   if team['team_id'] in sides_of(db, world, two.id).values())
    # Exactly two hours apart is free; another court is free at the same time.
    schedule(http, world, two.id, start + 2 * H)
    other = make_court(db, 'Quadra Lateral')
    schedule(http, world, three.id, start + 2 * H, court_id=other.id)
    free = schedule(http, world, four.id, start + 30 * H, court_id=world['court'].id)
    assert free['card']['state'] == 'agendada'


def test_a_competitor_cannot_play_two_matches_less_than_two_hours_apart(client):
    http, db = client
    world = confirmed_world(http, db, 4, competition_type='todos_contra_todos', capacity=6)
    ids = {match.id: sides_of(db, world, match.id) for match in matches_of(db, world)}
    first = next(match for match in matches_of(db, world))
    sharing = next(match for match in matches_of(db, world)
                   if match.id != first.id and set(ids[match.id].values()) & set(ids[first.id].values()))
    other_court = make_court(db, 'Quadra Lateral')
    start = kickoff()
    schedule(http, world, first.id, start)
    clash = schedule(http, world, sharing.id, start + H, court_id=other_court.id, expected=409)
    assert clash['conflict']['kind'] == 'time' and clash['conflict']['match_id'] == first.id
    assert 'já joga o J1 a menos de 2 h' in clash['detail']
    schedule(http, world, sharing.id, start + 2 * H, court_id=other_court.id)


def test_changing_a_schedule_before_the_start_notifies_again_and_a_started_match_is_locked(client, monkeypatch):
    http, db = client
    clock = install_clock(monkeypatch)
    world = confirmed_world(http, db, 4)
    first = matches_of(db, world)[0]
    start = kickoff()
    schedule(http, world, first.id, start)
    again = schedule(http, world, first.id, start + 5 * H)          # itself is not a conflict
    assert again['card']['starts_at'].startswith((start + 5 * H).isoformat()[:16])
    reps = [team['user_id'] for team in world['teams'] if team['team_id'] in sides_of(db, world, first.id).values()]
    changed = notes(db, reps[0], 'partida_agendada')
    assert [item.payload['changed'] for item in changed] == [False, True]
    assert db.scalar(select(AuditLog).where(AuditLog.action == 'partida.reagendada')).data['previous'] is not None
    db.refresh(first)
    assert first.result_deadline == start + 53 * H
    clock.set(start + 6 * H)
    started = schedule(http, world, first.id, start + 80 * H, expected=409)
    assert 'já começou' in started['detail']


def test_the_court_is_chosen_or_suggested_and_the_suggestion_stays_under_review(client):
    http, db = client
    world = confirmed_world(http, db, 4)
    first, second = [match for match in matches_of(db, world) if match.round_number == 1]
    start = kickoff()
    body = {'starts_at': start.isoformat()}
    url = f'{API}/organizer/matches/{first.id}/schedule'
    for payload in (body, {**body, 'court_id': world['court'].id, 'court_suggestion': {'name': 'Quadra Nova'}}):
        refused = http.put(url, json=payload, headers=world['organizer'])
        assert refused.status_code == 422 and refused.json()['fields'][0]['field'] == 'court_id'
    foreign = make_court(db, 'Quadra de Tênis', kind='tenis')
    other_city = make_court(db, 'Quadra Paulista', city_id=3550308)
    for court in (foreign, other_city):
        wrong = http.put(url, json={**body, 'court_id': court.id}, headers=world['organizer'])
        assert wrong.status_code == 422 and wrong.json()['fields'][0]['field'] == 'court_id'
    assert http.put(url, json={**body, 'court_id': 999999}, headers=world['organizer']).status_code == 422
    row = http.put(url, json={**body, 'court_suggestion': {'name': '  Arena   do Bosque ', 'address': 'SQN 100'}},
                   headers=world['organizer'])
    assert row.status_code == 200, row.text
    court = db.scalars(select(Court).where(Court.origin_match_id == first.id)).one()
    assert court.state == 'em_revisao' and court.name == 'Arena do Bosque' and court.kind == 'society'
    assert court.suggested_by_id == world['owner_id'] and court.address == 'SQN 100'
    assert row.json()['card']['court']['provisional'] is True
    # The same suggestion in the same match is reused; the suggestion is valid only in the match that made it.
    again = http.put(url, json={**body, 'court_suggestion': {'name': 'arena do bosque'}}, headers=world['organizer'])
    assert again.status_code == 200 and len(db.scalars(select(Court).where(Court.origin_match_id == first.id)).all()) == 1
    elsewhere = http.put(f'{API}/organizer/matches/{second.id}/schedule', json={
        'starts_at': (start + 4 * H).isoformat(), 'court_id': court.id}, headers=world['organizer'])
    assert elsewhere.status_code == 422
    assert db.scalar(select(AuditLog).where(AuditLog.action == 'quadra.sugerida')).data['event_id'] == world['event_id']
    assert db.get(City, court.city_id).name == 'Brasília'


def test_a_suggestion_limit_and_the_time_rules(client):
    http, db = client
    world = confirmed_world(http, db, 4)
    first = matches_of(db, world)[0]
    url = f'{API}/organizer/matches/{first.id}/schedule'
    start = kickoff()

    def put(starts_at, **extra):
        payload = {'starts_at': starts_at, 'court_id': world['court'].id, **extra}
        return http.put(url, json=payload, headers=world['organizer'])

    assert put('2026-12-01T10:00:00').status_code == 422                       # no time zone
    past = put((start - timedelta(days=30)).isoformat())
    assert past.status_code == 422 and 'não passaram' in past.json()['detail']
    far = put((start + timedelta(days=400)).isoformat())
    assert far.status_code == 422 and '12 meses' in far.json()['detail']
    assert put(start.isoformat(), extra=1).status_code == 422                  # unknown fields are refused
    for index in range(3):
        suggested = http.put(url, json={'starts_at': (start + timedelta(days=index + 1)).isoformat(),
                                        'court_suggestion': {'name': f'Quadra Sugerida {index}'}},
                             headers=world['organizer'])
        assert suggested.status_code == 200, suggested.text
    fourth = http.put(url, json={'starts_at': start.isoformat(), 'court_suggestion': {'name': 'Quadra Quatro'}},
                      headers=world['organizer'])
    assert fourth.status_code == 409 and 'já tem 3 sugestões' in fourth.json()['detail']


def test_a_match_waits_for_both_sides_and_for_the_confirmed_bracket(client):
    http, db = client
    world = confirmed_world(http, db, 4)
    unknown = http.put(f'{API}/organizer/matches/999999/schedule', json={
        'starts_at': kickoff().isoformat(), 'court_id': world['court'].id}, headers=world['organizer'])
    assert unknown.status_code == 404
    final = [match for match in matches_of(db, world) if match.round_number == 2][0]
    waiting = schedule(http, world, final.id, kickoff(), expected=409)
    assert waiting['detail'] == 'Esta partida ainda espera o resultado dos jogos anteriores.'


def test_only_the_organizer_schedules_and_others_get_403_or_404(client):
    http, db = client
    world = confirmed_world(http, db, 4)
    first = matches_of(db, world)[0]
    url = f'{API}/organizer/matches/{first.id}/schedule'
    body = {'starts_at': kickoff().isoformat(), 'court_id': world['court'].id}
    in_match = next(team for team in world['teams'] if team['team_id'] in sides_of(db, world, first.id).values())
    out_of_match = next(team for team in world['teams'] if team['team_id'] not in sides_of(db, world, first.id).values())
    stranger, stranger_id = register(http, 'stranger@example.com')
    admin_headers, admin_id = register(http, 'admin@example.com')
    db.get(User, admin_id).is_admin = True
    db.commit()
    other, _ = register(http, 'other-organizer@example.com')
    assert http.put(url, json=body, headers=in_match['headers']).status_code == 403
    assert http.put(url, json=body, headers=admin_headers).status_code == 403
    for headers in (stranger, out_of_match['headers'], other):
        assert http.put(url, json=body, headers=headers).status_code == 404
    assert http.put(url, json=body).status_code == 401
    db.refresh(first)
    assert first.state == 'combinando' and first.starts_at is None


def test_the_list_puts_matches_without_a_date_first_and_names_the_winners_to_come(client):
    http, db = client
    world = confirmed_world(http, db, 4)
    listing = event_matches(http, world)
    assert [item['label'] for item in listing['items']] == ['J1', 'J2', 'J3']
    assert listing['counts'] == {'total': 3, 'to_schedule': 2, 'waiting': 1, 'scheduled': 0, 'to_decide': 0,
                                 'finished': 0}
    final = listing['items'][2]
    assert final['stage'] == 'Final' and final['placeholders'] == ['Vencedor J1', 'Vencedor J2']
    assert final['can_schedule'] is False and final['card']['sides'] == []
    assert listing['items'][0]['stage'] == 'Semifinal' and listing['items'][0]['can_schedule'] is True
    assert [len(item['card']['sides']) for item in listing['items'][:2]] == [2, 2]
    first, second = [match for match in matches_of(db, world) if match.round_number == 1]
    schedule(http, world, second.id, kickoff())
    after = event_matches(http, world)
    assert [item['label'] for item in after['items']] == ['J1', 'J3', 'J2']
    assert after['counts']['to_schedule'] == 1 and after['counts']['scheduled'] == 1
    # The owner and the administration read it; teams and strangers do not.
    url = f'{API}/organizer/events/{world["event_id"]}/matches'
    assert http.get(url, headers=world['teams'][0]['headers']).status_code == 404
    assert http.get(url, headers=register(http, 'x@example.com')[0]).status_code == 404
    assert http.get(f'{API}/organizer/events/999999/matches', headers=world['organizer']).status_code == 404


def test_the_organizer_takes_part_in_the_chat_and_the_conditions_have_no_counter_proposal(client):
    http, db = client
    world = confirmed_world(http, db, 4)
    first = matches_of(db, world)[0]
    sides = sides_of(db, world, first.id)
    rep = next(team for team in world['teams'] if team['team_id'] == sides['a'])
    chat = f'{API}/matches/{first.id}'
    detail = http.get(chat, headers=world['organizer']).json()
    assert detail['my_role'] == 'organizador' and detail['my_side'] is None and detail['origin'] == 'campeonato'
    assert detail['event'] == {'id': world['event_id'], 'name': 'Copa do Lago'}
    permissions = detail['permissions']
    assert permissions['read_chat'] and permissions['write_chat'] and permissions['schedule_match']
    assert not any(permissions[name] for name in (
        'propose_terms', 'accept_terms', 'cancel', 'report_result', 'register_walkover', 'attendance',
        'decide_result'))
    assert detail['needs_my_action'] is True
    sent = http.post(f'{chat}/messages', json={'body': 'Jogo marcado para sábado.'}, headers=world['organizer'])
    assert sent.status_code == 201 and sent.json()['author_role'] == 'organizador' and sent.json()['side'] is None
    reply = http.post(f'{chat}/messages', json={'body': 'Combinado!'}, headers=rep['headers'])
    assert reply.status_code == 201 and reply.json()['author_role'] == 'representante'
    page = http.get(f'{chat}/messages', headers=rep['headers']).json()
    assert [item['author_role'] for item in page['items'] if item['kind'] == 'texto'] == ['organizador', 'representante']
    # The teams cannot propose conditions, cancel or register a walkover: the organizer defines them.
    mine = http.get(chat, headers=rep['headers']).json()['permissions']
    assert not any(mine[name] for name in ('propose_terms', 'accept_terms', 'cancel', 'register_walkover',
                                          'suggest_court', 'schedule_match', 'decide_result'))
    terms = http.post(f'{chat}/terms', json={'starts_at': kickoff().isoformat(), 'court_id': world['court'].id,
                                             'booking_side': 'a'}, headers=rep['headers'])
    assert terms.status_code == 409 and terms.json()['detail'] == 'Num campeonato, o organizador define data, horário e quadra.'
    cancel = http.post(f'{chat}/cancel', json={}, headers=rep['headers'])
    assert cancel.status_code == 409 and cancel.json()['detail'] == 'Partidas de campeonato são canceladas pelo organizador.'
    walkover = http.post(f'{chat}/walkover', json={}, headers=rep['headers'])
    assert walkover.status_code == 409 and 'decidido pelo organizador' in walkover.json()['detail']
    # A stranger sees nothing; the administration reads the chat but cannot write.
    stranger, _ = register(http, 'stranger@example.com')
    assert http.get(chat, headers=stranger).status_code == 404
    assert http.get(f'{chat}/messages', headers=stranger).status_code == 404
    assert http.post(f'{chat}/messages', json={'body': 'oi'}, headers=stranger).status_code == 404
    admin_headers, admin_id = register(http, 'admin@example.com')
    db.get(User, admin_id).is_admin = True
    db.commit()
    assert http.get(f'{chat}/messages', headers=admin_headers).status_code == 200
    assert http.post(f'{chat}/messages', json={'body': 'oi'}, headers=admin_headers).status_code == 403


def test_the_organizers_poster_and_next_action_follow_the_bracket(client):
    http, db = client
    world = organizer_with_teams(http, db, 4)
    url = f'{API}/organizer/events/{world["event_id"]}'

    def card():
        return http.get(url, headers=world['organizer']).json()

    before = card()
    assert before['next_action']['kind'] == 'sortear_chaveamento' and before['next_action']['count'] == 4
    assert before['championship']['bracket'] == 'sem_chaveamento' and before['championship']['confirmed'] == 4
    draw(http, world)
    assert card()['next_action']['kind'] == 'confirmar_chaveamento'
    confirm(http, world)
    after = card()
    assert after['state'] == 'em_andamento' and after['next_action'] == {
        'kind': 'agendar_partidas', 'count': 2, 'deadline': None}
    assert after['championship'] == {'bracket': 'confirmado', 'confirmed': 4, 'matches_total': 3, 'to_schedule': 2,
                                     'waiting': 1, 'scheduled': 0, 'to_decide': 0, 'finished': 0, 'attention': 2}
    listed = http.get(f'{API}/organizer/events', headers=world['organizer']).json()['items']
    assert listed[0]['championship']['to_schedule'] == 2
    for match in matches_of(db, world)[:2]:
        schedule(http, world, match.id, kickoff() + timedelta(hours=3 * match.bracket_position))
    done = card()
    assert done['next_action']['kind'] == 'acompanhar_partidas' and done['next_action']['count'] == 2
    assert done['championship']['attention'] == 0 and done['championship']['scheduled'] == 2
    assert bracket(http, world['organizer'], world['event_id'])['rounds'][0]['nodes'][0]['match']['court_name'] == (
        'Quadra Central')


def test_cancelling_the_event_cancels_its_open_matches(client):
    http, db = client
    world = confirmed_world(http, db, 4)
    first = matches_of(db, world)[0]
    schedule(http, world, first.id, kickoff())
    cancelled = http.post(f'{API}/organizer/events/{world["event_id"]}/cancel', json={'reason': 'Quadra interditada.'},
                          headers=world['organizer'])
    assert cancelled.status_code == 200 and cancelled.json()['state'] == 'cancelado'
    for match in matches_of(db, world):
        db.refresh(match)
    assert {match.state for match in matches_of(db, world)} == {'cancelada'}
    assert all(match.closed_at is not None and match.cancelled_by_id == world['owner_id']
               for match in matches_of(db, world))
    late = schedule(http, world, first.id, kickoff(), expected=409)
    assert late['detail'] == 'Este evento não aceita mais agendamento.'

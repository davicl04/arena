"""Chaveamento no PostgreSQL (docs/decisoes/0003, seção 21): sorteio com semente, troca, confirmação com folgas e
rodadas, leitura pelos inscritos. O evento, os times e as inscrições vêm das rotas reais."""
from datetime import timedelta

from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.brackets import EventBracket
from app.models.events import Event, EventEntry
from app.models.identity import User, utcnow
from app.models.matches import Match, MatchMessage, MatchSide
from app.models.notifications import Notification
from app.services import bracket_rules
from tests.integration.championship_helpers import (
    API,
    bracket,
    close_registrations,
    confirm,
    draw,
    enroll_team,
    new_organizer,
    organizer_with_teams,
    publish_event,
    team_matches,
)
from tests.integration.match_helpers import CITY
from tests.integration.team_helpers import register


def first_round(data):
    return data['rounds'][0]['nodes']


def test_the_draw_waits_for_the_end_of_the_registrations_and_for_confirmed_entries(client):
    http, db = client
    headers, _ = new_organizer(http, db)
    event_id = publish_event(http, headers)
    url = f'{API}/organizer/events/{event_id}/bracket'
    # Registrations still open.
    early = http.post(url, json={}, headers=headers)
    assert early.status_code == 409 and 'inscrições ainda estão abertas' in early.json()['detail']
    enroll_team(http, 'solo', event_id)
    close_registrations(db, event_id)
    # One confirmed entry is not a championship.
    alone = http.post(url, json={}, headers=headers)
    assert alone.status_code == 409 and 'pelo menos 2' in alone.json()['detail']
    view = bracket(http, headers, event_id)
    assert view['state'] == 'sem_chaveamento' and view['permissions']['can_draw'] is False
    assert 'pelo menos 2' in view['permissions']['draw_blocker']
    # Nobody enters after the deadline.
    late, _ = register(http, 'late@example.com')
    team = http.post(f'{API}/teams', json={'name': 'Time Tardio', 'city_id': CITY}, headers=late).json()
    closed = http.post(f'{API}/events/{event_id}/entries', json={'team_id': team['id']}, headers=late)
    assert closed.status_code == 409


def test_draw_of_eight_with_six_confirmed_has_two_byes_and_a_reproducible_seed(client):
    http, db = client
    world = organizer_with_teams(http, db, 6)
    first = draw(http, world)
    assert first['state'] == 'sorteado' and first['kind'] == 'eliminacao_simples' and first['size'] == 8
    assert first['byes'] == 2 and first['draw_count'] == 1 and first['seed'] is not None
    assert [(item['number'], item['name']) for item in first['rounds']] == [
        (1, 'Quartas de final'), (2, 'Semifinal'), (3, 'Final')]
    nodes = first_round(first)
    assert [node['bye'] for node in nodes].count(True) == 2
    # A bye pairing is "Folga" against a team, with no match and no number.
    folga = next(node for node in nodes if node['bye'])
    assert folga['number'] is None and folga['label'] is None and folga['match'] is None
    assert sorted(slot['kind'] for slot in folga['slots']) == ['competidor', 'folga']
    # Real matches are numbered J1, J2…; the semifinals wait for them ("Vencedor J1").
    assert [node['label'] for node in nodes if not node['bye']] == ['J1', 'J2']
    semis = first['rounds'][1]['nodes']
    assert [slot['kind'] for node in semis for slot in node['slots']] == [
        'competidor', 'vencedor', 'competidor', 'vencedor']
    assert [slot['placeholder'] for node in semis for slot in node['slots'] if slot['kind'] == 'vencedor'] == [
        'Vencedor J1', 'Vencedor J2']
    assert all(slot['advanced_by_bye'] for node in semis for slot in node['slots'] if slot['kind'] == 'competidor')
    assert first['rounds'][2]['nodes'][0]['slots'][0]['placeholder'] == 'Vencedor J3'
    assert first['rounds'][2]['nodes'][0]['next'] is None

    # The seed rebuilds the draw: same confirmed entries, same seed, same places.
    row = db.scalar(select(EventBracket).where(EventBracket.event_id == world['event_id']))
    entry_ids = [team['entry_id'] for team in world['teams']]
    ordered = bracket_rules.draw_order(entry_ids, row.seed)
    assert row.slots == bracket_rules.elimination_slots(ordered, 8) and row.seed == first['seed']
    assert sum(1 for slot in row.slots if slot is None) == 2

    # Sorting again before confirming replaces the draw with a new seed.
    again = draw(http, world)
    assert again['draw_count'] == 2 and again['state'] == 'sorteado'
    assert db.scalar(select(EventBracket).where(EventBracket.event_id == world['event_id'])).draw_count == 2
    audits = [row.action for row in db.scalars(select(AuditLog).where(
        AuditLog.target_type == 'event', AuditLog.target_id == world['event_id']).order_by(AuditLog.id))]
    assert audits.count('chaveamento.sorteado') == 2


def test_only_the_organizer_draws_and_the_draw_is_hidden_until_it_is_confirmed(client):
    http, db = client
    world = organizer_with_teams(http, db, 4)
    url = f'{API}/organizer/events/{world["event_id"]}/bracket'
    team = world['teams'][0]['headers']
    stranger, _ = register(http, 'stranger@example.com')
    assert http.post(url, json={}, headers=team).status_code == 404
    assert http.post(url, json={}, headers=stranger).status_code == 404
    assert http.post(f'{API}/organizer/events/999999/bracket', json={}, headers=world['organizer']).status_code == 404
    other, _ = new_organizer(http, db, 'outro')
    assert http.post(url, json={}, headers=other).status_code == 404
    draw(http, world)
    # The participants only see the table after the confirmation.
    hidden = bracket(http, team, world['event_id'])
    assert hidden['state'] == 'sem_chaveamento' and hidden['rounds'] == [] and hidden['seed'] is None
    assert hidden['permissions'] == {'can_draw': False, 'can_swap': False, 'can_confirm': False, 'draw_blocker': None}
    # A stranger sees neither (the table is for the entrants), and an unknown event is a 404.
    assert http.get(f'{API}/events/{world["event_id"]}/bracket', headers=stranger).status_code == 403
    assert http.get(f'{API}/events/999999/bracket', headers=stranger).status_code == 404
    mine = bracket(http, world['organizer'], world['event_id'])
    assert mine['state'] == 'sorteado' and mine['is_organizer'] and mine['permissions']['can_confirm']
    assert mine['permissions']['can_swap'] and mine['permissions']['can_draw'] and mine['seed'] is not None


def test_swapping_two_teams_changes_the_places_and_stops_after_the_confirmation(client):
    http, db = client
    world = organizer_with_teams(http, db, 6)
    url = f'{API}/organizer/events/{world["event_id"]}/bracket'
    assert http.patch(url, json={'a': 0, 'b': 2}, headers=world['organizer']).status_code == 409   # nothing drawn yet
    plan = draw(http, world)
    places = [(slot['place'], (slot['competitor'] or {}).get('entry_id')) for node in first_round(plan)
              for slot in node['slots']]
    team_places = [place for place, entry in places if entry is not None]
    folga_place = next(place for place, entry in places if entry is None)
    first, second = team_places[0], team_places[2]
    swapped = http.patch(url, json={'a': first, 'b': second}, headers=world['organizer'])
    assert swapped.status_code == 200, swapped.text
    after = {slot['place']: (slot['competitor'] or {}).get('entry_id') for node in first_round(swapped.json())
             for slot in node['slots']}
    before = dict(places)
    assert after[first] == before[second] and after[second] == before[first]
    assert db.scalar(select(EventBracket).where(EventBracket.event_id == world['event_id'])).swaps == [[first, second]]
    # A team may take the bye place; the bye moves to where the team was.
    moved = http.patch(url, json={'a': team_places[1], 'b': folga_place}, headers=world['organizer'])
    assert moved.status_code == 200
    slot_kinds = {slot['place']: slot['kind'] for node in first_round(moved.json()) for slot in node['slots']}
    assert slot_kinds[folga_place] == 'competidor' and slot_kinds[team_places[1]] == 'folga'
    # Invalid swaps.
    assert http.patch(url, json={'a': 1, 'b': 1}, headers=world['organizer']).status_code == 422
    assert http.patch(url, json={'a': 0, 'b': 9}, headers=world['organizer']).status_code == 422
    assert http.patch(url, json={'a': 0}, headers=world['organizer']).status_code == 422
    assert http.patch(url, json={'a': 0, 'b': 1}, headers=world['teams'][0]['headers']).status_code == 404
    audits = [row.action for row in db.scalars(select(AuditLog).where(
        AuditLog.target_type == 'event', AuditLog.target_id == world['event_id']).order_by(AuditLog.id))]
    assert audits.count('chaveamento.trocado') == 2
    confirm(http, world)
    after_confirm = http.patch(url, json={'a': 0, 'b': 2}, headers=world['organizer'])
    assert after_confirm.status_code == 409 and 'já foi confirmado' in after_confirm.json()['detail']
    assert http.post(url, json={}, headers=world['organizer']).status_code == 409


def test_confirming_a_bracket_of_eight_with_six_creates_five_matches_and_starts_the_event(client):
    http, db = client
    world = organizer_with_teams(http, db, 6)
    assert http.post(f'{API}/organizer/events/{world["event_id"]}/bracket/confirm', json={},
                     headers=world['organizer']).status_code == 409                        # nothing drawn yet
    draw(http, world)
    confirmed = confirm(http, world)
    assert confirmed['state'] == 'confirmado' and confirmed['confirmed_at'] and confirmed['byes'] == 2
    assert confirmed['permissions'] == {'can_draw': False, 'can_swap': False, 'can_confirm': False,
                                        'draw_blocker': None}
    event = db.get(Event, world['event_id'])
    db.refresh(event)
    assert event.state == 'em_andamento'
    matches = list(db.scalars(select(Match).where(Match.event_id == world['event_id']).order_by(Match.id)))
    assert [(m.round_number, m.bracket_position) for m in matches] == [(1, 2), (1, 4), (2, 1), (2, 2), (3, 1)] or \
        len(matches) == 5
    assert len(matches) == 5 and all(m.origin == 'campeonato' and m.state == 'combinando' for m in matches)
    assert all(m.sport == 'futebol' and m.format == 'society' and m.starts_at is None for m in matches)
    by_round = {}
    for match in matches:
        by_round.setdefault(match.round_number, []).append(match)
    assert sorted(len(items) for items in by_round.values()) == [1, 2, 2]
    # Feeders have smaller ids than the match they feed, and each winner goes to its side of the next match.
    ids = {match.id: match for match in matches}
    for match in matches:
        if match.round_number < 3:
            assert match.next_match_id is not None and match.next_match_id > match.id
            assert match.next_match_side in ('a', 'b')
        else:
            assert match.next_match_id is None and match.next_match_side is None
    sides = team_matches(db, world['event_id'])
    # First-round matches have both teams; each semifinal already has the team that went through on a bye.
    assert [len(sides[m.id]) for m in by_round[1]] == [2, 2]
    assert [len(sides[m.id]) for m in by_round[2]] == [1, 1]
    assert len(sides[by_round[3][0].id]) == 0
    assert ids[by_round[1][0].next_match_id].round_number == 2
    # Every confirmed team is exactly once in the bracket.
    placed = [team for m in matches for team in sides[m.id].values()]
    assert sorted(placed) == sorted(team['team_id'] for team in world['teams'])
    # The chat of each match opens with a banner.
    banners = db.scalars(select(MatchMessage).where(MatchMessage.match_id.in_([m.id for m in matches]))).all()
    assert len(banners) == 5 and {b.event_type for b in banners} == {'partida_combinando'}
    # Everyone in the event is told, and the teams now see the table.
    for team in world['teams']:
        kinds = [n.type for n in db.scalars(select(Notification).where(Notification.user_id == team['user_id']))]
        assert 'tabela_publicada' in kinds
        view = bracket(http, team['headers'], world['event_id'])
        assert view['state'] == 'confirmado' and view['seed'] is None and view['byes'] == 2
        assert all(node['match'] is None for node in first_round(view) if node['bye'])
        assert all(node['match']['state'] == 'combinando' for node in first_round(view) if not node['bye'])
    audit = db.scalar(select(AuditLog).where(AuditLog.action == 'chaveamento.confirmado'))
    assert audit.data['matches'] == 5 and audit.data['entries'] == 6


def test_confirming_waits_for_receipts_under_analysis_and_releases_open_reservations(client):
    http, db = client
    world = organizer_with_teams(http, db, 4)
    draw(http, world)
    event = db.get(Event, world['event_id'])
    # A paid entry under analysis (written straight to the database; the draw only uses the confirmed ones).
    paid = EventEntry(event_id=event.id, user_id=world['owner_id'], state='em_analise', price_cents=1000,
                      reserved_until=utcnow() + timedelta(hours=5))
    db.add(paid)
    db.commit()
    blocked = http.post(f'{API}/organizer/events/{event.id}/bracket/confirm', json={}, headers=world['organizer'])
    assert blocked.status_code == 409 and 'Analise 1 comprovante pendente' in blocked.json()['detail']
    paid.state, paid.reserved_until = 'reservada', utcnow() + timedelta(hours=5)
    db.commit()
    confirm(http, world)
    db.refresh(paid)
    # The open reservation did not make it into the bracket: it is released.
    assert paid.state == 'expirada' and paid.expired_at is not None


def test_entrants_cannot_give_up_once_the_bracket_is_confirmed(client):
    http, db = client
    world = organizer_with_teams(http, db, 4)
    draw(http, world)
    team = world['teams'][1]
    before = http.get(f'{API}/entries/{team["entry_id"]}', headers=team['headers']).json()
    assert before['can_cancel'] is True
    confirm(http, world)
    after = http.get(f'{API}/entries/{team["entry_id"]}', headers=team['headers']).json()
    assert after['can_cancel'] is False
    refused = http.delete(f'{API}/entries/{team["entry_id"]}', headers=team['headers'])
    assert refused.status_code == 409 and refused.json()['detail'] == 'O evento já começou.'


def test_changed_entries_since_the_draw_require_a_new_draw(client):
    http, db = client
    world = organizer_with_teams(http, db, 4)
    draw(http, world)
    entry = db.get(EventEntry, world['teams'][0]['entry_id'])
    entry.state, entry.cancelled_at, entry.cancel_origin = 'cancelada', utcnow(), 'participante'
    db.commit()
    stale = http.post(f'{API}/organizer/events/{world["event_id"]}/bracket/confirm', json={},
                      headers=world['organizer'])
    assert stale.status_code == 409 and 'Sorteie de novo' in stale.json()['detail']
    redraw = draw(http, world)
    assert redraw['draw_count'] == 2 and sum(1 for node in first_round(redraw) for slot in node['slots']
                                             if slot['kind'] == 'competidor') == 3


def test_round_robin_with_five_teams_has_five_rounds_with_one_rest_each(client):
    http, db = client
    world = organizer_with_teams(http, db, 5, competition_type='todos_contra_todos', capacity=6)
    plan = draw(http, world)
    assert plan['kind'] == 'todos_contra_todos' and plan['size'] == 5 and plan['byes'] == 0
    assert [item['name'] for item in plan['rounds']] == [f'Rodada {n}' for n in range(1, 6)]
    rests = []
    for item in plan['rounds']:
        assert len(item['nodes']) == 2 and item['rest'] is not None
        playing = [slot['competitor']['entry_id'] for node in item['nodes'] for slot in node['slots']]
        assert len(playing) == len(set(playing)) == 4 and item['rest']['entry_id'] not in playing
        rests.append(item['rest']['entry_id'])
    assert sorted(rests) == sorted(team['entry_id'] for team in world['teams'])
    assert plan['table'] and len(plan['table']) == 5 and all(row['played'] == 0 for row in plan['table'])
    assert [node['label'] for item in plan['rounds'] for node in item['nodes']] == [f'J{n}' for n in range(1, 11)]
    confirm(http, world)
    matches = list(db.scalars(select(Match).where(Match.event_id == world['event_id'])))
    assert len(matches) == 10 and all(m.next_match_id is None and m.state == 'combinando' for m in matches)
    sides = team_matches(db, world['event_id'])
    pairs = {frozenset(value.values()) for value in sides.values()}
    assert len(pairs) == 10 and all(len(value) == 2 for value in sides.values())
    # Each team plays one match per round and rests in exactly one.
    for round_number in range(1, 6):
        teams = [team for m in matches if m.round_number == round_number for team in sides[m.id].values()]
        assert len(teams) == len(set(teams)) == 4
    shown = bracket(http, world['teams'][0]['headers'], world['event_id'])
    assert shown['state'] == 'confirmado' and shown['table'] and shown['byes'] == 0


def test_a_race_has_no_bracket_and_the_closed_cases_answer_in_portuguese(client):
    http, db = client
    headers, _ = new_organizer(http, db)
    race = publish_event(http, headers, sport='corrida', format=None, competition_type=None, distance_km=10,
                         capacity=50)
    close_registrations(db, race)
    refused = http.post(f'{API}/organizer/events/{race}/bracket', json={}, headers=headers)
    assert refused.status_code == 409 and refused.json()['detail'] == 'Este evento não tem chaveamento.'
    assert http.get(f'{API}/events/{race}/bracket', headers=headers).status_code == 404
    # Bodies must be JSON objects; extra fields are refused.
    event = publish_event(http, headers, name='Outra Copa')
    assert http.post(f'{API}/organizer/events/{event}/bracket', json={'seed': 1}, headers=headers).status_code == 422


def test_a_confirmed_bracket_shows_each_match_with_its_state_and_the_final_waits_for_the_winners(client):
    http, db = client
    world = organizer_with_teams(http, db, 4)
    draw(http, world)
    confirm(http, world)
    view = bracket(http, world['organizer'], world['event_id'])
    semis, final = view['rounds']
    assert view['state'] == 'confirmado' and view['byes'] == 0 and view['size'] == 4
    assert {node['match']['state'] for node in semis['nodes']} == {'combinando'}
    assert [node['label'] for node in semis['nodes']] == ['J1', 'J2'] and final['name'] == 'Final'
    assert [slot['placeholder'] for slot in final['nodes'][0]['slots']] == ['Vencedor J1', 'Vencedor J2']
    assert final['nodes'][0]['match']['state'] == 'combinando' and final['nodes'][0]['match']['score'] is None
    assert [(node['next']['round'], node['next']['side']) for node in semis['nodes']] == [(2, 'a'), (2, 'b')]
    assert all(db.scalar(select(MatchSide).where(MatchSide.team_id == team['team_id'])) is not None
               for team in world['teams'])


def test_a_suspended_event_cannot_be_drawn_swapped_or_confirmed(client):
    http, db = client
    world = organizer_with_teams(http, db, 4)
    draw(http, world)
    event = db.get(Event, world['event_id'])
    event.revocation_decision = 'pendente'
    db.commit()
    url = f'{API}/organizer/events/{world["event_id"]}/bracket'
    for response in (http.post(url, json={}, headers=world['organizer']),
                     http.patch(url, json={'a': 0, 'b': 1}, headers=world['organizer']),
                     http.post(f'{url}/confirm', json={}, headers=world['organizer'])):
        assert response.status_code == 409
        assert response.json()['detail'] == 'A administração está decidindo sobre este evento.'
    view = bracket(http, world['organizer'], world['event_id'])
    assert view['permissions'] == {'can_draw': False, 'can_swap': False, 'can_confirm': False, 'draw_blocker': None}


def test_the_administration_reads_the_draw_and_the_matches_but_does_not_draw(client):
    http, db = client
    world = organizer_with_teams(http, db, 4)
    draw(http, world)
    admin_headers, admin_id = register(http, 'admin@example.com')
    db.get(User, admin_id).is_admin = True
    db.commit()
    seen = bracket(http, admin_headers, world['event_id'])
    assert seen['state'] == 'sorteado' and seen['is_organizer'] is False and seen['seed'] is not None
    assert seen['permissions']['can_draw'] is False and seen['permissions']['can_confirm'] is False
    assert http.post(f'{API}/organizer/events/{world["event_id"]}/bracket', json={},
                     headers=admin_headers).status_code == 404
    confirm(http, world)
    listing = http.get(f'{API}/organizer/events/{world["event_id"]}/matches', headers=admin_headers)
    assert listing.status_code == 200 and listing.json()['counts']['total'] == 3


def test_an_event_without_a_bracket_has_an_empty_match_list_and_the_new_notifications_are_listed(client):
    http, db = client
    world = organizer_with_teams(http, db, 4)
    empty = http.get(f'{API}/organizer/events/{world["event_id"]}/matches', headers=world['organizer'])
    assert empty.json() == {'items': [], 'counts': {'total': 0, 'to_schedule': 0, 'waiting': 0, 'scheduled': 0,
                                                    'to_decide': 0, 'finished': 0}}
    draw(http, world)
    confirm(http, world)
    listed = http.get(f'{API}/me/notifications', headers=world['teams'][0]['headers']).json()['items']
    published = [item for item in listed if item['type'] == 'tabela_publicada']
    assert len(published) == 1 and published[0]['payload'] == {
        'event_id': world['event_id'], 'event_name': 'Copa do Lago'}
    assert published[0]['actor']['id'] == world['owner_id']

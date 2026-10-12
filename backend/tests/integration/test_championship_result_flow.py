"""Resultado e divergência nos campeonatos no PostgreSQL (docs/decisoes/0003, seção 21; 0002, seção 17): o cartão de
resultado dos amistosos, a divergência decidida pelo organizador com justificativa e auditoria, o W.O., o vencedor que
avança na chave e o encerramento do evento com o bônus do tênis."""
from datetime import timedelta

from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.brackets import EventPlacement, ResultDecision
from app.models.events import Event
from app.models.identity import User
from app.models.matches import Match, MatchMessage, MatchResult, MatchSide
from app.models.notifications import Notification
from app.models.rankings import Standing
from tests.integration.championship_helpers import (
    API,
    agree,
    bracket,
    confirmed_world,
    decide,
    diverge,
    event_matches,
    install_clock,
    kickoff,
    put_result,
    reporter,
    schedule_round,
    sides_of,
    sweep,
)
from tests.integration.team_helpers import register

H = timedelta(hours=1)
SETS = [{'a': 6, 'b': 4}, {'a': 6, 'b': 3}]


def matches_of(db, world, round_number=None):
    statement = select(Match).where(Match.event_id == world['event_id']).order_by(Match.id)
    return [match for match in db.scalars(statement) if round_number in (None, match.round_number)]


def notes(db, user_id, type_):
    return list(db.scalars(select(Notification).where(Notification.user_id == user_id, Notification.type == type_)
                           .order_by(Notification.id)))


def reps(world, db, match_id):
    sides = sides_of(db, world, match_id)
    return {label: next(team for team in world['teams'] if team.get('team_id', team['user_id']) == subject)
            for label, subject in sides.items()}


def started_world(http, db, monkeypatch, count=4, athletes=False, **event):
    """A confirmed bracket whose first round is scheduled; the clock is one hour after the last start."""
    clock = install_clock(monkeypatch)
    world = confirmed_world(http, db, count, athletes=athletes, **event)
    first = kickoff()
    world['starts'] = schedule_round(http, world, 1, first)
    clock.set(max(world['starts'].values()) + H)
    world['clock'] = clock
    world['first'] = first
    return world


def test_equal_reports_confirm_the_match_and_take_the_winner_to_the_next_one(client, monkeypatch):
    http, db = client
    world = started_world(http, db, monkeypatch)
    one, two = matches_of(db, world, 1)
    final = matches_of(db, world, 2)[0]
    assert final.next_match_id is None and one.next_match_id == final.id
    sides = sides_of(db, world, one.id)
    detail = agree(http, db, world, one.id, 3, 1)
    assert detail['state'] == 'realizada' and detail['result']['final']['a'] == 3
    assert detail['result']['source'] == 'confirmacao' and detail['origin'] == 'campeonato'
    # The winner (side A) sits on the side the first match feeds; the final still waits for the other semifinal.
    seated = db.scalars(select(MatchSide).where(MatchSide.match_id == final.id)).all()
    assert [(side.side, side.team_id) for side in seated] == [(one.next_match_side, sides['a'])]
    assert db.scalar(select(AuditLog).where(AuditLog.action == 'chaveamento.avancou')).data['from_match_id'] == one.id
    assert notes(db, world['teams'][0]['user_id'], 'adversario_definido') == []
    # The second semifinal closes the pairing: banner in the chat and both rosters know the opponent.
    other = sides_of(db, world, two.id)
    agree(http, db, world, two.id, 0, 2)
    db.refresh(final)
    both = sides_of(db, world, final.id)
    assert sorted(both.values()) == sorted([sides['a'], other['b']]) and final.state == 'combinando'
    banner = db.scalars(select(MatchMessage).where(MatchMessage.match_id == final.id,
                                                   MatchMessage.event_type == 'partida_combinando')).all()
    assert len(banner) == 2 and 'adversários definidos' in banner[-1].body
    for subject, opponent in ((sides['a'], other['b']), (other['b'], sides['a'])):
        rep = next(team for team in world['teams'] if team.get('team_id') == subject)
        got = notes(db, rep['user_id'], 'adversario_definido')
        assert len(got) == 1 and got[0].payload['match_id'] == final.id
        assert got[0].payload['opponent_name'] == next(
            team['name'] for team in world['teams'] if team.get('team_id') == opponent)
    # The result counts for the ranking of the teams, as in any other match.
    rows = db.scalars(select(Standing).where(Standing.team_id.in_([sides['a'], sides['b']]))).all()
    assert {(row.team_id, row.wins, row.losses) for row in rows} == {(sides['a'], 1, 0), (sides['b'], 0, 1)}


def test_a_knockout_match_refuses_a_football_draw(client, monkeypatch):
    http, db = client
    world = started_world(http, db, monkeypatch)
    one = matches_of(db, world, 1)[0]
    sides = sides_of(db, world, one.id)
    refused = http.put(f'{API}/matches/{one.id}/result', json={'goals_a': 2, 'goals_b': 2},
                       headers=reporter(world, sides['a']))
    assert refused.status_code == 422 and 'não há empate' in refused.json()['detail']
    assert db.scalars(select(MatchResult).where(MatchResult.match_id == one.id)).all() == []


def test_divergence_waits_for_the_organizer_and_is_decided_with_a_justification(client, monkeypatch):
    http, db = client
    world = started_world(http, db, monkeypatch)
    one = matches_of(db, world, 1)[0]
    final = matches_of(db, world, 2)[0]
    sides = sides_of(db, world, one.id)
    diverge(http, db, world, one.id, (2, 1), (1, 2))
    got = notes(db, world['owner_id'], 'divergencia_para_decidir')
    assert len(got) == 1 and got[0].payload['match_id'] == one.id and got[0].payload['event_name'] == 'Copa do Lago'
    assert got[0].payload['deadline'] is not None
    # The sweep does not turn a championship divergence into "sem resultado": the organizer decides.
    sweep(db, world['starts'][one.id] + timedelta(hours=60))
    db.refresh(one)
    assert one.state == 'agendada' and one.score_a is None
    listing = event_matches(http, world)
    row = next(item for item in listing['items'] if item['card']['id'] == one.id)
    assert row['awaiting_decision'] is True and row['card']['phase'] == 'divergente' and row['card']['needs_my_action']
    assert listing['counts']['to_decide'] >= 1
    card = http.get(f'{API}/organizer/events/{world["event_id"]}', headers=world['organizer']).json()
    assert card['next_action']['kind'] == 'decidir_divergencias' and card['next_action']['count'] >= 1
    # The detail shows both reports, who sent them, and what the organizer may do.
    detail = http.get(f'{API}/matches/{one.id}', headers=world['organizer']).json()
    assert detail['result']['state'] == 'divergente' and {key: value['score']['a'] for key, value in
                                                          detail['result']['reports'].items()} == {'a': 2, 'b': 1}
    assert detail['permissions']['decide_result'] is True and detail['permissions']['report_result'] is False

    url = f'{API}/organizer/matches/{one.id}/result-decision'
    body = {'score': {'goals_a': 2, 'goals_b': 1}, 'justification': 'Conferido no vídeo da partida.'}
    # Only the organizer decides: the teams and the administration see the match but get 403; strangers 404.
    rep = reps(world, db, one.id)['a']
    assert http.post(url, json=body, headers=rep['headers']).status_code == 403
    stranger, _ = register(http, 'stranger@example.com')
    assert http.post(url, json=body, headers=stranger).status_code == 404
    admin_headers, admin_id = register(http, 'admin@example.com')
    db.get(User, admin_id).is_admin = True
    db.commit()
    assert http.post(url, json=body, headers=admin_headers).status_code == 403
    # Justification of at least five characters; a knockout match needs a winner; a score is required.
    short = http.post(url, json={**body, 'justification': 'ok'}, headers=world['organizer'])
    assert short.status_code == 422 and short.json()['fields'][0]['field'] == 'justification'
    draw = http.post(url, json={**body, 'score': {'goals_a': 1, 'goals_b': 1}}, headers=world['organizer'])
    assert draw.status_code == 422 and 'não há empate' in draw.json()['detail']
    nothing = http.post(url, json={'justification': 'Sem placar informado.'}, headers=world['organizer'])
    assert nothing.status_code == 422 and nothing.json()['fields'][0]['field'] == 'score'
    both = http.post(url, json={**body, 'walkover_absent_side': 'b'}, headers=world['organizer'])
    assert both.status_code == 422
    db.refresh(one)
    assert one.state == 'agendada'

    decided = decide(http, world, one.id, **body)
    assert decided['state'] == 'encerrada' and decided['phase'] == 'encerrada'
    assert decided['result']['source'] == 'organizador' and decided['result']['decision_reason'] == (
        'Conferido no vídeo da partida.')
    assert decided['result']['final']['a'] == 2 and decided['score']['winner'] == 'a'
    db.refresh(one)
    assert one.result_source == 'organizador' and one.result_decided_by_id == world['owner_id']
    assert one.result_decision_reason == 'Conferido no vídeo da partida.' and one.closed_at is not None
    row = db.scalars(select(ResultDecision).where(ResultDecision.match_id == one.id)).one()
    assert (row.kind, row.score_a, row.score_b, row.winner_side) == ('divergencia', 2, 1, 'a')
    assert row.reports == {'a': {'score_a': 2, 'score_b': 1}, 'b': {'score_a': 1, 'score_b': 2}}
    assert row.justification == 'Conferido no vídeo da partida.' and row.decided_by_id == world['owner_id']
    audit = db.scalars(select(AuditLog).where(AuditLog.action == 'resultado.decidido')).one()
    assert audit.target_id == one.id and audit.actor_id == world['owner_id']
    assert audit.data['kind'] == 'divergencia' and audit.data['justification'] == 'Conferido no vídeo da partida.'
    assert audit.data['reports'] == row.reports
    # Both rosters are told, the chat gets a banner and the ranking took the result.
    for label, team in reps(world, db, one.id).items():
        got = notes(db, team['user_id'], 'decisao_registrada')
        assert len(got) == 1 and got[0].payload['kind'] == 'divergencia' and got[0].payload['score_a'] == 2
        assert got[0].payload['justification'] == 'Conferido no vídeo da partida.'
    banner = db.scalars(select(MatchMessage).where(MatchMessage.match_id == one.id,
                                                   MatchMessage.event_type == 'resultado_decidido')).one()
    assert 'Justificativa: Conferido no vídeo da partida.' in banner.body
    standings = {row.team_id: row for row in db.scalars(select(Standing).where(
        Standing.team_id.in_(sides.values())))}
    assert standings[sides['a']].wins == 1 and standings[sides['b']].losses == 1
    # The winner went on to the next match, and the decision is final.
    assert [(side.side, side.team_id) for side in db.scalars(select(MatchSide).where(MatchSide.match_id == final.id))] \
        == [(one.next_match_side, sides['a'])]
    again = http.post(url, json=body, headers=world['organizer'])
    assert again.status_code == 409 and 'já foi definido' in again.json()['detail']
    # The team reads the justification in the match, and cannot report anymore.
    seen = http.get(f'{API}/matches/{one.id}', headers=rep['headers']).json()
    assert seen['result']['decision_reason'] == 'Conferido no vídeo da partida.' and seen['result']['source'] == 'organizador'
    assert http.put(f'{API}/matches/{one.id}/result', json={'goals_a': 5, 'goals_b': 0},
                    headers=rep['headers']).status_code == 409


def test_the_organizer_decides_before_anything_is_reported_only_after_the_deadline_or_for_a_walkover(client, monkeypatch):
    http, db = client
    world = started_world(http, db, monkeypatch)
    one, two = matches_of(db, world, 1)
    body = {'score': {'goals_a': 1, 'goals_b': 0}, 'justification': 'Placar informado pelo árbitro.'}
    early = decide(http, world, one.id, expected=409, **body)
    assert 'ainda podem informar o placar' in early['detail']
    # One side reported and the other did not: still not divergent, so it waits for the 48 h.
    sides = sides_of(db, world, one.id)
    put_result(http, reporter(world, sides['a']), one.id, 1, 0)
    assert decide(http, world, one.id, expected=409, **body)['detail'].startswith('Os times ainda podem')
    world['clock'].set(world['starts'][one.id] + 49 * H)
    detail = decide(http, world, one.id, **body)
    assert detail['state'] == 'encerrada' and detail['result']['source'] == 'organizador'
    assert db.scalars(select(ResultDecision).where(ResultDecision.match_id == one.id)).one().kind == 'prazo'
    # A decision before the match starts is refused.
    world['clock'].set(world['starts'][two.id] - H)
    assert 'ainda não começou' in decide(http, world, two.id, expected=409, **body)['detail']


def test_the_organizer_decides_a_walkover_with_the_present_side_winning(client, monkeypatch):
    http, db = client
    world = started_world(http, db, monkeypatch)
    one, two = matches_of(db, world, 1)
    sides = sides_of(db, world, one.id)
    url = f'{API}/organizer/matches/{one.id}/result-decision'
    missing = http.post(url, json={'walkover_absent_side': 'b'}, headers=world['organizer'])
    assert missing.status_code == 422 and missing.json()['fields'][0]['field'] == 'justification'
    decided = decide(http, world, one.id, walkover_absent_side='b', justification='O time B não compareceu.')
    assert decided['state'] == 'encerrada' and decided['result']['final'] == {
        'a': 3, 'b': 0, 'sets': None, 'winner': 'a'}
    assert decided['walkover']['absent_side'] == 'b' and decided['result']['source'] == 'organizador'
    db.refresh(one)
    assert one.walkover_absent_side == 'b' and one.walkover_registered_by_id == world['owner_id']
    row = db.scalars(select(ResultDecision).where(ResultDecision.match_id == one.id)).one()
    assert (row.kind, row.walkover_absent_side, row.score_a, row.score_b) == ('wo', 'b', 3, 0)
    banner = db.scalars(select(MatchMessage).where(MatchMessage.match_id == one.id,
                                                   MatchMessage.event_type == 'resultado_decidido')).one()
    assert 'decidiu o W.O.' in banner.body and '3 × 0' in banner.body
    # The present team advanced.
    final = matches_of(db, world, 2)[0]
    assert [side.team_id for side in db.scalars(select(MatchSide).where(MatchSide.match_id == final.id))] == [
        sides['a']]
    # The team that was marked absent cannot ask for it back through the friendly W.O. routes.
    rep_b = reps(world, db, one.id)['b']
    assert http.post(f'{API}/matches/{one.id}/walkover/contest', json={'reason': 'Estávamos lá.'},
                     headers=rep_b['headers']).status_code == 409
    db.refresh(two)
    assert two.state == 'agendada'


def test_the_end_of_a_football_championship_gives_the_placements_without_a_bonus(client, monkeypatch):
    http, db = client
    world = started_world(http, db, monkeypatch)
    one, two = matches_of(db, world, 1)
    final = matches_of(db, world, 2)[0]
    agree(http, db, world, one.id, 2, 0)
    agree(http, db, world, two.id, 1, 3)
    # Schedule and decide the final.
    start = world['starts'][two.id] + 5 * H
    world['clock'].set(start - H)
    schedule_final = http.put(f'{API}/organizer/matches/{final.id}/schedule', json={
        'starts_at': start.isoformat(), 'court_id': world['court'].id}, headers=world['organizer'])
    assert schedule_final.status_code == 200, schedule_final.text
    assert db.get(Event, world['event_id']).state == 'em_andamento'
    world['clock'].set(start + H)
    agree(http, db, world, final.id, 1, 0)
    event = db.get(Event, world['event_id'])
    db.refresh(event)
    assert event.state == 'encerrado'
    final_sides = sides_of(db, world, final.id)
    winner, runner_up = final_sides['a'], final_sides['b']             # the final was agreed 1-0
    placements = {row.entry_id: (row.placement, row.bonus_points) for row in db.scalars(
        select(EventPlacement).where(EventPlacement.event_id == world['event_id']))}
    by_team = {team['team_id']: placements[team['entry_id']] for team in world['teams']}
    assert by_team[winner] == (1, 0) and by_team[runner_up] == (2, 0)   # football has no bonus
    assert sorted(by_team.values()) == [(1, 0), (2, 0), (3, 0), (3, 0)]
    view = bracket(http, world['teams'][0]['headers'], world['event_id'])
    assert view['event_state'] == 'encerrado' and [item['placement'] for item in view['placements']] == [1, 2, 3, 3]
    assert view['champion']['team']['id'] == winner
    assert all(len(notes(db, team['user_id'], 'evento_encerrado')) == 1 for team in world['teams'])
    assert len(notes(db, world['owner_id'], 'evento_encerrado')) == 1
    assert db.scalars(select(AuditLog).where(AuditLog.action == 'evento.encerrado')).one().data['tennis_bonus'] is False
    # A second sweep changes nothing.
    assert sweep(db, start + 100 * H)['campeonatos_encerrados'] == 0


def test_the_end_of_a_tennis_championship_adds_the_bonus_to_the_ranking(client, monkeypatch):
    http, db = client
    world = started_world(http, db, monkeypatch, count=4, athletes=True)
    one, two = matches_of(db, world, 1)
    final = matches_of(db, world, 2)[0]
    agree(http, db, world, one.id, sets=SETS)
    agree(http, db, world, two.id, sets=SETS)
    semis = {**sides_of(db, world, one.id), **{f'b{label}': value for label, value in sides_of(db, world, two.id).items()}}
    start = world['starts'][two.id] + 5 * H
    world['clock'].set(start - H)
    assert http.put(f'{API}/organizer/matches/{final.id}/schedule', json={
        'starts_at': start.isoformat(), 'court_id': world['court'].id}, headers=world['organizer']).status_code == 200
    world['clock'].set(start + H)
    assert db.get(Event, world['event_id']).state == 'em_andamento'
    finalists = sides_of(db, world, final.id)
    # The decision of the organizer also ends the event and settles the placements.
    decided = decide(http, world, final.id, walkover_absent_side='b', justification='O tenista B não veio.')
    assert decided['state'] == 'encerrada'
    db.refresh(db.get(Event, world['event_id']))
    assert db.get(Event, world['event_id']).state == 'encerrado'
    placements = {row.user_id: (row.placement, row.bonus_points) for row in db.scalars(
        select(EventPlacement).where(EventPlacement.event_id == world['event_id']))}
    assert placements[finalists['a']] == (1, 40) and placements[finalists['b']] == (2, 20)
    losers = [user for user in {value for value in semis.values()} if user not in finalists.values()]
    assert len(losers) == 2 and all(placements[user] == (3, 10) for user in losers)
    # Champion: two wins (20) + 40; runner-up: one win (10) + 20; semifinal losers: only the 10 of the bonus.
    ranking = {row.user_id: row for row in db.scalars(select(Standing).where(Standing.sport == 'tenis'))}
    assert float(ranking[finalists['a']].metric_value) == 20 + 40
    assert float(ranking[finalists['b']].metric_value) == 10 + 20
    assert all(float(ranking[user].metric_value) == 10 for user in losers)
    assert ranking[finalists['a']].wins == 2 and ranking[finalists['b']].wins == 1
    shown = bracket(http, world['teams'][0]['headers'], world['event_id'])
    assert [(item['placement'], item['bonus_points']) for item in shown['placements']] == [
        (1, 40), (2, 20), (3, 10), (3, 10)]
    assert shown['champion']['athlete']['id'] == finalists['a']


def test_a_tennis_championship_with_fewer_than_four_entries_gives_no_bonus(client, monkeypatch):
    http, db = client
    world = started_world(http, db, monkeypatch, count=3, athletes=True)
    first, = [match for match in matches_of(db, world, 1)]
    final = matches_of(db, world, 2)[0]
    agree(http, db, world, first.id, sets=SETS)
    start = world['starts'][first.id] + 5 * H
    world['clock'].set(start - H)
    http.put(f'{API}/organizer/matches/{final.id}/schedule', json={
        'starts_at': start.isoformat(), 'court_id': world['court'].id}, headers=world['organizer'])
    world['clock'].set(start + H)
    decide(http, world, final.id, walkover_absent_side='a', justification='O tenista A desistiu.')
    placements = db.scalars(select(EventPlacement).where(EventPlacement.event_id == world['event_id'])).all()
    assert sorted(row.placement for row in placements) == [1, 2, 3]
    assert all(row.bonus_points == 0 for row in placements)
    assert db.get(Event, world['event_id']).state == 'encerrado'


def test_round_robin_ends_with_the_table_and_the_third_and_fourth_places(client, monkeypatch):
    http, db = client
    clock = install_clock(monkeypatch)
    world = confirmed_world(http, db, 4, athletes=True, competition_type='todos_contra_todos', capacity=6)
    first = kickoff()
    starts = {}
    moment = first
    for round_number in (1, 2, 3):
        starts.update(schedule_round(http, world, round_number, moment))
        moment += 6 * H                      # all inside the 48 h that follow the first start
    clock.set(max(starts.values()) + H)
    assert len(starts) == 6
    scores = iter([SETS, SETS, SETS, SETS, SETS, SETS])
    for match in matches_of(db, world):
        agree(http, db, world, match.id, sets=next(scores))
    event = db.get(Event, world['event_id'])
    db.refresh(event)
    assert event.state == 'encerrado'
    view = bracket(http, world['organizer'], world['event_id'])
    assert [row['position'] for row in view['table']] == [1, 2, 3, 4] and view['table'][0]['played'] == 3
    assert [row['points'] for row in view['table']][0] >= [row['points'] for row in view['table']][-1]
    placements = {row.user_id: (row.placement, row.bonus_points) for row in db.scalars(
        select(EventPlacement).where(EventPlacement.event_id == world['event_id']))}
    assert sorted(placements.values()) == [(1, 40), (2, 20), (3, 10), (4, 10)]
    first_row = view['table'][0]
    assert placements[first_row['competitor']['athlete']['id']] == (1, 40)
    assert [item['placement'] for item in view['placements']] == [1, 2, 3, 4]


def test_the_sweep_closes_an_event_whose_matches_are_all_done(client, monkeypatch):
    http, db = client
    world = started_world(http, db, monkeypatch)
    for match in matches_of(db, world):
        match.state = 'encerrada'
        match.closed_at = match.updated_at = world['clock']()
        match.score_a, match.score_b, match.winner_side = 1, 0, 'a'
        match.result_source, match.result_confirmed_at = 'confirmacao', world['clock']()
        match.starts_at = world['clock']() - H
        match.result_deadline = match.starts_at + 48 * H
    db.commit()
    # Side rows for the final (the semifinals' winners) so the placements can be told.
    final = matches_of(db, world, 2)[0]
    for label, source in zip(('a', 'b'), matches_of(db, world, 1), strict=True):
        winner = db.scalars(select(MatchSide).where(MatchSide.match_id == source.id, MatchSide.side == 'a')).one()
        db.add(MatchSide(match_id=final.id, side=label, team_id=winner.team_id, created_at=world['clock']()))
    db.commit()
    assert db.get(Event, world['event_id']).state == 'em_andamento'
    report = sweep(db, world['clock']() + H)
    assert report['campeonatos_encerrados'] == 1
    db.refresh(db.get(Event, world['event_id']))
    assert db.get(Event, world['event_id']).state == 'encerrado'
    assert sweep(db, world['clock']() + 2 * H)['campeonatos_encerrados'] == 0

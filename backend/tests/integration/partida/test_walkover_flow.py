"""W.O. da partida: registrar, retirar, contestar e a decisão da administração (etapa 3, frente de partida)."""
from sqlalchemy import select

from app.models.matches import Match, MatchResult
from app.services import matches as match_service
from app.services.match_lifecycle import close_due_results
from tests.integration.entry_helpers import make_event
from tests.integration.match_helpers import audit_actions, notifications_of
from tests.integration.partida.helpers import (
    API,
    HOUR,
    NOW,
    accepted_terms,
    agreed_match,
    events_of,
    fill_slot,
    make_match,
)

STARTED = NOW - HOUR


def started(db, world):
    return agreed_match(db, world, starts_at=STARTED)


def register(http, world, match, who='rep_a'):
    return http.post(f'{API}/matches/{match.id}/walkover', json={}, headers=world['h'][who])


def withdraw(http, world, match, who='rep_a'):
    return http.delete(f'{API}/matches/{match.id}/walkover', headers=world['h'][who])


def contest(http, world, match, who='rep_b', reason='Estávamos na quadra no horário combinado.'):
    return http.post(f'{API}/matches/{match.id}/walkover/contest', json={'reason': reason}, headers=world['h'][who])


def decide(http, world, match, decision='manter', reason='Provas anexadas no chat.', who='admin'):
    return http.post(f'{API}/admin/matches/{match.id}/walkover-decision', json={'decision': decision, 'reason': reason},
                     headers=world['h'][who])


def message(response):
    return response.json()['detail']


# ----- Registering ------------------------------------------------------------------------------------------------

def test_the_side_that_showed_up_registers_the_walkover(client, world, clock):
    http, db = client
    match = started(db, world)
    fill_slot(db, match, world['guest'])
    response = register(http, world, match)
    assert response.status_code == 200, response.text
    body = response.json()
    wo = body['walkover']
    assert (wo['absent_side'], wo['registered_by']['id'], wo['contested_at'], wo['decision']) == (
        'b', world['rep_a'].id, None, None)
    assert wo['contest_until'] == body['result_deadline'] and wo['registered_at'] is not None
    assert (body['state'], body['phase'], body['result']['state']) == ('agendada', 'wo_registrado', 'wo_registrado')
    # Each side sees what it can do: the present side withdraws, the absent one contests, nobody reports a score.
    mine = body['permissions']
    assert (mine['withdraw_walkover'], mine['register_walkover'], mine['contest_walkover'],
            mine['report_result']) == (True, False, False, False)
    absent = http.get(f'{API}/matches/{match.id}', headers=world['h']['rep_b']).json()
    assert (absent['permissions']['contest_walkover'], absent['permissions']['withdraw_walkover'],
            absent['needs_my_action']) == (True, False, True)

    told = notifications_of(db, 'wo_registrado')
    assert [n.user_id for n in told] == [world['rep_b'].id]
    assert told[0].payload == {'match_id': match.id, 'opponent_name': 'Ferrugem FC',
                               'contest_until': match.result_deadline.isoformat()}
    assert len(events_of(db, match, 'wo_registrado')) == 1
    assert audit_actions(db, 'partida.wo_registrado')[0].data == {'absent_side': 'b', 'cleared_report': False}
    again = register(http, world, match, 'rep_b')
    assert (again.status_code, message(again)) == (409, 'Já há um W.O. registrado nesta partida.')


def test_registering_needs_the_window_and_a_representative(client, world, clock):
    http, db = client
    early = agreed_match(db, world, starts_at=NOW + HOUR)
    response = register(http, world, early)
    assert (response.status_code, message(response)) == (409, 'O W.O. só pode ser registrado depois do horário da partida.')

    match = started(db, world)
    assert message(register(http, world, match, 'member_a')) == 'Só os representantes registram o W.O.'
    assert register(http, world, match, 'guest').status_code == 404       # not in the match yet
    assert register(http, world, match, 'stranger').status_code == 404
    assert register(http, world, match, 'admin').status_code == 403
    clock['now'] = match.result_deadline
    late = register(http, world, match)
    assert (late.status_code, message(late)) == (409, 'O prazo de 48 h para registrar o resultado acabou.')

    clock['now'] = NOW
    arranging = make_match(db, 'combinando', [world['team_a'], world['team_b']])
    assert message(register(http, world, arranging)) == 'O W.O. só vale para partidas agendadas.'
    championship = make_match(db, 'agendada', [world['team_a'], world['team_b']], origin='campeonato',
                              event_id=make_event(db, world['admin'].id).id, round_number=1, bracket_position=1,
                              starts_at=STARTED)
    assert message(register(http, world, championship)) == 'Num campeonato, o W.O. é decidido pelo organizador.'
    assert db.scalar(select(Match.walkover_absent_side).where(Match.id == match.id)) is None


def test_a_score_of_the_other_side_blocks_the_walkover_and_the_own_one_is_discarded(client, world, clock):
    http, db = client
    blocked = started(db, world)
    db.add(MatchResult(match_id=blocked.id, side='b', reported_by_id=world['rep_b'].id, score_a=1, score_b=2))
    db.flush()
    response = register(http, world, blocked)
    assert (response.status_code, message(response)) == (
        409, 'O outro lado já informou o placar. Informe o seu ou converse no chat.')

    own = started(db, world)
    db.add(MatchResult(match_id=own.id, side='a', reported_by_id=world['rep_a'].id, score_a=3, score_b=0))
    db.flush()
    response = register(http, world, own)
    assert response.status_code == 200 and response.json()['result']['reports'] == {'a': None, 'b': None}
    assert db.scalars(select(MatchResult).where(MatchResult.match_id == own.id)).all() == []
    assert audit_actions(db, 'partida.wo_registrado')[-1].data['cleared_report'] is True


# ----- Withdrawing ------------------------------------------------------------------------------------------------

def test_the_registering_side_withdraws_before_a_contest(client, world, clock):
    http, db = client
    match = started(db, world)
    nothing = withdraw(http, world, match)
    assert (nothing.status_code, message(nothing)) == (409, 'Não há W.O. registrado pelo seu lado.')
    assert register(http, world, match).status_code == 200
    absent = withdraw(http, world, match, 'rep_b')
    assert (absent.status_code, message(absent)) == (409, 'Não há W.O. registrado pelo seu lado.')
    assert withdraw(http, world, match, 'member_a').status_code == 403

    done = withdraw(http, world, match)
    assert done.status_code == 204 and done.content == b''
    db.refresh(match)
    assert (match.walkover_absent_side, match.walkover_registered_at, match.walkover_registered_by_id) == (None,) * 3
    assert len(events_of(db, match, 'wo_retirado')) == 1 and audit_actions(db, 'partida.wo_retirado')
    # Free again: either side may register, and a contested W.O. can no longer be withdrawn.
    assert register(http, world, match, 'rep_b').status_code == 200
    assert contest(http, world, match, 'rep_a').status_code == 200
    blocked = withdraw(http, world, match, 'rep_b')
    assert (blocked.status_code, message(blocked)) == (409, 'O W.O. já foi contestado; a administração decide.')


def test_withdrawing_after_the_deadline_is_refused(client, world, clock):
    http, db = client
    match = started(db, world)
    assert register(http, world, match).status_code == 200
    clock['now'] = match.result_deadline
    response = withdraw(http, world, match)
    assert (response.status_code, message(response)) == (409, 'O prazo de 48 h para registrar o resultado acabou.')


# ----- Contesting -------------------------------------------------------------------------------------------------

def test_the_absent_side_contests_and_the_match_waits_for_the_administration(client, world, clock):
    http, db = client
    match = started(db, world)
    nothing = contest(http, world, match)
    assert (nothing.status_code, message(nothing)) == (409, 'Não há W.O. para contestar.')
    assert register(http, world, match).status_code == 200

    assert (contest(http, world, match, 'rep_a').status_code, message(contest(http, world, match, 'rep_a'))) == (
        403, 'Só o lado ausente contesta o W.O.')
    assert contest(http, world, match, 'member_b').status_code == 403
    assert contest(http, world, match, 'stranger').status_code == 404
    short = contest(http, world, match, reason='  oi ')
    assert (short.status_code, message(short)) == (422, 'Conte o que aconteceu.')
    assert short.json()['fields'] == [{'field': 'reason', 'message': 'Conte o que aconteceu.'}]
    assert contest(http, world, match, reason='x' * 501).status_code == 422

    response = contest(http, world, match, reason='  Estávamos na quadra no horário combinado.  ')
    assert response.status_code == 200, response.text
    wo = response.json()['walkover']
    assert (wo['contested_by']['id'], wo['contest_reason']) == (world['rep_b'].id,
                                                                'Estávamos na quadra no horário combinado.')
    assert response.json()['phase'] == 'wo_contestado'
    assert not response.json()['permissions']['contest_walkover']
    repeat = contest(http, world, match)
    assert (repeat.status_code, message(repeat)) == (409, 'O W.O. já foi contestado.')

    # The side that registered and the administration hear about it, not the contester.
    told = notifications_of(db, 'wo_contestado')
    assert {n.user_id for n in told} == {world['rep_a'].id, world['admin'].id}
    assert told[0].payload['reason'] == 'Estávamos na quadra no horário combinado.'
    assert len(events_of(db, match, 'wo_contestado')) == 1 and audit_actions(db, 'partida.wo_contestado')

    # The sweep does not close a contested W.O.: it stays scheduled until the administration decides.
    assert close_due_results(db, match.result_deadline + HOUR) == 0
    db.refresh(match)
    assert match.state == 'agendada' and match.score_a is None


def test_contesting_after_the_deadline_is_refused(client, world, clock):
    http, db = client
    match = started(db, world)
    assert register(http, world, match).status_code == 200
    clock['now'] = match.result_deadline
    response = contest(http, world, match)
    assert (response.status_code, message(response)) == (409, 'O prazo de 48 h para contestar o W.O. acabou.')


# ----- Administration -----------------------------------------------------------------------------------------------

def disputed(http, db, world):
    match = started(db, world)
    fill_slot(db, match, world['guest'])
    assert register(http, world, match).status_code == 200
    assert contest(http, world, match).status_code == 200
    return match


def test_the_queue_lists_contested_walkovers_by_contest_time(client, world, clock):
    http, db = client
    first = disputed(http, db, world)
    clock['now'] = NOW + HOUR / 2
    second = disputed(http, db, world)
    admin = world['h']['admin']
    assert http.get(f'{API}/admin/walkover-disputes', headers=world['h']['rep_a']).status_code == 403
    page = http.get(f'{API}/admin/walkover-disputes', headers=admin).json()
    assert [item['match']['id'] for item in page['items']] == [first.id, second.id]
    item = page['items'][0]
    assert (item['match']['my_role'], item['walkover']['absent_side'], item['walkover']['contested_by']['id']) == (
        'administracao', 'b', world['rep_b'].id)
    assert http.get(f'{API}/admin/walkover-disputes?limit=1', headers=admin).json()['next_cursor'] is not None
    counts = http.get(f'{API}/admin/queue-counts', headers=admin).json()
    assert counts['walkover_disputes'] == 2 and counts['court_suggestions'] == 0
    # A W.O. that nobody contested is not in the queue.
    plain = started(db, world)
    assert register(http, world, plain).status_code == 200
    assert http.get(f'{API}/admin/queue-counts', headers=admin).json()['walkover_disputes'] == 2


def test_the_administration_keeps_the_walkover(client, world, clock, monkeypatch):
    http, db = client
    recalculated = []
    monkeypatch.setattr(match_service, 'recalculate_for_match', lambda _db, match, *, now: recalculated.append(match.id))
    match = disputed(http, db, world)

    response = decide(http, world, match)
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body['match']['state'], body['match']['phase']) == ('encerrada', 'encerrada')
    assert (body['match']['score']['a'], body['match']['score']['b'], body['match']['score']['winner']) == (3, 0, 'a')
    assert (body['walkover']['decision'], body['walkover']['decision_reason']) == ('mantido', 'Provas anexadas no chat.')
    db.refresh(match)
    assert (match.result_source, match.result_decided_by_id, match.walkover_decided_by_id) == (
        'administracao', world['admin'].id, world['admin'].id)
    assert match.closed_at is not None and match.result_confirmed_at is not None
    assert recalculated == [match.id]
    # Members of both sides hear the decision; the walk-in hears the result.
    assert {n.user_id for n in notifications_of(db, 'wo_decidido')} == {
        world[name].id for name in ('rep_a', 'member_a', 'rep_b', 'member_b')}
    assert notifications_of(db, 'wo_decidido')[0].payload == {'match_id': match.id, 'decision': 'mantido',
                                                              'reason': 'Provas anexadas no chat.'}
    assert [(n.user_id, n.payload['outcome'], n.payload['score_a']) for n in notifications_of(
        db, 'resultado_partida')] == [(world['guest'].id, 'wo', 3)]
    assert len(events_of(db, match, 'wo_decidido')) == 1 and audit_actions(db, 'partida.wo_decidido')
    # Detail for the sides: finished, with the decision and the source.
    final = http.get(f'{API}/matches/{match.id}', headers=world['h']['rep_b']).json()
    assert final['result']['source'] == 'administracao' and final['walkover']['decision'] == 'mantido'
    assert http.get(f'{API}/admin/walkover-disputes', headers=world['h']['admin']).json()['items'] == []
    assert http.get(f'{API}/admin/queue-counts', headers=world['h']['admin']).json()['walkover_disputes'] == 0
    again = decide(http, world, match)
    assert (again.status_code, message(again)) == (409, 'Este W.O. não aguarda decisão.')


def test_the_administration_annuls_the_walkover(client, world, clock, monkeypatch):
    http, db = client
    recalculated = []
    monkeypatch.setattr(match_service, 'recalculate_for_match', lambda _db, match, *, now: recalculated.append(match.id))
    match = disputed(http, db, world)
    response = decide(http, world, match, 'anular', 'Os dois lados estavam na quadra errada.')
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body['match']['state'], body['match']['score'], body['walkover']['decision']) == (
        'sem_resultado', None, 'anulado')
    db.refresh(match)
    assert match.score_a is None and match.result_source is None and match.closed_at is not None
    assert recalculated == []
    assert [n.payload['outcome'] for n in notifications_of(db, 'resultado_partida')] == ['sem_resultado']
    assert {n.payload['decision'] for n in notifications_of(db, 'wo_decidido')} == {'anulado'}
    assert http.get(f'{API}/admin/queue-counts', headers=world['h']['admin']).json()['walkover_disputes'] == 0


def test_decision_validations(client, world, clock):
    http, db = client
    match = disputed(http, db, world)
    assert decide(http, world, match, who='rep_a').status_code == 403
    assert decide(http, world, match, who='stranger').status_code == 403
    assert http.post(f'{API}/admin/matches/99999999/walkover-decision', json={'decision': 'manter', 'reason': 'Motivo ok'},
                     headers=world['h']['admin']).status_code == 404
    short = decide(http, world, match, reason='ok')
    assert (short.status_code, message(short)) == (422, 'Descreva a decisão.')
    assert decide(http, world, match, decision='talvez').status_code == 422
    uncontested = started(db, world)
    assert register(http, world, uncontested).status_code == 200
    response = decide(http, world, uncontested)
    assert (response.status_code, message(response)) == (409, 'Este W.O. não aguarda decisão.')
    assert db.scalar(select(Match.state).where(Match.id == match.id)) == 'agendada'


def test_a_tennis_walkover_is_six_love_six_love(client, world, clock):
    http, db = client
    match = make_match(db, 'agendada', [world['tenista_a'], world['tenista_b']], sport='tenis', starts_at=STARTED,
                       court=world['tennis_court'])
    accepted_terms(db, match, world['tennis_court'], STARTED, super_tiebreak=False)
    assert register(http, world, match, 'tenista_b').status_code == 200
    assert contest(http, world, match, 'tenista_a').status_code == 200
    body = decide(http, world, match).json()
    score = body['match']['score']
    assert (score['a'], score['b'], score['winner']) == (0, 2, 'b')
    assert [(item['a'], item['b']) for item in score['sets']] == [(0, 6), (0, 6)]


def test_an_uncontested_walkover_becomes_the_result_when_the_deadline_closes(client, world, clock):
    http, db = client
    match = started(db, world)
    assert register(http, world, match).status_code == 200
    assert close_due_results(db, match.result_deadline - HOUR) == 0
    assert close_due_results(db, match.result_deadline) == 1
    db.flush()
    db.refresh(match)
    assert (match.state, match.score_a, match.score_b, match.result_source) == ('encerrada', 3, 0, 'wo')
    detail = http.get(f'{API}/matches/{match.id}', headers=world['h']['rep_b']).json()
    assert detail['score']['winner'] == 'a' and detail['result']['source'] == 'wo'

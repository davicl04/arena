"""Scores, attendance, stats and contests over HTTP on PostgreSQL (Jogar, fase 5): bilateral confirmation, divergence,
tennis sets, the review and contest of stats and the rankings they feed.

Matches and teams are built from the models; the routes run with a fixed clock (`use_clock`).
"""
from datetime import timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models.matches import FootballStat, MatchLineup, MatchMessage, MatchSlot
from app.models.rankings import Standing
from app.services import results
from app.services.match_lifecycle import close_due_results
from app.services.match_views import match_detail
from app.services.rankings import team_format_grid
from app.services.standings import RankingKey, recalculate_rankings
from tests.integration.match_helpers import (
    NOW,
    OTHER_CITY,
    audit_actions,
    count,
    make_team,
    make_user,
    notifications_of,
    scheduled_match,
)
from tests.integration.result_helpers import (
    HOUR,
    lineup,
    login,
    played,
    put_result,
    tennis_match,
    use_clock,
)

SIDE_A = 'Ferrugem FC'
STATS = '/api/v1/matches/{}/stats'


@pytest.fixture
def world(client, monkeypatch):
    """Two teams (a representative and a member each), a stranger, an administrator and a match played 2 h ago."""
    http, db = client
    clock = use_clock(monkeypatch)
    people = {name: make_user(db, name) for name in ('rep_a', 'member_a', 'rep_b', 'member_b', 'stranger')}
    people['admin'] = make_user(db, 'admin', admin=True)
    team_a = make_team(db, people['rep_a'], people['member_a'], name=SIDE_A)
    team_b = make_team(db, people['rep_b'], people['member_b'], name='Tigres do Lago')
    headers = {name: login(db, user) for name, user in people.items()}
    match = scheduled_match(db, team_a, team_b, starts_at=NOW - 2 * HOUR, open_slots=False)
    db.commit()
    return SimpleNamespace(http=http, db=db, clock=clock, people=people, h=headers, team_a=team_a, team_b=team_b,
                           match=match)


def standings(db):
    return {(row.team_id or row.user_id, row.sport, row.format, row.position): row
            for row in db.scalars(select(Standing))}


def events(db, match):
    return db.scalars(select(MatchMessage.event_type).where(MatchMessage.match_id == match.id)
                      .order_by(MatchMessage.id)).all()


def confirm(w, match, goals_a, goals_b):
    for name in ('rep_a', 'rep_b'):
        response = put_result(w.http, w.h[name], match.id, goals_a, goals_b)
        assert response.status_code == 200, response.text
    return response.json()


# ----- Bilateral confirmation (RN09) ------------------------------------------------------------------------

def test_equal_scores_confirm_the_result_and_start_both_rankings(world):
    w = world
    first = put_result(w.http, w.h['rep_a'], w.match.id, 2, 1)
    assert first.status_code == 200, first.text
    body = first.json()
    assert (body['state'], body['phase'], body['score']) == ('agendada', 'informar_resultado', None)
    assert body['result']['state'] == 'aguardando' and body['result']['reports']['b'] is None
    assert body['result']['reports']['a']['score'] == {'a': 2, 'b': 1, 'sets': None, 'winner': 'a'}
    assert not standings(w.db)

    second = put_result(w.http, w.h['rep_b'], w.match.id, 2, 1)
    assert second.status_code == 200, second.text
    body = second.json()
    assert (body['state'], body['phase']) == ('realizada', 'confirmado')
    assert body['score'] == {'a': 2, 'b': 1, 'sets': None, 'winner': 'a'}
    assert (body['result']['state'], body['result']['source'], body['result']['points']) == (
        'confirmado', 'confirmacao', 0)
    assert body['result']['final']['a'] == 2

    # Both teams entered the ranking in this very transaction: one match, still in placement (no tier).
    rows = standings(w.db)
    team_a = rows[(w.team_a.id, 'futebol', 'society', None)]
    team_b = rows[(w.team_b.id, 'futebol', 'society', None)]
    assert (team_a.matches_played, team_a.wins, team_a.draws, team_a.losses, team_a.goals_for,
            team_a.goals_against, team_a.metric_value, team_a.tier, team_a.rank_position, team_a.calc_version) == (
        1, 1, 0, 0, 2, 1, 3, None, None, 1)
    assert (team_b.matches_played, team_b.wins, team_b.losses, team_b.goals_for, team_b.metric_value) == (
        1, 0, 1, 1, 0)

    notified = notifications_of(w.db, 'resultado_partida')
    assert {item.user_id for item in notified} == {w.people[name].id for name in
                                                  ('rep_a', 'member_a', 'rep_b', 'member_b')}
    assert notified[0].payload == {'match_id': w.match.id, 'outcome': 'confirmado', 'score_a': 2, 'score_b': 1}
    assert events(w.db, w.match) == ['placar_enviado', 'resultado_confirmado']
    banner = w.db.scalar(select(MatchMessage.body).where(MatchMessage.event_type == 'resultado_confirmado'))
    assert banner == f'Resultado confirmado: {SIDE_A} 2 × 1 Tigres do Lago.'
    assert len(audit_actions(w.db, 'resultado.informado')) == 1
    assert len(audit_actions(w.db, 'resultado.confirmado')) == 1

    # Nobody changes a confirmed score.
    again = put_result(w.http, w.h['rep_a'], w.match.id, 3, 0)
    assert (again.status_code, again.json()['detail']) == (409, 'O placar já foi confirmado pelos dois lados.')


def test_only_who_acts_for_a_side_reports_and_strangers_see_nothing(world):
    w = world
    for name in ('member_a', 'member_b', 'admin'):
        response = put_result(w.http, w.h[name], w.match.id, 1, 0)
        assert (response.status_code, response.json()['detail']) == (403, 'Só os representantes informam o placar.')
    assert put_result(w.http, w.h['stranger'], w.match.id, 1, 0).status_code == 404
    assert put_result(w.http, w.h['rep_a'], 9999, 1, 0).status_code == 404
    assert put_result(w.http, {}, w.match.id, 1, 0).status_code == 401
    assert count(w.db, MatchMessage, MatchMessage.match_id == w.match.id) == 0


def test_the_score_is_informed_between_the_start_and_the_48_hours(world):
    w = world
    message = 'O placar é informado depois do horário da partida e até 48 h depois.'
    w.clock['now'] = NOW - 3 * HOUR
    early = put_result(w.http, w.h['rep_a'], w.match.id, 1, 0)
    assert (early.status_code, early.json()['detail']) == (409, message)
    w.clock['now'] = w.match.result_deadline
    late = put_result(w.http, w.h['rep_a'], w.match.id, 1, 0)
    assert (late.status_code, late.json()['detail']) == (409, message)
    w.clock['now'] = NOW
    assert put_result(w.http, w.h['rep_a'], w.match.id, 1, 0).status_code == 200

    # A registered walkover leaves no score to report.
    w.match.walkover_absent_side, w.match.walkover_registered_at = 'b', NOW
    w.db.commit()
    blocked = put_result(w.http, w.h['rep_b'], w.match.id, 1, 0)
    assert (blocked.status_code, blocked.json()['detail']) == (409, 'Há um W.O. registrado nesta partida.')


def test_football_scores_are_validated_with_the_failing_field(world):
    w = world
    for body, field, message in (
        ({'goals_a': 100, 'goals_b': 0}, 'goals_a', 'Informe números inteiros de 0 a 99.'),
        ({'goals_a': 1, 'goals_b': -1}, 'goals_b', 'Informe números inteiros de 0 a 99.'),
        ({'goals_a': 1}, 'goals_b', 'Informe números inteiros de 0 a 99.'),
        ({'sets': [{'a': 6, 'b': 0}, {'a': 6, 'b': 0}]}, 'sets', 'O futebol não tem sets: informe os gols.'),
    ):
        response = w.http.put(f'/api/v1/matches/{w.match.id}/result', json=body, headers=w.h['rep_a'])
        assert response.status_code == 422, body
        assert response.json() == {'detail': message, 'fields': [{'field': field, 'message': message}]}
    unknown = w.http.put(f'/api/v1/matches/{w.match.id}/result', json={'goals_a': 1, 'goals_b': 0, 'winner': 'a'},
                         headers=w.h['rep_a'])
    assert unknown.status_code == 422
    assert count(w.db, MatchMessage, MatchMessage.match_id == w.match.id) == 0


def test_divergent_scores_can_be_corrected_until_they_agree(world):
    w = world
    assert put_result(w.http, w.h['rep_a'], w.match.id, 2, 1).status_code == 200
    divergent = put_result(w.http, w.h['rep_b'], w.match.id, 1, 1)
    assert divergent.status_code == 200
    body = divergent.json()
    assert (body['state'], body['phase'], body['result']['state']) == ('agendada', 'divergente', 'divergente')
    assert (body['result']['reports']['a']['score']['a'], body['result']['reports']['b']['score']['a']) == (2, 1)
    assert body['needs_my_action'] is True and body['score'] is None
    assert not standings(w.db)
    alerts = notifications_of(w.db, 'resultado_divergente')
    assert {item.user_id for item in alerts} == {w.people['rep_a'].id, w.people['rep_b'].id}
    assert alerts[0].payload['deadline'] == w.match.result_deadline.isoformat()

    # Sending the same score again changes nothing; a correction that agrees confirms the match.
    assert put_result(w.http, w.h['rep_b'], w.match.id, 1, 1).status_code == 200
    assert len(notifications_of(w.db, 'resultado_divergente')) == 2
    confirmed = put_result(w.http, w.h['rep_b'], w.match.id, 2, 1)
    assert (confirmed.json()['state'], confirmed.json()['score']['a']) == ('realizada', 2)
    assert events(w.db, w.match) == ['placar_enviado', 'resultado_divergente', 'resultado_confirmado']
    assert len(standings(w.db)) == 2
    assert len(audit_actions(w.db, 'resultado.divergente')) == 1


def test_a_divergence_left_until_the_deadline_ends_without_result_and_without_points(world):
    w = world
    assert put_result(w.http, w.h['rep_a'], w.match.id, 2, 1).status_code == 200
    assert put_result(w.http, w.h['rep_b'], w.match.id, 1, 1).status_code == 200
    closing = w.match.result_deadline + timedelta(minutes=1)
    assert close_due_results(w.db, closing) == 1
    w.db.commit()
    assert (w.match.state, w.match.score_a, w.match.closed_at) == ('sem_resultado', None, closing)
    assert not standings(w.db)
    assert notifications_of(w.db, 'resultado_partida')[0].payload == {'match_id': w.match.id,
                                                                      'outcome': 'sem_resultado'}
    view = match_detail(w.db, w.people['rep_a'], w.match, now=closing)
    assert (view.phase, view.result.state, view.result.final) == ('sem_resultado', 'sem_resultado', None)
    # The divergent reports stay on record; no one can report any more.
    w.clock['now'] = closing
    late = put_result(w.http, w.h['rep_a'], w.match.id, 2, 1)
    assert late.status_code == 409


# ----- Tennis (RN15) ----------------------------------------------------------------------------------------

@pytest.fixture
def court(client, monkeypatch):
    http, db = client
    clock = use_clock(monkeypatch)
    players = {name: make_user(db, name) for name in ('ana', 'bia', 'carla')}
    headers = {name: login(db, user) for name, user in players.items()}
    db.commit()
    return SimpleNamespace(http=http, db=db, clock=clock, players=players, h=headers)


def sets_body(*games):
    """Body of a tennis score: each game is (a, b) or (a, b, (tiebreak_a, tiebreak_b))."""
    sets = []
    for a, b, *tiebreak in games:
        item = {'a': a, 'b': b}
        if tiebreak:
            item['tiebreak'] = {'a': tiebreak[0][0], 'b': tiebreak[0][1]}
        sets.append(item)
    return {'sets': sets}


def put_sets(t, who, match, *games):
    return t.http.put(f'/api/v1/matches/{match.id}/result', json=sets_body(*games), headers=t.h[who])


def test_tennis_sets_are_validated_and_name_the_set_that_failed(court):
    t = court
    match = tennis_match(t.db, t.players['ana'], t.players['bia'])
    t.db.commit()
    for games, field, message in (
        (((6, 5), (6, 3)), 'sets.1', 'O 1º set precisa terminar em 6-0 a 6-4, 7-5 ou 7-6.'),
        (((6, 4),), 'sets', 'Informe dois ou três sets.'),
        (((6, 4), (3, 6)), 'sets', 'Os dois primeiros sets ficaram divididos: informe o terceiro.'),
        (((6, 4), (6, 3), (6, 0)), 'sets',
         'Quem venceu os dois primeiros sets já ganhou a partida: não há terceiro set.'),
        (((7, 6), (6, 3)), 'sets.1', 'Informe o placar do tie-break do 1º set.'),
        (((7, 6, (3, 7)), (6, 3)), 'sets.1',
         'O tie-break do 1º set vai a 7 pontos, com 2 de vantagem, e é de quem venceu o set.'),
        (((6, 4), (3, 6), (10, 7)), 'sets.3', 'Informe números inteiros de 0 a 7.'),
    ):
        response = put_sets(t, 'ana', match, *games)
        assert response.status_code == 422, games
        assert response.json() == {'detail': message, 'fields': [{'field': field, 'message': message}]}, games
    goals = put_result(t.http, t.h['ana'], match.id, 6, 4)
    assert (goals.status_code, goals.json()['detail']) == (422, 'O placar do tênis é informado em sets.')
    missing = t.http.put(f'/api/v1/matches/{match.id}/result', json={}, headers=t.h['ana'])
    assert (missing.status_code, missing.json()['detail']) == (422, 'Informe dois ou três sets.')
    too_many = t.http.put(f'/api/v1/matches/{match.id}/result', json=sets_body((6, 0), (0, 6), (6, 0), (6, 0)),
                          headers=t.h['ana'])
    assert too_many.status_code == 422
    assert put_sets(t, 'carla', match, (6, 4), (6, 3)).status_code == 404
    assert count(t.db, MatchMessage, MatchMessage.match_id == match.id) == 0


def test_tennis_result_confirms_with_a_tiebreak_and_gives_10_points_to_the_winner(court):
    t = court
    match = tennis_match(t.db, t.players['ana'], t.players['bia'])
    t.db.commit()
    sent = put_sets(t, 'ana', match, (7, 6, (7, 5)), (4, 6), (6, 3))
    assert sent.status_code == 200, sent.text
    # The loser's view of the same score is a different report: the sets, not only the totals, must agree.
    other = put_sets(t, 'bia', match, (6, 4), (3, 6), (6, 3))
    assert other.json()['phase'] == 'divergente'
    done = put_sets(t, 'bia', match, (7, 6, (7, 5)), (4, 6), (6, 3))
    body = done.json()
    assert (body['state'], body['score']['a'], body['score']['b'], body['score']['winner']) == ('realizada', 2, 1, 'a')
    assert body['score']['sets'][0] == {'a': 7, 'b': 6, 'tiebreak': {'a': 7, 'b': 5}, 'super_tiebreak': False}
    assert body['result']['points'] == 0
    rows = standings(t.db)
    winner = rows[(t.players['ana'].id, 'tenis', None, None)]
    loser = rows[(t.players['bia'].id, 'tenis', None, None)]
    assert (winner.matches_played, winner.wins, winner.metric_value, winner.goals_for, winner.goals_against) == (
        1, 1, 10, 2, 1)
    assert (loser.matches_played, loser.losses, loser.metric_value, loser.goals_for) == (1, 1, 0, 1)
    assert [item.payload['outcome'] for item in notifications_of(t.db, 'resultado_partida')] == ['confirmado'] * 2
    banner = t.db.scalar(select(MatchMessage.body).where(MatchMessage.event_type == 'resultado_confirmado'))
    assert banner == 'Resultado confirmado: Atleta ana venceu Atleta bia por 2 sets a 1 (7-6(5), 4-6, 6-3).'


def test_tennis_super_tiebreak_replaces_the_third_set_when_agreed(court):
    t = court
    agreed = tennis_match(t.db, t.players['ana'], t.players['bia'], super_tiebreak=True)
    regular = tennis_match(t.db, t.players['ana'], t.players['bia'], starts_at=NOW - 3 * HOUR, super_tiebreak=False)
    t.db.commit()
    assert put_sets(t, 'ana', regular, (6, 4), (3, 6), (10, 7)).status_code == 422
    assert put_sets(t, 'ana', agreed, (6, 4), (3, 6), (10, 9)).json()['detail'] == (
        'O super tie-break vai a 10 pontos, com 2 de vantagem.')
    assert put_sets(t, 'ana', agreed, (6, 4), (3, 6), (10, 7)).status_code == 200
    done = put_sets(t, 'bia', agreed, (6, 4), (3, 6), (10, 7)).json()
    assert done['state'] == 'realizada' and done['super_tiebreak'] is True
    assert done['score']['sets'][2] == {'a': 10, 'b': 7, 'tiebreak': None, 'super_tiebreak': True}
    # Football-only routes refuse the tennis match.
    stats = t.http.put(f'/api/v1/matches/{agreed.id}/my-stats', json={'position': 'atacante'}, headers=t.h['ana'])
    assert (stats.status_code, stats.json()['detail']) == (409, 'As estatísticas são só do futebol.')
    assert t.http.get(STATS.format(agreed.id), headers=t.h['ana']).json() == {'items': []}
    attendance = t.http.put(f'/api/v1/matches/{agreed.id}/attendance', headers=t.h['ana'],
                            json={'athletes': [{'user_id': t.players['ana'].id, 'present': True}]})
    assert attendance.status_code == 403


# ----- Attendance (RN03) ------------------------------------------------------------------------------------

def attendance(w, who, athletes, match=None):
    return w.http.put(f'/api/v1/matches/{(match or w.match).id}/attendance', json={'athletes': athletes},
                      headers=w.h[who])


def test_the_representative_registers_the_attendance_of_the_roster(world):
    w = world
    rep_a, member_a, member_b = (w.people[name] for name in ('rep_a', 'member_a', 'member_b'))
    roster = [{'user_id': rep_a.id, 'present': True, 'position': 'goleiro'},
              {'user_id': member_a.id, 'present': True, 'position': 'atacante'}]
    refused = attendance(w, 'member_a', roster)
    assert (refused.status_code, refused.json()['detail']) == (403, 'Só os representantes registram a presença.')
    assert attendance(w, 'stranger', roster).status_code == 404
    for athletes, message in (
        ([{'user_id': member_b.id, 'present': True, 'position': 'defesa'}],
         'Este atleta não está no elenco deste lado.'),
        ([{'user_id': member_a.id, 'present': True}], 'Informe a posição de quem jogou.'),
        ([{'user_id': member_a.id, 'present': True, 'position': 'defesa'},
          {'user_id': member_a.id, 'present': False}], 'Cada atleta aparece uma vez.'),
    ):
        response = attendance(w, 'rep_a', athletes)
        assert (response.status_code, response.json()['fields'][0]['field'], response.json()['detail']) == (
            422, 'athletes', message)
    assert attendance(w, 'rep_a', []).status_code == 422
    assert count(w.db, MatchLineup) == 0

    done = attendance(w, 'rep_a', roster)
    assert done.status_code == 200, done.text
    items = {item['user']['id']: item for item in done.json()['items']}
    assert len(items) == 4
    assert (items[rep_a.id]['present'], items[rep_a.id]['position'], items[member_a.id]['position']) == (
        True, 'goleiro', 'atacante')
    assert items[member_a.id]['points'] == {'presence': 1.0, 'result': None, 'goals': 0.0, 'assists': 0.0,
                                            'position_stat': 0.0, 'total': 1.0, 'counted': [], 'final': False}
    assert items[w.people['rep_b'].id]['present'] is None and items[w.people['rep_b'].id]['points'] is None
    own = my_stats(w, 'member_a', goals=1)
    assert own.status_code == 200
    assert w.db.scalar(select(MatchLineup.present_marked_by_id).where(MatchLineup.user_id == member_a.id)) == rep_a.id
    assert events(w.db, w.match) == ['presenca_registrada', 'estatisticas_enviadas']
    assert audit_actions(w.db, 'presenca.registrada')[0].data == {
        'side': 'a', 'present': [rep_a.id, member_a.id], 'absent': []}

    # Marking an athlete absent closes his stats and the representative cannot register the other side.
    assert attendance(w, 'rep_a', [{'user_id': member_a.id, 'present': False}]).status_code == 200
    blocked = w.http.put(f'/api/v1/matches/{w.match.id}/my-stats', json={'position': 'atacante'},
                         headers=w.h['member_a'])
    assert (blocked.status_code, blocked.json()['detail']) == (
        409, 'O representante marcou que você não jogou. Fale com ele.')
    other_side = attendance(w, 'rep_a', [{'user_id': w.people['rep_b'].id, 'present': True, 'position': 'defesa'}])
    assert other_side.status_code == 422 and other_side.json()['detail'] == 'Este atleta não está no elenco deste lado.'


def test_attendance_follows_the_window_and_the_walkover(world):
    w = world
    roster = [{'user_id': w.people['rep_a'].id, 'present': True, 'position': 'goleiro'}]
    w.match.walkover_absent_side, w.match.walkover_registered_at = 'a', NOW
    w.db.commit()
    absent = attendance(w, 'rep_a', roster)
    assert (absent.status_code, absent.json()['detail']) == (409, 'O seu lado está com W.O. registrado.')
    present = attendance(w, 'rep_b', [{'user_id': w.people['rep_b'].id, 'present': True, 'position': 'defesa'}])
    assert present.status_code == 200
    stats = w.http.put(f'/api/v1/matches/{w.match.id}/my-stats', json={'position': 'defesa'}, headers=w.h['member_b'])
    assert (stats.status_code, stats.json()['detail']) == (409, 'Partida decidida por W.O. não tem estatísticas.')
    w.clock['now'] = w.match.result_deadline
    late = attendance(w, 'rep_b', [{'user_id': w.people['rep_b'].id, 'present': False}])
    assert (late.status_code, late.json()['detail']) == (
        409, 'A presença é registrada depois do horário da partida e até 48 h depois.')


def test_attendance_after_the_confirmation_recalculates_the_individual_ranking(world):
    w = world
    confirm(w, w.match, 2, 1)
    rep_a = w.people['rep_a']
    assert attendance(w, 'rep_a', [{'user_id': rep_a.id, 'present': True, 'position': 'goleiro'}]).status_code == 200
    row = standings(w.db)[(rep_a.id, 'futebol', 'society', 'goleiro')]
    # Presence 1 + win 3 in one match: an average of 4, still in placement.
    assert (row.metric_value, row.matches_played, row.wins, row.tier) == (4, 1, 1, None)
    # The position changes: the old ranking is recalculated too.
    assert attendance(w, 'rep_a', [{'user_id': rep_a.id, 'present': True, 'position': 'defesa'}]).status_code == 200
    rows = standings(w.db)
    assert (rep_a.id, 'futebol', 'society', 'goleiro') not in rows
    assert rows[(rep_a.id, 'futebol', 'society', 'defesa')].metric_value == 4
    assert attendance(w, 'rep_a', [{'user_id': rep_a.id, 'present': False}]).status_code == 200
    assert count(w.db, Standing, Standing.user_id == rep_a.id) == 0


# ----- Stats, review and contest (RN10, RN12, RN13) ---------------------------------------------------------

def my_stats(w, who, **body):
    return w.http.put(f'/api/v1/matches/{w.match.id}/my-stats', json={'position': 'atacante', **body},
                      headers=w.h[who])


def review(w, who, stat_id, **body):
    return w.http.put(f'/api/v1/matches/{w.match.id}/stats/{stat_id}/review', json=body, headers=w.h[who])


def contest(w, who, stat_id, **body):
    return w.http.post(f'/api/v1/matches/{w.match.id}/stats/{stat_id}/contest', json=body, headers=w.h[who])


def lineups_of(w, who):
    response = w.http.get(STATS.format(w.match.id), headers=w.h[who])
    assert response.status_code == 200, response.text
    return {item['user']['id']: item for item in response.json()['items']}


def test_stats_are_reviewed_contested_and_counted_only_after_the_final_review(world):
    w = world
    member_a, rep_a, rep_b = (w.people[name] for name in ('member_a', 'rep_a', 'rep_b'))
    w.clock['now'] = NOW - 3 * HOUR
    early = my_stats(w, 'member_a', goals=1)
    assert (early.status_code, early.json()['detail']) == (
        409, 'As estatísticas são enviadas depois do horário da partida e até 48 h depois.')
    w.clock['now'] = NOW
    assert my_stats(w, 'stranger').status_code == 404
    assert my_stats(w, 'admin').status_code == 403
    invalid = my_stats(w, 'member_a', goals=51)
    assert invalid.status_code == 422 and invalid.json()['fields'][0]['field'] == 'goals'
    assert my_stats(w, 'member_a', goals=1, bogus=1).status_code == 422

    sent = my_stats(w, 'member_a', goals=2, assists=1, position_stat=4)
    assert sent.status_code == 200, sent.text
    body = sent.json()
    stat = body['lineup']['stat']
    assert (body['lineup']['user']['id'], body['lineup']['side'], body['lineup']['guest'],
            body['lineup']['position'], body['lineup']['present']) == (member_a.id, 'a', False, 'atacante', True)
    assert (stat['state'], stat['goals'], stat['assists'], stat['position_stat'], stat['reviewed_at']) == (
        'enviada', 2, 1, 4, None)
    # Sent, not yet reviewed: the preview adds everything (1 + 2 + 1 + 4 × 0.5), nothing scores yet.
    assert body['preview'] == body['lineup']['points']
    assert body['preview'] == {'presence': 1.0, 'result': None, 'goals': 2.0, 'assists': 1.0, 'position_stat': 2.0,
                               'total': 6.0, 'counted': [], 'final': False}
    banner = w.db.scalar(select(MatchMessage.body).where(MatchMessage.event_type == 'estatisticas_enviadas'))
    assert banner == 'Atleta member_a enviou: 2 gols, 1 assistência, 4 finalizações no alvo (ATA).'

    # Who sees what: the representative of the side reviews, the opposing one contests, the others only read.
    flags = {name: lineups_of(w, name)[member_a.id] for name in ('rep_a', 'rep_b', 'member_b', 'member_a', 'admin')}
    assert {name: (item['can_review'], item['can_contest']) for name, item in flags.items()} == {
        'rep_a': (True, False), 'rep_b': (False, True), 'member_b': (False, False), 'member_a': (False, False),
        'admin': (False, False)}
    # The own side's report is enough for the preview of its athletes: 2-1 for side A is a win (3 points).
    assert put_result(w.http, w.h['rep_a'], w.match.id, 2, 1).status_code == 200
    preview = lineups_of(w, 'rep_a')[member_a.id]['points']
    assert (preview['result'], preview['total'], preview['counted']) == (3.0, 9.0, [])
    roster = lineups_of(w, 'rep_a')
    assert list(roster) == [rep_a.id, member_a.id, rep_b.id, w.people['member_b'].id]
    assert roster[rep_a.id]['present'] is None and roster[rep_a.id]['stat'] is None
    assert w.http.get(STATS.format(w.match.id), headers=w.h['stranger']).status_code == 404

    stat_id = stat['id']
    assert review(w, 'member_a', stat_id, goals=9).status_code == 403
    wrong_side = review(w, 'rep_b', stat_id)
    assert (wrong_side.status_code, wrong_side.json()['detail']) == (
        403, 'Só o representante do time do atleta revisa a estatística.')
    assert review(w, 'rep_a', 99999).status_code == 404
    assert review(w, 'rep_a', stat_id, goals=60).json()['fields'][0]['field'] == 'goals'
    assert review(w, 'rep_a', stat_id, position=None).status_code == 422
    reviewed = review(w, 'rep_a', stat_id, goals=3)
    assert reviewed.status_code == 200, reviewed.text
    item = reviewed.json()
    assert (item['stat']['state'], item['stat']['goals'], item['stat']['reviewed_by']['id']) == (
        'revisada', 3, rep_a.id)
    assert item['points']['counted'] == ['gols', 'assistencias', 'estatistica_posicao']
    # 1 presence + 3 win (own report) + 3 goals + 1 assist + 2 for 4 finalizations.
    assert item['points']['total'] == 10.0

    # Contest: only the opposing representative, with at least one item and a reason.
    assert contest(w, 'rep_a', stat_id, fields=['gols'], reason='Ele marcou um só.').status_code == 403
    assert contest(w, 'member_b', stat_id, fields=['gols'], reason='Ele marcou um só.').status_code == 403
    short = contest(w, 'rep_b', stat_id, fields=['gols'], reason='ruim')
    assert (short.status_code, short.json()['detail']) == (422, 'Conte por que a estatística está errada.')
    assert contest(w, 'rep_b', stat_id, fields=[], reason='Ele marcou um só.').status_code == 422
    assert contest(w, 'rep_b', stat_id, fields=['faltas'], reason='Ele marcou um só.').status_code == 422
    contested = contest(w, 'rep_b', stat_id, fields=['gols', 'gols'], reason='  Ele marcou um só.  ')
    assert contested.status_code == 200, contested.text
    item = contested.json()
    assert (item['stat']['state'], item['stat']['contested_fields'], item['stat']['contest_reason'],
            item['stat']['contested_by']['id']) == ('contestada', ['gols'], 'Ele marcou um só.', rep_b.id)
    assert item['points']['counted'] == ['assistencias', 'estatistica_posicao']
    assert item['can_contest'] is False
    alerts = notifications_of(w.db, 'estatistica_contestada')
    assert {alert.user_id for alert in alerts} == {member_a.id, rep_a.id}
    assert alerts[0].actor_id == rep_b.id
    assert alerts[0].payload == {'match_id': w.match.id, 'stat_id': stat_id, 'fields': ['gols'],
                                 'reason': 'Ele marcou um só.'}
    again = contest(w, 'rep_b', stat_id, fields=['assistencias'], reason='Também discordo.')
    assert (again.status_code, again.json()['detail']) == (409, 'Esta estatística já foi contestada.')
    edit = my_stats(w, 'member_a', goals=0)
    assert (edit.status_code, edit.json()['detail']) == (
        409, 'Esta estatística foi contestada; o representante do seu time revisa.')

    # Confirmed with the contest open: the contested item scores nothing, the rest does (1 + 3 + 1 + 2 = 7).
    confirm(w, w.match, 2, 1)
    ranking = standings(w.db)[(member_a.id, 'futebol', 'society', 'atacante')]
    assert (ranking.metric_value, ranking.matches_played, ranking.wins, ranking.tier) == (7, 1, 1, None)

    # The final review counts the item again (1 + 3 + 3 + 1 + 2 = 10) and closes the discussion.
    final = review(w, 'rep_a', stat_id)
    assert final.status_code == 200 and final.json()['stat']['state'] == 'revisada'
    assert final.json()['points']['final'] is False and final.json()['points']['result'] == 3.0
    ranking = standings(w.db)[(member_a.id, 'futebol', 'society', 'atacante')]
    assert ranking.metric_value == 10
    assert [item.data['after_contest'] for item in audit_actions(w.db, 'estatistica.revisada')] == [False, True]
    closed = my_stats(w, 'member_a', goals=0)
    assert (closed.status_code, closed.json()['detail']) == (
        409, 'Esta estatística já foi contestada e revisada; a revisão é final.')
    assert contest(w, 'rep_b', stat_id, fields=['gols'], reason='Outra vez.').status_code == 409
    assert events(w.db, w.match).count('estatistica_contestada') == 1

    # After the 48 h nothing changes; the sweep closes the match and keeps the points.
    w.clock['now'] = w.match.result_deadline
    assert review(w, 'rep_a', stat_id, goals=0).status_code == 409
    assert contest(w, 'rep_b', stat_id, fields=['gols'], reason='Tarde demais.').status_code == 409
    assert close_due_results(w.db, w.match.result_deadline) == 1
    w.db.commit()
    assert w.match.state == 'encerrada'
    assert standings(w.db)[(member_a.id, 'futebol', 'society', 'atacante')].metric_value == 10
    view = lineups_of(w, 'rep_a')[member_a.id]
    assert view['points']['final'] is True and (view['can_review'], view['can_contest']) == (False, False)
    mine = w.http.get('/api/v1/me/standings', headers=w.h['member_a']).json()['futebol']['individual']
    line = next(item for item in mine if (item['position'], item['format']) == ('atacante', 'society'))
    assert (line['state'], line['played'], line['metric_value'], line['tier']) == ('classificacao', 1, 10.0, None)


def test_a_walk_in_sends_stats_and_the_roster_shows_him_with_the_badge(client, monkeypatch):
    http, db = client
    use_clock(monkeypatch)
    rep_a, rep_b, guest = (make_user(db, name) for name in ('rep-a', 'rep-b', 'avulso'))
    team_a, team_b = make_team(db, rep_a, name='Ferrugem'), make_team(db, rep_b, name='Leões')
    match = scheduled_match(db, team_a, team_b, starts_at=NOW - 2 * HOUR, slots_a={'meio_campo': 1})
    slot = db.scalar(select(MatchSlot).where(MatchSlot.match_id == match.id))
    slot.state, slot.filled_by_id, slot.filled_at = 'preenchida', guest.id, NOW - 3 * HOUR
    entry = lineup(db, match, guest, 'a', 'meio_campo', present=None, guest=True, team_id=team_a.id)
    entry.slot_id, entry.present = slot.id, None
    headers = {'rep_a': login(db, rep_a), 'guest': login(db, guest)}
    db.commit()

    sent = http.put(f'/api/v1/matches/{match.id}/my-stats', json={'position': 'meio_campo', 'assists': 2},
                    headers=headers['guest'])
    assert sent.status_code == 200, sent.text
    assert (sent.json()['lineup']['guest'], sent.json()['lineup']['present'], sent.json()['lineup']['side']) == (
        True, True, 'a')
    assert count(db, MatchLineup, MatchLineup.user_id == guest.id) == 1
    roster = http.get(STATS.format(match.id), headers=headers['rep_a']).json()['items']
    assert [(item['user']['id'], item['guest'], item['can_review']) for item in roster] == [
        (rep_a.id, False, False), (guest.id, True, True), (rep_b.id, False, False)]
    gone = make_user(db, 'removido')
    lineup(db, match, gone, 'a', 'defesa', present=None, guest=True, team_id=team_a.id).removed_at = NOW
    db.commit()
    removed = http.put(f'/api/v1/matches/{match.id}/attendance', headers=headers['rep_a'],
                       json={'athletes': [{'user_id': gone.id, 'present': True, 'position': 'defesa'}]})
    assert (removed.status_code, removed.json()['detail']) == (422, 'Este atleta foi removido da partida.')
    stat = db.scalar(select(FootballStat).where(FootballStat.user_id == guest.id))
    reviewed = http.put(f'/api/v1/matches/{match.id}/stats/{stat.id}/review', json={}, headers=headers['rep_a'])
    assert reviewed.status_code == 200 and reviewed.json()['stat']['state'] == 'revisada'
    assert reviewed.json()['points']['counted'] == ['gols', 'assistencias', 'estatistica_posicao']


def test_editing_sent_stats_resets_the_review_and_a_confirmed_match_follows(world):
    w = world
    member_a = w.people['member_a']
    stat_id = my_stats(w, 'member_a', goals=2).json()['lineup']['stat']['id']
    assert review(w, 'rep_a', stat_id).status_code == 200
    edited = my_stats(w, 'member_a', goals=1)
    stat = edited.json()['lineup']['stat']
    assert (stat['state'], stat['goals'], stat['reviewed_at'], stat['reviewed_by']) == ('enviada', 1, None, None)
    assert edited.json()['preview']['counted'] == []

    def key(position):
        return member_a.id, 'futebol', 'society', position

    confirm(w, w.match, 2, 0)
    # Sent but not reviewed: only presence 1 + win 3 score.
    assert standings(w.db)[key('atacante')].metric_value == 4
    moved = my_stats(w, 'member_a', position='defesa', goals=1)
    assert moved.status_code == 200
    ranking = standings(w.db)
    assert key('atacante') not in ranking and ranking[key('defesa')].metric_value == 4
    # The representative corrects the position back and the goals: both rankings are recalculated.
    assert review(w, 'rep_a', stat_id, position='atacante', goals=5).status_code == 200
    ranking = standings(w.db)
    assert key('defesa') not in ranking and ranking[key('atacante')].metric_value == 9
    # A contest on a confirmed match takes the contested item out of the ranking at once.
    assert contest(w, 'rep_b', stat_id, fields=['gols'], reason='Foram só dois.').status_code == 200
    assert standings(w.db)[key('atacante')].metric_value == 4


def test_a_registered_walkover_closes_the_review_and_the_contest(world):
    w = world
    stat_id = my_stats(w, 'member_a', goals=1).json()['lineup']['stat']['id']
    w.match.walkover_absent_side, w.match.walkover_registered_at = 'b', NOW
    w.db.commit()
    for response in (review(w, 'rep_a', stat_id), contest(w, 'rep_b', stat_id, fields=['gols'], reason='Não jogou.')):
        assert (response.status_code, response.json()['detail']) == (
            409, 'Partida decidida por W.O. não tem estatísticas.')


def test_the_roster_view_is_only_for_who_takes_part_in_the_match(world):
    w = world
    with pytest.raises(HTTPException) as error:
        results.lineups_out(w.db, w.people['stranger'], w.match, now=NOW)
    assert error.value.status_code == 404
    assert [item.user.id for item in results.lineups_out(w.db, w.people['admin'], w.match, now=NOW)] == [
        w.people[name].id for name in ('rep_a', 'member_a', 'rep_b', 'member_b')]


# ----- Rankings (RN11, RN14, RN23) --------------------------------------------------------------------------

def test_my_standings_leave_placement_and_get_a_tier_with_the_third_match(world):
    w = world
    def society(who, team):
        teams = w.http.get('/api/v1/me/standings', headers=w.h[who]).json()['futebol']['teams']
        return next(item for item in teams if item['team']['id'] == team.id)['formats'][1]

    assert society('rep_a', w.team_a)['state'] == 'sem_jogos'
    second = scheduled_match(w.db, w.team_a, w.team_b, starts_at=NOW - 20 * HOUR, open_slots=False)
    third = scheduled_match(w.db, w.team_a, w.team_b, starts_at=NOW - 40 * HOUR, open_slots=False)
    w.db.commit()
    confirm(w, w.match, 2, 0)
    confirm(w, second, 1, 0)
    line = society('rep_a', w.team_a)
    assert (line['state'], line['played'], line['tier'], line['rank_position'], line['faces_any_level']) == (
        'classificacao', 2, None, None, True)
    assert line['metric_value'] == 6.0 and len(line['faces']) == 5
    confirm(w, third, 3, 1)
    winner, loser = society('rep_a', w.team_a), society('rep_b', w.team_b)
    assert (winner['state'], winner['tier'], winner['rank_position'], winner['played'], winner['metric_value']) == (
        'ranqueado', 'bronze', 1, 3, 9.0)
    assert (winner['faces'], winner['faces_any_level']) == (['bronze', 'prata'], False)
    assert (loser['state'], loser['tier'], loser['rank_position'], loser['metric_value']) == (
        'ranqueado', 'bronze', 2, 0.0)
    # The team card grid (C5) reads the same rows.
    grid = team_format_grid(w.db, [w.team_a.id, w.team_b.id])
    assert [(cell.format, cell.state, cell.tier) for cell in grid[w.team_a.id]] == [
        ('futsal', 'sem_jogos', None), ('society', 'ranqueado', 'bronze'), ('campo', 'sem_jogos', None)]
    assert grid[w.team_b.id][1].rank_position == 2


def test_the_rankings_list_is_general_ordered_and_paginated(client, monkeypatch):
    http, db = client
    use_clock(monkeypatch)
    reps = [make_user(db, f'rep{i}') for i in range(6)]
    cities = [5300108, 5300108, OTHER_CITY, OTHER_CITY, 5300108, 5300108]
    teams = [make_team(db, rep, name=f'Time {i + 1}', city_id=city) for i, (rep, city) in enumerate(zip(reps, cities))]
    for number in range(3):
        stamp = NOW - (number + 1) * 24 * HOUR
        played(db, teams[0], teams[1], 2, 0, starts_at=stamp)
        played(db, teams[2], teams[3], 1, 0, starts_at=stamp, city_id=OTHER_CITY)
        played(db, teams[4], teams[5], 1, 1, starts_at=stamp)
    recalculate_rankings(db, [RankingKey('futebol_time', 'society')], now=NOW)
    headers = login(db, reps[0])
    db.commit()

    first = http.get('/api/v1/rankings?sport=futebol&kind=time&format=society&limit=4', headers=headers)
    assert first.status_code == 200, first.text
    page = first.json()
    assert (page['ranking'], page['format'], page['position'], page['distance_km'], page['calc_version']) == (
        'futebol_time', 'society', None, None, 1)
    assert (page['classified_count'], page['legend_slots'], page['required']) == (6, 0, 3)
    assert [(item['rank_position'], item['team']['name']) for item in page['items']] == [
        (1, 'Time 1'), (2, 'Time 3'), (3, 'Time 5'), (4, 'Time 6')]
    top = page['items'][0]
    assert (top['tier'], top['metric_value'], top['matches_played'], top['wins'], top['draws'], top['losses'],
            top['goals_for'], top['goals_against'], top['is_mine'], top['athlete']) == (
        'bronze', 9.0, 3, 3, 0, 0, 6, 0, True, None)
    assert [item['is_mine'] for item in page['items']] == [True, False, False, False]
    assert [(line['team']['name'], line['state'], line['tier'], line['rank_position']) for line in page['mine']] == [
        ('Time 1', 'ranqueado', 'bronze', 1)]
    assert page['next_cursor'] is not None

    second = http.get(f"/api/v1/rankings?sport=futebol&kind=time&format=society&limit=4&cursor={page['next_cursor']}",
                      headers=headers).json()
    assert [(item['rank_position'], item['team']['name']) for item in second['items']] == [(5, 'Time 4'),
                                                                                           (6, 'Time 2')]
    assert second['next_cursor'] is None and second['classified_count'] == 6
    # Teams of different cities share one list; other formats and other kinds are separate rankings.
    empty = http.get('/api/v1/rankings?sport=futebol&kind=time&format=futsal', headers=headers).json()
    assert (empty['items'], empty['classified_count'], empty['next_cursor']) == ([], 0, None)
    assert [(line['state'], line['played']) for line in empty['mine']] == [('sem_jogos', 0)]
    individual = http.get('/api/v1/rankings?sport=futebol&kind=individual&format=society&position=goleiro',
                          headers=headers).json()
    assert (individual['ranking'], individual['position'], individual['items'], individual['mine'][0]['team']) == (
        'futebol_individual', 'goleiro', [], None)
    assert http.get('/api/v1/rankings?sport=tenis', headers=headers).json()['ranking'] == 'tenis'


def test_ranking_parameters_name_the_missing_category(client, monkeypatch):
    http, db = client
    use_clock(monkeypatch)
    user = make_user(db, 'leitor')
    headers = login(db, user)
    db.commit()
    for query, message in (
        ('sport=futebol', 'Escolha se o ranking é de times ou individual.'),
        ('sport=futebol&kind=time', 'Escolha o formato.'),
        ('sport=futebol&kind=individual&format=campo', 'Escolha a posição.'),
        ('sport=corrida', 'Escolha a distância.'),
        ('sport=corrida&distance_km=7', 'Distância inválida.'),
        ('sport=tenis&cursor=%25%25', 'Cursor de paginação inválido.'),
        ('sport=tenis&cursor=MA', 'Cursor de paginação inválido.'),
    ):
        response = http.get(f'/api/v1/rankings?{query}', headers=headers)
        assert (response.status_code, response.json()['detail']) == (422, message), query
    for query in ('sport=basquete', 'sport=futebol&kind=time&format=salao', 'sport=tenis&limit=0',
                  'sport=tenis&limit=51'):
        assert http.get(f'/api/v1/rankings?{query}', headers=headers).status_code == 422, query
    assert http.get('/api/v1/rankings?sport=tenis').status_code == 401
    running = http.get('/api/v1/rankings?sport=corrida&distance_km=5', headers=headers).json()
    assert (running['ranking'], running['distance_km'], running['items'], running['classified_count'],
            running['required']) == ('corrida_5', 5, [], 0, 1)
    assert (running['mine'][0]['state'], running['mine'][0]['team']) == ('sem_marca', None)


def test_athlete_rows_show_the_person_and_mark_my_own(client, monkeypatch):
    http, db = client
    use_clock(monkeypatch)
    reps = [make_user(db, name) for name in ('rep-a', 'rep-b')]
    team_a, team_b = (make_team(db, rep, name=f'Time {rep.id}') for rep in reps)
    players = [make_user(db, f'goleiro{i}') for i in range(2)]
    for number in range(3):
        match = played(db, team_a, team_b, 1, 0, starts_at=NOW - (number + 1) * 24 * HOUR)
        lineup(db, match, players[0], 'a', 'goleiro', team_id=team_a.id)
        lineup(db, match, players[1], 'b', 'goleiro', team_id=team_b.id)
    recalculate_rankings(db, [RankingKey('futebol_individual', 'society', 'goleiro')], now=NOW)
    headers = login(db, players[1])
    db.commit()
    page = http.get('/api/v1/rankings?sport=futebol&kind=individual&format=society&position=goleiro',
                    headers=headers).json()
    assert [(item['rank_position'], item['athlete']['id'], item['is_mine'], item['team']) for item in page['items']] == [
        (1, players[0].id, False, None), (2, players[1].id, True, None)]
    # Win: presence 1 + 3 = 4 in each of 3 matches; loss: presence 1 only.
    assert [(item['metric_value'], item['tier'], item['goals_for'], item['wins'], item['losses'])
            for item in page['items']] == [(4.0, 'ouro', None, 3, 0), (1.0, 'bronze', None, 0, 3)]
    assert set(page['items'][0]['athlete']) == {'id', 'name', 'username', 'avatar_url'}
    assert [(line['state'], line['rank_position']) for line in page['mine']] == [('ranqueado', 2)]

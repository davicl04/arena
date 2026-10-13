"""Scores, attendance, stats, reviews, contests and rankings over a simulated session (no database).

The real service code runs on plain model instances; the tests check the rules in their order and what each
transition writes. The SQL, the locks and the ranking recalculation are checked on PostgreSQL
(`tests/integration/test_results_flow.py`, `test_standings_recalc.py`).
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.audit import AuditLog
from app.models.identity import User
from app.models.matches import FootballStat, Match, MatchLineup, MatchMessage, MatchResult, MatchSide
from app.models.notifications import Notification
from app.models.rankings import Standing
from app.models.teams import Team, TeamMember
from app.schemas.common import PersonOut
from app.schemas.matches import (
    AttendanceInput,
    MyStatsInput,
    ResultInput,
    StatContestInput,
    StatReviewInput,
)
from app.services import results
from app.services.match_access import MatchAccess
from app.services.match_rules import RuleError
from app.services.results import RankingParams
from tests.unit.fakes import FakeDb

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
HOUR = timedelta(hours=1)
REP_A, MEMBER_A, REP_B, GUEST = 11, 12, 22, 33
EVERYONE = [(1, REP_A), (1, MEMBER_A), (2, REP_B)]


def make_match(**values):
    start = NOW - 2 * HOUR
    base = dict(id=1, sport='futebol', format='society', city_id=1, origin='amistoso', state='agendada',
                starts_at=start, result_deadline=start + 48 * HOUR, created_at=NOW - 24 * HOUR, updated_at=NOW)
    return Match(**{**base, **values})


def make_sides():
    return {'a': MatchSide(id=1, match_id=1, side='a', team_id=1), 'b': MatchSide(id=2, match_id=1, side='b', team_id=2)}


def user(user_id=REP_A, name=None):
    return SimpleNamespace(id=user_id, name=name or f'Atleta {user_id}')


def kinds(db, model):
    return [row for row in db.added if isinstance(row, model)]


def banners(db):
    return [row.event_type for row in kinds(db, MatchMessage)]


def audited(db):
    return [row.action for row in kinds(db, AuditLog)]


def person(user_id):
    return PersonOut(id=user_id, name=f'Atleta {user_id}', username=f'atleta{user_id}', avatar_url=None)


@pytest.fixture
def scene(monkeypatch):
    db = FakeDb()
    db.on('teams', [(1, 'Ferrugem FC'), (2, 'Tigres do Lago')]).on('team_members', EVERYONE).on('match_slots', [])
    state = SimpleNamespace(db=db, match=make_match(), sides=make_sides(), access=MatchAccess('representante', 'a'),
                            recalculated=[])
    monkeypatch.setattr(results, 'load_match_for', lambda _db, match_id, who, *, for_update=False: (
        state.match, state.sides, state.access))
    monkeypatch.setattr(results, 'match_detail', lambda *args, **kwargs: 'detail')
    monkeypatch.setattr(results, 'recalculate_for_match', lambda _db, match, *, now, positions=(): (
        state.recalculated.append((match.id, sorted(positions)))))
    monkeypatch.setattr(results, 'lineups_out', lambda *args, **kwargs: ['lineup'])
    monkeypatch.setattr(results, 'LineupListOut', lambda **kwargs: SimpleNamespace(**kwargs))
    monkeypatch.setattr(results, 'people_out', lambda _db, viewer, ids: {i: person(i) for i in ids if i is not None})
    return state


# ----- The score ----------------------------------------------------------------------------------------------

def report(scene, who=REP_A, goals=(3, 1), now=NOW):
    return results.report_score(scene.db, user(who), 1, ResultInput(goals_a=goals[0], goals_b=goals[1]), now=now)


def test_the_first_score_waits_for_the_other_side(scene):
    db = scene.db
    db.on('match_results', [])
    assert report(scene) == 'detail'
    [row] = kinds(db, MatchResult)
    assert (row.side, row.score_a, row.score_b, row.reported_by_id) == ('a', 3, 1, REP_A)
    assert banners(db) == ['placar_enviado'] and audited(db) == ['resultado.informado'] and db.commits == 1
    assert scene.match.state == 'agendada' and scene.recalculated == []


def test_the_same_score_sent_again_changes_nothing(scene):
    mine = MatchResult(id=3, match_id=1, side='a', score_a=3, score_b=1)
    scene.db.on('match_results', [mine])
    assert report(scene) == 'detail'
    assert scene.db.added == [] and scene.db.commits == 0


def test_equal_scores_confirm_the_result_and_recalculate_the_rankings(scene):
    db = scene.db
    db.on('match_results', [MatchResult(id=4, match_id=1, side='b', score_a=3, score_b=1)])
    db.on('match_slots', [(GUEST, 'a')])
    report(scene)
    match = scene.match
    assert (match.state, match.score_a, match.score_b, match.winner_side, match.result_source) == (
        'realizada', 3, 1, 'a', 'confirmacao')
    assert scene.recalculated == [(1, [])]
    told = sorted((row.user_id, row.payload['outcome']) for row in kinds(db, Notification))
    assert told == sorted([(REP_A, 'confirmado'), (MEMBER_A, 'confirmado'), (REP_B, 'confirmado'),
                           (GUEST, 'confirmado')])
    assert banners(db) == ['resultado_confirmado'] and 'Ferrugem FC 3 × 1 Tigres do Lago' in kinds(db, MatchMessage)[0].body
    assert audited(db) == ['resultado.confirmado']


def test_different_scores_ask_both_sides_to_correct_until_the_deadline(scene):
    db = scene.db
    db.on('match_results', [MatchResult(id=4, match_id=1, side='b', score_a=0, score_b=2)])
    db.on('team_members', [(1, REP_A), (2, REP_B)])
    report(scene)
    assert scene.match.state == 'agendada' and scene.recalculated == []
    assert sorted((row.type, row.user_id) for row in kinds(db, Notification)) == [
        ('resultado_divergente', REP_A), ('resultado_divergente', REP_B)]
    assert banners(db) == ['resultado_divergente'] and audited(db) == ['resultado.divergente']


def test_a_correction_replaces_the_row_of_the_side(scene):
    db = scene.db
    mine = MatchResult(id=3, match_id=1, side='a', score_a=0, score_b=0)
    db.on('match_results', [mine])
    report(scene, goals=(1, 0))
    assert (mine.score_a, mine.score_b) == (1, 0) and db.of(MatchResult) == []
    assert 'corrigiu' in kinds(db, MatchMessage)[0].body


def test_reporting_follows_the_rules_in_order(scene):
    db = scene.db
    db.on('match_results', [])
    scene.access = MatchAccess('membro', 'a')
    with pytest.raises(HTTPException) as error:
        report(scene)
    assert (error.value.status_code, error.value.detail) == (403, results.REPORT_ROLES)
    scene.access = MatchAccess('representante', 'a')
    cases = [(make_match(walkover_absent_side='b'), results.WALKOVER_REGISTERED),
             (make_match(state='realizada'), results.RESULT_CONFIRMED),
             (make_match(starts_at=NOW + HOUR), results.RESULT_WINDOW),
             (make_match(state='cancelada'), results.RESULT_WINDOW)]
    for match, message in cases:
        scene.match = match
        with pytest.raises(HTTPException) as error:
            report(scene)
        assert (error.value.status_code, error.value.detail) == (409, message)
    scene.match = make_match()
    with pytest.raises(RuleError) as error:
        report(scene, goals=(100, 0))
    assert error.value.field == 'goals_a'
    assert db.commits == 0 and db.added == []


def test_the_score_shape_follows_the_sport(scene):
    football = make_match()
    with pytest.raises(RuleError) as error:
        results.validate_score(football, ResultInput(goals_a=1, goals_b=0, sets=[{'a': 6, 'b': 0}, {'a': 6, 'b': 0}]))
    assert error.value.field == 'sets'
    tennis = make_match(sport='tenis', format=None, super_tiebreak=False)
    for body in (ResultInput(goals_a=1, goals_b=0), ResultInput()):
        with pytest.raises(RuleError) as error:
            results.validate_score(tennis, body)
        assert error.value.field == 'sets'
    score = results.validate_score(tennis, ResultInput(sets=[{'a': 6, 'b': 3}, {'a': 6, 'b': 4}]))
    assert (score.score_a, score.score_b, score.winner) == (2, 0, 'a')


# ----- Attendance ---------------------------------------------------------------------------------------------

def roster(*members):
    return [TeamMember(team_id=1, user_id=user_id, role=role, position=position, joined_at=NOW - 24 * HOUR)
            for user_id, role, position in members]


def attend(scene, *athletes, who=REP_A):
    return results.set_attendance(scene.db, user(who), 1, AttendanceInput(athletes=list(athletes)), now=NOW)


def test_the_representative_registers_who_played_with_the_position(scene):
    db = scene.db
    db.on('team_members', roster((REP_A, 'representante', 'meio_campo'), (MEMBER_A, 'membro', 'defesa')))
    db.on('match_lineups', [])
    out = attend(scene, {'user_id': REP_A, 'present': True}, {'user_id': MEMBER_A, 'present': False})
    assert out.items == ['lineup'] and db.commits == 1
    lineups = {row.user_id: row for row in kinds(db, MatchLineup)}
    assert (lineups[REP_A].present, lineups[REP_A].position, lineups[REP_A].guest) == (True, 'meio_campo', False)
    assert (lineups[MEMBER_A].present, lineups[MEMBER_A].present_marked_by_id) == (False, REP_A)
    assert banners(db) == ['presenca_registrada'] and '1 presente e 1 ausente' in kinds(db, MatchMessage)[0].body
    assert audited(db) == ['presenca.registrada'] and scene.recalculated == []


def test_changing_the_position_of_a_confirmed_match_recalculates_the_old_ranking_too(scene):
    db = scene.db
    scene.match = make_match(state='realizada', score_a=2, score_b=0, winner_side='a')
    lineup = MatchLineup(id=7, match_id=1, side='a', user_id=MEMBER_A, position='defesa', present=True)
    db.on('team_members', roster((MEMBER_A, 'membro', 'defesa'))).on('match_lineups', [lineup])
    attend(scene, {'user_id': MEMBER_A, 'present': True, 'position': 'atacante'})
    assert lineup.position == 'atacante'
    assert scene.recalculated == [(1, ['defesa'])]


@pytest.mark.parametrize(('athletes', 'lineups', 'message', 'field'), [
    ([{'user_id': 12, 'present': True}, {'user_id': 12, 'present': False}], [], 'Cada atleta aparece uma vez.', 'athletes'),
    ([{'user_id': 12, 'present': True, 'position': 'defesa'}],
     [MatchLineup(id=7, match_id=1, side='b', user_id=12, position='defesa')], 'Este atleta já atua pelo outro lado.',
     'athletes'),
    ([{'user_id': 33, 'present': True, 'position': 'defesa'}],
     [MatchLineup(id=8, match_id=1, side='a', user_id=33, guest=True, removed_at=NOW)],
     'Este atleta foi removido da partida.', 'athletes'),
    ([{'user_id': 55, 'present': True, 'position': 'defesa'}], [], 'Este atleta não está no elenco deste lado.',
     'athletes'),
    ([{'user_id': 12, 'present': True}], [], 'Informe a posição de quem jogou.', 'athletes')])
def test_a_refused_attendance_list_changes_nothing(scene, athletes, lineups, message, field):
    db = scene.db
    db.on('team_members', roster((MEMBER_A, 'membro', None))).on('match_lineups', lineups)
    with pytest.raises(RuleError) as error:
        attend(scene, *athletes)
    assert (str(error.value), error.value.field) == (message, field)
    assert db.added == [] and db.commits == 0


def test_attendance_is_for_representatives_inside_the_window_and_the_present_side(scene):
    scene.access = MatchAccess('membro', 'a')
    with pytest.raises(HTTPException) as error:
        attend(scene, {'user_id': 12, 'present': True, 'position': 'defesa'})
    assert (error.value.status_code, error.value.detail) == (403, results.ATTENDANCE_ROLES)
    scene.access = MatchAccess('representante', 'a')
    scene.match = make_match(starts_at=NOW + HOUR)
    with pytest.raises(HTTPException) as error:
        attend(scene, {'user_id': 12, 'present': True, 'position': 'defesa'})
    assert error.value.detail == results.ATTENDANCE_WINDOW
    scene.match = make_match(walkover_absent_side='a')
    with pytest.raises(HTTPException) as error:
        attend(scene, {'user_id': 12, 'present': True, 'position': 'defesa'})
    assert error.value.detail == results.ABSENT_SIDE


# ----- Own stats ----------------------------------------------------------------------------------------------

def send(scene, who=MEMBER_A, **body):
    return results.send_my_stats(scene.db, user(who), 1, MyStatsInput(**{'position': 'atacante', **body}), now=NOW)


@pytest.fixture
def own_stats(scene, monkeypatch):
    monkeypatch.setattr(results, 'MyStatsOut', lambda **kwargs: SimpleNamespace(**kwargs))
    monkeypatch.setattr(results, 'lineups_out', lambda *args, **kwargs: [
        SimpleNamespace(points='preview', lineup='own')])
    scene.access = MatchAccess('membro', 'a')
    return scene


def test_a_member_sends_stats_and_is_marked_present(own_stats):
    db = own_stats.db
    db.on('match_lineups', None).on('football_stats', None)
    out = send(own_stats, goals=2, assists=1, position_stat=4)
    assert out.preview == 'preview' and db.commits == 1
    [lineup] = kinds(db, MatchLineup)
    assert (lineup.user_id, lineup.side, lineup.team_id, lineup.guest, lineup.position, lineup.present) == (
        MEMBER_A, 'a', 1, False, 'atacante', True)
    [stat] = kinds(db, FootballStat)
    assert (stat.state, stat.goals, stat.assists, stat.position_stat, stat.user_id) == ('enviada', 2, 1, 4, MEMBER_A)
    assert banners(db) == ['estatisticas_enviadas']
    assert kinds(db, MatchMessage)[0].body == 'Atleta 12 enviou: 2 gols, 1 assistência, 4 finalizações no alvo (ATA).'


def test_a_walkin_sends_stats_with_the_slot_he_filled(own_stats):
    db = own_stats.db
    own_stats.access = MatchAccess('avulso', 'b')
    db.on('match_lineups', None).on('football_stats', None).on('match_slots', 55)
    send(own_stats, who=GUEST, goals=None)
    [lineup] = kinds(db, MatchLineup)
    assert (lineup.guest, lineup.slot_id, lineup.side) == (True, 55, 'b')
    assert 'confirmou presença como atacante' in kinds(db, MatchMessage)[0].body


def test_editing_sent_stats_goes_back_to_review_and_a_confirmed_match_follows(own_stats):
    db = own_stats.db
    own_stats.match = make_match(state='realizada', score_a=2, score_b=0, winner_side='a')
    lineup = MatchLineup(id=7, match_id=1, side='a', user_id=MEMBER_A, position='defesa', present=True,
                         present_marked_by_id=REP_A)
    stat = FootballStat(id=8, lineup_id=7, match_id=1, user_id=MEMBER_A, state='revisada', goals=1,
                        reviewed_at=NOW - HOUR, reviewed_by_id=REP_A)
    db.on('match_lineups', lineup).on('football_stats', stat)
    send(own_stats, goals=2)
    assert (stat.state, stat.goals, stat.reviewed_at, stat.reviewed_by_id) == ('enviada', 2, None, None)
    assert lineup.position == 'atacante' and lineup.present_marked_by_id == REP_A
    assert own_stats.recalculated == [(1, ['defesa'])]
    assert db.of(MatchLineup) == [] and db.of(FootballStat) == []


@pytest.mark.parametrize(('access', 'match', 'lineup', 'stat', 'status', 'message'), [
    (MatchAccess('administracao', None), None, None, None, 403, results.STATS_ROLES),
    (MatchAccess('membro', 'a'), make_match(sport='tenis', format=None), None, None, 409, results.FOOTBALL_ONLY_STATS),
    (MatchAccess('membro', 'a'), make_match(walkover_absent_side='b'), None, None, 409, results.WALKOVER_NO_STATS),
    (MatchAccess('membro', 'a'), make_match(starts_at=NOW + HOUR), None, None, 409, results.STATS_WINDOW),
    (MatchAccess('membro', 'a'), None, MatchLineup(id=7, match_id=1, side='a', user_id=12, present=False), None, 409,
     results.MARKED_ABSENT),
    (MatchAccess('membro', 'a'), None, MatchLineup(id=7, match_id=1, side='a', user_id=12, present=True),
     FootballStat(id=8, lineup_id=7, match_id=1, user_id=12, state='revisada', reviewed_at=NOW, contested_at=NOW),
     409, results.FINAL_REVIEW)])
def test_stats_are_refused_outside_the_rules(own_stats, access, match, lineup, stat, status, message):
    own_stats.access = access
    own_stats.match = match or make_match()
    own_stats.db.on('match_lineups', lineup).on('football_stats', stat)
    with pytest.raises(HTTPException) as error:
        send(own_stats, goals=1)
    assert (error.value.status_code, error.value.detail) == (status, message)
    assert own_stats.db.added == [] and own_stats.db.commits == 0


def test_a_contested_stat_waits_for_the_review_and_numbers_are_validated(own_stats):
    db = own_stats.db
    lineup = MatchLineup(id=7, match_id=1, side='a', user_id=MEMBER_A, present=True)
    stat = FootballStat(id=8, lineup_id=7, match_id=1, user_id=MEMBER_A, state='contestada', contested_at=NOW)
    db.on('match_lineups', lineup).on('football_stats', stat)
    with pytest.raises(HTTPException) as error:
        send(own_stats, goals=1)
    assert error.value.status_code == 409 and 'revisa' in error.value.detail
    with pytest.raises(RuleError) as error:
        send(own_stats, goals=51)
    assert error.value.field == 'goals'


# ----- Review and contest -------------------------------------------------------------------------------------

def stat_scene(scene, state='enviada', **stat_values):
    lineup = MatchLineup(id=7, match_id=1, side='a', user_id=MEMBER_A, position='atacante', present=True)
    stat = FootballStat(id=8, lineup_id=7, match_id=1, user_id=MEMBER_A, goals=2, assists=1, position_stat=3,
                        state=state, submitted_at=NOW - HOUR, **stat_values)
    scene.db.on('football_stats', stat).put(MatchLineup, lineup)
    scene.db.put(User, SimpleNamespace(id=MEMBER_A, name='Bruno Costa'))
    return stat, lineup


def test_the_representative_of_the_athlete_reviews_and_may_correct(scene):
    stat, lineup = stat_scene(scene)
    out = results.review_stat(scene.db, user(), 1, 8, StatReviewInput(goals=1, position='defesa'), now=NOW)
    assert out == 'lineup' and scene.db.commits == 1
    assert (stat.state, stat.goals, stat.reviewed_by_id, lineup.position) == ('revisada', 1, REP_A, 'defesa')
    assert banners(scene.db) == ['estatistica_revisada']
    assert audited(scene.db) == ['estatistica.revisada']
    assert kinds(scene.db, AuditLog)[0].data == {'match_id': 1, 'user_id': MEMBER_A, 'corrections': ['goals', 'position'],
                                                  'after_contest': False}


def test_a_review_after_a_contest_is_final_and_a_confirmed_match_follows(scene):
    stat, _ = stat_scene(scene, 'contestada', contested_at=NOW - HOUR, contested_fields=['gols'],
                         contest_reason='Foram dois.')
    scene.match = make_match(state='realizada', score_a=1, score_b=0, winner_side='a')
    results.review_stat(scene.db, user(), 1, 8, StatReviewInput(), now=NOW)
    assert stat.state == 'revisada' and stat.contested_at is not None
    assert scene.recalculated == [(1, [])]
    assert kinds(scene.db, AuditLog)[0].data['after_contest'] is True


@pytest.mark.parametrize(('access', 'match', 'status', 'message'), [
    (MatchAccess('membro', 'a'), None, 403, results.REVIEW_ROLES),
    (MatchAccess('representante', 'b'), None, 403, results.REVIEW_SIDE),
    (MatchAccess('representante', 'a'), make_match(walkover_absent_side='b'), 409, results.WALKOVER_NO_STATS),
    (MatchAccess('representante', 'a'), make_match(starts_at=NOW - 60 * HOUR), 409, results.REVIEW_WINDOW)])
def test_reviewing_follows_the_rules(scene, access, match, status, message):
    stat_scene(scene)
    scene.access, scene.match = access, match or make_match()
    with pytest.raises(HTTPException) as error:
        results.review_stat(scene.db, user(), 1, 8, StatReviewInput(), now=NOW)
    assert (error.value.status_code, error.value.detail) == (status, message)
    assert scene.db.commits == 0


def test_an_unknown_or_removed_stat_is_not_found(scene):
    scene.db.on('football_stats', None)
    with pytest.raises(HTTPException) as error:
        results.review_stat(scene.db, user(), 1, 8, StatReviewInput(), now=NOW)
    assert (error.value.status_code, error.value.detail) == (404, results.STAT_NOT_FOUND)
    stat, lineup = stat_scene(scene)
    lineup.removed_at = NOW
    with pytest.raises(HTTPException) as error:
        results.contest_stat(scene.db, user(REP_B), 1, 8, StatContestInput(fields=['gols'], reason='Foram dois.'),
                             now=NOW)
    assert error.value.status_code == 404


def test_the_opposing_representative_contests_once_and_the_athlete_is_told(scene):
    stat, _ = stat_scene(scene, 'revisada', reviewed_at=NOW - HOUR, reviewed_by_id=REP_A)
    scene.access = MatchAccess('representante', 'b')
    scene.match = make_match(state='realizada', score_a=1, score_b=0, winner_side='a')
    scene.db.on('team_members', EVERYONE)
    out = results.contest_stat(scene.db, user(REP_B), 1, 8,
                               StatContestInput(fields=['gols', 'gols'], reason='  Foram só dois gols.  '), now=NOW)
    assert out == 'lineup'
    assert (stat.state, stat.contested_by_id, stat.contested_fields, stat.contest_reason) == (
        'contestada', REP_B, ['gols'], 'Foram só dois gols.')
    assert scene.recalculated == [(1, [])]
    told = {(row.user_id, row.type) for row in kinds(scene.db, Notification)}
    assert told == {(MEMBER_A, 'estatistica_contestada'), (REP_A, 'estatistica_contestada')}
    assert banners(scene.db) == ['estatistica_contestada'] and audited(scene.db) == ['estatistica.contestada']
    with pytest.raises(HTTPException) as error:
        results.contest_stat(scene.db, user(REP_B), 1, 8, StatContestInput(fields=['gols'], reason='Outra vez.'),
                             now=NOW)
    assert error.value.status_code == 409


@pytest.mark.parametrize(('access', 'match', 'reason', 'status'), [
    (MatchAccess('membro', 'b'), None, 'Foram dois.', 403),
    (MatchAccess('representante', 'a'), None, 'Foram dois.', 403),
    (MatchAccess('representante', 'b'), make_match(walkover_absent_side='a'), 'Foram dois.', 409),
    (MatchAccess('representante', 'b'), make_match(starts_at=NOW - 60 * HOUR), 'Foram dois.', 409)])
def test_contesting_follows_the_rules(scene, access, match, reason, status):
    stat_scene(scene)
    scene.access, scene.match = access, match or make_match()
    with pytest.raises(HTTPException) as error:
        results.contest_stat(scene.db, user(REP_B), 1, 8, StatContestInput(fields=['gols'], reason=reason), now=NOW)
    assert error.value.status_code == status


def test_the_contest_reason_has_a_size(scene):
    stat_scene(scene)
    scene.access = MatchAccess('representante', 'b')
    with pytest.raises(RuleError) as error:
        results.contest_stat(scene.db, user(REP_B), 1, 8, StatContestInput(fields=['gols'], reason='  não  '), now=NOW)
    assert (str(error.value), error.value.field) == (results.CONTEST_REASON, 'reason')


# ----- The roster view ----------------------------------------------------------------------------------------

@pytest.fixture
def view(scene, monkeypatch):
    monkeypatch.undo()          # the real lineups_out and people_out, over the simulated rows
    monkeypatch.setattr(results, 'people_out', lambda _db, viewer, ids: {i: person(i) for i in ids if i is not None})
    db = scene.db
    lineups = [MatchLineup(id=7, match_id=1, side='a', user_id=MEMBER_A, position='atacante', present=True,
                           guest=False),
               MatchLineup(id=9, match_id=1, side='b', user_id=GUEST, position='goleiro', present=True, guest=True)]
    stat = FootballStat(id=8, lineup_id=7, match_id=1, user_id=MEMBER_A, goals=2, state='enviada', submitted_at=NOW)
    members = [TeamMember(team_id=1, user_id=REP_A, role='representante', position='meio_campo', joined_at=NOW - HOUR),
               TeamMember(team_id=1, user_id=MEMBER_A, role='membro', position='atacante', joined_at=NOW),
               TeamMember(team_id=2, user_id=REP_B, role='representante', position='goleiro', joined_at=NOW - HOUR)]
    db.on('match_lineups', lineups).on('football_stats', [stat]).on('team_members', members)
    db.on('match_results', [MatchResult(id=1, match_id=1, side='a', score_a=2, score_b=0)])
    scene.match = make_match(sport='futebol')
    return scene


def lineups(scene, who=REP_A, access=None, **kwargs):
    return results.lineups_out(scene.db, user(who), scene.match, now=NOW, sides=scene.sides,
                               access=access or scene.access, **kwargs)


def test_the_roster_lists_both_sides_with_the_walkins_and_the_review_flags(view):
    items = lineups(view)
    assert [(item.user.id, item.side, item.guest, item.position) for item in items] == [
        (REP_A, 'a', False, 'meio_campo'), (MEMBER_A, 'a', False, 'atacante'),
        (REP_B, 'b', False, 'goleiro'), (GUEST, 'b', True, 'goleiro')]
    by_id = {item.user.id: item for item in items}
    # Only the athlete with a stat can be reviewed (by the own representative) or contested (by the other side).
    assert by_id[MEMBER_A].can_review and not by_id[MEMBER_A].can_contest
    assert by_id[MEMBER_A].stat.state == 'enviada' and by_id[REP_A].stat is None and not by_id[REP_A].can_review
    # Side A reported a win: presence 1 + win 3 + 2 goals, none of it counted yet (not reviewed).
    assert (by_id[MEMBER_A].points.result, by_id[MEMBER_A].points.total, by_id[MEMBER_A].points.counted) == (
        3.0, 6.0, [])
    assert by_id[REP_A].present is None and by_id[REP_A].points is None
    assert by_id[GUEST].present is True and (by_id[GUEST].points.result, by_id[GUEST].points.total) == (None, 1.0)
    opposing = {item.user.id: item for item in lineups(view, REP_B, MatchAccess('representante', 'b'))}
    assert opposing[MEMBER_A].can_contest and not opposing[MEMBER_A].can_review


def test_the_roster_can_be_limited_to_one_athlete_and_is_football_only(view, monkeypatch):
    [only] = lineups(view, only_user_id=GUEST)
    assert only.user.id == GUEST
    view.match = make_match(sport='tenis', format=None)
    assert lineups(view) == []
    view.match = make_match()
    monkeypatch.setattr(results, 'match_access', lambda *args, **kwargs: None)
    with pytest.raises(HTTPException) as error:
        results.lineups_out(view.db, user(), view.match, now=NOW, sides=view.sides)
    assert error.value.status_code == 404


def test_no_review_flags_after_the_window_or_for_a_walkover(view):
    view.match = make_match(starts_at=NOW - 60 * HOUR)
    assert not any(item.can_review or item.can_contest for item in lineups(view))
    view.match = make_match(walkover_absent_side='b')
    assert not any(item.can_review or item.can_contest for item in lineups(view))


def test_the_points_preview_is_final_only_for_a_confirmed_match_after_the_deadline(view):
    view.match = make_match(state='encerrada', score_a=2, score_b=0, winner_side='a', result_deadline=NOW - HOUR)
    by_id = {item.user.id: item for item in lineups(view)}
    assert by_id[MEMBER_A].points.final is True and by_id[MEMBER_A].points.result == 3.0
    assert by_id[GUEST].points.result == 0.0


def test_match_lineups_is_for_the_participants(view, monkeypatch):
    monkeypatch.setattr(results, 'load_match_for', lambda _db, match_id, who, *, for_update=False, allow_history=False: (
        view.match, view.sides, view.access))
    assert len(results.match_lineups(view.db, user(), 1, now=NOW).items) == 4


# ----- Rankings -----------------------------------------------------------------------------------------------

def cuts():
    share = Decimal('0.15')
    table = {name: SimpleNamespace(placement_matches=3, legend_share=share, window_weeks=52)
             for name in ('futebol_time', 'futebol_individual', 'tenis')}
    table['corrida_5'] = SimpleNamespace(placement_matches=1, legend_share=share, window_weeks=52)   # the first mark
    return table


def standing(standing_id, rank, **values):
    base = dict(id=standing_id, sport='futebol', format='society', metric_value=Decimal(20 - rank),
                matches_played=5, wins=3, draws=1, losses=1, goals_for=9, goals_against=5, rank_position=rank,
                tier='ouro')
    return Standing(**{**base, **values})


@pytest.fixture
def ranking(scene, monkeypatch):
    monkeypatch.setattr(results, 'load_cuts', lambda _db, version: cuts())
    return scene


def test_the_team_ranking_lists_the_classified_with_my_teams_marked(ranking):
    db = ranking.db
    team_a, team_b = Team(id=1, name='Ferrugem FC', city_id=1), Team(id=2, name='Tigres do Lago', city_id=1)
    db.on('team_members', [(TeamMember(team_id=1, user_id=REP_A, role='representante', joined_at=NOW), team_a)])
    db.then('standings', [standing(1, 1, team_id=2), standing(2, 2, team_id=1)])               # my teams' rows
    db.then('standings', 2)                                                                   # classified count
    db.then('standings', [standing(1, 1, team_id=2), standing(2, 2, team_id=1)])               # the page
    db.on('teams', [team_a, team_b])
    page = results.rankings_page(db, user(), RankingParams(sport='futebol', kind='time', format='society', limit=20))
    assert (page.ranking, page.classified_count, page.legend_slots, page.required, page.next_cursor) == (
        'futebol_time', 2, 0, 3, None)
    assert [(row.rank_position, row.team.name, row.is_mine, row.goals_for) for row in page.items] == [
        (1, 'Tigres do Lago', False, 9), (2, 'Ferrugem FC', True, 9)]
    [mine] = page.mine
    assert (mine.team.id, mine.state, mine.tier, mine.rank_position) == (1, 'ranqueado', 'ouro', 2)


def test_a_full_page_gives_the_cursor_of_the_next_one(ranking):
    db = ranking.db
    rows = [standing(index, index, user_id=40 + index, position='atacante', team_id=None) for index in (1, 2, 3)]
    db.then('standings', None).then('standings', 30).then('standings', rows)
    page = results.rankings_page(db, user(), RankingParams(
        sport='futebol', kind='individual', format='society', position='atacante', limit=2))
    assert [row.rank_position for row in page.items] == [1, 2] and page.legend_slots == 4
    assert page.items[0].athlete.id == 41 and page.items[0].goals_for is None and page.items[0].is_mine is False
    assert page.next_cursor == results._encode_position(2)
    assert page.mine[0].state == 'sem_jogos' and page.mine[0].team is None


def test_tennis_and_running_rankings(ranking):
    db = ranking.db
    db.then('standings', standing(5, 1, sport='tenis', format=None, user_id=REP_A, team_id=None))
    db.then('standings', 1).then('standings', [standing(5, 1, sport='tenis', format=None, user_id=REP_A, team_id=None)])
    page = results.rankings_page(db, user(), RankingParams(sport='tenis'))
    assert page.items[0].is_mine and page.mine[0].rank_position == 1
    # Running reads `standings` like the other rankings: the viewer's line, the classified count and the page.
    db.then('standings', None).then('standings', 0).then('standings', [])
    running = results.rankings_page(db, user(), RankingParams(sport='corrida', distance_km=5))
    assert (running.ranking, running.items, running.classified_count, running.mine[0].state) == (
        'corrida_5', [], 0, 'sem_marca')
    assert running.required == 1 and running.legend_slots == 0


def test_a_running_ranking_lists_the_best_times_without_goals(ranking):
    # Contract 0002, 18: `metric_value` is the best time in seconds, `matches_played` the marks, no goals.
    db = ranking.db
    mark = standing(7, 1, sport='corrida', format=None, user_id=REP_A, team_id=None, distance_km=5,
                    metric_value=Decimal(1290), matches_played=2, wins=0, draws=0, losses=0, goals_for=0,
                    goals_against=0, tier='diamante')
    other = standing(8, 2, sport='corrida', format=None, user_id=43, team_id=None, distance_km=5,
                     metric_value=Decimal(1500), matches_played=1, wins=0, draws=0, losses=0, goals_for=0,
                     goals_against=0, tier='ouro')
    db.then('standings', mark).then('standings', 2).then('standings', [mark, other])
    page = results.rankings_page(db, user(), RankingParams(sport='corrida', distance_km=5))
    assert (page.ranking, page.distance_km, page.classified_count, page.next_cursor) == ('corrida_5', 5, 2, None)
    assert [(row.rank_position, row.metric_value, row.matches_played, row.goals_for, row.goals_against, row.is_mine)
            for row in page.items] == [(1, 1290.0, 2, None, None, True), (2, 1500.0, 1, None, None, False)]
    [mine] = page.mine
    assert (mine.state, mine.tier, mine.rank_position, mine.metric_value) == ('ranqueado', 'diamante', 1, 1290.0)


def test_the_cursor_continues_after_the_last_position(ranking):
    db = ranking.db
    db.then('standings', None).then('standings', 3).then('standings', [standing(3, 3, user_id=43, team_id=None,
                                                                                position='defesa')])
    page = results.rankings_page(db, user(), RankingParams(
        sport='futebol', kind='individual', format='society', position='defesa', cursor=results._encode_position(2)))
    assert [row.rank_position for row in page.items] == [3]
    assert db.statements.count('standings') == 3

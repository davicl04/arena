"""Match views without a database: permissions per role, pending actions, result state and score reports."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.services.match_access import MatchAccess
from app.services.match_views import (
    MatchFacts,
    needs_my_action,
    permissions_for,
    report_score,
    result_state_of,
    stat_locked,
)

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
REPRESENTATIVE = MatchAccess('representante', 'a')
MEMBER = MatchAccess('membro', 'a')
GUEST = MatchAccess('avulso', 'a')
ATHLETE = MatchAccess('atleta', 'a')
ORGANIZER = MatchAccess('organizador', None)
ADMIN = MatchAccess('administracao', None)

ACTIONS = ('propose_terms', 'accept_terms', 'suggest_court', 'confirm_booking', 'cancel', 'report_result',
           'register_walkover', 'withdraw_walkover', 'contest_walkover', 'attendance', 'send_stats', 'manage_slots')


def match(**values):
    """A scheduled society friendly that started one hour ago."""
    starts_at = values.pop('starts_at', NOW - timedelta(hours=1))
    base = dict(origin='amistoso', sport='futebol', state='agendada', starts_at=starts_at,
                result_deadline=None if starts_at is None else starts_at + timedelta(hours=48), booking_side='a',
                walkover_absent_side=None, walkover_contested_at=None, proposal_expires_at=None, score_a=None)
    return SimpleNamespace(**{**base, **values})


def terms(**values):
    return SimpleNamespace(**{**dict(starts_at=NOW + timedelta(days=1), accepted_a_at=NOW, accepted_b_at=None),
                              **values})


def report(score_a, score_b, sets=None):
    return SimpleNamespace(score_a=score_a, score_b=score_b, sets=sets)


def allowed(permissions):
    return {name for name in ACTIONS if getattr(permissions, name)}


def perms(subject, access, facts=None, **values):
    return permissions_for(subject, access, facts or MatchFacts(), now=NOW)


def test_representative_acts_in_a_started_match_but_not_before_it():
    started = perms(match(), REPRESENTATIVE)
    # A court can no longer be suggested once the match started (the route refuses it too).
    assert allowed(started) == {'report_result', 'register_walkover', 'attendance', 'send_stats'}
    assert started.read_chat and started.write_chat
    future = match(starts_at=NOW + timedelta(days=3))
    before = perms(future, REPRESENTATIVE)
    assert allowed(before) == {'propose_terms', 'suggest_court', 'confirm_booking', 'cancel', 'manage_slots'}
    # Confirming the booking is only for the side that books.
    assert 'confirm_booking' not in allowed(perms(future, MatchAccess('representante', 'b')))


def test_members_and_walk_ins_read_and_send_stats_but_never_act_for_the_side():
    assert allowed(perms(match(), MEMBER)) == {'send_stats'}
    assert allowed(perms(match(), GUEST)) == {'send_stats'}
    assert perms(match(), MEMBER).write_chat and perms(match(), GUEST).write_chat
    assert allowed(perms(match(starts_at=NOW + timedelta(days=3)), MEMBER)) == set()


def test_strangers_the_organizer_and_the_administration_have_no_actions():
    assert allowed(perms(match(), None)) == set()
    assert not perms(match(), None).read_chat and not perms(match(), None).write_chat
    admin = perms(match(), ADMIN)
    assert allowed(admin) == set() and admin.read_chat and not admin.write_chat
    organizer = perms(match(), ORGANIZER)
    assert allowed(organizer) == set() and organizer.read_chat and organizer.write_chat


def test_combining_state_allows_terms_and_cancelling_but_no_result():
    arranging = match(state='combinando', starts_at=None, booking_side=None)
    assert allowed(perms(arranging, REPRESENTATIVE)) == {'propose_terms', 'suggest_court', 'cancel', 'manage_slots'}
    assert perms(arranging, REPRESENTATIVE).read_chat
    assert allowed(perms(match(state='proposta', starts_at=None), REPRESENTATIVE)) == set()
    assert not perms(match(state='proposta', starts_at=None), REPRESENTATIVE).read_chat


def test_accepting_terms_needs_a_pending_proposal_of_the_other_side_in_the_future():
    arranging = match(state='combinando', starts_at=None, booking_side=None)
    proposal = terms()
    assert perms(arranging, MatchAccess('representante', 'b'), MatchFacts(pending_terms=proposal)).accept_terms
    assert not perms(arranging, REPRESENTATIVE, MatchFacts(pending_terms=proposal)).accept_terms
    assert not perms(arranging, MatchAccess('membro', 'b'), MatchFacts(pending_terms=proposal)).accept_terms
    assert not perms(arranging, MatchAccess('representante', 'b'), MatchFacts()).accept_terms
    late = terms(starts_at=NOW - timedelta(minutes=1))
    assert not perms(arranging, MatchAccess('representante', 'b'), MatchFacts(pending_terms=late)).accept_terms
    championship = match(state='combinando', starts_at=None, origin='campeonato')
    assert not perms(championship, MatchAccess('representante', 'b'), MatchFacts(pending_terms=proposal)).accept_terms


def test_cancelling_follows_the_24_hour_notice_and_friendlies_only():
    soon = match(starts_at=NOW + timedelta(hours=23))
    assert not perms(soon, REPRESENTATIVE).cancel
    assert perms(match(starts_at=NOW + timedelta(hours=25)), REPRESENTATIVE).cancel
    assert not perms(match(starts_at=NOW + timedelta(days=3), origin='campeonato'), REPRESENTATIVE).cancel
    assert not perms(match(state='realizada'), REPRESENTATIVE).cancel


def test_result_window_closes_after_48_hours():
    late = match(starts_at=NOW - timedelta(hours=49))
    assert allowed(perms(late, REPRESENTATIVE)) == set()
    assert allowed(perms(match(state='realizada'), REPRESENTATIVE)) == {'attendance', 'send_stats'}
    assert allowed(perms(match(state='encerrada'), REPRESENTATIVE)) == set()


def test_walkover_rules_depend_on_the_side_the_registration_and_the_reports():
    registered = match(walkover_absent_side='b', walkover_registered_at=NOW)
    present = perms(registered, REPRESENTATIVE)
    assert {'withdraw_walkover'} <= allowed(present) and 'contest_walkover' not in allowed(present)
    assert 'report_result' not in allowed(present) and 'send_stats' not in allowed(present)
    absent = perms(registered, MatchAccess('representante', 'b'))
    assert 'contest_walkover' in allowed(absent) and 'withdraw_walkover' not in allowed(absent)
    # The absent side cannot register attendance; the present side can.
    assert present.attendance and not absent.attendance
    contested = match(walkover_absent_side='b', walkover_contested_at=NOW)
    assert not perms(contested, MatchAccess('representante', 'b')).contest_walkover
    assert not perms(contested, REPRESENTATIVE).withdraw_walkover
    # Registering is closed once the other side reported a score or a walkover exists.
    other_reported = MatchFacts(reports={'b': report(1, 0)})
    assert perms(match(), REPRESENTATIVE).register_walkover
    assert not perms(match(), REPRESENTATIVE, other_reported).register_walkover
    assert not present.register_walkover
    assert not perms(match(origin='campeonato'), REPRESENTATIVE).register_walkover


def test_stats_are_blocked_for_who_was_marked_absent_or_whose_stat_was_contested_and_reviewed_for_good():
    assert perms(match(), MEMBER, MatchFacts(lineup=SimpleNamespace(present=None))).send_stats
    assert perms(match(), MEMBER, MatchFacts(lineup=SimpleNamespace(present=True))).send_stats
    assert not perms(match(), MEMBER, MatchFacts(lineup=SimpleNamespace(present=False))).send_stats
    for state in ('enviada', 'revisada'):
        stat = SimpleNamespace(state=state, contested_at=None)
        assert perms(match(), MEMBER, MatchFacts(stat=stat)).send_stats and not stat_locked(stat)
    # Contested: the athlete waits for the review; after that review (final), the route answers 409 as well.
    waiting = SimpleNamespace(state='contestada', contested_at=NOW)
    final = SimpleNamespace(state='revisada', contested_at=NOW)
    for stat in (waiting, final):
        assert stat_locked(stat)
        assert not perms(match(), MEMBER, MatchFacts(stat=stat)).send_stats
        assert not perms(match(), GUEST, MatchFacts(stat=stat)).send_stats
    assert not perms(match(sport='tenis'), ATHLETE).send_stats and not perms(match(sport='tenis'), ATHLETE).attendance


def test_tennis_athlete_acts_for_the_side_without_slots_or_attendance():
    tennis = match(sport='tenis')
    assert allowed(perms(tennis, ATHLETE)) == {'report_result', 'register_walkover'}
    assert allowed(perms(match(sport='tenis', starts_at=NOW + timedelta(days=3)), ATHLETE)) == {
        'propose_terms', 'suggest_court', 'confirm_booking', 'cancel'}


def test_pending_actions_are_the_ones_the_card_asks_for():
    def action(subject, access, facts=None):
        facts = facts or MatchFacts()
        return needs_my_action(subject, access, permissions_for(subject, access, facts, now=NOW), facts, now=NOW)

    # Proposal: only who acts for a side that has not answered.
    sides = {'a': SimpleNamespace(accepted_at=NOW, declined_at=None), 'b': SimpleNamespace(accepted_at=None,
                                                                                         declined_at=None)}
    proposal = match(state='proposta', starts_at=None, proposal_expires_at=NOW + timedelta(hours=1))
    assert not action(proposal, REPRESENTATIVE, MatchFacts(sides=sides))
    assert action(proposal, MatchAccess('representante', 'b'), MatchFacts(sides=sides))
    assert not action(proposal, MatchAccess('membro', 'b'), MatchFacts(sides=sides))
    assert not action(proposal, ADMIN, MatchFacts(sides=sides))
    expired = match(state='proposta', starts_at=None, proposal_expires_at=NOW - timedelta(minutes=1))
    assert not action(expired, MatchAccess('representante', 'b'), MatchFacts(sides=sides))

    # Terms to accept.
    arranging = match(state='combinando', starts_at=None, booking_side=None)
    assert action(arranging, MatchAccess('representante', 'b'), MatchFacts(pending_terms=terms()))
    assert not action(arranging, REPRESENTATIVE, MatchFacts(pending_terms=terms()))
    assert not action(arranging, MatchAccess('representante', 'b'))

    # Score: missing, waiting for the other side, or different from the other side.
    started = match()
    mine, theirs, sent = report(2, 1), report(2, 1), SimpleNamespace(state='enviada')
    assert action(started, REPRESENTATIVE, MatchFacts(reports={'b': theirs}, stat=sent))
    assert not action(started, REPRESENTATIVE, MatchFacts(reports={'a': mine}, stat=sent))
    assert action(started, REPRESENTATIVE, MatchFacts(reports={'a': mine, 'b': report(1, 1)}, stat=sent))
    # Stats: members and walk-ins until they send them.
    assert action(started, MEMBER) and action(started, GUEST)
    assert not action(started, MEMBER, MatchFacts(stat=sent))
    # Walkover: the absent side contests.
    registered = match(walkover_absent_side='b')
    assert action(registered, MatchAccess('representante', 'b'))
    assert not action(registered, REPRESENTATIVE) and not action(registered, MatchAccess('membro', 'b'))
    assert not action(match(state='cancelada'), REPRESENTATIVE) and not action(started, None)
    assert not action(started, ORGANIZER)


@pytest.mark.parametrize(('values', 'reports', 'expected'), [
    (dict(), {}, 'aguardando'),
    (dict(), {'a': report(1, 0)}, 'aguardando'),
    (dict(), {'a': report(1, 0), 'b': report(1, 0)}, 'aguardando'),
    (dict(), {'a': report(1, 0), 'b': report(0, 0)}, 'divergente'),
    (dict(walkover_absent_side='b'), {}, 'wo_registrado'),
    (dict(walkover_absent_side='b', walkover_contested_at=NOW), {}, 'wo_contestado'),
    (dict(state='realizada', score_a=2), {}, 'confirmado'),
    (dict(state='encerrada', score_a=3, walkover_absent_side='b'), {}, 'confirmado'),
    (dict(state='sem_resultado'), {}, 'sem_resultado'),
    (dict(state='sem_resultado', walkover_absent_side='b', walkover_contested_at=NOW), {}, 'sem_resultado'),
])
def test_result_state_of_each_phase(values, reports, expected):
    assert result_state_of(match(**values), MatchFacts(reports=reports)) == expected


def test_reports_differ_compares_goals_and_tennis_sets():
    equal = [{'a': 6, 'b': 4, 'tiebreak': None, 'super_tiebreak': False}] * 2
    other = [{'a': 6, 'b': 3, 'tiebreak': None, 'super_tiebreak': False}] * 2
    assert not MatchFacts(reports={'a': report(2, 0, equal), 'b': report(2, 0, equal)}).reports_differ
    assert MatchFacts(reports={'a': report(2, 0, equal), 'b': report(2, 0, other)}).reports_differ
    assert not MatchFacts(reports={'a': report(2, 0, equal)}).reports_differ
    assert report_score(report(1, 3)).winner == 'b' and report_score(report(2, 2)).winner is None
    assert report_score(report(2, 0, equal)).sets is not None and report_score(report(1, 0)).sets is None

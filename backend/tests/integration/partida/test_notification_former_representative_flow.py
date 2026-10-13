"""Match actions with a shared key (terms, walkover, divergent result) of a representative who stops representing
the team: they close for that person alone, and only when the person receives them solely as that team's
representative. Same world and clock as `test_notification_resolution_flow.py`.
"""
import pytest

from app.models.teams import TeamMember
from app.services import notifications
from tests.integration.match_helpers import make_team
from tests.integration.partida.helpers import API, HOUR, NOW, agreed_match, make_match
from tests.integration.partida.test_terms_flow import combining, propose
from tests.integration.partida.test_walkover_flow import register, started
from tests.integration.result_helpers import put_result
from tests.integration.test_notification_resolution_matches_flow import pending, rows

BOTH = ('condicoes_propostas', 'resultado_divergente', 'wo_registrado')


@pytest.fixture(autouse=True)
def fixed_notification_clock(monkeypatch, clock):
    monkeypatch.setattr(notifications, 'utcnow', lambda: clock['now'])


def types(http, world, who):
    return sorted(item['type'] for item in pending(http, world['h'][who]))


def team_url(world, who='member_a'):
    return f"{API}/teams/{world['team_a'].id}/members/{world[who].id}"


def two_representatives(http, world):
    """`member_a` gets the armband next to `rep_a`."""
    response = http.patch(team_url(world), json={'role': 'representante'}, headers=world['h']['rep_a'])
    assert response.status_code == 200, response.text


def open_match_actions(http, db, world):
    """Terms proposed by B, a divergent score and a walkover registered by B: all of them reach side A."""
    terms_match = combining(db, world)
    assert propose(http, world, terms_match, 'rep_b').status_code == 201
    result_match = agreed_match(db, world, starts_at=NOW - 2 * HOUR)
    assert put_result(http, world['h']['rep_a'], result_match.id, 2, 1).status_code == 200
    assert put_result(http, world['h']['rep_b'], result_match.id, 0, 0).status_code == 200
    walkover_match = started(db, world)
    assert register(http, world, walkover_match, 'rep_b').status_code == 200
    return terms_match, result_match, walkover_match


def stop(http, world, how):
    if how == 'leave':
        response = http.delete(team_url(world), headers=world['h']['member_a'])
    elif how == 'removed':
        response = http.delete(team_url(world), headers=world['h']['rep_a'])
    else:
        response = http.patch(team_url(world), json={'role': 'membro'}, headers=world['h']['rep_a'])
    assert response.status_code in (200, 204), response.text


@pytest.mark.parametrize('how', ('leave', 'removed', 'demoted'))
def test_terms_divergent_result_and_walkover_close_only_for_the_one_who_stops_representing(client, world, clock, how):
    http, db = client
    two_representatives(http, world)
    matches = open_match_actions(http, db, world)
    assert types(http, world, 'rep_a') == types(http, world, 'member_a') == sorted(BOTH)
    assert types(http, world, 'rep_b') == ['resultado_divergente']

    stop(http, world, how)

    assert types(http, world, 'member_a') == []
    assert types(http, world, 'rep_a') == sorted(BOTH)
    assert types(http, world, 'rep_b') == ['resultado_divergente']
    for prefix in ('terms:', f'result:{matches[1].id}', f'wo:{matches[2].id}'):
        assert {row.user_id: row.resolved_at is None for row in rows(db, prefix)
                if row.user_id != world['rep_b'].id} == {world['rep_a'].id: True, world['member_a'].id: False}


def test_actions_received_by_another_role_are_kept(client, world, clock):
    http, db = client
    two_representatives(http, world)
    member = world['member_a']

    # Also represents the opposing team of a match with team A: the terms proposed by A reach them as B's representative.
    db.add(TeamMember(team_id=world['team_b'].id, user_id=member.id, role='representante', joined_via='convite'))
    db.flush()
    against_b = combining(db, world)
    assert propose(http, world, against_b, 'rep_a').status_code == 201
    assert types(http, world, 'member_a') == ['condicoes_propostas']

    # Represents another team (C) in a match against B, and is the athlete of a tennis match: none of it depends on A.
    team_c = make_team(db, member, name='Cometas FC')
    other_match = make_match(db, 'combinando', [team_c, world['team_b']])
    assert propose(http, world, other_match, 'rep_b').status_code == 201
    tennis = make_match(db, 'proposta', [member, world['tenista_b']], sport='tenis')
    notifications.notify(db, member.id, 'proposta_partida',
                         {'match_id': tennis.id, 'sport': 'tenis', 'format': None, 'opponent_name': 'Tenista',
                          'expires_at': tennis.proposal_expires_at.isoformat()},
                         action_key=notifications.proposal_key(tennis.id, member.id),
                         action_until=tennis.proposal_expires_at)
    db.commit()
    kept = types(http, world, 'member_a')
    assert kept == ['condicoes_propostas', 'condicoes_propostas', 'proposta_partida']

    assert http.delete(team_url(world), headers=world['h']['member_a']).status_code == 204

    assert types(http, world, 'member_a') == kept


def test_closing_the_team_closes_what_is_left_for_each_former_representative(client, world, clock):
    http, db = client
    two_representatives(http, world)
    # Cases the closing check does not block: a cancelled match whose divergence alert was left open.
    finished = make_match(db, 'cancelada', [world['team_a'], world['team_b']])
    for who in ('rep_a', 'member_a', 'rep_b'):
        notifications.notify(db, world[who].id, 'resultado_divergente', {'match_id': finished.id, 'deadline': 'x'},
                             action_key=notifications.result_key(finished.id))
    db.commit()
    assert types(http, world, 'rep_a') == types(http, world, 'member_a') == ['resultado_divergente']

    assert http.post(f"{API}/teams/{world['team_a'].id}/close", json={}, headers=world['h']['rep_a']
                     ).status_code == 204

    assert types(http, world, 'rep_a') == types(http, world, 'member_a') == []
    assert types(http, world, 'rep_b') == ['resultado_divergente']

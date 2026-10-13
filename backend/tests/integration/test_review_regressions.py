"""Regression coverage of the play-page review: suspension, blind result and final stats review."""
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.models.matches import Match
from app.services.matchmaking_queue import queue
from tests.integration.match_helpers import NOW, add, make_user, tennis_search
from tests.integration.result_helpers import lineup, login, put_result
from tests.integration.test_results_flow import confirm, my_stats, review, standings
from tests.integration.test_results_flow import world as world


def test_the_sweep_does_not_pair_a_search_whose_owner_was_suspended(client):
    http, db = client
    suspended, active = make_user(db, 'suspended'), make_user(db, 'active')
    admin = make_user(db, 'admin', admin=True)
    first = add(db, tennis_search(suspended, started_at=NOW - timedelta(hours=2)))
    second = add(db, tennis_search(active, started_at=NOW - timedelta(hours=1)))
    headers = login(db, admin)
    db.commit()
    response = http.put(f'/api/v1/admin/users/{suspended.id}/status', headers=headers,
                        params={'active': False, 'justification': 'Suspensão de teste.'}, json={})
    assert response.status_code == 200, response.text
    queue.rematch(db, NOW)
    assert first.state == second.state == 'ativa'
    assert db.scalar(select(Match.id)) is None
    # Other active players can still pair; the suspended search never becomes either side.
    third = add(db, tennis_search(make_user(db, 'third'), started_at=NOW))
    queue.rematch(db, NOW)
    assert second.state == third.state == 'pareada' and first.state == 'ativa'


@pytest.mark.parametrize('goals_a,goals_b', [(3, 1), (1, 1), (0, 2)])
def test_blind_reports_do_not_leak_the_outcome_or_total_through_stats(world, goals_a, goals_b):
    w = world
    member = w.people['member_a']
    lineup(w.db, w.match, member, 'a', 'atacante')
    w.db.commit()
    assert put_result(w.http, w.h['rep_a'], w.match.id, goals_a, goals_b).status_code == 200
    path = f'/api/v1/matches/{w.match.id}/stats'
    def points(who):
        response = w.http.get(path, headers=w.h[who])
        assert response.status_code == 200, response.text
        return next(row['points'] for row in response.json()['items'] if row['user']['id'] == member.id)
    # Own side and administration see the estimate; the opponent sees only presence and known stats.
    outcome = 3 if goals_a > goals_b else 1 if goals_a == goals_b else 0
    assert points('rep_a')['result'] == points('admin')['result'] == outcome
    for viewer in ('rep_b', 'member_b'):
        assert points(viewer)['result'] is None and points(viewer)['total'] == 1
    assert put_result(w.http, w.h['rep_b'], w.match.id, goals_a, goals_b).status_code == 200
    assert points('rep_b')['result'] == outcome


def test_final_review_cannot_change_stats_or_rankings_again(world):
    w = world
    sent = my_stats(w, 'member_a', goals=2)
    assert sent.status_code == 200, sent.text
    stat_id = sent.json()['lineup']['stat']['id']
    assert review(w, 'rep_a', stat_id).status_code == 200
    contested = w.http.post(f'/api/v1/matches/{w.match.id}/stats/{stat_id}/contest', headers=w.h['rep_b'],
                            json={'fields': ['gols'], 'reason': 'O atleta marcou só um gol.'})
    assert contested.status_code == 200, contested.text
    confirm(w, w.match, 3, 1)
    final = review(w, 'rep_a', stat_id, goals=1)
    assert final.status_code == 200 and final.json()['can_review'] is False
    repeated = review(w, 'rep_a', stat_id, goals=50)
    assert repeated.status_code == 409, repeated.text
    current = w.http.get(f'/api/v1/matches/{w.match.id}/stats', headers=w.h['rep_a']).json()['items']
    member = next(row for row in current if row['user']['id'] == w.people['member_a'].id)
    assert member['stat']['goals'] == 1 and member['can_review'] is False
    rank = standings(w.db)[(w.people['member_a'].id, 'futebol', 'society', 'atacante')]
    assert rank.metric_value == final.json()['points']['total']

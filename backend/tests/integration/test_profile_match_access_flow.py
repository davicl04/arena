"""Historical detail reads never grant former participants actions, chat or other athletes' stats."""
import pytest

from tests.integration.match_helpers import NOW, make_user, scheduled_match
from tests.integration.profile_helpers import DAY, football, join, new_team, stat
from tests.integration.result_helpers import lineup, login


@pytest.mark.parametrize('participant', ['ex_membro', 'avulso'])
@pytest.mark.parametrize('state', ['realizada', 'encerrada', 'sem_resultado', 'cancelada'])
def test_historical_participant_opens_detail_without_actions_or_chat(client, participant, state):
    http, db = client
    owner, opponent = make_user(db, 'historico'), make_user(db, 'adversario')
    team, rival = new_team(db, 'Time A'), new_team(db, 'Time B')
    if participant == 'ex_membro':
        join(db, team, owner, left_at=NOW - DAY, role='representante')
    match = football(db, team, rival, 2, 1, starts_at=NOW - 10 * DAY, state=state)
    own_line = lineup(db, match, owner, 'a', 'atacante', present=True,
                      guest=participant == 'avulso', team_id=team.id)
    lineup(db, match, opponent, 'b', 'defesa', present=True, team_id=rival.id)
    stat(db, own_line, goals=1)
    headers = login(db, owner)
    path = f'/api/v1/matches/{match.id}'
    assert http.get(f'/api/v1/users/{owner.id}/timeline', headers=headers).json()['items'][0]['id'] == match.id
    detail = http.get(path, headers=headers)
    assert detail.status_code == 200
    body = detail.json()
    assert (body['my_role'], body['my_side']) == ('historico', 'a')
    assert not any(body['permissions'].values())
    assert body['needs_my_action'] is False
    own_stats = http.get(path + '/stats', headers=headers)
    assert own_stats.status_code == 200
    assert [item['user']['id'] for item in own_stats.json()['items']] == [owner.id]
    assert own_stats.json()['items'][0]['stat']['goals'] == 1
    assert not own_stats.json()['items'][0]['can_review']
    assert not own_stats.json()['items'][0]['can_contest']
    assert http.get(path + '/messages', headers=headers).status_code == 404
    assert http.post(path + '/messages', headers=headers, json={'body': 'Mensagem indevida'}).status_code == 404
    assert http.post(path + '/cancel', headers=headers, json={'reason': 'Cancelamento indevido'}).status_code == 404
    assert http.put(path + '/my-stats', headers=headers,
                    json={'position': 'atacante', 'goals': 9}).status_code == 404
    assert http.put(path + '/result', headers=headers, json={'goals_a': 9, 'goals_b': 0}).status_code == 404
    db.refresh(match)
    assert match.state == state
    assert http.get(path + '/stats', headers=headers).json()['items'][0]['stat']['goals'] == 1


@pytest.mark.parametrize('excluded', ['estranho', 'novo_membro', 'ausente', 'avulso_removido', 'agendada'])
def test_history_fallback_excludes_nonparticipants_and_open_matches(client, excluded):
    http, db = client
    owner = make_user(db, 'sem_acesso')
    team, rival = new_team(db, 'Time A'), new_team(db, 'Time B')
    match = (scheduled_match(db, team, rival, starts_at=NOW - 10 * DAY, open_slots=False)
             if excluded == 'agendada' else football(db, team, rival, 1, 0, starts_at=NOW - 10 * DAY))
    if excluded in ('novo_membro', 'ausente', 'agendada'):
        join(db, team, owner, joined_at=NOW - 11 * DAY if excluded != 'novo_membro' else NOW - 3 * DAY,
             left_at=NOW - DAY)
    if excluded in ('ausente', 'avulso_removido'):
        row = lineup(db, match, owner, 'a', 'defesa', present=excluded != 'ausente',
                     guest=excluded == 'avulso_removido', team_id=team.id)
        if excluded == 'avulso_removido':
            row.removed_at = NOW - DAY
    db.flush()
    headers = login(db, owner)
    assert http.get(f'/api/v1/matches/{match.id}', headers=headers).status_code == 404
    assert http.get(f'/api/v1/matches/{match.id}/stats', headers=headers).status_code == 404


def test_former_member_without_roll_call_can_read_detail_but_not_current_rosters(client):
    http, db = client
    owner, current = make_user(db, 'sem_chamada'), make_user(db, 'atual')
    team, rival = new_team(db, 'Time A'), new_team(db, 'Time B')
    join(db, team, owner, left_at=NOW - DAY)
    join(db, team, current, joined_at=NOW)
    match = football(db, team, rival, 1, 0, starts_at=NOW - 10 * DAY)
    headers = login(db, owner)
    assert http.get(f'/api/v1/matches/{match.id}', headers=headers).status_code == 200
    assert http.get(f'/api/v1/matches/{match.id}/stats', headers=headers).json() == {'items': []}

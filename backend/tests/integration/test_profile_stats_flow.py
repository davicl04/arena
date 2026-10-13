"""GET /me/profile-stats on PostgreSQL: counts of the history (walkover included; cancelled, without result and
runs out) and the best tier among the ranked lines of /me/standings."""
from tests.integration.entry_helpers import standing
from tests.integration.match_helpers import NOW, make_user
from tests.integration.profile_helpers import football, join, new_team, tennis, walkover
from tests.integration.result_helpers import DAY, login

API = '/api/v1'
EMPTY = {'played': 0, 'wins': 0, 'draws': 0, 'losses': 0, 'win_rate': None, 'best_tier': None,
         'in_placement': False}


def stats(http, db, user):
    response = http.get(f'{API}/me/profile-stats', headers=login(db, user))
    assert response.status_code == 200, response.text
    return response.json()


def test_stats_need_a_session(client):
    http, _ = client
    assert http.get(f'{API}/me/profile-stats').status_code == 401


def test_new_account_has_no_numbers(client):
    http, db = client
    assert stats(http, db, make_user(db, 'novata')) == EMPTY


def test_counts_use_the_participation_rule_with_walkovers_and_exclusions(client):
    http, db = client
    owner, rival = make_user(db, 'dono'), make_user(db, 'rival')
    team, other = new_team(db, 'Time Dono'), new_team(db, 'Time Rival')
    join(db, team, owner)
    football(db, team, other, 2, 0, starts_at=NOW - 9 * DAY)                      # win
    football(db, other, team, 1, 1, starts_at=NOW - 8 * DAY)                      # draw
    football(db, team, other, 0, 1, starts_at=NOW - 7 * DAY)                      # loss
    walkover(db, team, other, 'b', starts_at=NOW - 6 * DAY)                       # win by walkover
    walkover(db, team, other, 'a', starts_at=NOW - 5 * DAY)                       # loss by walkover
    tennis(db, owner, rival, starts_at=NOW - 4 * DAY)                             # tennis win
    football(db, team, other, 0, 0, starts_at=NOW - 3 * DAY, state='cancelada')   # out
    football(db, team, other, 0, 0, starts_at=NOW - 2 * DAY, state='sem_resultado')  # out
    walkover(db, team, other, 'a', starts_at=NOW - DAY, decision='anulado')       # out (annulled)
    football(db, other, new_team(db, 'Terceiro'), 4, 0, starts_at=NOW - 10 * DAY)  # not the owner's
    assert stats(http, db, owner) == {**EMPTY, 'played': 6, 'wins': 3, 'draws': 1, 'losses': 2, 'win_rate': 50.0}


def test_win_rate_has_one_decimal(client):
    http, db = client
    owner = make_user(db, 'dono')
    team, other = new_team(db, 'Time Dono'), new_team(db, 'Time Rival')
    join(db, team, owner)
    for index, goals in enumerate((1, 1, 0)):
        football(db, team, other, goals, 0, starts_at=NOW - (index + 1) * DAY)
    result = stats(http, db, owner)
    assert (result['played'], result['wins'], result['win_rate']) == (3, 2, 66.7)


def test_stats_are_only_the_session_ones(client):
    http, db = client
    owner, other = make_user(db, 'dono'), make_user(db, 'outro')
    team, rival = new_team(db, 'Time Dono'), new_team(db, 'Time Rival')
    join(db, team, owner)
    football(db, team, rival, 1, 0)
    assert stats(http, db, other) == EMPTY
    assert stats(http, db, owner)['played'] == 1


def test_best_tier_is_the_highest_ranked_line_across_sports(client):
    http, db = client
    owner = make_user(db, 'dono')
    standing(db, tier='prata', user_id=owner.id, sport='tenis')
    standing(db, tier='ouro', user_id=owner.id, sport='futebol', format='society', position='atacante')
    standing(db, tier='diamante', user_id=owner.id, sport='corrida', distance_km=5)
    standing(db, tier='bronze', user_id=owner.id, sport='corrida', distance_km=10)
    assert stats(http, db, owner)['best_tier'] == 'diamante'
    assert stats(http, db, owner)['in_placement'] is False


def test_lines_still_in_placement_never_give_a_tier(client):
    http, db = client
    owner = make_user(db, 'dono')
    row = standing(db, tier=None, user_id=owner.id, sport='tenis')
    row.matches_played = 2
    db.flush()
    assert (stats(http, db, owner)['best_tier'], stats(http, db, owner)['in_placement']) == (None, True)


def test_ranked_line_wins_over_a_line_in_placement(client):
    http, db = client
    owner = make_user(db, 'dono')
    placing = standing(db, tier=None, user_id=owner.id, sport='tenis')
    placing.matches_played = 1
    standing(db, tier='bronze', user_id=owner.id, sport='corrida', distance_km=3)
    result = stats(http, db, owner)
    assert (result['best_tier'], result['in_placement']) == ('bronze', False)


def test_team_lines_count_for_the_best_tier(client):
    http, db = client
    owner = make_user(db, 'dono')
    team = new_team(db, 'Time Dono')
    join(db, team, owner)
    standing(db, tier='lendario', team_id=team.id, sport='futebol', format='campo')
    assert stats(http, db, owner)['best_tier'] == 'lendario'

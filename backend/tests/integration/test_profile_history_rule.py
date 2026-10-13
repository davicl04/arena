"""Participation rule of the profile history (A1) on PostgreSQL: who has which match in the history."""
from app.services.profile_history import tally
from tests.integration.match_helpers import NOW, make_user, scheduled_match
from tests.integration.profile_helpers import (
    DAY,
    football,
    history_ids,
    join,
    new_team,
    tennis,
    walkover,
)
from tests.integration.result_helpers import lineup


def two_teams(db):
    return new_team(db, 'Time A'), new_team(db, 'Time B')


def test_confirmed_presence_counts_even_for_a_walk_in(client):
    _, db = client
    team_a, team_b = two_teams(db)
    guest = make_user(db, 'avulso')
    match = football(db, team_a, team_b, 2, 1)
    lineup(db, match, guest, 'a', 'atacante', present=True, guest=True, team_id=team_a.id)
    assert history_ids(db, guest) == {match.id}


def test_unknown_presence_falls_back_to_the_membership_on_the_date(client):
    _, db = client
    team_a, team_b = two_teams(db)
    member = make_user(db, 'membro')
    join(db, team_a, member)
    match = football(db, team_a, team_b, 1, 1)
    lineup(db, match, member, 'a', 'defesa', present=None)
    assert history_ids(db, member) == {match.id}


def test_absent_athlete_is_excluded_even_as_a_member(client):
    _, db = client
    team_a, team_b = two_teams(db)
    member = make_user(db, 'faltou')
    join(db, team_a, member)
    match = football(db, team_a, team_b, 1, 0)
    lineup(db, match, member, 'a', 'defesa', present=False)
    assert history_ids(db, member) == set()


def test_removed_walk_in_does_not_count(client):
    _, db = client
    team_a, team_b = two_teams(db)
    guest = make_user(db, 'removido')
    match = football(db, team_a, team_b, 1, 0)
    row = lineup(db, match, guest, 'a', 'defesa', present=True, guest=True, team_id=team_a.id)
    row.removed_at = NOW
    db.flush()
    assert history_ids(db, guest) == set()


def test_former_member_keeps_the_past_and_a_new_member_does_not_inherit_it(client):
    _, db = client
    team_a, team_b = two_teams(db)
    former, newcomer = make_user(db, 'ex'), make_user(db, 'novo')
    join(db, team_a, former, left_at=NOW - DAY)                 # left yesterday, after the old match
    join(db, team_a, newcomer, joined_at=NOW - DAY)             # arrived yesterday
    old = football(db, team_a, team_b, 3, 0, starts_at=NOW - 10 * DAY)
    recent = football(db, team_a, team_b, 0, 2, starts_at=NOW - DAY // 2)
    assert history_ids(db, former) == {old.id}
    assert history_ids(db, newcomer) == {recent.id}


def test_tennis_counts_for_both_players_and_not_for_others(client):
    _, db = client
    first, second, other = make_user(db, 'um'), make_user(db, 'dois'), make_user(db, 'tres')
    match = tennis(db, first, second)
    assert history_ids(db, first) == history_ids(db, second) == {match.id}
    assert history_ids(db, other) == set()


def test_walkover_reaches_both_sides_and_the_absent_one_loses(client):
    _, db = client
    team_a, team_b = two_teams(db)
    absent, present = make_user(db, 'ausente'), make_user(db, 'presente')
    join(db, team_a, absent)
    join(db, team_b, present)
    walkover(db, team_a, team_b, 'a')
    assert (tally(db, absent.id).losses, tally(db, absent.id).wins) == (1, 0)
    assert (tally(db, present.id).wins, tally(db, present.id).losses) == (1, 0)


def test_annulled_walkover_is_in_the_history_but_not_in_the_count(client):
    _, db = client
    team_a, team_b = two_teams(db)
    member = make_user(db, 'membro')
    join(db, team_a, member)
    match = walkover(db, team_a, team_b, 'a', decision='anulado')
    assert history_ids(db, member) == {match.id}
    assert tally(db, member.id).played == 0


def test_cancelled_match_needs_a_date_and_open_states_never_enter(client):
    _, db = client
    team_a, team_b = two_teams(db)
    member = make_user(db, 'membro')
    join(db, team_a, member)
    dated = football(db, team_a, team_b, 0, 0, state='cancelada')
    undated = football(db, team_a, team_b, 0, 0, state='cancelada', starts_at=NOW - 3 * DAY)
    undated.starts_at = undated.result_deadline = None
    # Started and still waiting for the score: stays in the Jogar.
    scheduled_match(db, team_a, team_b, starts_at=NOW - 4 * DAY, open_slots=False)
    db.flush()
    assert history_ids(db, member) == {dated.id}


def test_confirmed_score_enters_before_the_stats_window_closes(client):
    _, db = client
    team_a, team_b = two_teams(db)
    member = make_user(db, 'membro')
    join(db, team_a, member)
    football_match = football(db, team_a, team_b, 2, 0, state='realizada')
    player, rival = make_user(db, 'tenista'), make_user(db, 'rival')
    tennis_match = tennis(db, player, rival, state='realizada')
    assert history_ids(db, member) == {football_match.id}
    assert history_ids(db, player) == {tennis_match.id}
    assert tally(db, member.id).wins == 1
    assert tally(db, player.id).played == 1

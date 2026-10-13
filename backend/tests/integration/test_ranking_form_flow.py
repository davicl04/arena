"""Recent form and best mark day of the rankings on PostgreSQL (Ranking screen): `standings.recent_form` and
`standings.best_mark_on` are written by the same recalculation as the points, by every path that changes the scored
matches (confirmed result, attendance and stats, running marks, the window sweep); the `recalculate-rankings`
command fills old rows and is idempotent. The W.O. paths are in `partida/test_ranking_form_walkover.py`.
"""
from datetime import date
from types import SimpleNamespace

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import Session

from app import admin_cli
from app.models.matches import FootballStat, MatchLineup
from app.models.rankings import Standing
from app.services.match_lifecycle import apply_final_score
from app.services.match_rules import result_deadline, walkover_score
from app.services.standings import RankingKey, recalculate_outside_window, recalculate_rankings
from tests.integration.match_helpers import NOW, add, make_team, make_user, scheduled_match
from tests.integration.result_helpers import (
    DAY,
    HOUR,
    WEEK,
    lineup,
    login,
    played,
    played_tennis,
    put_result,
    use_clock,
)
from tests.integration.run_helpers import log_run, logged, runner
from tests.integration.run_helpers import use_clock as use_run_clock

SOCIETY = RankingKey('futebol_time', 'society')
SETS_WIN = [{'a': 6, 'b': 3}, {'a': 6, 'b': 4}]


@pytest.fixture
def db(test_engine):
    with test_engine.connect() as connection:
        transaction = connection.begin()
        with Session(bind=connection, join_transaction_mode='create_savepoint', expire_on_commit=False) as session:
            yield session
        transaction.rollback()


def two_teams(db, a='Ferrugem', b='Leoes'):
    reps = [make_user(db, name) for name in ('rep-a', 'rep-b')]
    return make_team(db, reps[0], name=a), make_team(db, reps[1], name=b), reps


def team_form(db, team):
    return db.scalar(select(Standing.recent_form).where(Standing.team_id == team.id))


# ----- Teams -------------------------------------------------------------------------------------------------------

def test_a_team_keeps_its_last_five_results_oldest_first_and_the_ones_in_placement_have_one_too(db):
    team_a, team_b, _ = two_teams(db)
    # Team a (goals first): W D L W W D at one-day steps, then two matches with the same start, created in the
    # order loss, win: the match id breaks the tie.
    for number, (goals_a, goals_b) in enumerate([(2, 0), (1, 1), (0, 1), (3, 0), (1, 0), (2, 2)], start=1):
        played(db, team_a, team_b, goals_a, goals_b, starts_at=NOW - (10 - number) * DAY)
    same_start = NOW - 3 * DAY
    played(db, team_a, team_b, 0, 4, starts_at=same_start)
    played(db, team_a, team_b, 3, 0, starts_at=same_start)
    # Matches that do not count: not scored (still scheduled) and outside the 52 weeks.
    scheduled_match(db, team_a, team_b, starts_at=NOW - HOUR, open_slots=False)
    played(db, team_a, team_b, 9, 0, starts_at=NOW - 60 * WEEK)
    recalculate_rankings(db, [SOCIETY], now=NOW)
    rows = {row.team_id: row for row in db.scalars(select(Standing).where(Standing.team_id.is_not(None)))}
    # a: W D L W W D L W -> the last five are W W D L W; b is the mirror.
    assert rows[team_a.id].recent_form == 'VVEDV' and rows[team_b.id].recent_form == 'DDEVD'
    assert rows[team_a.id].matches_played == 8 and rows[team_a.id].best_mark_on is None
    # One match is not enough to classify: the subject is in placement and still has a form.
    newcomer, other = two_teams(db, 'Novo', 'Outro')[:2]
    played(db, newcomer, other, 2, 1, starts_at=NOW - DAY, format_='campo')
    recalculate_rankings(db, [RankingKey('futebol_time', 'campo')], now=NOW)
    placement = db.scalar(select(Standing).where(Standing.team_id == newcomer.id))
    assert (placement.rank_position, placement.tier, placement.recent_form) == (None, None, 'V')


def test_a_row_is_rewritten_when_only_the_form_changes(db):
    team_a, team_b, _ = two_teams(db)
    win = played(db, team_a, team_b, 1, 0, starts_at=NOW - 10 * DAY)
    played(db, team_a, team_b, 0, 1, starts_at=NOW - 9 * DAY)
    assert recalculate_rankings(db, [SOCIETY], now=NOW) == 2
    assert (team_form(db, team_a), team_form(db, team_b)) == ('VD', 'DV')
    assert recalculate_rankings(db, [SOCIETY], now=NOW) == 0
    # The same two results in the other order: points, record and goals are identical, only the form differs.
    win.starts_at = NOW - 8 * DAY
    win.result_deadline = result_deadline(win.starts_at)
    db.flush()
    assert recalculate_rankings(db, [SOCIETY], now=NOW) == 2
    assert (team_form(db, team_a), team_form(db, team_b)) == ('DV', 'VD')


# ----- A confirmed result and the attendance, over HTTP ---------------------------------------------------------

@pytest.fixture
def world(client, monkeypatch):
    http, db = client
    use_clock(monkeypatch)
    team_a, team_b, reps = two_teams(db, 'Ferrugem FC', 'Tigres do Lago')
    headers = [login(db, rep) for rep in reps]
    db.commit()
    return SimpleNamespace(http=http, db=db, a=team_a, b=team_b, reps=reps, h=headers)


def confirm(w, goals_a, goals_b, *, hours_ago=2):
    match = scheduled_match(w.db, w.a, w.b, starts_at=NOW - hours_ago * HOUR, open_slots=False)
    w.db.commit()
    for headers in w.h:
        assert put_result(w.http, headers, match.id, goals_a, goals_b).status_code == 200
    return match


def test_a_confirmed_result_writes_the_form_of_both_teams_and_the_next_one_updates_it(world):
    w = world
    confirm(w, 2, 1, hours_ago=30)
    assert (team_form(w.db, w.a), team_form(w.db, w.b)) == ('V', 'D')            # in placement, with a form
    confirm(w, 1, 1, hours_ago=20)
    assert (team_form(w.db, w.a), team_form(w.db, w.b)) == ('VE', 'DE')
    confirm(w, 0, 3, hours_ago=10)
    assert (team_form(w.db, w.a), team_form(w.db, w.b)) == ('VED', 'DEV')


def attendance(w, who, athletes, match):
    return w.http.put(f'/api/v1/matches/{match.id}/attendance', json={'athletes': athletes}, headers=w.h[who])


def test_the_attendance_of_a_confirmed_match_writes_the_individual_form_only_for_who_was_present(world):
    w = world
    match = confirm(w, 2, 1)
    assert attendance(w, 0, [{'user_id': w.reps[0].id, 'present': True, 'position': 'goleiro'}], match).status_code == 200
    assert attendance(w, 1, [{'user_id': w.reps[1].id, 'present': True, 'position': 'goleiro'}], match).status_code == 200
    rows = {row.user_id: row for row in w.db.scalars(select(Standing).where(Standing.user_id.is_not(None)))}
    assert (rows[w.reps[0].id].recent_form, rows[w.reps[1].id].recent_form) == ('V', 'D')
    # Not present: the row (and the form) goes away.
    assert attendance(w, 0, [{'user_id': w.reps[0].id, 'present': False}], match).status_code == 200
    assert w.db.scalar(select(Standing).where(Standing.user_id == w.reps[0].id)) is None
    # Reviewed stats add points, not results: the average changes, the form stays.
    row = w.db.scalar(select(Standing).where(Standing.user_id == w.reps[1].id))
    before = float(row.metric_value)
    own = w.db.scalar(select(MatchLineup).where(MatchLineup.match_id == match.id,
                                                MatchLineup.user_id == w.reps[1].id))
    add(w.db, FootballStat(lineup_id=own.id, match_id=match.id, user_id=own.user_id, goals=2, state='revisada',
                           reviewed_at=NOW, submitted_at=NOW))
    recalculate_rankings(w.db, [RankingKey('futebol_individual', 'society', 'goleiro')], now=NOW)
    assert (row.recent_form, float(row.metric_value) > before) == ('D', True)


# ----- Individual, tennis and the window ---------------------------------------------------------------------------

def test_the_individual_form_counts_only_present_athletes_and_the_side_that_showed_up_in_a_walkover(db):
    team_a, team_b, _ = two_teams(db)
    star, benched, guest = (make_user(db, name) for name in ('craque', 'banco', 'avulso'))
    first = played(db, team_a, team_b, 1, 1, starts_at=NOW - 4 * DAY)
    second = played(db, team_a, team_b, 3, 0, starts_at=NOW - 3 * DAY)
    for match in (first, second):
        lineup(db, match, star, 'a', 'atacante')
        lineup(db, match, benched, 'a', 'atacante', present=False)
    removed = lineup(db, second, guest, 'b', 'atacante', guest=True)
    removed.removed_at = NOW
    walkover = scheduled_match(db, team_a, team_b, starts_at=NOW - 2 * DAY, open_slots=False)
    lineup(db, walkover, star, 'b', 'atacante')
    lineup(db, walkover, benched, 'a', 'atacante')
    walkover.walkover_absent_side, walkover.walkover_registered_at = 'a', NOW - 2 * DAY + HOUR
    apply_final_score(walkover, walkover_score('futebol', 'a'), source='wo', now=NOW - DAY)
    walkover.state, walkover.closed_at = 'encerrada', NOW - DAY
    db.flush()
    recalculate_rankings(db, [RankingKey('futebol_individual', 'society', 'atacante')], now=NOW)
    rows = {row.user_id: row for row in db.scalars(select(Standing).where(Standing.user_id.is_not(None)))}
    assert set(rows) == {star.id}
    assert rows[star.id].recent_form == 'EVV'          # draw, win and the walkover win; absent side not counted


def test_the_tennis_form_has_wins_and_losses_only(db):
    ana, bia = make_user(db, 'ana'), make_user(db, 'bia')
    for number, (winner, loser) in enumerate([(ana, bia), (bia, ana), (ana, bia), (ana, bia), (bia, ana), (ana, bia)]):
        played_tennis(db, winner, loser, SETS_WIN, starts_at=NOW - (10 - number) * DAY)
    recalculate_rankings(db, [RankingKey('tenis')], now=NOW)
    rows = {row.user_id: row.recent_form for row in db.scalars(select(Standing))}
    # Oldest first, the last five: ana W W L W (matches 2 to 6: L W W L W) -> 'DVVDV'; bia is the mirror.
    assert rows == {ana.id: 'DVVDV', bia.id: 'VDDVD'}
    assert 'E' not in ''.join(rows.values())


def test_the_form_drops_a_match_that_leaves_the_window(db):
    team_a, team_b, _ = two_teams(db)
    for starts_at, goals_a in ((NOW - 51 * WEEK, 0), (NOW - 50 * WEEK, 1), (NOW - 2 * WEEK, 1), (NOW - WEEK, 1)):
        played(db, team_a, team_b, goals_a, 0 if goals_a else 1, starts_at=starts_at)
    recalculate_rankings(db, [SOCIETY], now=NOW)
    assert (team_form(db, team_a), team_form(db, team_b)) == ('DVVV', 'VDDD')
    later = NOW + 2 * WEEK                                      # the oldest match is now 53 weeks old
    assert recalculate_outside_window(db, later) == 2
    assert (team_form(db, team_a), team_form(db, team_b)) == ('VVV', 'DDD')


# ----- Running: the best mark day -----------------------------------------------------------------------------------

def test_the_best_mark_day_follows_the_registered_and_removed_marks(client, monkeypatch):
    http, db = client
    use_run_clock(monkeypatch)
    athlete, headers = runner(db, 'ana')

    def row():
        return db.scalar(select(Standing).where(Standing.user_id == athlete.id, Standing.distance_km == 5))

    first = logged(http, headers, 5000, '30:00', date='2026-10-01')
    assert (row().best_mark_on, row().recent_form) == (date(2026, 10, 1), '')
    better = logged(http, headers, 5000, '26:00', date='2026-10-05')
    assert row().best_mark_on == date(2026, 10, 5)
    equal = logged(http, headers, 5000, '26:00', date='2026-10-09')         # the first day with the best time stays
    assert row().best_mark_on == date(2026, 10, 5)
    assert http.delete(f'/api/v1/me/runs/{better["run"]["id"]}', headers=headers).status_code == 204
    assert row().best_mark_on == date(2026, 10, 9)                         # the equal time is the best now
    assert http.delete(f'/api/v1/me/runs/{equal["run"]["id"]}', headers=headers).status_code == 204
    assert row().best_mark_on == date(2026, 10, 1)
    assert http.delete(f'/api/v1/me/runs/{first["run"]["id"]}', headers=headers).status_code == 204
    assert row() is None
    assert log_run(http, headers, 5000, '25:00', date='2026-10-03').status_code == 201
    assert row().best_mark_on == date(2026, 10, 3)


def test_the_columns_are_guarded_by_the_database(db):
    team_a, team_b, _ = two_teams(db)
    played(db, team_a, team_b, 1, 0)
    recalculate_rankings(db, [SOCIETY], now=NOW)
    row = db.scalar(select(Standing).where(Standing.team_id == team_a.id))
    for field, value in (('recent_form', 'VVVVVV'), ('recent_form', 'VXD'), ('recent_form', 'vd'), ('best_mark_on', date(2026, 10, 1))):
        with pytest.raises((IntegrityError, DataError)), db.begin_nested():
            setattr(row, field, value)
            db.flush()
        db.refresh(row)
    row.recent_form = ''
    db.flush()                                          # an empty form is valid


# ----- The command --------------------------------------------------------------------------------------------------

class Borrowed:
    """The test session as `SessionLocal()`: the command commits, the test transaction rolls back at the end."""
    def __init__(self, session):
        self.session = session

    def __enter__(self):
        return self.session

    def __exit__(self, *exc):
        return False


def test_the_command_covers_every_category_once():
    keys = admin_cli.all_ranking_keys()
    assert len(keys) == len(set(keys)) == 3 + 12 + 1 + 5
    assert {key.ranking for key in keys} == {'futebol_time', 'futebol_individual', 'tenis', 'corrida_3', 'corrida_5',
                                             'corrida_10', 'corrida_21', 'corrida_42'}


def test_recalculate_rankings_fills_old_rows_and_a_second_run_changes_nothing(db, monkeypatch, capsys):
    team_a, team_b, _ = two_teams(db)
    for number in range(3):
        played(db, team_a, team_b, 2, 0, starts_at=NOW - (number + 1) * DAY)
    ana, bia = make_user(db, 'ana'), make_user(db, 'bia')
    for number in range(3):
        played_tennis(db, ana, bia, SETS_WIN, starts_at=NOW - (number + 1) * DAY)
    recalculate_rankings(db, [SOCIETY, RankingKey('tenis')], now=NOW)
    # Rows from before the migration: empty form, as the column default left them.
    db.execute(text("UPDATE standings SET recent_form = ''"))
    db.expire_all()
    stamps = {row.id: row.updated_at for row in db.scalars(select(Standing))}
    monkeypatch.setattr(admin_cli, 'SessionLocal', lambda: Borrowed(db))
    monkeypatch.setattr(admin_cli, 'utcnow', lambda: NOW + HOUR)

    admin_cli.main(['recalculate-rankings'])
    assert 'Rankings recalculados' in capsys.readouterr().out
    db.expire_all()
    rows = {row.id: row for row in db.scalars(select(Standing))}
    assert sorted(row.recent_form for row in rows.values()) == ['DDD', 'DDD', 'VVV', 'VVV']
    assert all(rows[row_id].updated_at == NOW + HOUR for row_id in stamps)

    assert admin_cli.recalculate_all_rankings() == 0                        # idempotent: nothing is written again
    db.expire_all()
    assert {row.id: row.updated_at for row in db.scalars(select(Standing))} == {row_id: NOW + HOUR for row_id in stamps}

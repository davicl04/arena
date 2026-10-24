"""Recalculation of the materialized rankings over a simulated session (no database).

The records come from rows the test provides in the shape the queries return; what is checked is the real
service code: who is classified, the tiers and positions written to `standings`, the rows that appear, change or
leave, the open searches that receive a new tier and the window task. The SQL (window, states) is checked on
PostgreSQL (`tests/integration/test_standings_recalc.py`).
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from itertools import count
from types import SimpleNamespace

import pytest

from app.models.matches import Match, MatchSearch
from app.models.rankings import Standing
from app.services import standings
from app.services.rankings import Cuts
from app.services.standings import RankingKey
from tests.unit.fakes import FakeDb

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
WEEK = timedelta(weeks=1)


def make_cuts():
    def cuts(ranking, metric, prata, ouro, diamante):
        return Cuts(ranking, metric, 'maior', Decimal(prata), Decimal(ouro), Decimal(diamante), 3, Decimal('0.15'), 52)

    def run_cuts(distance_km, prata, ouro, diamante):
        # Seeded in 0005: times in seconds, lower is better, the first mark classifies.
        name = f'corrida_{distance_km}'
        return Cuts(name, 'tempo', 'menor', Decimal(prata), Decimal(ouro), Decimal(diamante), 1, Decimal('0.15'), 52)

    return {'futebol_time': cuts('futebol_time', 'pontos', 10, 30, 60),
            'futebol_individual': cuts('futebol_individual', 'media', '2.5', '4.0', '5.5'),
            'tenis': cuts('tenis', 'pontos', 30, 80, 150),
            'corrida_5': run_cuts(5, 35 * 60, 27 * 60, 22 * 60),
            'corrida_10': run_cuts(10, 75 * 60, 57 * 60, 47 * 60)}


@pytest.fixture
def scene(monkeypatch):
    db = FakeDb()
    state = SimpleNamespace(db=db, locked=[], tried=[])
    monkeypatch.setattr(standings, 'load_cuts', lambda _db, version: make_cuts())
    monkeypatch.setattr(standings.queue, 'lock_bucket', lambda _db, key: state.locked.append(key))
    monkeypatch.setattr(standings.queue, 'try_match', lambda _db, search, *, now: state.tried.append(search.id))
    # No championship bonus unless a test registers placements (`_tennis_records` always reads them).
    db.on('standings', []).on('match_searches', []).on('event_placements', [])
    return state


_ids = count(1)


def game(subject, side, score_a, score_b, number=None):
    """A row of the team and tennis queries: (subject, side, score a, score b, match start, match id); the matches
    are one day apart in the order they are written."""
    number = next(_ids) if number is None else number
    return (subject, side, score_a, score_b, NOW - timedelta(days=100 - number), number)


def rows_by_subject(db, attribute):
    return {getattr(row, attribute): row for row in db.added if isinstance(row, Standing)}


# ----- Which rankings a match touches --------------------------------------------------------------------------

def test_a_football_match_touches_the_team_ranking_and_every_position_played(scene):
    scene.db.on('match_lineups', ['defesa', 'atacante'])
    match = Match(id=1, sport='futebol', format='society')
    keys = standings.ranking_keys_for_match(scene.db, match, positions=['goleiro'])
    assert keys == [RankingKey('futebol_time', 'society'), RankingKey('futebol_individual', 'society', 'goleiro'),
                    RankingKey('futebol_individual', 'society', 'defesa'),
                    RankingKey('futebol_individual', 'society', 'atacante')]


def test_a_tennis_match_touches_only_the_tennis_ranking(scene):
    assert standings.ranking_keys_for_match(scene.db, Match(id=2, sport='tenis'), positions=['goleiro']) == [
        RankingKey('tenis')]


def test_recalculating_a_match_recalculates_each_category_it_touches(scene):
    scene.db.on('match_sides', [game(51, 'a', 2, 0) for _ in range(3)])
    standings.recalculate_for_match(scene.db, Match(id=1, sport='tenis'), now=NOW)
    assert [row.user_id for row in scene.db.added if isinstance(row, Standing)] == [51]     # the tennis ranking
    scene.db.then('match_lineups', ['atacante'], [], [])           # the positions played, then two empty rankings
    scene.db.on('match_sides', [game(1, 'a', 1, 0) for _ in range(3)])
    standings.recalculate_for_match(scene.db, Match(id=2, sport='futebol', format='campo'), now=NOW,
                                    positions=['defesa'])
    assert 'match_lineups' in scene.db.statements and scene.db.statements.count('match_sides') == 2


# ----- Teams --------------------------------------------------------------------------------------------------

TEAM_GAMES = [game(1, 'a', 2, 0, 1), game(1, 'b', 0, 1, 2), game(1, 'a', 3, 1, 3),    # team 1: three wins
              game(2, 'b', 2, 0, 4), game(2, 'a', 0, 1, 5), game(2, 'b', 1, 0, 6),    # team 2: three losses
              game(3, 'a', 1, 1, 7)]                                                  # team 3: a draw, in placement


def test_the_classified_teams_get_position_and_tier_and_the_others_stay_in_placement(scene):
    db = scene.db
    db.on('match_sides', TEAM_GAMES)
    changed = standings.recalculate_rankings(db, [RankingKey('futebol_time', 'society')], now=NOW)
    assert changed == 3
    rows = rows_by_subject(db, 'team_id')
    first, second, placement = rows[1], rows[2], rows[3]
    assert (first.rank_position, first.tier, first.matches_played, first.wins, float(first.metric_value)) == (
        1, 'bronze', 3, 3, 9.0)
    assert (first.goals_for, first.goals_against, first.sport, first.format) == (6, 1, 'futebol', 'society')
    assert (second.rank_position, second.tier, second.losses, float(second.metric_value)) == (2, 'bronze', 3, 0.0)
    assert (placement.rank_position, placement.tier, placement.draws, placement.matches_played) == (None, None, 1, 1)
    assert first.updated_at == NOW and first.calc_version == 1
    # The recent form (oldest first) is written for everyone, the ones in placement included.
    assert (first.recent_form, second.recent_form, placement.recent_form) == ('VVV', 'DDD', 'E')
    assert first.best_mark_on is None


def test_rows_are_rewritten_only_when_a_value_changes_and_leave_with_their_matches(scene):
    db = scene.db
    stale = Standing(id=5, team_id=1, sport='futebol', format='society', metric_value=Decimal(0), matches_played=0,
                     wins=0, draws=0, losses=0, goals_for=0, goals_against=0, rank_position=None, tier=None,
                     calc_version=1)
    left = Standing(id=6, team_id=9, sport='futebol', format='society', metric_value=Decimal(12), matches_played=4,
                    wins=4, draws=0, losses=0, goals_for=8, goals_against=1, rank_position=1, tier='prata',
                    calc_version=1)
    db.on('standings', [stale, left]).on('match_sides', TEAM_GAMES)
    changed = standings.recalculate_rankings(db, [RankingKey('futebol_time', 'society')], now=NOW)
    # Team 1 updated in place, teams 2 and 3 created, team 9 (no match left in the window) removed.
    assert changed == 4 and db.deleted == [left]
    assert (stale.matches_played, stale.tier, stale.rank_position, stale.updated_at) == (3, 'bronze', 1, NOW)
    db.on('standings', [stale]).deleted.clear()
    again = standings.recalculate_rankings(db, [RankingKey('futebol_time', 'society')], now=NOW + WEEK)
    assert again == 2 and stale.updated_at == NOW                        # unchanged row is not touched
    standings.recalculate_rankings(db, [RankingKey('futebol_time', 'society')], now=NOW + WEEK, touch=True)
    assert stale.updated_at == NOW + WEEK                                # ...unless the window task stamps it


def test_a_ranking_without_cuts_in_the_version_is_refused(scene, monkeypatch):
    monkeypatch.setattr(standings, 'load_cuts', lambda _db, version: {})
    with pytest.raises(RuntimeError):
        standings.recalculate_rankings(scene.db, [RankingKey('tenis')], now=NOW)
    assert standings.recalculate_rankings(scene.db, [], now=NOW) == 0


# ----- Athletes -----------------------------------------------------------------------------------------------

def appearance(user_id, side='a', winner='a', stat=None, goals=None, reviewed=None, absent=None):
    number = next(_ids)
    return (user_id, side, winner, absent, NOW - timedelta(days=100 - number), number, stat, goals, None, None, None,
            reviewed)


def test_the_individual_ranking_averages_presence_result_and_the_reviewed_stats(scene):
    db = scene.db
    db.on('match_lineups', [
        appearance(41), appearance(41, stat='revisada', goals=2, reviewed=NOW), appearance(41),
        appearance(42, winner=None), appearance(42, winner=None), appearance(42, winner=None),
        appearance(43),
        appearance(44, side='b', winner='a', absent='b')])               # absent side of a walkover: not counted
    standings.recalculate_rankings(db, [RankingKey('futebol_individual', 'society', 'atacante')], now=NOW)
    rows = rows_by_subject(db, 'user_id')
    assert set(rows) == {41, 42, 43}
    # 41: (presence 1 + win 3) × 2 and one match with 2 reviewed goals: (4 + 6 + 4) / 3.
    assert (rows[41].rank_position, rows[41].tier, round(float(rows[41].metric_value), 2)) == (1, 'ouro', 4.67)
    assert (rows[42].rank_position, rows[42].tier, float(rows[42].metric_value)) == (2, 'bronze', 2.0)
    assert (rows[43].rank_position, rows[43].tier) == (None, None)
    assert rows[41].goals_for == rows[41].goals_against == 0              # an average: no goals to keep
    assert (rows[41].recent_form, rows[42].recent_form, rows[43].recent_form) == ('VVV', 'EEE', 'V')
    assert (rows[41].sport, rows[41].format, rows[41].position, rows[41].team_id) == (
        'futebol', 'society', 'atacante', None)


def test_the_tennis_ranking_gives_ten_points_per_win(scene):
    db = scene.db
    wins = [game(51, 'a', 2, 0), game(51, 'b', 0, 2), game(51, 'a', 2, 1), game(52, 'b', 2, 0), game(52, 'a', 0, 2),
            game(52, 'b', 1, 2)]
    db.on('match_sides', wins)
    standings.recalculate_rankings(db, [RankingKey('tenis')], now=NOW)
    rows = rows_by_subject(db, 'user_id')
    assert (float(rows[51].metric_value), rows[51].wins, rows[51].rank_position, rows[51].tier) == (30.0, 3, 1, 'prata')
    assert (float(rows[52].metric_value), rows[52].losses, rows[52].rank_position) == (10.0, 2, 2)
    assert (rows[51].sport, rows[51].format, rows[51].position) == ('tenis', None, None)
    assert (rows[51].recent_form, rows[52].recent_form) == ('VVV', 'DDV')            # tennis has no draw


def test_the_championship_bonus_adds_to_the_tennis_points_of_whoever_played(scene):
    # Contract 0003, 21: `event_placements.bonus_points` of events that ended inside the window are summed per
    # athlete (the grouped query returns the sum); 10 per win plus the bonus. An athlete with a bonus but no
    # confirmed match in the window has no row: the bonus accompanies the matches, it does not classify anyone.
    db = scene.db
    db.on('match_sides', [game(51, 'a', 2, 0), game(51, 'b', 0, 2), game(51, 'a', 2, 1), game(52, 'b', 2, 0)])
    db.on('event_placements', [(51, 60), (99, 40)])
    standings.recalculate_rankings(db, [RankingKey('tenis')], now=NOW)
    rows = rows_by_subject(db, 'user_id')
    assert set(rows) == {51, 52}
    assert (float(rows[51].metric_value), rows[51].wins, rows[51].tier) == (90.0, 3, 'ouro')      # 30 + 60
    assert (float(rows[52].metric_value), rows[52].rank_position) == (0.0, None)                  # one match: placement


# ----- Running --------------------------------------------------------------------------------------------------

def test_a_running_ranking_orders_by_best_time_then_by_who_ran_it_first(scene):
    # `_run_records` returns (athlete, marks, best time in seconds, first day the best time was run); the first
    # mark classifies and lower is better: tiers come from the seeded cuts of the distance.
    db = scene.db
    db.on('runs', [(61, 3, 1500, date(2026, 9, 5)), (62, 1, 1500, date(2026, 9, 1)), (63, 2, 1290, date(2026, 9, 20)),
                   (64, 1, 2400, date(2026, 8, 1))])
    changed = standings.recalculate_rankings(db, [RankingKey.run(5)], now=NOW)
    rows = rows_by_subject(db, 'user_id')
    assert changed == 4 and set(rows) == {61, 62, 63, 64}
    assert [rows[user].rank_position for user in (63, 62, 61, 64)] == [1, 2, 3, 4]       # same time: the older day wins
    assert [rows[user].tier for user in (63, 62, 61, 64)] == ['diamante', 'ouro', 'ouro', 'bronze']
    assert (rows[63].sport, rows[63].distance_km, rows[63].matches_played, float(rows[63].metric_value)) == (
        'corrida', 5, 2, 1290.0)
    assert rows[63].goals_for == rows[63].goals_against == 0 and rows[63].format is None
    assert (rows[63].best_mark_on, rows[62].best_mark_on, rows[63].recent_form) == (date(2026, 9, 20),
                                                                                   date(2026, 9, 1), '')
    assert scene.tried == [] and scene.locked == []          # running has no search: nothing is paired again


def test_the_keys_of_the_running_rankings(scene):
    key = RankingKey.run(10)
    assert (key.ranking, key.sport, key.distance_km, key.label) == ('corrida_10', 'corrida', 10, 'corrida_10')
    assert RankingKey('tenis').distance_km is None and RankingKey('tenis').sport == 'tenis'
    with pytest.raises(ValueError):
        RankingKey.run(7)                                       # only the standard distances have a ranking
    with pytest.raises(ValueError):
        RankingKey('corrida_5', 'society')


# ----- Open searches follow the tiers ------------------------------------------------------------------------

def search(search_id, kind='time', team_id=1, user_id=None, tier=None, state='ativa'):
    return MatchSearch(id=search_id, kind=kind, sport='futebol' if kind != 'tenis' else 'tenis', city_id=1,
                       format='society' if kind == 'time' else None, team_id=team_id if kind == 'time' else None,
                       user_id=user_id, tier=tier, state=state)


def test_a_tier_change_updates_the_waiting_searches_and_pairs_them_again(scene):
    db = scene.db
    waiting, held = search(10), search(11, state='pareada')
    db.on('match_sides', TEAM_GAMES)
    db.then('match_searches', [(10, 'time', 1, 'society'), (11, 'time', 1, 'society')], [waiting], [held])
    standings.recalculate_rankings(db, [RankingKey('futebol_time', 'society')], now=NOW)
    assert scene.locked == ['futebol:time:1:society']                       # the bucket before its searches
    assert (waiting.tier, held.tier) == ('bronze', 'bronze')                 # the held one keeps its proposal
    assert scene.tried == [10]


def test_tennis_and_walk_in_searches_follow_their_subjects(scene):
    db = scene.db
    player, other_city = search(20, 'tenis', user_id=51), search(21, 'tenis', user_id=51, tier='ouro')
    walkin = search(22, 'avulso', user_id=41)
    changes = [standings.TierChange(RankingKey('tenis'), 51, None, 'bronze'),
               standings.TierChange(RankingKey('futebol_individual', 'society', 'atacante'), 41, None, 'ouro')]
    per_bucket = {'tenis:1': [[player, other_city], []], 'futebol:avulso:1': [[walkin], []]}
    order = sorted(per_bucket, key=standings.bucket_lock_id)
    db.then('match_searches', [(20, 'tenis', 1, None), (21, 'tenis', 1, None), (22, 'avulso', 1, None)],
            *(answer for key in order for answer in per_bucket[key]))
    standings._refresh_searches(db, changes, now=NOW)
    assert scene.locked == order                                              # buckets in ascending lock id
    assert (player.tier, other_city.tier, walkin.tier) == ('bronze', 'bronze', None)
    assert sorted(scene.tried) == [20, 21, 22]                                # the walk-in tries for a slot again
    # Nothing to refresh when no search is affected.
    standings._refresh_searches(db, [], now=NOW)


# ----- The 52-week window -------------------------------------------------------------------------------------

def test_the_window_task_recalculates_only_categories_with_matches_that_left(scene, monkeypatch):
    db = scene.db
    old = NOW - 53 * WEEK
    # The first read lists the football and tennis groups, the second the running distances with rows.
    db.then('standings', [('futebol', True, 'society', None, old), ('futebol', False, 'society', 'goleiro', old),
                          ('tenis', False, None, None, old)],
            [(5, old), (10, old)])
    db.then('matches', True, False, True)                    # which groups have a match that left the window
    db.then('runs', False, True)                             # ...and which distances have a mark that left it
    seen = []

    def spy(db_, keys, *, now, touch=False):
        seen.append((sorted(key.label for key in keys), touch))
        return 7

    monkeypatch.setattr(standings, 'recalculate_rankings', spy)
    assert standings.recalculate_outside_window(db, NOW) == 7
    assert seen == [(['corrida_10', 'futebol_time:society', 'tenis'], True)]
    assert 'event_placements' not in db.statements            # the tennis match already left: no need to look at bonuses


def test_a_tennis_bonus_that_leaves_the_window_recalculates_the_ranking_even_without_a_match(scene, monkeypatch):
    # The bonus of an event counts while the event ended inside the window, so it can leave after the last match of
    # the athlete did: the match check alone would keep the stale points (contract 0003, 21).
    db = scene.db
    old = NOW - 53 * WEEK
    db.then('standings', [('futebol', True, 'society', None, old), ('tenis', False, None, None, old)], [])
    db.then('matches', False, False)
    db.then('event_placements', True)                       # only tennis reads bonuses, and finds one
    seen = []
    monkeypatch.setattr(standings, 'recalculate_rankings',
                        lambda db_, keys, *, now, touch=False: seen.append(sorted(key.label for key in keys)) or 3)
    assert standings.recalculate_outside_window(db, NOW) == 3
    assert seen == [['tenis']] and db.statements.count('event_placements') == 1


def test_nothing_is_recalculated_when_neither_match_nor_bonus_nor_mark_left(scene, monkeypatch):
    db = scene.db
    old = NOW - 2 * WEEK
    db.then('standings', [('tenis', False, None, None, old)], [(5, old)])
    db.then('matches', False).then('event_placements', False).then('runs', False)
    seen = []
    monkeypatch.setattr(standings, 'recalculate_rankings',
                        lambda db_, keys, *, now, touch=False: seen.append(list(keys)) or 0)
    assert standings.recalculate_outside_window(db, NOW) == 0
    assert seen == [[]]

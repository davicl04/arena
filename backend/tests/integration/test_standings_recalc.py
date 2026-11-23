"""Ranking recalculation on PostgreSQL (Jogar, fase 5): the 52-week window, Lendário, walkovers, the sweep task and
the open searches that receive a new tier and pair again. Teams and tennis are ranked by the rating of
calc_version 2 (decision 0006): 1000 to start, K 64 in the first three matches and 32 afterwards, Prata 950, Ouro 1050
and Diamante 1150. Against the same opponent, 3 wins are 1079.839 (Ouro) and 3 losses 920.161 (Bronze).

Matches are built from the models with confirmed scores; `recalculate_*` run on the test transaction.
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models.brackets import EventPlacement
from app.models.events import EventEntry
from app.models.matches import FootballStat, Match, MatchSide, MatchSlot
from app.models.rankings import RankCut, Standing
from app.services import sweep
from app.services.match_lifecycle import apply_final_score
from app.services.match_rules import validate_football_score, walkover_score
from app.services.matchmaking_queue import queue
from app.services.rankings import CURRENT_CALC_VERSION, load_cuts
from app.services.scoring import RatedBonus, RatedMatch, replay_ratings
from app.services.standings import (
    RankingKey,
    ranking_keys_for_match,
    ranking_lock_id,
    recalculate_for_match,
    recalculate_outside_window,
    recalculate_rankings,
)
from app.services.sweep import run_sweep
from tests.integration.entry_helpers import tennis_event
from tests.integration.match_helpers import (
    NOW,
    add,
    count,
    make_standing,
    make_team,
    make_user,
    notifications_of,
    scheduled_match,
    team_search,
    tennis_search,
    walkin_search,
)
from tests.integration.result_helpers import DAY, HOUR, WEEK, lineup, played, played_tennis, tennis_match

SOCIETY = RankingKey('futebol_time', 'society')
# Ratings after n wins (losses) in a row against the same opponent, both starting at 1000.
WINS = {1: Decimal('1032.000'), 2: Decimal('1058.171'), 3: Decimal('1079.839'), 4: Decimal('1088.963')}
LOSSES = {1: Decimal('968.000'), 2: Decimal('941.829'), 3: Decimal('920.161'), 4: Decimal('911.037')}


@pytest.fixture
def db(test_engine):
    with test_engine.connect() as connection:
        transaction = connection.begin()
        with Session(bind=connection, join_transaction_mode='create_savepoint', expire_on_commit=False) as session:
            yield session
        transaction.rollback()


def team_and_rep(db, name):
    rep = make_user(db, name.lower().replace(' ', '-'))
    return make_team(db, rep, name=name), rep


def new_team(db, name):
    return team_and_rep(db, name)[0]


def rows(db, *where):
    return {(row.team_id or row.user_id): row for row in db.scalars(select(Standing).where(*where))}


def team_rows(db):
    return {row.team_id: row for row in db.scalars(select(Standing).where(Standing.team_id.is_not(None)))}


# ----- Lendário and positions -------------------------------------------------------------------------------

def test_lendario_is_diamante_plus_the_top_15_percent_rounded_down(db):
    cut = db.scalar(select(RankCut).where(RankCut.ranking == 'futebol_time',
                                          RankCut.calc_version == CURRENT_CALC_VERSION))
    cut.prata, cut.ouro, cut.diamante = 950, 1000, 1050         # three wins (1079.839) reach Diamante
    db.flush()
    pairs = []

    def add_pair(index, score):
        winner, loser = new_team(db, f'Campeao {index}'), new_team(db, f'Reserva {index}')
        for number in range(3):
            played(db, winner, loser, *score, starts_at=NOW - (number + 1) * DAY)
        pairs.append((winner, loser))

    for index, score in enumerate(((3, 0), (2, 0), (1, 0)), start=1):
        add_pair(index, score)
    assert recalculate_rankings(db, [SOCIETY], now=NOW) == 6
    ranking = team_rows(db)
    # Six classified: floor(6 × 0.15) = 0 places, so the best Diamante is not Lendário.
    assert [(ranking[team.id].rank_position, ranking[team.id].tier) for team, _ in pairs] == [
        (1, 'diamante'), (2, 'diamante'), (3, 'diamante')]
    assert {ranking[loser.id].tier for _, loser in pairs} == {'bronze'}

    add_pair(4, (1, 0))
    # Eight classified: one place. The new pair, the shifted positions and the new Lendário are rewritten.
    assert recalculate_rankings(db, [SOCIETY], now=NOW) == 6
    ranking = team_rows(db)
    winners = [ranking[team.id] for team, _ in pairs]
    # Same rating: the goal difference, then goals scored and the id decide the order (RN14).
    assert [(row.rank_position, row.tier, row.metric_value) for row in winners] == [
        (1, 'lendario', WINS[3]), (2, 'diamante', WINS[3]), (3, 'diamante', WINS[3]), (4, 'diamante', WINS[3])]
    assert sorted(row.rank_position for row in ranking.values()) == list(range(1, 9))
    assert all(row.calc_version == 2 and row.matches_played == 3 for row in ranking.values())
    # Nothing changed since: a second recalculation writes nothing.
    assert recalculate_rankings(db, [SOCIETY], now=NOW) == 0
    assert recalculate_rankings(db, [], now=NOW) == 0


def test_a_ranking_without_cuts_is_refused_and_keys_are_validated(db):
    db.execute(delete(RankCut).where(RankCut.ranking == 'tenis', RankCut.calc_version == CURRENT_CALC_VERSION))
    with pytest.raises(RuntimeError, match='Cortes do ranking tenis ausentes'):
        recalculate_rankings(db, [RankingKey('tenis')], now=NOW)
    for args in (('futebol_time',), ('futebol_time', 'basquete'), ('futebol_time', 'society', 'goleiro'),
                 ('futebol_individual', 'society'), ('futebol_individual', 'society', 'lateral'), ('tenis', 'society'),
                 ('corrida_7',), ('corrida_5', 'society'), ('corrida_5', None, 'goleiro'), ('corrida',)):
        with pytest.raises(ValueError):
            RankingKey(*args)
    assert (RankingKey.run(5).label, RankingKey.run(5).sport, RankingKey.run(5).distance_km) == (
        'corrida_5', 'corrida', 5)
    assert RankingKey('tenis').distance_km is None and RankingKey('corrida_42') == RankingKey.run(42)
    assert ranking_lock_id(RankingKey.run(5)) != ranking_lock_id(RankingKey.run(10))
    assert RankingKey('futebol_individual', 'campo', 'goleiro').label == 'futebol_individual:campo:goleiro'
    assert ranking_lock_id(SOCIETY) == ranking_lock_id(RankingKey('futebol_time', 'society'))
    assert ranking_lock_id(SOCIETY) != ranking_lock_id(RankingKey('futebol_time', 'futsal'))
    assert -2 ** 63 <= ranking_lock_id(SOCIETY) < 2 ** 63


def test_the_keys_of_a_match_follow_its_sport_format_and_lineups(db):
    team_a, team_b = new_team(db, 'Time A'), new_team(db, 'Time B')
    match = played(db, team_a, team_b, 1, 0, format_='campo')
    assert ranking_keys_for_match(db, match) == [RankingKey('futebol_time', 'campo')]
    for user, position in ((make_user(db, 'goleiro'), 'goleiro'), (make_user(db, 'atacante'), 'atacante'),
                           (make_user(db, 'sem-posicao'), None)):
        lineup(db, match, user, 'a', position)
    assert ranking_keys_for_match(db, match, positions=['defesa', 'goleiro']) == [
        RankingKey('futebol_time', 'campo'), RankingKey('futebol_individual', 'campo', 'goleiro'),
        RankingKey('futebol_individual', 'campo', 'defesa'), RankingKey('futebol_individual', 'campo', 'atacante')]
    assert ranking_keys_for_match(db, tennis_match(db, make_user(db, 'ana'), make_user(db, 'bia'))) == [
        RankingKey('tenis')]


def test_tennis_ranking_rates_the_players_and_ranks_the_classified(db):
    players = [make_user(db, name) for name in ('ana', 'bia')]
    for number in range(3):
        match = played_tennis(db, players[0], players[1], [{'a': 6, 'b': 1}, {'a': 6, 'b': 2}],
                              starts_at=NOW - (number + 1) * DAY)
        recalculate_for_match(db, match, now=NOW)
        if number < 2:
            assert {row.tier for row in rows(db).values()} == {None}
    ranking = rows(db)
    winner, loser = ranking[players[0].id], ranking[players[1].id]
    assert (winner.matches_played, winner.wins, winner.metric_value, winner.goals_for, winner.goals_against,
            winner.rank_position, winner.tier, winner.calc_version) == (3, 3, WINS[3], 6, 0, 1, 'ouro', 2)
    assert (loser.matches_played, loser.losses, loser.metric_value, loser.rank_position, loser.tier) == (
        3, 3, LOSSES[3], 2, 'bronze')


# ----- Window (52 weeks) and the sweep task -----------------------------------------------------------------

def test_matches_leaving_the_window_stop_counting_and_the_sweep_task_is_idempotent(db):
    team_a, team_b = new_team(db, 'Ferrugem'), new_team(db, 'Leoes')
    for starts_at in (NOW - 51 * WEEK, NOW - 50 * WEEK, NOW - 2 * WEEK, NOW - WEEK):
        played(db, team_a, team_b, 1, 0, starts_at=starts_at)
    assert recalculate_outside_window(db, NOW) == 0
    recalculate_rankings(db, [SOCIETY], now=NOW)
    first = team_rows(db)[team_a.id]
    assert (first.matches_played, first.metric_value, first.tier, first.rank_position) == (4, WINS[4], 'ouro', 1)

    # Two weeks later the oldest match is 53 weeks old; the one at exactly 52 weeks still counts. The rating is the
    # replay of the three matches left, from 1000 and with the placement K again: the departure changes it.
    later = NOW + 2 * WEEK
    assert recalculate_outside_window(db, later) == 2
    ranking = team_rows(db)
    assert (ranking[team_a.id].matches_played, ranking[team_a.id].metric_value, ranking[team_a.id].tier) == (
        3, WINS[3], 'ouro')
    assert ranking[team_b.id].metric_value == LOSSES[3]
    assert (ranking[team_b.id].matches_played, ranking[team_b.id].losses) == (3, 3)
    assert ranking[team_a.id].updated_at == later
    assert recalculate_outside_window(db, later) == 0
    assert run_sweep(db, later, [sweep.TASKS[-1]]) == {'rankings_janela': 0}

    # One second after that match leaves, the team is back in placement: no position and no tier.
    assert sweep.rankings_outside_window(db, later + timedelta(seconds=1)) == 2
    ranking = team_rows(db)
    assert (ranking[team_a.id].matches_played, ranking[team_a.id].tier, ranking[team_a.id].rank_position) == (
        2, None, None)
    assert sweep.rankings_outside_window(db, later + timedelta(seconds=1)) == 0

    # When every match is gone the rows go too: "sem jogos" again, never a stale tier.
    assert sweep.rankings_outside_window(db, NOW + 54 * WEEK) == 2
    assert not team_rows(db)
    assert sweep.rankings_outside_window(db, NOW + 54 * WEEK) == 0


def test_correcting_an_old_match_gives_the_rating_of_a_replay_from_scratch(db):
    # A corrected score of the oldest match (a decision, a correction) recalculates the ranking as if the correct result had
    # always existed: the later matches are replayed from the corrected ratings, with no incremental state.
    team_a, team_b, team_c = new_team(db, 'Ferrugem'), new_team(db, 'Leoes'), new_team(db, 'Tigres')
    oldest = played(db, team_a, team_b, 1, 0, starts_at=NOW - 10 * DAY)
    played(db, team_b, team_c, 2, 0, starts_at=NOW - 8 * DAY)
    played(db, team_a, team_c, 1, 1, starts_at=NOW - 6 * DAY)
    played(db, team_c, team_a, 0, 3, starts_at=NOW - 4 * DAY)
    played(db, team_b, team_c, 0, 1, starts_at=NOW - 2 * DAY)
    recalculate_for_match(db, oldest, now=NOW)
    before = {team: row.metric_value for team, row in team_rows(db).items()}

    apply_final_score(oldest, validate_football_score(0, 2), source='confirmacao', now=NOW - HOUR)
    db.flush()
    recalculate_for_match(db, oldest, now=NOW)
    corrected = {team: (row.metric_value, row.wins, row.losses, row.calc_version) for team, row in team_rows(db).items()}
    assert {team: value[0] for team, value in corrected.items()} != before

    # The same matches recalculated from empty standings give the same rows.
    db.execute(delete(Standing).where(Standing.team_id.is_not(None)))
    db.flush()
    recalculate_rankings(db, [SOCIETY], now=NOW)
    assert {team: (row.metric_value, row.wins, row.losses, row.calc_version)
            for team, row in team_rows(db).items()} == corrected
    # And the pure replay of the corrected matches, in chronological order, gives the same ratings.
    games = [(team_a.id, team_b.id, 0, 2), (team_b.id, team_c.id, 2, 0), (team_a.id, team_c.id, 1, 1),
             (team_c.id, team_a.id, 0, 3), (team_b.id, team_c.id, 0, 1)]
    cuts = load_cuts(db)['futebol_time']
    expected = replay_ratings([RatedMatch(NOW - (10 - 2 * index) * DAY, index, a, b, goals_a, goals_b)
                               for index, (a, b, goals_a, goals_b) in enumerate(games)], cuts)
    assert {team: value[0] for team, value in corrected.items()} == expected
    assert corrected[team_b.id][1:] == (2, 1, 2)


def test_the_window_task_leaves_other_rankings_alone(db):
    team_a, team_b = new_team(db, 'Ferrugem'), new_team(db, 'Leoes')
    played(db, team_a, team_b, 1, 0, starts_at=NOW - DAY)
    played(db, team_a, team_b, 1, 0, starts_at=NOW - DAY, format_='campo')
    recalculate_rankings(db, [SOCIETY, RankingKey('futebol_time', 'campo')], now=NOW)
    old = played(db, team_a, team_b, 2, 0, starts_at=NOW - 60 * WEEK, format_='campo')
    assert old.state == 'realizada'
    # The society ranking has no match leaving the window; the campo one already ignored the old match.
    assert recalculate_outside_window(db, NOW + 3 * DAY) == 0
    assert count(db, Standing, Standing.format == 'society') == count(db, Standing, Standing.format == 'campo') == 2


def test_a_ranked_team_that_loses_every_match_loses_the_tier_of_its_open_search(db):
    (team_a, rep_a), team_b = team_and_rep(db, 'Ferrugem'), new_team(db, 'Leoes')
    team_c, team_d = new_team(db, 'Time C'), new_team(db, 'Time D')
    for number in range(3):
        played(db, team_a, team_b, 1, 0, starts_at=NOW - 51 * WEEK + number * DAY)
    played(db, team_c, team_d, 1, 0, starts_at=NOW - DAY)
    recalculate_rankings(db, [SOCIETY], now=NOW)
    later = NOW + 2 * WEEK
    search = add(db, team_search(team_a, rep_a, tier='ouro', started_at=later - HOUR))
    assert team_rows(db)[team_a.id].tier == 'ouro'

    # All three matches leave at once: both rows go, the other teams are only stamped, the search loses its tier.
    assert recalculate_outside_window(db, later) == 2
    ranking = team_rows(db)
    assert set(ranking) == {team_c.id, team_d.id} and ranking[team_c.id].updated_at == later
    assert ranking[team_c.id].matches_played == 1
    db.refresh(search)
    assert (search.state, search.tier) == ('ativa', None)


def test_tennis_rows_leave_with_their_matches_and_a_tennis_search_follows_the_tier(db):
    ana, bia, carla = (make_user(db, name) for name in ('ana', 'bia', 'carla'))
    make_standing(db, tier='diamante', sport='tenis', user=ana, rank=1)
    search_ana = add(db, tennis_search(ana, tier='diamante', started_at=NOW - HOUR))
    search_carla = add(db, tennis_search(carla, tier='prata', started_at=NOW - 2 * HOUR))
    assert queue.try_match(db, search_carla, now=NOW) is None
    for number in range(3):
        match = played_tennis(db, ana, bia, [{'a': 6, 'b': 1}, {'a': 6, 'b': 2}],
                              starts_at=NOW - 51 * WEEK + number * DAY)
    recalculate_for_match(db, match, now=NOW)
    # Three wins rate Ana 1079.839: Ouro faces Prata, so the two searches pair now.
    db.refresh(search_ana)
    db.refresh(search_carla)
    assert (search_ana.tier, search_ana.state, search_carla.state) == ('ouro', 'pareada', 'pareada')
    assert rows(db)[ana.id].tier == 'ouro'

    assert recalculate_outside_window(db, NOW + 2 * WEEK) == 2
    assert not rows(db)


def test_a_championship_bonus_enters_the_tennis_rating_and_leaves_with_its_event(db):
    # The bonus counts while its event ended inside the 52 weeks (contract 0003, 21), weighted by the ratings of the
    # other confirmed entrants when it was awarded (decision 0006, section 7). Its event matches leave first; the
    # bonus leaves after them, with no match leaving then, so the sweep looks at the bonuses too.
    ana, bia, carla, duda = (make_user(db, name) for name in ('ana', 'bia', 'carla', 'duda'))
    event = tennis_event(db, bia.id, state='encerrado', competition_type='eliminacao_simples')
    entries = {player.id: add(db, EventEntry(event_id=event.id, user_id=player.id, registered_by_id=player.id,
                                             state='confirmada', price_cents=0, confirmed_at=NOW - 53 * WEEK))
               for player in (ana, bia, carla, duda)}
    final_at, awarded = NOW - 51 * WEEK - 2 * DAY, NOW - 51 * WEEK
    final = played_tennis(db, ana, carla, [{'a': 6, 'b': 1}, {'a': 6, 'b': 2}], starts_at=final_at)
    final.origin, final.event_id = 'campeonato', event.id
    add(db, EventPlacement(event_id=event.id, entry_id=entries[ana.id].id, user_id=ana.id, placement=1,
                           bonus_points=40, awarded_at=awarded))
    for number in range(3):
        match = played_tennis(db, ana, bia, [{'a': 6, 'b': 1}, {'a': 6, 'b': 2}],
                              starts_at=NOW - 30 * WEEK + number * DAY)
    recalculate_for_match(db, match, now=NOW)

    cuts = load_cuts(db)['tenis']
    later = [RatedMatch(NOW - 30 * WEEK + number * DAY, number, ana.id, bia.id, 2, 0) for number in range(3)]
    bonus = RatedBonus(awarded, event.id, ana.id, 40, frozenset(entries))
    # Ana beat Carla (1032) and then faced a weaker bracket (Carla 968, Bia and Duda 1000): less than 40.
    with_final = replay_ratings([RatedMatch(final_at, -1, ana.id, carla.id, 2, 0), *later], cuts, draws=False,
                                bonuses=[bonus])
    assert rows(db)[ana.id].metric_value == with_final[ana.id] and rows(db)[ana.id].matches_played == 4
    assert with_final[ana.id] > replay_ratings([RatedMatch(final_at, -1, ana.id, carla.id, 2, 0), *later], cuts,
                                               draws=False)[ana.id]
    assert recalculate_outside_window(db, NOW) == 0

    # The final leaves the window, the bonus stays: now it is weighted against a bracket all at the initial rating.
    first = NOW + WEEK - DAY
    assert recalculate_outside_window(db, first) == 3                   # Ana and Bia rewritten, Carla's row gone
    without_final = replay_ratings(later, cuts, draws=False, bonuses=[bonus])
    assert replay_ratings([], cuts, bonuses=[bonus]) == {ana.id: Decimal('1040.000')}   # same level: the base
    assert rows(db)[ana.id].metric_value == without_final[ana.id] and rows(db)[ana.id].matches_played == 3
    assert carla.id not in rows(db)

    # Two days later the event is older than 52 weeks; no match leaves then, but the bonus does.
    second = NOW + WEEK + DAY
    # Both rows change: Bia lost to an Ana who no longer carries the bonus.
    assert recalculate_outside_window(db, second) == 2
    assert (rows(db)[ana.id].metric_value, rows(db)[ana.id].wins, rows(db)[ana.id].tier) == (WINS[3], 3, 'ouro')
    assert rows(db)[bia.id].metric_value == LOSSES[3]
    assert rows(db)[ana.id].updated_at == second
    assert recalculate_outside_window(db, second) == 0                                       # idempotent


# ----- Walkovers --------------------------------------------------------------------------------------------

def test_a_walkover_counts_presence_and_win_of_the_side_that_showed_up(db):
    team_a, team_b = new_team(db, 'Ferrugem'), new_team(db, 'Leoes')
    match = scheduled_match(db, team_a, team_b, starts_at=NOW - 3 * DAY, open_slots=False)
    present, absent = make_user(db, 'presente'), make_user(db, 'ausente')
    lineup(db, match, present, 'b', 'defesa')
    away = lineup(db, match, absent, 'a', 'defesa')
    add(db, FootballStat(lineup_id=away.id, match_id=match.id, user_id=absent.id, goals=3, state='revisada',
                         reviewed_at=NOW, submitted_at=NOW))
    match.walkover_absent_side, match.walkover_registered_at = 'a', NOW - 3 * DAY + HOUR
    apply_final_score(match, walkover_score('futebol', 'a'), source='wo', now=NOW - DAY)
    match.state, match.closed_at = 'encerrada', NOW - DAY
    db.flush()
    recalculate_for_match(db, match, now=NOW)

    ranking = rows(db, Standing.sport == 'futebol')
    # The walkover counts as a normal win and loss in the rating.
    assert (ranking[team_b.id].wins, ranking[team_b.id].goals_for, ranking[team_b.id].metric_value) == (1, 3, WINS[1])
    assert (ranking[team_a.id].losses, ranking[team_a.id].goals_against, ranking[team_a.id].metric_value) == (
        1, 3, LOSSES[1])
    athlete = db.scalar(select(Standing).where(Standing.user_id == present.id))
    # Presence 1 + win 3 (adjusted mean (4 + 15) / 6); the absent side's athlete (even with a stat) has no row.
    assert (athlete.position, athlete.metric_value, athlete.wins, athlete.matches_played) == (
        'defesa', Decimal('3.167'), 1, 1)
    assert count(db, Standing, Standing.user_id == absent.id) == 0


def test_individual_average_counts_only_present_and_removed_athletes_do_not(db):
    team_a, team_b = new_team(db, 'Ferrugem'), new_team(db, 'Leoes')
    match = played(db, team_a, team_b, 1, 1)
    star, benched, guest = (make_user(db, name) for name in ('craque', 'banco', 'avulso'))
    lineup(db, match, star, 'a', 'atacante')
    lineup(db, match, benched, 'a', 'atacante', present=False)
    removed = lineup(db, match, guest, 'b', 'atacante', guest=True)
    removed.removed_at = NOW
    recalculate_for_match(db, match, now=NOW)
    ranking = {row.user_id: row for row in db.scalars(select(Standing).where(Standing.user_id.is_not(None)))}
    # A draw: presence 1 + 1 point (adjusted mean (2 + 15) / 6).
    assert set(ranking) == {star.id} and ranking[star.id].metric_value == Decimal('2.833')
    assert (ranking[star.id].draws, ranking[star.id].goals_for, ranking[star.id].goals_against) == (1, 0, 0)


def scored_appearance(db, match, user, side, *, goals=0):
    """A present attacker; `goals` > 0 adds reviewed stats (they score, RN10)."""
    item = lineup(db, match, user, side, 'atacante')
    if goals:
        add(db, FootballStat(lineup_id=item.id, match_id=match.id, user_id=user.id, goals=goals, state='revisada',
                             reviewed_at=NOW, submitted_at=NOW))
    return item


def test_the_individual_ranking_uses_the_adjusted_mean_of_the_version_2_cuts(db):
    # Migration 0017: m = 5 phantom matches at μ = 3.0 and the cuts revised for the adjusted mean.
    cut = load_cuts(db)['futebol_individual']
    assert (cut.metric, cut.prior_matches, cut.prior_mean, cut.prata, cut.ouro, cut.diamante) == (
        'media', Decimal(5), Decimal(3), Decimal('2.6'), Decimal('3.9'), Decimal('5.2'))
    assert load_cuts(db, 1)['futebol_individual'].prior_matches is None        # version 1 untouched
    home, away = new_team(db, 'Ferrugem'), new_team(db, 'Leoes')
    star, steady, rival, rookie = (make_user(db, name) for name in ('craque', 'constante', 'rival', 'estreante'))
    # Craque: 3 wins with 3 reviewed goals = 7 points per match (Diamante with the plain average). Rival loses them.
    for number in range(3):
        match = played(db, home, away, 3, 0, starts_at=NOW - (number + 1) * DAY)
        scored_appearance(db, match, star, 'a', goals=3)
        scored_appearance(db, match, rival, 'b')
    # Constante: 10 wins with 2 reviewed goals = 6 points per match. The rookie loses one of them.
    for number in range(10):
        match = played(db, home, away, 2, 0, starts_at=NOW - (number + 5) * DAY)
        scored_appearance(db, match, steady, 'a', goals=2)
        if number == 0:
            scored_appearance(db, match, rookie, 'b')
    key = RankingKey('futebol_individual', 'society', 'atacante')
    recalculate_rankings(db, [key], now=NOW)

    ranking = rows(db, Standing.user_id.is_not(None))
    summary = {user.id: (ranking[user.id].rank_position, ranking[user.id].tier, ranking[user.id].metric_value,
                         ranking[user.id].matches_played) for user in (star, steady, rival, rookie)}
    assert summary == {
        steady.id: (1, 'ouro', Decimal('5.000'), 10),     # (60 + 15) / 15: the longer sample comes first
        star.id: (2, 'ouro', Decimal('4.500'), 3),        # (21 + 15) / 8: three exceptional matches are not Diamante
        rival.id: (3, 'bronze', Decimal('2.250'), 3),     # (3 + 15) / 8
        rookie.id: (None, None, Decimal('2.667'), 1),     # (1 + 15) / 6, in placement
    }
    assert {row.calc_version for row in ranking.values()} == {CURRENT_CALC_VERSION} == {2}
    assert (ranking[star.id].wins, ranking[star.id].goals_for, ranking[star.id].recent_form) == (3, 0, 'VVV')

    # Cuts without m and μ (older versions, the rollback path): the same recalculation gives the plain average.
    db.execute(update(RankCut).where(RankCut.calc_version == CURRENT_CALC_VERSION,
                                     RankCut.ranking == 'futebol_individual').values(prior_matches=None,
                                                                                     prior_mean=None))
    recalculate_rankings(db, [key], now=NOW)
    ranking = rows(db, Standing.user_id.is_not(None))
    assert [(ranking[user.id].rank_position, ranking[user.id].tier, ranking[user.id].metric_value)
            for user in (star, steady, rival, rookie)] == [
        (1, 'diamante', Decimal('7.000')), (2, 'diamante', Decimal('6.000')), (3, 'bronze', Decimal('1.000')),
        (None, None, Decimal('1.000'))]


# ----- Open searches ----------------------------------------------------------------------------------------

def test_a_tier_change_updates_the_open_search_and_pairs_it_again(db):
    (team_a, rep_a), (team_c, rep_c) = team_and_rep(db, 'Ferrugem'), team_and_rep(db, 'Leoes')
    sparring = new_team(db, 'Treino')
    # Ferrugem was Ouro; three losses in a row leave it Bronze. Leões, Bronze, could not face an Ouro.
    make_standing(db, tier='ouro', team=team_a, format_='society', rank=1)
    search_a = add(db, team_search(team_a, rep_a, tier='ouro', started_at=NOW - HOUR))
    search_c = add(db, team_search(team_c, rep_c, tier='bronze', started_at=NOW - 2 * HOUR))
    assert queue.try_match(db, search_c, now=NOW) is None
    matches = [played(db, team_a, sparring, 0, 1, starts_at=NOW - (number + 1) * DAY) for number in range(3)]
    recalculate_for_match(db, matches[0], now=NOW)

    db.refresh(search_a)
    db.refresh(search_c)
    assert search_a.state == search_c.state == 'pareada' and search_a.match_id == search_c.match_id
    assert search_a.tier == 'bronze'
    assert team_rows(db)[team_a.id].tier == 'bronze'
    assert {item.user_id for item in notifications_of(db, 'proposta_partida')} == {rep_a.id, rep_c.id}
    assert db.get(Match, search_a.match_id).state == 'proposta'


def test_a_search_already_in_a_proposal_gets_the_new_tier_but_keeps_the_proposal(db):
    (team_e, rep_e), (team_f, rep_f) = team_and_rep(db, 'Equipe E'), team_and_rep(db, 'Equipe F')
    sparring = new_team(db, 'Treino')
    search_e = add(db, team_search(team_e, rep_e, started_at=NOW - 2 * HOUR))
    search_f = add(db, team_search(team_f, rep_f, started_at=NOW - HOUR))
    pairing = queue.try_match(db, search_f, now=NOW)
    assert pairing is not None and search_e.state == search_f.state == 'pareada'
    proposal = db.get(Match, pairing.match.id)

    matches = [played(db, team_e, sparring, 2, 0, starts_at=NOW - (number + 1) * DAY) for number in range(3)]
    recalculate_for_match(db, matches[0], now=NOW)
    db.refresh(search_e)
    # The search shows the current tier; the proposal keeps the tier of the moment it was made.
    assert (search_e.state, search_e.tier, proposal.state) == ('pareada', 'ouro', 'proposta')
    sides = {side.side: side.tier for side in db.scalars(select(MatchSide).where(MatchSide.match_id == proposal.id))}
    assert sides == {'a': None, 'b': None}


def test_a_walk_in_whose_individual_tier_changes_is_offered_the_slot(db):
    host, rival, sparring = new_team(db, 'Anfitriao'), new_team(db, 'Rival'), new_team(db, 'Treino')
    open_match = scheduled_match(db, host, rival, slots_a={'atacante': 1}, tier_a='ouro', tier_b='ouro')
    slot = db.scalar(select(MatchSlot).where(MatchSlot.match_id == open_match.id))
    player = make_user(db, 'atacante')
    # He was Bronze as an attacker at society; an Ouro host cannot take him. Three wins (4 points each) make him
    # Prata, a neighbour of Ouro: the adjusted mean (12 + 5 × 3.0) / 8 = 3.375.
    make_standing(db, tier='bronze', user=player, format_='society', position='atacante', rank=1)
    search = add(db, walkin_search(player, position='atacante', started_at=NOW - HOUR))
    assert queue.try_match(db, search, now=NOW) is None
    matches = [played(db, host, sparring, 1, 0, starts_at=NOW - (number + 1) * DAY) for number in range(3)]
    for match in matches:
        lineup(db, match, player, 'a', 'atacante')
    recalculate_for_match(db, matches[0], now=NOW)

    row = db.scalar(select(Standing).where(Standing.user_id == player.id))
    assert (row.tier, row.metric_value) == ('prata', Decimal('3.375'))
    db.refresh(search)
    db.refresh(slot)
    assert (search.state, search.slot_id, slot.state) == ('pareada', slot.id, 'oferecida')
    assert notifications_of(db, 'vaga_encontrada')[0].user_id == player.id
    assert search.tier is None

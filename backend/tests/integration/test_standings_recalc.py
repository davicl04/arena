"""Ranking recalculation on PostgreSQL (Jogar, fase 5): the 52-week window, Lendário, walkovers, the sweep task and
the open searches that receive a new tier and pair again.

Matches are built from the models with confirmed scores; `recalculate_*` run on the test transaction.
"""
from datetime import timedelta

import pytest
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.brackets import EventPlacement
from app.models.events import EventEntry
from app.models.matches import FootballStat, Match, MatchSide, MatchSlot
from app.models.rankings import RankCut, Standing
from app.services import sweep
from app.services.match_lifecycle import apply_final_score
from app.services.match_rules import walkover_score
from app.services.matchmaking_queue import queue
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
    cut = db.scalar(select(RankCut).where(RankCut.ranking == 'futebol_time', RankCut.calc_version == 1))
    cut.prata, cut.ouro, cut.diamante = 2, 4, 6
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
    assert [(row.rank_position, row.tier, row.metric_value) for row in winners] == [
        (1, 'lendario', 9), (2, 'diamante', 9), (3, 'diamante', 9), (4, 'diamante', 9)]
    assert sorted(row.rank_position for row in ranking.values()) == list(range(1, 9))
    assert all(row.calc_version == 1 and row.matches_played == 3 for row in ranking.values())
    # Nothing changed since: a second recalculation writes nothing.
    assert recalculate_rankings(db, [SOCIETY], now=NOW) == 0
    assert recalculate_rankings(db, [], now=NOW) == 0


def test_a_ranking_without_cuts_is_refused_and_keys_are_validated(db):
    db.execute(delete(RankCut).where(RankCut.ranking == 'tenis', RankCut.calc_version == 1))
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


def test_tennis_ranking_counts_wins_and_ranks_the_classified(db):
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
            winner.rank_position, winner.tier) == (3, 3, 30, 6, 0, 1, 'prata')
    assert (loser.matches_played, loser.losses, loser.metric_value, loser.rank_position, loser.tier) == (
        3, 3, 0, 2, 'bronze')


# ----- Window (52 weeks) and the sweep task -----------------------------------------------------------------

def test_matches_leaving_the_window_stop_counting_and_the_sweep_task_is_idempotent(db):
    team_a, team_b = new_team(db, 'Ferrugem'), new_team(db, 'Leoes')
    for starts_at in (NOW - 51 * WEEK, NOW - 50 * WEEK, NOW - 2 * WEEK, NOW - WEEK):
        played(db, team_a, team_b, 1, 0, starts_at=starts_at)
    assert recalculate_outside_window(db, NOW) == 0
    recalculate_rankings(db, [SOCIETY], now=NOW)
    first = team_rows(db)[team_a.id]
    assert (first.matches_played, first.metric_value, first.tier, first.rank_position) == (4, 12, 'prata', 1)

    # Two weeks later the oldest match is 53 weeks old; the one at exactly 52 weeks still counts.
    later = NOW + 2 * WEEK
    assert recalculate_outside_window(db, later) == 2
    ranking = team_rows(db)
    assert (ranking[team_a.id].matches_played, ranking[team_a.id].metric_value, ranking[team_a.id].tier) == (
        3, 9, 'bronze')
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
    search = add(db, team_search(team_a, rep_a, tier='bronze', started_at=later - HOUR))
    assert team_rows(db)[team_a.id].tier == 'bronze'

    # All three matches leave at once: both rows go, the other teams are only stamped, the search loses its tier.
    assert recalculate_outside_window(db, later) == 2
    ranking = team_rows(db)
    assert set(ranking) == {team_c.id, team_d.id} and ranking[team_c.id].updated_at == later
    assert ranking[team_c.id].matches_played == 1
    db.refresh(search)
    assert (search.state, search.tier) == ('ativa', None)


def test_tennis_rows_leave_with_their_matches_and_a_tennis_search_follows_the_tier(db):
    ana, bia, carla = (make_user(db, name) for name in ('ana', 'bia', 'carla'))
    make_standing(db, tier='ouro', sport='tenis', user=ana, rank=1)
    search_ana = add(db, tennis_search(ana, tier='ouro', started_at=NOW - HOUR))
    search_carla = add(db, tennis_search(carla, tier='bronze', started_at=NOW - 2 * HOUR))
    assert queue.try_match(db, search_carla, now=NOW) is None
    for number in range(3):
        match = played_tennis(db, ana, bia, [{'a': 6, 'b': 1}, {'a': 6, 'b': 2}],
                              starts_at=NOW - 51 * WEEK + number * DAY)
    recalculate_for_match(db, match, now=NOW)
    # Three wins are 30 points: Prata faces Bronze, so the two searches pair now.
    db.refresh(search_ana)
    db.refresh(search_carla)
    assert (search_ana.tier, search_ana.state, search_carla.state) == ('prata', 'pareada', 'pareada')
    assert rows(db)[ana.id].tier == 'prata'

    assert recalculate_outside_window(db, NOW + 2 * WEEK) == 2
    assert not rows(db)


def test_a_championship_bonus_leaves_the_tennis_points_when_its_event_leaves_the_window(db):
    # The bonus counts while its event ended inside the 52 weeks (contract 0003, 21). It leaves after the matches of the
    # same athlete do, so the sweep must look at the bonuses too: no match departs on that day, and the stored
    # points would keep the bonus for as long as nobody else played.
    ana, bia = make_user(db, 'ana'), make_user(db, 'bia')
    event = tennis_event(db, bia.id, state='encerrado', competition_type='todos_contra_todos')
    entry = add(db, EventEntry(event_id=event.id, user_id=ana.id, registered_by_id=ana.id, state='confirmada',
                               price_cents=0, confirmed_at=NOW - 52 * WEEK))
    awarded = NOW - 51 * WEEK
    add(db, EventPlacement(event_id=event.id, entry_id=entry.id, user_id=ana.id, placement=1, bonus_points=40,
                           awarded_at=awarded))
    for number in range(3):
        match = played_tennis(db, ana, bia, [{'a': 6, 'b': 1}, {'a': 6, 'b': 2}],
                              starts_at=NOW - 30 * WEEK + number * DAY)
    recalculate_for_match(db, match, now=NOW)
    assert rows(db)[ana.id].metric_value == 70 and rows(db)[ana.id].tier == 'prata'      # 3 wins (30) + 40
    assert recalculate_outside_window(db, NOW) == 0

    # Two weeks later the event is 53 weeks old; every match is still inside the window (30 weeks).
    later = NOW + 2 * WEEK
    assert recalculate_outside_window(db, later) == 1
    assert (rows(db)[ana.id].metric_value, rows(db)[ana.id].wins, rows(db)[ana.id].tier) == (30, 3, 'prata')
    assert rows(db)[ana.id].updated_at == later
    assert recalculate_outside_window(db, later) == 0                                       # idempotent


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
    assert (ranking[team_b.id].wins, ranking[team_b.id].goals_for, ranking[team_b.id].metric_value) == (1, 3, 3)
    assert (ranking[team_a.id].losses, ranking[team_a.id].goals_against) == (1, 3)
    athlete = db.scalar(select(Standing).where(Standing.user_id == present.id))
    # Presence 1 + win 3; the absent side's athlete (even with a stat) has no row.
    assert (athlete.position, athlete.metric_value, athlete.wins, athlete.matches_played) == ('defesa', 4, 1, 1)
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
    # A draw: presence 1 + 1 point.
    assert set(ranking) == {star.id} and ranking[star.id].metric_value == 2
    assert (ranking[star.id].draws, ranking[star.id].goals_for, ranking[star.id].goals_against) == (1, 0, 0)


# ----- Open searches ----------------------------------------------------------------------------------------

def test_a_tier_change_updates_the_open_search_and_pairs_it_again(db):
    (team_a, rep_a), (team_c, rep_c) = team_and_rep(db, 'Ferrugem'), team_and_rep(db, 'Leoes')
    sparring = new_team(db, 'Treino')
    # Ferrugem was Ouro; three wins in a row leave it Bronze. Leões, Bronze, could not face an Ouro.
    make_standing(db, tier='ouro', team=team_a, format_='society', rank=1)
    search_a = add(db, team_search(team_a, rep_a, tier='ouro', started_at=NOW - HOUR))
    search_c = add(db, team_search(team_c, rep_c, tier='bronze', started_at=NOW - 2 * HOUR))
    assert queue.try_match(db, search_c, now=NOW) is None
    matches = [played(db, team_a, sparring, 1, 0, starts_at=NOW - (number + 1) * DAY) for number in range(3)]
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
    assert (search_e.state, search_e.tier, proposal.state) == ('pareada', 'bronze', 'proposta')
    sides = {side.side: side.tier for side in db.scalars(select(MatchSide).where(MatchSide.match_id == proposal.id))}
    assert sides == {'a': None, 'b': None}


def test_a_walk_in_whose_individual_tier_changes_is_offered_the_slot(db):
    host, rival, sparring = new_team(db, 'Anfitriao'), new_team(db, 'Rival'), new_team(db, 'Treino')
    open_match = scheduled_match(db, host, rival, slots_a={'atacante': 1}, tier_a='ouro', tier_b='ouro')
    slot = db.scalar(select(MatchSlot).where(MatchSlot.match_id == open_match.id))
    player = make_user(db, 'atacante')
    # He was Bronze as an attacker at society; an Ouro host cannot take him. Three wins make him Ouro (4.0).
    make_standing(db, tier='bronze', user=player, format_='society', position='atacante', rank=1)
    search = add(db, walkin_search(player, position='atacante', started_at=NOW - HOUR))
    assert queue.try_match(db, search, now=NOW) is None
    matches = [played(db, host, sparring, 1, 0, starts_at=NOW - (number + 1) * DAY) for number in range(3)]
    for match in matches:
        lineup(db, match, player, 'a', 'atacante')
    recalculate_for_match(db, matches[0], now=NOW)

    row = db.scalar(select(Standing).where(Standing.user_id == player.id))
    assert (row.tier, row.metric_value) == ('ouro', 4)
    db.refresh(search)
    db.refresh(slot)
    assert (search.state, search.slot_id, slot.state) == ('pareada', slot.id, 'oferecida')
    assert notifications_of(db, 'vaga_encontrada')[0].user_id == player.id
    assert search.tier is None

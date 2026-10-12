"""Migration 0009: matches, searches, terms, courts, slots, chat, results and stats; constraints and downgrade."""
import os
import uuid
from datetime import timedelta
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from app.models.matches import (
    Court,
    FootballStat,
    Match,
    MatchLineup,
    MatchMessage,
    MatchResult,
    MatchSearch,
    MatchSide,
    MatchSlot,
    MatchTerms,
)
from app.models.rankings import Standing
from tests.integration.match_helpers import (
    CITY,
    NOW,
    add,
    make_team,
    make_user,
    team_search,
    tennis_search,
    walkin_search,
)

STAGE_THREE_TABLES = {'courts', 'matches', 'match_slots', 'match_searches', 'match_sides', 'match_terms',
                      'match_lineups', 'match_messages', 'match_results', 'football_stats'}
BACKEND = Path(__file__).resolve().parents[2]
RECORD_COLUMNS = {'wins', 'draws', 'losses', 'goals_for', 'goals_against'}


def test_migration_0009_downgrades_to_0008_and_upgrades_again():
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('Defina TEST_DATABASE_URL para executar integração com PostgreSQL.')
    admin = create_engine(url)
    schema = 'arena_mig3_' + uuid.uuid4().hex
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={'options': f'-csearch_path={schema}'})
    config = Config(str(BACKEND / 'alembic.ini'))
    config.set_main_option('script_location', str(BACKEND / 'migrations'))
    try:
        with engine.begin() as connection:
            config.attributes['connection'] = connection
            command.upgrade(config, 'head')
            assert STAGE_THREE_TABLES <= set(inspect(connection).get_table_names())
            assert RECORD_COLUMNS <= {column['name'] for column in inspect(connection).get_columns('standings')}
            # The court catalog starts empty: no sample courts.
            assert connection.scalar(text('SELECT count(*) FROM courts')) == 0
            command.downgrade(config, '0008')
            assert not STAGE_THREE_TABLES & set(inspect(connection).get_table_names())
            assert not RECORD_COLUMNS & {column['name'] for column in inspect(connection).get_columns('standings')}
            assert connection.scalar(text('SELECT version_num FROM alembic_version')) == '0008'
            command.upgrade(config, 'head')
            head = ScriptDirectory.from_config(config).get_current_head()
            assert head == '0009'
            assert connection.scalar(text('SELECT version_num FROM alembic_version')) == head
    finally:
        engine.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


def rejected(db, *rows):
    with pytest.raises(IntegrityError):
        with db.begin_nested():
            db.add_all(rows)
            db.flush()


def match_row(**values):
    base = dict(sport='futebol', format='society', city_id=CITY, origin='amistoso', state='combinando',
                created_at=NOW, updated_at=NOW)
    base.update(values)
    return Match(**base)


def scheduled(**values):
    starts = values.pop('starts_at', NOW + timedelta(days=2))
    base = dict(state='agendada', starts_at=starts, result_deadline=starts + timedelta(hours=48))
    base.update(values)
    return match_row(**base)


def court_row(**values):
    base = dict(city_id=CITY, name='Arena Sudoeste', name_key='arena sudoeste', kind='society', state='publicada',
                published_at=NOW, reviewed_at=NOW)
    base.update(values)
    return Court(**base)


def test_searches_keep_one_open_per_subject_and_valid_categories(client):
    _, db = client
    rep, athlete = make_user(db, 'rep'), make_user(db, 'atleta')
    team = make_team(db, rep)
    add(db, team_search(team, rep), tennis_search(athlete), walkin_search(athlete))
    # One open search per team or athlete and sport (waiting or held by a proposal).
    rejected(db, team_search(team, rep, format_='campo'))
    rejected(db, tennis_search(athlete))
    held = walkin_search(make_user(db, 'avulso'))
    held.state = 'pareada'
    rejected(db, held)                                   # walk-in held without a slot offer
    rejected(db, team_search(make_team(db, make_user(db, 'r2'), name='Outro'), rep, format_=None))
    bad_kind = tennis_search(make_user(db, 'x'))
    bad_kind.format = 'society'
    rejected(db, bad_kind)
    both = team_search(team, rep)
    both.user_id = athlete.id
    rejected(db, both)
    lapsed = tennis_search(make_user(db, 'y'))
    lapsed.expires_at = lapsed.started_at
    rejected(db, lapsed)
    ended = tennis_search(make_user(db, 'z'))
    ended.state = 'cancelada'
    rejected(db, ended)                                  # a finished search has ended_at
    ended.ended_at = NOW
    add(db, ended)
    # Finished searches free the subject: a new search for the same team is accepted.
    team_search_open = db.query(MatchSearch).filter(MatchSearch.team_id == team.id).one()
    team_search_open.state, team_search_open.ended_at = 'cancelada', NOW
    db.flush()
    add(db, team_search(team, rep, format_='campo'))


def test_matches_have_two_distinct_sides_by_team_or_athlete(client):
    _, db = client
    rep, other_rep = make_user(db, 'rep'), make_user(db, 'rep2')
    team, other = make_team(db, rep), make_team(db, other_rep, name='Leões')
    match = add(db, match_row())
    add(db, MatchSide(match_id=match.id, side='a', team_id=team.id, created_at=NOW))
    rejected(db, MatchSide(match_id=match.id, side='a', team_id=other.id, created_at=NOW))     # same side twice
    rejected(db, MatchSide(match_id=match.id, side='b', team_id=team.id, created_at=NOW))      # same team twice
    rejected(db, MatchSide(match_id=match.id, side='b', team_id=other.id, user_id=rep.id, created_at=NOW))
    rejected(db, MatchSide(match_id=match.id, side='b', created_at=NOW))
    rejected(db, MatchSide(match_id=match.id, side='c', team_id=other.id, created_at=NOW))
    add(db, MatchSide(match_id=match.id, side='b', team_id=other.id, created_at=NOW))
    tennis = add(db, match_row(sport='tenis', format=None))
    add(db, MatchSide(match_id=tennis.id, side='a', user_id=rep.id, created_at=NOW))
    rejected(db, MatchSide(match_id=tennis.id, side='b', user_id=rep.id, created_at=NOW))


def test_match_states_carry_their_dates_and_results(client):
    _, db = client
    add(db, match_row(state='proposta', proposal_expires_at=NOW + timedelta(hours=2)), scheduled())
    rejected(db, match_row(state='proposta'))
    rejected(db, match_row(sport='futebol', format=None))
    rejected(db, match_row(sport='tenis'))
    rejected(db, match_row(state='agendada'))
    rejected(db, scheduled(result_deadline=None))
    rejected(db, scheduled(state='realizada'))                            # no confirmed score
    rejected(db, scheduled(score_a=3, score_b=1, result_source='confirmacao', result_confirmed_at=NOW))
    add(db, scheduled(state='realizada', score_a=3, score_b=1, winner_side='a', result_source='confirmacao',
                      result_confirmed_at=NOW))
    rejected(db, scheduled(state='encerrada', score_a=1, score_b=0, result_source='administracao',
                           result_confirmed_at=NOW, closed_at=NOW))       # a decision needs its reason
    rejected(db, match_row(sport='tenis', format=None, state='realizada', starts_at=NOW,
                           result_deadline=NOW + timedelta(hours=48), score_a=2, score_b=0, result_source='wo',
                           result_confirmed_at=NOW))                      # tennis needs winner and sets
    rejected(db, scheduled(state='cancelada', closed_at=NOW))
    rejected(db, scheduled(state='sem_resultado'))
    add(db, scheduled(state='sem_resultado', closed_at=NOW))
    rejected(db, scheduled(walkover_absent_side='b'))
    rejected(db, scheduled(walkover_absent_side='b', walkover_registered_at=NOW, walkover_contested_at=NOW))
    add(db, scheduled(walkover_absent_side='b', walkover_registered_at=NOW, walkover_contested_at=NOW,
                      walkover_contest_reason='Estávamos lá'))
    rejected(db, match_row(round_number=1))                               # bracket fields only in championships
    rejected(db, match_row(origin='campeonato'))                          # a championship match has its event
    rejected(db, scheduled(super_tiebreak=True))
    rejected(db, scheduled(booking_confirmed_at=NOW, booking_side=None))


def test_terms_keep_one_pending_and_one_accepted_proposal(client):
    _, db = client
    proposer = make_user(db, 'rep')
    match = add(db, match_row())
    court = add(db, court_row())
    pending = dict(match_id=match.id, proposed_by_id=proposer.id, proposed_by_side='a', starts_at=NOW + timedelta(days=3),
                   court_id=court.id, booking_side='a', accepted_a_at=NOW, created_at=NOW)
    add(db, MatchTerms(**pending))
    rejected(db, MatchTerms(**pending))                                   # one pending proposal per match
    rejected(db, MatchTerms(**{**pending, 'accepted_a_at': None, 'state': 'substituida', 'decided_at': NOW}))
    rejected(db, MatchTerms(**{**pending, 'state': 'aceita', 'decided_at': NOW}))  # both sides must accept
    accepted = {**pending, 'state': 'aceita', 'accepted_b_at': NOW, 'decided_at': NOW}
    add(db, MatchTerms(**accepted))
    rejected(db, MatchTerms(**accepted))                                  # one accepted set per match
    rejected(db, MatchTerms(**{**pending, 'state': 'substituida'}))       # decided rows carry decided_at


def test_courts_never_publish_the_same_name_twice_in_a_city_and_kind(client):
    _, db = client
    suggester = make_user(db, 'sugere')
    published = add(db, court_row())
    rejected(db, court_row(name='ARENA  Sudoeste'))
    add(db, court_row(kind='futsal'), court_row(city_id=3550308))
    add(db, court_row(state='em_revisao', published_at=None, reviewed_at=None, suggested_by_id=suggester.id))
    rejected(db, court_row(state='em_revisao', published_at=None))        # under review has no decision yet
    rejected(db, court_row(state='rejeitada', published_at=None))         # a rejection has a reason or a duplicate
    add(db, court_row(state='rejeitada', published_at=None, duplicate_of_id=published.id),
        court_row(state='rejeitada', published_at=None, review_reason='Endereço não existe'))
    rejected(db, court_row(name='A', name_key='a'))
    rejected(db, court_row(kind='areia'))


def test_slots_lineups_results_and_stats(client):
    _, db = client
    guest, other = make_user(db, 'avulso'), make_user(db, 'outro')
    match = add(db, scheduled())
    open_slot = dict(match_id=match.id, side='a', position='atacante', state='aberta', opened_at=NOW, created_at=NOW)
    add(db, MatchSlot(**open_slot))
    filled = dict(open_slot, state='preenchida', filled_by_id=guest.id, filled_at=NOW)
    add(db, MatchSlot(**filled))
    rejected(db, MatchSlot(**filled))                                    # one filled slot per athlete and match
    rejected(db, MatchSlot(**dict(open_slot, filled_by_id=other.id, filled_at=NOW)))
    rejected(db, MatchSlot(**dict(open_slot, position='ponta')))
    rejected(db, MatchSlot(**dict(open_slot, state='fechada')))
    add(db, MatchSlot(**dict(filled, state='fechada', closed_at=NOW, removed_at=NOW)))
    rejected(db, MatchSlot(**dict(open_slot, state='fechada', closed_at=NOW, removed_at=NOW)))

    lineup = add(db, MatchLineup(match_id=match.id, side='a', user_id=guest.id, guest=True, position='atacante',
                                 created_at=NOW, updated_at=NOW))
    rejected(db, MatchLineup(match_id=match.id, side='b', user_id=guest.id, guest=False, created_at=NOW,
                             updated_at=NOW))                             # one side per athlete in a match
    rejected(db, MatchLineup(match_id=match.id, side='b', user_id=other.id, guest=False, removed_at=NOW,
                             created_at=NOW, updated_at=NOW))

    add(db, MatchResult(match_id=match.id, side='a', score_a=2, score_b=1, created_at=NOW, updated_at=NOW))
    rejected(db, MatchResult(match_id=match.id, side='a', score_a=2, score_b=2, created_at=NOW, updated_at=NOW))
    rejected(db, MatchResult(match_id=match.id, side='b', score_a=100, score_b=2, created_at=NOW, updated_at=NOW))

    stat = dict(lineup_id=lineup.id, match_id=match.id, user_id=guest.id, goals=1, submitted_at=NOW, created_at=NOW,
                updated_at=NOW)
    rejected(db, FootballStat(**stat, state='revisada'))                   # reviewed needs reviewed_at
    rejected(db, FootballStat(**stat, state='contestada', contested_at=NOW, contest_reason='Não foi gol'))
    rejected(db, FootballStat(**stat, state='enviada', contested_at=NOW, contest_reason='x',
                              contested_fields=['cartoes']))
    rejected(db, FootballStat(**{**stat, 'goals': 51}, state='enviada'))
    add(db, FootballStat(**stat, state='contestada', contested_at=NOW, contest_reason='Não foi gol',
                         contested_fields=['gols']))
    rejected(db, FootballStat(**stat, state='enviada'))                    # one stat row per appearance


def test_chat_messages_and_standing_records(client):
    _, db = client
    author = make_user(db, 'autor')
    match = add(db, match_row())
    add(db, MatchMessage(match_id=match.id, author_id=author.id, side='a', kind='texto', body='Bora!', created_at=NOW),
        MatchMessage(match_id=match.id, kind='evento', event_type='partida_combinando', body='Proposta aceita.',
                     created_at=NOW))
    rejected(db, MatchMessage(match_id=match.id, author_id=author.id, kind='texto', body='', created_at=NOW))
    rejected(db, MatchMessage(match_id=match.id, kind='evento', body='Sem tipo', created_at=NOW))
    rejected(db, MatchMessage(match_id=match.id, kind='evento', event_type='x', body='Oculto', removed_at=NOW,
                              created_at=NOW))
    base = dict(user_id=author.id, sport='tenis', metric_value=0, matches_played=1, calc_version=1)
    add(db, Standing(**base, wins=1, goals_for=2))
    rejected(db, Standing(**{**base, 'user_id': make_user(db, 'neg').id}, losses=-1))

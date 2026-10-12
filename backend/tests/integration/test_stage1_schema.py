"""Migration 0005: tables, constraints and the downgrade path on PostgreSQL."""
import os
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, func, inspect, select, text
from sqlalchemy.exc import IntegrityError

from app.models.identity import User
from app.models.organizers import Organizer, OrganizerRequest
from app.models.rankings import RankCut, Standing
from app.models.teams import Team, TeamInvite, TeamJoinRequest, TeamMember
from app.services import team_links

STAGE_ONE_TABLES = {'notifications', 'audit_log', 'teams', 'team_members', 'team_invites', 'team_join_requests',
                    'organizer_requests', 'organizers', 'rank_cuts', 'standings'}
BACKEND = Path(__file__).resolve().parents[2]


def test_migration_downgrades_to_0004_and_upgrades_again():
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('Defina TEST_DATABASE_URL para executar integração com PostgreSQL.')
    admin = create_engine(url)
    schema = 'arena_mig_' + uuid.uuid4().hex
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={'options': f'-csearch_path={schema}'})
    config = Config(str(BACKEND / 'alembic.ini'))
    config.set_main_option('script_location', str(BACKEND / 'migrations'))
    try:
        with engine.begin() as connection:
            config.attributes['connection'] = connection
            command.upgrade(config, 'head')
            assert STAGE_ONE_TABLES <= set(inspect(connection).get_table_names())
            assert connection.scalar(text('SELECT count(*) FROM rank_cuts WHERE calc_version = 1')) == 8
            command.downgrade(config, '0004')
            assert not STAGE_ONE_TABLES & set(inspect(connection).get_table_names())
            assert connection.scalar(text('SELECT version_num FROM alembic_version')) == '0004'
            command.upgrade(config, 'head')
            head = ScriptDirectory.from_config(config).get_current_head()
            assert connection.scalar(text('SELECT version_num FROM alembic_version')) == head
            assert connection.scalar(text('SELECT count(*) FROM standings')) == 0
    finally:
        engine.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


def make_user(db, label):
    user = User(name=f'Atleta {label}', username=f'atleta.{label}.{uuid.uuid4().hex[:6]}',
                email=f'{label}-{uuid.uuid4().hex[:6]}@example.com', birth_date='1990-01-01', password_hash='x',
                active=True)
    db.add(user)
    db.flush()
    return user


def rejected(db, *rows):
    with pytest.raises(IntegrityError):
        with db.begin_nested():
            db.add_all(rows)
            db.flush()


def test_team_constraints_keep_one_active_stay_and_one_pending_per_person(client):
    _, db = client
    owner, guest = make_user(db, 'dona'), make_user(db, 'convidado')
    team = Team(name='Ferrugem FC', city_id=5300108, created_by_id=owner.id, state='ativo')
    db.add(team)
    db.flush()
    team_links.issue(team)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, role='representante', joined_via='criacao'))
    db.add(TeamInvite(team_id=team.id, invitee_id=guest.id, inviter_id=owner.id, message='Bora jogar'))
    db.add(TeamJoinRequest(team_id=team.id, user_id=guest.id))
    db.flush()

    rejected(db, TeamMember(team_id=team.id, user_id=owner.id, role='membro', joined_via='convite'))
    rejected(db, TeamInvite(team_id=team.id, invitee_id=guest.id, inviter_id=owner.id))
    rejected(db, TeamJoinRequest(team_id=team.id, user_id=guest.id))
    rejected(db, TeamMember(team_id=team.id, user_id=guest.id, role='capitao', joined_via='convite'))
    rejected(db, Team(name='AB', city_id=5300108, state='ativo'))
    rejected(db, Team(name='Encerrado sem data', city_id=5300108, state='encerrado'))

    # A finished stay and decided rows do not block a new stay or a new pending row.
    member = db.scalar(select(TeamMember).where(TeamMember.team_id == team.id))
    member.left_at, member.left_reason = func.now(), 'saiu'
    invite = db.scalar(select(TeamInvite).where(TeamInvite.team_id == team.id))
    invite.state, invite.decided_at = 'recusado', func.now()
    db.flush()
    db.add_all([TeamMember(team_id=team.id, user_id=owner.id, role='representante', joined_via='convite'),
                TeamInvite(team_id=team.id, invitee_id=guest.id, inviter_id=owner.id)])
    db.flush()

    # A closed team cannot keep a link.
    team.state, team.closed_at = 'encerrado', func.now()
    with pytest.raises(IntegrityError):
        with db.begin_nested():
            db.flush()


def test_organizer_constraints(client):
    _, db = client
    user = make_user(db, 'organiza')
    request = dict(user_id=user.id, display_name='Liga do Cerrado', city_id=5300108, contact='61 99999-0000',
                   terms_version=1, terms_accepted_at=func.now())
    db.add(OrganizerRequest(**request, sports=['futebol']))
    db.flush()
    rejected(db, OrganizerRequest(**request, sports=['tenis']))
    rejected(db, OrganizerRequest(**request, sports=['xadrez'], state='cancelado', decided_at=func.now()))
    rejected(db, OrganizerRequest(**request, sports=[], state='cancelado', decided_at=func.now()))
    rejected(db, OrganizerRequest(**request, sports=['corrida'], state='recusado', decided_at=func.now()))
    db.add(Organizer(user_id=user.id, display_name='Liga do Cerrado'))
    db.flush()
    rejected(db, Organizer(user_id=user.id, display_name='Outra'))
    rejected(db, Organizer(user_id=user.id, display_name='Revogada sem motivo', revoked_at=func.now()))
    db.add(Organizer(user_id=user.id, display_name='Antiga', revoked_at=func.now(), revoke_reason='Contato falso'))
    db.flush()


def test_standings_subject_and_category_rules(client):
    _, db = client
    user = make_user(db, 'ranking')
    team = Team(name='Real Cerrado', city_id=5300108, state='ativo')
    db.add(team)
    db.flush()
    base = dict(metric_value=0, matches_played=0, calc_version=1)
    db.add_all([Standing(team_id=team.id, sport='futebol', format='society', **base),
                Standing(user_id=user.id, sport='futebol', format='society', position='atacante', **base),
                Standing(user_id=user.id, sport='tenis', **base),
                Standing(user_id=user.id, sport='corrida', distance_km=5, **base)])
    db.flush()
    rejected(db, Standing(team_id=team.id, sport='futebol', format='society', **base))
    rejected(db, Standing(user_id=user.id, sport='tenis', **base))
    rejected(db, Standing(team_id=team.id, user_id=user.id, sport='futebol', format='campo', **base))
    rejected(db, Standing(user_id=user.id, sport='futebol', format='campo', **base))
    rejected(db, Standing(team_id=team.id, sport='tenis', **base))
    rejected(db, Standing(user_id=user.id, sport='corrida', distance_km=7, **base))
    rejected(db, Standing(user_id=user.id, sport='corrida', distance_km=10, tier='ouro', **base))
    assert db.scalar(select(func.count()).select_from(RankCut).where(RankCut.calc_version == 1)) == 8

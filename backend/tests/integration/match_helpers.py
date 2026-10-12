"""Factories for the stage 3 integration tests: accounts, teams, searches, matches, slots and standings.

Rows go straight to the database (no routes yet), with explicit timestamps so deadlines are deterministic.
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.models.audit import AuditLog
from app.models.identity import User
from app.models.matches import Match, MatchSearch, MatchSide
from app.models.notifications import Notification
from app.models.rankings import Standing
from app.models.teams import Team, TeamMember
from app.services.match_lifecycle import open_declared_slots
from app.services.match_rules import result_deadline, search_expires_at

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
CITY = 5300108          # Brasília
OTHER_CITY = 3550308    # São Paulo


def make_user(db, label='atleta', *, admin=False):
    user = User(name=f'Atleta {label}', username=f'{label}.{uuid.uuid4().hex[:8]}',
                email=f'{label}-{uuid.uuid4().hex[:8]}@example.com', birth_date='1990-01-01', password_hash='x',
                active=True, is_admin=admin)
    db.add(user)
    db.flush()
    return user


def make_team(db, representative, *members, name='Ferrugem FC', city_id=CITY, extra_representatives=()):
    team = Team(name=name, city_id=city_id, state='ativo')
    db.add(team)
    db.flush()
    for user in (representative, *extra_representatives):
        db.add(TeamMember(team_id=team.id, user_id=user.id, role='representante', joined_via='criacao'))
    for member in members:
        db.add(TeamMember(team_id=team.id, user_id=member.id, role='membro', joined_via='convite'))
    db.flush()
    return team


def team_search(team, rep, *, format_='society', tier=None, started_at=NOW, open_slots=None, city_id=CITY):
    slots = {'goleiro': 0, 'defesa': 0, 'meio_campo': 0, 'atacante': 0, **(open_slots or {})}
    return MatchSearch(sport='futebol', kind='time', city_id=city_id, format=format_, team_id=team.id,
                       created_by_id=rep.id, tier=tier, open_slots=slots, state='ativa', started_at=started_at,
                       expires_at=search_expires_at(started_at), created_at=started_at, updated_at=started_at)


def tennis_search(user, *, tier=None, started_at=NOW, city_id=CITY):
    return MatchSearch(sport='tenis', kind='tenis', city_id=city_id, user_id=user.id, created_by_id=user.id,
                       tier=tier, state='ativa', started_at=started_at, expires_at=search_expires_at(started_at),
                       created_at=started_at, updated_at=started_at)


def walkin_search(user, *, position=None, started_at=NOW, city_id=CITY):
    return MatchSearch(sport='futebol', kind='avulso', city_id=city_id, user_id=user.id, created_by_id=user.id,
                       position=position, state='ativa', started_at=started_at,
                       expires_at=search_expires_at(started_at), created_at=started_at, updated_at=started_at)


def add(db, *rows):
    db.add_all(rows)
    db.flush()
    return rows[0] if len(rows) == 1 else rows


def make_standing(db, *, tier, sport='futebol', team=None, user=None, format_=None, position=None, rank=1):
    row = Standing(team_id=team.id if team else None, user_id=user.id if user else None, sport=sport, format=format_,
                   position=position, metric_value=0, matches_played=3, rank_position=rank, tier=tier,
                   calc_version=1)
    db.add(row)
    db.flush()
    return row


def scheduled_match(db, team_a, team_b, *, starts_at=NOW + timedelta(days=2), format_='society', city_id=CITY,
                    slots_a=None, slots_b=None, tier_a=None, tier_b=None, open_slots=True, now=NOW):
    """A friendly already agreed ('agendada'), with the declared slots opened as on the first scheduling."""
    match = Match(sport='futebol', format=format_, city_id=city_id, origin='amistoso', state='agendada',
                  starts_at=starts_at, result_deadline=result_deadline(starts_at), booking_side='a',
                  created_at=now - timedelta(days=1), updated_at=now)
    db.add(match)
    db.flush()
    for label, team, slots, tier in (('a', team_a, slots_a, tier_a), ('b', team_b, slots_b, tier_b)):
        db.add(MatchSide(match_id=match.id, side=label, team_id=team.id, tier=tier, declared_slots=slots or {},
                         accepted_at=now - timedelta(days=1), created_at=now - timedelta(days=1)))
    db.flush()
    if open_slots:
        open_declared_slots(db, match, now=now)
    return match


def notifications_of(db, type_):
    return db.scalars(select(Notification).where(Notification.type == type_).order_by(Notification.id)).all()


def audit_actions(db, action):
    return db.scalars(select(AuditLog).where(AuditLog.action == action).order_by(AuditLog.id)).all()


def count(db, model, *where):
    return db.scalar(select(func.count()).select_from(model).where(*where))

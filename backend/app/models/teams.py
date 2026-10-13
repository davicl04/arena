"""Teams, memberships, invites and link join requests (Times e campeonatos, fases 1 e 2)."""
from __future__ import annotations

import unicodedata
from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, sql_in
from app.models.identity import utcnow

TEAM_STATES = ('ativo', 'encerrado')
MEMBER_ROLES = ('representante', 'membro')
MEMBER_SOURCES = ('criacao', 'convite', 'pedido')
MEMBER_LEFT_REASONS = ('saiu', 'removido', 'time_encerrado')
INVITE_STATES = ('pendente', 'aceito', 'recusado', 'cancelado')
JOIN_REQUEST_STATES = ('pendente', 'aprovado', 'recusado', 'cancelado')
POSITIONS = ('goleiro', 'defesa', 'meio_campo', 'atacante')
NAME_CONNECTORS = frozenset({'de', 'da', 'do', 'das', 'dos', 'e'})


def team_initials(name: str) -> str:
    """Two letters for the neutral crest: first and last significant words ('Leões do Cerrado' -> 'LC')."""
    words = [word for word in name.split() if word.lower() not in NAME_CONNECTORS] or name.split()
    if not words:
        return '?'
    letters = words[0][0] + words[-1][0] if len(words) > 1 else words[0][:2]
    return unicodedata.normalize('NFC', letters).upper()


class Team(Base):
    __tablename__ = 'teams'
    __table_args__ = (
        CheckConstraint(sql_in('state', TEAM_STATES), name='ck_teams_state'),
        CheckConstraint("(state = 'encerrado') = (closed_at IS NOT NULL)", name='ck_teams_closed'),
        CheckConstraint('char_length(name) BETWEEN 3 AND 40', name='ck_teams_name_length'),
        # The link exists only while the team is active; nonce, hash and date are written together.
        CheckConstraint("(link_nonce IS NULL) = (link_token_hash IS NULL) AND (link_nonce IS NULL) = "
                        "(link_generated_at IS NULL) AND (state = 'ativo' OR link_nonce IS NULL)", name='ck_teams_link'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40))
    city_id: Mapped[int] = mapped_column(ForeignKey('cities.id'), index=True)
    crest_media_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey('media_objects.id', ondelete='SET NULL'), nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True)
    state: Mapped[str] = mapped_column(String(12), default='ativo')
    # Never the token itself: the nonce plus the server secret derive it, and the hash finds the team.
    link_nonce: Mapped[str | None] = mapped_column(String(64), nullable=True)
    link_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    link_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    @property
    def initials(self) -> str:
        return team_initials(self.name)

    @property
    def crest_url(self) -> str | None:
        return f'/api/v1/teams/{self.id}/crest?v={self.crest_media_id}' if self.crest_media_id else None


class TeamMember(Base):
    """One row per stay in the team; leaving keeps the row (history) and a new stay is a new row."""
    __tablename__ = 'team_members'
    __table_args__ = (
        CheckConstraint(sql_in('role', MEMBER_ROLES), name='ck_team_members_role'),
        CheckConstraint(f"position IS NULL OR {sql_in('position', POSITIONS)}", name='ck_team_members_position'),
        CheckConstraint(sql_in('joined_via', MEMBER_SOURCES), name='ck_team_members_joined_via'),
        CheckConstraint(f"left_reason IS NULL OR {sql_in('left_reason', MEMBER_LEFT_REASONS)}",
                        name='ck_team_members_left_reason'),
        CheckConstraint('(left_at IS NULL) = (left_reason IS NULL)', name='ck_team_members_left'),
        Index('uq_team_members_active', 'team_id', 'user_id', unique=True, postgresql_where=text('left_at IS NULL')),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey('teams.id', ondelete='CASCADE'), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    role: Mapped[str] = mapped_column(String(20))
    # Position shown in this team's roster; copied from the athlete's own football profile on entry.
    position: Mapped[str | None] = mapped_column(String(20), nullable=True)
    joined_via: Mapped[str] = mapped_column(String(10))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    left_reason: Mapped[str | None] = mapped_column(String(20), nullable=True)
    removed_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)


class TeamInvite(Base):
    __tablename__ = 'team_invites'
    __table_args__ = (
        CheckConstraint(sql_in('state', INVITE_STATES), name='ck_team_invites_state'),
        CheckConstraint("(state = 'pendente') = (decided_at IS NULL)", name='ck_team_invites_decided'),
        Index('uq_team_invites_pending', 'team_id', 'invitee_id', unique=True,
              postgresql_where=text("state = 'pendente'")),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey('teams.id', ondelete='CASCADE'), index=True)
    invitee_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    inviter_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    message: Mapped[str | None] = mapped_column(String(140), nullable=True)
    state: Mapped[str] = mapped_column(String(10), default='pendente')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)


class TeamJoinRequest(Base):
    """Request created through the team link; a representative approves or declines it."""
    __tablename__ = 'team_join_requests'
    __table_args__ = (
        CheckConstraint(sql_in('state', JOIN_REQUEST_STATES), name='ck_team_join_requests_state'),
        CheckConstraint("(state = 'pendente') = (decided_at IS NULL)", name='ck_team_join_requests_decided'),
        Index('uq_team_join_requests_pending', 'team_id', 'user_id', unique=True,
              postgresql_where=text("state = 'pendente'")),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey('teams.id', ondelete='CASCADE'), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    state: Mapped[str] = mapped_column(String(10), default='pendente')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)

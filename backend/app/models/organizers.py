"""Organizer permission: requests reviewed by the administration and the granted permission."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, SmallInteger, String, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, sql_in
from app.models.identity import utcnow

ORGANIZER_REQUEST_STATES = ('em_analise', 'aprovado', 'recusado', 'cancelado')
ORGANIZER_REFUSAL_REASONS = ('contato_nao_funciona', 'pouca_informacao', 'pedido_repetido', 'outro')
SPORTS = ('futebol', 'tenis', 'corrida')


class OrganizerRequest(Base):
    __tablename__ = 'organizer_requests'
    __table_args__ = (
        CheckConstraint(sql_in('state', ORGANIZER_REQUEST_STATES), name='ck_organizer_requests_state'),
        CheckConstraint("(state = 'em_analise') = (decided_at IS NULL)", name='ck_organizer_requests_decided'),
        CheckConstraint(f"reason_code IS NULL OR {sql_in('reason_code', ORGANIZER_REFUSAL_REASONS)}",
                        name='ck_organizer_requests_reason_code'),
        CheckConstraint("state <> 'recusado' OR reason_code IS NOT NULL", name='ck_organizer_requests_refusal'),
        CheckConstraint("cardinality(sports) >= 1 AND sports <@ ARRAY['futebol', 'tenis', 'corrida']::varchar[]",
                        name='ck_organizer_requests_sports'),
        Index('uq_organizer_requests_pending', 'user_id', unique=True, postgresql_where=text("state = 'em_analise'")),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    display_name: Mapped[str] = mapped_column(String(80))
    city_id: Mapped[int] = mapped_column(ForeignKey('cities.id'))
    sports: Mapped[list[str]] = mapped_column(ARRAY(String(20)))
    experience: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    contact: Mapped[str] = mapped_column(String(120))
    link: Mapped[str | None] = mapped_column(String(300), nullable=True)
    # Version of the organizer rules accepted in the form ("Seja organizador").
    terms_version: Mapped[int] = mapped_column(SmallInteger)
    terms_accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(String(12), default='em_analise')
    reason_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    reason_detail: Mapped[str | None] = mapped_column(String(500), nullable=True)
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Organizer(Base):
    """The permission is an active row (not revoked); a revoked row stays as history."""
    __tablename__ = 'organizers'
    __table_args__ = (
        CheckConstraint('(revoked_at IS NULL) = (revoke_reason IS NULL)', name='ck_organizers_revoked'),
        Index('uq_organizers_active', 'user_id', unique=True, postgresql_where=text('revoked_at IS NULL')),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    request_id: Mapped[int | None] = mapped_column(ForeignKey('organizer_requests.id', ondelete='SET NULL'), nullable=True)
    display_name: Mapped[str] = mapped_column(String(80))
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    revoke_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

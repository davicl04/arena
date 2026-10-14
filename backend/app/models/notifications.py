"""In-app notifications: recipient, type, payload and read state."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.identity import utcnow


class Notification(Base):
    __tablename__ = 'notifications'
    __table_args__ = (
        Index('ix_notifications_user_created', 'user_id', 'created_at', 'id'),
        Index('ix_notifications_user_unread', 'user_id', postgresql_where=text('read_at IS NULL')),
        Index('ix_notifications_action_open', 'action_key',
              postgresql_where=text('resolved_at IS NULL AND action_key IS NOT NULL')),
        Index('ix_notifications_user_pending', 'user_id',
              postgresql_where=text('resolved_at IS NULL AND action_key IS NOT NULL')),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    # Who caused it (shown with name and avatar); null for the administration or the system.
    actor_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    # Validated by app.services.notifications; no CHECK so later phases add types without migrations.
    type: Mapped[str] = mapped_column(String(40))
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Object that asks for an answer (e.g. `invite:42`); null for informative notices. Open until `resolved_at`.
    action_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    action_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

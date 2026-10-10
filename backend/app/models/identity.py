from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class City(Base):
    __tablename__ = 'cities'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(100))
    state: Mapped[str] = mapped_column(String(2))


class User(Base):
    __tablename__ = 'users'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    birth_date: Mapped[date] = mapped_column(Date)
    password_hash: Mapped[str] = mapped_column(String(255))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    avatar_media_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey('media_objects.id', name='fk_users_avatar_media_id_media_objects',
                                      ondelete='SET NULL', use_alter=True), nullable=True
    )
    avatar_media: Mapped['MediaObject | None'] = relationship(foreign_keys=[avatar_media_id])

    @property
    def avatar(self):
        if self.avatar_media is None:
            return None
        return {'id': str(self.avatar_media.id), 'url': f'/api/v1/me/avatar?v={self.avatar_media.id}'}


class MediaObject(Base):
    __tablename__ = 'media_objects'
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    bucket: Mapped[str] = mapped_column(String(63))
    object_key: Mapped[str] = mapped_column(String(200), unique=True)
    content_type: Mapped[str] = mapped_column(String(50))
    size_bytes: Mapped[int]
    width: Mapped[int]
    height: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuthSession(Base):
    __tablename__ = 'auth_sessions'
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SportsProfile(Base):
    __tablename__ = 'sports_profiles'
    __table_args__ = (
        UniqueConstraint('user_id', 'sport', name='uq_profile_user_sport'),
        CheckConstraint("sport IN ('futebol', 'tenis', 'corrida')", name='ck_profile_sport'),
        CheckConstraint("position IS NULL OR (sport = 'futebol' AND position IN "
                        "('goleiro', 'defesa', 'meio_campo', 'atacante'))", name='ck_profile_position'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    sport: Mapped[str] = mapped_column(String(20))
    city_id: Mapped[int] = mapped_column(ForeignKey('cities.id'))
    position: Mapped[str | None] = mapped_column(String(20))
    looking_for: Mapped[bool] = mapped_column(Boolean, default=False)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

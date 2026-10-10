from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
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
    username: Mapped[str] = mapped_column(String(30), unique=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    birth_date: Mapped[date] = mapped_column(Date)
    password_hash: Mapped[str] = mapped_column(String(255))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    social_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    avatar_media_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey('media_objects.id', name='fk_users_avatar_media_id_media_objects',
                                      ondelete='SET NULL', use_alter=True), nullable=True
    )
    avatar_media: Mapped['MediaObject | None'] = relationship(foreign_keys=[avatar_media_id])
    cover_media_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey('media_objects.id', name='fk_users_cover_media_id_media_objects',
                                      ondelete='SET NULL', use_alter=True), nullable=True
    )
    cover_media: Mapped['MediaObject | None'] = relationship(foreign_keys=[cover_media_id])

    @property
    def avatar(self):
        if self.avatar_media is None:
            return None
        return {'id': str(self.avatar_media.id), 'url': f'/api/v1/me/avatar?v={self.avatar_media.id}'}

    @property
    def cover(self):
        if self.cover_media is None:
            return None
        return {'id': str(self.cover_media.id), 'url': f'/api/v1/me/cover?v={self.cover_media.id}'}


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


class Post(Base):
    __tablename__ = 'posts'
    __table_args__ = (Index('ix_posts_created_id', 'created_at', 'id'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    media_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('media_objects.id', ondelete='RESTRICT'), unique=True)
    caption: Mapped[str] = mapped_column(String(2200), default='', nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class PostLike(Base):
    __tablename__ = 'post_likes'
    __table_args__ = (UniqueConstraint('post_id', 'user_id', name='uq_post_like_user'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey('posts.id', ondelete='CASCADE'), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PostComment(Base):
    __tablename__ = 'post_comments'
    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey('posts.id', ondelete='CASCADE'), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    body: Mapped[str] = mapped_column(String(1000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Follow(Base):
    __tablename__ = 'follows'
    __table_args__ = (
        UniqueConstraint('follower_id', 'followed_id', name='uq_follow_pair'),
        CheckConstraint('follower_id <> followed_id', name='ck_follow_not_self'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    follower_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    followed_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class UserBlock(Base):
    __tablename__ = 'user_blocks'
    __table_args__ = (
        UniqueConstraint('blocker_id', 'blocked_id', name='uq_user_block_pair'),
        CheckConstraint('blocker_id <> blocked_id', name='ck_block_not_self'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    blocker_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    blocked_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ContentReport(Base):
    __tablename__ = 'content_reports'
    id: Mapped[int] = mapped_column(primary_key=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    target_type: Mapped[str] = mapped_column(String(20))
    target_id: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(30))
    description: Mapped[str | None] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(20), default='pending', nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ModerationAction(Base):
    __tablename__ = 'moderation_actions'
    id: Mapped[int] = mapped_column(primary_key=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), index=True)
    report_id: Mapped[int | None] = mapped_column(ForeignKey('content_reports.id', ondelete='SET NULL'), nullable=True, index=True)
    target_type: Mapped[str] = mapped_column(String(20))
    target_id: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(30))
    justification: Mapped[str] = mapped_column(Text)
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

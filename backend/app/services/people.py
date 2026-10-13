"""Compact person references and two-way block checks shared by social, teams and notifications."""
from __future__ import annotations

from collections.abc import Iterable

from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models.identity import User, UserBlock
from app.schemas.common import PersonOut


def blocked_between(db: Session, left: int, right: int) -> bool:
    return db.scalar(select(UserBlock.id).where(or_(
        and_(UserBlock.blocker_id == left, UserBlock.blocked_id == right),
        and_(UserBlock.blocker_id == right, UserBlock.blocked_id == left),
    )).limit(1)) is not None


def block_exists(viewer_id: int, other_id_column):
    """EXISTS clause for a block in either direction; use `~block_exists(...)` to exclude."""
    return select(UserBlock.id).where(or_(
        and_(UserBlock.blocker_id == viewer_id, UserBlock.blocked_id == other_id_column),
        and_(UserBlock.blocker_id == other_id_column, UserBlock.blocked_id == viewer_id))).exists()


def blocked_ids(db: Session, viewer_id: int, user_ids: Iterable[int]) -> set[int]:
    """Subset of `user_ids` with a block in either direction with the viewer, in one query."""
    ids = {user_id for user_id in user_ids if user_id != viewer_id}
    if not ids:
        return set()
    rows = db.execute(select(UserBlock.blocker_id, UserBlock.blocked_id).where(or_(
        and_(UserBlock.blocker_id == viewer_id, UserBlock.blocked_id.in_(ids)),
        and_(UserBlock.blocked_id == viewer_id, UserBlock.blocker_id.in_(ids)),
    ))).all()
    return {blocked if blocker == viewer_id else blocker for blocker, blocked in rows}


def avatar_url(user: User) -> str | None:
    return f'/api/v1/users/{user.id}/avatar?v={user.avatar_media_id}' if user.avatar_media_id else None


def person_out(user: User, *, blocked: bool = False) -> PersonOut:
    """Name and @ are visible to members; the avatar is hidden when a block exists."""
    return PersonOut(id=user.id, name=user.name, username=user.username,
                     avatar_url=None if blocked else avatar_url(user))


def people_out(db: Session, viewer: User, user_ids: Iterable[int | None]) -> dict[int, PersonOut]:
    """Compact references of several people in two queries: {user_id: PersonOut}.

    The avatar is hidden for blocks in either direction and for inactive accounts; name and @ stay visible to
    members. Never carries e-mail or sports profiles."""
    ids = {user_id for user_id in user_ids if user_id is not None}
    if not ids:
        return {}
    users = db.scalars(select(User).where(User.id.in_(ids))).all()
    hidden = blocked_ids(db, viewer.id, [user.id for user in users])
    return {user.id: person_out(user, blocked=user.id in hidden or not user.active) for user in users}


def user_search_statement(viewer_id: int, query: str):
    """Active accounts other than the viewer whose name or @ contains `query`, without blocks either way.

    Same rule as GET /users; callers paginate by (User.created_at, User.id).
    """
    term = query.strip().removeprefix('@').strip()
    if not term:
        raise HTTPException(422, 'Informe ao menos um caractere para buscar.')
    pattern = '%' + term.replace('!', '!!').replace('%', '!%').replace('_', '!_') + '%'
    return select(User).where(User.active.is_(True), User.id != viewer_id,
                              or_(User.name.ilike(pattern, escape='!'), User.username.ilike(pattern, escape='!')),
                              ~block_exists(viewer_id, User.id))

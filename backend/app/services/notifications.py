"""In-app notifications. `notify` only adds rows: the caller commits in the same transaction as the change."""
from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.pagination import paginate
from app.models.identity import User, utcnow
from app.models.notifications import Notification
from app.schemas.notifications import NotificationOut
from app.services.people import blocked_ids, person_out

# Type -> payload keys the clients rely on to build the text and navigate (docs/decisoes/0003).
NOTIFICATION_TYPES: dict[str, frozenset[str]] = {
    'convite_time': frozenset({'team_id', 'team_name', 'invite_id'}),
    'convite_aceito': frozenset({'team_id', 'team_name', 'invite_id'}),
    'pedido_entrada': frozenset({'team_id', 'team_name', 'request_id'}),
    'pedido_entrada_decidido': frozenset({'team_id', 'team_name', 'request_id', 'decision'}),
    'removido_do_time': frozenset({'team_id', 'team_name'}),
    'time_encerrado': frozenset({'team_id', 'team_name'}),
    'pedido_organizador_decidido': frozenset({'request_id', 'decision'}),
    'organizador_revogado': frozenset({'reason'}),
}


def _check(type_: str, payload: dict) -> None:
    required = NOTIFICATION_TYPES.get(type_)
    if required is None:
        raise ValueError(f'Tipo de notificação desconhecido: {type_}')
    missing = required - payload.keys()
    if missing:
        raise ValueError(f'Notificação {type_} sem os campos {sorted(missing)}')


def notify(db: Session, user_id: int, type_: str, payload: dict, *, actor_id: int | None = None) -> Notification | None:
    """Queues a notification for `user_id`. Nobody is notified of their own action (returns None)."""
    _check(type_, payload)
    if actor_id is not None and actor_id == user_id:
        return None
    notification = Notification(user_id=user_id, actor_id=actor_id, type=type_, payload=dict(payload),
                                created_at=utcnow())
    db.add(notification)
    return notification


def notify_many(db: Session, user_ids: Iterable[int], type_: str, payload: dict, *,
                actor_id: int | None = None) -> list[Notification]:
    """Same notification for several recipients (e.g. every representative), once per person."""
    _check(type_, payload)
    created = []
    for user_id in dict.fromkeys(user_ids):
        notification = notify(db, user_id, type_, payload, actor_id=actor_id)
        if notification is not None:
            created.append(notification)
    return created


def serialize(db: Session, viewer: User, notifications: list[Notification]) -> list[NotificationOut]:
    """Resolves actors in one query; inactive or blocked actors are shown as null."""
    actor_ids = {item.actor_id for item in notifications if item.actor_id is not None}
    actors = {user.id: user for user in db.scalars(select(User).where(User.id.in_(actor_ids))).all()} if actor_ids else {}
    hidden = blocked_ids(db, viewer.id, actor_ids)
    items = []
    for item in notifications:
        actor = actors.get(item.actor_id)
        visible = actor is not None and actor.active and actor.id not in hidden
        items.append(NotificationOut(id=item.id, type=item.type, payload=item.payload or {},
                                     actor=person_out(actor) if visible else None,
                                     created_at=item.created_at, read_at=item.read_at))
    return items


def list_page(db: Session, viewer: User, cursor: str | None, limit: int) -> tuple[list[NotificationOut], str | None]:
    statement = select(Notification).where(Notification.user_id == viewer.id)
    rows, next_cursor = paginate(statement, cursor, limit, Notification.created_at, Notification.id, db)
    return serialize(db, viewer, rows), next_cursor


def unread_count(db: Session, user_id: int) -> int:
    return db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user_id, Notification.read_at.is_(None))) or 0


def mark_read(db: Session, user_id: int, notification_id: int) -> bool:
    """Marks one of the user's notifications as read (idempotent). False when it is not theirs."""
    notification = db.scalar(select(Notification).where(
        Notification.id == notification_id, Notification.user_id == user_id))
    if notification is None:
        return False
    if notification.read_at is None:
        notification.read_at = utcnow()
    return True


def mark_all_read(db: Session, user_id: int) -> int:
    result = db.execute(update(Notification).where(Notification.user_id == user_id, Notification.read_at.is_(None))
                        .values(read_at=utcnow()))
    return result.rowcount or 0

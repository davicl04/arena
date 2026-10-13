from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import PAGE_DEFAULT, PAGE_MAX
from app.core.security import current_user
from app.models.identity import User
from app.schemas.common import EmptyInput
from app.schemas.notifications import (
    NotificationPage,
    NotificationSummaryOut,
    PendingNotificationsOut,
    UnreadCountOut,
)
from app.services import notifications

router = APIRouter(prefix='/api/v1')

FilterCategory = Literal['partidas', 'times', 'eventos']


@router.get('/me/notifications', response_model=NotificationPage)
def list_notifications(cursor: str | None = None, limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX),
                       categoria: FilterCategory | None = None, pendente: bool | None = None,
                       user: User = Depends(current_user), db: Session = Depends(get_db)):
    items, next_cursor = notifications.list_page(db, user, cursor, limit, category=categoria, pending=pendente)
    return NotificationPage(items=items, next_cursor=next_cursor)


@router.get('/me/notifications/pending', response_model=PendingNotificationsOut)
def list_pending(categoria: FilterCategory | None = None, limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    return PendingNotificationsOut(items=notifications.list_pending(db, user, category=categoria, limit=limit))


@router.get('/me/notifications/summary', response_model=NotificationSummaryOut)
def summary(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return notifications.summary(db, user)


@router.get('/me/notifications/unread-count', response_model=UnreadCountOut)
def unread_count(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return UnreadCountOut(unread_count=notifications.unread_count(db, user.id))


@router.put('/me/notifications/read-all', response_model=NotificationSummaryOut)
def read_all(_: EmptyInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    notifications.mark_all_read(db, user.id)
    db.commit()
    return notifications.summary(db, user)


@router.put('/me/notifications/{notification_id}/read', response_model=NotificationSummaryOut)
def read_one(notification_id: int, _: EmptyInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not notifications.mark_read(db, user.id, notification_id):
        raise HTTPException(404, 'Notificação não encontrada.')
    db.commit()
    return notifications.summary(db, user)

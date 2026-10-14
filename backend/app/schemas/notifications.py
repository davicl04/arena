from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.common import PersonOut


class NotificationOut(BaseModel):
    id: int
    type: str
    category: Literal['partidas', 'times', 'eventos', 'conta']
    payload: dict
    actor: PersonOut | None
    created_at: datetime
    read_at: datetime | None
    pending: bool
    action_until: datetime | None


class NotificationPage(BaseModel):
    items: list[NotificationOut]
    next_cursor: str | None


class PendingNotificationsOut(BaseModel):
    items: list[NotificationOut]
    next_cursor: str | None = None


class UnreadCountOut(BaseModel):
    unread_count: int


class UnreadByCategoryOut(BaseModel):
    partidas: int
    times: int
    eventos: int


class NotificationSummaryOut(BaseModel):
    unread_count: int
    follow_requests_count: int
    pending_count: int
    unread_by_category: UnreadByCategoryOut

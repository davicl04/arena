from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import PersonOut


class NotificationOut(BaseModel):
    id: int
    type: str
    payload: dict
    actor: PersonOut | None
    created_at: datetime
    read_at: datetime | None


class NotificationPage(BaseModel):
    items: list[NotificationOut]
    next_cursor: str | None


class UnreadCountOut(BaseModel):
    unread_count: int

"""Cursor pagination shared by every list endpoint: `{ items, next_cursor }`, newest first."""
from __future__ import annotations

import base64
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import tuple_
from sqlalchemy.orm import Session

PAGE_DEFAULT = 20
PAGE_MAX = 50


def decode_cursor(value: str | None) -> tuple[datetime, int] | None:
    if not value:
        return None
    try:
        raw = base64.urlsafe_b64decode(value + '=' * (-len(value) % 4)).decode()
        stamp, item_id = raw.rsplit('|', 1)
        parsed = datetime.fromisoformat(stamp)
        return parsed, int(item_id)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(422, 'Cursor de paginação inválido.') from None


def encode_cursor(stamp: datetime, item_id: int) -> str:
    raw = f'{stamp.isoformat()}|{item_id}'.encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')


def paginate(statement, cursor: str | None, limit: int, stamp_field, id_field, db: Session):
    """Orders by (stamp, id) descending and returns one page plus the cursor of the next one."""
    point = decode_cursor(cursor)
    if point:
        statement = statement.where(tuple_(stamp_field, id_field) < tuple_(*point))
    statement = statement.order_by(stamp_field.desc(), id_field.desc()).limit(limit + 1)
    rows = list(db.scalars(statement).all())
    more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = encode_cursor(getattr(rows[-1], stamp_field.key), getattr(rows[-1], id_field.key)) if more and rows else None
    return rows, next_cursor

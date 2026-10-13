"""Audit log of decisions (RNF07). `record` only adds the row: the caller commits with the change."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.identity import utcnow


def record(db: Session, *, actor_id: int | None, action: str, target_type: str, target_id: int | None,
           data: dict | None = None) -> AuditLog:
    """`action` is `<domínio>.<evento>` (e.g. `convite.aceito`); `data` holds ids and values, never secrets."""
    if not action or '.' not in action:
        raise ValueError('Ação de auditoria no formato <domínio>.<evento>.')
    entry = AuditLog(actor_id=actor_id, action=action, target_type=target_type, target_id=target_id,
                     data=dict(data or {}), created_at=utcnow())
    db.add(entry)
    return entry

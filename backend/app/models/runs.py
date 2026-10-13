"""Running marks (Jogar, fase 6): one row per run an athlete registers, training or Arena race.

Contract: docs/decisoes/0002-jogar.md, section 18. The ranking of a distance is materialized in `standings`
(`corrida_<km>`) by `services.standings` from the marks of the 52-week window.
"""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, sql_in
from app.models.identity import utcnow
from app.models.rankings import RUN_DISTANCES_KM

RUN_SOURCES = ('treino', 'prova')
# Outer limits of a declared distance; the pace limits of `services.run_rules` are stricter and live in the service.
MIN_DISTANCE_M = 1000
MAX_DISTANCE_M = 100_000
MAX_DURATION_S = 86_400


class Run(Base):
    """A mark: distance in meters, duration in seconds and the day it was run.

    `standard_distance_km` is the standard distance (3, 5, 10, 21 or 42 km) the declared distance counts for after
    the ±2% tolerance, or NULL when it falls outside every tolerance and stays in the history only. Every mark is
    self-declared (RN17), so `verified` is false; only a mark of an Arena race could be verified later.
    """
    __tablename__ = 'runs'
    __table_args__ = (
        CheckConstraint(sql_in('source', RUN_SOURCES), name='ck_runs_source'),
        CheckConstraint(f'distance_m BETWEEN {MIN_DISTANCE_M} AND {MAX_DISTANCE_M}', name='ck_runs_distance'),
        CheckConstraint(f'duration_s BETWEEN 1 AND {MAX_DURATION_S}', name='ck_runs_duration'),
        CheckConstraint(f"standard_distance_km IS NULL OR standard_distance_km IN "
                        f"({', '.join(map(str, RUN_DISTANCES_KM))})", name='ck_runs_standard'),
        # A race mark hangs on the athlete's entry and always has a standard distance (the race distance).
        CheckConstraint("(source = 'prova') = (event_entry_id IS NOT NULL) AND "
                        "(source <> 'prova' OR standard_distance_km IS NOT NULL)", name='ck_runs_origin'),
        # A training mark is never verified (no proof is requested).
        CheckConstraint("source = 'prova' OR NOT verified", name='ck_runs_verified'),
        Index('ix_runs_user_history', 'user_id', 'ran_on', 'id'),
        Index('ix_runs_ranking', 'standard_distance_km', 'ran_on', 'user_id'),
        # One mark per entry in an Arena race.
        Index('uq_runs_entry', 'event_entry_id', unique=True, postgresql_where=text('event_entry_id IS NOT NULL')),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    distance_m: Mapped[int] = mapped_column(Integer)
    duration_s: Mapped[int] = mapped_column(Integer)
    ran_on: Mapped[date] = mapped_column(Date)
    source: Mapped[str] = mapped_column(String(10))
    event_entry_id: Mapped[int | None] = mapped_column(ForeignKey('event_entries.id'), nullable=True)
    standard_distance_km: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text('false'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

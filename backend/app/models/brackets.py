"""Championship brackets, decisions of the organizer and final placements (Times e campeonatos, fases 6 e 7).

Contracts in docs/decisoes/0003-times-campeonatos.md (section 21) and docs/decisoes/0002-jogar.md (section 17). The
matches themselves live in `matches` (`origin = 'campeonato'`, event, round, bracket position and next match); this
module keeps the draw before the matches exist, the decision that settles a divergence and the placements that give
the tennis bonus (RN16).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, SmallInteger, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, sql_in
from app.models.events import COMPETITION_TYPES
from app.models.identity import utcnow

BRACKET_STATES = ('sorteado', 'confirmado')
DECISION_KINDS = ('divergencia', 'prazo', 'wo')


class EventBracket(Base):
    """The draw of an event, one row per event: seed, places and swaps until the organizer confirms it.

    `slots` is the plan in order: for single elimination, places `2i` and `2i+1` meet in the first round and a
    `null` is a bye; for round robin, the order fed to the circle method. The seed rebuilds the draw and `swaps`
    (pairs of places) rebuild the manual changes, so the plan can be audited from the seed."""
    __tablename__ = 'event_brackets'
    __table_args__ = (
        CheckConstraint(sql_in('kind', COMPETITION_TYPES), name='ck_event_brackets_kind'),
        CheckConstraint(sql_in('state', BRACKET_STATES), name='ck_event_brackets_state'),
        CheckConstraint('size BETWEEN 2 AND 32 AND draw_count >= 1', name='ck_event_brackets_size'),
        CheckConstraint("(state = 'confirmado') = (confirmed_at IS NOT NULL)", name='ck_event_brackets_confirmed'),
        Index('uq_event_brackets_event', 'event_id', unique=True),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey('events.id', ondelete='CASCADE'))
    kind: Mapped[str] = mapped_column(String(20))
    state: Mapped[str] = mapped_column(String(10), default='sorteado')
    seed: Mapped[int] = mapped_column(BigInteger)
    # Elimination: places of the bracket (a power of two); round robin: number of entries.
    size: Mapped[int] = mapped_column(SmallInteger)
    slots: Mapped[list] = mapped_column(JSONB)
    swaps: Mapped[list] = mapped_column(JSONB, default=list)
    draw_count: Mapped[int] = mapped_column(SmallInteger, default=1)
    drawn_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    drawn_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    confirmed_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ResultDecision(Base):
    """The organizer settled a championship match (RN09): a divergence, the 48 h passed without a result, or a W.O.

    One per match. The justification is registered here, in the audit log and on the match, where both teams read it;
    `reports` keeps the scores the two sides had informed when the organizer decided."""
    __tablename__ = 'result_decisions'
    __table_args__ = (
        CheckConstraint(sql_in('kind', DECISION_KINDS), name='ck_result_decisions_kind'),
        CheckConstraint('char_length(justification) BETWEEN 5 AND 500', name='ck_result_decisions_justification'),
        CheckConstraint('score_a BETWEEN 0 AND 99 AND score_b BETWEEN 0 AND 99', name='ck_result_decisions_score'),
        CheckConstraint("winner_side IS NULL OR winner_side IN ('a', 'b')", name='ck_result_decisions_winner'),
        CheckConstraint("(kind = 'wo') = (walkover_absent_side IS NOT NULL) AND "
                        "(walkover_absent_side IS NULL OR walkover_absent_side IN ('a', 'b'))",
                        name='ck_result_decisions_walkover'),
        Index('uq_result_decisions_match', 'match_id', unique=True),
        Index('ix_result_decisions_event', 'event_id', 'created_at'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey('matches.id', ondelete='CASCADE'))
    event_id: Mapped[int] = mapped_column(ForeignKey('events.id', ondelete='CASCADE'))
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    kind: Mapped[str] = mapped_column(String(12))
    score_a: Mapped[int] = mapped_column(SmallInteger)
    score_b: Mapped[int] = mapped_column(SmallInteger)
    sets: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    winner_side: Mapped[str | None] = mapped_column(String(1), nullable=True)
    walkover_absent_side: Mapped[str | None] = mapped_column(String(1), nullable=True)
    justification: Mapped[str] = mapped_column(String(500))
    # Scores informed by each side before the decision: {"a": {"score_a", "score_b"}, "b": {...}} (may be empty).
    reports: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class EventPlacement(Base):
    """Final placement of an entry when the event ends (champion 1st, runner-up 2nd, semifinalists 3rd, or the
    position in the round robin table) and the tennis bonus it earns (RN16); the tennis ranking adds the bonus."""
    __tablename__ = 'event_placements'
    __table_args__ = (
        CheckConstraint('placement >= 1 AND bonus_points >= 0', name='ck_event_placements_values'),
        CheckConstraint('(team_id IS NULL) <> (user_id IS NULL)', name='ck_event_placements_subject'),
        Index('uq_event_placements_entry', 'event_id', 'entry_id', unique=True),
        Index('ix_event_placements_bonus', 'user_id', 'awarded_at', postgresql_where=text('bonus_points > 0')),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey('events.id', ondelete='CASCADE'))
    entry_id: Mapped[int] = mapped_column(ForeignKey('event_entries.id', ondelete='CASCADE'))
    team_id: Mapped[int | None] = mapped_column(ForeignKey('teams.id', ondelete='CASCADE'), nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=True)
    placement: Mapped[int] = mapped_column(SmallInteger)
    bonus_points: Mapped[int] = mapped_column(SmallInteger, default=0)
    awarded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

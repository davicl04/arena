"""Matchmaking queue, matches, terms, courts, slots for walk-ins, chat, results and football stats (stage 3).

Jogar, fases 2 a 5. Contracts in docs/decisoes/0002-jogar.md (sections 7 to 14). The search table is the
queue: each active row waits for a compatible one and the order comes from the query. Championship matches
(Times e campeonatos, fases 6 e 7) reuse `matches` with `origin = 'campeonato'`, the event, the round, the bracket
position and the next match; their sides may still be unknown, so a match has zero to two side rows.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, sql_in
from app.models.identity import utcnow
from app.models.rankings import FOOTBALL_FORMATS, TIERS
from app.models.teams import POSITIONS

MATCH_SPORTS = ('futebol', 'tenis')
SIDES = ('a', 'b')

SEARCH_KINDS = ('time', 'tenis', 'avulso')
SEARCH_STATES = ('ativa', 'pareada', 'concluida', 'cancelada', 'expirada', 'recusada', 'sem_resposta')
# Waiting in the queue ('ativa') or held by a proposal or slot offer ('pareada'): one per subject and sport.
OPEN_SEARCH_STATES = ('ativa', 'pareada')

MATCH_ORIGINS = ('amistoso', 'campeonato')
MATCH_STATES = ('proposta', 'recusada', 'expirada', 'combinando', 'agendada', 'realizada', 'encerrada',
                'sem_resultado', 'cancelada')
# States that end the match for good: the chat turns read-only and walk-ins lose access.
CLOSED_MATCH_STATES = ('recusada', 'expirada', 'encerrada', 'sem_resultado', 'cancelada')
# A confirmed final score exists: these matches count in the rankings.
SCORED_MATCH_STATES = ('realizada', 'encerrada')
RESULT_SOURCES = ('confirmacao', 'wo', 'organizador', 'administracao')
WALKOVER_DECISIONS = ('mantido', 'anulado')

TERMS_STATES = ('pendente', 'aceita', 'substituida', 'cancelada')
COURT_KINDS = ('futsal', 'society', 'campo', 'tenis')
COURT_STATES = ('publicada', 'em_revisao', 'rejeitada')
SLOT_STATES = ('aberta', 'oferecida', 'preenchida', 'fechada')
MESSAGE_KINDS = ('texto', 'evento')
STAT_STATES = ('enviada', 'revisada', 'contestada')
STAT_FIELDS = ('gols', 'assistencias', 'estatistica_posicao')


def _array_in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} <@ ARRAY[{', '.join(repr(value) for value in values)}]::varchar[]"


class Court(Base):
    """Catalog per city (RN07). A suggestion stays 'em_revisao' and is usable only in the match that made it."""
    __tablename__ = 'courts'
    __table_args__ = (
        CheckConstraint(sql_in('kind', COURT_KINDS), name='ck_courts_kind'),
        CheckConstraint(sql_in('state', COURT_STATES), name='ck_courts_state'),
        CheckConstraint('char_length(name) BETWEEN 2 AND 80', name='ck_courts_name_length'),
        CheckConstraint("(state = 'publicada') = (published_at IS NOT NULL)", name='ck_courts_published'),
        # A decision (publish or reject) has its moment; a rejection has a reason or the duplicate it repeats.
        CheckConstraint("(state = 'em_revisao') = (reviewed_at IS NULL)", name='ck_courts_reviewed'),
        CheckConstraint("state <> 'rejeitada' OR review_reason IS NOT NULL OR duplicate_of_id IS NOT NULL",
                        name='ck_courts_rejection'),
        CheckConstraint("duplicate_of_id IS NULL OR state = 'rejeitada'", name='ck_courts_duplicate'),
        # Two published courts never share city, kind and normalized name (duplicate guard of the review).
        Index('uq_courts_published_name', 'city_id', 'kind', 'name_key', unique=True,
              postgresql_where=text("state = 'publicada'")),
        Index('ix_courts_city_state', 'city_id', 'state', 'name_key'),
        Index('ix_courts_review_queue', 'created_at', 'id', postgresql_where=text("state = 'em_revisao'")),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    city_id: Mapped[int] = mapped_column(ForeignKey('cities.id'))
    name: Mapped[str] = mapped_column(String(80))
    # Lowercase, accentless and single-spaced name, used for duplicate detection and search.
    name_key: Mapped[str] = mapped_column(String(80))
    address: Mapped[str | None] = mapped_column(String(160), nullable=True)
    kind: Mapped[str] = mapped_column(String(10))
    state: Mapped[str] = mapped_column(String(12))
    suggested_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    # Match that suggested it: the only place where it may be used while under review.
    origin_match_id: Mapped[int | None] = mapped_column(
        ForeignKey('matches.id', name='fk_courts_origin_match_id_matches', ondelete='SET NULL', use_alter=True),
        nullable=True, index=True)
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_reason: Mapped[str | None] = mapped_column(String(300), nullable=True)
    duplicate_of_id: Mapped[int | None] = mapped_column(ForeignKey('courts.id', ondelete='SET NULL'), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Match(Base):
    """Friendly found by the queue ('amistoso') or championship match ('campeonato', stage 4).

    The agreed terms (start, court, who books) are copied here when both sides accept them; the final score
    is stored once confirmed (equal reports, walkover or a decision) and drives the rankings.
    """
    __tablename__ = 'matches'
    __table_args__ = (
        CheckConstraint(sql_in('sport', MATCH_SPORTS), name='ck_matches_sport'),
        CheckConstraint(f"format IS NULL OR {sql_in('format', FOOTBALL_FORMATS)}", name='ck_matches_format'),
        CheckConstraint("(sport = 'futebol') = (format IS NOT NULL)", name='ck_matches_category'),
        CheckConstraint(sql_in('origin', MATCH_ORIGINS), name='ck_matches_origin'),
        CheckConstraint(sql_in('state', MATCH_STATES), name='ck_matches_state'),
        CheckConstraint("(origin = 'campeonato') = (event_id IS NOT NULL) AND (origin = 'campeonato' OR "
                        "(round_number IS NULL AND bracket_position IS NULL AND next_match_id IS NULL))",
                        name='ck_matches_event'),
        CheckConstraint("next_match_side IS NULL OR (next_match_id IS NOT NULL AND next_match_side IN ('a', 'b'))",
                        name='ck_matches_next'),
        CheckConstraint("(state <> 'proposta' OR proposal_expires_at IS NOT NULL) AND "
                        "(proposal_expires_at IS NULL OR origin = 'amistoso')", name='ck_matches_proposal'),
        CheckConstraint("state NOT IN ('agendada', 'realizada', 'encerrada', 'sem_resultado') OR "
                        "starts_at IS NOT NULL", name='ck_matches_scheduled'),
        CheckConstraint('(starts_at IS NULL) = (result_deadline IS NULL) AND '
                        '(result_deadline IS NULL OR result_deadline > starts_at)', name='ck_matches_deadline'),
        CheckConstraint("booking_side IS NULL OR booking_side IN ('a', 'b')", name='ck_matches_booking_side'),
        CheckConstraint('booking_confirmed_at IS NULL OR booking_side IS NOT NULL', name='ck_matches_booking'),
        CheckConstraint("super_tiebreak IS NULL OR sport = 'tenis'", name='ck_matches_super_tiebreak'),
        # The final score exists exactly in the scored states; tennis always has a winner and the sets.
        CheckConstraint(f"(result_confirmed_at IS NOT NULL) = ({sql_in('state', SCORED_MATCH_STATES)}) AND "
                        "(result_confirmed_at IS NULL) = (score_a IS NULL) AND (score_a IS NULL) = (score_b IS NULL) "
                        "AND (score_a IS NULL) = (result_source IS NULL)", name='ck_matches_result'),
        CheckConstraint("score_a IS NULL OR (score_a BETWEEN 0 AND 99 AND score_b BETWEEN 0 AND 99)",
                        name='ck_matches_score_range'),
        CheckConstraint(f"result_source IS NULL OR {sql_in('result_source', RESULT_SOURCES)}",
                        name='ck_matches_result_source'),
        CheckConstraint("winner_side IS NULL OR winner_side IN ('a', 'b')", name='ck_matches_winner'),
        CheckConstraint("sport <> 'tenis' OR score_a IS NULL OR (winner_side IS NOT NULL AND sets IS NOT NULL)",
                        name='ck_matches_tennis_result'),
        CheckConstraint("result_source IS NULL OR result_source NOT IN ('organizador', 'administracao') OR "
                        "(result_decided_at IS NOT NULL AND result_decision_reason IS NOT NULL)",
                        name='ck_matches_result_decision'),
        # Walkover: the absent side, who registered it and when; then an optional contest and its decision.
        CheckConstraint("walkover_absent_side IS NULL OR walkover_absent_side IN ('a', 'b')",
                        name='ck_matches_walkover_side'),
        CheckConstraint('(walkover_absent_side IS NULL) = (walkover_registered_at IS NULL) AND '
                        '(walkover_contested_at IS NULL OR walkover_registered_at IS NOT NULL) AND '
                        '(walkover_contested_at IS NULL) = (walkover_contest_reason IS NULL) AND '
                        '(walkover_decision IS NULL OR walkover_contested_at IS NOT NULL) AND '
                        '(walkover_decision IS NULL) = (walkover_decided_at IS NULL) AND '
                        '(walkover_decision IS NULL) = (walkover_decision_reason IS NULL)', name='ck_matches_walkover'),
        CheckConstraint(f"walkover_decision IS NULL OR {sql_in('walkover_decision', WALKOVER_DECISIONS)}",
                        name='ck_matches_walkover_decision'),
        CheckConstraint("(state = 'cancelada') = (cancelled_at IS NOT NULL)", name='ck_matches_cancelled'),
        CheckConstraint(f"(closed_at IS NOT NULL) = ({sql_in('state', CLOSED_MATCH_STATES)})",
                        name='ck_matches_closed'),
        Index('ix_matches_proposals_due', 'proposal_expires_at', postgresql_where=text("state = 'proposta'")),
        Index('ix_matches_results_due', 'result_deadline', postgresql_where=text("state IN ('agendada', 'realizada')")),
        Index('ix_matches_city_state_start', 'city_id', 'state', 'starts_at'),
        Index('ix_matches_court_start', 'court_id', 'starts_at',
              postgresql_where=text("state IN ('agendada', 'realizada', 'encerrada')")),
        Index('ix_matches_event', 'event_id', 'round_number', 'bracket_position',
              postgresql_where=text('event_id IS NOT NULL')),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    sport: Mapped[str] = mapped_column(String(10))
    format: Mapped[str | None] = mapped_column(String(10), nullable=True)
    city_id: Mapped[int] = mapped_column(ForeignKey('cities.id'))
    origin: Mapped[str] = mapped_column(String(12), default='amistoso')
    # Championship (stage 4): the event, the round (or phase), the bracket position and where the winner goes.
    event_id: Mapped[int | None] = mapped_column(ForeignKey('events.id', ondelete='RESTRICT'), nullable=True)
    round_number: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    bracket_position: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    next_match_id: Mapped[int | None] = mapped_column(ForeignKey('matches.id', ondelete='SET NULL'), nullable=True)
    next_match_side: Mapped[str | None] = mapped_column(String(1), nullable=True)
    state: Mapped[str] = mapped_column(String(15))
    # Friendly proposals: both representatives accept within 2 h.
    proposal_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Agreed terms (copied from the accepted match_terms row).
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    court_id: Mapped[int | None] = mapped_column(ForeignKey('courts.id', ondelete='SET NULL'), nullable=True)
    booking_side: Mapped[str | None] = mapped_column(String(1), nullable=True)
    # RN08: the Arena only records the booking state; the booking itself happens with the venue.
    booking_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    booking_confirmed_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'),
                                                                nullable=True)
    # Tennis: the third set is replaced by a super tie-break (agreed in the terms).
    super_tiebreak: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # Start + 48 h: last moment for scores, attendance, stats, reviews and contests.
    result_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Final result: goals (football) or sets won (tennis) per side; winner null is a football draw.
    score_a: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    score_b: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    sets: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    winner_side: Mapped[str | None] = mapped_column(String(1), nullable=True)
    result_source: Mapped[str | None] = mapped_column(String(15), nullable=True)
    result_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Decision of a divergence (organizer, stage 4) or of a contested walkover (administration).
    result_decided_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    result_decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result_decision_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    walkover_absent_side: Mapped[str | None] = mapped_column(String(1), nullable=True)
    walkover_registered_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'),
                                                                  nullable=True)
    walkover_registered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    walkover_contested_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'),
                                                                 nullable=True)
    walkover_contested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    walkover_contest_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    walkover_decision: Mapped[str | None] = mapped_column(String(10), nullable=True)
    walkover_decided_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'),
                                                               nullable=True)
    walkover_decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    walkover_decision_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(String(300), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class MatchSlot(Base):
    """Spot for a walk-in athlete in one side of a scheduled match (RN06); filled atomically."""
    __tablename__ = 'match_slots'
    __table_args__ = (
        CheckConstraint("side IN ('a', 'b')", name='ck_match_slots_side'),
        CheckConstraint(sql_in('position', POSITIONS), name='ck_match_slots_position'),
        CheckConstraint(sql_in('state', SLOT_STATES), name='ck_match_slots_state'),
        CheckConstraint('(filled_by_id IS NULL) = (filled_at IS NULL) AND '
                        "(state <> 'preenchida' OR (filled_by_id IS NOT NULL AND removed_at IS NULL)) AND "
                        "(state NOT IN ('aberta', 'oferecida') OR filled_by_id IS NULL)", name='ck_match_slots_filled'),
        CheckConstraint("removed_at IS NULL OR (filled_by_id IS NOT NULL AND state = 'fechada')",
                        name='ck_match_slots_removed'),
        CheckConstraint("(state = 'fechada') = (closed_at IS NOT NULL)", name='ck_match_slots_closed'),
        # A walk-in fills at most one spot per match.
        Index('uq_match_slots_filled_user', 'match_id', 'filled_by_id', unique=True,
              postgresql_where=text("state = 'preenchida'")),
        Index('ix_match_slots_match_side', 'match_id', 'side', 'state'),
        Index('ix_match_slots_open', 'position', 'opened_at', 'id', postgresql_where=text("state = 'aberta'")),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey('matches.id', ondelete='CASCADE'))
    side: Mapped[str] = mapped_column(String(1))
    position: Mapped[str] = mapped_column(String(20))
    state: Mapped[str] = mapped_column(String(10))
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    filled_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=True)
    filled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # A representative removed the walk-in: the row is closed and kept as history.
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    removed_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MatchSearch(Base):
    """One search: a team (football with my team), a tennis player or a walk-in athlete (football, any format).

    `ativa` rows are the queue. Pairing moves both searches to `pareada` (out of the queue) in the transaction that
    creates the proposal; a walk-in becomes `pareada` with a slot offer. When the other side declines or lets the
    proposal expire, the same row returns to `ativa` with its original `expires_at`.
    """
    __tablename__ = 'match_searches'
    __table_args__ = (
        CheckConstraint(sql_in('sport', MATCH_SPORTS), name='ck_match_searches_sport'),
        CheckConstraint(sql_in('kind', SEARCH_KINDS), name='ck_match_searches_kind'),
        CheckConstraint(sql_in('state', SEARCH_STATES), name='ck_match_searches_state'),
        CheckConstraint('(team_id IS NULL) <> (user_id IS NULL)', name='ck_match_searches_subject'),
        CheckConstraint(f"format IS NULL OR {sql_in('format', FOOTBALL_FORMATS)}", name='ck_match_searches_format'),
        CheckConstraint(f"position IS NULL OR {sql_in('position', POSITIONS)}", name='ck_match_searches_position'),
        CheckConstraint(f"tier IS NULL OR {sql_in('tier', TIERS)}", name='ck_match_searches_tier'),
        # Team: football, a format and declared slots. Tennis: the athlete. Walk-in: the athlete, any format.
        CheckConstraint(
            "(kind = 'time' AND sport = 'futebol' AND team_id IS NOT NULL AND format IS NOT NULL AND position IS NULL "
            "AND open_slots IS NOT NULL) OR "
            "(kind = 'tenis' AND sport = 'tenis' AND user_id IS NOT NULL AND format IS NULL AND position IS NULL "
            "AND open_slots IS NULL) OR "
            "(kind = 'avulso' AND sport = 'futebol' AND user_id IS NOT NULL AND format IS NULL AND open_slots IS NULL "
            "AND tier IS NULL)", name='ck_match_searches_category'),
        CheckConstraint('expires_at > started_at', name='ck_match_searches_window'),
        CheckConstraint(f"(ended_at IS NULL) = ({sql_in('state', OPEN_SEARCH_STATES)})", name='ck_match_searches_ended'),
        # 'pareada' holds either a proposal (team, tennis) or a slot offer with its deadline (walk-in).
        CheckConstraint("state <> 'pareada' OR (kind <> 'avulso' AND match_id IS NOT NULL) OR "
                        "(kind = 'avulso' AND slot_id IS NOT NULL AND offer_expires_at IS NOT NULL)",
                        name='ck_match_searches_paired'),
        CheckConstraint("(slot_id IS NULL OR kind = 'avulso') AND (offer_expires_at IS NULL OR slot_id IS NOT NULL)",
                        name='ck_match_searches_offer'),
        Index('uq_match_searches_team_open', 'team_id', 'sport', unique=True,
              postgresql_where=text("team_id IS NOT NULL AND state IN ('ativa', 'pareada')")),
        Index('uq_match_searches_user_open', 'user_id', 'sport', unique=True,
              postgresql_where=text("user_id IS NOT NULL AND state IN ('ativa', 'pareada')")),
        # One pending offer per slot.
        Index('uq_match_searches_slot_offer', 'slot_id', unique=True, postgresql_where=text("state = 'pareada'")),
        Index('ix_match_searches_queue', 'kind', 'city_id', 'format', 'started_at', 'id',
              postgresql_where=text("state = 'ativa'")),
        Index('ix_match_searches_due', 'expires_at', postgresql_where=text("state = 'ativa'")),
        Index('ix_match_searches_offers_due', 'offer_expires_at',
              postgresql_where=text("state = 'pareada' AND offer_expires_at IS NOT NULL")),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    sport: Mapped[str] = mapped_column(String(10))
    kind: Mapped[str] = mapped_column(String(10))
    city_id: Mapped[int] = mapped_column(ForeignKey('cities.id'))
    # Team searches only; walk-ins accept any format and tennis has none.
    format: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Walk-in only; null is "any position".
    position: Mapped[str | None] = mapped_column(String(20), nullable=True)
    team_id: Mapped[int | None] = mapped_column(ForeignKey('teams.id', ondelete='CASCADE'), nullable=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=True, index=True)
    # Who started it (the representative, or the athlete).
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    # Tier when searching (team in the format, or tennis); null while in placement. Walk-ins are compared per
    # slot (position × format of the slot), so they keep null here.
    tier: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Spots for walk-ins declared by the team, per position ({} when the team is complete).
    open_slots: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    state: Mapped[str] = mapped_column(String(15), default='ativa')
    # Current proposal (pareada) or the match it became (concluida); history stays in match_sides.search_id.
    match_id: Mapped[int | None] = mapped_column(ForeignKey('matches.id'), nullable=True, index=True)
    # Walk-in offer: the held slot and when the offer lapses.
    slot_id: Mapped[int | None] = mapped_column(ForeignKey('match_slots.id'), nullable=True)
    offer_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Original start (elapsed time on the button and queue seniority) and the 24 h limit, kept when requeued.
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class MatchSide(Base):
    """Side A or B: a team or an athlete (tennis), never both; the same subject never plays both sides."""
    __tablename__ = 'match_sides'
    __table_args__ = (
        CheckConstraint("side IN ('a', 'b')", name='ck_match_sides_side'),
        CheckConstraint('(team_id IS NULL) <> (user_id IS NULL)', name='ck_match_sides_subject'),
        CheckConstraint(f"tier IS NULL OR {sql_in('tier', TIERS)}", name='ck_match_sides_tier'),
        CheckConstraint('accepted_at IS NULL OR declined_at IS NULL', name='ck_match_sides_answer'),
        UniqueConstraint('match_id', 'side', name='uq_match_sides_side'),
        Index('uq_match_sides_team', 'match_id', 'team_id', unique=True, postgresql_where=text('team_id IS NOT NULL')),
        Index('uq_match_sides_user', 'match_id', 'user_id', unique=True, postgresql_where=text('user_id IS NOT NULL')),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey('matches.id', ondelete='CASCADE'))
    side: Mapped[str] = mapped_column(String(1))
    team_id: Mapped[int | None] = mapped_column(ForeignKey('teams.id', ondelete='CASCADE'), nullable=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=True, index=True)
    search_id: Mapped[int | None] = mapped_column(ForeignKey('match_searches.id', ondelete='SET NULL'), nullable=True)
    # Tier at pairing time (team in the format, or the tennis player); null while in placement.
    tier: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Walk-in spots declared when searching; they open as match_slots when the match is scheduled.
    declared_slots: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    declined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    declined_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MatchTerms(Base):
    """Proposed terms (start, court, who books). Only one pending proposal and one accepted set per match."""
    __tablename__ = 'match_terms'
    __table_args__ = (
        CheckConstraint(sql_in('state', TERMS_STATES), name='ck_match_terms_state'),
        CheckConstraint("proposed_by_side IS NULL OR proposed_by_side IN ('a', 'b')", name='ck_match_terms_side'),
        CheckConstraint("booking_side IN ('a', 'b')", name='ck_match_terms_booking_side'),
        # The proposing side accepts on proposing; accepted terms carry both acceptances.
        CheckConstraint("(proposed_by_side IS DISTINCT FROM 'a' OR accepted_a_at IS NOT NULL) AND "
                        "(proposed_by_side IS DISTINCT FROM 'b' OR accepted_b_at IS NOT NULL)",
                        name='ck_match_terms_proposer'),
        CheckConstraint("state <> 'aceita' OR proposed_by_side IS NULL OR "
                        "(accepted_a_at IS NOT NULL AND accepted_b_at IS NOT NULL)", name='ck_match_terms_accepted'),
        CheckConstraint("(state = 'pendente') = (decided_at IS NULL)", name='ck_match_terms_decided'),
        Index('uq_match_terms_pending', 'match_id', unique=True, postgresql_where=text("state = 'pendente'")),
        Index('uq_match_terms_accepted', 'match_id', unique=True, postgresql_where=text("state = 'aceita'")),
        Index('ix_match_terms_match_created', 'match_id', 'created_at', 'id'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey('matches.id', ondelete='CASCADE'))
    # Representative who proposed and their side; null side for terms set by the organizer (stage 4).
    proposed_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    proposed_by_side: Mapped[str | None] = mapped_column(String(1), nullable=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    court_id: Mapped[int] = mapped_column(ForeignKey('courts.id', ondelete='RESTRICT'), index=True)
    booking_side: Mapped[str] = mapped_column(String(1))
    super_tiebreak: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    state: Mapped[str] = mapped_column(String(12), default='pendente')
    accepted_a_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_a_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    accepted_b_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_b_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MatchLineup(Base):
    """Appearance of an athlete (RN03): side, team, walk-in flag, position played and attendance."""
    __tablename__ = 'match_lineups'
    __table_args__ = (
        CheckConstraint("side IN ('a', 'b')", name='ck_match_lineups_side'),
        CheckConstraint(f"position IS NULL OR {sql_in('position', POSITIONS)}", name='ck_match_lineups_position'),
        CheckConstraint('removed_at IS NULL OR guest', name='ck_match_lineups_removed'),
        # RN02: an athlete plays for one side only in a match.
        UniqueConstraint('match_id', 'user_id', name='uq_match_lineups_user'),
        Index('ix_match_lineups_match_side', 'match_id', 'side'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey('matches.id', ondelete='CASCADE'))
    side: Mapped[str] = mapped_column(String(1))
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    # Team the athlete represented (the side's team); walk-ins play for it as guests of that match only.
    team_id: Mapped[int | None] = mapped_column(ForeignKey('teams.id', ondelete='SET NULL'), nullable=True)
    guest: Mapped[bool] = mapped_column(Boolean, default=False)
    slot_id: Mapped[int | None] = mapped_column(ForeignKey('match_slots.id', ondelete='SET NULL'), nullable=True)
    position: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Null until informed; the athlete's own stats mark it true and the representative's attendance decides.
    present: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    present_marked_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'),
                                                             nullable=True)
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class MatchMessage(Base):
    """Group chat of both rosters (and walk-ins until the end); match events appear as banners ('evento')."""
    __tablename__ = 'match_messages'
    __table_args__ = (
        CheckConstraint(sql_in('kind', MESSAGE_KINDS), name='ck_match_messages_kind'),
        CheckConstraint("side IS NULL OR side IN ('a', 'b')", name='ck_match_messages_side'),
        CheckConstraint('char_length(body) BETWEEN 1 AND 1000', name='ck_match_messages_body'),
        CheckConstraint("(kind = 'evento') = (event_type IS NOT NULL)", name='ck_match_messages_event'),
        CheckConstraint("removed_at IS NULL OR kind = 'texto'", name='ck_match_messages_removed'),
        Index('ix_match_messages_match_id', 'match_id', 'id'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey('matches.id', ondelete='CASCADE'))
    author_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    # Author's side when writing (or the side an event refers to, for the crest of the banner).
    side: Mapped[str | None] = mapped_column(String(1), nullable=True)
    kind: Mapped[str] = mapped_column(String(10))
    # Event banners: the kind of event (validated in the service, no CHECK, so later phases add kinds).
    event_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # Text written by the author or generated for the event banner.
    body: Mapped[str] = mapped_column(String(1000))
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Moderation (ContentReport with target_type 'match_message'): hidden for everyone, kept for the record.
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    removed_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MatchResult(Base):
    """Score reported by one side; the result is confirmed when both sides report the same score."""
    __tablename__ = 'match_results'
    __table_args__ = (
        CheckConstraint("side IN ('a', 'b')", name='ck_match_results_side'),
        CheckConstraint('score_a BETWEEN 0 AND 99 AND score_b BETWEEN 0 AND 99', name='ck_match_results_score'),
        UniqueConstraint('match_id', 'side', name='uq_match_results_side'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey('matches.id', ondelete='CASCADE'))
    side: Mapped[str] = mapped_column(String(1))
    reported_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    # Goals of side A and side B (football) or sets won (tennis), always from the match's point of view.
    score_a: Mapped[int] = mapped_column(SmallInteger)
    score_b: Mapped[int] = mapped_column(SmallInteger)
    # Tennis: [{"a": 6, "b": 4, "tiebreak": null, "super_tiebreak": false}, ...]
    sets: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class FootballStat(Base):
    """Optional stats of an appearance (RN10, RN13): reviewed by the own side, contestable by the opponent."""
    __tablename__ = 'football_stats'
    __table_args__ = (
        CheckConstraint(sql_in('state', STAT_STATES), name='ck_football_stats_state'),
        CheckConstraint('(goals IS NULL OR goals BETWEEN 0 AND 50) AND (assists IS NULL OR assists BETWEEN 0 AND 50) '
                        'AND (position_stat IS NULL OR position_stat BETWEEN 0 AND 50)', name='ck_football_stats_range'),
        CheckConstraint("state <> 'revisada' OR reviewed_at IS NOT NULL", name='ck_football_stats_reviewed'),
        CheckConstraint("(contested_at IS NULL) = (contest_reason IS NULL) AND (contested_at IS NULL) = "
                        "(contested_fields IS NULL) AND (state <> 'contestada' OR contested_at IS NOT NULL)",
                        name='ck_football_stats_contest'),
        CheckConstraint(f"contested_fields IS NULL OR (cardinality(contested_fields) >= 1 AND "
                        f"{_array_in('contested_fields', STAT_FIELDS)})", name='ck_football_stats_fields'),
        UniqueConstraint('lineup_id', name='uq_football_stats_lineup'),
        UniqueConstraint('match_id', 'user_id', name='uq_football_stats_match_user'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    lineup_id: Mapped[int] = mapped_column(ForeignKey('match_lineups.id', ondelete='CASCADE'))
    match_id: Mapped[int] = mapped_column(ForeignKey('matches.id', ondelete='CASCADE'))
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    # Empty fields neither add nor subtract (RN10); the position-specific stat depends on the lineup position.
    goals: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    assists: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    position_stat: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    state: Mapped[str] = mapped_column(String(12), default='enviada')
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    # One contest per stat by the opposing representative: the contested items count only after a new review.
    contested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    contested_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    contest_reason: Mapped[str | None] = mapped_column(String(300), nullable=True)
    contested_fields: Mapped[list[str] | None] = mapped_column(ARRAY(String(20)), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

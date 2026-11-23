"""Versioned tier cuts and the materialized, Arena-wide standings (Jogar, fase 1)."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, sql_in
from app.models.identity import utcnow
from app.models.teams import POSITIONS

RANKINGS = ('futebol_time', 'futebol_individual', 'tenis', 'corrida_3', 'corrida_5', 'corrida_10', 'corrida_21',
            'corrida_42')
TIERS = ('bronze', 'prata', 'ouro', 'diamante', 'lendario')
FOOTBALL_FORMATS = ('futsal', 'society', 'campo')
RUN_DISTANCES_KM = (3, 5, 10, 21, 42)


# The rating parameters exist exactly in the rating rankings; the adjusted mean (m, μ) only in an average ranking.
RATING_PARAMETERS_CHECK = (
    "(metric = 'rating' AND initial_rating > 0 AND placement_k > 0 AND regular_k > 0) OR "
    "(metric <> 'rating' AND initial_rating IS NULL AND placement_k IS NULL AND regular_k IS NULL)")
ADJUSTED_MEAN_CHECK = (
    "(prior_matches IS NULL AND prior_mean IS NULL) OR (metric = 'media' AND prior_matches > 0 AND prior_mean >= 0)")


class RankCut(Base):
    """Fixed cuts per ranking and calculation version; Bronze is anything below Prata."""
    __tablename__ = 'rank_cuts'
    __table_args__ = (
        UniqueConstraint('calc_version', 'ranking', name='uq_rank_cuts_version_ranking'),
        CheckConstraint(sql_in('ranking', RANKINGS), name='ck_rank_cuts_ranking'),
        CheckConstraint("metric IN ('pontos', 'media', 'tempo', 'rating')", name='ck_rank_cuts_metric'),
        CheckConstraint("(direction = 'maior' AND prata < ouro AND ouro < diamante) OR "
                        "(direction = 'menor' AND prata > ouro AND ouro > diamante)", name='ck_rank_cuts_order'),
        CheckConstraint('placement_matches >= 1 AND window_weeks >= 1 AND legend_share > 0 AND legend_share < 1',
                        name='ck_rank_cuts_parameters'),
        CheckConstraint(RATING_PARAMETERS_CHECK, name='ck_rank_cuts_rating'),
        CheckConstraint(ADJUSTED_MEAN_CHECK, name='ck_rank_cuts_adjusted_mean'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    calc_version: Mapped[int] = mapped_column(SmallInteger)
    ranking: Mapped[str] = mapped_column(String(20))
    # pontos (3/1/0 or tennis points, calc_version 1), rating (teams and tennis from calc_version 2), media (per
    # match) or tempo (best time in seconds).
    metric: Mapped[str] = mapped_column(String(10))
    # maior: higher is better (value >= cut); menor: lower is better (value <= cut).
    direction: Mapped[str] = mapped_column(String(5))
    prata: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    ouro: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    diamante: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    placement_matches: Mapped[int] = mapped_column(SmallInteger)
    # Lendário: Diamante and within floor(classified × share) of the ranking.
    legend_share: Mapped[Decimal] = mapped_column(Numeric(4, 3))
    window_weeks: Mapped[int] = mapped_column(SmallInteger)
    # Rating rankings only: the rating every subject starts the window with and the K factor of its first
    # `placement_matches` matches in the window (placement_k) and of the later ones (regular_k).
    initial_rating: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
    placement_k: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    regular_k: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    # Adjusted mean of an average ranking: `prior_matches` (m) phantom matches at `prior_mean` (μ).
    prior_matches: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    prior_mean: Mapped[Decimal | None] = mapped_column(Numeric(6, 3), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Standing(Base):
    """One row per subject (team or athlete) and category; no city, rankings are general."""
    __tablename__ = 'standings'
    __table_args__ = (
        CheckConstraint('(team_id IS NULL) <> (user_id IS NULL)', name='ck_standings_subject'),
        CheckConstraint("sport IN ('futebol', 'tenis', 'corrida')", name='ck_standings_sport'),
        CheckConstraint(f"format IS NULL OR {sql_in('format', FOOTBALL_FORMATS)}", name='ck_standings_format'),
        CheckConstraint(f"position IS NULL OR {sql_in('position', POSITIONS)}", name='ck_standings_position'),
        CheckConstraint('distance_km IS NULL OR distance_km IN (3, 5, 10, 21, 42)', name='ck_standings_distance'),
        CheckConstraint(
            "(sport = 'futebol' AND format IS NOT NULL AND distance_km IS NULL AND "
            "((team_id IS NOT NULL AND position IS NULL) OR (user_id IS NOT NULL AND position IS NOT NULL))) OR "
            "(sport = 'tenis' AND user_id IS NOT NULL AND format IS NULL AND position IS NULL AND distance_km IS NULL) OR "
            "(sport = 'corrida' AND user_id IS NOT NULL AND distance_km IS NOT NULL AND format IS NULL "
            "AND position IS NULL)", name='ck_standings_category'),
        CheckConstraint(f"tier IS NULL OR {sql_in('tier', TIERS)}", name='ck_standings_tier'),
        CheckConstraint('(tier IS NULL) = (rank_position IS NULL)', name='ck_standings_ranked'),
        CheckConstraint('matches_played >= 0 AND (rank_position IS NULL OR rank_position >= 1)',
                        name='ck_standings_counts'),
        Index('uq_standings_team', 'team_id', 'format', unique=True, postgresql_where=text('team_id IS NOT NULL')),
        Index('uq_standings_user_futebol', 'user_id', 'format', 'position', unique=True,
              postgresql_where=text("user_id IS NOT NULL AND sport = 'futebol'")),
        Index('uq_standings_user_tenis', 'user_id', unique=True, postgresql_where=text("sport = 'tenis'")),
        Index('uq_standings_user_corrida', 'user_id', 'distance_km', unique=True,
              postgresql_where=text("sport = 'corrida'")),
        CheckConstraint('wins >= 0 AND draws >= 0 AND losses >= 0 AND goals_for >= 0 AND goals_against >= 0',
                        name='ck_standings_record'),
        # GET /rankings: one ranking (category) in position order, classified subjects only.
        Index('ix_standings_ranking', 'sport', 'format', 'position', 'distance_km', 'rank_position',
              postgresql_where=text('rank_position IS NOT NULL')),
        # GET /rankings?tier= and the window of /rankings/overview: one tier of a category in position order.
        Index('ix_standings_ranking_tier', 'sport', 'format', 'position', 'distance_km', 'tier', 'rank_position',
              postgresql_where=text('rank_position IS NOT NULL')),
        CheckConstraint("recent_form ~ '^[VED]{0,5}$'", name='ck_standings_recent_form'),
        CheckConstraint("sport = 'corrida' OR best_mark_on IS NULL", name='ck_standings_best_mark'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int | None] = mapped_column(ForeignKey('teams.id', ondelete='CASCADE'), nullable=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=True, index=True)
    sport: Mapped[str] = mapped_column(String(20))
    format: Mapped[str | None] = mapped_column(String(10), nullable=True)
    position: Mapped[str | None] = mapped_column(String(20), nullable=True)
    distance_km: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    # Points, rating, average per match or best time in seconds, according to the ranking's metric (the rating is
    # stored in placement too, for the pairing, but the API hides it until the subject is classified).
    metric_value: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=0)
    # Confirmed matches (or valid marks, in running) inside the 52-week window.
    matches_played: Mapped[int] = mapped_column(Integer, default=0)
    # Record inside the window (stage 3): wins, draws and losses; goals (football teams) or sets (tennis) for
    # and against, used by the team tie-breaks (RN14: goal difference, goals scored, fewer matches).
    wins: Mapped[int] = mapped_column(Integer, default=0, server_default=text('0'))
    draws: Mapped[int] = mapped_column(Integer, default=0, server_default=text('0'))
    losses: Mapped[int] = mapped_column(Integer, default=0, server_default=text('0'))
    goals_for: Mapped[int] = mapped_column(Integer, default=0, server_default=text('0'))
    goals_against: Mapped[int] = mapped_column(Integer, default=0, server_default=text('0'))
    # Last results inside the window (up to 5), oldest first: V (win), E (draw) or D (loss); empty in running.
    recent_form: Mapped[str] = mapped_column(String(5), default='', server_default='')
    # Running only: the first day of the best time of the window (`RunRecord.achieved_on`).
    best_mark_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    rank_position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Null while in placement: no tier is ever assigned before classification.
    tier: Mapped[str | None] = mapped_column(String(10), nullable=True)
    calc_version: Mapped[int] = mapped_column(SmallInteger)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

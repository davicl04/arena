"""Result sticker data (Stories): the plate numbers of one activity of the owner, for `/me/share/...`.

Contract: docs/decisoes/0007-compartilhamento-stories.md, sections 3 to 5. The numbers are the ones of the profile
timeline item (same reading of sides, score, outcome, points, counted stats and run marks); `category` is the elo
bar of the sticker: the current standing of the activity's category (`services.share_category`), null when there is
no bar (a run outside the standard distances).
"""
from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel

from app.schemas.matches import ScoreOut
from app.schemas.profile import Outcome, Side, TimelineEventOut, TimelineSideOut, TimelineStatsOut
from app.schemas.rankings import RankingKey, Tier
from app.schemas.runs import RunOriginOut

# Unit of the distance to the next tier: the metric of the ranking (rating points, adjusted mean or seconds of the
# best time; 'pontos' only if the calculation rolls back to calc_version 1) or, from Diamante, places up to the last
# Lendário slot.
GapUnit = Literal['rating', 'media', 'segundos', 'pontos', 'posicoes']


class ShareGapOut(BaseModel):
    amount: float                            # > 0; seconds and places are whole numbers
    unit: GapUnit


class ShareCategoryOut(BaseModel):
    """Elo bar: the current standing of the owner (or of the owner's team) in the category of the activity. Ranked:
    tier, place inside it and the step to the next tier. In placement: only `played` of `required` (the metric of a
    rating ranking is never shown there, and this block never carries a metric value)."""
    ranking: RankingKey
    state: Literal['classificacao', 'ranqueado']
    tier: Tier | None                        # ranked only
    tier_position: int | None                # place inside the tier, as in the Ranking screen; ranked only
    tier_size: int | None                    # classified subjects in the tier; ranked only
    played: int                              # matches (running: marks) in the window; in placement at most `required`
    required: int
    progress: float                          # 0..1, 4 decimals
    next_tier: Tier | None                   # null in Lendário and in placement
    gap: ShareGapOut | None                  # null in Lendário, in Diamante without Lendário slots and in placement


class ShareMatchOut(BaseModel):
    id: int
    sport: Literal['futebol', 'tenis']
    format: Literal['futsal', 'society', 'campo'] | None
    origin: Literal['amistoso', 'campeonato']
    event: TimelineEventOut | None
    round_label: str | None
    occurred_at: dt.datetime
    sides: list[TimelineSideOut]             # `is_owner` marks the owner's side
    owner_side: Side
    score: ScoreOut                          # tennis: sets won, with each set and its tie-break
    outcome: Outcome
    walkover_absent_side: Side | None        # only the owner's side: a walkover win is never shareable
    points: int
    stats: TimelineStatsOut | None           # counted stats of the owner (football, not a walkover)
    category: ShareCategoryOut | None        # elo bar (decision 0007, section 5)


class ShareRunOut(BaseModel):
    id: int
    occurred_at: dt.datetime
    date: dt.date
    distance_m: int
    standard_distance_km: int | None         # null: outside every standard distance
    duration_s: int
    pace_s_per_km: int
    previous_best_s: int | None
    mark_kind: Literal['primeira_marca', 'novo_melhor', 'sem_melhora'] | None
    origin: RunOriginOut
    category: ShareCategoryOut | None        # elo bar; null outside the standard distances

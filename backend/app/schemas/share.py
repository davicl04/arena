"""Result sticker data (Stories): the plate numbers of one activity of the owner, for `/me/share/...`.

Contract: docs/decisoes/0007-compartilhamento-stories.md, sections 3 and 4. The numbers are the ones of the profile
timeline item (same reading of sides, score, outcome, points, counted stats and run marks); `category` is the elo
bar of the sticker and stays null until it is filled (section 5).
"""
from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel

from app.schemas.matches import ScoreOut
from app.schemas.profile import Outcome, Side, TimelineEventOut, TimelineSideOut, TimelineStatsOut
from app.schemas.runs import RunOriginOut


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
    category: None = None                    # elo bar: always null for now (decision 0007, section 5)


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
    category: None = None                    # elo bar: always null for now (decision 0007, section 5)

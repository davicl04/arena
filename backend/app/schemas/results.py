"""Responses of the result routes (Jogar, fase 5) that compose the shared shapes of `schemas.matches`.

Contract: docs/decisoes/0002-jogar.md, section 12.2. Inputs (`ResultInput`, `AttendanceInput`, `MyStatsInput`,
`StatReviewInput`, `StatContestInput`) and the objects (`LineupOut`, `PointsPreviewOut`, `RankingPageOut`) are in
`schemas.matches`.
"""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.matches import LineupOut, PointsPreviewOut


class LineupListOut(BaseModel):
    """`GET /matches/{id}/stats` and `PUT /matches/{id}/attendance`: every athlete of both sides."""
    items: list[LineupOut]


class MyStatsOut(BaseModel):
    """`PUT /matches/{id}/my-stats`: the athlete's appearance and the points preview (RN12)."""
    lineup: LineupOut
    preview: PointsPreviewOut

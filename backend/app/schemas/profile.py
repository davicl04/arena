"""Profile history (aba Partidas do perfil): the timeline of matches and runs and the stats of the own profile.

Contract: docs/plano-perfil-partidas.md, parts A2 and A3. Nothing here carries the next match, chat, pending
conditions, contests, deadlines or sports profile data; the court is only filled for the owner of the profile.
"""
from __future__ import annotations

import datetime as dt
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.schemas.matches import ScoreOut
from app.schemas.rankings import TeamRefOut, Tier
from app.schemas.runs import RunOriginOut

Side = Literal['a', 'b']
Outcome = Literal['vitoria', 'empate', 'derrota']
TimelineSport = Literal['futebol', 'tenis', 'corrida']


class TimelineAthleteOut(BaseModel):
    id: int
    name: str
    username: str
    avatar_url: str | None


class TimelineSideOut(BaseModel):
    side: Side
    kind: Literal['time', 'atleta']
    team: TeamRefOut | None
    athlete: TimelineAthleteOut | None
    is_owner: bool


class TimelineStatsOut(BaseModel):
    position: Literal['goleiro', 'defesa', 'meio_campo', 'atacante'] | None   # lineup position of the owner
    goals: int | None
    assists: int | None
    position_stat: int | None


class TimelineEventOut(BaseModel):
    id: int
    name: str


class TimelineCourtOut(BaseModel):
    name: str


class TimelineMatchOut(BaseModel):
    kind: Literal['partida'] = 'partida'
    id: int
    sport: Literal['futebol', 'tenis']
    format: Literal['futsal', 'society', 'campo'] | None
    origin: Literal['amistoso', 'campeonato']
    state: Literal['realizada', 'encerrada', 'sem_resultado', 'cancelada']
    occurred_at: dt.datetime
    sides: list[TimelineSideOut]
    owner_side: Side | None
    score: ScoreOut | None
    outcome: Outcome | None
    walkover_absent_side: Side | None
    points: int | None
    stats: TimelineStatsOut | None
    event: TimelineEventOut | None
    round_label: str | None
    court: TimelineCourtOut | None


class TimelineRunOut(BaseModel):
    kind: Literal['corrida'] = 'corrida'
    id: int
    occurred_at: dt.datetime
    date: dt.date
    distance_m: int
    standard_distance_km: int | None
    duration_s: int
    pace_s_per_km: int
    origin: RunOriginOut
    previous_best_s: int | None
    mark_kind: Literal['primeira_marca', 'novo_melhor', 'sem_melhora'] | None


TimelineItemOut = Annotated[TimelineMatchOut | TimelineRunOut, Field(discriminator='kind')]


class TimelinePageOut(BaseModel):
    items: list[TimelineItemOut]
    next_cursor: str | None
    total: int


class ProfileStatsOut(BaseModel):
    played: int
    wins: int
    draws: int
    losses: int
    win_rate: float | None          # percentage 0..100, one decimal place
    best_tier: Tier | None
    in_placement: bool

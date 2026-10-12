"""Running marks (Jogar, fase 6): input and output of `/me/runs`, `/me/run-bests` and `/me/run-races`.

Contract: docs/decisoes/0002-jogar.md, section 18. Dates are ISO calendar days (Brasília); instants are ISO 8601 UTC.
"""
from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, StrictInt

from app.schemas.common import StrictInput
from app.schemas.rankings import StandingState, Tier

RunSource = Literal['treino', 'prova']
RunKind = Literal['primeira_marca', 'novo_melhor', 'sem_melhora', 'fora_do_ranking']
RunFilter = Literal['3', '5', '10', '21', '42', 'outra']


class RunInput(StrictInput):
    """A mark. `date` defaults to today (training) or to the race day (Arena race, where another day is refused);
    `entry_id` is the athlete's confirmed entry and only exists for `source = 'prova'`."""
    distance_m: StrictInt
    duration_s: StrictInt
    source: RunSource
    date: dt.date | None = None
    entry_id: StrictInt | None = None


class RunOriginOut(BaseModel):
    """What the athlete sees as the origin of a mark: 'Treino' or the race name."""
    source: RunSource
    label: str
    event_id: int | None


class RunOut(BaseModel):
    id: int
    distance_m: int
    standard_distance_km: int | None       # null: outside every ±2% band, history only
    duration_s: int
    pace_s_per_km: int
    date: dt.date
    origin: RunOriginOut
    counts_for_ranking: bool               # standard distance and inside the 52 weeks
    created_at: dt.datetime


class RunImpactOut(BaseModel):
    """What the mark does (preview) or did (saved) to the athlete's ranking of its distance."""
    kind: RunKind
    previous_best_s: int | None            # best of the window before this mark
    delta_s: int | None                    # duration − previous best (negative: faster); null without a previous best
    tier_before: Tier | None
    tier_after: Tier | None                # null outside the ranking; an estimate in the preview
    tier_up: bool                          # had a tier and gets a higher one ("Sobe para Ouro")


class RunPreviewOut(BaseModel):
    distance_m: int
    duration_s: int
    pace_s_per_km: int
    date: dt.date
    standard_distance_km: int | None
    origin: RunOriginOut
    impact: RunImpactOut


class RunSeriesPointOut(BaseModel):
    id: int
    date: dt.date
    duration_s: int


class RunBestMarkOut(BaseModel):
    id: int
    distance_m: int
    duration_s: int
    pace_s_per_km: int
    date: dt.date
    origin: RunOriginOut


class RunBestOut(BaseModel):
    """Card of a distance in "Suas marcas"."""
    distance_km: int
    state: StandingState                   # sem_marca | ranqueado (the first mark classifies)
    tier: Tier | None
    rank_position: int | None
    best: RunBestMarkOut | None            # best time of the 52 weeks
    marks: int                             # marks of the window in this distance
    series: list[RunSeriesPointOut]        # marks of the window, oldest first, at most 60 (the latest)


class RunBestsOut(BaseModel):
    items: list[RunBestOut]                # 3, 5, 10, 21 and 42 km, always all five


class RunCreatedOut(BaseModel):
    run: RunOut
    impact: RunImpactOut
    best: RunBestOut | None                # card of the run's distance after saving; null in the history only


class RunPageOut(BaseModel):
    items: list[RunOut]
    next_cursor: str | None


class RunRaceOut(BaseModel):
    """A race the athlete can register a mark for ("Prova do Arena")."""
    entry_id: int
    event_id: int
    event_name: str
    distance_km: int
    starts_at: dt.datetime
    date: dt.date


class RunRacesOut(BaseModel):
    items: list[RunRaceOut]

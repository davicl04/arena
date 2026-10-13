"""Shapes of the championship bracket, schedule and result decision (Times e campeonatos, fases 6 e 7).

TypeScript mirror and rules: docs/decisoes/0003-times-campeonatos.md, section 21. Inputs reject unknown fields
(`StrictInput`); dates are ISO 8601 with time zone.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import PersonOut, StrictInput
from app.schemas.events import BracketState, CompetitionType, EventState, Sport
from app.schemas.matches import MatchCardOut, MatchPhase, MatchState, ResultInput, ScoreOut, Side
from app.schemas.rankings import FootballFormat, TeamRefOut

DecisionKindName = Literal['divergencia', 'prazo', 'wo']
SlotKind = Literal['competidor', 'vencedor', 'folga']
ConflictKind = Literal['quadra', 'time']


# ----- Inputs ------------------------------------------------------------------------------------------------

class BracketSwapInput(StrictInput):
    """Two places of the draw swap their entries (0-based `place` of `BracketSlot` and `Competitor.place`)."""
    a: int = Field(ge=0, le=63)
    b: int = Field(ge=0, le=63)


class CourtSuggestionIn(StrictInput):
    name: str = Field(max_length=120)
    address: str | None = Field(default=None, max_length=160)


class ScheduleInput(StrictInput):
    """Free start time and the court: one from the catalog or a suggestion (under review, valid in this match)."""
    starts_at: datetime
    court_id: int | None = None
    court_suggestion: CourtSuggestionIn | None = None


class ResultDecisionInput(StrictInput):
    """The decided score (`goals_a`/`goals_b` or `sets`) or, for a W.O., the side that did not show up; and the
    justification (5 to 500 characters), registered and visible to both teams."""
    score: ResultInput | None = None
    walkover_absent_side: Side | None = None
    justification: str = Field(max_length=2000)


# ----- Bracket -----------------------------------------------------------------------------------------------

class CompetitorOut(BaseModel):
    entry_id: int
    kind: Literal['time', 'atleta']
    team: TeamRefOut | None
    athlete: PersonOut | None
    place: int | None                  # 0-based place in the draw plan (the value to swap); null off the plan


class BracketSlotOut(BaseModel):
    kind: SlotKind                     # competidor | vencedor ("Vencedor J1") | folga ("Folga")
    competitor: CompetitorOut | None
    placeholder: str | None            # "Vencedor J1"
    from_match: int | None             # J number of the match whose winner arrives here
    advanced_by_bye: bool              # the competitor is here because the first-round pairing was a bye
    place: int | None                  # first-round places of a single elimination (also for "Folga")
    winner: bool                       # won this match


class BracketMatchOut(BaseModel):
    id: int
    state: MatchState
    phase: MatchPhase
    starts_at: datetime | None
    court_name: str | None
    score: ScoreOut | None
    awaiting_decision: bool            # divergent, or 48 h without a result: the organizer decides


class BracketNextOut(BaseModel):
    round: int
    position: int
    side: Side


class BracketNodeOut(BaseModel):
    position: int                      # 1-based inside the round
    number: int | None                 # J of the match; null for a bye pairing
    label: str | None                  # "J1"
    bye: bool                          # a "Folga" pairing: no match is played
    slots: list[BracketSlotOut]        # [side a, side b]
    match: BracketMatchOut | None      # null before the bracket is confirmed (and in bye pairings)
    next: BracketNextOut | None        # where the winner goes (null in the final and in round robin)


class BracketRoundOut(BaseModel):
    number: int
    name: str                          # "Oitavas de final" … "Final", or "Rodada 3"
    nodes: list[BracketNodeOut]
    rest: CompetitorOut | None         # round robin with an odd number: who sits out ("Folga")


class TableRowOut(BaseModel):
    position: int
    competitor: CompetitorOut
    played: int
    wins: int
    draws: int
    losses: int
    goals_for: int                     # goals (football) or sets (tennis)
    goals_against: int
    goal_difference: int
    points: int


class PlacementOut(BaseModel):
    placement: int                     # 1 champion, 2 runner-up, 3 semifinalists, or the position in the table
    competitor: CompetitorOut
    bonus_points: int                  # tennis bonus of RN16 (0 when it does not apply)


class BracketPermissionsOut(BaseModel):
    can_draw: bool                     # sort (or sort again)
    can_swap: bool
    can_confirm: bool
    draw_blocker: str | None           # why drawing is not possible now (in Portuguese)


class BracketOut(BaseModel):
    event_id: int
    event_name: str
    event_state: EventState
    sport: Sport
    format: FootballFormat | None
    kind: CompetitionType
    state: BracketState                # sem_chaveamento | sorteado (only the organizer sees it) | confirmado
    is_organizer: bool
    size: int | None                   # places of the bracket (elimination) or number of competitors
    byes: int                          # "Folga" places (elimination)
    seed: int | None                   # reproduces the draw; only for the organizer and the administration
    draw_count: int | None
    drawn_at: datetime | None
    confirmed_at: datetime | None
    rounds: list[BracketRoundOut]
    table: list[TableRowOut] | None    # round robin
    placements: list[PlacementOut] | None   # once the event ended
    champion: CompetitorOut | None
    permissions: BracketPermissionsOut


# ----- Matches of the event (S1) -----------------------------------------------------------------------------

class EventMatchRowOut(BaseModel):
    """Row of the list S1 and answer of the schedule: the match card with what the screen needs around it."""
    card: MatchCardOut
    label: str                         # "J1"
    stage: str                         # "Quartas de final", "Rodada 3"
    round_number: int
    position: int
    placeholders: list[str | None]     # [side a, side b]: "Vencedor J1" while the side is unknown, else null
    can_schedule: bool
    awaiting_decision: bool


class EventMatchCountsOut(BaseModel):
    total: int
    to_schedule: int
    waiting: int
    scheduled: int
    to_decide: int
    finished: int


class EventMatchListOut(BaseModel):
    items: list[EventMatchRowOut]      # without a date first (the ones that can be scheduled, then the waiting ones)
    counts: EventMatchCountsOut


class ScheduleConflictOut(BaseModel):
    kind: ConflictKind                 # quadra | time
    match_id: int
    label: str                         # "J3"
    stage: str
    starts_at: datetime
    court_name: str | None

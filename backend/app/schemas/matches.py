"""Shared shapes of stage 3 (matchmaking, matches, courts, walk-ins, chat, results and rankings).

The four backend fronts compose these models; serializers that need queries (cards, detail, lineups) live in the
fronts' services. TypeScript mirror and rules: docs/decisoes/0002-jogar.md, sections 7 to 12. Inputs reject
unknown fields (`StrictInput`); dates are ISO 8601 with time zone.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.identity import City
from app.models.matches import Court
from app.schemas.common import PersonOut, StrictInput
from app.schemas.identity import CityOut
from app.schemas.rankings import FootballFormat, PositionName, StandingLineOut, TeamRefOut, Tier
from app.services.match_rules import tennis_sets_from_json

MatchSport = Literal['futebol', 'tenis']
Side = Literal['a', 'b']
SearchKind = Literal['time', 'tenis', 'avulso']
SearchState = Literal['ativa', 'pareada', 'concluida', 'cancelada', 'expirada', 'recusada', 'sem_resposta']
MatchState = Literal['proposta', 'recusada', 'expirada', 'combinando', 'agendada', 'realizada', 'encerrada',
                     'sem_resultado', 'cancelada']
MatchPhase = Literal['proposta', 'recusada', 'expirada', 'combinando', 'agendada', 'informar_resultado', 'divergente',
                     'wo_registrado', 'wo_contestado', 'confirmado', 'encerrada', 'sem_resultado', 'cancelada']
MatchOrigin = Literal['amistoso', 'campeonato']
MatchRole = Literal['representante', 'membro', 'atleta', 'avulso', 'organizador', 'administracao']
TermsState = Literal['pendente', 'aceita', 'substituida', 'cancelada']
CourtKind = Literal['futsal', 'society', 'campo', 'tenis']
CourtState = Literal['publicada', 'em_revisao', 'rejeitada']
SlotState = Literal['aberta', 'oferecida', 'preenchida']
StatState = Literal['enviada', 'revisada', 'contestada']
StatField = Literal['gols', 'assistencias', 'estatistica_posicao']
ResultSource = Literal['confirmacao', 'wo', 'organizador', 'administracao']
ResultState = Literal['aguardando', 'divergente', 'confirmado', 'wo_registrado', 'wo_contestado', 'sem_resultado']
BookingState = Literal['a_confirmar', 'confirmada']
RankingKey = Literal['futebol_time', 'futebol_individual', 'tenis', 'corrida_3', 'corrida_5', 'corrida_10',
                     'corrida_21', 'corrida_42']


# ----- Inputs ------------------------------------------------------------------------------------------------

class OpenSlotsIn(StrictInput):
    goleiro: int = 0
    defesa: int = 0
    meio_campo: int = 0
    atacante: int = 0


class SearchInput(StrictInput):
    """POST /matchmaking/searches: team ('Com meu time'), tennis, or walk-in (football without team_id)."""
    sport: MatchSport
    team_id: int | None = None
    format: FootballFormat | None = None
    team_complete: bool | None = None
    open_slots: OpenSlotsIn | None = None
    position: PositionName | None = None


class TermsInput(StrictInput):
    starts_at: datetime
    court_id: int
    booking_side: Side
    super_tiebreak: bool | None = None


class BookingInput(StrictInput):
    confirmed: bool


class CancelInput(StrictInput):
    reason: str | None = Field(default=None, max_length=300)


class ReasonInput(StrictInput):
    """W.O. contest (5–500 characters, checked in the service after trimming)."""
    reason: str = Field(max_length=500)


class WalkoverDecisionInput(StrictInput):
    decision: Literal['manter', 'anular']
    reason: str = Field(max_length=500)


class MessageInput(StrictInput):
    body: str = Field(max_length=1000)


class SlotsInput(StrictInput):
    open_slots: OpenSlotsIn


class CourtSuggestionInput(StrictInput):
    match_id: int
    name: str = Field(max_length=120)
    address: str | None = Field(default=None, max_length=160)
    kind: CourtKind | None = None


class CourtDecisionInput(StrictInput):
    decision: Literal['publicar', 'rejeitar']
    name: str | None = Field(default=None, max_length=120)
    address: str | None = Field(default=None, max_length=160)
    reason: str | None = Field(default=None, max_length=300)
    duplicate_of_id: int | None = None


class TiebreakIn(StrictInput):
    a: int
    b: int


class TennisSetIn(StrictInput):
    a: int
    b: int
    tiebreak: TiebreakIn | None = None


class ResultInput(StrictInput):
    """Football: goals_a and goals_b. Tennis: sets (the third one is the super tie-break when agreed)."""
    goals_a: int | None = None
    goals_b: int | None = None
    sets: list[TennisSetIn] | None = Field(default=None, max_length=3)


class AttendanceItem(StrictInput):
    user_id: int
    present: bool
    position: PositionName | None = None


class AttendanceInput(StrictInput):
    athletes: list[AttendanceItem] = Field(min_length=1, max_length=40)


class MyStatsInput(StrictInput):
    position: PositionName
    goals: int | None = None
    assists: int | None = None
    position_stat: int | None = None


class StatReviewInput(StrictInput):
    position: PositionName | None = None
    goals: int | None = None
    assists: int | None = None
    position_stat: int | None = None


class StatContestInput(StrictInput):
    fields: list[StatField] = Field(min_length=1, max_length=3)
    reason: str = Field(max_length=300)


# ----- Outputs -----------------------------------------------------------------------------------------------

class OpenSlotsOut(BaseModel):
    goleiro: int
    defesa: int
    meio_campo: int
    atacante: int


class MatchSideOut(BaseModel):
    side: Side
    kind: Literal['time', 'atleta']
    team: TeamRefOut | None
    athlete: PersonOut | None
    tier: Tier | None                 # at pairing time; null in placement (never a tier before classification)
    accepted_at: datetime | None      # acceptance of the proposal
    is_mine: bool
    # Walk-in spots the side declared when searching, while the match is a proposal or being arranged (they become
    # `slots` when it is scheduled); null otherwise, and for a side that declared none.
    declared_slots: OpenSlotsOut | None = None


class MatchSearchOut(BaseModel):
    id: int
    kind: SearchKind
    sport: MatchSport
    city: CityOut
    format: FootballFormat | None
    position: PositionName | None
    team: TeamRefOut | None
    tier: Tier | None
    open_slots: OpenSlotsOut | None
    state: SearchState                # effective: a waiting search past 24 h shows 'expirada'
    started_at: datetime
    expires_at: datetime
    match_id: int | None
    slot_id: int | None
    offer_expires_at: datetime | None
    can_cancel: bool


class TennisSetOut(BaseModel):
    a: int
    b: int
    tiebreak: dict[str, int] | None
    super_tiebreak: bool


class ScoreOut(BaseModel):
    a: int                            # goals (football) or sets won (tennis) of side A
    b: int
    sets: list[TennisSetOut] | None
    winner: Side | None               # null: football draw


class CourtOut(BaseModel):
    id: int
    name: str
    address: str | None
    kind: CourtKind
    city: CityOut
    state: CourtState
    provisional: bool                 # under review: valid only in the match that suggested it (RN07)


class MatchCardOut(BaseModel):
    id: int
    sport: MatchSport
    format: FootballFormat | None
    origin: MatchOrigin
    state: MatchState
    phase: MatchPhase
    sides: list[MatchSideOut]
    my_side: Side | None
    my_role: MatchRole
    starts_at: datetime | None
    court: CourtOut | None
    result_deadline: datetime | None
    score: ScoreOut | None
    needs_my_action: bool


class ProposalOut(BaseModel):
    match_id: int
    sport: MatchSport
    format: FootballFormat | None
    city: CityOut
    state: Literal['proposta', 'combinando', 'recusada', 'expirada']
    expires_at: datetime
    sides: list[MatchSideOut]
    my_side: Side
    my_role: MatchRole
    can_respond: bool
    created_at: datetime


class SlotOfferOut(BaseModel):
    slot_id: int
    search_id: int
    position: PositionName
    side: Side
    expires_at: datetime
    match: MatchCardOut


class SearchCreatedOut(BaseModel):
    search: MatchSearchOut
    proposal: ProposalOut | None
    offer: SlotOfferOut | None


class PlayBoardOut(BaseModel):
    attention: bool                   # mint dot on the Jogar navigation button
    searches: list[MatchSearchOut]
    proposals: list[ProposalOut]
    offers: list[SlotOfferOut]
    matches: list[MatchCardOut]


class MatchTermsOut(BaseModel):
    id: int
    starts_at: datetime
    court: CourtOut
    booking_side: Side
    super_tiebreak: bool | None
    proposed_by: PersonOut | None
    proposed_by_side: Side | None
    state: TermsState
    accepted_a_at: datetime | None
    accepted_b_at: datetime | None
    created_at: datetime


class TermsPairOut(BaseModel):
    current: MatchTermsOut | None     # accepted terms
    pending: MatchTermsOut | None     # the one pending proposal


class BookingOut(BaseModel):
    side: Side
    state: BookingState
    confirmed_at: datetime | None


class MatchSlotOut(BaseModel):
    id: int
    side: Side
    position: PositionName
    state: SlotState
    guest: PersonOut | None
    filled_at: datetime | None


class ScoreReportOut(BaseModel):
    side: Side
    score: ScoreOut | None            # null: the other side's score is hidden until my side reports (blind report)
    reported_by: PersonOut | None
    updated_at: datetime


class MatchResultOut(BaseModel):
    state: ResultState
    deadline: datetime
    reports: dict[Side, ScoreReportOut | None]
    final: ScoreOut | None
    source: ResultSource | None
    confirmed_at: datetime | None
    decision_reason: str | None
    points: int | None                # my side: 3/1/0 (team) or 10/0 (tennis), once confirmed


class WalkoverOut(BaseModel):
    absent_side: Side
    registered_by: PersonOut | None
    registered_at: datetime
    contest_until: datetime
    contested_by: PersonOut | None
    contested_at: datetime | None
    contest_reason: str | None
    decision: Literal['mantido', 'anulado'] | None
    decision_reason: str | None


class CancellationOut(BaseModel):
    at: datetime
    by: PersonOut | None
    reason: str | None


class MatchPermissionsOut(BaseModel):
    read_chat: bool
    write_chat: bool
    propose_terms: bool
    accept_terms: bool
    confirm_booking: bool
    cancel: bool
    report_result: bool
    register_walkover: bool
    withdraw_walkover: bool
    contest_walkover: bool
    attendance: bool
    send_stats: bool
    manage_slots: bool
    suggest_court: bool


class MatchEventRefOut(BaseModel):
    id: int
    name: str


class MatchDetailOut(MatchCardOut):
    city: CityOut
    event: MatchEventRefOut | None
    round_number: int | None
    proposal_expires_at: datetime | None
    terms: TermsPairOut
    booking: BookingOut | None
    super_tiebreak: bool | None
    cancel_until: datetime | None
    slots: list[MatchSlotOut]
    result: MatchResultOut | None
    walkover: WalkoverOut | None
    cancellation: CancellationOut | None
    permissions: MatchPermissionsOut


class MatchMessageOut(BaseModel):
    id: int
    kind: Literal['texto', 'evento']
    event_type: str | None
    body: str | None                  # null when removed by moderation ("Mensagem removida")
    removed: bool
    author: PersonOut | None
    side: Side | None
    author_role: Literal['representante', 'membro', 'atleta', 'avulso', 'organizador'] | None
    is_mine: bool
    payload: dict | None
    created_at: datetime


class MessagePageOut(BaseModel):
    items: list[MatchMessageOut]
    has_more: bool
    last_id: int | None


class PointsPreviewOut(BaseModel):
    presence: float
    result: float | None
    goals: float
    assists: float
    position_stat: float
    total: float
    counted: list[StatField]
    final: bool


class FootballStatOut(BaseModel):
    id: int
    goals: int | None
    assists: int | None
    position_stat: int | None
    state: StatState
    submitted_at: datetime
    reviewed_at: datetime | None
    reviewed_by: PersonOut | None
    contested_at: datetime | None
    contested_by: PersonOut | None
    contest_reason: str | None
    contested_fields: list[StatField] | None


class LineupOut(BaseModel):
    user: PersonOut
    side: Side
    guest: bool
    position: PositionName | None
    present: bool | None
    stat: FootballStatOut | None
    points: PointsPreviewOut | None
    can_review: bool
    can_contest: bool


class MatchRefOut(BaseModel):
    id: int
    sport: MatchSport
    format: FootballFormat | None
    state: MatchState
    starts_at: datetime | None


class AdminCourtSuggestionOut(BaseModel):
    court: CourtOut
    suggested_by: PersonOut | None
    origin_match: MatchRefOut | None
    possible_duplicates: list[CourtOut]
    created_at: datetime
    reviewed_at: datetime | None
    review_reason: str | None
    duplicate_of: CourtOut | None


class AdminWalkoverDisputeOut(BaseModel):
    match: MatchCardOut
    walkover: WalkoverOut


class RankingRowOut(BaseModel):
    rank_position: int
    tier: Tier
    metric_value: float
    matches_played: int
    wins: int
    draws: int
    losses: int
    goals_for: int | None
    goals_against: int | None
    team: TeamRefOut | None
    athlete: PersonOut | None
    is_mine: bool


class MyRankingLineOut(StandingLineOut):
    team: TeamRefOut | None


class RankingPageOut(BaseModel):
    ranking: RankingKey
    format: FootballFormat | None
    position: PositionName | None
    distance_km: int | None
    calc_version: int
    classified_count: int
    legend_slots: int
    required: int
    items: list[RankingRowOut]
    next_cursor: str | None
    mine: list[MyRankingLineOut]


# ----- Pure builders -----------------------------------------------------------------------------------------

def score_out(score_a: int | None, score_b: int | None, sets: list | None, winner: str | None) -> ScoreOut | None:
    """Final score of a match or a side's report; None while there is none."""
    if score_a is None or score_b is None:
        return None
    parsed = tennis_sets_from_json(sets)
    return ScoreOut(a=score_a, b=score_b, winner=winner,
                    sets=None if parsed is None else [TennisSetOut(**item.as_json()) for item in parsed])


def court_out(court: Court, city: City) -> CourtOut:
    return CourtOut(id=court.id, name=court.name, address=court.address, kind=court.kind,
                    city=CityOut.model_validate(city), state=court.state, provisional=court.state == 'em_revisao')

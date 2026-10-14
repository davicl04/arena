from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.schemas.common import PersonOut

Tier = Literal['bronze', 'prata', 'ouro', 'diamante', 'lendario']
StandingState = Literal['sem_jogos', 'classificacao', 'ranqueado', 'sem_marca']
FootballFormat = Literal['futsal', 'society', 'campo']
PositionName = Literal['goleiro', 'defesa', 'meio_campo', 'atacante']
MemberRole = Literal['representante', 'membro']
RankingKey = Literal['futebol_time', 'futebol_individual', 'tenis', 'corrida_3', 'corrida_5', 'corrida_10',
                     'corrida_21', 'corrida_42']
FormLetter = Literal['V', 'E', 'D']


class StandingLineOut(BaseModel):
    """Tier line: tier when ranked; otherwise placement (n of `required`) and any level is faced."""
    state: StandingState
    tier: Tier | None
    played: int
    required: int
    rank_position: int | None
    metric_value: float | None
    faces: list[Tier]
    faces_any_level: bool


class FormatStandingOut(StandingLineOut):
    format: FootballFormat


class PositionStandingOut(StandingLineOut):
    position: PositionName
    format: FootballFormat


class RunStandingOut(StandingLineOut):
    distance_km: int


class TeamRefOut(BaseModel):
    id: int
    name: str
    initials: str
    crest_url: str | None


class TeamStandingsOut(BaseModel):
    team: TeamRefOut
    my_role: MemberRole
    formats: list[FormatStandingOut]


class FootballStandingsOut(BaseModel):
    teams: list[TeamStandingsOut]
    individual: list[PositionStandingOut]


class MeStandingsOut(BaseModel):
    calc_version: int
    futebol: FootballStandingsOut
    tenis: StandingLineOut
    corrida: list[RunStandingOut]


# ----- Ranking screen (GET /rankings and GET /rankings/overview; docs/decisoes/0002-jogar.md, section 20) ------

class TierCountsOut(BaseModel):
    """Classified subjects of the category in each tier; the tiers are contiguous in `rank_position`."""
    bronze: int
    prata: int
    ouro: int
    diamante: int
    lendario: int


class RankingSubjectOut(BaseModel):
    """A team or an athlete of a ranking, for the Salão dos Lendários preview."""
    team: TeamRefOut | None
    athlete: PersonOut | None


class RankingRowOut(BaseModel):
    """One classified line. `tier_position` counts inside the tier (1 = best of the tier); `form` is the last
    results (up to 5), oldest first, null in running, which has `best_mark_on` (the day of the best time)."""
    rank_position: int
    tier: Tier
    tier_position: int
    metric_value: float
    matches_played: int
    wins: int
    draws: int
    losses: int
    goals_for: int | None
    goals_against: int | None
    form: list[FormLetter] | None
    best_mark_on: date | None
    team: TeamRefOut | None
    athlete: PersonOut | None
    is_mine: bool


class MyRankingLineOut(StandingLineOut):
    """The viewer's line. The tier fields exist only for a ranked line (null while in placement); the gaps use the
    metric of the ranking (running: seconds): `leader_gap` is how far behind the tier's leader (null when it
    leads), `next_gap` how far ahead of the next one in the tier (null when last)."""
    team: TeamRefOut | None
    tier_position: int | None
    tier_size: int | None
    leader_gap: float | None
    next_gap: float | None
    next_tier_position: int | None


class RankingPageOut(BaseModel):
    ranking: RankingKey
    format: FootballFormat | None
    position: PositionName | None
    distance_km: int | None
    calc_version: int
    classified_count: int
    legend_slots: int
    required: int
    tier_counts: TierCountsOut
    items: list[RankingRowOut]
    next_cursor: str | None
    mine: list[MyRankingLineOut]


class RankingOverviewOut(BaseModel):
    ranking: RankingKey
    format: FootballFormat | None
    position: PositionName | None
    distance_km: int | None
    calc_version: int
    required: int
    classified_count: int
    legend_slots: int
    tier_counts: TierCountsOut
    mine: list[MyRankingLineOut]
    selected_team_id: int | None
    window: list[RankingRowOut] | None
    legends_preview: list[RankingSubjectOut]

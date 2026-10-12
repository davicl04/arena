from typing import Literal

from pydantic import BaseModel

Tier = Literal['bronze', 'prata', 'ouro', 'diamante', 'lendario']
StandingState = Literal['sem_jogos', 'classificacao', 'ranqueado', 'sem_marca']
FootballFormat = Literal['futsal', 'society', 'campo']
PositionName = Literal['goleiro', 'defesa', 'meio_campo', 'atacante']
MemberRole = Literal['representante', 'membro']


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

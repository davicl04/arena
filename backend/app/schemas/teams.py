"""Teams, roster, invites, team link and join requests (docs/decisoes/0003-times-campeonatos.md, seções 3 a 5)."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import PersonOut, StrictInput
from app.schemas.identity import CityOut
from app.schemas.rankings import FormatStandingOut, MemberRole, PositionName

TEAM_NAME_MIN = 3
TEAM_NAME_MAX = 40
INVITE_MESSAGE_MAX = 140

TeamStatus = Literal['membro', 'convite_pendente', 'pedido_pendente', 'disponivel']
InviteState = Literal['pendente', 'aceito', 'recusado', 'cancelado']
JoinRequestState = Literal['pendente', 'aprovado', 'recusado', 'cancelado']


def normalize_team_name(value):
    """Trims the name and collapses repeated inner spaces ('  Leões   do Cerrado ' -> 'Leões do Cerrado')."""
    return ' '.join(value.split()) if isinstance(value, str) else value


def check_team_name(value: str | None) -> str | None:
    if value is not None and not TEAM_NAME_MIN <= len(value) <= TEAM_NAME_MAX:
        raise ValueError(f'Use de {TEAM_NAME_MIN} a {TEAM_NAME_MAX} caracteres no nome do time.')
    return value


def normalize_message(value):
    """Trimmed invite message; an empty one becomes null."""
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


class TeamCreateInput(StrictInput):
    name: str
    city_id: int = Field(gt=0)

    @field_validator('name', mode='before')
    @classmethod
    def normalize_name(cls, value):
        return normalize_team_name(value)

    @field_validator('name')
    @classmethod
    def valid_name(cls, value):
        return check_team_name(value)


class TeamUpdateInput(StrictInput):
    name: str | None = None
    city_id: int | None = Field(default=None, gt=0)

    @field_validator('name', mode='before')
    @classmethod
    def normalize_name(cls, value):
        return normalize_team_name(value)

    @field_validator('name')
    @classmethod
    def valid_name(cls, value):
        return check_team_name(value)

    @model_validator(mode='after')
    def require_change(self):
        if self.name is None and self.city_id is None:
            raise ValueError('Informe o nome ou a cidade do time.')
        return self


class MemberUpdateInput(StrictInput):
    role: MemberRole | None = None
    # null is a valid value (no position); only the fields actually sent are applied.
    position: PositionName | None = None

    @model_validator(mode='after')
    def require_change(self):
        if not self.model_fields_set & {'role', 'position'}:
            raise ValueError('Informe o papel ou a posição.')
        if 'role' in self.model_fields_set and self.role is None:
            raise ValueError('Informe o papel: representante ou membro.')
        return self


class InviteCreateInput(StrictInput):
    user_id: int = Field(gt=0)
    message: str | None = None

    @field_validator('message', mode='before')
    @classmethod
    def trim_message(cls, value):
        return normalize_message(value)

    @field_validator('message')
    @classmethod
    def valid_message(cls, value):
        if value is not None and len(value) > INVITE_MESSAGE_MAX:
            raise ValueError(f'A mensagem pode ter até {INVITE_MESSAGE_MAX} caracteres.')
        return value


class InviteDecisionInput(StrictInput):
    decision: Literal['aceitar', 'recusar']


class JoinRequestDecisionInput(StrictInput):
    decision: Literal['aprovar', 'recusar']


class RosterPreviewItemOut(BaseModel):
    user_id: int
    first_name: str
    avatar_url: str | None
    position: PositionName | None
    is_representative: bool


class TeamCardOut(BaseModel):
    """Team card C5, as the viewer sees it."""
    id: int
    name: str
    initials: str
    city: CityOut
    crest_url: str | None
    my_role: MemberRole | None
    member_count: int
    representative_count: int
    roster_preview: list[RosterPreviewItemOut]
    formats: list[FormatStandingOut]
    pending_join_requests: int | None
    pending_invites: int | None
    created_at: datetime


class TeamCardList(BaseModel):
    items: list[TeamCardOut]


class TeamMemberOut(BaseModel):
    user_id: int
    name: str
    first_name: str
    username: str
    avatar_url: str | None
    position: PositionName | None
    role: MemberRole
    joined_at: datetime
    is_me: bool


class TeamMemberList(BaseModel):
    items: list[TeamMemberOut]


class InviteCandidateOut(BaseModel):
    person: PersonOut
    team_status: TeamStatus


class InviteCandidatePage(BaseModel):
    items: list[InviteCandidateOut]
    next_cursor: str | None


class TeamInviteSentOut(BaseModel):
    id: int
    invitee: PersonOut
    inviter: PersonOut | None
    message: str | None
    state: InviteState
    created_at: datetime


class TeamInviteSentList(BaseModel):
    items: list[TeamInviteSentOut]


class TeamInviteReceivedOut(BaseModel):
    """Invite card K1."""
    id: int
    team: TeamCardOut
    inviter: PersonOut | None
    message: str | None
    created_at: datetime


class TeamInviteReceivedList(BaseModel):
    items: list[TeamInviteReceivedOut]


class InviteDecisionResultOut(BaseModel):
    state: Literal['aceito', 'recusado']
    team: TeamCardOut | None


class TeamLinkOut(BaseModel):
    url: str
    token: str
    generated_at: datetime


class JoinPreviewOut(BaseModel):
    team: TeamCardOut
    my_status: TeamStatus
    invite_id: int | None
    request_id: int | None


class JoinRequestOut(BaseModel):
    id: int
    team_id: int
    requester: PersonOut
    state: JoinRequestState
    created_at: datetime
    decided_at: datetime | None


class JoinRequestList(BaseModel):
    items: list[JoinRequestOut]

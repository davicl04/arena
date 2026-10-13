"""Pedido de organizador, permissão e filas da administração (docs/decisoes/0003, seção 6)."""
from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, BeforeValidator, Field, field_validator

from app.models.organizers import SPORTS
from app.schemas.common import PersonOut, StrictInput
from app.schemas.identity import CityOut, Sport

OrganizerRequestState = Literal['em_analise', 'aprovado', 'recusado', 'cancelado']
OrganizerStatusState = Literal['sem_pedido', 'em_analise', 'recusado', 'aprovado', 'revogado']


class OrganizerRefusalReason(StrEnum):
    contato_nao_funciona = 'contato_nao_funciona'
    pouca_informacao = 'pouca_informacao'
    pedido_repetido = 'pedido_repetido'
    outro = 'outro'


def _trim(value):
    return value.strip() if isinstance(value, str) else value


def _trim_optional(value):
    """Optional texts are trimmed; blank values become null."""
    if isinstance(value, str):
        return value.strip() or None
    return value


Trimmed = Annotated[str, BeforeValidator(_trim)]
OptionalTrimmed = Annotated[str | None, BeforeValidator(_trim_optional)]


class OrganizerRequestInput(StrictInput):
    display_name: Trimmed
    city_id: int
    sports: list[Sport]
    experience: OptionalTrimmed = None
    contact: Trimmed
    link: OptionalTrimmed = None
    # Checked by the service so the client receives the contract message (not a field list).
    accept_terms: bool

    @field_validator('display_name')
    @classmethod
    def check_display_name(cls, value: str) -> str:
        if not 3 <= len(value) <= 80:
            raise ValueError('Informe o nome do organizador com 3 a 80 caracteres.')
        return value

    @field_validator('sports')
    @classmethod
    def check_sports(cls, value: list[Sport]) -> list[Sport]:
        if not value:
            raise ValueError('Escolha pelo menos uma modalidade.')
        if len(set(value)) != len(value):
            raise ValueError('Escolha cada modalidade uma vez.')
        # Stored in the catalog order (futebol, tênis, corrida), whatever order the client sends.
        return sorted(value, key=SPORTS.index)

    @field_validator('experience')
    @classmethod
    def check_experience(cls, value: str | None) -> str | None:
        if value is not None and len(value) > 1000:
            raise ValueError('Descreva a experiência em até 1000 caracteres.')
        return value

    @field_validator('contact')
    @classmethod
    def check_contact(cls, value: str) -> str:
        if not 5 <= len(value) <= 120:
            raise ValueError('Informe um contato com 5 a 120 caracteres.')
        return value

    @field_validator('link')
    @classmethod
    def check_link(cls, value: str | None) -> str | None:
        if value is not None and not is_web_link(value):
            raise ValueError('Informe um link http ou https válido, com até 300 caracteres.')
        return value


def is_web_link(value: str) -> bool:
    if len(value) > 300 or any(character.isspace() or ord(character) < 32 for character in value):
        return False
    try:
        parts = urlsplit(value)
    except ValueError:
        return False
    return parts.scheme in {'http', 'https'} and bool(parts.hostname)


class OrganizerDecisionInput(StrictInput):
    decision: Literal['aprovar', 'recusar']
    # The service requires them on a refusal with the contract messages; an approval ignores them.
    reason_code: OrganizerRefusalReason | None = None
    reason_detail: OptionalTrimmed = None


class OrganizerRevokeInput(StrictInput):
    reason: Trimmed

    @field_validator('reason')
    @classmethod
    def check_reason(cls, value: str) -> str:
        if not 5 <= len(value) <= 500:
            raise ValueError('Descreva o motivo da revogação com 5 a 500 caracteres.')
        return value


class OrganizerRequestOut(BaseModel):
    id: int
    display_name: str
    city: CityOut
    sports: list[Sport]
    experience: str | None
    contact: str
    link: str | None
    state: OrganizerRequestState
    reason_code: OrganizerRefusalReason | None
    reason_detail: str | None
    created_at: datetime
    decided_at: datetime | None


class OrganizerSummaryOut(BaseModel):
    id: int
    display_name: str
    approved_at: datetime


class RevocationOut(BaseModel):
    revoked_at: datetime
    reason: str


class OrganizerStatusOut(BaseModel):
    """Cartão P3 do Menu."""
    state: OrganizerStatusState
    request: OrganizerRequestOut | None
    organizer: OrganizerSummaryOut | None
    revocation: RevocationOut | None


class AdminOrganizerRequestOut(OrganizerRequestOut):
    requester: PersonOut
    decided_by: PersonOut | None


class AdminOrganizerRequestPage(BaseModel):
    items: list[AdminOrganizerRequestOut]
    next_cursor: str | None


class AdminOrganizerOut(BaseModel):
    id: int
    user: PersonOut
    display_name: str
    approved_at: datetime
    approved_by: PersonOut | None
    request_id: int | None


class AdminOrganizerPage(BaseModel):
    items: list[AdminOrganizerOut]
    next_cursor: str | None


class QueueCountsOut(BaseModel):
    """Contadores das filas da administração no Menu (seções 6 e 15)."""
    organizer_requests: int = Field(description='Pedidos de organizador em análise.')
    reports: int = Field(description='Denúncias pendentes (mesma contagem de GET /admin/reports).')
    paid_events: int = Field(description='Eventos pagos aguardando aprovação (fila em_aprovacao).')
    revoked_events: int = Field(description='Eventos de organizador revogado aguardando decisão (fila revogacao).')
    refund_disputes: int = Field(description='Devoluções contestadas pelos participantes.')
    court_suggestions: int = Field(description='Quadras sugeridas em revisão (GET /admin/court-suggestions).')
    walkover_disputes: int = Field(description='W.O. contestados aguardando decisão (GET /admin/walkover-disputes).')

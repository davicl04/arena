"""Eventos do organizador e filas da administração (docs/decisoes/0003, seções 14 e 15).

Entradas do rascunho (POST e PATCH), decisões e as formas do O3, G3, A2 e AD1, compostas a partir das peças
compartilhadas de `app/schemas/events.py`.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, field_validator, model_validator

from app.models.rankings import TIERS
from app.schemas.common import PersonOut, StrictInput
from app.schemas.events import (
    ChampionshipOut,
    ChecklistItemOut,
    CompetitionType,
    EntryState,
    EventMessageOut,
    EventPixOut,
    EventPosterOut,
    EventRefusalReason,
    NextActionOut,
    OrganizerEntryOut,
    PendingCountsOut,
    PixKeyType,
    ReceiptOut,
    ReceiptRefusalReason,
    RevocationDecision,
    RunDistance,
    Sport,
    TennisBonusOut,
)
from app.schemas.rankings import FootballFormat, Tier

EventScope = Literal['abertos', 'encerrados']
ReceiptTab = Literal['para_analisar', 'decididos']
AdminEventQueue = Literal['em_aprovacao', 'revogacao']


def _trim(value):
    return value.strip() if isinstance(value, str) else value


def _trim_optional(value):
    """Optional texts are trimmed; blank values become null."""
    if isinstance(value, str):
        return value.strip() or None
    return value


Trimmed = Annotated[str, BeforeValidator(_trim)]
OptionalTrimmed = Annotated[str | None, BeforeValidator(_trim_optional)]

# Upper bounds of the optional texts (the database columns); lower bounds are checked by the checklist.
TEXT_LIMITS = {'venue': (120, 'o local'), 'course_notes': (500, 'o percurso'),
               'pix_beneficiary': (80, 'o favorecido'), 'pix_key': (100, 'a chave Pix'),
               'pix_copy_paste': (1000, 'o Pix Copia e Cola'), 'pix_instructions': (500, 'as instruções'),
               'contact': (120, 'o contato')}


class EventDraftInput(StrictInput):
    """Draft fields (POST and PATCH). Absent: unchanged; null: cleared. The draft may stay incomplete."""
    name: Annotated[str | None, BeforeValidator(_trim)] = None
    sport: Sport | None = None
    format: FootballFormat | None = None
    distance_km: RunDistance | None = None
    competition_type: CompetitionType | None = None
    capacity: int | None = None
    accepted_tiers: list[Tier] | None = None
    city_id: int | None = None
    venue: OptionalTrimmed = None
    course_notes: OptionalTrimmed = None
    starts_at: datetime | None = None
    registration_closes_at: datetime | None = None
    price_cents: int | None = None
    pix_beneficiary: OptionalTrimmed = None
    pix_key_type: PixKeyType | None = None
    pix_key: OptionalTrimmed = None
    pix_copy_paste: OptionalTrimmed = None
    pix_instructions: OptionalTrimmed = None
    contact: OptionalTrimmed = None

    @field_validator('name')
    @classmethod
    def check_name(cls, value: str | None) -> str:
        # Runs only when the field is sent: the name can change but never be cleared.
        if value is None or not 3 <= len(value) <= 60:
            raise ValueError('Informe o nome do evento com 3 a 60 caracteres.')
        return value

    @field_validator('capacity')
    @classmethod
    def check_capacity(cls, value: int | None) -> int | None:
        if value is not None and not 2 <= value <= 5000:
            raise ValueError('As vagas vão de 2 a 5000.')
        return value

    @field_validator('accepted_tiers')
    @classmethod
    def check_tiers(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        if not value:
            raise ValueError('Escolha ao menos um elo ou deixe aberto a todos.')
        if len(set(value)) != len(value):
            raise ValueError('Escolha cada elo uma vez.')
        # Stored in the tier order (Bronze to Lendário), whatever order the client sends.
        return sorted(value, key=TIERS.index)

    @field_validator('city_id')
    @classmethod
    def check_city(cls, value: int | None) -> int | None:
        if value is not None and value <= 0:
            raise ValueError('Selecione uma cidade do catálogo.')
        return value

    @field_validator('starts_at', 'registration_closes_at')
    @classmethod
    def check_timezone(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError('Informe a data com o fuso horário.')
        return value.astimezone(timezone.utc)

    @field_validator('price_cents')
    @classmethod
    def check_price(cls, value: int | None) -> int | None:
        if value is not None and value != 0 and not 100 <= value <= 1_000_000:
            raise ValueError('O valor vai de R$ 1,00 a R$ 10.000,00 (0 para inscrição gratuita).')
        return value

    @field_validator(*TEXT_LIMITS)
    @classmethod
    def check_text(cls, value: str | None, info) -> str | None:
        limit, label = TEXT_LIMITS[info.field_name]
        if value is not None and len(value) > limit:
            raise ValueError(f'Informe {label} com até {limit} caracteres.')
        return value


class EventCreateInput(EventDraftInput):
    name: Trimmed


class EventUpdateInput(EventDraftInput):
    @model_validator(mode='after')
    def require_change(self):
        if not self.model_fields_set:
            raise ValueError('Informe ao menos um campo para alterar.')
        return self


class EventCancelInput(StrictInput):
    # Checked by the service so the client receives the contract message (not a field list).
    reason: Trimmed


class ReceiptDecisionInput(StrictInput):
    decision: Literal['aprovar', 'recusar']
    reason_code: ReceiptRefusalReason | None = None
    reason_detail: OptionalTrimmed = None


class EventMessageInput(StrictInput):
    body: Trimmed


class AdminEventDecisionInput(StrictInput):
    decision: Literal['aprovar', 'recusar']
    reason_code: EventRefusalReason | None = None
    reason_detail: OptionalTrimmed = None


class RevocationDecisionInput(StrictInput):
    decision: Literal['seguir', 'cancelar']
    reason: OptionalTrimmed = None


class OrganizerEventCardOut(EventPosterOut):
    """Poster of O3 with the alert and the "Agora" action."""
    pending: PendingCountsOut
    next_action: NextActionOut
    # Futsal, society, campo and tennis championships past publication: bracket and match counters (fase 6).
    championship: ChampionshipOut | None = None


class EventRefusalOut(BaseModel):
    reason_code: EventRefusalReason
    reason_detail: str | None
    reviewed_at: datetime


class OrganizerEventDetailOut(OrganizerEventCardOut):
    """Management screen (G3) and the base of its sections."""
    course_notes: str | None
    contact: str | None
    pix: EventPixOut | None
    checklist: list[ChecklistItemOut]
    can_submit: bool
    refusal: EventRefusalOut | None
    submitted_at: datetime | None
    published_at: datetime | None
    cancelled_at: datetime | None
    cancel_reason: str | None
    revocation_decision: RevocationDecision | None
    entries_by_state: dict[EntryState, int]
    editable_fields: list[str]
    tennis_bonus: TennisBonusOut | None


class OrganizerEventPage(BaseModel):
    items: list[OrganizerEventCardOut]
    next_cursor: str | None


class OrganizerEntryPage(BaseModel):
    items: list[OrganizerEntryOut]
    next_cursor: str | None


class ReceiptReviewOut(BaseModel):
    """Row and sheet of A2."""
    receipt: ReceiptOut
    entry: OrganizerEntryOut
    attempt: int
    previous: list[ReceiptOut]


class ReceiptReviewPage(BaseModel):
    items: list[ReceiptReviewOut]
    next_cursor: str | None


class EventMessagePage(BaseModel):
    items: list[EventMessageOut]
    next_cursor: str | None


class AdminEventOrganizerOut(BaseModel):
    organizer_id: int | None
    display_name: str
    user: PersonOut
    active: bool


class AdminEventOut(EventPosterOut):
    """Sheet of the AD1 queues (paid events and events of a revoked organizer)."""
    organizer: AdminEventOrganizerOut
    pix: EventPixOut | None
    contact: str | None
    course_notes: str | None
    submitted_at: datetime | None
    published_at: datetime | None
    revocation_decision: RevocationDecision | None
    pending: PendingCountsOut
    entries_by_state: dict[EntryState, int]


class AdminEventPage(BaseModel):
    items: list[AdminEventOut]
    next_cursor: str | None

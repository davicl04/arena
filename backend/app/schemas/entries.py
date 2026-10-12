"""Athlete side of events: posters with eligibility, the detail, entries, receipts and refunds (stage 2).

TypeScript mirror: docs/decisoes/0002-jogar.md, section 6.2 (EventCard, EventDetail, PublicEntry, MyEntry), and
docs/decisoes/0003-times-campeonatos.md, section 15 (RefundDispute). The shared pieces (poster, Pix, receipt,
subject and the organizer's entry row) come from app/schemas/events.py.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import PersonOut, StrictInput
from app.schemas.events import (
    EntryState,
    EntrySubjectOut,
    EventPixOut,
    EventPosterOut,
    OrganizerEntryOut,
    ReceiptOut,
    TennisBonusOut,
)
from app.schemas.rankings import TeamRefOut, Tier

EligibilityReason = Literal['em_classificacao', 'fora_da_faixa', 'sem_time']
EntryRole = Literal['atleta', 'representante', 'membro', 'organizador', 'administracao']


class TeamEligibilityOut(BaseModel):
    team: TeamRefOut
    tier: Tier | None
    eligible: bool
    reason: Literal['em_classificacao', 'fora_da_faixa'] | None
    entry_id: int | None


class EventEligibilityOut(BaseModel):
    """RN18 for the viewer: football looks at the teams they represent; tennis and running at their own tier."""
    eligible: bool
    reason: EligibilityReason | None
    message: str | None
    tier: Tier | None
    teams: list[TeamEligibilityOut] | None


class MyEntrySummaryOut(BaseModel):
    id: int
    state: EntryState
    team: TeamRefOut | None
    reserved_until: datetime | None


class EventCardOut(EventPosterOut):
    """Poster of the E2 list."""
    organizer_name: str
    eligibility: EventEligibilityOut
    my_entry: MyEntrySummaryOut | None


class EventOrganizerOut(BaseModel):
    display_name: str
    person: PersonOut | None


class EventDetailOut(EventCardOut):
    """D2: the Informações tab and the fixed button."""
    course_notes: str | None
    contact: str | None
    organizer: EventOrganizerOut
    pix: EventPixOut | None
    registration_open: bool
    spots_left: int
    tennis_bonus: TennisBonusOut | None
    cancelled_at: datetime | None
    cancel_reason: str | None
    is_organizer: bool
    can_read_messages: bool


class EventCardPage(BaseModel):
    items: list[EventCardOut]
    next_cursor: str | None


class PublicEntryOut(BaseModel):
    """Inscritos tab: confirmed entries only."""
    id: int
    subject: EntrySubjectOut
    confirmed_at: datetime


class PublicEntryPage(BaseModel):
    items: list[PublicEntryOut]
    next_cursor: str | None


class MyEntryOut(BaseModel):
    """S1 card of the entry and the "Enviar comprovante" sheet."""
    id: int
    event: EventPosterOut
    subject: EntrySubjectOut
    my_role: EntryRole
    state: EntryState
    price_cents: int
    reserved_until: datetime | None
    created_at: datetime
    confirmed_at: datetime | None
    expired_at: datetime | None
    cancelled_at: datetime | None
    refunded_at: datetime | None
    latest_payment: ReceiptOut | None
    refund: ReceiptOut | None
    can_send_receipt: bool
    can_cancel: bool
    can_respond_refund: bool


class MyEntryPage(BaseModel):
    items: list[MyEntryOut]
    next_cursor: str | None


class ReceiptList(BaseModel):
    items: list[ReceiptOut]


class RefundDisputeOut(BaseModel):
    entry: OrganizerEntryOut
    event: EventPosterOut
    organizer: PersonOut
    contested_at: datetime


class RefundDisputePage(BaseModel):
    items: list[RefundDisputeOut]
    next_cursor: str | None


class EntryCreateInput(StrictInput):
    """Football names the team; tennis and running enter the session athlete (no body field)."""
    team_id: int | None = None


class RefundResponseInput(StrictInput):
    response: Literal['confirmar', 'contestar']
    # Length rules (5 to 500 when contesting) are checked by the service with the contract message.
    reason: str | None = Field(None, max_length=2000)


class RefundDecisionInput(StrictInput):
    decision: Literal['devolvida', 'pendente']
    reason: str = Field(max_length=2000)

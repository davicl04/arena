"""Shared output shapes of stage 2 (events, entries, receipts, notices) and their pure builders.

Both backend fronts use these pieces; route-specific shapes (organizer cards, athlete detail, admin queues) live
in each front's own schema module and compose them. TypeScript mirror: docs/decisoes/0003-times-campeonatos.md,
section 13.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.events import EntryReceipt, Event
from app.models.identity import City, MediaObject
from app.schemas.common import PersonOut
from app.schemas.identity import CityOut
from app.schemas.rankings import FootballFormat, TeamRefOut, Tier
from app.services.event_rules import (
    ChecklistItem,
    NextAction,
    PendingCounts,
    event_phase,
    event_registration_deadline,
    refund_auto_confirm_at,
)

Sport = Literal['futebol', 'tenis', 'corrida']
EventState = Literal['rascunho', 'em_aprovacao', 'publicado', 'em_andamento', 'encerrado', 'cancelado']
EventPhase = Literal['rascunho', 'em_aprovacao', 'inscricoes_abertas', 'inscricoes_encerradas', 'em_andamento',
                     'encerrado', 'cancelado']
CompetitionType = Literal['todos_contra_todos', 'eliminacao_simples']
RunDistance = Literal[3, 5, 10, 21, 42]
PixKeyType = Literal['cpf', 'email', 'telefone', 'aleatoria']
EventRefusalReason = Literal['pix_incompleto', 'preco_ou_datas', 'conteudo_inadequado', 'outro']
RevocationDecision = Literal['pendente', 'seguir', 'cancelado']
EntryState = Literal['reservada', 'em_analise', 'confirmada', 'rejeitada', 'expirada', 'cancelada',
                     'devolucao_pendente', 'devolucao_contestada', 'devolvida']
ReceiptKind = Literal['pagamento', 'devolucao']
ReceiptFileType = Literal['imagem', 'pdf']
ReceiptDecision = Literal['aprovado', 'recusado']
ReceiptRefusalReason = Literal['valor_diferente', 'favorecido_errado', 'comprovante_ilegivel', 'fora_do_prazo', 'outro']
RefundResponse = Literal['confirmada', 'contestada', 'automatica']
RefundResolution = Literal['devolvida', 'pendente']
ChecklistKey = Literal['nome_modalidade', 'formato_tipo', 'vagas_elos', 'datas', 'local', 'inscricao']
NextActionKind = Literal['aguardar_revogacao', 'corrigir_recusa', 'completar_rascunho', 'publicar',
                         'aguardar_aprovacao', 'analisar_comprovantes', 'enviar_devolucoes', 'aguardar_devolucoes',
                         'acompanhar_inscricoes', 'aguardar_inicio', 'nenhuma']
EntrySubjectKind = Literal['time', 'atleta']


class EventPosterOut(BaseModel):
    """The poster (cartaz) shown in O3, E2, AD1 and on top of G3 and D2."""
    id: int
    name: str
    sport: Sport | None
    format: FootballFormat | None
    distance_km: RunDistance | None
    competition_type: CompetitionType | None
    capacity: int | None
    entries_count: int
    confirmed_count: int
    starts_at: datetime | None
    registration_closes_at: datetime | None
    registration_deadline: datetime | None
    city: CityOut | None
    venue: str | None
    price_cents: int | None
    accepted_tiers: list[Tier] | None
    state: EventState
    phase: EventPhase
    revocation_pending: bool


class EventPixOut(BaseModel):
    """"Pix para receber" (organizer) and "Pix do organizador" (athlete); only sent to signed-in users."""
    beneficiary: str | None
    key_type: PixKeyType | None
    key: str | None
    copy_paste: str | None
    instructions: str | None


class ChecklistItemOut(BaseModel):
    key: ChecklistKey
    label: str
    done: bool
    message: str | None


class PendingCountsOut(BaseModel):
    receipts: int
    refunds_to_send: int
    refunds_awaiting: int
    refund_disputes: int
    total: int


class NextActionOut(BaseModel):
    kind: NextActionKind
    count: int | None
    deadline: datetime | None


class TennisBonusOut(BaseModel):
    champion: int
    runner_up: int
    semifinalist: int
    min_entries: int
    applies: bool


class EntrySubjectOut(BaseModel):
    """Who is entered: a team (football) or an athlete (tennis and running)."""
    kind: EntrySubjectKind
    team: TeamRefOut | None
    athlete: PersonOut | None


class ReceiptOut(BaseModel):
    id: int
    kind: ReceiptKind
    file_url: str
    file_type: ReceiptFileType
    size_bytes: int
    uploaded_by: PersonOut | None
    created_at: datetime
    decision: ReceiptDecision | None
    reason_code: ReceiptRefusalReason | None
    reason_detail: str | None
    decided_at: datetime | None
    participant_response: RefundResponse | None
    responded_at: datetime | None
    contest_reason: str | None
    auto_confirm_at: datetime | None
    resolution: RefundResolution | None
    resolution_reason: str | None
    resolved_at: datetime | None


class OrganizerEntryOut(BaseModel):
    """Row of "Times inscritos" / "Inscritos" (G3), of the A2 sheet, of the refund upload answer and of the
    contested refunds queue: one shape and one builder (`services.events.organizer_entries_out`) for both fronts."""
    id: int
    subject: EntrySubjectOut
    state: EntryState
    price_cents: int
    reserved_until: datetime | None
    created_at: datetime
    confirmed_at: datetime | None
    registered_by: PersonOut | None
    latest_payment: ReceiptOut | None
    refund: ReceiptOut | None


class EventMessageOut(BaseModel):
    id: int
    kind: str
    body: str
    author: PersonOut | None
    created_at: datetime


def poster_out(event: Event, city: City | None, *, entries_count: int, confirmed_count: int,
               now: datetime) -> EventPosterOut:
    deadline = event_registration_deadline(event)
    return EventPosterOut(
        id=event.id, name=event.name, sport=event.sport, format=event.format, distance_km=event.distance_km,
        competition_type=event.competition_type, capacity=event.capacity, entries_count=entries_count,
        confirmed_count=confirmed_count, starts_at=event.starts_at, registration_closes_at=event.registration_closes_at,
        registration_deadline=deadline, city=CityOut.model_validate(city) if city is not None else None,
        venue=event.venue, price_cents=event.price_cents, accepted_tiers=event.accepted_tiers, state=event.state,
        phase=event_phase(event.state, registration_deadline=deadline, now=now),
        revocation_pending=event.revocation_decision == 'pendente')


def pix_out(event: Event) -> EventPixOut | None:
    """None for free events; drafts return whatever was filled so far."""
    if not event.price_cents:
        return None
    return EventPixOut(beneficiary=event.pix_beneficiary, key_type=event.pix_key_type, key=event.pix_key,
                       copy_paste=event.pix_copy_paste, instructions=event.pix_instructions)


def receipt_file_url(receipt_id: int) -> str:
    return f'/api/v1/receipts/{receipt_id}/file'


def receipt_out(receipt: EntryReceipt, media: MediaObject, uploaded_by: PersonOut | None) -> ReceiptOut:
    waiting = receipt.kind == 'devolucao' and receipt.participant_response is None
    return ReceiptOut(
        id=receipt.id, kind=receipt.kind, file_url=receipt_file_url(receipt.id),
        file_type='pdf' if media.content_type == 'application/pdf' else 'imagem', size_bytes=media.size_bytes,
        uploaded_by=uploaded_by, created_at=receipt.created_at, decision=receipt.decision,
        reason_code=receipt.reason_code, reason_detail=receipt.reason_detail, decided_at=receipt.decided_at,
        participant_response=receipt.participant_response, responded_at=receipt.responded_at,
        contest_reason=receipt.contest_reason,
        auto_confirm_at=refund_auto_confirm_at(receipt.created_at) if waiting else None,
        resolution=receipt.resolution, resolution_reason=receipt.resolution_reason, resolved_at=receipt.resolved_at)


def checklist_out(items: list[ChecklistItem]) -> list[ChecklistItemOut]:
    return [ChecklistItemOut(key=item.key, label=item.label, done=item.done, message=item.message) for item in items]


def pending_out(pending: PendingCounts) -> PendingCountsOut:
    return PendingCountsOut(receipts=pending.receipts, refunds_to_send=pending.refunds_to_send,
                            refunds_awaiting=pending.refunds_awaiting, refund_disputes=pending.refund_disputes,
                            total=pending.total)


def next_action_out(action: NextAction) -> NextActionOut:
    return NextActionOut(kind=action.kind, count=action.count, deadline=action.deadline)

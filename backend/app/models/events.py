"""Events, entries, payment and refund receipts and the notice channel (stage 2).

Times e campeonatos, fases 4 e 5, and Jogar, fase 7. Contracts in docs/decisoes/0003-times-campeonatos.md
(sections 10 and 12 to 19) and docs/decisoes/0002-jogar.md (section 6). Brackets and championship matches (fase 6)
come in a later migration; nothing here anticipates them.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, SmallInteger, String, Uuid, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, sql_in
from app.models.identity import utcnow
from app.models.organizers import SPORTS
from app.models.rankings import FOOTBALL_FORMATS, RUN_DISTANCES_KM, TIERS

EVENT_STATES = ('rascunho', 'em_aprovacao', 'publicado', 'em_andamento', 'encerrado', 'cancelado')
# States before publication; every other state has `published_at`.
UNPUBLISHED_EVENT_STATES = ('rascunho', 'em_aprovacao')
# Events that still belong to the organizer's open work (revocation asks the administration about these).
OPEN_EVENT_STATES = ('rascunho', 'em_aprovacao', 'publicado', 'em_andamento')
# States where athletes see the event (D2) and read its notices; drafts and the approval queue stay with the organizer.
VISIBLE_EVENT_STATES = ('publicado', 'em_andamento', 'encerrado', 'cancelado')
COMPETITION_TYPES = ('todos_contra_todos', 'eliminacao_simples')
ELIMINATION_CAPACITIES = (4, 8, 16)
PIX_KEY_TYPES = ('cpf', 'email', 'telefone', 'aleatoria')
EVENT_REFUSAL_REASONS = ('pix_incompleto', 'preco_ou_datas', 'conteudo_inadequado', 'outro')
# Administration's answer for an open event of a revoked organizer.
REVOCATION_DECISIONS = ('pendente', 'seguir', 'cancelado')

ENTRY_STATES = ('reservada', 'em_analise', 'confirmada', 'rejeitada', 'expirada', 'cancelada',
                'devolucao_pendente', 'devolucao_contestada', 'devolvida')
# States that hold a spot: they count toward capacity and allow one per team or athlete and event.
HOLDING_ENTRY_STATES = ('reservada', 'em_analise', 'confirmada', 'rejeitada')
REFUND_ENTRY_STATES = ('devolucao_pendente', 'devolucao_contestada', 'devolvida')
ENTRY_CANCEL_ORIGINS = ('participante', 'evento')

RECEIPT_KINDS = ('pagamento', 'devolucao')
RECEIPT_DECISIONS = ('aprovado', 'recusado')
RECEIPT_REFUSAL_REASONS = ('valor_diferente', 'favorecido_errado', 'comprovante_ilegivel', 'fora_do_prazo', 'outro')
REFUND_RESPONSES = ('confirmada', 'contestada', 'automatica')
REFUND_RESOLUTIONS = ('devolvida', 'pendente')


def _array_in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} <@ ARRAY[{', '.join(repr(value) for value in values)}]::varchar[]"


class Event(Base):
    """Championship (football, tennis) or race (running). Drafts may be incomplete; nothing else may."""
    __tablename__ = 'events'
    __table_args__ = (
        CheckConstraint(sql_in('state', EVENT_STATES), name='ck_events_state'),
        CheckConstraint(f"sport IS NULL OR {sql_in('sport', SPORTS)}", name='ck_events_sport'),
        CheckConstraint('char_length(name) BETWEEN 3 AND 60', name='ck_events_name_length'),
        CheckConstraint(f"format IS NULL OR {sql_in('format', FOOTBALL_FORMATS)}", name='ck_events_format'),
        CheckConstraint(f"distance_km IS NULL OR distance_km IN ({', '.join(map(str, RUN_DISTANCES_KM))})",
                        name='ck_events_distance'),
        CheckConstraint(f"competition_type IS NULL OR {sql_in('competition_type', COMPETITION_TYPES)}",
                        name='ck_events_competition_type'),
        # Football has a format and a type, tennis a type, running a distance and no type.
        CheckConstraint("(format IS NULL OR sport = 'futebol') AND (distance_km IS NULL OR sport = 'corrida') "
                        "AND (competition_type IS NULL OR sport IN ('futebol', 'tenis')) "
                        "AND (course_notes IS NULL OR sport = 'corrida')", name='ck_events_category'),
        CheckConstraint("capacity IS NULL OR (capacity BETWEEN 2 AND 5000 AND "
                        "(competition_type IS DISTINCT FROM 'eliminacao_simples' OR capacity IN (4, 8, 16)))",
                        name='ck_events_capacity'),
        # NULL means open to everyone (RN18); otherwise the accepted tiers.
        CheckConstraint(f"accepted_tiers IS NULL OR (cardinality(accepted_tiers) >= 1 AND "
                        f"{_array_in('accepted_tiers', TIERS)})", name='ck_events_accepted_tiers'),
        CheckConstraint('price_cents IS NULL OR price_cents = 0 OR price_cents BETWEEN 100 AND 1000000',
                        name='ck_events_price'),
        CheckConstraint(f"pix_key_type IS NULL OR {sql_in('pix_key_type', PIX_KEY_TYPES)}",
                        name='ck_events_pix_key_type'),
        CheckConstraint('registration_closes_at IS NULL OR starts_at IS NULL OR registration_closes_at <= starts_at',
                        name='ck_events_dates'),
        CheckConstraint(
            "state = 'rascunho' OR (sport IS NOT NULL AND city_id IS NOT NULL AND venue IS NOT NULL "
            "AND capacity IS NOT NULL AND starts_at IS NOT NULL AND registration_closes_at IS NOT NULL "
            "AND price_cents IS NOT NULL AND (sport <> 'futebol' OR format IS NOT NULL) "
            "AND (sport = 'corrida') = (distance_km IS NOT NULL) AND (sport = 'corrida') = (competition_type IS NULL) "
            "AND (price_cents = 0 OR (pix_beneficiary IS NOT NULL AND pix_key_type IS NOT NULL "
            "AND pix_key IS NOT NULL)))", name='ck_events_complete'),
        CheckConstraint("state <> 'em_aprovacao' OR (submitted_at IS NOT NULL AND price_cents > 0)",
                        name='ck_events_review'),
        CheckConstraint(f"(published_at IS NULL) = ({sql_in('state', UNPUBLISHED_EVENT_STATES)})",
                        name='ck_events_published'),
        # A refusal by the administration returns the event to draft with the reason.
        CheckConstraint(f"review_reason_code IS NULL OR (state = 'rascunho' AND "
                        f"{sql_in('review_reason_code', EVENT_REFUSAL_REASONS)})", name='ck_events_review_reason'),
        CheckConstraint("(state = 'cancelado') = (cancelled_at IS NOT NULL) AND "
                        "(cancelled_at IS NULL) = (cancel_reason IS NULL)", name='ck_events_cancelled'),
        CheckConstraint(f"revocation_decision IS NULL OR {sql_in('revocation_decision', REVOCATION_DECISIONS)}",
                        name='ck_events_revocation_decision'),
        CheckConstraint("COALESCE(revocation_decision IN ('seguir', 'cancelado'), false) = "
                        "(revocation_decided_at IS NOT NULL) AND (revocation_decision <> 'cancelado' OR state = 'cancelado')",
                        name='ck_events_revocation'),
        Index('ix_events_public', 'state', 'starts_at', 'id'),
        Index('ix_events_review_queue', 'submitted_at', 'id', postgresql_where=text("state = 'em_aprovacao'")),
        Index('ix_events_revocation_queue', 'id', postgresql_where=text("revocation_decision = 'pendente'")),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    # Owner used for authorization; users are deactivated, never deleted, so RESTRICT protects participants.
    organizer_user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), index=True)
    # Permission row active when the event was created (history; a later revocation does not erase it).
    organizer_id: Mapped[int | None] = mapped_column(ForeignKey('organizers.id', ondelete='SET NULL'), nullable=True)
    name: Mapped[str] = mapped_column(String(60))
    sport: Mapped[str | None] = mapped_column(String(10), nullable=True)
    format: Mapped[str | None] = mapped_column(String(10), nullable=True)
    distance_km: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    competition_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    capacity: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    accepted_tiers: Mapped[list[str] | None] = mapped_column(ARRAY(String(10)), nullable=True)
    city_id: Mapped[int | None] = mapped_column(ForeignKey('cities.id'), nullable=True, index=True)
    venue: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Running only: what the "Percurso" tab shows (start, finish, terrain).
    course_notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    registration_closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 0 is free; paid events go through the administration. Payment happens outside the Arena.
    price_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pix_beneficiary: Mapped[str | None] = mapped_column(String(80), nullable=True)
    pix_key_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    pix_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pix_copy_paste: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    pix_instructions: Mapped[str | None] = mapped_column(String(500), nullable=True)
    contact: Mapped[str | None] = mapped_column(String(120), nullable=True)
    state: Mapped[str] = mapped_column(String(15), default='rascunho')
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_reason_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    review_reason_detail: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    revocation_decision: Mapped[str | None] = mapped_column(String(10), nullable=True)
    revocation_decided_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'),
                                                                 nullable=True)
    revocation_decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class EventEntry(Base):
    """Entry of a team (football, made by a representative) or of an athlete (tennis, running)."""
    __tablename__ = 'event_entries'
    __table_args__ = (
        CheckConstraint('(team_id IS NULL) <> (user_id IS NULL)', name='ck_event_entries_subject'),
        CheckConstraint(sql_in('state', ENTRY_STATES), name='ck_event_entries_state'),
        CheckConstraint('price_cents >= 0', name='ck_event_entries_price'),
        # Free entries are confirmed at once (or cancelled); paid ones always carry the reservation deadline.
        CheckConstraint("(price_cents = 0) = (reserved_until IS NULL) AND "
                        "(price_cents > 0 OR state IN ('confirmada', 'cancelada'))", name='ck_event_entries_payment'),
        CheckConstraint("state <> 'confirmada' OR confirmed_at IS NOT NULL", name='ck_event_entries_confirmed'),
        CheckConstraint("(state = 'expirada') = (expired_at IS NOT NULL)", name='ck_event_entries_expired'),
        CheckConstraint(f"(state = 'cancelada') = (cancelled_at IS NOT NULL) AND (cancelled_at IS NULL) = "
                        f"(cancel_origin IS NULL) AND (cancel_origin IS NULL OR "
                        f"{sql_in('cancel_origin', ENTRY_CANCEL_ORIGINS)})", name='ck_event_entries_cancelled'),
        CheckConstraint("(state = 'devolvida') = (refunded_at IS NOT NULL)", name='ck_event_entries_refunded'),
        Index('uq_event_entries_team_active', 'event_id', 'team_id', unique=True,
              postgresql_where=text(f"team_id IS NOT NULL AND {sql_in('state', HOLDING_ENTRY_STATES)}")),
        Index('uq_event_entries_user_active', 'event_id', 'user_id', unique=True,
              postgresql_where=text(f"user_id IS NOT NULL AND {sql_in('state', HOLDING_ENTRY_STATES)}")),
        Index('ix_event_entries_event_state', 'event_id', 'state'),
        Index('ix_event_entries_reservations', 'reserved_until',
              postgresql_where=text("state IN ('reservada', 'rejeitada')")),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey('events.id', ondelete='CASCADE'))
    team_id: Mapped[int | None] = mapped_column(ForeignKey('teams.id', ondelete='CASCADE'), nullable=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=True, index=True)
    # Who entered: the representative (team) or the athlete.
    registered_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    state: Mapped[str] = mapped_column(String(25))
    # Copy of the event price at entry time (0 when free).
    price_cents: Mapped[int] = mapped_column(Integer)
    # End of the reservation: 48 h after entering or 12 h before the event, whichever comes first.
    reserved_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    cancel_origin: Mapped[str | None] = mapped_column(String(15), nullable=True)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class EntryReceipt(Base):
    """Every upload is a row: payment receipts (participant) and refund receipts (organizer) are never replaced."""
    __tablename__ = 'entry_receipts'
    __table_args__ = (
        CheckConstraint(sql_in('kind', RECEIPT_KINDS), name='ck_entry_receipts_kind'),
        # Payment receipts: decided by the organizer; a refusal has a reason code.
        CheckConstraint(f"decision IS NULL OR (kind = 'pagamento' AND {sql_in('decision', RECEIPT_DECISIONS)})",
                        name='ck_entry_receipts_decision'),
        CheckConstraint('(decision IS NULL) = (decided_at IS NULL)', name='ck_entry_receipts_decided'),
        CheckConstraint(f"COALESCE(decision = 'recusado', false) = (reason_code IS NOT NULL) AND "
                        f"(reason_code IS NULL OR {sql_in('reason_code', RECEIPT_REFUSAL_REASONS)}) AND "
                        "(reason_detail IS NULL OR reason_code IS NOT NULL)", name='ck_entry_receipts_reason'),
        # Refund receipts: confirmed or contested by the participant, or counted as received after 7 days.
        CheckConstraint(f"participant_response IS NULL OR (kind = 'devolucao' AND "
                        f"{sql_in('participant_response', REFUND_RESPONSES)})", name='ck_entry_receipts_response'),
        CheckConstraint('(participant_response IS NULL) = (responded_at IS NULL)', name='ck_entry_receipts_responded'),
        CheckConstraint("COALESCE(participant_response = 'contestada', false) = (contest_reason IS NOT NULL)",
                        name='ck_entry_receipts_contest'),
        CheckConstraint(f"resolution IS NULL OR (participant_response = 'contestada' AND "
                        f"{sql_in('resolution', REFUND_RESOLUTIONS)})", name='ck_entry_receipts_resolution'),
        CheckConstraint('(resolution IS NULL) = (resolved_at IS NULL) AND (resolution IS NULL) = '
                        '(resolution_reason IS NULL)', name='ck_entry_receipts_resolved'),
        # One payment receipt under analysis and one open refund receipt per entry.
        Index('uq_entry_receipts_payment_pending', 'entry_id', unique=True,
              postgresql_where=text("kind = 'pagamento' AND decision IS NULL")),
        Index('uq_entry_receipts_refund_open', 'entry_id', unique=True,
              postgresql_where=text("kind = 'devolucao' AND resolution IS NULL AND "
                                    "(participant_response IS NULL OR participant_response = 'contestada')")),
        Index('ix_entry_receipts_entry_created', 'entry_id', 'created_at', 'id'),
        Index('ix_entry_receipts_refund_waiting', 'created_at',
              postgresql_where=text("kind = 'devolucao' AND participant_response IS NULL")),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey('event_entries.id', ondelete='CASCADE'))
    kind: Mapped[str] = mapped_column(String(10))
    # Private object (image or PDF); RESTRICT keeps the file while the receipt exists.
    media_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('media_objects.id', ondelete='RESTRICT'),
                                           unique=True)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    decision: Mapped[str | None] = mapped_column(String(10), nullable=True)
    reason_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    reason_detail: Mapped[str | None] = mapped_column(String(300), nullable=True)
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    participant_response: Mapped[str | None] = mapped_column(String(12), nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Null for the automatic confirmation after 7 days.
    responded_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    contest_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Administration's answer to a contested refund: received ('devolvida') or back to the organizer ('pendente').
    resolution: Mapped[str | None] = mapped_column(String(10), nullable=True)
    resolution_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    resolved_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EventMessage(Base):
    """Notice channel of an event: the organizer writes, participants read; automatic notices too."""
    __tablename__ = 'event_messages'
    __table_args__ = (
        CheckConstraint('char_length(body) BETWEEN 1 AND 1000', name='ck_event_messages_body'),
        Index('ix_event_messages_event_created', 'event_id', 'created_at', 'id'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey('events.id', ondelete='CASCADE'))
    author_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    # 'aviso' (written by the organizer) or an automatic kind such as 'evento_cancelado'; validated in the
    # service, without CHECK, so later phases add kinds without a migration.
    kind: Mapped[str] = mapped_column(String(30))
    body: Mapped[str] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

"""Stage 2: events, entries, payment and refund receipts and the event notice channel.

Times e campeonatos (fases 4 e 5) and Jogar (fase 7). Contracts in docs/decisoes/0003-times-campeonatos.md and
docs/decisoes/0002-jogar.md. `media_objects.width/height` become nullable for PDF receipts, which are stored
without being rendered. `down_revision` is 0005 on purpose: the stage integrator re-chains it after the stage 1
fronts' migrations (0006 and 0007).
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = '0008'
down_revision = '0005'
branch_labels = None
depends_on = None

HOLDING = "state IN ('reservada', 'em_analise', 'confirmada', 'rejeitada')"


def _created_at():
    return sa.Column('created_at', sa.DateTime(timezone=True), nullable=False)


def _user(name, ondelete='SET NULL', nullable=True):
    return sa.Column(name, sa.Integer(), sa.ForeignKey('users.id', ondelete=ondelete), nullable=nullable)


def upgrade():
    op.alter_column('media_objects', 'width', existing_type=sa.Integer(), nullable=True)
    op.alter_column('media_objects', 'height', existing_type=sa.Integer(), nullable=True)

    op.create_table('events',
        sa.Column('id', sa.Integer(), primary_key=True),
        _user('organizer_user_id', 'RESTRICT', nullable=False),
        sa.Column('organizer_id', sa.Integer(), sa.ForeignKey('organizers.id', ondelete='SET NULL'), nullable=True),
        sa.Column('name', sa.String(60), nullable=False),
        sa.Column('sport', sa.String(10), nullable=True),
        sa.Column('format', sa.String(10), nullable=True),
        sa.Column('distance_km', sa.SmallInteger(), nullable=True),
        sa.Column('competition_type', sa.String(20), nullable=True),
        sa.Column('capacity', sa.SmallInteger(), nullable=True),
        sa.Column('accepted_tiers', postgresql.ARRAY(sa.String(10)), nullable=True),
        sa.Column('city_id', sa.Integer(), sa.ForeignKey('cities.id'), nullable=True),
        sa.Column('venue', sa.String(120), nullable=True),
        sa.Column('course_notes', sa.String(500), nullable=True),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('registration_closes_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('price_cents', sa.Integer(), nullable=True),
        sa.Column('pix_beneficiary', sa.String(80), nullable=True),
        sa.Column('pix_key_type', sa.String(10), nullable=True),
        sa.Column('pix_key', sa.String(100), nullable=True),
        sa.Column('pix_copy_paste', sa.String(1000), nullable=True),
        sa.Column('pix_instructions', sa.String(500), nullable=True),
        sa.Column('contact', sa.String(120), nullable=True),
        sa.Column('state', sa.String(15), nullable=False),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        _user('reviewed_by_id'),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('review_reason_code', sa.String(30), nullable=True),
        sa.Column('review_reason_detail', sa.String(500), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        _user('cancelled_by_id'),
        sa.Column('cancel_reason', sa.String(500), nullable=True),
        sa.Column('revocation_decision', sa.String(10), nullable=True),
        _user('revocation_decided_by_id'),
        sa.Column('revocation_decided_at', sa.DateTime(timezone=True), nullable=True),
        _created_at(),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("state IN ('rascunho', 'em_aprovacao', 'publicado', 'em_andamento', 'encerrado', "
                           "'cancelado')", name='ck_events_state'),
        sa.CheckConstraint("sport IS NULL OR sport IN ('futebol', 'tenis', 'corrida')", name='ck_events_sport'),
        sa.CheckConstraint('char_length(name) BETWEEN 3 AND 60', name='ck_events_name_length'),
        sa.CheckConstraint("format IS NULL OR format IN ('futsal', 'society', 'campo')", name='ck_events_format'),
        sa.CheckConstraint('distance_km IS NULL OR distance_km IN (3, 5, 10, 21, 42)', name='ck_events_distance'),
        sa.CheckConstraint("competition_type IS NULL OR competition_type IN ('todos_contra_todos', "
                           "'eliminacao_simples')", name='ck_events_competition_type'),
        sa.CheckConstraint("(format IS NULL OR sport = 'futebol') AND (distance_km IS NULL OR sport = 'corrida') "
                           "AND (competition_type IS NULL OR sport IN ('futebol', 'tenis')) "
                           "AND (course_notes IS NULL OR sport = 'corrida')", name='ck_events_category'),
        sa.CheckConstraint("capacity IS NULL OR (capacity BETWEEN 2 AND 5000 AND "
                           "(competition_type IS DISTINCT FROM 'eliminacao_simples' OR capacity IN (4, 8, 16)))",
                           name='ck_events_capacity'),
        sa.CheckConstraint("accepted_tiers IS NULL OR (cardinality(accepted_tiers) >= 1 AND accepted_tiers <@ "
                           "ARRAY['bronze', 'prata', 'ouro', 'diamante', 'lendario']::varchar[])",
                           name='ck_events_accepted_tiers'),
        sa.CheckConstraint('price_cents IS NULL OR price_cents = 0 OR price_cents BETWEEN 100 AND 1000000',
                           name='ck_events_price'),
        sa.CheckConstraint("pix_key_type IS NULL OR pix_key_type IN ('cpf', 'email', 'telefone', 'aleatoria')",
                           name='ck_events_pix_key_type'),
        sa.CheckConstraint('registration_closes_at IS NULL OR starts_at IS NULL OR registration_closes_at <= '
                           'starts_at', name='ck_events_dates'),
        sa.CheckConstraint(
            "state = 'rascunho' OR (sport IS NOT NULL AND city_id IS NOT NULL AND venue IS NOT NULL "
            "AND capacity IS NOT NULL AND starts_at IS NOT NULL AND registration_closes_at IS NOT NULL "
            "AND price_cents IS NOT NULL AND (sport <> 'futebol' OR format IS NOT NULL) "
            "AND (sport = 'corrida') = (distance_km IS NOT NULL) AND (sport = 'corrida') = (competition_type IS NULL) "
            "AND (price_cents = 0 OR (pix_beneficiary IS NOT NULL AND pix_key_type IS NOT NULL "
            "AND pix_key IS NOT NULL)))", name='ck_events_complete'),
        sa.CheckConstraint("state <> 'em_aprovacao' OR (submitted_at IS NOT NULL AND price_cents > 0)",
                           name='ck_events_review'),
        sa.CheckConstraint("(published_at IS NULL) = (state IN ('rascunho', 'em_aprovacao'))",
                           name='ck_events_published'),
        sa.CheckConstraint("review_reason_code IS NULL OR (state = 'rascunho' AND review_reason_code IN "
                           "('pix_incompleto', 'preco_ou_datas', 'conteudo_inadequado', 'outro'))",
                           name='ck_events_review_reason'),
        sa.CheckConstraint("(state = 'cancelado') = (cancelled_at IS NOT NULL) AND "
                           "(cancelled_at IS NULL) = (cancel_reason IS NULL)", name='ck_events_cancelled'),
        sa.CheckConstraint("revocation_decision IS NULL OR revocation_decision IN ('pendente', 'seguir', 'cancelado')",
                           name='ck_events_revocation_decision'),
        sa.CheckConstraint("COALESCE(revocation_decision IN ('seguir', 'cancelado'), false) = "
                           "(revocation_decided_at IS NOT NULL) AND (revocation_decision <> 'cancelado' OR "
                           "state = 'cancelado')", name='ck_events_revocation'),
    )
    op.create_index('ix_events_organizer_user_id', 'events', ['organizer_user_id'])
    op.create_index('ix_events_city_id', 'events', ['city_id'])
    op.create_index('ix_events_public', 'events', ['state', 'starts_at', 'id'])
    op.create_index('ix_events_review_queue', 'events', ['submitted_at', 'id'],
                    postgresql_where=sa.text("state = 'em_aprovacao'"))
    op.create_index('ix_events_revocation_queue', 'events', ['id'],
                    postgresql_where=sa.text("revocation_decision = 'pendente'"))

    op.create_table('event_entries',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('event_id', sa.Integer(), sa.ForeignKey('events.id', ondelete='CASCADE'), nullable=False),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=True),
        _user('user_id', 'CASCADE'),
        _user('registered_by_id'),
        sa.Column('state', sa.String(25), nullable=False),
        sa.Column('price_cents', sa.Integer(), nullable=False),
        sa.Column('reserved_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('confirmed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expired_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        _user('cancelled_by_id'),
        sa.Column('cancel_origin', sa.String(15), nullable=True),
        sa.Column('refunded_at', sa.DateTime(timezone=True), nullable=True),
        _created_at(),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint('(team_id IS NULL) <> (user_id IS NULL)', name='ck_event_entries_subject'),
        sa.CheckConstraint("state IN ('reservada', 'em_analise', 'confirmada', 'rejeitada', 'expirada', 'cancelada', "
                           "'devolucao_pendente', 'devolucao_contestada', 'devolvida')", name='ck_event_entries_state'),
        sa.CheckConstraint('price_cents >= 0', name='ck_event_entries_price'),
        sa.CheckConstraint("(price_cents = 0) = (reserved_until IS NULL) AND "
                           "(price_cents > 0 OR state IN ('confirmada', 'cancelada'))", name='ck_event_entries_payment'),
        sa.CheckConstraint("state <> 'confirmada' OR confirmed_at IS NOT NULL", name='ck_event_entries_confirmed'),
        sa.CheckConstraint("(state = 'expirada') = (expired_at IS NOT NULL)", name='ck_event_entries_expired'),
        sa.CheckConstraint("(state = 'cancelada') = (cancelled_at IS NOT NULL) AND (cancelled_at IS NULL) = "
                           "(cancel_origin IS NULL) AND (cancel_origin IS NULL OR cancel_origin IN "
                           "('participante', 'evento'))", name='ck_event_entries_cancelled'),
        sa.CheckConstraint("(state = 'devolvida') = (refunded_at IS NOT NULL)", name='ck_event_entries_refunded'),
    )
    op.create_index('ix_event_entries_team_id', 'event_entries', ['team_id'])
    op.create_index('ix_event_entries_user_id', 'event_entries', ['user_id'])
    op.create_index('ix_event_entries_event_state', 'event_entries', ['event_id', 'state'])
    op.create_index('ix_event_entries_reservations', 'event_entries', ['reserved_until'],
                    postgresql_where=sa.text("state IN ('reservada', 'rejeitada')"))
    op.create_index('uq_event_entries_team_active', 'event_entries', ['event_id', 'team_id'], unique=True,
                    postgresql_where=sa.text(f'team_id IS NOT NULL AND {HOLDING}'))
    op.create_index('uq_event_entries_user_active', 'event_entries', ['event_id', 'user_id'], unique=True,
                    postgresql_where=sa.text(f'user_id IS NOT NULL AND {HOLDING}'))

    op.create_table('entry_receipts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('entry_id', sa.Integer(), sa.ForeignKey('event_entries.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(10), nullable=False),
        sa.Column('media_id', sa.Uuid(), sa.ForeignKey('media_objects.id', ondelete='RESTRICT'), nullable=False,
                  unique=True),
        _user('uploaded_by_id'),
        _created_at(),
        sa.Column('decision', sa.String(10), nullable=True),
        sa.Column('reason_code', sa.String(30), nullable=True),
        sa.Column('reason_detail', sa.String(300), nullable=True),
        _user('decided_by_id'),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('participant_response', sa.String(12), nullable=True),
        sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
        _user('responded_by_id'),
        sa.Column('contest_reason', sa.String(500), nullable=True),
        sa.Column('resolution', sa.String(10), nullable=True),
        sa.Column('resolution_reason', sa.String(500), nullable=True),
        _user('resolved_by_id'),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("kind IN ('pagamento', 'devolucao')", name='ck_entry_receipts_kind'),
        sa.CheckConstraint("decision IS NULL OR (kind = 'pagamento' AND decision IN ('aprovado', 'recusado'))",
                           name='ck_entry_receipts_decision'),
        sa.CheckConstraint('(decision IS NULL) = (decided_at IS NULL)', name='ck_entry_receipts_decided'),
        sa.CheckConstraint("COALESCE(decision = 'recusado', false) = (reason_code IS NOT NULL) AND "
                           "(reason_code IS NULL OR reason_code IN ('valor_diferente', 'favorecido_errado', "
                           "'comprovante_ilegivel', 'fora_do_prazo', 'outro')) AND "
                           "(reason_detail IS NULL OR reason_code IS NOT NULL)", name='ck_entry_receipts_reason'),
        sa.CheckConstraint("participant_response IS NULL OR (kind = 'devolucao' AND participant_response IN "
                           "('confirmada', 'contestada', 'automatica'))", name='ck_entry_receipts_response'),
        sa.CheckConstraint('(participant_response IS NULL) = (responded_at IS NULL)',
                           name='ck_entry_receipts_responded'),
        sa.CheckConstraint("COALESCE(participant_response = 'contestada', false) = (contest_reason IS NOT NULL)",
                           name='ck_entry_receipts_contest'),
        sa.CheckConstraint("resolution IS NULL OR (participant_response = 'contestada' AND resolution IN "
                           "('devolvida', 'pendente'))", name='ck_entry_receipts_resolution'),
        sa.CheckConstraint('(resolution IS NULL) = (resolved_at IS NULL) AND (resolution IS NULL) = '
                           '(resolution_reason IS NULL)', name='ck_entry_receipts_resolved'),
    )
    op.create_index('ix_entry_receipts_entry_created', 'entry_receipts', ['entry_id', 'created_at', 'id'])
    op.create_index('ix_entry_receipts_refund_waiting', 'entry_receipts', ['created_at'],
                    postgresql_where=sa.text("kind = 'devolucao' AND participant_response IS NULL"))
    op.create_index('uq_entry_receipts_payment_pending', 'entry_receipts', ['entry_id'], unique=True,
                    postgresql_where=sa.text("kind = 'pagamento' AND decision IS NULL"))
    op.create_index('uq_entry_receipts_refund_open', 'entry_receipts', ['entry_id'], unique=True,
                    postgresql_where=sa.text("kind = 'devolucao' AND resolution IS NULL AND "
                                             "(participant_response IS NULL OR participant_response = 'contestada')"))

    op.create_table('event_messages',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('event_id', sa.Integer(), sa.ForeignKey('events.id', ondelete='CASCADE'), nullable=False),
        _user('author_id'),
        sa.Column('kind', sa.String(30), nullable=False),
        sa.Column('body', sa.String(1000), nullable=False),
        _created_at(),
        sa.CheckConstraint('char_length(body) BETWEEN 1 AND 1000', name='ck_event_messages_body'),
    )
    op.create_index('ix_event_messages_event_created', 'event_messages', ['event_id', 'created_at', 'id'])


def downgrade():
    # Dropping a table also drops its indexes and constraints. Receipt objects stay in the bucket under
    # `receipts/`; nothing in the older revisions references them.
    for table in ('event_messages', 'entry_receipts', 'event_entries', 'events'):
        op.drop_table(table)
    # PDF receipts have no pixel size; 0 keeps the rows valid under the older NOT NULL columns.
    op.execute('UPDATE media_objects SET width = 0 WHERE width IS NULL')
    op.execute('UPDATE media_objects SET height = 0 WHERE height IS NULL')
    op.alter_column('media_objects', 'height', existing_type=sa.Integer(), nullable=False)
    op.alter_column('media_objects', 'width', existing_type=sa.Integer(), nullable=False)

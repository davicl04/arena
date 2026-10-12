"""Stage 1: teams, invites, link requests, organizer permission, notifications, audit log and tiers.

Times e campeonatos (fases 1 a 3) and Jogar (fase 1). Standings start empty; rank_cuts receives the
initial cuts (calc_version 1) from docs/plano-jogar.md, to be calibrated with real data before publishing.
"""
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None

POSITIONS = "('goleiro', 'defesa', 'meio_campo', 'atacante')"

# Frozen copy of the plan's table: (ranking, metric, direction, prata, ouro, diamante, placement matches).
# Times are in seconds and lower is better; Bronze is anything that does not reach Prata.
CUTS_V1 = (
    ('futebol_time', 'pontos', 'maior', 10, 30, 60, 3),
    ('futebol_individual', 'media', 'maior', 2.5, 4.0, 5.5, 3),
    ('tenis', 'pontos', 'maior', 30, 80, 150, 3),
    ('corrida_3', 'tempo', 'menor', 20 * 60, 15 * 60, 12 * 60, 1),
    ('corrida_5', 'tempo', 'menor', 35 * 60, 27 * 60, 22 * 60, 1),
    ('corrida_10', 'tempo', 'menor', 75 * 60, 57 * 60, 47 * 60, 1),
    ('corrida_21', 'tempo', 'menor', 165 * 60, 125 * 60, 105 * 60, 1),
    ('corrida_42', 'tempo', 'menor', 345 * 60, 260 * 60, 220 * 60, 1),
)
LEGEND_SHARE = 0.15
WINDOW_WEEKS = 52


def _created_at():
    return sa.Column('created_at', sa.DateTime(timezone=True), nullable=False)


def upgrade():
    op.create_table('notifications',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('actor_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('type', sa.String(40), nullable=False),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"),
                  nullable=False),
        _created_at(),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_notifications_user_created', 'notifications', ['user_id', 'created_at', 'id'])
    op.create_index('ix_notifications_user_unread', 'notifications', ['user_id'],
                    postgresql_where=sa.text('read_at IS NULL'))

    op.create_table('audit_log',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('actor_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('action', sa.String(60), nullable=False),
        sa.Column('target_type', sa.String(30), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=True),
        sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"),
                  nullable=False),
        _created_at(),
    )
    op.create_index('ix_audit_log_actor_id', 'audit_log', ['actor_id'])
    op.create_index('ix_audit_log_created_at', 'audit_log', ['created_at'])
    op.create_index('ix_audit_log_target', 'audit_log', ['target_type', 'target_id'])

    op.create_table('teams',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(40), nullable=False),
        sa.Column('city_id', sa.Integer(), sa.ForeignKey('cities.id'), nullable=False),
        sa.Column('crest_media_id', sa.Uuid(), sa.ForeignKey('media_objects.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('state', sa.String(12), nullable=False),
        sa.Column('link_nonce', sa.String(64), nullable=True),
        sa.Column('link_token_hash', sa.String(64), nullable=True, unique=True),
        sa.Column('link_generated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('closed_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        _created_at(),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("state IN ('ativo', 'encerrado')", name='ck_teams_state'),
        sa.CheckConstraint("(state = 'encerrado') = (closed_at IS NOT NULL)", name='ck_teams_closed'),
        sa.CheckConstraint('char_length(name) BETWEEN 3 AND 40', name='ck_teams_name_length'),
        sa.CheckConstraint("(link_nonce IS NULL) = (link_token_hash IS NULL) AND (link_nonce IS NULL) = "
                           "(link_generated_at IS NULL) AND (state = 'ativo' OR link_nonce IS NULL)", name='ck_teams_link'),
    )
    op.create_index('ix_teams_city_id', 'teams', ['city_id'])
    op.create_index('ix_teams_created_by_id', 'teams', ['created_by_id'])

    op.create_table('team_members',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('position', sa.String(20), nullable=True),
        sa.Column('joined_via', sa.String(10), nullable=False),
        sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('left_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('left_reason', sa.String(20), nullable=True),
        sa.Column('removed_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.CheckConstraint("role IN ('representante', 'membro')", name='ck_team_members_role'),
        sa.CheckConstraint(f'position IS NULL OR position IN {POSITIONS}', name='ck_team_members_position'),
        sa.CheckConstraint("joined_via IN ('criacao', 'convite', 'pedido')", name='ck_team_members_joined_via'),
        sa.CheckConstraint("left_reason IS NULL OR left_reason IN ('saiu', 'removido', 'time_encerrado')",
                           name='ck_team_members_left_reason'),
        sa.CheckConstraint('(left_at IS NULL) = (left_reason IS NULL)', name='ck_team_members_left'),
    )
    op.create_index('ix_team_members_team_id', 'team_members', ['team_id'])
    op.create_index('ix_team_members_user_id', 'team_members', ['user_id'])
    op.create_index('uq_team_members_active', 'team_members', ['team_id', 'user_id'], unique=True,
                    postgresql_where=sa.text('left_at IS NULL'))

    op.create_table('team_invites',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=False),
        sa.Column('invitee_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('inviter_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('message', sa.String(140), nullable=True),
        sa.Column('state', sa.String(10), nullable=False),
        _created_at(),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('decided_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.CheckConstraint("state IN ('pendente', 'aceito', 'recusado', 'cancelado')", name='ck_team_invites_state'),
        sa.CheckConstraint("(state = 'pendente') = (decided_at IS NULL)", name='ck_team_invites_decided'),
    )
    op.create_index('ix_team_invites_team_id', 'team_invites', ['team_id'])
    op.create_index('ix_team_invites_invitee_id', 'team_invites', ['invitee_id'])
    op.create_index('uq_team_invites_pending', 'team_invites', ['team_id', 'invitee_id'], unique=True,
                    postgresql_where=sa.text("state = 'pendente'"))

    op.create_table('team_join_requests',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('state', sa.String(10), nullable=False),
        _created_at(),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('decided_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.CheckConstraint("state IN ('pendente', 'aprovado', 'recusado', 'cancelado')",
                           name='ck_team_join_requests_state'),
        sa.CheckConstraint("(state = 'pendente') = (decided_at IS NULL)", name='ck_team_join_requests_decided'),
    )
    op.create_index('ix_team_join_requests_team_id', 'team_join_requests', ['team_id'])
    op.create_index('ix_team_join_requests_user_id', 'team_join_requests', ['user_id'])
    op.create_index('uq_team_join_requests_pending', 'team_join_requests', ['team_id', 'user_id'], unique=True,
                    postgresql_where=sa.text("state = 'pendente'"))

    op.create_table('organizer_requests',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('display_name', sa.String(80), nullable=False),
        sa.Column('city_id', sa.Integer(), sa.ForeignKey('cities.id'), nullable=False),
        sa.Column('sports', postgresql.ARRAY(sa.String(20)), nullable=False),
        sa.Column('experience', sa.String(1000), nullable=True),
        sa.Column('contact', sa.String(120), nullable=False),
        sa.Column('link', sa.String(300), nullable=True),
        sa.Column('terms_version', sa.SmallInteger(), nullable=False),
        sa.Column('terms_accepted_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('state', sa.String(12), nullable=False),
        sa.Column('reason_code', sa.String(30), nullable=True),
        sa.Column('reason_detail', sa.String(500), nullable=True),
        sa.Column('decided_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        _created_at(),
        sa.CheckConstraint("state IN ('em_analise', 'aprovado', 'recusado', 'cancelado')",
                           name='ck_organizer_requests_state'),
        sa.CheckConstraint("(state = 'em_analise') = (decided_at IS NULL)", name='ck_organizer_requests_decided'),
        sa.CheckConstraint("reason_code IS NULL OR reason_code IN ('contato_nao_funciona', 'pouca_informacao', "
                           "'pedido_repetido', 'outro')", name='ck_organizer_requests_reason_code'),
        sa.CheckConstraint("state <> 'recusado' OR reason_code IS NOT NULL", name='ck_organizer_requests_refusal'),
        sa.CheckConstraint("cardinality(sports) >= 1 AND sports <@ ARRAY['futebol', 'tenis', 'corrida']::varchar[]",
                           name='ck_organizer_requests_sports'),
    )
    op.create_index('ix_organizer_requests_user_id', 'organizer_requests', ['user_id'])
    op.create_index('uq_organizer_requests_pending', 'organizer_requests', ['user_id'], unique=True,
                    postgresql_where=sa.text("state = 'em_analise'"))

    op.create_table('organizers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('request_id', sa.Integer(), sa.ForeignKey('organizer_requests.id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('display_name', sa.String(80), nullable=False),
        sa.Column('approved_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('revoke_reason', sa.String(500), nullable=True),
        sa.CheckConstraint('(revoked_at IS NULL) = (revoke_reason IS NULL)', name='ck_organizers_revoked'),
    )
    op.create_index('ix_organizers_user_id', 'organizers', ['user_id'])
    op.create_index('uq_organizers_active', 'organizers', ['user_id'], unique=True,
                    postgresql_where=sa.text('revoked_at IS NULL'))

    rank_cuts = op.create_table('rank_cuts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('calc_version', sa.SmallInteger(), nullable=False),
        sa.Column('ranking', sa.String(20), nullable=False),
        sa.Column('metric', sa.String(10), nullable=False),
        sa.Column('direction', sa.String(5), nullable=False),
        sa.Column('prata', sa.Numeric(10, 2), nullable=False),
        sa.Column('ouro', sa.Numeric(10, 2), nullable=False),
        sa.Column('diamante', sa.Numeric(10, 2), nullable=False),
        sa.Column('placement_matches', sa.SmallInteger(), nullable=False),
        sa.Column('legend_share', sa.Numeric(4, 3), nullable=False),
        sa.Column('window_weeks', sa.SmallInteger(), nullable=False),
        _created_at(),
        sa.UniqueConstraint('calc_version', 'ranking', name='uq_rank_cuts_version_ranking'),
        sa.CheckConstraint("ranking IN ('futebol_time', 'futebol_individual', 'tenis', 'corrida_3', 'corrida_5', "
                           "'corrida_10', 'corrida_21', 'corrida_42')", name='ck_rank_cuts_ranking'),
        sa.CheckConstraint("metric IN ('pontos', 'media', 'tempo')", name='ck_rank_cuts_metric'),
        sa.CheckConstraint("(direction = 'maior' AND prata < ouro AND ouro < diamante) OR "
                           "(direction = 'menor' AND prata > ouro AND ouro > diamante)", name='ck_rank_cuts_order'),
        sa.CheckConstraint('placement_matches >= 1 AND window_weeks >= 1 AND legend_share > 0 AND legend_share < 1',
                           name='ck_rank_cuts_parameters'),
    )
    now = datetime.now(timezone.utc)
    op.bulk_insert(rank_cuts, [
        {'calc_version': 1, 'ranking': ranking, 'metric': metric, 'direction': direction, 'prata': prata,
         'ouro': ouro, 'diamante': diamante, 'placement_matches': placement, 'legend_share': LEGEND_SHARE,
         'window_weeks': WINDOW_WEEKS, 'created_at': now}
        for ranking, metric, direction, prata, ouro, diamante, placement in CUTS_V1
    ])

    op.create_table('standings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True),
        sa.Column('sport', sa.String(20), nullable=False),
        sa.Column('format', sa.String(10), nullable=True),
        sa.Column('position', sa.String(20), nullable=True),
        sa.Column('distance_km', sa.SmallInteger(), nullable=True),
        sa.Column('metric_value', sa.Numeric(12, 3), nullable=False),
        sa.Column('matches_played', sa.Integer(), nullable=False),
        sa.Column('rank_position', sa.Integer(), nullable=True),
        sa.Column('tier', sa.String(10), nullable=True),
        sa.Column('calc_version', sa.SmallInteger(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint('(team_id IS NULL) <> (user_id IS NULL)', name='ck_standings_subject'),
        sa.CheckConstraint("sport IN ('futebol', 'tenis', 'corrida')", name='ck_standings_sport'),
        sa.CheckConstraint("format IS NULL OR format IN ('futsal', 'society', 'campo')", name='ck_standings_format'),
        sa.CheckConstraint(f'position IS NULL OR position IN {POSITIONS}', name='ck_standings_position'),
        sa.CheckConstraint('distance_km IS NULL OR distance_km IN (3, 5, 10, 21, 42)', name='ck_standings_distance'),
        sa.CheckConstraint(
            "(sport = 'futebol' AND format IS NOT NULL AND distance_km IS NULL AND "
            "((team_id IS NOT NULL AND position IS NULL) OR (user_id IS NOT NULL AND position IS NOT NULL))) OR "
            "(sport = 'tenis' AND user_id IS NOT NULL AND format IS NULL AND position IS NULL AND distance_km IS NULL) OR "
            "(sport = 'corrida' AND user_id IS NOT NULL AND distance_km IS NOT NULL AND format IS NULL "
            "AND position IS NULL)", name='ck_standings_category'),
        sa.CheckConstraint("tier IS NULL OR tier IN ('bronze', 'prata', 'ouro', 'diamante', 'lendario')",
                           name='ck_standings_tier'),
        sa.CheckConstraint('(tier IS NULL) = (rank_position IS NULL)', name='ck_standings_ranked'),
        sa.CheckConstraint('matches_played >= 0 AND (rank_position IS NULL OR rank_position >= 1)',
                           name='ck_standings_counts'),
    )
    op.create_index('ix_standings_team_id', 'standings', ['team_id'])
    op.create_index('ix_standings_user_id', 'standings', ['user_id'])
    op.create_index('uq_standings_team', 'standings', ['team_id', 'format'], unique=True,
                    postgresql_where=sa.text('team_id IS NOT NULL'))
    op.create_index('uq_standings_user_futebol', 'standings', ['user_id', 'format', 'position'], unique=True,
                    postgresql_where=sa.text("user_id IS NOT NULL AND sport = 'futebol'"))
    op.create_index('uq_standings_user_tenis', 'standings', ['user_id'], unique=True,
                    postgresql_where=sa.text("sport = 'tenis'"))
    op.create_index('uq_standings_user_corrida', 'standings', ['user_id', 'distance_km'], unique=True,
                    postgresql_where=sa.text("sport = 'corrida'"))


def downgrade():
    # Dropping a table also drops its indexes and constraints.
    for table in ('standings', 'rank_cuts', 'organizers', 'organizer_requests', 'team_join_requests',
                  'team_invites', 'team_members', 'teams', 'audit_log', 'notifications'):
        op.drop_table(table)

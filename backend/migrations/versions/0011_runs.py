"""Stage 5: running marks (`runs`).

Jogar, fase 6. Contract in docs/decisoes/0002-jogar.md (section 18). The ranking cuts of the five distances
(`corrida_3` to `corrida_42`, calc_version 1) were already inserted by 0005 and `standings` already accepts running
rows, so this migration only adds the table of marks.

Comes after 0010 (championship brackets).
"""
import sqlalchemy as sa
from alembic import op

revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('runs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('distance_m', sa.Integer(), nullable=False),
        sa.Column('duration_s', sa.Integer(), nullable=False),
        sa.Column('ran_on', sa.Date(), nullable=False),
        sa.Column('source', sa.String(10), nullable=False),
        sa.Column('event_entry_id', sa.Integer(), sa.ForeignKey('event_entries.id'), nullable=True),
        sa.Column('standard_distance_km', sa.SmallInteger(), nullable=True),
        sa.Column('verified', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("source IN ('treino', 'prova')", name='ck_runs_source'),
        sa.CheckConstraint('distance_m BETWEEN 1000 AND 100000', name='ck_runs_distance'),
        sa.CheckConstraint('duration_s BETWEEN 1 AND 86400', name='ck_runs_duration'),
        sa.CheckConstraint('standard_distance_km IS NULL OR standard_distance_km IN (3, 5, 10, 21, 42)',
                           name='ck_runs_standard'),
        sa.CheckConstraint("(source = 'prova') = (event_entry_id IS NOT NULL) AND "
                           "(source <> 'prova' OR standard_distance_km IS NOT NULL)", name='ck_runs_origin'),
        sa.CheckConstraint("source = 'prova' OR NOT verified", name='ck_runs_verified'),
    )
    op.create_index('ix_runs_user_history', 'runs', ['user_id', 'ran_on', 'id'])
    op.create_index('ix_runs_ranking', 'runs', ['standard_distance_km', 'ran_on', 'user_id'])
    op.create_index('uq_runs_entry', 'runs', ['event_entry_id'], unique=True,
                    postgresql_where=sa.text('event_entry_id IS NOT NULL'))


def downgrade():
    # The running rows of `standings` are derived from the marks that are going away.
    op.execute("DELETE FROM standings WHERE sport = 'corrida'")
    op.drop_index('uq_runs_entry', table_name='runs')
    op.drop_index('ix_runs_ranking', table_name='runs')
    op.drop_index('ix_runs_user_history', table_name='runs')
    op.drop_table('runs')

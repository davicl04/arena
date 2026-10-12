"""Stage 4: event brackets, decisions of the organizer and final placements of championships.

Times e campeonatos, fases 6 e 7. Contracts in docs/decisoes/0003-times-campeonatos.md (section 21) and
docs/decisoes/0002-jogar.md (section 17). The championship matches themselves use the columns of `matches` created
in 0009 (origin, event, round, bracket position, next match); this migration only adds the draw before the matches
exist (`event_brackets`), the decision that settles a divergence, a missing result or a walkover
(`result_decisions`) and the placements that give the tennis bonus of RN16 (`event_placements`).
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('event_brackets',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('event_id', sa.Integer(), sa.ForeignKey('events.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(20), nullable=False),
        sa.Column('state', sa.String(10), nullable=False),
        sa.Column('seed', sa.BigInteger(), nullable=False),
        sa.Column('size', sa.SmallInteger(), nullable=False),
        sa.Column('slots', postgresql.JSONB(), nullable=False),
        sa.Column('swaps', postgresql.JSONB(), nullable=False),
        sa.Column('draw_count', sa.SmallInteger(), nullable=False),
        sa.Column('drawn_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('drawn_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('confirmed_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('confirmed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('todos_contra_todos', 'eliminacao_simples')", name='ck_event_brackets_kind'),
        sa.CheckConstraint("state IN ('sorteado', 'confirmado')", name='ck_event_brackets_state'),
        sa.CheckConstraint('size BETWEEN 2 AND 32 AND draw_count >= 1', name='ck_event_brackets_size'),
        sa.CheckConstraint("(state = 'confirmado') = (confirmed_at IS NOT NULL)", name='ck_event_brackets_confirmed'),
    )
    op.create_index('uq_event_brackets_event', 'event_brackets', ['event_id'], unique=True)

    op.create_table('result_decisions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('match_id', sa.Integer(), sa.ForeignKey('matches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event_id', sa.Integer(), sa.ForeignKey('events.id', ondelete='CASCADE'), nullable=False),
        sa.Column('decided_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('kind', sa.String(12), nullable=False),
        sa.Column('score_a', sa.SmallInteger(), nullable=False),
        sa.Column('score_b', sa.SmallInteger(), nullable=False),
        sa.Column('sets', postgresql.JSONB(), nullable=True),
        sa.Column('winner_side', sa.String(1), nullable=True),
        sa.Column('walkover_absent_side', sa.String(1), nullable=True),
        sa.Column('justification', sa.String(500), nullable=False),
        sa.Column('reports', postgresql.JSONB(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('divergencia', 'prazo', 'wo')", name='ck_result_decisions_kind'),
        sa.CheckConstraint('char_length(justification) BETWEEN 5 AND 500', name='ck_result_decisions_justification'),
        sa.CheckConstraint('score_a BETWEEN 0 AND 99 AND score_b BETWEEN 0 AND 99', name='ck_result_decisions_score'),
        sa.CheckConstraint("winner_side IS NULL OR winner_side IN ('a', 'b')", name='ck_result_decisions_winner'),
        sa.CheckConstraint("(kind = 'wo') = (walkover_absent_side IS NOT NULL) AND "
                           "(walkover_absent_side IS NULL OR walkover_absent_side IN ('a', 'b'))",
                           name='ck_result_decisions_walkover'),
    )
    op.create_index('uq_result_decisions_match', 'result_decisions', ['match_id'], unique=True)
    op.create_index('ix_result_decisions_event', 'result_decisions', ['event_id', 'created_at'])

    op.create_table('event_placements',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('event_id', sa.Integer(), sa.ForeignKey('events.id', ondelete='CASCADE'), nullable=False),
        sa.Column('entry_id', sa.Integer(), sa.ForeignKey('event_entries.id', ondelete='CASCADE'), nullable=False),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True),
        sa.Column('placement', sa.SmallInteger(), nullable=False),
        sa.Column('bonus_points', sa.SmallInteger(), nullable=False),
        sa.Column('awarded_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint('placement >= 1 AND bonus_points >= 0', name='ck_event_placements_values'),
        sa.CheckConstraint('(team_id IS NULL) <> (user_id IS NULL)', name='ck_event_placements_subject'),
    )
    op.create_index('uq_event_placements_entry', 'event_placements', ['event_id', 'entry_id'], unique=True)
    op.create_index('ix_event_placements_bonus', 'event_placements', ['user_id', 'awarded_at'],
                    postgresql_where=sa.text('bonus_points > 0'))


def downgrade():
    # Dropping a table drops its indexes and constraints.
    for table in ('event_placements', 'result_decisions', 'event_brackets'):
        op.drop_table(table)

"""Initial identity and sports profiles with a curated IBGE city catalog."""
import sqlalchemy as sa
from alembic import op

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('cities', sa.Column('id', sa.Integer(), primary_key=True, autoincrement=False),
                    sa.Column('name', sa.String(100), nullable=False), sa.Column('state', sa.String(2), nullable=False))
    op.bulk_insert(sa.table('cities', sa.column('id', sa.Integer()), sa.column('name', sa.String()), sa.column('state', sa.String())), [
        {'id': 5300108, 'name': 'Brasília', 'state': 'DF'},
        {'id': 3550308, 'name': 'São Paulo', 'state': 'SP'},
        {'id': 3304557, 'name': 'Rio de Janeiro', 'state': 'RJ'},
        {'id': 2304400, 'name': 'Fortaleza', 'state': 'CE'},
        {'id': 3106200, 'name': 'Belo Horizonte', 'state': 'MG'},
        {'id': 5208707, 'name': 'Goiânia', 'state': 'GO'},
    ])
    op.create_table('users',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('email', sa.String(254), nullable=False, unique=True),
        sa.Column('birth_date', sa.Date(), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False))
    op.create_table('auth_sessions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token_hash', sa.String(64), nullable=False, unique=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_auth_sessions_user_id', 'auth_sessions', ['user_id'])
    op.create_table('sports_profiles',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sport', sa.String(20), nullable=False),
        sa.Column('city_id', sa.Integer(), sa.ForeignKey('cities.id'), nullable=False),
        sa.Column('position', sa.String(20)),
        sa.Column('looking_for', sa.Boolean(), nullable=False),
        sa.Column('is_public', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('user_id', 'sport', name='uq_profile_user_sport'),
        sa.CheckConstraint("sport IN ('futebol', 'tenis', 'corrida')", name='ck_profile_sport'),
        sa.CheckConstraint("position IS NULL OR (sport = 'futebol' AND position IN ('goleiro', 'defesa', 'meio_campo', 'atacante'))", name='ck_profile_position'))
    op.create_index('ix_sports_profiles_user_id', 'sports_profiles', ['user_id'])


def downgrade():
    op.drop_table('sports_profiles')
    op.drop_table('auth_sessions')
    op.drop_table('users')
    op.drop_table('cities')

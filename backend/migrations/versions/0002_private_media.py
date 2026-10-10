"""Private media objects and nullable user avatar reference."""
import sqlalchemy as sa
from alembic import op

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'media_objects',
        sa.Column('id', sa.Uuid(), primary_key=True, nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('bucket', sa.String(63), nullable=False),
        sa.Column('object_key', sa.String(200), nullable=False, unique=True),
        sa.Column('content_type', sa.String(50), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('width', sa.Integer(), nullable=False),
        sa.Column('height', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_media_objects_user_id', 'media_objects', ['user_id'])
    op.add_column('users', sa.Column('avatar_media_id', sa.Uuid(), nullable=True))
    op.create_foreign_key('fk_users_avatar_media_id_media_objects', 'users', 'media_objects',
                          ['avatar_media_id'], ['id'], ondelete='SET NULL')


def downgrade():
    op.drop_constraint('fk_users_avatar_media_id_media_objects', 'users', type_='foreignkey')
    op.drop_column('users', 'avatar_media_id')
    op.drop_index('ix_media_objects_user_id', table_name='media_objects')
    op.drop_table('media_objects')

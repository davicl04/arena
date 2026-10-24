"""Notifications with a pending action.

Adds the key of the object that asks for an answer (`action_key`), the deadline (`action_until`) and when it was
resolved (`resolved_at`). The category is derived from the type in the service, so it is not a column.
Contract in docs/decisoes/0003-times-campeonatos.md (section 7).

Comes after 0011 (running marks).
"""
import sqlalchemy as sa
from alembic import op

revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None

OPEN_ACTION = sa.text('resolved_at IS NULL AND action_key IS NOT NULL')


def upgrade():
    op.add_column('notifications', sa.Column('action_key', sa.String(80), nullable=True))
    op.add_column('notifications', sa.Column('action_until', sa.DateTime(timezone=True), nullable=True))
    op.add_column('notifications', sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_notifications_action_open', 'notifications', ['action_key'], postgresql_where=OPEN_ACTION)
    op.create_index('ix_notifications_user_pending', 'notifications', ['user_id'], postgresql_where=OPEN_ACTION)


def downgrade():
    op.drop_index('ix_notifications_user_pending', table_name='notifications')
    op.drop_index('ix_notifications_action_open', table_name='notifications')
    op.drop_column('notifications', 'resolved_at')
    op.drop_column('notifications', 'action_until')
    op.drop_column('notifications', 'action_key')

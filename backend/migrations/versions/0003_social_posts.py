"""Social profiles, posts, interactions and moderation."""
import sqlalchemy as sa
from alembic import op

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('social_public', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table('posts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('media_id', sa.Uuid(), sa.ForeignKey('media_objects.id', ondelete='RESTRICT'), nullable=False, unique=True),
        sa.Column('caption', sa.String(2200), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_posts_user_id', 'posts', ['user_id'])
    op.create_index('ix_posts_created_at', 'posts', ['created_at'])
    op.create_index('ix_posts_created_id', 'posts', ['created_at', 'id'])
    op.create_table('post_likes',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('post_id', sa.Integer(), sa.ForeignKey('posts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('post_id', 'user_id', name='uq_post_like_user'),
    )
    op.create_index('ix_post_likes_post_id', 'post_likes', ['post_id'])
    op.create_index('ix_post_likes_user_id', 'post_likes', ['user_id'])
    op.create_table('post_comments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('post_id', sa.Integer(), sa.ForeignKey('posts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('body', sa.String(1000), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_post_comments_post_id', 'post_comments', ['post_id'])
    op.create_index('ix_post_comments_user_id', 'post_comments', ['user_id'])
    op.create_index('ix_post_comments_created_at', 'post_comments', ['created_at'])
    op.create_table('follows',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('follower_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('followed_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('approved', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('follower_id', 'followed_id', name='uq_follow_pair'),
        sa.CheckConstraint('follower_id <> followed_id', name='ck_follow_not_self'),
    )
    op.create_index('ix_follows_follower_id', 'follows', ['follower_id'])
    op.create_index('ix_follows_followed_id', 'follows', ['followed_id'])
    op.create_table('user_blocks',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('blocker_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('blocked_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('blocker_id', 'blocked_id', name='uq_user_block_pair'),
        sa.CheckConstraint('blocker_id <> blocked_id', name='ck_block_not_self'),
    )
    op.create_index('ix_user_blocks_blocker_id', 'user_blocks', ['blocker_id'])
    op.create_index('ix_user_blocks_blocked_id', 'user_blocks', ['blocked_id'])
    op.create_table('content_reports',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('reporter_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('target_type', sa.String(20), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('reason', sa.String(30), nullable=False),
        sa.Column('description', sa.String(1000), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_content_reports_reporter_id', 'content_reports', ['reporter_id'])
    op.create_index('ix_content_reports_status', 'content_reports', ['status'])
    op.create_table('moderation_actions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('admin_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('report_id', sa.Integer(), sa.ForeignKey('content_reports.id', ondelete='SET NULL'), nullable=True),
        sa.Column('target_type', sa.String(20), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('action', sa.String(30), nullable=False),
        sa.Column('justification', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_moderation_actions_admin_id', 'moderation_actions', ['admin_id'])
    op.create_index('ix_moderation_actions_report_id', 'moderation_actions', ['report_id'])


def downgrade():
    op.drop_table('moderation_actions')
    op.drop_table('content_reports')
    op.drop_table('user_blocks')
    op.drop_table('follows')
    op.drop_table('post_comments')
    op.drop_table('post_likes')
    op.drop_table('posts')
    op.drop_column('users', 'is_admin')
    op.drop_column('users', 'social_public')

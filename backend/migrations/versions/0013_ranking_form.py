"""Recent form and best mark day of the rankings.

Adds `standings.recent_form` (the last 5 results, oldest first, as V/E/D letters) and `standings.best_mark_on` (running:
the first day of the best time) and the partial index of the tier filter of `GET /rankings`. The migration does not
call application services: existing rows start with an empty form; `python -m app.admin_cli recalculate-rankings`
fills them once per environment (idempotent). Contract in docs/decisoes/0002-jogar.md (section 20).

Comes after 0012 (notification actions).
"""
import sqlalchemy as sa
from alembic import op

revision = '0013'
down_revision = '0012'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('standings', sa.Column('recent_form', sa.String(5), nullable=False, server_default=''))
    op.add_column('standings', sa.Column('best_mark_on', sa.Date(), nullable=True))
    op.create_check_constraint('ck_standings_recent_form', 'standings', "recent_form ~ '^[VED]{0,5}$'")
    op.create_check_constraint('ck_standings_best_mark', 'standings', "sport = 'corrida' OR best_mark_on IS NULL")
    op.create_index('ix_standings_ranking_tier', 'standings',
                    ['sport', 'format', 'position', 'distance_km', 'tier', 'rank_position'],
                    postgresql_where=sa.text('rank_position IS NOT NULL'))


def downgrade():
    op.drop_index('ix_standings_ranking_tier', table_name='standings')
    op.drop_constraint('ck_standings_best_mark', 'standings', type_='check')
    op.drop_constraint('ck_standings_recent_form', 'standings', type_='check')
    op.drop_column('standings', 'best_mark_on')
    op.drop_column('standings', 'recent_form')

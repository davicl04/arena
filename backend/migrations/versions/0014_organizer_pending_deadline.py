"""Keep unresolved organizer decisions pending after the athletes' correction deadline."""
import sqlalchemy as sa
from alembic import op

revision = '0014'
down_revision = '0013'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(sa.text("""
        UPDATE notifications SET action_until = NULL
        WHERE type = 'divergencia_para_decidir' AND action_key IS NOT NULL AND resolved_at IS NULL
    """))


def downgrade():
    # A data repair: downgrading the schema does not restore the incorrect expiry of unresolved decisions.
    pass

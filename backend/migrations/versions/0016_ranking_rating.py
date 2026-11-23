"""Rating rankings: cuts of `calc_version = 2` (decision docs/decisoes/0006-ranking-por-rating.md).

- `ck_rank_cuts_metric` accepts `rating`;
- `rank_cuts` receives the versioned parameters of the rating (`initial_rating`, `placement_k`, `regular_k`) and of
  the adjusted mean (`prior_matches` = m, `prior_mean` = μ), null where they do not apply;
- the `calc_version = 2` rows are inserted for every ranking: `futebol_time` and `tenis` by rating (initial 1000,
  K 64 in placement and 32 afterwards, Prata ≥ 950, Ouro ≥ 1050, Diamante ≥ 1150); `futebol_individual` and the
  running distances copy their version 1 row, with m and μ null. The version 1 rows are not touched.

The migration does not call application services: the existing `standings` rows keep `calc_version = 1` until
`python -m app.admin_cli recalculate-rankings` rewrites them. The downgrade removes the version 2 rows and the new
columns; the code must then return to `CURRENT_CALC_VERSION = 1` and recalculate.

Comes after 0015 (national city catalog).
"""
import sqlalchemy as sa
from alembic import op

revision = '0016'
down_revision = '0015'
branch_labels = None
depends_on = None

RATING_RANKINGS = ('futebol_time', 'tenis')
# Proposed parameters of the rating, to calibrate in a later calc_version (spec ranking-por-rating).
INITIAL_RATING = 1000
PLACEMENT_K = 64
REGULAR_K = 32
RATING_CUTS = {'prata': 950, 'ouro': 1050, 'diamante': 1150}

METRIC_V1 = "metric IN ('pontos', 'media', 'tempo')"
METRIC_V2 = "metric IN ('pontos', 'media', 'tempo', 'rating')"
RATING_PARAMETERS_CHECK = (
    "(metric = 'rating' AND initial_rating > 0 AND placement_k > 0 AND regular_k > 0) OR "
    "(metric <> 'rating' AND initial_rating IS NULL AND placement_k IS NULL AND regular_k IS NULL)")
ADJUSTED_MEAN_CHECK = (
    "(prior_matches IS NULL AND prior_mean IS NULL) OR (metric = 'media' AND prior_matches > 0 AND prior_mean >= 0)")

COPIED = ('placement_matches', 'legend_share', 'window_weeks')


def upgrade():
    op.drop_constraint('ck_rank_cuts_metric', 'rank_cuts', type_='check')
    op.create_check_constraint('ck_rank_cuts_metric', 'rank_cuts', METRIC_V2)
    op.add_column('rank_cuts', sa.Column('initial_rating', sa.Numeric(10, 3), nullable=True))
    op.add_column('rank_cuts', sa.Column('placement_k', sa.Numeric(6, 2), nullable=True))
    op.add_column('rank_cuts', sa.Column('regular_k', sa.Numeric(6, 2), nullable=True))
    op.add_column('rank_cuts', sa.Column('prior_matches', sa.Numeric(6, 2), nullable=True))
    op.add_column('rank_cuts', sa.Column('prior_mean', sa.Numeric(6, 3), nullable=True))
    op.create_check_constraint('ck_rank_cuts_rating', 'rank_cuts', RATING_PARAMETERS_CHECK)
    op.create_check_constraint('ck_rank_cuts_adjusted_mean', 'rank_cuts', ADJUSTED_MEAN_CHECK)

    copied = ', '.join(COPIED)
    # Rating rankings: new metric, cuts and parameters; placement matches, Lendário share and window from v1.
    op.get_bind().execute(sa.text(
        f"INSERT INTO rank_cuts (calc_version, ranking, metric, direction, prata, ouro, diamante, {copied}, "
        "initial_rating, placement_k, regular_k, created_at) "
        f"SELECT 2, ranking, 'rating', 'maior', :prata, :ouro, :diamante, {copied}, :initial, :placement_k, "
        ":regular_k, now() FROM rank_cuts WHERE calc_version = 1 AND ranking IN :rankings ORDER BY id"
    ).bindparams(sa.bindparam('rankings', expanding=True)), {
        **RATING_CUTS, 'initial': INITIAL_RATING, 'placement_k': PLACEMENT_K, 'regular_k': REGULAR_K,
        'rankings': list(RATING_RANKINGS)})
    # The other rankings keep their computation: an exact copy of the v1 row (m and μ stay null).
    op.get_bind().execute(sa.text(
        f"INSERT INTO rank_cuts (calc_version, ranking, metric, direction, prata, ouro, diamante, {copied}, "
        f"created_at) SELECT 2, ranking, metric, direction, prata, ouro, diamante, {copied}, now() "
        "FROM rank_cuts WHERE calc_version = 1 AND ranking NOT IN :rankings ORDER BY id"
    ).bindparams(sa.bindparam('rankings', expanding=True)), {'rankings': list(RATING_RANKINGS)})


def downgrade():
    op.execute('DELETE FROM rank_cuts WHERE calc_version = 2')
    op.drop_constraint('ck_rank_cuts_adjusted_mean', 'rank_cuts', type_='check')
    op.drop_constraint('ck_rank_cuts_rating', 'rank_cuts', type_='check')
    op.drop_column('rank_cuts', 'prior_mean')
    op.drop_column('rank_cuts', 'prior_matches')
    op.drop_column('rank_cuts', 'regular_k')
    op.drop_column('rank_cuts', 'placement_k')
    op.drop_column('rank_cuts', 'initial_rating')
    op.drop_constraint('ck_rank_cuts_metric', 'rank_cuts', type_='check')
    op.create_check_constraint('ck_rank_cuts_metric', 'rank_cuts', METRIC_V1)

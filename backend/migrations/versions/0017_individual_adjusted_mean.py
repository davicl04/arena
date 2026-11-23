"""Adjusted mean of `futebol_individual` in `calc_version = 2` (decision docs/decisoes/0006-ranking-por-rating.md).

Completes the `futebol_individual` row of version 2, which migration 0016 inserted as a copy of version 1 (m and μ
null, plain mean): `prior_matches` (m) = 5 phantom matches at `prior_mean` (μ) = 3.0 points, and the cuts revised for
the adjusted mean (Prata ≥ 2.6, Ouro ≥ 3.9, Diamante ≥ 5.2), chosen by `scripts/simular_media_ajustada.py`. There is
one row per ranking: the twelve position × format categories share it. The version 1 rows are not touched.

The migration does not call application services: the existing individual `standings` rows keep their values until
`python -m app.admin_cli recalculate-rankings` rewrites them. The downgrade returns the version 2 row to the state of
0016 (the cuts of version 1, m and μ null), so the individual ranking goes back to the plain mean after a recalculation.

Comes after 0016 (rating rankings).
"""
from decimal import Decimal

import sqlalchemy as sa
from alembic import op

revision = '0017'
down_revision = '0016'
branch_labels = None
depends_on = None

RANKING = 'futebol_individual'
PRIOR_MATCHES = Decimal(5)
PRIOR_MEAN = Decimal('3.0')
ADJUSTED_CUTS = {'prata': Decimal('2.6'), 'ouro': Decimal('3.9'), 'diamante': Decimal('5.2')}


def upgrade():
    result = op.get_bind().execute(sa.text(
        "UPDATE rank_cuts SET prata = :prata, ouro = :ouro, diamante = :diamante, prior_matches = :prior_matches, "
        "prior_mean = :prior_mean WHERE calc_version = 2 AND ranking = :ranking AND metric = 'media'"),
        {**ADJUSTED_CUTS, 'prior_matches': PRIOR_MATCHES, 'prior_mean': PRIOR_MEAN, 'ranking': RANKING})
    if result.rowcount != 1:
        raise RuntimeError(f'Linha {RANKING} da calc_version 2 ausente: aplique a 0016 antes.')


def downgrade():
    # Back to the copy of the version 1 row that 0016 inserted.
    op.get_bind().execute(sa.text(
        "UPDATE rank_cuts AS v2 SET prata = v1.prata, ouro = v1.ouro, diamante = v1.diamante, prior_matches = NULL, "
        "prior_mean = NULL FROM rank_cuts AS v1 WHERE v2.calc_version = 2 AND v1.calc_version = 1 "
        "AND v2.ranking = :ranking AND v1.ranking = v2.ranking"), {'ranking': RANKING})

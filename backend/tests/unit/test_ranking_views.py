"""Pure helpers of the Ranking screen reads: the position inside a tier and the gaps between places."""
from decimal import Decimal

import pytest

from app.models.rankings import TIERS
from app.services.ranking_views import gap, tier_offset


def test_the_offset_of_a_tier_is_the_classified_above_it():
    counts = {'bronze': 7, 'prata': 5, 'ouro': 3, 'diamante': 2, 'lendario': 1}
    assert [tier_offset(counts, tier) for tier in TIERS] == [11, 6, 3, 1, 0]
    # The position inside the tier: rank 9 is the 3rd of Prata (ranks 7 to 11), rank 12 starts Bronze.
    assert 9 - tier_offset(counts, 'prata') == 3 and 12 - tier_offset(counts, 'bronze') == 1
    assert tier_offset({tier: 0 for tier in TIERS}, 'bronze') == 0


def test_the_gap_is_the_lead_in_the_metric_of_the_ranking():
    assert gap(Decimal('94'), Decimal('87'), 'maior') == 7.0
    assert gap(Decimal('5.660'), Decimal('5.380'), 'maior') == pytest.approx(0.28)
    assert gap(1290, 1332, 'menor') == 42.0                       # running: the lower time is ahead
    assert gap(10, 10, 'maior') == 0.0 and gap(10, 10, 'menor') == 0.0
    assert gap(5, 9, 'maior') == 0.0 and gap(9, 5, 'menor') == 0.0   # never negative

"""Step of the elo bar of the result sticker (decision 0007, section 5): the distance to the next tier and the
progress between the cut of the current tier and the next one, at the edges of the cuts, in both directions."""
from decimal import Decimal

import pytest

from app.services.rankings import Cuts
from app.services.share_category import TierStep, bronze_floor, fraction, placement_progress, tier_step

SHARE = Decimal('0.15')
RATING = Cuts('tenis', 'rating', 'maior', Decimal(950), Decimal(1050), Decimal(1150), 3, SHARE, 52,
              initial_rating=Decimal(1000), placement_k=Decimal(64), regular_k=Decimal(32))
MEDIA = Cuts('futebol_individual', 'media', 'maior', Decimal('2.6'), Decimal('3.9'), Decimal('5.2'), 3, SHARE, 52,
             prior_matches=Decimal(5), prior_mean=Decimal(3))
FIVE_KM = Cuts('corrida_5', 'tempo', 'menor', Decimal(2100), Decimal(1620), Decimal(1320), 1, SHARE, 52)


def step(value, tier, cuts=RATING, *, rank=10, classified=10, last_legend=None):
    return tier_step(Decimal(str(value)), tier, cuts, rank_position=rank, classified_count=classified,
                     last_legend_value=None if last_legend is None else Decimal(str(last_legend)))


def test_the_bronze_floor_is_one_prata_width_below_prata_in_the_direction_of_the_metric():
    assert bronze_floor(RATING) == Decimal(850)
    assert bronze_floor(MEDIA) == Decimal('1.3')
    assert bronze_floor(FIVE_KM) == Decimal(2580)          # 43:00, slower than Prata (35:00)


@pytest.mark.parametrize(('value', 'expected'), [
    (850, 0.0), (800, 0.0), (900, 0.5), (949.999, 1.0), (920.161, 0.7016)])
def test_bronze_goes_from_the_floor_to_the_prata_cut(value, expected):
    result = step(value, 'bronze')
    assert (result.next_tier, result.unit, result.progress) == ('prata', 'rating', expected)
    assert result.gap == pytest.approx(max(950 - value, 0))


def test_a_tier_starts_empty_at_its_own_cut_and_fills_up_to_the_next_cut():
    assert step(950, 'prata') == TierStep('ouro', 100.0, 'rating', 0.0)
    assert step(1049.999, 'prata') == TierStep('ouro', 0.001, 'rating', 1.0)
    assert step(1079.839, 'ouro') == TierStep('diamante', 70.161, 'rating', 0.2984)
    assert step(1050, 'ouro').progress == 0.0


def test_the_adjusted_mean_uses_its_own_unit():
    assert step('3.25', 'prata', MEDIA) == TierStep('ouro', 0.65, 'media', 0.5)
    assert step('2.0', 'bronze', MEDIA) == TierStep('prata', 0.6, 'media', 0.5385)


def test_running_times_count_downwards():
    # 5 km: Prata <= 35:00, Ouro <= 27:00; 31:00 is half way and 4 minutes short of Ouro.
    assert step(1860, 'prata', FIVE_KM) == TierStep('ouro', 240.0, 'segundos', 0.5)
    assert step(2100, 'prata', FIVE_KM).progress == 0.0
    assert step(1621, 'prata', FIVE_KM) == TierStep('ouro', 1.0, 'segundos', 0.9979)
    # Bronze from 43:00 down to 35:00; slower than the floor stays empty.
    assert step(2340, 'bronze', FIVE_KM) == TierStep('prata', 240.0, 'segundos', 0.5)
    assert step(3600, 'bronze', FIVE_KM).progress == 0.0


def test_diamante_counts_places_to_the_last_lendario_slot():
    # 20 classified at 15%: 3 Lendário slots; the 5th place is 2 places away. Progress goes from the Diamante cut
    # (1150) to the metric of the 3rd place (1250).
    assert step(1200, 'diamante', rank=5, classified=20, last_legend=1250) == TierStep('lendario', 2.0, 'posicoes', 0.5)
    assert step(1150, 'diamante', rank=6, classified=20, last_legend=1250).progress == 0.0
    # A tie with the last Lendário (behind by the tiebreak) is a full bar, one place away.
    assert step(1250, 'diamante', rank=4, classified=20, last_legend=1250) == TierStep('lendario', 1.0, 'posicoes', 1.0)
    # Running: the last Lendário runs faster than the Diamante cut.
    assert step(1260, 'diamante', FIVE_KM, rank=4, classified=20, last_legend=1200).progress == 0.5


def test_diamante_without_lendario_slots_is_full_without_distance():
    # Fewer than 7 classified at 15% give no slot.
    assert step(1300, 'diamante', rank=1, classified=6) == TierStep('lendario', None, None, 1.0)


def test_lendario_is_full_without_next_tier_or_distance():
    assert step(1400, 'lendario', rank=1, classified=20) == TierStep(None, None, None, 1.0)


def test_fraction_clamps_and_an_empty_span_is_full():
    assert fraction(Decimal(5), Decimal(0), Decimal(10), 'maior') == 0.5
    assert fraction(Decimal(11), Decimal(0), Decimal(10), 'maior') == 1.0
    assert fraction(Decimal(-1), Decimal(0), Decimal(10), 'maior') == 0.0
    assert fraction(Decimal(10), Decimal(10), Decimal(10), 'maior') == 1.0
    assert fraction(Decimal(10), Decimal(10), Decimal(10), 'menor') == 1.0


@pytest.mark.parametrize(('played', 'required', 'expected'), [(0, 3, 0.0), (1, 3, 0.3333), (2, 3, 0.6667),
                                                               (3, 3, 1.0), (0, 1, 0.0)])
def test_placement_progress_is_played_of_required(played, required, expected):
    assert placement_progress(played, required) == expected

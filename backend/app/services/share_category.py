"""Elo bar of the result sticker (Stories): the current standing in the category of one activity of the owner.

Contract: docs/decisoes/0007-compartilhamento-stories.md, section 5. The category of the activity is:

- tennis: `tenis`;
- football: `futebol_individual` of the match format and of the owner's position in its lineup (present, not
  removed); without a position, `futebol_time` of the owner's team (the owner's side) in that format;
- running: `corrida_<km>` on a standard distance; outside every standard distance there is no bar (None).

The line is the one of the Ranking screen (`ranking_views.my_lines` over the same shared lock, counts and cuts of
the current calculation version), so the tier, the place inside it and its size never diverge from that screen.
Only the step to the next tier is new (`tier_step`): the distance in the metric of the ranking, honouring its
direction, and the progress between the cut of the current tier and the cut of the next one. There is no history:
the bar is the standing at the moment of sharing. Only reads happen here.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.identity import User
from app.models.matches import MatchLineup
from app.models.rankings import TIERS, Standing
from app.models.teams import Team
from app.schemas.profile import TimelineMatchOut, TimelineRunOut
from app.schemas.share import ShareCategoryOut, ShareGapOut
from app.services.ranking_views import RankingParams, gap, my_lines, resolve_category, tier_counts
from app.services.rankings import Cuts, legend_slots

# Unit of the distance to the next tier by the metric of the cuts ('pontos' only with calc_version 1).
GAP_UNITS = {'rating': 'rating', 'media': 'media', 'tempo': 'segundos', 'pontos': 'pontos'}
NEXT_TIER = dict(zip(TIERS, TIERS[1:], strict=False))
PROGRESS_PLACES = Decimal('0.0001')


@dataclass(frozen=True)
class TierStep:
    """From a ranked tier to the next: the next tier, the distance to it (amount and unit) and the progress 0..1."""
    next_tier: str | None
    gap: float | None
    unit: str | None
    progress: float


def bronze_floor(cuts: Cuts) -> Decimal:
    """Bronze has no lower cut: its bar starts one Prata width (Prata to Ouro) below the Prata cut, in the direction
    of the metric. Stable for a calculation version (it only depends on its cuts): rating 950/1050 → 850, adjusted
    mean 2.6/3.9 → 1.3, 5 km 35:00/27:00 → 43:00."""
    return cuts.prata - (cuts.ouro - cuts.prata)


def fraction(value: Decimal, low: Decimal, high: Decimal, direction: str) -> float:
    """Where `value` stands from `low` (0) to `high` (1), with `menor` (times) counting downwards; clamped to 0..1
    and rounded to 4 places. An empty span is full (1)."""
    sign = 1 if direction == 'maior' else -1
    span = (Decimal(high) - Decimal(low)) * sign
    if span <= 0:
        return 1.0
    done = (Decimal(value) - Decimal(low)) * sign
    return float(min(max(done / span, Decimal(0)), Decimal(1)).quantize(PROGRESS_PLACES))


def tier_step(value: Decimal, tier: str, cuts: Cuts, *, rank_position: int, classified_count: int,
              last_legend_value: Decimal | None = None) -> TierStep:
    """Step of a ranked subject to the next tier.

    Bronze, Prata and Ouro: the next tier, the distance to its cut in the metric of the ranking (never negative) and
    the progress from the cut of the current tier (the Bronze floor, `bronze_floor`) to the next cut. Diamante: the
    next tier is Lendário and the distance is in places, from `rank_position` to the last Lendário slot
    (`legend_slots`); the progress goes from the Diamante cut to the metric of that last slot
    (`last_legend_value`). Without Lendário slots, the bar is full and there is no distance. Lendário: full, no
    next tier, no distance."""
    if tier == 'lendario':
        return TierStep(None, None, None, 1.0)
    if tier == 'diamante':
        slots = legend_slots(classified_count, cuts.legend_share)
        if slots <= 0:
            return TierStep('lendario', None, None, 1.0)
        last = Decimal(value) if last_legend_value is None else Decimal(last_legend_value)
        return TierStep('lendario', float(max(rank_position - slots, 1)), 'posicoes',
                        fraction(value, cuts.diamante, last, cuts.direction))
    following = NEXT_TIER[tier]
    low = bronze_floor(cuts) if tier == 'bronze' else getattr(cuts, tier)
    high = getattr(cuts, following)
    return TierStep(following, gap(high, value, cuts.direction), GAP_UNITS[cuts.metric],
                    fraction(value, low, high, cuts.direction))


def placement_progress(played: int, required: int) -> float:
    """Progress of a subject in placement: matches (marks) played of the ones required (at least 1), up to 1."""
    return float(min(Decimal(played) / Decimal(required), Decimal(1)).quantize(PROGRESS_PLACES))


def _standing(db: Session, owner: User, params: RankingParams, team: Team | None = None) -> ShareCategoryOut:
    category = resolve_category(db, params)
    counts = tier_counts(db, category.where)
    line = my_lines(db, owner, category, counts, [team] if team is not None else [])[0]
    if line.state != 'ranqueado':
        return ShareCategoryOut(
            ranking=category.ranking, state='classificacao', tier=None, tier_position=None, tier_size=None,
            played=line.played, required=line.required, progress=placement_progress(line.played, line.required),
            next_tier=None, gap=None)
    classified = sum(counts.values())
    value = Decimal(str(line.metric_value))
    last_legend = None
    slots = legend_slots(classified, category.cuts.legend_share)
    if line.tier == 'diamante' and slots > 0:
        last_legend = db.scalar(select(Standing.metric_value).where(*category.where, Standing.rank_position == slots))
    step = tier_step(value, line.tier, category.cuts, rank_position=line.rank_position, classified_count=classified,
                     last_legend_value=last_legend)
    return ShareCategoryOut(
        ranking=category.ranking, state='ranqueado', tier=line.tier, tier_position=line.tier_position,
        tier_size=line.tier_size, played=line.played, required=line.required, progress=step.progress,
        next_tier=step.next_tier,
        gap=None if step.gap is None else ShareGapOut(amount=step.gap, unit=step.unit))


def match_category(db: Session, owner: User, item: TimelineMatchOut) -> ShareCategoryOut | None:
    """Elo bar of a match of the owner (the owner's timeline item): tennis, the individual ranking of the owner's
    position in the lineup, or the ranking of the owner's team in the format."""
    if item.sport == 'tenis':
        return _standing(db, owner, RankingParams('tenis'))
    position = db.scalar(select(MatchLineup.position).where(
        MatchLineup.match_id == item.id, MatchLineup.user_id == owner.id, MatchLineup.present.is_(True),
        MatchLineup.removed_at.is_(None)))
    if position is not None:
        return _standing(db, owner, RankingParams('futebol', kind='individual', format=item.format,
                                                  position=position))
    side = next(side for side in item.sides if side.is_owner)
    team = db.get(Team, side.team.id) if side.team is not None else None
    if team is None:
        return None
    return _standing(db, owner, RankingParams('futebol', kind='time', format=item.format), team)


def run_category(db: Session, owner: User, item: TimelineRunOut) -> ShareCategoryOut | None:
    """Elo bar of a run of the owner: the distance ranking, or None outside the standard distances."""
    if item.standard_distance_km is None:
        return None
    return _standing(db, owner, RankingParams('corrida', distance_km=item.standard_distance_km))


__all__ = ['TierStep', 'bronze_floor', 'fraction', 'match_category', 'placement_progress', 'run_category',
           'tier_step']

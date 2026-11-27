"""Result sticker data (Stories): the plate numbers of one activity of the owner of the session.

Contract: docs/decisoes/0007-compartilhamento-stories.md. The data is the owner's timeline item of that activity
(`profile_timeline.own_match_item` / `own_run_item`), so sides, score, outcome, points, counted stats, previous best
and mark kind never diverge from the profile; eligibility is the item's `shareable` (`share_rules`). A match outside
the owner's history, a run of someone else, a missing id and an activity that is not shareable all answer the same
404, without telling the cases apart. Only reads happen here.
"""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.identity import User
from app.schemas.share import ShareMatchOut, ShareRunOut
from app.services.profile_timeline import own_match_item, own_run_item

ACTIVITY_NOT_FOUND = 'Atividade não encontrada.'


def match_share(db: Session, user: User, match_id: int) -> ShareMatchOut:
    item = own_match_item(db, user, match_id)
    if item is None or not item.shareable:
        raise HTTPException(404, ACTIVITY_NOT_FOUND)
    return ShareMatchOut(
        id=item.id, sport=item.sport, format=item.format, origin=item.origin, event=item.event,
        round_label=item.round_label, occurred_at=item.occurred_at, sides=item.sides, owner_side=item.owner_side,
        score=item.score, outcome=item.outcome, walkover_absent_side=item.walkover_absent_side, points=item.points,
        stats=item.stats)


def run_share(db: Session, user: User, run_id: int) -> ShareRunOut:
    item = own_run_item(db, user, run_id)
    if item is None or not item.shareable:
        raise HTTPException(404, ACTIVITY_NOT_FOUND)
    return ShareRunOut(
        id=item.id, occurred_at=item.occurred_at, date=item.date, distance_m=item.distance_m,
        standard_distance_km=item.standard_distance_km, duration_s=item.duration_s, pace_s_per_km=item.pace_s_per_km,
        previous_best_s=item.previous_best_s, mark_kind=item.mark_kind, origin=item.origin)


__all__ = ['ACTIVITY_NOT_FOUND', 'match_share', 'run_share']

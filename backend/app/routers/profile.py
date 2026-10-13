"""Profile history: the timeline of matches and runs (any viewer that can see the profile) and the own stats."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import PAGE_DEFAULT, PAGE_MAX
from app.core.security import current_user
from app.models.identity import User
from app.routers.social import _can_view
from app.schemas.profile import ProfileStatsOut, TimelinePageOut
from app.services.profile_history import profile_stats
from app.services.profile_timeline import timeline

router = APIRouter(prefix='/api/v1')


@router.get('/users/{user_id}/timeline', response_model=TimelinePageOut)
def get_timeline(user_id: int, sport: Literal['futebol', 'tenis', 'corrida'] | None = None,
                 cursor: str | None = None, limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    owner = db.get(User, user_id)
    if owner is None or not _can_view(db, user, owner):
        raise HTTPException(404, 'Perfil não encontrado.')
    return timeline(db, user, owner, sport=sport, cursor=cursor, limit=limit)


@router.get('/me/profile-stats', response_model=ProfileStatsOut)
def get_profile_stats(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return profile_stats(db, user)

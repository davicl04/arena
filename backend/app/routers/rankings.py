"""Standings of the session user and the general rankings (docs/decisoes/0002-jogar.md, sections 12.6 and 20).

`GET /me/standings`, `GET /rankings` (a page of one category, optionally one tier) and `GET /rankings/overview`
(the Ranking screen in one read). The rules and the reads are in `app/services/rankings.py` and
`app/services/ranking_views.py`; the viewer always comes from the session.
"""
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import PAGE_DEFAULT, PAGE_MAX
from app.core.security import current_user
from app.models.identity import User
from app.schemas.rankings import (
    FootballFormat,
    MeStandingsOut,
    PositionName,
    RankingOverviewOut,
    RankingPageOut,
    Tier,
)
from app.services import ranking_views
from app.services.rankings import my_standings

router = APIRouter(prefix='/api/v1')


@router.get('/me/standings', response_model=MeStandingsOut)
def get_my_standings(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return my_standings(db, user)


@router.get('/rankings', response_model=RankingPageOut)
def get_rankings(sport: Literal['futebol', 'tenis', 'corrida'], kind: Literal['time', 'individual'] | None = None,
                 format: FootballFormat | None = None, position: PositionName | None = None,
                 distance_km: int | None = None, tier: Tier | None = None, cursor: str | None = None,
                 limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX), user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    params = ranking_views.RankingParams(sport=sport, kind=kind, format=format, position=position,
                                         distance_km=distance_km, cursor=cursor, limit=limit, tier=tier)
    return ranking_views.rankings_page(db, user, params)


@router.get('/rankings/overview', response_model=RankingOverviewOut)
def get_ranking_overview(sport: Literal['futebol', 'tenis', 'corrida'],
                         kind: Literal['time', 'individual'] | None = None, format: FootballFormat | None = None,
                         position: PositionName | None = None, distance_km: int | None = None,
                         team_id: int | None = None, user: User = Depends(current_user),
                         db: Session = Depends(get_db)):
    params = ranking_views.RankingParams(sport=sport, kind=kind, format=format, position=position,
                                         distance_km=distance_km)
    return ranking_views.ranking_overview(db, user, params, team_id=team_id)

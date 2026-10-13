"""Quadras: catálogo, sugestão e revisão da administração (Jogar, fase 3; RN07; etapa 3).

Contrato: docs/decisoes/0002-jogar.md, seção 10.4. As regras ficam em app/services/courts.py.
"""
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import PAGE_DEFAULT, PAGE_MAX
from app.core.security import current_admin, current_user
from app.models.identity import User, utcnow
from app.schemas.match_flow import AdminCourtSuggestionPage, CourtListOut, CourtSuggestionOut
from app.schemas.matches import AdminCourtSuggestionOut, CourtDecisionInput, CourtKind, CourtSuggestionInput
from app.services import courts

router = APIRouter(prefix='/api/v1')


@router.get('/courts', response_model=CourtListOut)
def list_courts(city_id: int, kind: CourtKind | None = None, q: str | None = Query(None, max_length=80),
                match_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return courts.catalog(db, user, city_id=city_id, kind=kind, q=q, match_id=match_id)


@router.post('/courts/suggestions', response_model=CourtSuggestionOut, status_code=201)
def suggest_court(data: CourtSuggestionInput, response: Response, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    result, created = courts.suggest_court(db, user, data, now=utcnow())
    response.status_code = 201 if created else 200
    return result


@router.get('/admin/court-suggestions', response_model=AdminCourtSuggestionPage)
def court_suggestions(state: str = Query('em_revisao', pattern='^(em_revisao|decididas)$'),
                      cursor: str | None = None, limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX),
                      admin: User = Depends(current_admin), db: Session = Depends(get_db)):
    items, next_cursor = courts.court_queue(db, admin, state, cursor, limit, now=utcnow())
    return AdminCourtSuggestionPage(items=items, next_cursor=next_cursor)


@router.post('/admin/court-suggestions/{court_id}/decision', response_model=AdminCourtSuggestionOut)
def decide_court(court_id: int, data: CourtDecisionInput, admin: User = Depends(current_admin),
                 db: Session = Depends(get_db)):
    return courts.decide_court(db, admin, court_id, data, now=utcnow())

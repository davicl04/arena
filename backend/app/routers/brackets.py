"""Chaveamento, agenda e decisão do organizador nos campeonatos (Times e campeonatos, fases 6 e 7; etapa 4).

Contrato: docs/decisoes/0003-times-campeonatos.md, seção 21, e docs/decisoes/0002-jogar.md, seção 17. As regras ficam em
app/services/championship.py; aqui entram só sessão, corpo, relógio e códigos de resposta. O titular vem sempre da
sessão. Os handlers globais de `app/main.py` traduzem os erros das regras (`RuleError` em 422 com o campo, `TransitionError` em 409); o conflito
de agenda responde `409 { detail, conflict }`.
"""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import current_user
from app.models.identity import User, utcnow
from app.schemas.brackets import (
    BracketOut,
    BracketSwapInput,
    EventMatchListOut,
    EventMatchRowOut,
    ResultDecisionInput,
    ScheduleInput,
)
from app.schemas.common import EmptyInput
from app.schemas.matches import MatchDetailOut
from app.services import championship

router = APIRouter(prefix='/api/v1')
CONFLICT = {409: {'description': 'Conflito de agenda: `{ detail, conflict: { kind, match_id, label, stage, '
                                 'starts_at, court_name } }`, ou conflito de estado: `{ detail }`.'}}


@router.get('/events/{event_id}/bracket', response_model=BracketOut)
def event_bracket(event_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return championship.get_bracket(db, user, event_id, now=utcnow())


@router.post('/organizer/events/{event_id}/bracket', response_model=BracketOut)
def draw_bracket(event_id: int, _: EmptyInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return championship.draw_bracket(db, user, event_id, now=utcnow())


@router.patch('/organizer/events/{event_id}/bracket', response_model=BracketOut)
def swap_bracket(event_id: int, data: BracketSwapInput, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    return championship.swap_bracket(db, user, event_id, data, now=utcnow())


@router.post('/organizer/events/{event_id}/bracket/confirm', response_model=BracketOut)
def confirm_bracket(event_id: int, _: EmptyInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return championship.confirm_bracket(db, user, event_id, now=utcnow())


@router.get('/organizer/events/{event_id}/matches', response_model=EventMatchListOut)
def event_matches(event_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return championship.list_event_matches(db, user, event_id, now=utcnow())


@router.put('/organizer/matches/{match_id}/schedule', response_model=EventMatchRowOut, responses=CONFLICT)
def schedule_match(match_id: int, data: ScheduleInput, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    try:
        return championship.schedule_match(db, user, match_id, data, now=utcnow())
    except championship.ScheduleConflict as error:
        return JSONResponse(error.body(), status_code=409)


@router.post('/organizer/matches/{match_id}/result-decision', response_model=MatchDetailOut, status_code=201)
def decide_result(match_id: int, data: ResultDecisionInput, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    return championship.decide_result(db, user, match_id, data, now=utcnow())

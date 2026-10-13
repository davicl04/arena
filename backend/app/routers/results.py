"""Resultado, presença, estatísticas e contestação (Jogar, fase 5; etapa 3).

Contrato: docs/decisoes/0002-jogar.md (seção 12): `PUT /matches/{id}/result`, `PUT /matches/{id}/attendance`,
`GET /matches/{id}/stats`, `PUT /matches/{id}/my-stats`, `PUT /matches/{id}/stats/{stat_id}/review`
e `POST /matches/{id}/stats/{stat_id}/contest`. As regras ficam em app/services/results.py; aqui
entram só a sessão, o corpo, o relógio e os códigos de resposta (a regra de produto violada vira `422` com `fields` e a
ação fora do estado `409`, nos handlers globais de `app/main.py`).
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import current_user
from app.models.identity import User, utcnow
from app.schemas.matches import (
    AttendanceInput,
    LineupOut,
    MatchDetailOut,
    MyStatsInput,
    ResultInput,
    StatContestInput,
    StatReviewInput,
)
from app.schemas.results import LineupListOut, MyStatsOut
from app.services import results

router = APIRouter(prefix='/api/v1')


@router.put('/matches/{match_id}/result', response_model=MatchDetailOut)
def put_result(match_id: int, data: ResultInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return results.report_score(db, user, match_id, data, now=utcnow())


@router.put('/matches/{match_id}/attendance', response_model=LineupListOut)
def put_attendance(match_id: int, data: AttendanceInput, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    return results.set_attendance(db, user, match_id, data, now=utcnow())


@router.get('/matches/{match_id}/stats', response_model=LineupListOut)
def get_stats(match_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return results.match_lineups(db, user, match_id, now=utcnow())


@router.put('/matches/{match_id}/my-stats', response_model=MyStatsOut)
def put_my_stats(match_id: int, data: MyStatsInput, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    return results.send_my_stats(db, user, match_id, data, now=utcnow())


@router.put('/matches/{match_id}/stats/{stat_id}/review', response_model=LineupOut)
def put_stat_review(match_id: int, stat_id: int, data: StatReviewInput, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    return results.review_stat(db, user, match_id, stat_id, data, now=utcnow())


@router.post('/matches/{match_id}/stats/{stat_id}/contest', response_model=LineupOut)
def post_stat_contest(match_id: int, stat_id: int, data: StatContestInput, user: User = Depends(current_user),
                      db: Session = Depends(get_db)):
    return results.contest_stat(db, user, match_id, stat_id, data, now=utcnow())

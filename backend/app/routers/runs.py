"""Corrida: registro, prévia, histórico, melhores marcas e provas (Jogar, fase 6).

Contrato: docs/decisoes/0002-jogar.md (seção 18): `POST /me/runs/preview`, `POST /me/runs`, `GET /me/runs`,
`DELETE /me/runs/{id}`, `GET /me/run-bests` e `GET /me/run-races`. As regras ficam em app/services/runs.py e
app/services/run_rules.py; aqui entram só a sessão, o corpo, o relógio e os códigos de resposta. Os handlers globais de
`app/main.py` traduzem a regra violada em `422` com o campo e o conflito de estado em `409`. O titular vem sempre da sessão. O ranking de
`GET /rankings?sport=corrida` fica em app/routers/results.py.
"""
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import PAGE_DEFAULT, PAGE_MAX
from app.core.security import current_user
from app.models.identity import User, utcnow
from app.schemas.runs import (
    RunBestsOut,
    RunCreatedOut,
    RunFilter,
    RunInput,
    RunPageOut,
    RunPreviewOut,
    RunRacesOut,
)
from app.services import runs

router = APIRouter(prefix='/api/v1')


@router.post('/me/runs/preview', response_model=RunPreviewOut)
def post_run_preview(data: RunInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return runs.preview_run(db, user, data, now=utcnow())


@router.post('/me/runs', response_model=RunCreatedOut, status_code=201)
def post_run(data: RunInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return runs.create_run(db, user, data, now=utcnow())


@router.get('/me/runs', response_model=RunPageOut)
def get_runs(distance: RunFilter | None = None, cursor: str | None = None,
             limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX), user: User = Depends(current_user),
             db: Session = Depends(get_db)):
    return runs.list_runs(db, user, distance=distance, cursor=cursor, limit=limit, now=utcnow())


@router.delete('/me/runs/{run_id}', status_code=204)
def delete_run(run_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    runs.delete_run(db, user, run_id, now=utcnow())
    return Response(status_code=204)


@router.get('/me/run-bests', response_model=RunBestsOut)
def get_run_bests(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return runs.run_bests(db, user, now=utcnow())


@router.get('/me/run-races', response_model=RunRacesOut)
def get_run_races(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return runs.eligible_races(db, user, now=utcnow())

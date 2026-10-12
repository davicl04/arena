"""Busca, propostas e placa do Jogar (Jogar, fase 2; etapa 3).

Contrato: docs/decisoes/0002-jogar.md (seção 9). As regras ficam em app/services/matchmaking.py e o pareamento em
app/services/matchmaking_queue.py; aqui só entram sessão, corpo e códigos de resposta. Rotas: `POST
/matchmaking/searches`, `GET /me/searches`, `DELETE /matchmaking/searches/{id}`, `GET /me/proposals`, `PUT
/matches/{id}/accept`, `PUT /matches/{id}/decline`, `GET /me/play` e `GET /me/matches`.
"""
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import PAGE_DEFAULT, PAGE_MAX
from app.core.security import current_user
from app.models.identity import User, utcnow
from app.schemas.common import EmptyInput
from app.schemas.matches import PlayBoardOut, ProposalOut, SearchCreatedOut, SearchInput
from app.schemas.matchmaking import MatchCardList, MatchSearchList, ProposalList
from app.services import matchmaking

router = APIRouter(prefix='/api/v1')
FIELDS_ERROR = {422: {'description': 'Corpo que não serve à busca: `{ detail, fields: [{ field, message }] }`.'}}
CREATED_AGAIN = {200: {'description': 'O titular já tinha uma busca aberta: ela é devolvida, sem criar outra.',
                       'model': SearchCreatedOut}}


# --- Buscas (seção 9.3) ---------------------------------------------------------------------------------------

@router.post('/matchmaking/searches', response_model=SearchCreatedOut, status_code=201,
             responses={**FIELDS_ERROR, **CREATED_AGAIN})
def create_search(data: SearchInput, response: Response, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    created, is_new = matchmaking.create_search_with_status(db, user, data, now=utcnow())
    if not is_new:
        response.status_code = 200
    return created


@router.get('/me/searches', response_model=MatchSearchList)
def my_searches(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return MatchSearchList(items=matchmaking.my_searches(db, user, now=utcnow()))


@router.delete('/matchmaking/searches/{search_id}', status_code=204)
def cancel_search(search_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    matchmaking.cancel_search(db, user, search_id, now=utcnow())
    return Response(status_code=204)


# --- Propostas ------------------------------------------------------------------------------------------------

@router.get('/me/proposals', response_model=ProposalList)
def my_proposals(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return ProposalList(items=matchmaking.my_proposals(db, user, now=utcnow()))


@router.put('/matches/{match_id}/accept', response_model=ProposalOut)
def accept_proposal(match_id: int, _: EmptyInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return matchmaking.respond_to_proposal(db, user, match_id, 'aceitar', now=utcnow())


@router.put('/matches/{match_id}/decline', response_model=ProposalOut)
def decline_proposal(match_id: int, _: EmptyInput, user: User = Depends(current_user),
                     db: Session = Depends(get_db)):
    return matchmaking.respond_to_proposal(db, user, match_id, 'recusar', now=utcnow())


# --- Placa e partidas do titular ------------------------------------------------------------------------------

@router.get('/me/play', response_model=PlayBoardOut)
def play_board(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return matchmaking.play_board(db, user, now=utcnow())


@router.get('/me/matches', response_model=MatchCardList)
def my_matches(scope: Literal['proximas', 'historico'] = 'proximas', cursor: str | None = None,
               limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX), user: User = Depends(current_user),
               db: Session = Depends(get_db)):
    items, next_cursor = matchmaking.my_matches(db, user, scope, cursor, limit, now=utcnow())
    return MatchCardList(items=items, next_cursor=next_cursor)

"""Partida: detalhe, condições, reserva, chat, cancelamento e W.O. (Jogar, fase 3; etapa 3).

Contrato: docs/decisoes/0002-jogar.md, seções 8, 10 e 11.1. As regras ficam em app/services/matches.py; aqui entram só
sessão, corpo e códigos de resposta. O titular vem sempre da sessão. Os erros das regras puras (`RuleError` em 422 com
o campo, `TransitionError` em 409) são traduzidos pelos handlers globais de `app/main.py`.
"""
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import PAGE_DEFAULT, PAGE_MAX
from app.core.security import current_admin, current_user
from app.models.identity import User, utcnow
from app.schemas.common import EmptyInput
from app.schemas.match_flow import AdminWalkoverDisputePage
from app.schemas.matches import (
    AdminWalkoverDisputeOut,
    BookingInput,
    CancelInput,
    MatchDetailOut,
    MatchMessageOut,
    MessageInput,
    MessagePageOut,
    ReasonInput,
    TermsInput,
    WalkoverDecisionInput,
)
from app.services import matches

router = APIRouter(prefix='/api/v1')


@router.get('/matches/{match_id}', response_model=MatchDetailOut)
def match_detail(match_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return matches.get_match(db, user, match_id, now=utcnow())


# --- Condições, reserva e cancelamento -----------------------------------------------------------------------------

@router.post('/matches/{match_id}/terms', response_model=MatchDetailOut, status_code=201)
def propose_terms(match_id: int, data: TermsInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return matches.propose_terms(db, user, match_id, data, now=utcnow())


@router.put('/matches/{match_id}/terms/{terms_id}/accept', response_model=MatchDetailOut)
def accept_terms(match_id: int, terms_id: int, _: EmptyInput, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    return matches.accept_terms(db, user, match_id, terms_id, now=utcnow())


@router.put('/matches/{match_id}/booking', response_model=MatchDetailOut)
def set_booking(match_id: int, data: BookingInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return matches.set_booking(db, user, match_id, data, now=utcnow())


@router.post('/matches/{match_id}/cancel', response_model=MatchDetailOut)
def cancel_match(match_id: int, data: CancelInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return matches.cancel_match(db, user, match_id, data, now=utcnow())


# --- W.O. -----------------------------------------------------------------------------------------------------------

@router.post('/matches/{match_id}/walkover', response_model=MatchDetailOut)
def register_walkover(match_id: int, _: EmptyInput, user: User = Depends(current_user),
                      db: Session = Depends(get_db)):
    return matches.register_walkover(db, user, match_id, now=utcnow())


@router.delete('/matches/{match_id}/walkover', status_code=204)
def withdraw_walkover(match_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    matches.withdraw_walkover(db, user, match_id, now=utcnow())
    return Response(status_code=204)


@router.post('/matches/{match_id}/walkover/contest', response_model=MatchDetailOut)
def contest_walkover(match_id: int, data: ReasonInput, user: User = Depends(current_user),
                     db: Session = Depends(get_db)):
    return matches.contest_walkover(db, user, match_id, data.reason, now=utcnow())


@router.get('/admin/walkover-disputes', response_model=AdminWalkoverDisputePage)
def walkover_disputes(cursor: str | None = None, limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX),
                      admin: User = Depends(current_admin), db: Session = Depends(get_db)):
    return matches.walkover_queue(db, admin, cursor, limit, now=utcnow())


@router.post('/admin/matches/{match_id}/walkover-decision', response_model=AdminWalkoverDisputeOut)
def decide_walkover(match_id: int, data: WalkoverDecisionInput, admin: User = Depends(current_admin),
                    db: Session = Depends(get_db)):
    return matches.decide_walkover(db, admin, match_id, data, now=utcnow())


# --- Chat -----------------------------------------------------------------------------------------------------------

@router.get('/matches/{match_id}/messages', response_model=MessagePageOut)
def list_messages(match_id: int, after: int | None = Query(None, ge=0), before: int | None = Query(None, ge=0),
                  limit: int = Query(matches.CHAT_PAGE_DEFAULT, ge=1, le=matches.CHAT_PAGE_MAX),
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    return matches.messages_page(db, user, match_id, after=after, before=before, limit=limit)


@router.post('/matches/{match_id}/messages', response_model=MatchMessageOut, status_code=201)
def post_message(match_id: int, data: MessageInput, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    return matches.post_message(db, user, match_id, data.body, now=utcnow())

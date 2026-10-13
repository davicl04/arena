"""Avulso: ofertas de vaga, vagas da partida e remoção de avulso (Jogar, fase 4; RN06; etapa 3).

Contrato: docs/decisoes/0002-jogar.md (seção 11.2). As regras ficam em app/services/slots.py; aqui só entram a
sessão, o corpo e os códigos de resposta. A busca do avulso entra por `POST /matchmaking/searches` (frente de
pareamento).
"""
from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import current_user
from app.models.identity import User, utcnow
from app.schemas.common import EmptyInput
from app.schemas.matches import MatchDetailOut, SlotsInput
from app.schemas.slots import SlotOfferList
from app.services import slots

router = APIRouter(prefix='/api/v1')
FIELDS_ERROR = {422: {'description': 'Vagas inválidas: `{ detail, fields: [{ field, message }] }`.'}}


@router.get('/me/slot-offers', response_model=SlotOfferList)
def my_slot_offers(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return SlotOfferList(items=slots.slot_offers(db, user, now=utcnow()))


@router.put('/match-slots/{slot_id}/accept', response_model=MatchDetailOut)
def accept_slot(slot_id: int, data: EmptyInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return slots.accept_slot(db, user, slot_id)


@router.put('/match-slots/{slot_id}/decline', status_code=204)
def decline_slot(slot_id: int, data: EmptyInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    slots.decline_slot(db, user, slot_id)
    return Response(status_code=204)


@router.put('/matches/{match_id}/slots', response_model=MatchDetailOut, responses=FIELDS_ERROR)
def update_slots(match_id: int, data: SlotsInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return slots.update_slots(db, user, match_id, data.open_slots.model_dump())


@router.delete('/matches/{match_id}/guests/{user_id}', status_code=204)
def delete_guest(match_id: int, user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    slots.delete_guest(db, user, match_id, user_id)
    return Response(status_code=204)

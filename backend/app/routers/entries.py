"""Eventos para o atleta, inscrições, comprovantes e devoluções (Jogar, fase 7; Times e campeonatos, fase 5).

Contrato: docs/decisoes/0002-jogar.md (seção 6) e docs/decisoes/0003-times-campeonatos.md (seções 15.3 e 16).
As regras ficam em app/services/entries.py; aqui só entram sessão, corpo, arquivo e códigos de resposta.
"""
from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import PAGE_DEFAULT, PAGE_MAX
from app.core.security import current_admin, current_user
from app.models.identity import User
from app.schemas.entries import (
    EntryCreateInput,
    EventCardPage,
    EventDetailOut,
    MyEntryOut,
    MyEntryPage,
    PublicEntryPage,
    ReceiptList,
    RefundDecisionInput,
    RefundDisputeOut,
    RefundDisputePage,
    RefundResponseInput,
)
from app.schemas.events import OrganizerEntryOut, Sport
from app.services import entries, media

router = APIRouter(prefix='/api/v1')
PageLimit = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX)


# --- Eventos (E2 e D2) -------------------------------------------------------------------------------------------

@router.get('/events', response_model=EventCardPage)
def list_events(sport: Sport | None = None, city_id: int | None = None, cursor: str | None = None,
                limit: int = PageLimit, user: User = Depends(current_user), db: Session = Depends(get_db)):
    items, next_cursor = entries.list_events(db, user, sport=sport, city_id=city_id, cursor=cursor, limit=limit)
    return EventCardPage(items=items, next_cursor=next_cursor)


@router.get('/events/{event_id}', response_model=EventDetailOut)
def event_detail(event_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return entries.event_detail(db, user, event_id)


@router.get('/events/{event_id}/entries', response_model=PublicEntryPage)
def event_entries(event_id: int, cursor: str | None = None, limit: int = PageLimit,
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    items, next_cursor = entries.public_entries(db, user, event_id, cursor, limit)
    return PublicEntryPage(items=items, next_cursor=next_cursor)


# --- Inscrições --------------------------------------------------------------------------------------------------

@router.post('/events/{event_id}/entries', response_model=MyEntryOut, status_code=201)
def create_entry(event_id: int, data: EntryCreateInput, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    return entries.create_entry(db, user, event_id, data.team_id)


@router.get('/me/entries', response_model=MyEntryPage)
def my_entries(scope: str = Query('ativas', pattern='^(ativas|historico)$'), cursor: str | None = None,
               limit: int = PageLimit, user: User = Depends(current_user), db: Session = Depends(get_db)):
    items, next_cursor = entries.my_entries(db, user, scope, cursor, limit)
    return MyEntryPage(items=items, next_cursor=next_cursor)


@router.get('/entries/{entry_id}', response_model=MyEntryOut)
def get_entry(entry_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return entries.get_entry(db, user, entry_id)


@router.delete('/entries/{entry_id}', status_code=204)
def cancel_entry(entry_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    entries.cancel_entry(db, user, entry_id)
    return Response(status_code=204)


# --- Comprovantes de pagamento -----------------------------------------------------------------------------------

@router.put('/entries/{entry_id}/receipt', response_model=MyEntryOut, status_code=201)
async def put_receipt(entry_id: int, file: UploadFile = File(...), user: User = Depends(current_user),
                      db: Session = Depends(get_db)):
    # Permission and state first (no lock), then the file checks, then the store under the entry lock.
    entries.check_payment_receipt(db, user, entry_id)
    prepared = media.prepare_receipt(await media.read_receipt_upload(file))
    return entries.store_payment_receipt(db, user, entry_id, prepared)


@router.get('/entries/{entry_id}/receipts', response_model=ReceiptList)
def list_receipts(entry_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return ReceiptList(items=entries.entry_receipts(db, user, entry_id))


@router.get('/receipts/{receipt_id}/file')
def receipt_file(receipt_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return entries.receipt_file(db, user, receipt_id)


# --- Devoluções --------------------------------------------------------------------------------------------------

@router.put('/entries/{entry_id}/refund-receipt', response_model=OrganizerEntryOut, status_code=201)
async def put_refund_receipt(entry_id: int, file: UploadFile = File(...), user: User = Depends(current_user),
                             db: Session = Depends(get_db)):
    entries.check_refund_receipt(db, user, entry_id)
    prepared = media.prepare_receipt(await media.read_receipt_upload(file))
    return entries.store_refund_receipt(db, user, entry_id, prepared)


@router.post('/entries/{entry_id}/refund-response', response_model=MyEntryOut)
def refund_response(entry_id: int, data: RefundResponseInput, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    return entries.respond_refund(db, user, entry_id, data.response, data.reason)


@router.get('/admin/refund-disputes', response_model=RefundDisputePage)
def refund_disputes(cursor: str | None = None, limit: int = PageLimit, admin: User = Depends(current_admin),
                    db: Session = Depends(get_db)):
    items, next_cursor = entries.refund_disputes(db, admin, cursor, limit)
    return RefundDisputePage(items=items, next_cursor=next_cursor)


@router.post('/admin/entries/{entry_id}/refund-decision', response_model=RefundDisputeOut)
def refund_decision(entry_id: int, data: RefundDecisionInput, admin: User = Depends(current_admin),
                    db: Session = Depends(get_db)):
    return entries.decide_refund(db, admin, entry_id, data.decision, data.reason)

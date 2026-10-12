"""Eventos do organizador e da administração (Times e campeonatos, fases 4 e 5; etapa 2).

Contrato: docs/decisoes/0003-times-campeonatos.md, seções 14 e 15 (exceto 15.3). As regras e as transições ficam em
app/services/events.py; aqui entram sessão, corpo e códigos de resposta. O lado do atleta, os comprovantes enviados
e as devoluções ficam em app/routers/entries.py.
"""
from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import PAGE_DEFAULT, PAGE_MAX
from app.core.security import current_admin, current_user
from app.models.identity import User
from app.schemas.common import EmptyInput
from app.schemas.events import EntryState, EventMessageOut
from app.schemas.organizer_events import (
    AdminEventDecisionInput,
    AdminEventOut,
    AdminEventPage,
    AdminEventQueue,
    EventCancelInput,
    EventCreateInput,
    EventMessageInput,
    EventMessagePage,
    EventScope,
    EventUpdateInput,
    OrganizerEntryPage,
    OrganizerEventDetailOut,
    OrganizerEventPage,
    ReceiptDecisionInput,
    ReceiptReviewOut,
    ReceiptReviewPage,
    ReceiptTab,
    RevocationDecisionInput,
)
from app.services import events

router = APIRouter(prefix='/api/v1')
FIELDS_ERROR = {422: {'description': 'Campos inválidos: `{ detail, fields: [{ field, message }] }`.'}}


def _fields_error(error: events.FieldsError) -> JSONResponse:
    return JSONResponse(error.body(), status_code=422)


# --- Organizador (seção 14) ------------------------------------------------------------------------------

@router.get('/organizer/events', response_model=OrganizerEventPage)
def organizer_events(scope: EventScope = 'abertos', cursor: str | None = None,
                     limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX), user: User = Depends(current_user),
                     db: Session = Depends(get_db)):
    items, next_cursor = events.list_events(db, user, scope, cursor, limit)
    return OrganizerEventPage(items=items, next_cursor=next_cursor)


@router.post('/organizer/events', response_model=OrganizerEventDetailOut, status_code=201, responses=FIELDS_ERROR)
def create_event(data: EventCreateInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    try:
        return events.create_event(db, user, data)
    except events.FieldsError as error:
        return _fields_error(error)


@router.get('/organizer/events/{event_id}', response_model=OrganizerEventDetailOut)
def organizer_event(event_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return events.event_detail(db, events.load_owned_event(db, event_id, user))


@router.patch('/organizer/events/{event_id}', response_model=OrganizerEventDetailOut, responses=FIELDS_ERROR)
def update_event(event_id: int, data: EventUpdateInput, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    try:
        return events.update_event(db, user, event_id, data)
    except events.FieldsError as error:
        return _fields_error(error)


@router.delete('/organizer/events/{event_id}', status_code=204)
def delete_event(event_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    events.delete_event(db, user, event_id)
    return Response(status_code=204)


@router.post('/organizer/events/{event_id}/submit', response_model=OrganizerEventDetailOut, responses=FIELDS_ERROR)
def submit_event(event_id: int, _: EmptyInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    try:
        return events.submit_event(db, user, event_id)
    except events.FieldsError as error:
        return _fields_error(error)


@router.post('/organizer/events/{event_id}/withdraw', response_model=OrganizerEventDetailOut)
def withdraw_event(event_id: int, _: EmptyInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return events.withdraw_event(db, user, event_id)


@router.post('/organizer/events/{event_id}/cancel', response_model=OrganizerEventDetailOut)
def cancel_event(event_id: int, data: EventCancelInput, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    return events.cancel_owned_event(db, user, event_id, data.reason)


@router.get('/organizer/events/{event_id}/entries', response_model=OrganizerEntryPage)
def organizer_event_entries(event_id: int, state: EntryState | None = None, cursor: str | None = None,
                            limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX), user: User = Depends(current_user),
                            db: Session = Depends(get_db)):
    items, next_cursor = events.list_entries(db, user, event_id, state, cursor, limit)
    return OrganizerEntryPage(items=items, next_cursor=next_cursor)


@router.get('/organizer/events/{event_id}/receipts', response_model=ReceiptReviewPage)
def organizer_event_receipts(event_id: int, tab: ReceiptTab = 'para_analisar', cursor: str | None = None,
                             limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX), user: User = Depends(current_user),
                             db: Session = Depends(get_db)):
    items, next_cursor = events.list_receipts(db, user, event_id, tab, cursor, limit)
    return ReceiptReviewPage(items=items, next_cursor=next_cursor)


@router.post('/receipts/{receipt_id}/decision', response_model=ReceiptReviewOut)
def decide_receipt(receipt_id: int, data: ReceiptDecisionInput, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    return events.decide_receipt(db, user, receipt_id, data)


@router.get('/events/{event_id}/messages', response_model=EventMessagePage)
def event_messages(event_id: int, cursor: str | None = None, limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX),
                   user: User = Depends(current_user), db: Session = Depends(get_db)):
    items, next_cursor = events.list_messages(db, user, event_id, cursor, limit)
    return EventMessagePage(items=items, next_cursor=next_cursor)


@router.post('/events/{event_id}/messages', response_model=EventMessageOut, status_code=201)
def post_event_message(event_id: int, data: EventMessageInput, user: User = Depends(current_user),
                       db: Session = Depends(get_db)):
    return events.post_message(db, user, event_id, data.body)


# --- Administração (seções 15.1 e 15.2) ------------------------------------------------------------------

@router.get('/admin/events', response_model=AdminEventPage)
def admin_events(queue: AdminEventQueue = 'em_aprovacao', cursor: str | None = None,
                 limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX), admin: User = Depends(current_admin),
                 db: Session = Depends(get_db)):
    items, next_cursor = events.admin_list_events(db, admin, queue, cursor, limit)
    return AdminEventPage(items=items, next_cursor=next_cursor)


@router.get('/admin/events/{event_id}', response_model=AdminEventOut)
def admin_event(event_id: int, admin: User = Depends(current_admin), db: Session = Depends(get_db)):
    return events.admin_get_event(db, admin, event_id)


@router.post('/admin/events/{event_id}/decision', response_model=AdminEventOut)
def admin_decide_event(event_id: int, data: AdminEventDecisionInput, admin: User = Depends(current_admin),
                       db: Session = Depends(get_db)):
    return events.admin_decide_event(db, admin, event_id, data)


@router.post('/admin/events/{event_id}/revocation-decision', response_model=AdminEventOut)
def admin_decide_revocation(event_id: int, data: RevocationDecisionInput, admin: User = Depends(current_admin),
                            db: Session = Depends(get_db)):
    return events.admin_decide_revocation(db, admin, event_id, data.decision, data.reason)

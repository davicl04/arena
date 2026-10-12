"""Pedido de organizador, permissão e filas da administração (Times e campeonatos, fase 3).

Contrato em docs/decisoes/0003-times-campeonatos.md, seção 6. As regras e as transições ficam em
app/services/organizers.py; a dependência `current_organizer` das fases seguintes também está lá.
"""
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import PAGE_DEFAULT, PAGE_MAX
from app.core.security import current_admin, current_user
from app.models.identity import User
from app.schemas.organizers import (
    AdminOrganizerPage,
    AdminOrganizerRequestOut,
    AdminOrganizerRequestPage,
    OrganizerDecisionInput,
    OrganizerRequestInput,
    OrganizerRequestOut,
    OrganizerRevokeInput,
    OrganizerStatusOut,
    QueueCountsOut,
)
from app.services import organizers

router = APIRouter(prefix='/api/v1')


@router.get('/me/organizer-request', response_model=OrganizerStatusOut)
def my_organizer_status(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return organizers.my_status(db, user)


@router.post('/me/organizer-request', response_model=OrganizerRequestOut, status_code=201)
def submit_organizer_request(data: OrganizerRequestInput, user: User = Depends(current_user),
                             db: Session = Depends(get_db)):
    return organizers.create_request(db, user, data)


@router.delete('/me/organizer-request', status_code=204)
def cancel_organizer_request(user: User = Depends(current_user), db: Session = Depends(get_db)):
    organizers.cancel_request(db, user)
    return Response(status_code=204)


@router.get('/admin/queue-counts', response_model=QueueCountsOut)
def admin_queue_counts(_: User = Depends(current_admin), db: Session = Depends(get_db)):
    return organizers.queue_counts(db)


@router.get('/admin/organizer-requests', response_model=AdminOrganizerRequestPage)
def admin_organizer_requests(state: str = Query('em_analise', pattern='^(em_analise|decididos)$'),
                             cursor: str | None = None, limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX),
                             admin: User = Depends(current_admin), db: Session = Depends(get_db)):
    items, next_cursor = organizers.list_requests(db, admin, state, cursor, limit)
    return AdminOrganizerRequestPage(items=items, next_cursor=next_cursor)


@router.post('/admin/organizer-requests/{request_id}/decision', response_model=AdminOrganizerRequestOut)
def admin_decide_organizer_request(request_id: int, data: OrganizerDecisionInput,
                                   admin: User = Depends(current_admin), db: Session = Depends(get_db)):
    return organizers.decide_request(db, admin, request_id, data)


@router.get('/admin/organizers', response_model=AdminOrganizerPage)
def admin_organizers(cursor: str | None = None, limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX),
                     admin: User = Depends(current_admin), db: Session = Depends(get_db)):
    items, next_cursor = organizers.list_organizers(db, admin, cursor, limit)
    return AdminOrganizerPage(items=items, next_cursor=next_cursor)


@router.post('/admin/organizers/{organizer_id}/revoke', status_code=204)
def admin_revoke_organizer(organizer_id: int, data: OrganizerRevokeInput, admin: User = Depends(current_admin),
                           db: Session = Depends(get_db)):
    organizers.revoke(db, admin, organizer_id, data.reason)
    return Response(status_code=204)

"""Pedido de organizador, decisão e revogação pela administração (docs/decisoes/0003, seção 6).

Every transition runs in one transaction with its notification and audit entry. Transitions of the same
athlete are serialized by locking the athlete's `users` row first (`FOR NO KEY UPDATE`, which does not block
foreign keys pointing at the user), then the request or permission row; the partial unique indexes of the
`0005` migration stay as the last barrier.
"""
from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime

from fastapi import Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import paginate
from app.core.security import current_user
from app.models.identity import City, ContentReport, User, utcnow
from app.models.organizers import Organizer, OrganizerRequest
from app.schemas.identity import CityOut
from app.schemas.organizers import (
    AdminOrganizerOut,
    AdminOrganizerRequestOut,
    OrganizerDecisionInput,
    OrganizerRefusalReason,
    OrganizerRequestInput,
    OrganizerRequestOut,
    OrganizerStatusOut,
    OrganizerSummaryOut,
    QueueCountsOut,
    RevocationOut,
)
from app.services import audit, notifications
from app.services.people import blocked_ids, person_out

# Version of the organizer responsibilities shown on "Seja organizador"; bump it when the text changes.
TERMS_VERSION = 1
QUEUE_STATES = ('em_analise', 'decididos')


# --- Permission (used from phase 4 on) -------------------------------------------------------------------

def get_active_organizer(db: Session, user_id: int, *, for_update: bool = False) -> Organizer | None:
    """The athlete's active permission (not revoked), or None."""
    statement = select(Organizer).where(Organizer.user_id == user_id, Organizer.revoked_at.is_(None))
    if for_update:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    return db.scalar(statement)


def current_organizer(user: User = Depends(current_user), db: Session = Depends(get_db)) -> Organizer:
    """Dependency for organizer-only routes (phase 4): 403 for athletes without an active permission."""
    organizer = get_active_organizer(db, user.id)
    if organizer is None:
        raise HTTPException(403, 'Você precisa ser organizador para criar eventos.')
    return organizer


# --- Pure rules (unit tested) ----------------------------------------------------------------------------

def resolve_status(active: Organizer | None, pending: OrganizerRequest | None,
                   last_decided: OrganizerRequest | None, last_revoked: Organizer | None):
    """State of the P3 card: (state, request, revocation) following the contract order.

    1. active permission -> aprovado; 2. request under review -> em_analise; 3. the most recent fact between
    the last decided request and the last revocation: recusado -> recusado, revocation -> revogado, anything
    else (cancelado) -> sem_pedido; 4. nothing -> sem_pedido.
    """
    if active is not None:
        return 'aprovado', None, None
    if pending is not None:
        return 'em_analise', pending, None
    revoked_last = last_revoked is not None and (
        last_decided is None or last_revoked.revoked_at >= last_decided.decided_at)
    if revoked_last:
        return 'revogado', None, last_revoked
    if last_decided is not None and last_decided.state == 'recusado':
        return 'recusado', last_decided, None
    return 'sem_pedido', None, None


def refusal_reason(code: OrganizerRefusalReason | None, detail: str | None) -> tuple[str, str | None]:
    """Validates the refusal reason; `outro` requires a 5–500 character description."""
    if code is None:
        raise HTTPException(422, 'Escolha o motivo da recusa.')
    if detail is not None and len(detail) > 500:
        raise HTTPException(422, 'Descreva o motivo da recusa em até 500 caracteres.')
    if code == OrganizerRefusalReason.outro and (detail is None or len(detail) < 5):
        raise HTTPException(422, 'Descreva o motivo da recusa.')
    return code.value, detail


def ensure_can_request(active: Organizer | None, pending: OrganizerRequest | None) -> None:
    if active is not None:
        raise HTTPException(409, 'Você já é organizador.')
    if pending is not None:
        raise HTTPException(409, 'Você já tem um pedido em análise.')


def ensure_undecided(request: OrganizerRequest) -> None:
    if request.state != 'em_analise':
        raise HTTPException(409, 'Este pedido já foi decidido.')


# --- Queries ---------------------------------------------------------------------------------------------

def _lock_user(db: Session, user_id: int) -> None:
    db.execute(select(User.id).where(User.id == user_id).with_for_update(key_share=True))


def _pending_request(db: Session, user_id: int, *, for_update: bool = False) -> OrganizerRequest | None:
    statement = select(OrganizerRequest).where(OrganizerRequest.user_id == user_id,
                                               OrganizerRequest.state == 'em_analise')
    if for_update:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    return db.scalar(statement)


def _cities(db: Session, ids: Iterable[int]) -> dict[int, City]:
    ids = set(ids)
    return {city.id: city for city in db.scalars(select(City).where(City.id.in_(ids)))} if ids else {}


def _users(db: Session, ids: Iterable[int | None]) -> dict[int, User]:
    ids = {user_id for user_id in ids if user_id is not None}
    return {user.id: user for user in db.scalars(select(User).where(User.id.in_(ids)))} if ids else {}


def request_out(request: OrganizerRequest, city: City) -> OrganizerRequestOut:
    return OrganizerRequestOut(
        id=request.id, display_name=request.display_name, city=CityOut.model_validate(city),
        sports=list(request.sports), experience=request.experience, contact=request.contact, link=request.link,
        state=request.state, reason_code=request.reason_code, reason_detail=request.reason_detail,
        created_at=request.created_at, decided_at=request.decided_at)


def _admin_requests_out(db: Session, viewer: User, requests: list[OrganizerRequest]) -> list[AdminOrganizerRequestOut]:
    """Request data plus the people needed to decide ("Ver perfil"); never the e-mail."""
    cities = _cities(db, (item.city_id for item in requests))
    people = _users(db, [item.user_id for item in requests] + [item.decided_by_id for item in requests])
    hidden = blocked_ids(db, viewer.id, people.keys())
    items = []
    for item in requests:
        decider = people.get(item.decided_by_id)
        items.append(AdminOrganizerRequestOut(
            **request_out(item, cities[item.city_id]).model_dump(),
            requester=person_out(people[item.user_id], blocked=item.user_id in hidden),
            decided_by=person_out(decider, blocked=decider.id in hidden) if decider else None))
    return items


def _admin_organizers_out(db: Session, viewer: User, organizers: list[Organizer]) -> list[AdminOrganizerOut]:
    people = _users(db, [item.user_id for item in organizers] + [item.approved_by_id for item in organizers])
    hidden = blocked_ids(db, viewer.id, people.keys())
    items = []
    for item in organizers:
        approver = people.get(item.approved_by_id)
        items.append(AdminOrganizerOut(
            id=item.id, user=person_out(people[item.user_id], blocked=item.user_id in hidden),
            display_name=item.display_name, approved_at=item.approved_at,
            approved_by=person_out(approver, blocked=approver.id in hidden) if approver else None,
            request_id=item.request_id))
    return items


# --- Athlete ---------------------------------------------------------------------------------------------

def my_status(db: Session, user: User) -> OrganizerStatusOut:
    active = get_active_organizer(db, user.id)
    pending = None if active else _pending_request(db, user.id)
    last_decided = last_revoked = None
    if active is None and pending is None:
        last_decided = db.scalar(select(OrganizerRequest).where(
            OrganizerRequest.user_id == user.id, OrganizerRequest.decided_at.is_not(None))
            .order_by(OrganizerRequest.decided_at.desc(), OrganizerRequest.id.desc()).limit(1))
        last_revoked = db.scalar(select(Organizer).where(
            Organizer.user_id == user.id, Organizer.revoked_at.is_not(None))
            .order_by(Organizer.revoked_at.desc(), Organizer.id.desc()).limit(1))
    state, request, revocation = resolve_status(active, pending, last_decided, last_revoked)
    if active is not None and active.request_id is not None:
        request = db.get(OrganizerRequest, active.request_id)
    return OrganizerStatusOut(
        state=state,
        request=request_out(request, db.get(City, request.city_id)) if request else None,
        organizer=OrganizerSummaryOut(id=active.id, display_name=active.display_name,
                                      approved_at=active.approved_at) if active else None,
        revocation=RevocationOut(revoked_at=revocation.revoked_at, reason=revocation.revoke_reason)
        if revocation else None)


def create_request(db: Session, user: User, data: OrganizerRequestInput) -> OrganizerRequestOut:
    if not data.accept_terms:
        raise HTTPException(422, 'Aceite as responsabilidades do organizador para enviar o pedido.')
    city = db.get(City, data.city_id)
    if city is None:
        raise HTTPException(422, 'Selecione uma cidade do catálogo.')
    _lock_user(db, user.id)
    ensure_can_request(get_active_organizer(db, user.id), _pending_request(db, user.id))
    now = utcnow()
    request = OrganizerRequest(
        user_id=user.id, display_name=data.display_name, city_id=city.id, sports=[sport.value for sport in data.sports],
        experience=data.experience, contact=data.contact, link=data.link, terms_version=TERMS_VERSION,
        terms_accepted_at=now, state='em_analise', created_at=now)
    db.add(request)
    try:
        db.flush()
    except IntegrityError as error:
        db.rollback()
        if 'uq_organizer_requests_pending' not in str(error.orig):
            raise
        # A concurrent submission already holds the only request under review.
        raise HTTPException(409, 'Você já tem um pedido em análise.') from None
    audit.record(db, actor_id=user.id, action='pedido_organizador.criado', target_type='organizer_request',
                 target_id=request.id, data={'city_id': city.id, 'sports': request.sports,
                                             'terms_version': TERMS_VERSION})
    db.commit()
    return request_out(request, city)


def cancel_request(db: Session, user: User) -> None:
    _lock_user(db, user.id)
    request = _pending_request(db, user.id, for_update=True)
    if request is None:
        raise HTTPException(404, 'Nenhum pedido em análise.')
    request.state, request.decided_at, request.decided_by_id = 'cancelado', utcnow(), user.id
    audit.record(db, actor_id=user.id, action='pedido_organizador.cancelado', target_type='organizer_request',
                 target_id=request.id)
    db.commit()


# --- Administration --------------------------------------------------------------------------------------

def queue_counts(db: Session) -> QueueCountsOut:
    """Counters of the Menu queues: organizer requests, reports and the stage 2 event queues."""
    from app.services.events import queue_counts as event_queue_counts  # events imports this module

    requests = db.scalar(select(func.count()).select_from(OrganizerRequest)
                         .where(OrganizerRequest.state == 'em_analise')) or 0
    reports = db.scalar(select(func.count()).select_from(ContentReport)
                        .where(ContentReport.status == 'pending')) or 0
    return QueueCountsOut(organizer_requests=requests, reports=reports, **event_queue_counts(db))


def list_requests(db: Session, admin: User, state: str, cursor: str | None,
                  limit: int) -> tuple[list[AdminOrganizerRequestOut], str | None]:
    """`em_analise` by submission and `decididos` by decision date, newest first."""
    if state == 'em_analise':
        statement = select(OrganizerRequest).where(OrganizerRequest.state == 'em_analise')
        stamp = OrganizerRequest.created_at
    else:
        statement = select(OrganizerRequest).where(OrganizerRequest.state != 'em_analise')
        stamp = OrganizerRequest.decided_at
    rows, next_cursor = paginate(statement, cursor, limit, stamp, OrganizerRequest.id, db)
    return _admin_requests_out(db, admin, rows), next_cursor


def decide_request(db: Session, admin: User, request_id: int,
                   data: OrganizerDecisionInput) -> AdminOrganizerRequestOut:
    request = db.get(OrganizerRequest, request_id)
    if request is None:
        raise HTTPException(404, 'Pedido não encontrado.')
    refusal = refusal_reason(data.reason_code, data.reason_detail) if data.decision == 'recusar' else None
    _lock_user(db, request.user_id)
    request = db.scalar(select(OrganizerRequest).where(OrganizerRequest.id == request_id)
                        .with_for_update().execution_options(populate_existing=True))
    ensure_undecided(request)
    if refusal is None and get_active_organizer(db, request.user_id) is not None:
        # Only reachable with a permission granted outside this flow; the request stays under review.
        raise HTTPException(409, 'Este atleta já é organizador.')
    now = utcnow()
    request.decided_at, request.decided_by_id = now, admin.id
    if refusal is None:
        request.state, request.reason_code, request.reason_detail = 'aprovado', None, None
        organizer = Organizer(user_id=request.user_id, request_id=request.id, display_name=request.display_name,
                              approved_by_id=admin.id, approved_at=now)
        db.add(organizer)
        db.flush()
        decision, extra = 'aprovado', {'organizer_id': organizer.id}
    else:
        request.state = 'recusado'
        request.reason_code, request.reason_detail = refusal
        decision, extra = 'recusado', {'reason_code': request.reason_code, 'reason_detail': request.reason_detail}
    # actor null: the athlete sees "A administração", even when an administrator decides their own request.
    notifications.notify(db, request.user_id, 'pedido_organizador_decidido', {
        'request_id': request.id, 'decision': decision, 'reason_code': request.reason_code,
        'reason_detail': request.reason_detail})
    audit.record(db, actor_id=admin.id, action=f'pedido_organizador.{decision}', target_type='organizer_request',
                 target_id=request.id, data={'user_id': request.user_id, **extra})
    db.commit()
    return _admin_requests_out(db, admin, [request])[0]


def list_organizers(db: Session, admin: User, cursor: str | None,
                    limit: int) -> tuple[list[AdminOrganizerOut], str | None]:
    statement = select(Organizer).where(Organizer.revoked_at.is_(None))
    rows, next_cursor = paginate(statement, cursor, limit, Organizer.approved_at, Organizer.id, db)
    return _admin_organizers_out(db, admin, rows), next_cursor


def handle_open_events(db: Session, organizer: Organizer, *, actor_id: int, revoked_at: datetime) -> None:
    """Destiny of the revoked organizer's open events, inside the revocation transaction (section 15.2).

    Events waiting for approval go back to draft; published or running ones wait for the administration to
    decide whether they go on or are cancelled with the refund flow (`events.on_organizer_revoked`).
    """
    from app.services.events import on_organizer_revoked  # events imports this module

    on_organizer_revoked(db, organizer, actor_id=actor_id)


def revoke(db: Session, admin: User, organizer_id: int, reason: str) -> None:
    organizer = db.get(Organizer, organizer_id)
    if organizer is None or organizer.revoked_at is not None:
        raise HTTPException(404, 'Organizador não encontrado.')
    _lock_user(db, organizer.user_id)
    organizer = db.scalar(select(Organizer).where(Organizer.id == organizer_id)
                          .with_for_update().execution_options(populate_existing=True))
    if organizer.revoked_at is not None:
        raise HTTPException(404, 'Organizador não encontrado.')
    now = utcnow()
    organizer.revoked_at, organizer.revoked_by_id, organizer.revoke_reason = now, admin.id, reason
    handle_open_events(db, organizer, actor_id=admin.id, revoked_at=now)
    notifications.notify(db, organizer.user_id, 'organizador_revogado', {'reason': reason})
    audit.record(db, actor_id=admin.id, action='organizador.revogado', target_type='organizer',
                 target_id=organizer.id, data={'user_id': organizer.user_id, 'reason': reason})
    db.commit()

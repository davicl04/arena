"""Quadras: catálogo por cidade, sugestão na partida e revisão da administração (Jogar, fase 3; RN07).

Contrato: docs/decisoes/0002-jogar.md, seção 10.4. O catálogo começa vazio: uma quadra só entra por sugestão publicada
pela administração. Uma sugestão `em_revisao` vale apenas na partida que a fez (`origin_match_id`); na agenda de um
campeonato, o organizador a reaproveita nas outras partidas do mesmo evento (`championship._resolve_court`). Ordem das
travas: partida, depois quadra (as condições da partida referenciam a quadra por chave estrangeira).
"""
from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import and_, case, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.pagination import paginate
from app.models.identity import City, User
from app.models.matches import Court, Match, MatchTerms
from app.schemas.match_flow import CourtListOut, CourtSuggestionOut
from app.schemas.matches import (
    AdminCourtSuggestionOut,
    CourtDecisionInput,
    CourtSuggestionInput,
    MatchRefOut,
    court_out,
)
from app.services import audit, notifications
from app.services.match_access import CHAT_WRITE_STATES, load_match_for
from app.services.match_events import post_event
from app.services.match_rules import (
    RuleError,
    TransitionError,
    clean_court_name,
    court_key,
    court_kind_for,
    effective_match_state,
)
from app.services.match_text import side_name
from app.services.people import people_out

CATALOG_LIMIT = 50
MAX_REVIEW_SUGGESTIONS = 3
QUEUE_STATES = ('em_revisao', 'decididas')
KIND_LABELS = {'futsal': 'futsal', 'society': 'society', 'campo': 'campo', 'tenis': 'tênis'}
CHAMPIONSHIP_TERMS = 'Num campeonato, o organizador define data, horário e quadra.'
STARTED_SUGGESTION = 'Só dá para sugerir quadra antes do início da partida.'
DUPLICATE_PUBLISHED = 'Já existe uma quadra publicada com este nome nesta cidade. Rejeite como duplicada.'


def kind_label(kind: str) -> str:
    return KIND_LABELS.get(kind, kind)


# ----- Pure rules --------------------------------------------------------------------------------------------

def is_possible_duplicate(key: str, other_key: str) -> bool:
    """Same normalized name, or one contains the other ("arena central" and "arena central sul")."""
    return bool(key) and bool(other_key) and (key == other_key or key in other_key or other_key in key)


# ----- Reads -------------------------------------------------------------------------------------------------

def _cities(db: Session, ids: Iterable[int]) -> dict[int, City]:
    ids = set(ids)
    return {city.id: city for city in db.scalars(select(City).where(City.id.in_(ids)))} if ids else {}


def court_duplicates(db: Session, court: Court) -> list[Court]:
    """Published courts of the same city and kind whose normalized name equals, contains or is contained in the
    suggestion's (candidates for "rejeitar como duplicada")."""
    key = court.name_key
    return list(db.scalars(
        select(Court).where(
            Court.state == 'publicada', Court.city_id == court.city_id, Court.kind == court.kind, Court.id != court.id,
            or_(Court.name_key == key, func.strpos(Court.name_key, key) > 0, func.strpos(key, Court.name_key) > 0))
        .order_by(Court.name_key, Court.id)))


def catalog(db: Session, user: User, *, city_id: int, kind: str | None, q: str | None,
            match_id: int | None) -> CourtListOut:
    """Published courts of the city by name (up to 50). With the viewer's `match_id`, the suggestions under review
    of that match come first, marked `provisional`."""
    city = db.get(City, city_id)
    if city is None:
        return CourtListOut(items=[])
    key = court_key(q) if q else ''
    filters = [Court.city_id == city_id]
    if kind is not None:
        filters.append(Court.kind == kind)
    if key:
        filters.append(Court.name_key.contains(key, autoescape=True))
    rows: list[Court] = []
    if match_id is not None:
        match, _, _ = load_match_for(db, match_id, user)
        rows += db.scalars(select(Court).where(*filters, Court.state == 'em_revisao',
                                               Court.origin_match_id == match.id)
                           .order_by(Court.created_at, Court.id)).all()
    rows += db.scalars(select(Court).where(*filters, Court.state == 'publicada')
                       .order_by(Court.name_key, Court.id).limit(CATALOG_LIMIT)).all()
    return CourtListOut(items=[court_out(court, city) for court in rows])


def usable_for_terms(db: Session, match: Match, court_id: int) -> Court:
    """The court of a terms proposal: published in the match's city, or the suggestion under review made in this
    very match (RN07), of the kind the match needs. Locks the row `FOR KEY SHARE`, so a review of the suggestion
    waits for the transaction that proposes terms with it. Raises RuleError (422)."""
    court = db.scalar(select(Court).where(Court.id == court_id).with_for_update(read=True, key_share=True)
                      .execution_options(populate_existing=True))
    usable = court is not None and court.city_id == match.city_id and (
        court.state == 'publicada' or (court.state == 'em_revisao' and court.origin_match_id == match.id))
    if not usable:
        raise RuleError('Escolha uma quadra do catálogo da cidade ou a sugerida nesta partida.', 'court_id')
    needed = court_kind_for(match.sport, match.format)
    if court.kind != needed:
        raise RuleError(f'Escolha uma quadra de {kind_label(needed)}.', 'court_id')
    return court


# ----- Suggestion --------------------------------------------------------------------------------------------

def suggest_court(db: Session, user: User, data: CourtSuggestionInput, *,
                  now: datetime) -> tuple[CourtSuggestionOut, bool]:
    """A representative suggests a court for the match. Returns the answer and whether a row was created (201) or
    an equivalent one already existed (200)."""
    match, sides, access = load_match_for(db, data.match_id, user, for_update=True)
    if not access.acts_for_side:
        raise HTTPException(403, 'Só os representantes sugerem quadras.')
    if match.origin != 'amistoso':
        raise TransitionError(CHAMPIONSHIP_TERMS)
    if match.state not in ('combinando', 'agendada'):
        raise TransitionError('Só dá para sugerir quadra enquanto a partida está sendo combinada ou agendada.')
    if match.starts_at is not None and match.starts_at <= now:
        raise TransitionError(STARTED_SUGGESTION)
    name = clean_court_name(data.name)
    address = (data.address or '').strip() or None
    needed = court_kind_for(match.sport, match.format)
    kind = data.kind or needed
    if kind != needed:
        raise RuleError(f'A quadra sugerida precisa ser de {kind_label(needed)}.', 'kind')
    key = court_key(name)
    city = db.get(City, match.city_id)
    existing = db.scalar(
        select(Court).where(Court.city_id == match.city_id, Court.kind == kind, Court.name_key == key,
                            or_(Court.state == 'publicada',
                                and_(Court.state == 'em_revisao', Court.origin_match_id == match.id)))
        .order_by(case((Court.state == 'publicada', 0), else_=1), Court.id).limit(1))
    if existing is not None:
        return CourtSuggestionOut(court=court_out(existing, city), existing=True), False
    open_suggestions = db.scalar(select(func.count()).select_from(Court).where(
        Court.state == 'em_revisao', Court.origin_match_id == match.id)) or 0
    if open_suggestions >= MAX_REVIEW_SUGGESTIONS:
        raise TransitionError(f'Esta partida já tem {MAX_REVIEW_SUGGESTIONS} sugestões de quadra em revisão.')
    court = Court(city_id=match.city_id, name=name, name_key=key, address=address, kind=kind, state='em_revisao',
                  suggested_by_id=user.id, origin_match_id=match.id, created_at=now, updated_at=now)
    db.add(court)
    db.flush()
    post_event(db, match.id, 'quadra_sugerida',
               f'{side_name(db, sides, access.side)} sugeriu a quadra {name}. A administração vai revisar; '
               'até lá ela vale só nesta partida.',
               side=access.side, author_id=user.id, payload={'court_id': court.id}, now=now)
    audit.record(db, actor_id=user.id, action='quadra.sugerida', target_type='court', target_id=court.id,
                 data={'match_id': match.id, 'kind': kind})
    db.commit()
    return CourtSuggestionOut(court=court_out(court, city), existing=False), True


# ----- Administration ----------------------------------------------------------------------------------------

def pending_count(db: Session) -> int:
    """Counter `court_suggestions` of GET /admin/queue-counts."""
    return db.scalar(select(func.count()).select_from(Court).where(Court.state == 'em_revisao')) or 0


def _admin_out(db: Session, admin: User, courts: list[Court], *, now: datetime) -> list[AdminCourtSuggestionOut]:
    """Queue rows: possible duplicates only for suggestions still under review."""
    duplicates = {court.id: court_duplicates(db, court) if court.state == 'em_revisao' else [] for court in courts}
    originals = {court.duplicate_of_id: None for court in courts if court.duplicate_of_id is not None}
    if originals:
        originals = {row.id: row for row in db.scalars(select(Court).where(Court.id.in_(originals)))}
    cities = _cities(db, [court.city_id for court in courts]
                     + [other.city_id for rows in duplicates.values() for other in rows])
    people = people_out(db, admin, [court.suggested_by_id for court in courts])
    match_ids = {court.origin_match_id for court in courts if court.origin_match_id is not None}
    matches = {match.id: match for match in db.scalars(select(Match).where(Match.id.in_(match_ids)))} \
        if match_ids else {}
    items = []
    for court in courts:
        match = matches.get(court.origin_match_id)
        original = originals.get(court.duplicate_of_id) if court.duplicate_of_id is not None else None
        items.append(AdminCourtSuggestionOut(
            court=court_out(court, cities[court.city_id]),
            suggested_by=people.get(court.suggested_by_id) if court.suggested_by_id is not None else None,
            origin_match=MatchRefOut(
                id=match.id, sport=match.sport, format=match.format,
                state=effective_match_state(match.state, match.proposal_expires_at, now),
                starts_at=match.starts_at) if match is not None else None,
            possible_duplicates=[court_out(other, cities[other.city_id]) for other in duplicates[court.id]],
            created_at=court.created_at, reviewed_at=court.reviewed_at, review_reason=court.review_reason,
            duplicate_of=court_out(original, cities[original.city_id]) if original is not None else None))
    return items


def court_queue(db: Session, admin: User, state: str, cursor: str | None, limit: int,
                *, now: datetime) -> tuple[list[AdminCourtSuggestionOut], str | None]:
    """`em_revisao` by suggestion time (oldest first); `decididas` by decision time, newest first."""
    if state == 'em_revisao':
        rows, next_cursor = paginate(select(Court).where(Court.state == 'em_revisao'), cursor, limit,
                                     Court.created_at, Court.id, db, ascending=True)
    else:
        # Only courts that came from a suggestion (someone suggested it, or the match that did still exists).
        decided = select(Court).where(Court.state.in_(('publicada', 'rejeitada')), Court.reviewed_at.is_not(None),
                                      or_(Court.suggested_by_id.is_not(None), Court.origin_match_id.is_not(None)))
        rows, next_cursor = paginate(decided, cursor, limit, Court.reviewed_at, Court.id, db)
    return _admin_out(db, admin, rows, now=now), next_cursor


def decide_court(db: Session, admin: User, court_id: int, data: CourtDecisionInput, *,
                 now: datetime) -> AdminCourtSuggestionOut:
    """Publishes (with optional corrections) or rejects a suggestion. Locks the origin match first and then the
    court, the order of the match routes (the terms of the match reference the court)."""
    court = db.get(Court, court_id)
    if court is None:
        raise HTTPException(404, 'Sugestão não encontrada.')
    match = None
    if court.origin_match_id is not None:
        match = db.scalar(select(Match).where(Match.id == court.origin_match_id).with_for_update()
                          .execution_options(populate_existing=True))
    court = db.scalar(select(Court).where(Court.id == court_id).with_for_update()
                      .execution_options(populate_existing=True))
    if court.state != 'em_revisao':
        raise HTTPException(409, 'Esta sugestão já foi decidida.')
    reason = (data.reason or '').strip()
    notes: dict = {}
    if data.decision == 'publicar':
        if data.duplicate_of_id is not None:
            raise RuleError('Só se indica a quadra duplicada ao rejeitar.', 'duplicate_of_id')
        _publish(db, court, data, reason, admin=admin, now=now)
        decision, summary = 'publicada', f'A quadra {court.name} entrou no catálogo.'
    else:
        duplicate = _reject(db, court, match, data, reason, admin=admin, now=now)
        decision = 'rejeitada'
        if duplicate is not None:
            notes['duplicate_of_id'] = duplicate.id
            summary = (f'A quadra {court.name} já existe no catálogo como {duplicate.name}. '
                       'A partida passa a usar a quadra do catálogo.')
        else:
            summary = f'A administração recusou a quadra {court.name}. As condições que a usavam foram canceladas.'
    if reason:
        notes['reason'] = reason
    if court.suggested_by_id is not None:
        notifications.notify(db, court.suggested_by_id, 'quadra_decidida', {
            'court_id': court.id, 'court_name': court.name, 'decision': decision, **notes})
    audit.record(db, actor_id=admin.id, action=f'quadra.{decision}', target_type='court', target_id=court.id,
                 data={'match_id': court.origin_match_id, **notes})
    if match is not None and match.state in CHAT_WRITE_STATES:
        post_event(db, match.id, 'quadra_sugerida', summary, payload={'court_id': court.id, 'decision': decision},
                   now=now)
    db.commit()
    return _admin_out(db, admin, [court], now=now)[0]


def _publish(db: Session, court: Court, data: CourtDecisionInput, reason: str, *, admin: User, now: datetime) -> None:
    name = clean_court_name(data.name) if data.name is not None else court.name
    address = court.address
    if 'address' in data.model_fields_set:
        address = (data.address or '').strip() or None
    if reason and len(reason) < 5:
        raise RuleError('Descreva o motivo com pelo menos 5 caracteres.', 'reason')
    key = court_key(name)
    clash = db.scalar(select(Court.id).where(Court.state == 'publicada', Court.city_id == court.city_id,
                                             Court.kind == court.kind, Court.name_key == key, Court.id != court.id)
                      .limit(1))
    if clash is not None:
        raise HTTPException(409, DUPLICATE_PUBLISHED)
    court.name, court.name_key, court.address = name, key, address
    court.state, court.published_at = 'publicada', now
    court.reviewed_by_id, court.reviewed_at, court.review_reason, court.updated_at = admin.id, now, reason or None, now
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, DUPLICATE_PUBLISHED) from None


def _reject(db: Session, court: Court, match: Match | None, data: CourtDecisionInput, reason: str, *,
            admin: User, now: datetime) -> Court | None:
    """Rejects the suggestion. With `duplicate_of_id`, the match keeps playing in the published court (same place,
    no new acceptance); otherwise the pending terms that used the court are cancelled and the match keeps the
    agreed court, which the clients show as "Sugestão recusada"."""
    duplicate = None
    if data.duplicate_of_id is not None:
        duplicate = db.scalar(select(Court).where(
            Court.id == data.duplicate_of_id, Court.state == 'publicada', Court.city_id == court.city_id,
            Court.kind == court.kind, Court.id != court.id))
        if duplicate is None:
            raise RuleError('Escolha uma quadra publicada da mesma cidade e tipo.', 'duplicate_of_id')
    if duplicate is None or reason:
        if not 5 <= len(reason) <= 300:
            raise RuleError('Descreva o motivo da recusa.', 'reason')
    court.state, court.published_at = 'rejeitada', None
    court.reviewed_by_id, court.reviewed_at, court.review_reason = admin.id, now, reason or None
    court.duplicate_of_id, court.updated_at = duplicate.id if duplicate is not None else None, now
    db.flush()
    if duplicate is not None:
        db.execute(update(MatchTerms).where(MatchTerms.court_id == court.id, MatchTerms.state.in_(('pendente', 'aceita')))
                   .values(court_id=duplicate.id))
        db.execute(update(Match).where(Match.court_id == court.id).values(court_id=duplicate.id, updated_at=now))
    else:
        cancelled = db.scalars(select(MatchTerms.id).where(MatchTerms.court_id == court.id,
                                                           MatchTerms.state == 'pendente')).all()
        if cancelled:
            notifications.resolve_actions_many(db, [notifications.terms_key(terms_id) for terms_id in cancelled])
            db.execute(update(MatchTerms).where(MatchTerms.id.in_(cancelled))
                       .values(state='cancelada', decided_at=now))
    return duplicate


__all__ = ['CATALOG_LIMIT', 'CHAMPIONSHIP_TERMS', 'catalog', 'court_duplicates', 'court_queue',
           'decide_court', 'is_possible_duplicate', 'kind_label', 'pending_count', 'suggest_court',
           'usable_for_terms']

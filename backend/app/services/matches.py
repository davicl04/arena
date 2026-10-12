"""Partida: condições, reserva, cancelamento, W.O. e chat (Jogar, fase 3; RN05, RN07, RN08).

Contrato: docs/decisoes/0002-jogar.md, seções 8, 10 e 11.1. Toda transição trava a partida (`FOR UPDATE`, a primeira
trava da ordem partida → vaga → busca), confere as regras antes de gravar, e grava a mudança, as notificações, a faixa
do chat e a auditoria numa só transação. O titular vem sempre da sessão; "age pelo lado" é `MatchAccess.acts_for_side`
(representante do time ou o próprio tenista). As permissões de `match_views.permissions_for` espelham estas regras.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.pagination import paginate
from app.models.events import Event
from app.models.identity import User
from app.models.matches import Court, Match, MatchMessage, MatchResult, MatchSide, MatchSlot, MatchTerms
from app.models.teams import TeamMember
from app.schemas.common import PersonOut
from app.schemas.match_flow import AdminWalkoverDisputePage
from app.schemas.matches import (
    AdminWalkoverDisputeOut,
    BookingInput,
    CancelInput,
    MatchDetailOut,
    MatchMessageOut,
    MessagePageOut,
    TermsInput,
    WalkoverDecisionInput,
    WalkoverOut,
)
from app.services import audit, notifications
from app.services.courts import CHAMPIONSHIP_TERMS, usable_for_terms
from app.services.match_access import (
    MatchAccess,
    audience,
    can_read_chat,
    can_write_chat,
    guest_users,
    load_match_for,
    load_sides,
    match_access,
    side_actors,
)
from app.services.match_events import post_event
from app.services.match_lifecycle import apply_final_score, close_match_slots, open_declared_slots
from app.services.match_rules import (
    RuleError,
    TransitionError,
    cancel_error,
    next_match_state,
    other_side,
    result_deadline,
    validate_terms_start,
    walkover_score,
)
from app.services.match_text import iso, side_name, side_names
from app.services.match_views import match_cards, match_detail
from app.services.matchmaking_queue import queue
from app.services.people import people_out
from app.services.standings import recalculate_for_match

CHAT_PAGE_DEFAULT = 50
CHAT_PAGE_MAX = 100
TERMS_CLOSED = 'As condições só mudam enquanto a partida está sendo combinada ou antes do início.'
CHAT_NOT_OPEN = 'O chat abre quando os dois lados aceitam a proposta.'
WALKOVER_WINDOW_CLOSED = 'O prazo de 48 h para registrar o resultado acabou.'
WALKOVER_SCORE_TEXT = {'futebol': '3 × 0', 'tenis': '6-0 6-0'}


# ----- Pure rules --------------------------------------------------------------------------------------------

def terms_open(match, now: datetime) -> bool:
    """Terms change while the match is being arranged or before the start (RN05)."""
    return match.state == 'combinando' or (
        match.state == 'agendada' and match.starts_at is not None and now < match.starts_at)


def clean_reason(value: str | None, *, low: int, high: int, message: str, field: str = 'reason') -> str:
    """Trimmed reason of `low` to `high` characters, or a 422 with the contract message."""
    text = (value or '').strip()
    if not low <= len(text) <= high:
        raise RuleError(message, field)
    return text


def same_terms(terms: MatchTerms, starts_at: datetime, court_id: int, booking_side: str,
               super_tiebreak: bool | None) -> bool:
    return (terms.starts_at == starts_at and terms.court_id == court_id and terms.booking_side == booking_side
            and terms.super_tiebreak == super_tiebreak)


# ----- Shared pieces -----------------------------------------------------------------------------------------

def _detail(db: Session, user: User, match: Match, sides: Mapping[str, MatchSide], access: MatchAccess, *,
            now: datetime) -> MatchDetailOut:
    return match_detail(db, user, match, now=now, sides=sides, access=access)


def _acting(db: Session, user: User, match_id: int, message: str) -> tuple[Match, dict[str, MatchSide], MatchAccess]:
    """Loads and locks the match for someone who must act for a side (403 with `message` otherwise)."""
    match, sides, access = load_match_for(db, match_id, user, for_update=True)
    if not access.acts_for_side:
        raise HTTPException(403, message)
    return match, sides, access


def _friendly(match: Match) -> None:
    if match.origin != 'amistoso':
        raise TransitionError(CHAMPIONSHIP_TERMS)


def _pending_terms(db: Session, match: Match) -> MatchTerms | None:
    return db.scalar(select(MatchTerms).where(MatchTerms.match_id == match.id, MatchTerms.state == 'pendente')
                     .with_for_update().execution_options(populate_existing=True))


def _cancel_pending_terms(db: Session, match: Match, now: datetime) -> None:
    pending = _pending_terms(db, match)
    if pending is not None:
        pending.state, pending.decided_at = 'cancelada', now


def get_match(db: Session, user: User, match_id: int, *, now: datetime) -> MatchDetailOut:
    match, sides, access = load_match_for(db, match_id, user)
    return _detail(db, user, match, sides, access, now=now)


# ----- Terms (RN05) ------------------------------------------------------------------------------------------

def propose_terms(db: Session, user: User, match_id: int, data: TermsInput, *, now: datetime) -> MatchDetailOut:
    """Proposes date, time, court and who books. The proposer accepts by proposing; the pending proposal is
    replaced; the match stays as it is (a scheduled match keeps its accepted terms) until both sides accept."""
    match, sides, access = _acting(db, user, match_id, 'Só os representantes propõem as condições.')
    _friendly(match)
    if not terms_open(match, now):
        raise TransitionError(TERMS_CLOSED)
    starts_at = validate_terms_start(data.starts_at, now).astimezone(timezone.utc)
    court = usable_for_terms(db, match, data.court_id)
    if data.super_tiebreak and match.sport != 'tenis':
        raise RuleError('Super tie-break só no tênis.', 'super_tiebreak')
    super_tiebreak = bool(data.super_tiebreak) if match.sport == 'tenis' else None
    accepted = db.scalar(select(MatchTerms).where(MatchTerms.match_id == match.id, MatchTerms.state == 'aceita'))
    if accepted is not None and same_terms(accepted, starts_at, court.id, data.booking_side, super_tiebreak):
        raise TransitionError('Estas já são as condições combinadas.')

    pending = _pending_terms(db, match)
    if pending is not None:
        pending.state, pending.decided_at = 'substituida', now
        db.flush()
    side = access.side
    terms = MatchTerms(match_id=match.id, proposed_by_id=user.id, proposed_by_side=side, starts_at=starts_at,
                       court_id=court.id, booking_side=data.booking_side, super_tiebreak=super_tiebreak,
                       state='pendente', created_at=now)
    setattr(terms, f'accepted_{side}_at', now)
    setattr(terms, f'accepted_{side}_by_id', user.id)
    db.add(terms)
    db.flush()

    opponent = sides.get(other_side(side))
    if opponent is not None:
        notifications.notify_many(db, side_actors(db, opponent), 'condicoes_propostas', {
            'match_id': match.id, 'terms_id': terms.id, 'starts_at': iso(starts_at), 'court_name': court.name},
            actor_id=user.id)
    post_event(db, match.id, 'condicoes_propostas',
               f'{side_name(db, sides, side)} propôs condições na quadra {court.name}. O outro lado precisa aceitar.',
               side=side, author_id=user.id, now=now,
               payload={'terms_id': terms.id, 'starts_at': iso(starts_at), 'court_id': court.id,
                        'booking_side': data.booking_side})
    audit.record(db, actor_id=user.id, action='condicoes.propostas', target_type='match_terms', target_id=terms.id,
                 data={'match_id': match.id, 'side': side, 'court_id': court.id, 'starts_at': iso(starts_at),
                       'booking_side': data.booking_side, 'super_tiebreak': super_tiebreak,
                       'replaced_terms_id': pending.id if pending is not None else None})
    db.commit()
    return _detail(db, user, match, sides, access, now=now)


def accept_terms(db: Session, user: User, match_id: int, terms_id: int, *, now: datetime) -> MatchDetailOut:
    """The side that did not propose accepts. With both acceptances the terms become the agreed ones: the match
    copies them, a scheduled match keeps its other data and the booking returns to "a confirmar" when the court, the
    time or who books changed. The first agreement schedules the match and opens the walk-in slots."""
    match, sides, access = _acting(db, user, match_id, 'Só os representantes aceitam.')
    _friendly(match)
    terms = db.scalar(select(MatchTerms).where(MatchTerms.id == terms_id, MatchTerms.match_id == match.id)
                      .with_for_update().execution_options(populate_existing=True))
    if terms is None:
        raise HTTPException(404, 'Condições não encontradas.')
    side = access.side
    if terms.state in ('substituida', 'cancelada'):
        raise TransitionError('Estas condições foram substituídas. Confira a proposta atual.')
    if getattr(terms, f'accepted_{side}_at') is not None:
        return _detail(db, user, match, sides, access, now=now)
    if not terms_open(match, now):
        raise TransitionError(TERMS_CLOSED)
    if terms.starts_at <= now:
        raise TransitionError('O horário proposto já passou. Proponha outro.')

    first = match.state == 'combinando'
    new_state = next_match_state(match.state, 'agendar') if first else match.state
    previous = db.scalar(select(MatchTerms).where(MatchTerms.match_id == match.id, MatchTerms.state == 'aceita',
                                                  MatchTerms.id != terms.id)
                         .with_for_update().execution_options(populate_existing=True))
    setattr(terms, f'accepted_{side}_at', now)
    setattr(terms, f'accepted_{side}_by_id', user.id)
    if previous is not None:
        previous.state, previous.decided_at = 'substituida', now
        db.flush()
    terms.state, terms.decided_at = 'aceita', now

    booking_changed = (match.starts_at != terms.starts_at or match.court_id != terms.court_id
                       or match.booking_side != terms.booking_side)
    match.state = new_state
    match.starts_at, match.court_id, match.booking_side = terms.starts_at, terms.court_id, terms.booking_side
    match.super_tiebreak = terms.super_tiebreak
    match.result_deadline = result_deadline(terms.starts_at)
    if booking_changed:
        match.booking_confirmed_at = match.booking_confirmed_by_id = None
    match.updated_at = now
    db.flush()

    court_name = db.get(Court, terms.court_id).name
    people = audience(db, match, sides=sides)
    notifications.notify_many(db, people, 'partida_agendada', {
        'match_id': match.id, 'terms_id': terms.id, 'starts_at': iso(terms.starts_at), 'court_name': court_name,
        'changed': not first}, actor_id=user.id)
    name = side_name(db, sides, side)
    payload = {'terms_id': terms.id, 'starts_at': iso(terms.starts_at), 'court_id': terms.court_id}
    if first:
        post_event(db, match.id, 'partida_agendada', f'Partida agendada na quadra {court_name}.', side=side,
                   author_id=user.id, payload=payload, now=now)
    else:
        reopened = ' A reserva volta a ficar a confirmar.' if booking_changed else ''
        post_event(db, match.id, 'condicoes_aceitas',
                   f'{name} aceitou as novas condições: quadra {court_name}.{reopened}',
                   side=side, author_id=user.id, payload=payload, now=now)
    audit.record(db, actor_id=user.id, action='condicoes.aceitas', target_type='match_terms', target_id=terms.id,
                 data={'match_id': match.id, 'side': side, 'changed': not first})
    if first:
        audit.record(db, actor_id=user.id, action='partida.agendada', target_type='match', target_id=match.id,
                     data={'terms_id': terms.id})
        open_declared_slots(db, match, now=now)
        queue.offer_slots(db, match, now=now)
    db.commit()
    return _detail(db, user, match, sides, access, now=now)


# ----- Booking (RN08) ----------------------------------------------------------------------------------------

def set_booking(db: Session, user: User, match_id: int, data: BookingInput, *, now: datetime) -> MatchDetailOut:
    """Who books with the venue records the booking as confirmed or "a confirmar". The Arena only records it."""
    match, sides, access = _acting(db, user, match_id, 'Só quem reserva confirma a reserva.')
    if match.booking_side != access.side:
        raise HTTPException(403, 'Só quem reserva confirma a reserva.')
    if match.state != 'agendada' or match.starts_at is None or now >= match.starts_at:
        raise TransitionError('A reserva só muda com a partida agendada e antes do início.')
    if (match.booking_confirmed_at is not None) != data.confirmed:
        match.booking_confirmed_at = now if data.confirmed else None
        match.booking_confirmed_by_id = user.id if data.confirmed else None
        match.updated_at = now
        name = side_name(db, sides, access.side)
        post_event(db, match.id, 'reserva_atualizada',
                   f'{name} confirmou a reserva da quadra.' if data.confirmed
                   else f'{name} voltou a reserva para a confirmar.',
                   side=access.side, author_id=user.id, payload={'confirmed': data.confirmed}, now=now)
        audit.record(db, actor_id=user.id, action='partida.reserva_atualizada', target_type='match',
                     target_id=match.id, data={'confirmed': data.confirmed})
    db.commit()
    return _detail(db, user, match, sides, access, now=now)


# ----- Cancellation ------------------------------------------------------------------------------------------

def cancel_match(db: Session, user: User, match_id: int, data: CancelInput, *, now: datetime) -> MatchDetailOut:
    """Cancels a match being arranged, or a scheduled one until 24 h before the start. The match is closed without
    scoring; walk-in slots close (pending offers return to the queue) and everyone in the match is told."""
    match, sides, access = _acting(db, user, match_id, 'Só os representantes cancelam a partida.')
    if match.origin != 'amistoso':
        raise TransitionError('Partidas de campeonato são canceladas pelo organizador.')
    problem = cancel_error(match.state, match.starts_at, now)
    if problem is not None:
        raise TransitionError(problem)
    reason = (data.reason or '').strip() or None
    new_state = next_match_state(match.state, 'cancelar')
    people = audience(db, match, sides=sides)            # walk-ins included: computed before the slots close
    match.state = new_state
    match.cancelled_at, match.cancelled_by_id, match.cancel_reason = now, user.id, reason
    match.closed_at = match.updated_at = now
    _cancel_pending_terms(db, match, now)
    guests = close_match_slots(db, match, now=now, actor_id=user.id)
    notifications.notify_many(db, people, 'partida_cancelada', {
        'match_id': match.id, 'reason': reason, 'starts_at': iso(match.starts_at)}, actor_id=user.id)
    suffix = f' Motivo: {reason}' if reason else ''
    post_event(db, match.id, 'partida_cancelada', f'{side_name(db, sides, access.side)} cancelou a partida.{suffix}',
               side=access.side, author_id=user.id, payload={'reason': reason}, now=now)
    audit.record(db, actor_id=user.id, action='partida.cancelada', target_type='match', target_id=match.id,
                 data={'reason': reason, 'guests': guests})
    db.commit()
    return _detail(db, user, match, sides, access, now=now)


# ----- Walkover ----------------------------------------------------------------------------------------------

def _walkover_window(match: Match, now: datetime) -> None:
    """The friendly is scheduled and `now` is between the start and the 48 h deadline."""
    if match.state != 'agendada' or match.starts_at is None:
        raise TransitionError('O W.O. só vale para partidas agendadas.')
    if now < match.starts_at:
        raise TransitionError('O W.O. só pode ser registrado depois do horário da partida.')
    if now >= match.result_deadline:
        raise TransitionError(WALKOVER_WINDOW_CLOSED)


def register_walkover(db: Session, user: User, match_id: int, *, now: datetime) -> MatchDetailOut:
    """The side that showed up registers the W.O. against the other, from the start until the 48 h deadline and
    only while the other side has not reported a score. A score the registering side had sent is discarded."""
    match, sides, access = _acting(db, user, match_id, 'Só os representantes registram o W.O.')
    if match.origin != 'amistoso':
        raise TransitionError('Num campeonato, o W.O. é decidido pelo organizador.')
    _walkover_window(match, now)
    if match.walkover_absent_side is not None:
        raise TransitionError('Já há um W.O. registrado nesta partida.')
    side, absent = access.side, other_side(access.side)
    reports = {row.side: row for row in db.scalars(select(MatchResult).where(MatchResult.match_id == match.id)
                                                   .with_for_update())}
    if absent in reports:
        raise TransitionError('O outro lado já informou o placar. Informe o seu ou converse no chat.')
    cleared = side in reports
    if cleared:
        db.delete(reports[side])
    match.walkover_absent_side, match.walkover_registered_by_id, match.walkover_registered_at = absent, user.id, now
    match.updated_at = now
    names = side_names(db, sides)
    if absent in sides:
        notifications.notify_many(db, side_actors(db, sides[absent]), 'wo_registrado', {
            'match_id': match.id, 'opponent_name': names[side], 'contest_until': iso(match.result_deadline)},
            actor_id=user.id)
    post_event(db, match.id, 'wo_registrado',
               f'{names[side]} registrou W.O. contra {names[absent]}. {names[absent]} pode contestar até o fim do '
               'prazo de 48 h.', side=side, author_id=user.id, now=now,
               payload={'absent_side': absent, 'contest_until': iso(match.result_deadline)})
    audit.record(db, actor_id=user.id, action='partida.wo_registrado', target_type='match', target_id=match.id,
                 data={'absent_side': absent, 'cleared_report': cleared})
    db.commit()
    return _detail(db, user, match, sides, access, now=now)


def withdraw_walkover(db: Session, user: User, match_id: int, *, now: datetime) -> None:
    """The side that registered the W.O. takes it back, before any contest and before the deadline."""
    match, sides, access = _acting(db, user, match_id, 'Só os representantes retiram o W.O.')
    if match.state != 'agendada' or match.walkover_absent_side != other_side(access.side):
        raise TransitionError('Não há W.O. registrado pelo seu lado.')
    if match.walkover_contested_at is not None:
        raise TransitionError('O W.O. já foi contestado; a administração decide.')
    if now >= match.result_deadline:
        raise TransitionError(WALKOVER_WINDOW_CLOSED)
    absent = match.walkover_absent_side
    match.walkover_absent_side = match.walkover_registered_by_id = match.walkover_registered_at = None
    match.updated_at = now
    post_event(db, match.id, 'wo_retirado', f'{side_name(db, sides, access.side)} retirou o W.O.',
               side=access.side, author_id=user.id, payload={'absent_side': absent}, now=now)
    audit.record(db, actor_id=user.id, action='partida.wo_retirado', target_type='match', target_id=match.id,
                 data={'absent_side': absent})
    db.commit()


def contest_walkover(db: Session, user: User, match_id: int, reason: str, *, now: datetime) -> MatchDetailOut:
    """The absent side contests once, until the deadline. The match stays without result until the administration
    decides; the sweep does not close it."""
    match, sides, access = _acting(db, user, match_id, 'Só os representantes contestam o W.O.')
    if match.state != 'agendada' or match.walkover_absent_side is None:
        raise TransitionError('Não há W.O. para contestar.')
    if match.walkover_absent_side != access.side:
        raise HTTPException(403, 'Só o lado ausente contesta o W.O.')
    if match.walkover_contested_at is not None:
        raise TransitionError('O W.O. já foi contestado.')
    if now >= match.result_deadline:
        raise TransitionError('O prazo de 48 h para contestar o W.O. acabou.')
    reason = clean_reason(reason, low=5, high=500, message='Conte o que aconteceu.')
    match.walkover_contested_by_id, match.walkover_contested_at, match.walkover_contest_reason = user.id, now, reason
    match.updated_at = now
    registering = other_side(access.side)
    recipients = [*(side_actors(db, sides[registering]) if registering in sides else []), *_admin_ids(db)]
    notifications.notify_many(db, recipients, 'wo_contestado', {'match_id': match.id, 'reason': reason},
                              actor_id=user.id)
    post_event(db, match.id, 'wo_contestado',
               f'{side_name(db, sides, access.side)} contestou o W.O. A administração vai decidir.',
               side=access.side, author_id=user.id, payload={'absent_side': access.side}, now=now)
    audit.record(db, actor_id=user.id, action='partida.wo_contestado', target_type='match', target_id=match.id,
                 data={'absent_side': access.side, 'reason': reason})
    db.commit()
    return _detail(db, user, match, sides, access, now=now)


def _admin_ids(db: Session) -> list[int]:
    return list(db.scalars(select(User.id).where(User.is_admin.is_(True), User.active.is_(True)).order_by(User.id)))


def _disputes():
    """Contested walkovers waiting for the administration."""
    return (Match.state == 'agendada', Match.walkover_contested_at.is_not(None), Match.walkover_decision.is_(None))


def dispute_count(db: Session) -> int:
    """Counter `walkover_disputes` of GET /admin/queue-counts: contested walkovers waiting for a decision."""
    return db.scalar(select(func.count()).select_from(Match).where(*_disputes())) or 0


def _walkover_out(match: Match, people: Mapping[int, PersonOut]) -> WalkoverOut:
    return WalkoverOut(
        absent_side=match.walkover_absent_side, registered_by=people.get(match.walkover_registered_by_id),
        registered_at=match.walkover_registered_at, contest_until=match.result_deadline,
        contested_by=people.get(match.walkover_contested_by_id), contested_at=match.walkover_contested_at,
        contest_reason=match.walkover_contest_reason, decision=match.walkover_decision,
        decision_reason=match.walkover_decision_reason)


def _disputes_out(db: Session, admin: User, matches: Sequence[Match], *,
                  now: datetime) -> list[AdminWalkoverDisputeOut]:
    if not matches:
        return []
    cards = match_cards(db, admin, matches, now=now)
    people = people_out(db, admin, [value for match in matches for value in (
        match.walkover_registered_by_id, match.walkover_contested_by_id)])
    return [AdminWalkoverDisputeOut(match=card, walkover=_walkover_out(match, people))
            for card, match in zip(cards, matches, strict=True)]


def walkover_queue(db: Session, admin: User, cursor: str | None, limit: int, *,
                   now: datetime) -> AdminWalkoverDisputePage:
    """Contested walkovers by contest time, oldest first."""
    rows, next_cursor = paginate(select(Match).where(*_disputes()), cursor, limit, Match.walkover_contested_at,
                                 Match.id, db, ascending=True)
    return AdminWalkoverDisputePage(items=_disputes_out(db, admin, rows, now=now), next_cursor=next_cursor)


def decide_walkover(db: Session, admin: User, match_id: int, data: WalkoverDecisionInput, *,
                    now: datetime) -> AdminWalkoverDisputeOut:
    """The administration keeps the walkover (3×0 or 6-0 6-0 for the side that showed up; the match ends) or
    annuls it (the match ends without result). Both record the decision and notify the two sides."""
    match = db.scalar(select(Match).where(Match.id == match_id).with_for_update()
                      .execution_options(populate_existing=True))
    if match is None:
        raise HTTPException(404, 'Partida não encontrada.')
    if match.state != 'agendada' or match.walkover_contested_at is None or match.walkover_decision is not None:
        raise TransitionError('Este W.O. não aguarda decisão.')
    reason = clean_reason(data.reason, low=5, high=500, message='Descreva a decisão.')
    keep = data.decision == 'manter'
    new_state = next_match_state(match.state, 'decidir_resultado' if keep else 'fechar_sem_resultado')
    sides = load_sides(db, [match.id])[match.id]
    members = audience(db, match, sides=sides, include_guests=False)
    guests = list(guest_users(db, match.id))                   # walk-ins hear about the result, not the decision
    names = side_names(db, sides)                              # every query comes before the row changes (autoflush)
    absent = match.walkover_absent_side
    present = other_side(absent)
    match.walkover_decision = 'mantido' if keep else 'anulado'
    match.walkover_decided_by_id, match.walkover_decided_at, match.walkover_decision_reason = admin.id, now, reason
    if keep:
        apply_final_score(match, walkover_score(match.sport, absent), source='administracao', now=now,
                          decided_by_id=admin.id, reason=reason)
        summary = (f'A administração manteve o W.O.: vitória de {names.get(present, "quem compareceu")} por '
                   f'{WALKOVER_SCORE_TEXT[match.sport]}.')
    else:
        summary = 'A administração anulou o W.O. A partida ficou sem resultado.'
    match.state = new_state
    match.closed_at = match.updated_at = now
    notifications.notify_many(db, members, 'wo_decidido', {
        'match_id': match.id, 'decision': match.walkover_decision, 'reason': reason})
    guest_payload = ({'match_id': match.id, 'outcome': 'wo', 'score_a': match.score_a, 'score_b': match.score_b,
                      'absent_side': absent} if keep else {'match_id': match.id, 'outcome': 'sem_resultado'})
    notifications.notify_many(db, guests, 'resultado_partida', guest_payload)
    post_event(db, match.id, 'wo_decidido', summary, side=present if keep else None, now=now,
               payload={'decision': match.walkover_decision, 'absent_side': absent})
    audit.record(db, actor_id=admin.id, action='partida.wo_decidido', target_type='match', target_id=match.id,
                 data={'decision': match.walkover_decision, 'absent_side': absent, 'reason': reason})
    if keep:
        recalculate_for_match(db, match, now=now)
    db.commit()
    return _disputes_out(db, admin, [match], now=now)[0]


# ----- Chat (section 11.1) -----------------------------------------------------------------------------------

def _author_roles(db: Session, match: Match, sides: Mapping[str, MatchSide],
                  rows: Sequence[MatchMessage]) -> dict[int, str | None]:
    """Current role of each author in the match, per message: the braçadeira "C" is `representante`."""
    authors = {row.author_id for row in rows if row.kind == 'texto' and row.author_id is not None}
    if not authors:
        return {}
    team_ids = [side.team_id for side in sides.values() if side.team_id is not None]
    member_roles = {(user_id, team_id): role for user_id, team_id, role in db.execute(
        select(TeamMember.user_id, TeamMember.team_id, TeamMember.role).where(
            TeamMember.team_id.in_(team_ids), TeamMember.user_id.in_(authors), TeamMember.left_at.is_(None))
    ).all()} if team_ids else {}
    guests = set(db.scalars(select(MatchSlot.filled_by_id).where(
        MatchSlot.match_id == match.id, MatchSlot.filled_by_id.in_(authors), MatchSlot.removed_at.is_(None))))
    organizer = db.scalar(select(Event.organizer_user_id).where(Event.id == match.event_id)) \
        if match.event_id is not None else None
    roles: dict[int, str | None] = {}
    for row in rows:
        if row.kind != 'texto' or row.author_id is None:
            continue
        side = sides.get(row.side) if row.side is not None else None
        role = None
        if side is not None and side.user_id == row.author_id:
            role = 'atleta'
        elif side is not None and side.team_id is not None:
            role = member_roles.get((row.author_id, side.team_id))
        if role is None and row.author_id in guests:
            role = 'avulso'
        if role is None and organizer == row.author_id:
            role = 'organizador'
        roles[row.id] = role
    return roles


def messages_out(db: Session, viewer: User, match: Match, sides: Mapping[str, MatchSide],
                 rows: Sequence[MatchMessage]) -> list[MatchMessageOut]:
    """Chat rows for the viewer: events have no author, removed messages carry no text, and the avatar of who has
    a block with the viewer is hidden (`people_out`)."""
    people = people_out(db, viewer, [row.author_id for row in rows if row.kind == 'texto'])
    roles = _author_roles(db, match, sides, rows)
    items = []
    for row in rows:
        text = row.kind == 'texto'
        removed = row.removed_at is not None
        items.append(MatchMessageOut(
            id=row.id, kind=row.kind, event_type=row.event_type, body=None if removed else row.body, removed=removed,
            author=people.get(row.author_id) if text and row.author_id is not None else None, side=row.side,
            author_role=roles.get(row.id), is_mine=text and row.author_id == viewer.id, payload=row.payload,
            created_at=row.created_at))
    return items


def messages_page(db: Session, user: User, match_id: int, *, after: int | None, before: int | None,
                  limit: int) -> MessagePageOut:
    """Messages in ascending order. `after` returns the newer ones (the 4 s polling), `before` the older ones, and
    neither the latest `limit`. `last_id` is the newest id returned, or `after` when nothing is new."""
    if after is not None and before is not None:
        raise RuleError('Use só after ou só before.', 'before')
    match, sides, access = load_match_for(db, match_id, user)
    if not can_read_chat(match, access):
        raise HTTPException(403, CHAT_NOT_OPEN)
    statement = select(MatchMessage).where(MatchMessage.match_id == match.id)
    if after is not None:
        rows = list(db.scalars(statement.where(MatchMessage.id > after).order_by(MatchMessage.id).limit(limit + 1)))
        has_more, rows = len(rows) > limit, rows[:limit]
    else:
        if before is not None:
            statement = statement.where(MatchMessage.id < before)
        rows = list(db.scalars(statement.order_by(MatchMessage.id.desc()).limit(limit + 1)))
        has_more, rows = len(rows) > limit, list(reversed(rows[:limit]))
    return MessagePageOut(items=messages_out(db, user, match, sides, rows) if rows else [], has_more=has_more,
                          last_id=rows[-1].id if rows else after)


def post_message(db: Session, user: User, match_id: int, body: str, *, now: datetime) -> MatchMessageOut:
    """A member of either roster, a walk-in or the championship organizer writes while the match is open."""
    match, sides, access = load_match_for(db, match_id, user)
    if access.role == 'administracao':
        raise HTTPException(403, 'A administração só lê o chat.')
    if not can_read_chat(match, access):
        raise HTTPException(403, CHAT_NOT_OPEN)
    if not can_write_chat(match, access):
        raise HTTPException(409, 'O chat desta partida está fechado.')
    text = body.strip()
    if not 1 <= len(text) <= 1000:
        raise RuleError('Escreva uma mensagem de 1 a 1000 caracteres.', 'body')
    message = MatchMessage(match_id=match.id, author_id=user.id, side=access.side, kind='texto', body=text,
                           created_at=now)
    db.add(message)
    db.commit()
    return messages_out(db, user, match, sides, [message])[0]


def reportable_message(db: Session, user: User, message_id: int) -> MatchMessage:
    """The text message a reader of the chat reports (`POST /reports` with `match_message`); anything else,
    including an event banner, a removed message or a chat the viewer cannot read, is `404`."""
    message = db.get(MatchMessage, message_id)
    match = db.get(Match, message.match_id) if message is not None else None
    if match is None or message.kind != 'texto' or message.removed_at is not None:
        raise HTTPException(404, 'Conteúdo não encontrado.')
    sides = load_sides(db, [match.id])[match.id]
    if not can_read_chat(match, match_access(db, match, user, sides=sides)):
        raise HTTPException(404, 'Conteúdo não encontrado.')
    return message


def match_label(db: Session, match_id: int) -> str:
    """"Ferrugem FC × Tigres do Lago", for the preview of a reported message."""
    sides = load_sides(db, [match_id])[match_id]
    names = side_names(db, sides)
    return ' × '.join(names[key] for key in ('a', 'b') if key in names)

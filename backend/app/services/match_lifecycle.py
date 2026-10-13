"""Match transitions shared by several stage 3 fronts and the sweep (no commit; the caller commits).

- Walk-in slots open when the match is scheduled and close when it is cancelled (RN06).
- The final score is stored once confirmed (equal reports), registered by walkover or decided.
- The result deadline (start + 48 h) closes the match: no result, a walkover nobody contested, or the end of the
  stats window of a confirmed result (RN09, RN10, RN15).

Contract: docs/decisoes/0002-jogar.md (sections 10 to 12).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models.matches import Match, MatchSearch, MatchSide, MatchSlot
from app.services import audit, notifications
from app.services.match_access import audience
from app.services.match_events import post_event
from app.services.match_rules import Score, expand_slots, next_match_state, walkover_score
from app.services.matchmaking_queue import queue
from app.services.standings import RankingKey, ranking_keys_for_match, recalculate_rankings

BATCH = 200


def open_declared_slots(db: Session, match: Match, *, now: datetime) -> list[MatchSlot]:
    """Opens the walk-in spots each side declared when searching (first scheduling only); the caller then offers
    them with `queue.offer_slots`."""
    sides = db.scalars(select(MatchSide).where(MatchSide.match_id == match.id).order_by(MatchSide.side)).all()
    slots = [MatchSlot(match_id=match.id, side=side.side, position=position, state='aberta', opened_at=now,
                       created_at=now)
             for side in sides for position in expand_slots(side.declared_slots)]
    db.add_all(slots)
    db.flush()
    return slots


def close_match_slots(db: Session, match: Match, *, now: datetime, actor_id: int | None = None) -> list[int]:
    """Closes every open, offered or filled slot (cancelled match). Walk-ins with a pending offer return to the
    queue and are told the offer was withdrawn (`oferta_retirada`); returns the walk-ins whose escalation ended,
    to be notified by the caller. Locks slot → search."""
    slots = db.scalars(select(MatchSlot).where(MatchSlot.match_id == match.id, MatchSlot.state != 'fechada')
                       .order_by(MatchSlot.id).with_for_update().execution_options(populate_existing=True)).all()
    offered = {search.slot_id: search for search in db.scalars(
        select(MatchSearch).where(MatchSearch.slot_id.in_([slot.id for slot in slots]),
                                  MatchSearch.state == 'pareada').order_by(MatchSearch.id).with_for_update()
        .execution_options(populate_existing=True)).all()} if slots else {}
    guests = []
    for slot in slots:
        if slot.state == 'oferecida' and slot.id in offered:
            queue.release_offer(db, offered[slot.id], slot, outcome='devolvida', now=now, actor_id=actor_id,
                                reason='partida_cancelada')
        if slot.state == 'preenchida':
            guests.append(slot.filled_by_id)
        slot.state, slot.closed_at = 'fechada', now
    db.flush()
    return guests


def apply_final_score(match: Match, score: Score, *, source: str, now: datetime, decided_by_id: int | None = None,
                      reason: str | None = None) -> None:
    """Stores the final result on the match (the caller moves the state: 'realizada' on confirmation, 'encerrada'
    for a walkover or a decision)."""
    match.score_a, match.score_b, match.winner_side = score.score_a, score.score_b, score.winner
    match.sets = score.sets_json()
    match.result_source, match.result_confirmed_at = source, now
    if source in ('organizador', 'administracao'):
        match.result_decided_by_id, match.result_decided_at, match.result_decision_reason = decided_by_id, now, reason
    match.updated_at = now


def close_due_results(db: Session, now: datetime) -> int:
    """Sweep task: friendlies whose 48 h passed without a confirmed result end 'sem_resultado'; an uncontested
    walkover becomes the result (3×0 or 6-0 6-0); a confirmed result closes its stats window ('encerrada').
    Contested walkovers wait for the administration and championship divergences for the organizer (stage 4).
    Rows are locked with SKIP LOCKED and re-checked by state, so a second run changes nothing.

    The rankings are recalculated once for the whole batch, over the union of the categories its matches touch:
    each category is read and written once (not once per match) and the ranking and bucket locks are taken in the
    fixed order of `recalculate_rankings`, whatever the order of the matches (global lock order, section 15.1)."""
    due = or_(Match.state == 'realizada',
              and_(Match.state == 'agendada', Match.origin == 'amistoso', Match.walkover_contested_at.is_(None)))
    matches = db.scalars(select(Match).where(due, Match.result_deadline <= now)
                         .order_by(Match.result_deadline, Match.id).limit(BATCH).with_for_update(skip_locked=True)).all()
    touched: set[RankingKey] = set()
    for match in matches:
        if match.state == 'realizada':
            match.state = next_match_state(match.state, 'encerrar')
            match.closed_at = match.updated_at = now
            audit.record(db, actor_id=None, action='partida.encerrada', target_type='match', target_id=match.id,
                         data={'automatico': True})
            touched.update(ranking_keys_for_match(db, match))
            continue
        people = audience(db, match)
        # The deadline closes the match: neither an uncontested walkover nor a divergence is waiting for an answer.
        notifications.resolve_actions_many(db, [notifications.walkover_key(match.id),
                                                notifications.result_key(match.id)])
        if match.walkover_absent_side is not None:
            apply_final_score(match, walkover_score(match.sport, match.walkover_absent_side), source='wo', now=now)
            match.state = next_match_state(match.state, 'confirmar_wo')
            match.closed_at = now
            notifications.notify_many(db, people, 'resultado_partida', {
                'match_id': match.id, 'outcome': 'wo', 'score_a': match.score_a, 'score_b': match.score_b,
                'absent_side': match.walkover_absent_side})
            post_event(db, match.id, 'resultado_confirmado', 'Prazo encerrado sem contestação: vale o W.O.',
                       side=match.winner_side, now=now)
            audit.record(db, actor_id=None, action='partida.wo_confirmado', target_type='match', target_id=match.id,
                         data={'absent_side': match.walkover_absent_side, 'automatico': True})
            touched.update(ranking_keys_for_match(db, match))
        else:
            match.state = next_match_state(match.state, 'fechar_sem_resultado')
            match.closed_at = match.updated_at = now
            notifications.notify_many(db, people, 'resultado_partida', {'match_id': match.id, 'outcome': 'sem_resultado'})
            post_event(db, match.id, 'sem_resultado',
                       'O prazo de 48 h acabou sem placar confirmado pelos dois lados. A partida ficou sem resultado.',
                       now=now)
            audit.record(db, actor_id=None, action='partida.sem_resultado', target_type='match', target_id=match.id,
                         data={'automatico': True})
    if touched:
        recalculate_rankings(db, touched, now=now)
    return len(matches)

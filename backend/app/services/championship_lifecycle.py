"""What happens to a championship around its matches (Times e campeonatos, fases 6 e 7): counters for the organizer's
poster, the winner that goes through the bracket, the end of the event with its placements and tennis bonus, and the
cancellation of the matches when the event is cancelled.

These are the hooks other modules call inside their own transaction (nothing here commits):

- `services/events.py` asks for `status_for` (poster and "Agora" of the organizer) and calls `cancel_event_matches`;
- `services/results.py` calls `after_score` once a championship match has its final score (equal reports, or the
  decision of the organizer) and `on_divergence` when the two reports differ;
- the sweep runs `finish_due_events` as a safety net for events whose last match closed while the event row was busy.

This module never imports `services/events.py` (events imports it). Lock order of the championship flows, an
extension of docs/decisoes/0003 section 19.1 and of 0002 section 15.5: event (level 3) → entries → matches of the
event, by id (feeders before the match they feed, because the matches are created in that order) → rankings →
buckets → searches. A score that goes through the bracket therefore locks the following match (`lock_following`)
before the rankings are recalculated. A route that starts from a match (`results.report_score`) holds the match first
and then only *tries* the event row (`SKIP LOCKED`), so it never waits for the event while a flow of the organizer
waits for the match.
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.models.brackets import EventBracket, EventPlacement
from app.models.events import Event, EventEntry
from app.models.identity import User
from app.models.matches import Match, MatchResult, MatchSide
from app.models.teams import Team
from app.services import audit, bracket_rules, notifications
from app.services.event_rules import (
    ChampionshipCounts,
    next_event_state,
    tennis_bonus,
)
from app.services.match_access import audience, load_sides
from app.services.match_events import post_event
from app.services.match_rules import next_match_state
from app.services.match_text import iso, side_names
from app.services.participants import entry_recipients
from app.services.standings import RankingKey, recalculate_rankings

OPEN_MATCH_STATES = ('combinando', 'agendada')
FINAL_RESULT_STATES = ('realizada', 'encerrada')
CHAMPIONSHIP_SPORTS = ('futebol', 'tenis')
# Events whose bracket and matches the organizer's poster summarizes (the ones that reached the draw or went past it).
COUNTED_EVENT_STATES = ('publicado', 'em_andamento', 'encerrado', 'cancelado')
BATCH = 100


def subject_of(row) -> tuple[str, int]:
    """('time', team id) or ('atleta', user id) of an entry, a match side or a placement."""
    return ('time', row.team_id) if row.team_id is not None else ('atleta', row.user_id)


def is_knockout(db: Session, match: Match) -> bool:
    """A championship match of a single-elimination event: it needs a winner."""
    if match.origin != 'campeonato' or match.event_id is None:
        return False
    return db.scalar(select(Event.competition_type).where(Event.id == match.event_id)) == 'eliminacao_simples'


# ----- Counters ----------------------------------------------------------------------------------------------

def has_championship(event: Event) -> bool:
    return (event.sport in CHAMPIONSHIP_SPORTS and event.competition_type is not None
            and event.state in COUNTED_EVENT_STATES)


def status_for(db: Session, events: Sequence[Event], now: datetime) -> dict[int, ChampionshipCounts]:
    """Bracket state, confirmed entries and match counters per event, in three queries. Only events that have (or
    can have) a bracket are in the answer."""
    ids = [event.id for event in events if has_championship(event)]
    if not ids:
        return {}
    brackets = {row.event_id: row.state for row in db.execute(
        select(EventBracket.event_id, EventBracket.state).where(EventBracket.event_id.in_(ids))).all()}
    confirmed = dict(db.execute(select(EventEntry.event_id, func.count()).where(
        EventEntry.event_id.in_(ids), EventEntry.state == 'confirmada').group_by(EventEntry.event_id)).all())
    side_count = (select(func.count()).select_from(MatchSide).where(MatchSide.match_id == Match.id)
                  .correlate(Match).scalar_subquery())
    report_a, report_b = aliased(MatchResult), aliased(MatchResult)
    differ = exists(select(report_a.id).select_from(report_a).join(report_b, report_b.match_id == report_a.match_id)
                    .where(report_a.match_id == Match.id, report_a.side == 'a', report_b.side == 'b',
                           or_(report_a.score_a != report_b.score_a, report_a.score_b != report_b.score_b,
                               report_a.sets.is_distinct_from(report_b.sets))).correlate(Match))
    rows = db.execute(select(
        Match.event_id, func.count(),
        func.count().filter(and_(Match.state == 'combinando', side_count == 2)),
        func.count().filter(and_(Match.state == 'combinando', side_count < 2)),
        func.count().filter(Match.state == 'agendada'),
        func.count().filter(and_(Match.state == 'agendada', or_(Match.result_deadline <= now, differ))),
        func.count().filter(Match.state.in_(FINAL_RESULT_STATES)),
    ).where(Match.event_id.in_(ids), Match.origin == 'campeonato').group_by(Match.event_id)).all()
    counts = {event_id: ChampionshipCounts(bracket=brackets.get(event_id, 'sem_chaveamento'),
                                           confirmed=confirmed.get(event_id, 0)) for event_id in ids}
    for event_id, total, to_schedule, waiting, scheduled, to_decide, finished in rows:
        counts[event_id] = ChampionshipCounts(
            bracket=brackets.get(event_id, 'sem_chaveamento'), confirmed=confirmed.get(event_id, 0),
            matches_total=total, to_schedule=to_schedule, waiting=waiting, scheduled=scheduled,
            to_decide=to_decide, finished=finished)
    return counts


# ----- Cancelled event ---------------------------------------------------------------------------------------

def cancel_event_matches(db: Session, event: Event, *, actor_id: int, now: datetime) -> list[int]:
    """The event was cancelled: every match still being arranged or scheduled is cancelled too (no commit); the
    participants already heard through the cancellation notice. Returns the ids. Matches are locked by id."""
    matches = db.scalars(select(Match).where(
        Match.event_id == event.id, Match.state.in_(OPEN_MATCH_STATES)).order_by(Match.id).with_for_update()
        .execution_options(populate_existing=True)).all()
    # Nothing is left to decide or to correct: the organizer's pending and both sides' divergence close with it.
    notifications.resolve_actions_many(db, [key for match in matches for key in (
        notifications.decision_key(match.id), notifications.result_key(match.id))])
    for match in matches:
        match.state = next_match_state(match.state, 'cancelar')
        match.cancelled_at, match.cancelled_by_id, match.cancel_reason = now, actor_id, 'Evento cancelado.'
        match.closed_at = match.updated_at = now
        post_event(db, match.id, 'partida_cancelada', 'O evento foi cancelado. A partida não será disputada.',
                   payload={'reason': 'Evento cancelado.'}, now=now)
        audit.record(db, actor_id=actor_id, action='partida.cancelada', target_type='match', target_id=match.id,
                     data={'event_id': event.id, 'automatico': True, 'motivo': 'evento_cancelado'})
    return [match.id for match in matches]


# ----- A score becomes final ---------------------------------------------------------------------------------

def on_divergence(db: Session, match: Match, *, now: datetime) -> None:
    """The two sides informed different scores in a championship: the organizer is asked to decide (no commit)."""
    event = db.get(Event, match.event_id)
    notifications.notify(db, event.organizer_user_id, 'divergencia_para_decidir', {
        'match_id': match.id, 'event_id': event.id, 'event_name': event.name, 'deadline': iso(match.result_deadline)},
        action_key=notifications.decision_key(match.id), action_until=match.result_deadline)


def lock_following(db: Session, match: Match) -> None:
    """Locks the match this one feeds, *before* the rankings of the score are recalculated (no commit).

    `advance_winner` writes on that match, which is a match lock (level 2 of the global order, 0002 section 15.5):
    taking it after the ranking, bucket and search locks of `recalculate_for_match` would ask for a match while
    holding a lower level. A match and the one it feeds are locked by id (the feeder has the smaller one), so the
    order stays match → match → ranking. Friendlies and the final of a bracket have nothing to lock."""
    if match.origin == 'campeonato' and match.next_match_id is not None:
        db.scalar(select(Match.id).where(Match.id == match.next_match_id).with_for_update())


def after_score(db: Session, match: Match, *, now: datetime) -> None:
    """Called in the transaction that gives a championship match its final score: the winner goes through the
    bracket, and the event ends if that was the last match (no commit). Friendlies are ignored. Callers lock the
    following match first (`lock_following`), before they recalculate the rankings."""
    if match.origin != 'campeonato' or match.event_id is None:
        return
    event = db.get(Event, match.event_id)
    if event.competition_type == 'eliminacao_simples':
        advance_winner(db, event, match, now=now)
    try_finish(db, event.id, now=now)


def advance_winner(db: Session, event: Event, match: Match, *, now: datetime) -> bool:
    """Puts the winner on its side of the next match (`next_match_id`, `next_match_side`). When both sides of the
    next match are known, the chat gets a banner and both rosters are told who they face. Idempotent."""
    if match.next_match_id is None or match.winner_side is None:
        return False
    winner = db.scalar(select(MatchSide).where(MatchSide.match_id == match.id, MatchSide.side == match.winner_side))
    following = db.scalar(select(Match).where(Match.id == match.next_match_id).with_for_update()
                          .execution_options(populate_existing=True))
    if winner is None or following is None or following.state != 'combinando':
        return False
    sides = load_sides(db, [following.id])[following.id]
    if match.next_match_side in sides:
        return False
    side = MatchSide(match_id=following.id, side=match.next_match_side, team_id=winner.team_id, user_id=winner.user_id,
                     created_at=now)
    db.add(side)
    db.flush()
    sides[side.side] = side
    audit.record(db, actor_id=None, action='chaveamento.avancou', target_type='match', target_id=following.id,
                 data={'event_id': event.id, 'from_match_id': match.id, 'side': side.side,
                       'team_id': winner.team_id, 'user_id': winner.user_id, 'automatico': True})
    if len(sides) == 2:
        names = side_names(db, sides)
        post_event(db, following.id, 'partida_combinando',
                   f'{names["a"]} × {names["b"]}: adversários definidos. O organizador agenda data, horário e quadra.',
                   now=now)
        for label, other in (('a', 'b'), ('b', 'a')):
            notifications.notify_many(db, audience(db, following, sides={label: sides[label]}, include_guests=False),
                                      'adversario_definido', {
                                          'match_id': following.id, 'event_id': event.id, 'event_name': event.name,
                                          'opponent_name': names[other]})
    return True


# ----- End of the event --------------------------------------------------------------------------------------

def try_finish(db: Session, event_id: int, *, now: datetime) -> bool:
    """Ends the event if every match has its final result. The event row is only *tried* (`SKIP LOCKED`): when a
    flow of the organizer holds it, that flow (or the sweep, `finish_due_events`) ends the event instead."""
    event = db.scalar(select(Event).where(Event.id == event_id, Event.state == 'em_andamento')
                      .with_for_update(skip_locked=True).execution_options(populate_existing=True))
    return event is not None and finish_event(db, event, now=now)


def finish_event(db: Session, event: Event, *, now: datetime) -> bool:
    """Final placements, tennis bonus and the end of the event, when no match is left to play (no commit).

    Single elimination: champion 1st, runner-up 2nd, the losers of the semifinals 3rd. Round robin: the position in
    the table. Tennis events with 4 or more confirmed entries give the bonus of RN16, which the tennis ranking adds."""
    matches = list(db.scalars(select(Match).where(Match.event_id == event.id, Match.origin == 'campeonato')
                              .order_by(Match.round_number, Match.bracket_position, Match.id)))
    if not matches or any(match.state in OPEN_MATCH_STATES for match in matches):
        return False
    entries = list(db.scalars(select(EventEntry).where(
        EventEntry.event_id == event.id, EventEntry.state == 'confirmada').order_by(EventEntry.created_at,
                                                                                    EventEntry.id)))
    entry_of = {subject_of(entry): entry for entry in entries}
    sides = load_sides(db, [match.id for match in matches])
    scored = [match for match in matches if match.state in FINAL_RESULT_STATES and match.score_a is not None]

    def entry_at(match: Match, label: str) -> EventEntry | None:
        side = sides[match.id].get(label)
        return entry_of.get(subject_of(side)) if side is not None else None

    champion_entry: EventEntry | None = None
    if event.competition_type == 'eliminacao_simples':
        last = max(match.round_number for match in matches)
        final = next((match for match in matches if match.round_number == last), None)
        if final is None or final.winner_side is None or final.state not in FINAL_RESULT_STATES:
            return False
        champion_entry = entry_at(final, final.winner_side)
        runner_up = entry_at(final, 'b' if final.winner_side == 'a' else 'a')
        semifinal_losers = [entry_at(match, 'b' if match.winner_side == 'a' else 'a') for match in scored
                            if last >= 2 and match.round_number == last - 1 and match.winner_side is not None]
        if champion_entry is None or runner_up is None:
            return False
        by_entry = bracket_rules.elimination_placements(champion_entry.id, runner_up.id,
                                                        [entry.id for entry in semifinal_losers if entry is not None])
    else:
        bracket = db.scalar(select(EventBracket).where(EventBracket.event_id == event.id))
        order = [entry_id for entry_id in (bracket.slots if bracket is not None else []) if entry_id is not None] \
            or [entry.id for entry in entries]
        results = [(entry_at(match, 'a').id, entry_at(match, 'b').id, match.score_a, match.score_b)
                   for match in scored if entry_at(match, 'a') is not None and entry_at(match, 'b') is not None]
        table = bracket_rules.table_standings(order, results)
        by_entry = bracket_rules.table_placements(table)
        champion_entry = next((entry for entry in entries if entry.id == table[0].entry_id), None) if table else None

    bonus = tennis_bonus(event.sport, len(entries))
    applies = bool(bonus and bonus['applies'])
    entries_by_id = {entry.id: entry for entry in entries}
    for entry_id, placement in sorted(by_entry.items(), key=lambda item: (item[1], item[0])):
        entry = entries_by_id.get(entry_id)
        if entry is None:
            continue
        db.add(EventPlacement(event_id=event.id, entry_id=entry.id, team_id=entry.team_id, user_id=entry.user_id,
                              placement=placement, bonus_points=bracket_rules.placement_bonus(placement)
                              if applies else 0, awarded_at=now))
    event.state = next_event_state(event.state, 'encerrar')
    event.updated_at = now
    db.flush()

    champion_name = _entry_name(db, champion_entry)
    recipients = entry_recipients(db, entries, scope='membros')
    notifications.notify_many(db, [event.organizer_user_id, *(user for entry in entries for user in recipients[entry.id])],
                              'evento_encerrado', {'event_id': event.id, 'event_name': event.name,
                                                   'champion': champion_name})
    audit.record(db, actor_id=None, action='evento.encerrado', target_type='event', target_id=event.id,
                 data={'automatico': True, 'champion_entry_id': champion_entry.id if champion_entry else None,
                       'placements': {str(entry_id): placement for entry_id, placement in by_entry.items()},
                       'tennis_bonus': applies, 'matches': len(matches)})
    if applies:
        recalculate_rankings(db, [RankingKey('tenis')], now=now)
    return True


def _entry_name(db: Session, entry: EventEntry | None) -> str | None:
    """Team or athlete name of an entry, copied into the notification."""
    if entry is None:
        return None
    if entry.team_id is not None:
        return db.scalar(select(Team.name).where(Team.id == entry.team_id))
    return db.scalar(select(User.name).where(User.id == entry.user_id))


def finish_due_events(db: Session, now: datetime) -> int:
    """Sweep task `campeonatos_encerrados`: events in progress whose matches all have a final result. Rows are
    locked with SKIP LOCKED and re-checked, so a second run changes nothing."""
    open_match = exists().where(Match.event_id == Event.id, Match.state.in_(OPEN_MATCH_STATES))
    any_match = exists().where(Match.event_id == Event.id, Match.origin == 'campeonato')
    events = db.scalars(select(Event).where(Event.state == 'em_andamento', any_match, ~open_match)
                        .order_by(Event.id).limit(BATCH).with_for_update(skip_locked=True)).all()
    return sum(1 for event in events if finish_event(db, event, now=now))


__all__ = ['after_score', 'advance_winner', 'cancel_event_matches', 'finish_due_events', 'finish_event',
           'has_championship', 'is_knockout', 'lock_following', 'on_divergence', 'status_for', 'subject_of',
           'try_finish']

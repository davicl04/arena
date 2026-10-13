"""Helpers of the partida front (terms, courts, booking, cancellation, walkover and chat): HTTP over rows created
straight from the models, with a fixed clock so every deadline is deterministic (fixtures in `conftest.py`).

Sessions are real (`create_session`), so the bearer token authenticates.
"""
from datetime import timedelta

from sqlalchemy import select

from app.models.matches import Court, Match, MatchMessage, MatchSide, MatchSlot, MatchTerms
from app.services.identity import create_session
from app.services.match_rules import court_key, result_deadline
from tests.integration.match_helpers import CITY, NOW, add

MINUTE = timedelta(minutes=1)
HOUR = timedelta(hours=1)
DAY = timedelta(days=1)
API = '/api/v1'


def login(db, user) -> dict:
    token, _ = create_session(db, user)
    return {'Authorization': f'Bearer {token}'}


def make_court(db, name='Quadra Central', *, kind='society', state='publicada', suggested_by=None, origin=None,
               city_id=CITY, address=None):
    decided = state != 'em_revisao'
    return add(db, Court(city_id=city_id, name=name, name_key=court_key(name), kind=kind, state=state, address=address,
                         suggested_by_id=suggested_by.id if suggested_by else None,
                         origin_match_id=origin.id if origin else None,
                         published_at=NOW if state == 'publicada' else None, reviewed_at=NOW if decided else None,
                         review_reason='Duplicada' if state == 'rejeitada' else None, created_at=NOW - DAY))


def make_match(db, state, subjects, *, sport='futebol', format_='society', origin='amistoso', starts_at=None,
               court=None, tiers=(None, None), **fields):
    """A match in any state with its sides; `subjects` are teams (football) or users (tennis)."""
    values = dict(sport=sport, format=format_ if sport == 'futebol' else None, city_id=CITY, origin=origin,
                  state=state, created_at=NOW - DAY, updated_at=NOW)
    if state == 'proposta':
        values['proposal_expires_at'] = NOW + HOUR
    if starts_at is not None:
        values.update(starts_at=starts_at, result_deadline=result_deadline(starts_at), booking_side='a',
                      court_id=court.id if court else None)
    if state in ('cancelada', 'sem_resultado', 'encerrada', 'recusada', 'expirada'):
        values['closed_at'] = NOW
    if state == 'cancelada':
        values['cancelled_at'] = NOW
    values.update(fields)
    match = add(db, Match(**values))
    key = 'user_id' if sport == 'tenis' else 'team_id'
    for label, subject, tier in zip('ab', subjects, tiers):
        add(db, MatchSide(match_id=match.id, side=label, tier=tier, accepted_at=NOW - HOUR, **{key: subject.id}))
    return match


def accepted_terms(db, match, court, starts_at, *, proposer=None, booking_side='a', super_tiebreak=None):
    return add(db, MatchTerms(
        match_id=match.id, proposed_by_id=proposer.id if proposer else None, proposed_by_side='a',
        starts_at=starts_at, court_id=court.id, booking_side=booking_side, super_tiebreak=super_tiebreak,
        state='aceita', accepted_a_at=NOW - HOUR, accepted_b_at=NOW - HOUR, decided_at=NOW - HOUR,
        created_at=NOW - 2 * HOUR))


def agreed_match(db, world, *, starts_at=None, state='agendada', **fields):
    """A scheduled football friendly with accepted terms, the way the second acceptance leaves it."""
    starts_at = starts_at or NOW + 3 * DAY
    match = make_match(db, state, [world['team_a'], world['team_b']], starts_at=starts_at, court=world['court'],
                       **fields)
    accepted_terms(db, match, world['court'], starts_at, proposer=world['rep_a'])
    return match


def fill_slot(db, match, guest, *, side='b', position='goleiro'):
    """A walk-in already in the match: a filled slot (the way `accept_offer` leaves it)."""
    return add(db, MatchSlot(match_id=match.id, side=side, position=position, state='preenchida', opened_at=NOW,
                             filled_by_id=guest.id, filled_at=NOW))


def messages_of(db, match):
    return db.scalars(select(MatchMessage).where(MatchMessage.match_id == match.id).order_by(MatchMessage.id)).all()


def events_of(db, match, event_type):
    return [message for message in messages_of(db, match) if message.event_type == event_type]


def iso_at(moment):
    return moment.isoformat()

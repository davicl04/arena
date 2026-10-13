"""Helpers of the result, stats and ranking tests: sessions for users made straight from the models, a fixed clock
for the routes and matches already played, with confirmed scores, at a known time.
"""
import secrets
from datetime import timedelta

from app.models.identity import AuthSession, utcnow
from app.models.matches import Match, MatchLineup, MatchSide
from app.services.identity import digest_token
from app.services.match_lifecycle import apply_final_score
from app.services.match_rules import result_deadline, validate_football_score, validate_tennis_sets
from tests.integration.match_helpers import CITY, NOW, add, scheduled_match

HOUR = timedelta(hours=1)
DAY = timedelta(days=1)
WEEK = timedelta(weeks=1)


def login(db, user):
    """Authorization header of a session for a user created by the models (they have no usable password)."""
    token = secrets.token_urlsafe(24)
    add(db, AuthSession(user_id=user.id, token_hash=digest_token(token), expires_at=utcnow() + 2 * DAY))
    return {'Authorization': f'Bearer {token}'}


def use_clock(monkeypatch, moment=NOW):
    """Fixes the moment the result routes use; returns a dict whose 'now' the test may move."""
    clock = {'now': moment}
    monkeypatch.setattr('app.routers.results.utcnow', lambda: clock['now'])
    return clock


def tennis_match(db, player_a, player_b, *, starts_at=NOW - 2 * HOUR, super_tiebreak=None, state='agendada',
                 city_id=CITY):
    match = add(db, Match(sport='tenis', format=None, city_id=city_id, origin='amistoso', state=state,
                          starts_at=starts_at, result_deadline=result_deadline(starts_at), booking_side='a',
                          super_tiebreak=super_tiebreak, created_at=starts_at - DAY, updated_at=starts_at))
    for label, player in (('a', player_a), ('b', player_b)):
        add(db, MatchSide(match_id=match.id, side=label, user_id=player.id, accepted_at=starts_at - DAY,
                          created_at=starts_at - DAY))
    return match


def played(db, team_a, team_b, goals_a, goals_b, *, starts_at=NOW - 2 * HOUR, format_='society', city_id=None):
    """A friendly with a confirmed score ('realizada'), as after both sides reported the same score."""
    match = scheduled_match(db, team_a, team_b, starts_at=starts_at, format_=format_, open_slots=False,
                            **({'city_id': city_id} if city_id else {}))
    apply_final_score(match, validate_football_score(goals_a, goals_b), source='confirmacao',
                      now=starts_at + 3 * HOUR)
    match.state = 'realizada'
    db.flush()
    return match


def played_tennis(db, player_a, player_b, sets, *, starts_at=NOW - 2 * HOUR, super_tiebreak=None):
    """A tennis match with a confirmed score ('realizada'); `sets` are the dicts of the route body."""
    match = tennis_match(db, player_a, player_b, starts_at=starts_at, super_tiebreak=super_tiebreak)
    apply_final_score(match, validate_tennis_sets(sets, super_tiebreak=bool(super_tiebreak)),
                      source='confirmacao', now=starts_at + 3 * HOUR)
    match.state = 'realizada'
    db.flush()
    return match


def lineup(db, match, user, side, position, *, present=True, guest=False, team_id=None):
    return add(db, MatchLineup(match_id=match.id, side=side, user_id=user.id, team_id=team_id, guest=guest,
                               position=position, present=present, created_at=NOW, updated_at=NOW))


def put_result(http, headers, match_id, goals_a=None, goals_b=None, **body):
    if goals_a is not None:
        body.update(goals_a=goals_a, goals_b=goals_b)
    return http.put(f'/api/v1/matches/{match_id}/result', json=body, headers=headers)

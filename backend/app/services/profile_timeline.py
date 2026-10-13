"""Timeline of the profile (aba Partidas): matches and runs of one athlete in a single list, newest first.

Contract: docs/plano-perfil-partidas.md, part A2. The union is made on the server. The order is `occurred_at`
descending, then `kind` ascending ('corrida' before 'partida') and `id` descending; the opaque cursor carries
`occurred_at|kind|id` of the last item, so a page never repeats or skips an item even when a match and runs share
a start. A run happens on a Brasília calendar day: its `occurred_at` is midnight in Brasília of `ran_on`.

Access is the caller's (`social._can_view`). The court is only loaded for the owner of the profile; the next match,
chat, conditions, contests and sports profile data never leave here.

`previous_best_s` of a run is recalculated per row with the semantics of `runs.create_run`: the best time of the
same athlete and standard distance among the marks that already existed when it was registered
(`(created_at, id)` before its own) and fall in the 52 weeks that end on the Brasília day of its registration.
"""
from __future__ import annotations

import base64
import binascii
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from fastapi import HTTPException
from sqlalchemy import Date, DateTime, and_, cast, func, or_, select, tuple_
from sqlalchemy.orm import Session, aliased

from app.models.events import Event
from app.models.identity import User
from app.models.matches import Court, Match
from app.models.runs import Run
from app.models.teams import Team
from app.schemas.matches import score_out
from app.schemas.profile import (
    TimelineAthleteOut,
    TimelineCourtOut,
    TimelineEventOut,
    TimelineMatchOut,
    TimelinePageOut,
    TimelineRunOut,
    TimelineSideOut,
    TimelineStatsOut,
)
from app.schemas.rankings import TeamRefOut
from app.services import run_rules
from app.services.bracket_rules import round_name
from app.services.match_access import load_sides
from app.services.people import people_out
from app.services.profile_history import (
    counted_stats,
    is_final,
    outcome_of,
    owner_sides,
    participation_clause,
    points_of,
    valid_walkover_side,
)
from app.services.runs import _origin, _with_event

CURSOR_INVALID = 'Cursor de paginação inválido.'
KIND_RUN = 'corrida'
KIND_MATCH = 'partida'
RUN_WINDOW_DAYS = run_rules.RUN_WINDOW_WEEKS * 7
BRASILIA_OFFSET = timedelta(hours=3)


@dataclass(frozen=True)
class Point:
    occurred_at: datetime
    kind: str
    id: int


def encode_cursor(point: Point) -> str:
    raw = f'{point.occurred_at.isoformat()}|{point.kind}|{point.id}'.encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')


def decode_cursor(value: str | None) -> Point | None:
    if not value:
        return None
    try:
        raw = base64.urlsafe_b64decode(value + '=' * (-len(value) % 4)).decode()
        stamp, kind, item_id = raw.rsplit('|', 2)
        occurred = datetime.fromisoformat(stamp)
        if occurred.tzinfo is None or kind not in (KIND_RUN, KIND_MATCH):
            raise ValueError
        return Point(occurred.astimezone(UTC), kind, int(item_id))
    except (ValueError, binascii.Error, UnicodeDecodeError):
        raise HTTPException(422, CURSOR_INVALID) from None


def _run_moment(day: date) -> datetime:
    """A run happens on a Brasília calendar day: its moment is that day's midnight in Brasília."""
    return datetime.combine(day, time.min, tzinfo=run_rules.BRASILIA)


def _match_after(point: Point):
    """Matches that come after the cursor in the order (`kind` ascending: a run comes before a match)."""
    earlier = Match.starts_at < point.occurred_at
    same = Match.starts_at == point.occurred_at
    if point.kind == KIND_RUN:
        return or_(earlier, same)
    return or_(earlier, and_(same, Match.id < point.id))


def _run_after(point: Point):
    """Runs that come after the cursor: the day is compared as the midnight it stands for."""
    moment = point.occurred_at.astimezone(run_rules.BRASILIA)
    midnight = moment.time() == time.min
    before_day = moment.date() - timedelta(days=1) if midnight else moment.date()
    earlier = Run.ran_on <= before_day
    if point.kind == KIND_MATCH or not midnight:
        return earlier
    return or_(earlier, and_(Run.ran_on == moment.date(), Run.id < point.id))


# ----- Matches -----------------------------------------------------------------------------------------------

def _match_statement(owner_id: int, sport: str | None):
    statement = select(Match).where(participation_clause(owner_id))
    if sport in ('futebol', 'tenis'):
        statement = statement.where(Match.sport == sport)
    return statement


def _match_items(db: Session, viewer: User, owner: User, matches: Sequence[Match]) -> list[TimelineMatchOut]:
    if not matches:
        return []
    sides = load_sides(db, [match.id for match in matches])
    mine, lineups = owner_sides(db, owner.id, matches, sides)
    stats = counted_stats(db, matches, lineups)
    rows = [side for by_side in sides.values() for side in by_side.values()]
    team_ids = {side.team_id for side in rows if side.team_id is not None}
    teams = {team.id: team for team in db.scalars(select(Team).where(Team.id.in_(team_ids)))} if team_ids else {}
    people = people_out(db, viewer, (side.user_id for side in rows))
    event_ids = {match.event_id for match in matches if match.event_id is not None}
    events = {event.id: event for event in db.scalars(select(Event).where(Event.id.in_(event_ids)))} if event_ids else {}
    rounds = dict(db.execute(select(Match.event_id, func.max(Match.round_number)).where(
        Match.event_id.in_(event_ids)).group_by(Match.event_id)).all()) if event_ids else {}
    court_ids = {match.court_id for match in matches if match.court_id is not None}
    courts = {}
    if viewer.id == owner.id and court_ids:
        courts = {court.id: court.name for court in db.scalars(select(Court).where(Court.id.in_(court_ids)))}
    return [_match_out(match, sides[match.id], mine[match.id], stats.get(match.id), teams, people, events, rounds,
                       courts) for match in matches]


def _round_label(match: Match, event: Event | None, rounds: dict) -> str | None:
    if match.origin != 'campeonato' or event is None or match.round_number is None:
        return None
    if event.competition_type == 'eliminacao_simples':
        return round_name(match.round_number, rounds.get(event.id) or match.round_number)
    return f'Rodada {match.round_number}'


def _match_out(match: Match, by_side, owner_side: str | None, stat: dict | None, teams, people, events, rounds,
               courts) -> TimelineMatchOut:
    final = is_final(match)
    outcome = outcome_of(match, owner_side)
    absent = valid_walkover_side(match) if final else None
    side_out = []
    for key in sorted(by_side):
        side = by_side[key]
        team = teams.get(side.team_id) if side.team_id is not None else None
        person = people.get(side.user_id) if side.user_id is not None else None
        side_out.append(TimelineSideOut(
            side=key, kind='time' if side.team_id is not None else 'atleta',
            team=TeamRefOut(id=team.id, name=team.name, initials=team.initials, crest_url=team.crest_url)
            if team is not None else None,
            athlete=TimelineAthleteOut(id=person.id, name=person.name, username=person.username,
                                       avatar_url=person.avatar_url) if person is not None else None,
            is_owner=owner_side is not None and key == owner_side))
    event = events.get(match.event_id) if match.event_id is not None else None
    return TimelineMatchOut(
        id=match.id, sport=match.sport, format=match.format, origin=match.origin, state=match.state,
        occurred_at=match.starts_at, sides=side_out, owner_side=owner_side,
        score=score_out(match.score_a, match.score_b, match.sets, match.winner_side) if final else None,
        outcome=outcome, walkover_absent_side=absent, points=points_of(match, outcome),
        stats=TimelineStatsOut(**stat) if stat else None,
        event=TimelineEventOut(id=event.id, name=event.name) if event is not None else None,
        round_label=_round_label(match, event, rounds),
        court=TimelineCourtOut(name=courts[match.court_id]) if match.court_id in courts else None)


# ----- Runs --------------------------------------------------------------------------------------------------

def _previous_best():
    """Best time before each run, with the semantics of `runs.create_run` (see the module docstring)."""
    other = aliased(Run)
    day = cast(func.timezone('UTC', Run.created_at, type_=DateTime()) - BRASILIA_OFFSET, Date)
    return (select(func.min(other.duration_s))
            .where(other.user_id == Run.user_id, other.standard_distance_km == Run.standard_distance_km,
                   tuple_(other.created_at, other.id) < tuple_(Run.created_at, Run.id),
                   other.ran_on >= day - RUN_WINDOW_DAYS, other.ran_on <= day)
            .scalar_subquery())


def _run_statement(owner_id: int):
    return _with_event(select(Run, _previous_best().label('previous_best')).where(Run.user_id == owner_id))


def _run_out(run: Run, previous: int | None, event_id: int | None, event_name: str | None) -> TimelineRunOut:
    kind = None
    if run.standard_distance_km is not None:
        kind = run_rules.run_kind(run.standard_distance_km, previous, run.duration_s)
    return TimelineRunOut(
        id=run.id, occurred_at=_run_moment(run.ran_on), date=run.ran_on, distance_m=run.distance_m,
        standard_distance_km=run.standard_distance_km, duration_s=run.duration_s,
        pace_s_per_km=run_rules.pace_s_per_km(run.distance_m, run.duration_s),
        origin=_origin(run.source, event_id, event_name),
        previous_best_s=previous if run.standard_distance_km is not None else None, mark_kind=kind)


# ----- Page --------------------------------------------------------------------------------------------------

def timeline(db: Session, viewer: User, owner: User, *, sport: str | None, cursor: str | None,
             limit: int) -> TimelinePageOut:
    point = decode_cursor(cursor)
    want_matches, want_runs = sport != KIND_RUN, sport in (None, KIND_RUN)
    matches: list[Match] = []
    runs: list = []
    total = 0
    if want_matches:
        base = _match_statement(owner.id, sport)
        total += db.scalar(select(func.count()).select_from(base.order_by(None).subquery())) or 0
        page = base if point is None else base.where(_match_after(point))
        matches = list(db.scalars(page.order_by(Match.starts_at.desc(), Match.id.desc()).limit(limit + 1)))
    if want_runs:
        total += db.scalar(select(func.count()).select_from(Run).where(Run.user_id == owner.id)) or 0
        page = _run_statement(owner.id)
        if point is not None:
            page = page.where(_run_after(point))
        runs = db.execute(page.order_by(Run.ran_on.desc(), Run.id.desc()).limit(limit + 1)).all()

    merged: list[tuple[Point, object]] = [(Point(match.starts_at.astimezone(UTC), KIND_MATCH, match.id), match)
                                          for match in matches]
    merged += [(Point(_run_moment(row[0].ran_on).astimezone(UTC), KIND_RUN, row[0].id), row) for row in runs]
    merged.sort(key=lambda item: item[0].id, reverse=True)
    merged.sort(key=lambda item: item[0].kind)
    merged.sort(key=lambda item: item[0].occurred_at, reverse=True)
    more = len(merged) > limit
    merged = merged[:limit]

    built_matches = {out.id: out for out in _match_items(
        db, viewer, owner, [item for _, item in merged if isinstance(item, Match)])}
    items = []
    for key, item in merged:
        if isinstance(item, Match):
            items.append(built_matches[item.id])
        else:
            run, previous, event_id, event_name = item
            items.append(_run_out(run, previous, event_id, event_name))
    next_cursor = encode_cursor(merged[-1][0]) if more and merged else None
    return TimelinePageOut(items=items, next_cursor=next_cursor, total=total)


__all__ = ['decode_cursor', 'encode_cursor', 'timeline']

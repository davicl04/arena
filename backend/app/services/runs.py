"""Running marks: preview, registration, history, best marks per distance and removal (Jogar, fase 6).

Contract: docs/decisoes/0002-jogar.md, section 18. A mark is self-declared (RN17): no proof is requested, the
origin the athlete sees is "Treino" or the name of the Arena race, and `verified` stays false. Registering or
removing a mark recalculates the ranking of its standard distance in the same transaction (`services.standings`,
best time of the 52-week window, the lowest wins, the first mark classifies); a mark outside every ±2% band stays in
the history and touches no ranking. Running has no search, so nothing changes in the pairing.

Locks, in the global order of 0003 section 19.1: for an Arena race mark, the event FOR SHARE, then the entry FOR
UPDATE (`entries.load_entry_for`), then the ranking of the distance (advisory lock of `standings`); the unique index
of `runs.event_entry_id` is the last barrier against two marks for one entry.
"""
from __future__ import annotations

import base64
import binascii
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import exists, func, select, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.pagination import PAGE_DEFAULT
from app.models.events import Event, EventEntry
from app.models.identity import User
from app.models.rankings import RUN_DISTANCES_KM, Standing
from app.models.runs import Run
from app.schemas.runs import (
    RunBestMarkOut,
    RunBestOut,
    RunBestsOut,
    RunCreatedOut,
    RunImpactOut,
    RunInput,
    RunOriginOut,
    RunOut,
    RunPageOut,
    RunPreviewOut,
    RunRaceOut,
    RunRacesOut,
    RunSeriesPointOut,
)
from app.services import audit, run_rules
from app.services.entries import ENTRY_NOT_FOUND, load_entry_for
from app.services.match_rules import RuleError, TransitionError
from app.services.rankings import (
    CURRENT_CALC_VERSION,
    Cuts,
    load_cuts,
    ranking_key,
    required_matches,
    standing_line,
    tier_for,
)
from app.services.standings import RankingKey, recalculate_rankings

SERIES_MAX = 60
RACES_MAX = 50
CURSOR_INVALID = 'Cursor de paginação inválido.'
RUN_NOT_FOUND = 'Marca não encontrada.'
ALREADY_REGISTERED = 'Você já registrou a marca desta prova.'
RACE_STATES = ('publicado', 'em_andamento', 'encerrado')


@dataclass(frozen=True)
class Checked:
    """A mark that passed every rule: what will be stored."""
    distance_m: int
    duration_s: int
    day: date
    source: str
    standard: int | None
    entry: EventEntry | None = None
    event: Event | None = None


# ----- Rules that need the database --------------------------------------------------------------------------

def _race_entry(db: Session, user: User, entry_id: int, *, lock: bool) -> tuple[EventEntry, Event]:
    """The athlete's own entry (404 for anyone else, even the organizer or the administration)."""
    entry, event, _ = load_entry_for(db, entry_id, user, for_update=lock)
    if entry.user_id != user.id:
        raise HTTPException(404, ENTRY_NOT_FOUND)
    return entry, event


def _check_race(db: Session, data: RunInput, entry: EventEntry, event: Event, standard: int | None,
                now: datetime) -> date:
    """Rules of the "Prova do Arena": a running race of the athlete's confirmed entry, already started, with the
    race distance (±2%) and one mark per entry. Returns the race day, which is the day of the mark."""
    if event.sport != 'corrida':
        raise RuleError('Esta inscrição não é de uma prova de corrida.', 'entry_id')
    if entry.state != 'confirmada':
        raise TransitionError('Só inscrições confirmadas registram a marca da prova.')
    if event.state not in RACE_STATES:
        raise TransitionError('Esta prova foi cancelada.')
    if event.starts_at is None or event.starts_at > now:
        raise TransitionError('A marca da prova é registrada depois da largada.')
    day = run_rules.local_date(event.starts_at)
    if data.date is not None and data.date != day:
        raise RuleError('A data da prova é a do evento.', 'date')
    if standard != event.distance_km:
        raise RuleError(f'A distância informada não corresponde aos {event.distance_km} km desta prova.',
                        'distance_m')
    if db.scalar(select(exists().where(Run.event_entry_id == entry.id))):
        raise TransitionError(ALREADY_REGISTERED)
    return day


def check_run(db: Session, user: User, data: RunInput, now: datetime, *, lock: bool) -> Checked:
    """Every rule of a mark, in the order the athlete meets them; `lock` takes the entry locks of a race mark.

    Errors: 404 (entry not the athlete's), 422 with the field (measure, date, distance of the race) and 409 (entry
    or event state, or the race already has its mark)."""
    entry = event = None
    if data.source == 'treino':
        if data.entry_id is not None:
            raise RuleError('O treino não tem prova.', 'entry_id')
    else:
        if data.entry_id is None:
            raise RuleError('Escolha a prova do Arena.', 'entry_id')
        entry, event = _race_entry(db, user, data.entry_id, lock=lock)
    run_rules.validate_measure(data.distance_m, data.duration_s)
    standard = run_rules.resolve_standard_distance(data.distance_m)
    today = run_rules.local_date(now)
    if entry is None:
        day = data.date or today
        run_rules.validate_day(day, today)
    else:
        day = _check_race(db, data, entry, event, standard, now)
        run_rules.validate_day(day, today, race=True)
    return Checked(data.distance_m, data.duration_s, day, data.source, standard, entry, event)


# ----- Impact on the ranking ----------------------------------------------------------------------------------

def _window(now: datetime) -> tuple[date, date]:
    """(today, first day of the 52-week window) in Brasília."""
    today = run_rules.local_date(now)
    return today, run_rules.window_start_day(today)


def _in_window(user_id: int, km: int, start_day: date, today: date) -> tuple:
    return (Run.user_id == user_id, Run.standard_distance_km == km, Run.ran_on >= start_day, Run.ran_on <= today)


def _live_best(db: Session, user_id: int, km: int, start_day: date, today: date) -> int | None:
    return db.scalar(select(func.min(Run.duration_s)).where(*_in_window(user_id, km, start_day, today)))


def _stored_tier(db: Session, user_id: int, km: int) -> str | None:
    return db.scalar(select(Standing.tier).where(Standing.user_id == user_id, Standing.sport == 'corrida',
                                                 Standing.distance_km == km))


def _estimated_tier(db: Session, user_id: int, km: int, best_s: int, cuts: Cuts, start_day: date,
                    today: date) -> str:
    """The tier a best time would have today: the position counts the other athletes with the same time or a
    better one (a tie goes to who ran first, so the estimate is the cautious one for Lendário), and the athlete
    joins the classified. The saved mark gets the exact value from the recalculation."""
    others = (select(Run.user_id, func.min(Run.duration_s).label('best'))
              .where(Run.user_id != user_id, Run.standard_distance_km == km, Run.ran_on >= start_day,
                     Run.ran_on <= today).group_by(Run.user_id).subquery())
    classified, ahead = db.execute(select(func.count(), func.count().filter(others.c.best <= best_s))
                                   .select_from(others)).one()
    return tier_for(Decimal(best_s), cuts, rank_position=ahead + 1, classified_count=classified + 1)


@dataclass(frozen=True)
class Before:
    """The athlete's standing in the distance before the mark."""
    previous_best_s: int | None
    tier: str | None


def _before(db: Session, user_id: int, checked: Checked, start_day: date, today: date) -> Before:
    if checked.standard is None:
        return Before(None, None)
    previous = _live_best(db, user_id, checked.standard, start_day, today)
    return Before(previous, _stored_tier(db, user_id, checked.standard) if previous is not None else None)


def _impact(checked: Checked, before: Before, tier_after: str | None) -> RunImpactOut:
    kind = run_rules.run_kind(checked.standard, before.previous_best_s, checked.duration_s)
    delta = checked.duration_s - before.previous_best_s if before.previous_best_s is not None else None
    return RunImpactOut(kind=kind, previous_best_s=before.previous_best_s, delta_s=delta,
                        tier_before=before.tier, tier_after=tier_after,
                        tier_up=run_rules.tier_rises(before.tier, tier_after))


# ----- Views --------------------------------------------------------------------------------------------------

def _origin(source: str, event_id: int | None, event_name: str | None) -> RunOriginOut:
    label = event_name if source == 'prova' and event_name else run_rules.TREINO_LABEL
    return RunOriginOut(source=source, label=label, event_id=event_id)


def _run_out(run: Run, event_id: int | None, event_name: str | None, start_day: date) -> RunOut:
    return RunOut(
        id=run.id, distance_m=run.distance_m, standard_distance_km=run.standard_distance_km,
        duration_s=run.duration_s, pace_s_per_km=run_rules.pace_s_per_km(run.distance_m, run.duration_s),
        date=run.ran_on, origin=_origin(run.source, event_id, event_name),
        counts_for_ranking=run.standard_distance_km is not None and run.ran_on >= start_day,
        created_at=run.created_at)


def _with_event(statement):
    """Adds the race of an Arena race mark: (Run, event id, event name)."""
    return (statement.add_columns(Event.id, Event.name)
            .outerjoin(EventEntry, EventEntry.id == Run.event_entry_id)
            .outerjoin(Event, Event.id == EventEntry.event_id))


def _cards(db: Session, user: User, now: datetime, kms: Sequence[int]) -> list[RunBestOut]:
    """The "Suas marcas" cards of the given distances: best time, series and tier of the 52 weeks. Best and series
    come from the marks; tier and position from the ranking as materialized (they follow a mark at once and a
    mark leaving the window with the daily sweep)."""
    today, start_day = _window(now)
    rows = db.execute(_with_event(select(Run)).where(
        Run.user_id == user.id, Run.standard_distance_km.in_(list(kms)), Run.ran_on >= start_day,
        Run.ran_on <= today).order_by(Run.ran_on, Run.id)).all()
    marks: dict[int, list] = defaultdict(list)
    for run, event_id, event_name in rows:
        marks[run.standard_distance_km].append((run, event_id, event_name))
    stored = {row.distance_km: row for row in db.scalars(select(Standing).where(
        Standing.user_id == user.id, Standing.sport == 'corrida', Standing.distance_km.in_(list(kms))))}
    cuts = load_cuts(db, CURRENT_CALC_VERSION)
    cards = []
    for km in kms:
        mine = marks.get(km, [])
        line = standing_line(stored.get(km) if mine else None,
                             required_matches(cuts, ranking_key('corrida', distance_km=km), 'corrida'), running=True)
        best = None
        if mine:
            run, event_id, event_name = min(mine, key=lambda item: (item[0].duration_s, item[0].ran_on, item[0].id))
            best = RunBestMarkOut(
                id=run.id, distance_m=run.distance_m, duration_s=run.duration_s,
                pace_s_per_km=run_rules.pace_s_per_km(run.distance_m, run.duration_s), date=run.ran_on,
                origin=_origin(run.source, event_id, event_name))
        cards.append(RunBestOut(
            distance_km=km, state=line['state'], tier=line['tier'], rank_position=line['rank_position'], best=best,
            marks=len(mine), series=[RunSeriesPointOut(id=run.id, date=run.ran_on, duration_s=run.duration_s)
                                     for run, _, _ in mine[-SERIES_MAX:]]))
    return cards


# ----- Operations ---------------------------------------------------------------------------------------------

def preview_run(db: Session, user: User, data: RunInput, *, now: datetime) -> RunPreviewOut:
    """What saving the mark would do ("Novo melhor tempo · −0:24", "Sobe para Ouro"). Writes and locks nothing; the
    tier is an estimate and every rule of the registration applies, so the athlete sees the errors before saving."""
    checked = check_run(db, user, data, now, lock=False)
    today, start_day = _window(now)
    before = _before(db, user.id, checked, start_day, today)
    after = None
    if checked.standard is not None:
        kind = run_rules.run_kind(checked.standard, before.previous_best_s, checked.duration_s)
        if kind in (run_rules.KIND_FIRST, run_rules.KIND_BEST):
            cuts = load_cuts(db, CURRENT_CALC_VERSION)[ranking_key('corrida', distance_km=checked.standard)]
            after = _estimated_tier(db, user.id, checked.standard, checked.duration_s, cuts, start_day, today)
        else:
            after = before.tier
    return RunPreviewOut(
        distance_m=checked.distance_m, duration_s=checked.duration_s,
        pace_s_per_km=run_rules.pace_s_per_km(checked.distance_m, checked.duration_s), date=checked.day,
        standard_distance_km=checked.standard,
        origin=_origin(checked.source, checked.event.id if checked.event else None,
                       checked.event.name if checked.event else None),
        impact=_impact(checked, before, after))


def create_run(db: Session, user: User, data: RunInput, *, now: datetime) -> RunCreatedOut:
    """Registers a mark and recalculates the ranking of its distance in the same transaction (commits once)."""
    checked = check_run(db, user, data, now, lock=True)
    today, start_day = _window(now)
    before = _before(db, user.id, checked, start_day, today)
    run = Run(user_id=user.id, distance_m=checked.distance_m, duration_s=checked.duration_s, ran_on=checked.day,
              source=checked.source, event_entry_id=checked.entry.id if checked.entry else None,
              standard_distance_km=checked.standard, verified=False, created_at=now)
    db.add(run)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise TransitionError(ALREADY_REGISTERED) from None
    impact_kind = run_rules.run_kind(checked.standard, before.previous_best_s, checked.duration_s)
    audit.record(db, actor_id=user.id, action='corrida.registrada', target_type='run', target_id=run.id, data={
        'distance_m': run.distance_m, 'duration_s': run.duration_s, 'date': run.ran_on.isoformat(),
        'source': run.source, 'standard_distance_km': run.standard_distance_km, 'entry_id': run.event_entry_id,
        'kind': impact_kind})
    tier_after = None
    if checked.standard is not None:
        recalculate_rankings(db, [RankingKey.run(checked.standard)], now=now)
        tier_after = _stored_tier(db, user.id, checked.standard)
    db.commit()
    event = checked.event
    card = _cards(db, user, now, [checked.standard])[0] if checked.standard is not None else None
    return RunCreatedOut(run=_run_out(run, event.id if event else None, event.name if event else None, start_day),
                         impact=_impact(checked, before, tier_after), best=card)


def delete_run(db: Session, user: User, run_id: int, *, now: datetime) -> None:
    """Removes the athlete's own mark (a typo must not stay in the ranking for a year) and recalculates its distance;
    an Arena race mark can be registered again afterwards."""
    run = db.scalar(select(Run).where(Run.id == run_id, Run.user_id == user.id).with_for_update())
    if run is None:
        raise HTTPException(404, RUN_NOT_FOUND)
    km = run.standard_distance_km
    audit.record(db, actor_id=user.id, action='corrida.removida', target_type='run', target_id=run.id, data={
        'distance_m': run.distance_m, 'duration_s': run.duration_s, 'date': run.ran_on.isoformat(),
        'source': run.source, 'standard_distance_km': km, 'entry_id': run.event_entry_id})
    db.delete(run)
    db.flush()
    if km is not None:
        recalculate_rankings(db, [RankingKey.run(km)], now=now)
    db.commit()


def run_bests(db: Session, user: User, *, now: datetime) -> RunBestsOut:
    return RunBestsOut(items=_cards(db, user, now, RUN_DISTANCES_KM))


def _decode_cursor(cursor: str | None) -> tuple[date, int] | None:
    if not cursor:
        return None
    try:
        stamp, run_id = base64.urlsafe_b64decode(cursor + '=' * (-len(cursor) % 4)).decode().rsplit('|', 1)
        return date.fromisoformat(stamp), int(run_id)
    except (ValueError, binascii.Error, UnicodeDecodeError):
        raise HTTPException(422, CURSOR_INVALID) from None


def _encode_cursor(run: Run) -> str:
    return base64.urlsafe_b64encode(f'{run.ran_on.isoformat()}|{run.id}'.encode()).decode().rstrip('=')


def list_runs(db: Session, user: User, *, distance: str | None, cursor: str | None, limit: int = PAGE_DEFAULT,
              now: datetime) -> RunPageOut:
    """The athlete's history, newest day first, every distance included (a 7 km run lives only here). `distance`
    filters by standard distance ('3' … '42') or 'outra' for the marks outside every band."""
    statement = _with_event(select(Run)).where(Run.user_id == user.id)
    if distance == 'outra':
        statement = statement.where(Run.standard_distance_km.is_(None))
    elif distance is not None:
        statement = statement.where(Run.standard_distance_km == int(distance))
    point = _decode_cursor(cursor)
    if point is not None:
        statement = statement.where(tuple_(Run.ran_on, Run.id) < tuple_(*point))
    rows = db.execute(statement.order_by(Run.ran_on.desc(), Run.id.desc()).limit(limit + 1)).all()
    more = len(rows) > limit
    rows = rows[:limit]
    _, start_day = _window(now)
    return RunPageOut(items=[_run_out(run, event_id, event_name, start_day) for run, event_id, event_name in rows],
                      next_cursor=_encode_cursor(rows[-1][0]) if more else None)


def eligible_races(db: Session, user: User, *, now: datetime) -> RunRacesOut:
    """Races the athlete can register a mark for: confirmed entry in a running race that already started, inside
    the window and still without a mark. Newest first."""
    _, start_day = _window(now)
    oldest = datetime.combine(start_day, time.min, tzinfo=run_rules.BRASILIA)
    rows = db.execute(
        select(EventEntry.id, Event).join(Event, Event.id == EventEntry.event_id)
        .where(EventEntry.user_id == user.id, EventEntry.state == 'confirmada', Event.sport == 'corrida',
               Event.state.in_(RACE_STATES), Event.starts_at <= now, Event.starts_at >= oldest,
               ~exists().where(Run.event_entry_id == EventEntry.id))
        .order_by(Event.starts_at.desc(), EventEntry.id.desc()).limit(RACES_MAX)).all()
    return RunRacesOut(items=[RunRaceOut(entry_id=entry_id, event_id=event.id, event_name=event.name,
                                         distance_km=event.distance_km, starts_at=event.starts_at,
                                         date=run_rules.local_date(event.starts_at)) for entry_id, event in rows])


__all__ = ['Checked', 'check_run', 'create_run', 'delete_run', 'eligible_races', 'list_runs', 'preview_run',
           'run_bests']

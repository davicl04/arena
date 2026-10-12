"""Helpers of the running tests: athletes with a session, a fixed clock for the running routes, races already run
with confirmed entries, and marks written straight to the database."""
from datetime import date, timedelta

from app.models.events import EventEntry
from app.models.runs import Run
from app.services.run_rules import local_date
from tests.integration.entry_helpers import race_event
from tests.integration.match_helpers import NOW, add, make_user
from tests.integration.result_helpers import DAY, HOUR, login

TODAY = local_date(NOW)           # 2026-10-12
WINDOW_START = TODAY - timedelta(weeks=52)


def minutes(text: str) -> int:
    """'mm:ss' or 'h:mm:ss' as seconds."""
    total = 0
    for part in text.split(':'):
        total = total * 60 + int(part)
    return total


def use_clock(monkeypatch, moment=NOW):
    """Fixes the moment the running routes use; returns a dict whose 'now' the test may move."""
    clock = {'now': moment}
    monkeypatch.setattr('app.routers.runs.utcnow', lambda: clock['now'])
    return clock


def runner(db, label='corredor'):
    user = make_user(db, label)
    return user, login(db, user)


def body(distance_m=5000, duration_s=1500, source='treino', **extra):
    return {'distance_m': distance_m, 'duration_s': duration_s, 'source': source, **extra}


def log_run(http, headers, distance_m=5000, duration='25:00', **extra):
    """POST /me/runs with the time as 'mm:ss'; returns the response."""
    return http.post('/api/v1/me/runs', json=body(distance_m, minutes(duration), **extra), headers=headers)


def logged(http, headers, distance_m=5000, duration='25:00', **extra):
    response = log_run(http, headers, distance_m, duration, **extra)
    assert response.status_code == 201, response.text
    return response.json()


def race(db, owner, *, distance_km=10, starts_at=NOW - 3 * HOUR, free=True, **values):
    """A running race that already started (the athlete may register a mark)."""
    values.setdefault('price_cents', 0 if free else 6000)
    return race_event(db, owner.id, distance_km=distance_km, starts_at=starts_at,
                      registration_closes_at=starts_at - 2 * DAY, **values)


def enter(db, event, user, *, state='confirmada'):
    """The athlete's entry in the race: confirmed (free) or a paid reservation."""
    paid = state != 'confirmada'
    return add(db, EventEntry(
        event_id=event.id, user_id=user.id, registered_by_id=user.id, state=state, price_cents=6000 if paid else 0,
        reserved_until=NOW + DAY if paid else None, confirmed_at=None if paid else NOW - 2 * DAY,
        created_at=NOW - 2 * DAY))


def mark(db, user, *, duration_s=1500, distance_m=5000, ran_on: date = TODAY, standard=5, source='treino'):
    """A mark written straight to the database (the route would refuse dates outside the window)."""
    return add(db, Run(user_id=user.id, distance_m=distance_m, duration_s=duration_s, ran_on=ran_on, source=source,
                       standard_distance_km=standard, verified=False, created_at=NOW))

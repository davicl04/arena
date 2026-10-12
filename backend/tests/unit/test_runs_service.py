"""The running service over a simulated session (no database): the rules of a mark that need the entry and the event,
the registration and removal with their audit and the ranking of the distance, the preview, the history and the races
the athlete can still register. The SQL and the locks are checked on PostgreSQL (`tests/integration/test_runs_*.py`)."""
import base64
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.models.audit import AuditLog
from app.models.events import Event, EventEntry
from app.models.runs import Run
from app.schemas.runs import RunBestOut, RunInput
from app.services import runs
from app.services.match_rules import RuleError, TransitionError
from app.services.standings import RankingKey
from tests.unit.fakes import FakeDb

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
TODAY = date(2026, 10, 12)
ATHLETE = SimpleNamespace(id=7, name='Ana')


def treino(distance_m=5000, duration_s=1500, **values):
    return RunInput(distance_m=distance_m, duration_s=duration_s, source='treino', **values)


def prova(entry_id=11, distance_m=10000, duration_s=3000, **values):
    return RunInput(distance_m=distance_m, duration_s=duration_s, source='prova', entry_id=entry_id, **values)


def race(**values):
    base = dict(id=3, name='Corrida do Lago', sport='corrida', distance_km=10, state='publicado',
                starts_at=NOW - timedelta(hours=3))
    return Event(**{**base, **values})


def entry(**values):
    return EventEntry(**{**dict(id=11, event_id=3, user_id=7, state='confirmada'), **values})


def mark(run_id=1, **values):
    base = dict(id=run_id, user_id=7, distance_m=5000, duration_s=1500, ran_on=TODAY, source='treino',
                standard_distance_km=5, event_entry_id=None, verified=False, created_at=NOW)
    return Run(**{**base, **values})


# ----- Rules of a mark ------------------------------------------------------------------------------------------

def test_a_training_mark_has_no_race_and_defaults_to_today():
    checked = runs.check_run(FakeDb(), ATHLETE, treino(), NOW, lock=False)
    assert (checked.day, checked.standard, checked.entry, checked.event) == (TODAY, 5, None, None)
    assert runs.check_run(FakeDb(), ATHLETE, treino(7000, 2400), NOW, lock=False).standard is None
    with pytest.raises(RuleError) as refused:
        runs.check_run(FakeDb(), ATHLETE, treino(entry_id=11), NOW, lock=False)
    assert refused.value.field == 'entry_id'
    with pytest.raises(RuleError) as future:
        runs.check_run(FakeDb(), ATHLETE, treino(date=TODAY + timedelta(days=1)), NOW, lock=False)
    assert future.value.field == 'date'


def test_a_race_mark_needs_the_race_entry(monkeypatch):
    with pytest.raises(RuleError) as missing:
        runs.check_run(FakeDb(), ATHLETE, RunInput(distance_m=10000, duration_s=3000, source='prova'), NOW, lock=False)
    assert missing.value.field == 'entry_id'
    locks = []
    monkeypatch.setattr(runs, 'load_entry_for', lambda _db, entry_id, who, *, for_update: (
        locks.append(for_update) or (entry(id=entry_id), race(), 'atleta')))
    db = FakeDb().on('runs', False)
    checked = runs.check_run(db, ATHLETE, prova(), NOW, lock=True)
    assert locks == [True] and (checked.day, checked.standard, checked.entry.id, checked.event.id) == (TODAY, 10, 11, 3)
    runs.check_run(db, ATHLETE, prova(), NOW, lock=False)
    assert locks == [True, False]                    # the preview reads without locking
    monkeypatch.setattr(runs, 'load_entry_for', lambda _db, entry_id, who, *, for_update: (
        entry(user_id=99), race(), 'organizador'))
    with pytest.raises(HTTPException) as stranger:
        runs.check_run(db, ATHLETE, prova(), NOW, lock=False)
    assert stranger.value.status_code == 404         # not even the organizer registers the athlete's mark


@pytest.mark.parametrize('values, error, field', [
    (dict(event=dict(sport='tenis')), RuleError, 'entry_id'),
    (dict(entry=dict(state='em_analise')), TransitionError, None),
    (dict(event=dict(state='cancelado')), TransitionError, None),
    (dict(event=dict(starts_at=NOW + timedelta(hours=1))), TransitionError, None),
    (dict(data=dict(date=TODAY - timedelta(days=1))), RuleError, 'date'),
    (dict(data=dict(distance_m=5000)), RuleError, 'distance_m'),
])
def test_the_rules_of_the_race_mark(monkeypatch, values, error, field):
    monkeypatch.setattr(runs, 'load_entry_for', lambda _db, entry_id, who, *, for_update: (
        entry(**values.get('entry', {})), race(**values.get('event', {})), 'atleta'))
    with pytest.raises(error) as refused:
        runs.check_run(FakeDb().on('runs', False), ATHLETE, prova(**values.get('data', {})), NOW, lock=False)
    assert getattr(refused.value, 'field', None) == field


def test_a_race_gives_a_single_mark(monkeypatch):
    monkeypatch.setattr(runs, 'load_entry_for', lambda _db, entry_id, who, *, for_update: (
        entry(), race(), 'atleta'))
    with pytest.raises(TransitionError, match='já registrou'):
        runs.check_run(FakeDb().on('runs', True), ATHLETE, prova(), NOW, lock=True)


# ----- Registering and removing ----------------------------------------------------------------------------------

class RegisterDb(FakeDb):
    """A session whose flush refuses the second mark of a race entry (the unique index of `runs.event_entry_id`)."""
    refuse = False

    def flush(self):
        if self.refuse:
            raise IntegrityError('insert', {}, Exception('uq_runs_event_entry'))
        super().flush()


@pytest.fixture
def register(monkeypatch):
    state = SimpleNamespace(db=RegisterDb(), recalculated=[])
    state.db.on('runs', None).on('standings', 'ouro')
    monkeypatch.setattr(runs, 'recalculate_rankings', lambda _db, keys, *, now: state.recalculated.append(list(keys)))
    monkeypatch.setattr(runs, '_cards', lambda _db, who, now, kms: [RunBestOut(
        distance_km=kms[0], state='ranqueado', tier='ouro', rank_position=1, best=None, marks=1, series=[])])
    return state


def test_a_first_mark_recalculates_its_distance_and_reports_the_tier(register):
    created = runs.create_run(register.db, ATHLETE, treino(), now=NOW)
    assert register.recalculated == [[RankingKey.run(5)]] and register.db.commits == 1
    assert (created.run.standard_distance_km, created.run.counts_for_ranking, created.run.origin.label) == (
        5, True, 'Treino')
    assert (created.impact.kind, created.impact.tier_before, created.impact.tier_after) == (
        'primeira_marca', None, 'ouro')
    assert created.best.distance_km == 5
    [audited] = register.db.of(AuditLog)
    assert audited.action == 'corrida.registrada' and audited.data['standard_distance_km'] == 5
    assert register.db.of(Run)[0].verified is False                    # self-declared (RN17)


def test_a_mark_outside_every_band_stays_in_the_history_and_touches_no_ranking(register):
    created = runs.create_run(register.db, ATHLETE, treino(7000, 2400), now=NOW)
    assert register.recalculated == [] and created.best is None
    assert (created.impact.kind, created.impact.tier_after, created.run.counts_for_ranking) == (
        'fora_do_ranking', None, False)


def test_a_race_mark_names_the_race_and_the_entry(register, monkeypatch):
    monkeypatch.setattr(runs, 'load_entry_for', lambda _db, entry_id, who, *, for_update: (
        entry(), race(), 'atleta'))
    register.db.on('runs', None)
    created = runs.create_run(register.db, ATHLETE, prova(), now=NOW)
    assert (created.run.origin.label, created.run.origin.event_id, created.run.date) == ('Corrida do Lago', 3, TODAY)
    assert register.db.of(Run)[0].event_entry_id == 11 and register.recalculated == [[RankingKey.run(10)]]


def test_a_second_tap_loses_the_race_for_the_unique_index(register):
    register.db.refuse = True
    with pytest.raises(TransitionError, match='já registrou'):
        runs.create_run(register.db, ATHLETE, treino(), now=NOW)
    assert register.db.rollbacks == 1 and register.recalculated == [] and register.db.commits == 0


def test_removing_a_mark_recalculates_its_distance(register):
    register.db.on('runs', mark(4))
    runs.delete_run(register.db, ATHLETE, 4, now=NOW)
    assert register.db.deleted[0].id == 4 and register.recalculated == [[RankingKey.run(5)]]
    assert [item.action for item in register.db.of(AuditLog)] == ['corrida.removida'] and register.db.commits == 1
    register.recalculated.clear()
    register.db.on('runs', mark(5, distance_m=7000, standard_distance_km=None))
    runs.delete_run(register.db, ATHLETE, 5, now=NOW)
    assert register.recalculated == []                                  # it was in no ranking
    register.db.on('runs', None)
    with pytest.raises(HTTPException) as unknown:
        runs.delete_run(register.db, ATHLETE, 6, now=NOW)
    assert unknown.value.status_code == 404                             # someone else's mark is not found either


# ----- Preview ---------------------------------------------------------------------------------------------------

@pytest.fixture
def preview(monkeypatch):
    state = SimpleNamespace(db=FakeDb())
    cuts = {'corrida_5': SimpleNamespace(placement_matches=1)}
    monkeypatch.setattr(runs, 'load_cuts', lambda _db, version: cuts)
    monkeypatch.setattr(runs, '_estimated_tier', lambda *args, **kwargs: 'ouro')
    return state


def test_the_preview_estimates_the_tier_of_a_first_mark_and_of_a_new_best(preview):
    preview.db.on('runs', None)
    first = runs.preview_run(preview.db, ATHLETE, treino(), now=NOW)
    assert (first.impact.kind, first.impact.tier_before, first.impact.tier_after) == ('primeira_marca', None, 'ouro')
    assert first.pace_s_per_km == 300 and first.origin.label == 'Treino' and first.standard_distance_km == 5
    preview.db.on('runs', 1600).on('standings', 'prata')
    better = runs.preview_run(preview.db, ATHLETE, treino(), now=NOW)
    assert (better.impact.kind, better.impact.delta_s, better.impact.tier_before, better.impact.tier_after,
            better.impact.tier_up) == ('novo_melhor', -100, 'prata', 'ouro', True)


def test_the_preview_keeps_the_tier_of_a_slower_mark_and_ignores_an_out_of_band_one(preview):
    preview.db.on('runs', 1400).on('standings', 'prata')
    slower = runs.preview_run(preview.db, ATHLETE, treino(), now=NOW)
    assert (slower.impact.kind, slower.impact.tier_after, slower.impact.tier_up) == ('sem_melhora', 'prata', False)
    outside = runs.preview_run(preview.db, ATHLETE, treino(7000, 2400), now=NOW)
    assert (outside.impact.kind, outside.impact.tier_after, outside.standard_distance_km) == (
        'fora_do_ranking', None, None)


# ----- History, races and cursor ---------------------------------------------------------------------------------

def test_the_history_is_paged_by_day_and_id():
    rows = [(mark(3, ran_on=TODAY), None, None), (mark(2, ran_on=TODAY - timedelta(days=1), source='prova'), 3, 'Corrida do Lago'),
            (mark(1, ran_on=TODAY - timedelta(days=2), standard_distance_km=None, distance_m=7000), None, None)]
    db = FakeDb().on('runs', rows)
    page = runs.list_runs(db, ATHLETE, distance=None, cursor=None, limit=2, now=NOW)
    assert [item.id for item in page.items] == [3, 2] and page.items[1].origin.label == 'Corrida do Lago'
    assert page.next_cursor == runs._encode_cursor(rows[1][0])
    db.on('runs', rows[2:])
    last = runs.list_runs(db, ATHLETE, distance='outra', cursor=page.next_cursor, limit=2, now=NOW)
    assert [item.counts_for_ranking for item in last.items] == [False] and last.next_cursor is None
    assert runs.list_runs(db, ATHLETE, distance='5', cursor=None, limit=2, now=NOW).next_cursor is None


def test_a_cursor_that_is_not_ours_is_refused():
    cursor = runs._encode_cursor(mark(9, ran_on=date(2026, 5, 1)))
    assert runs._decode_cursor(cursor) == (date(2026, 5, 1), 9) and runs._decode_cursor(None) is None
    for broken in ('???', 'YWJj', *(base64.urlsafe_b64encode(raw).decode() for raw in (b'x|1', b'2026-05-01|x'))):
        with pytest.raises(HTTPException) as refused:
            runs._decode_cursor(broken)
        assert refused.value.status_code == 422


def test_the_races_still_without_a_mark_come_with_their_day():
    db = FakeDb().on('event_entries', [(11, race(starts_at=datetime(2026, 10, 12, 1, 0, tzinfo=timezone.utc)))])
    [item] = runs.eligible_races(db, ATHLETE, now=NOW).items
    assert (item.entry_id, item.event_id, item.event_name, item.distance_km) == (11, 3, 'Corrida do Lago', 10)
    assert item.date == date(2026, 10, 11)                              # 01:00 UTC is still the previous day in Brasília

"""What happens around a championship match, over a simulated session (no database): the lock on the match a score
feeds, the winner that goes through the bracket, the end of the event with its placements and the tennis bonus, and
the matches cancelled with the event. The SQL and the locks are checked on PostgreSQL
(`tests/integration/test_championship_*.py`)."""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy.dialects import postgresql

from app.models.audit import AuditLog
from app.models.brackets import EventBracket, EventPlacement
from app.models.events import Event, EventEntry
from app.models.matches import Match, MatchMessage, MatchSide
from app.models.notifications import Notification
from app.services import championship_lifecycle as lifecycle
from tests.unit.fakes import FakeDb

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
ORGANIZER = 99


class SpyDb(FakeDb):
    """A FakeDb that also keeps the SQL text of every read, to check the lock clause."""

    def __init__(self):
        super().__init__()
        self.sql = []

    def _answer(self, statement):
        self.sql.append(str(statement.compile(dialect=postgresql.dialect())))
        return super()._answer(statement)


def event(**values):
    base = dict(id=1, organizer_user_id=ORGANIZER, name='Copa do Lago', sport='tenis',
                competition_type='eliminacao_simples', state='em_andamento')
    return Event(**{**base, **values})


def entry(entry_id, user_id):
    return EventEntry(id=entry_id, event_id=1, user_id=user_id, team_id=None, state='confirmada', price_cents=0)


def match(match_id, round_number, position, state='encerrada', score=None, winner=None, **values):
    score_a, score_b = score if score is not None else (None, None)
    return Match(id=match_id, sport='tenis', origin='campeonato', event_id=1, round_number=round_number,
                 bracket_position=position, state=state, score_a=score_a, score_b=score_b, winner_side=winner,
                 **values)


def side(match_id, label, user_id=None, team_id=None):
    return MatchSide(id=match_id * 10 + ord(label), match_id=match_id, side=label, user_id=user_id, team_id=team_id)


# ----- The match a score feeds is locked before the rankings -----------------------------------------------------

def test_only_a_championship_match_that_feeds_another_is_locked_ahead():
    db = SpyDb().on('matches', 7)
    lifecycle.lock_following(db, Match(id=1, origin='amistoso', next_match_id=None))
    lifecycle.lock_following(db, Match(id=2, origin='amistoso', next_match_id=7))       # a friendly has no bracket
    lifecycle.lock_following(db, Match(id=3, origin='campeonato', next_match_id=None))  # the final feeds nothing
    assert db.sql == []
    lifecycle.lock_following(db, Match(id=4, origin='campeonato', next_match_id=7))
    assert len(db.sql) == 1 and 'FROM matches' in db.sql[0] and db.sql[0].rstrip().endswith('FOR UPDATE')


def test_a_knockout_is_a_championship_match_of_a_single_elimination_event():
    db = FakeDb().on('events', 'eliminacao_simples')
    assert lifecycle.is_knockout(db, Match(id=1, origin='campeonato', event_id=1)) is True
    assert lifecycle.is_knockout(db, Match(id=2, origin='amistoso', event_id=None)) is False
    assert lifecycle.is_knockout(FakeDb().on('events', 'todos_contra_todos'),
                                 Match(id=3, origin='campeonato', event_id=1)) is False


def test_only_events_that_can_have_a_bracket_have_a_championship():
    assert lifecycle.has_championship(event()) is True
    assert lifecycle.has_championship(event(state='rascunho')) is False
    assert lifecycle.has_championship(event(sport='corrida', competition_type=None)) is False
    assert lifecycle.has_championship(event(competition_type=None)) is False


def test_a_divergence_asks_the_organizer_to_decide():
    db = FakeDb().put(Event, event())
    lifecycle.on_divergence(db, Match(id=5, event_id=1, result_deadline=NOW), now=NOW)
    [told] = db.of(Notification)
    assert (told.user_id, told.type, told.payload['match_id'], told.payload['event_name']) == (
        ORGANIZER, 'divergencia_para_decidir', 5, 'Copa do Lago')


# ----- The winner goes through the bracket -----------------------------------------------------------------------

@pytest.fixture
def advance(monkeypatch):
    """`advance_winner` over a final that already has one side; `load_sides` answers from `state.sides`."""
    state = SimpleNamespace(sides={}, db=FakeDb())
    monkeypatch.setattr(lifecycle, 'load_sides', lambda _db, ids: {ids[0]: state.sides})
    monkeypatch.setattr(lifecycle, 'side_names', lambda _db, sides: {label: f'Atleta {row.user_id}'
                                                                      for label, row in sides.items()})
    monkeypatch.setattr(lifecycle, 'audience', lambda _db, match, *, sides, include_guests=False: [
        row.user_id for row in sides.values()])
    return state


def feeder(**values):
    return match(1, 1, 1, state='realizada', winner='a', next_match_id=3, next_match_side='b', **values)


def test_a_match_without_winner_or_next_match_advances_nobody(advance):
    assert lifecycle.advance_winner(advance.db, event(), match(1, 2, 1, winner='a'), now=NOW) is False
    assert lifecycle.advance_winner(advance.db, event(), Match(id=1, next_match_id=3, winner_side=None),
                                    now=NOW) is False
    advance.db.on('match_sides', None).on('matches', None)       # the winner side or the next match is gone
    assert lifecycle.advance_winner(advance.db, event(), feeder(), now=NOW) is False


def test_the_winner_never_enters_a_match_that_was_already_arranged_or_taken(advance):
    db = advance.db
    db.on('match_sides', side(1, 'a', user_id=11))
    db.on('matches', match(3, 2, 1, state='agendada'))
    assert lifecycle.advance_winner(db, event(), feeder(), now=NOW) is False        # not 'combinando' anymore
    db.on('matches', match(3, 2, 1, state='combinando'))
    advance.sides = {'b': side(3, 'b', user_id=14)}
    assert lifecycle.advance_winner(db, event(), feeder(), now=NOW) is False        # the place is taken
    assert db.of(MatchSide) == []


def test_the_first_winner_waits_and_the_second_closes_the_pairing(advance):
    db = advance.db
    db.on('match_sides', side(1, 'a', user_id=11))
    db.on('matches', match(3, 2, 1, state='combinando'))
    advance.sides = {}
    assert lifecycle.advance_winner(db, event(), feeder(), now=NOW) is True
    [seat] = db.of(MatchSide)
    assert (seat.match_id, seat.side, seat.user_id) == (3, 'b', 11)
    [audited] = db.of(AuditLog)
    assert audited.action == 'chaveamento.avancou' and audited.data['from_match_id'] == 1
    assert db.of(MatchMessage) == [] and db.of(Notification) == []                  # only one side is known

    advance.sides = {'a': side(3, 'a', user_id=13)}
    assert lifecycle.advance_winner(db, event(), feeder(), now=NOW) is True
    [banner] = db.of(MatchMessage)
    assert 'adversários definidos' in banner.body and banner.match_id == 3
    told = db.of(Notification)
    assert sorted((item.user_id, item.payload['opponent_name']) for item in told) == [
        (11, 'Atleta 13'), (13, 'Atleta 11')] and {item.type for item in told} == {'adversario_definido'}


# ----- The end of the event --------------------------------------------------------------------------------------

@pytest.fixture
def finishing(monkeypatch):
    state = SimpleNamespace(db=FakeDb(), recalculated=[], sides={})
    monkeypatch.setattr(lifecycle, 'load_sides', lambda _db, ids: state.sides)
    monkeypatch.setattr(lifecycle, 'entry_recipients', lambda _db, entries, *, scope: {
        row.id: [row.user_id] for row in entries})
    monkeypatch.setattr(lifecycle, 'recalculate_rankings', lambda _db, keys, *, now: state.recalculated.append(
        [key.label for key in keys]))
    state.db.on('users', 'Ana')
    return state


def semifinals(state):
    """Four athletes: entries 1..4 (users 11..14); 1 beats 2, 4 beats 3, and 1 beats 4 in the final."""
    state.db.on('event_entries', [entry(number, 10 + number) for number in range(1, 5)])
    games = [match(1, 1, 1, score=(2, 0), winner='a'), match(2, 1, 2, score=(0, 2), winner='b'),
             match(3, 2, 1, score=(2, 1), winner='a')]
    state.db.on('matches', games)
    state.sides = {1: {'a': side(1, 'a', 11), 'b': side(1, 'b', 12)}, 2: {'a': side(2, 'a', 13), 'b': side(2, 'b', 14)},
                   3: {'a': side(3, 'a', 11), 'b': side(3, 'b', 14)}}
    return games


def test_a_tennis_championship_with_four_entries_gives_the_bonus_and_recalculates_the_ranking(finishing):
    db, tournament = finishing.db, event()
    semifinals(finishing)
    assert lifecycle.finish_event(db, tournament, now=NOW) is True
    placed = {row.entry_id: (row.placement, row.bonus_points, row.user_id) for row in db.of(EventPlacement)}
    assert placed == {1: (1, 40, 11), 4: (2, 20, 14), 2: (3, 10, 12), 3: (3, 10, 13)}
    assert tournament.state == 'encerrado' and tournament.updated_at == NOW
    assert finishing.recalculated == [['tenis']]
    [ended] = [item for item in db.of(AuditLog) if item.action == 'evento.encerrado']
    assert ended.data['tennis_bonus'] is True and ended.data['champion_entry_id'] == 1
    told = db.of(Notification)
    assert {item.type for item in told} == {'evento_encerrado'} and told[0].payload['champion'] == 'Ana'
    assert {item.user_id for item in told} == {ORGANIZER, 11, 12, 13, 14}


def test_a_tennis_championship_with_fewer_than_four_entries_gives_placements_without_bonus(finishing):
    db = finishing.db
    db.on('event_entries', [entry(1, 11), entry(2, 12)])
    db.on('matches', [match(1, 1, 1, score=(2, 0), winner='a')])
    finishing.sides = {1: {'a': side(1, 'a', 11), 'b': side(1, 'b', 12)}}
    assert lifecycle.finish_event(db, event(), now=NOW) is True
    assert {row.entry_id: (row.placement, row.bonus_points) for row in db.of(EventPlacement)} == {1: (1, 0), 2: (2, 0)}
    assert finishing.recalculated == []                  # no bonus, nothing to change in the ranking


def test_the_event_goes_on_while_a_match_is_open_or_the_final_has_no_winner(finishing):
    games = semifinals(finishing)
    games[2].state = 'agendada'
    assert lifecycle.finish_event(finishing.db, event(), now=NOW) is False
    games[2].state, games[2].winner_side = 'encerrada', None
    assert lifecycle.finish_event(finishing.db, event(), now=NOW) is False
    finishing.db.on('matches', [])
    assert lifecycle.finish_event(finishing.db, event(), now=NOW) is False
    assert finishing.db.of(EventPlacement) == []


def test_a_round_robin_ranks_by_the_table_and_a_football_event_has_no_bonus(finishing):
    db = finishing.db
    db.on('event_entries', [entry(number, 10 + number) for number in range(1, 4)])
    db.on('matches', [match(1, 1, 1, score=(2, 0), winner='a'), match(2, 2, 1, score=(1, 1)),
                      match(3, 3, 1, score=(0, 3), winner='b')])
    finishing.sides = {1: {'a': side(1, 'a', 11), 'b': side(1, 'b', 12)},
                       2: {'a': side(2, 'a', 11), 'b': side(2, 'b', 13)},
                       3: {'a': side(3, 'a', 12), 'b': side(3, 'b', 13)}}
    db.on('event_brackets', EventBracket(event_id=1, slots=[1, 2, 3]))
    assert lifecycle.finish_event(db, event(sport='futebol', competition_type='todos_contra_todos'), now=NOW) is True
    placed = {row.entry_id: (row.placement, row.bonus_points) for row in db.of(EventPlacement)}
    # Entries 1 and 3 have 4 points each; 3 wins the tie by goal difference (+3 against +2). Football: no bonus.
    assert placed == {3: (1, 0), 1: (2, 0), 2: (3, 0)}
    assert finishing.recalculated == []


def test_the_try_to_finish_gives_up_when_the_event_row_is_busy(finishing, monkeypatch):
    db = finishing.db
    db.on('events', None)                                    # SKIP LOCKED found nothing to lock
    assert lifecycle.try_finish(db, 1, now=NOW) is False
    tournament = event()
    db.on('events', tournament)
    monkeypatch.setattr(lifecycle, 'finish_event', lambda _db, row, *, now: row is tournament)
    assert lifecycle.try_finish(db, 1, now=NOW) is True


def test_after_a_score_the_winner_advances_only_in_a_knockout_and_the_end_is_always_tried(monkeypatch):
    calls = []
    monkeypatch.setattr(lifecycle, 'advance_winner', lambda _db, row, played, *, now: calls.append('advance'))
    monkeypatch.setattr(lifecycle, 'try_finish', lambda _db, event_id, *, now: calls.append(f'finish {event_id}'))
    db = FakeDb().put(Event, event(competition_type='eliminacao_simples'))
    lifecycle.after_score(db, Match(id=1, origin='amistoso', event_id=None), now=NOW)
    assert calls == []                                       # a friendly is none of its business
    lifecycle.after_score(db, Match(id=1, origin='campeonato', event_id=1), now=NOW)
    db.put(Event, event(competition_type='todos_contra_todos'))
    lifecycle.after_score(db, Match(id=2, origin='campeonato', event_id=1), now=NOW)
    assert calls == ['advance', 'finish 1', 'finish 1']


def test_the_sweep_ends_each_event_it_can_and_counts_them(monkeypatch):
    rows = [event(id=1), event(id=2), event(id=3)]
    db = FakeDb().on('events', rows)
    monkeypatch.setattr(lifecycle, 'finish_event', lambda _db, row, *, now: row.id != 2)
    assert lifecycle.finish_due_events(db, NOW) == 2


# ----- The cancelled event ---------------------------------------------------------------------------------------

def test_cancelling_the_event_cancels_the_matches_still_open():
    db = FakeDb().on('matches', [match(1, 1, 1, state='combinando'), match(2, 1, 2, state='agendada')])
    ids = lifecycle.cancel_event_matches(db, event(state='cancelado'), actor_id=ORGANIZER, now=NOW)
    assert ids == [1, 2]
    assert [row.state for row in db.tables['matches']] == ['cancelada', 'cancelada']
    assert {row.cancelled_by_id for row in db.tables['matches']} == {ORGANIZER}
    assert {row.cancel_reason for row in db.tables['matches']} == {'Evento cancelado.'}
    assert len(db.of(MatchMessage)) == 2 and {item.action for item in db.of(AuditLog)} == {'partida.cancelada'}

"""The organizer's side of a championship over a simulated session (no database): why the draw is refused, the draw and
the swap before the bracket is confirmed, the labels and stages of the list, and the body of the schedule conflict.
The SQL, the locks, the matches generated and the schedule are checked on PostgreSQL
(`tests/integration/test_championship_*.py`)."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.audit import AuditLog
from app.models.brackets import EventBracket
from app.models.events import Event, EventEntry
from app.models.matches import Match
from app.schemas.brackets import BracketSwapInput, ScheduleConflictOut
from app.services import championship
from app.services.match_rules import RuleError
from tests.unit.fakes import FakeDb

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
H = timedelta(hours=1)
OWNER = SimpleNamespace(id=99)


def event(**values):
    base = dict(id=1, organizer_user_id=99, name='Copa do Lago', sport='tenis', competition_type='eliminacao_simples',
                state='publicado', price_cents=0, revocation_decision=None, starts_at=NOW + 10 * 24 * H,
                registration_closes_at=NOW - H)
    return Event(**{**base, **values})


def entries(count):
    return [EventEntry(id=number, event_id=1, user_id=10 + number, state='confirmada') for number in range(1, count + 1)]


def match(match_id, round_number, position):
    return Match(id=match_id, round_number=round_number, bracket_position=position)


# ----- Why the organizer cannot draw ----------------------------------------------------------------------------

@pytest.mark.parametrize('values, count, message', [
    (dict(sport='corrida', competition_type=None), 4, 'Este evento não tem chaveamento.'),
    (dict(competition_type=None), 4, 'Este evento não tem chaveamento.'),
    (dict(state='em_andamento'), 4, championship.BRACKET_CONFIRMED),
    (dict(state='encerrado'), 4, 'Este evento não aceita mais sorteio.'),
    (dict(state='cancelado'), 4, 'Este evento não aceita mais sorteio.'),
    (dict(state='rascunho'), 4, 'Publique o evento antes de sortear.'),
    (dict(registration_closes_at=NOW + H), 4, 'As inscrições ainda estão abertas. Sorteie depois do fim das inscrições.'),
    (dict(), 1, 'Confirme pelo menos 2 inscrições para sortear o campeonato.'),
])
def test_the_draw_is_refused_until_the_registrations_are_over_and_two_entries_are_confirmed(values, count, message):
    db = FakeDb().on('event_entries', entries(count))
    assert championship.draw_blocker(db, event(**values), None, NOW) == message


def test_a_confirmed_bracket_is_never_drawn_again_and_a_ready_event_can_be_drawn():
    db = FakeDb().on('event_entries', entries(4))
    confirmed = EventBracket(event_id=1, state='confirmado')
    assert championship.draw_blocker(db, event(), confirmed, NOW) == championship.BRACKET_CONFIRMED
    assert championship.draw_blocker(db, event(), EventBracket(event_id=1, state='sorteado'), NOW) is None


# ----- Draw and swap ---------------------------------------------------------------------------------------------

@pytest.fixture
def drawing(monkeypatch):
    state = SimpleNamespace(db=FakeDb(), tournament=event())
    state.db.on('event_entries', entries(5)).on('event_brackets', None)
    monkeypatch.setattr(championship.events, 'load_owned_event', lambda _db, event_id, user, *, for_update: (
        state.tournament))
    monkeypatch.setattr(championship, 'bracket_view', lambda _db, user, tournament, *, now: 'view')
    return state


def test_drawing_stores_a_reproducible_seed_and_the_plan_with_byes(drawing):
    db = drawing.db
    assert championship.draw_bracket(db, OWNER, 1, now=NOW) == 'view'
    [bracket] = [row for row in db.added if isinstance(row, EventBracket)]
    assert (bracket.state, bracket.size, bracket.draw_count, bracket.drawn_by_id) == ('sorteado', 8, 1, 99)
    assert sorted(slot for slot in bracket.slots if slot is not None) == [1, 2, 3, 4, 5]
    assert bracket.slots.count(None) == 3 and bracket.swaps == [] and db.commits == 1
    [audited] = db.of(AuditLog)
    assert audited.action == 'chaveamento.sorteado' and audited.data['byes'] == 3 and audited.data['seed'] == bracket.seed
    again = championship.bracket_rules.draw_order([1, 2, 3, 4, 5], bracket.seed)       # the seed repeats the draw
    assert championship._plan(drawing.tournament, entries(5), bracket.seed)[1] == championship.bracket_rules.elimination_slots(
        again, 8)


def test_drawing_again_replaces_the_plan_and_counts_the_draws(drawing):
    existing = EventBracket(event_id=1, state='sorteado', seed=1, size=8, slots=[1, 2, 3, 4, 5, None, None, None],
                            swaps=[[0, 1]], draw_count=1)
    drawing.db.on('event_brackets', existing)
    championship.draw_bracket(drawing.db, OWNER, 1, now=NOW)
    assert existing.draw_count == 2 and existing.swaps == [] and existing.seed != 1
    assert [row for row in drawing.db.added if isinstance(row, EventBracket)] == []


def test_the_draw_is_refused_with_the_reason(drawing):
    drawing.tournament = event(registration_closes_at=NOW + H)
    with pytest.raises(HTTPException) as refused:
        championship.draw_bracket(drawing.db, OWNER, 1, now=NOW)
    assert refused.value.status_code == 409 and 'ainda estão abertas' in refused.value.detail
    assert drawing.db.commits == 0


def test_a_revoked_organizer_cannot_draw_while_the_administration_decides(drawing):
    drawing.tournament = event(revocation_decision='pendente')
    with pytest.raises(HTTPException) as refused:
        championship.draw_bracket(drawing.db, OWNER, 1, now=NOW)
    assert refused.value.status_code == 409 and drawing.db.commits == 0


def test_swapping_exchanges_two_places_before_the_confirmation(drawing):
    bracket = EventBracket(event_id=1, state='sorteado', size=4, slots=[1, 2, 3, 4], swaps=[])
    drawing.db.on('event_brackets', bracket)
    assert championship.swap_bracket(drawing.db, OWNER, 1, BracketSwapInput(a=0, b=3), now=NOW) == 'view'
    assert bracket.slots == [4, 2, 3, 1] and bracket.swaps == [[0, 3]] and bracket.updated_at == NOW
    [audited] = drawing.db.of(AuditLog)
    assert audited.action == 'chaveamento.trocado' and (audited.data['entry_a'], audited.data['entry_b']) == (4, 1)


def test_a_swap_that_leaves_a_game_without_teams_is_refused(drawing):
    bracket = EventBracket(event_id=1, state='sorteado', size=4, slots=[1, None, 2, None], swaps=[])
    drawing.db.on('event_brackets', bracket)
    with pytest.raises(RuleError, match='sem nenhum time'):
        championship.swap_bracket(drawing.db, OWNER, 1, BracketSwapInput(a=1, b=2), now=NOW)     # [1, 2, -, -]
    assert bracket.slots == [1, None, 2, None] and bracket.swaps == [] and drawing.db.commits == 0


def test_nothing_is_swapped_without_a_draw_or_after_the_confirmation(drawing):
    with pytest.raises(HTTPException) as nothing:
        championship.swap_bracket(drawing.db, OWNER, 1, BracketSwapInput(a=0, b=1), now=NOW)
    assert nothing.value.detail == championship.NO_BRACKET
    drawing.db.on('event_brackets', EventBracket(event_id=1, state='confirmado', slots=[1, 2]))
    with pytest.raises(HTTPException) as confirmed:
        championship.swap_bracket(drawing.db, OWNER, 1, BracketSwapInput(a=0, b=1), now=NOW)
    assert confirmed.value.detail == championship.BRACKET_CONFIRMED


# ----- The list and the conflict ---------------------------------------------------------------------------------

def test_matches_are_labelled_in_bracket_order_and_staged_by_the_competition():
    games = [match(10, 1, 1), match(11, 1, 2), match(12, 2, 1)]
    assert championship._labels(games) == {10: 'J1', 11: 'J2', 12: 'J3'}
    assert championship._round_count(event(), games) == 2 and championship._round_count(event(), []) == 0
    knockout, robin = event(), event(competition_type='todos_contra_todos')
    assert [championship._stage(knockout, game, 2) for game in games] == ['Semifinal', 'Semifinal', 'Final']
    assert championship._stage(robin, games[2], 2) == 'Rodada 2'


def test_the_list_shows_what_needs_a_date_first_then_the_schedule_then_the_finished():
    def row(state, starts_at=None, can_schedule=False, round_number=1, position=1):
        return SimpleNamespace(card=SimpleNamespace(state=state, starts_at=starts_at), can_schedule=can_schedule,
                               round_number=round_number, position=position)

    to_schedule, waiting = row('combinando', can_schedule=True), row('combinando', round_number=2)
    soon, later = row('agendada', NOW + H), row('agendada', NOW + 2 * H)
    old, recent = row('encerrada', NOW - 5 * H), row('realizada', NOW - H)
    ordered = sorted([recent, later, waiting, old, soon, to_schedule], key=championship._group)
    assert ordered == [to_schedule, waiting, soon, later, recent, old]


def test_the_conflict_answers_with_the_message_and_the_match_that_clashes():
    clash = ScheduleConflictOut(kind='quadra', match_id=7, label='J2', stage='Final', starts_at=NOW,
                                court_name='Quadra Central')
    body = championship.ScheduleConflict('A quadra já tem o J2.', clash).body()
    assert body == {'detail': 'A quadra já tem o J2.', 'conflict': {
        'kind': 'quadra', 'match_id': 7, 'label': 'J2', 'stage': 'Final', 'starts_at': '2026-10-12T15:00:00Z',
        'court_name': 'Quadra Central'}}

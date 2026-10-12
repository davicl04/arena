"""Regras puras que ligam o campeonato às telas: o "Agora" do organizador e as permissões da partida (fases 6 e 7)."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.schemas.events import championship_out
from app.services.event_rules import ChampionshipCounts, PendingCounts, next_action
from app.services.match_access import MatchAccess
from app.services.match_views import MatchFacts, needs_my_action, permissions_for

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
H = timedelta(hours=1)
ORGANIZER = MatchAccess('organizador', None)
REPRESENTATIVE = MatchAccess('representante', 'a')
ADMIN = MatchAccess('administracao', None)
NONE = PendingCounts()


def event(**values):
    base = dict(state='publicado', revocation_decision=None, review_reason_code=None, starts_at=NOW + 10 * 24 * H,
                registration_closes_at=NOW - H, price_cents=0)
    return SimpleNamespace(**{**base, **values})


def action(counts, **values):
    return next_action(event(**values), pending=NONE, checklist_done=True, now=NOW, championship=counts)


def test_after_the_registrations_the_organizer_draws_and_then_confirms():
    assert action(ChampionshipCounts(confirmed=6)).kind == 'sortear_chaveamento'
    assert action(ChampionshipCounts(confirmed=6)).count == 6
    assert action(ChampionshipCounts(bracket='sorteado', confirmed=6)).kind == 'confirmar_chaveamento'
    # One confirmed entry cannot be drawn: the event just waits.
    assert action(ChampionshipCounts(confirmed=1)).kind == 'aguardar_inicio'
    # While the registrations are open, they come first; without championship counts nothing changes.
    open_ = action(ChampionshipCounts(confirmed=6), registration_closes_at=NOW + 2 * H)
    assert open_.kind == 'acompanhar_inscricoes'
    assert action(None).kind == 'aguardar_inicio'
    # Receipts to analyse still come before the draw.
    pending = next_action(event(), pending=PendingCounts(receipts=2), checklist_done=True, now=NOW,
                          championship=ChampionshipCounts(confirmed=6))
    assert (pending.kind, pending.count) == ('analisar_comprovantes', 2)


def test_during_the_championship_decisions_come_before_scheduling():
    base = dict(bracket='confirmado', confirmed=4, matches_total=3)
    both = action(ChampionshipCounts(**base, to_decide=1, to_schedule=2, scheduled=1), state='em_andamento')
    assert (both.kind, both.count) == ('decidir_divergencias', 1)
    schedule = action(ChampionshipCounts(**base, to_schedule=2, waiting=1), state='em_andamento')
    assert (schedule.kind, schedule.count) == ('agendar_partidas', 2)
    following = action(ChampionshipCounts(**base, scheduled=2, waiting=1), state='em_andamento')
    assert (following.kind, following.count) == ('acompanhar_partidas', 2)
    assert action(ChampionshipCounts(**base, finished=3), state='em_andamento').kind == 'nenhuma'
    assert action(ChampionshipCounts(**base, finished=3), state='encerrado').kind == 'nenhuma'


def test_the_poster_counts_what_needs_attention():
    out = championship_out(ChampionshipCounts(bracket='confirmado', confirmed=4, matches_total=3, to_schedule=2,
                                              to_decide=1, scheduled=1, finished=0))
    assert out.attention == 3 and out.bracket == 'confirmado' and out.matches_total == 3


def match(**values):
    starts_at = values.pop('starts_at', NOW - H)
    base = dict(origin='campeonato', sport='futebol', state='agendada', starts_at=starts_at,
                result_deadline=None if starts_at is None else starts_at + 48 * H, booking_side=None,
                walkover_absent_side=None, walkover_contested_at=None, proposal_expires_at=None, score_a=None)
    return SimpleNamespace(**{**base, **values})


def facts(sides=2, **values):
    return MatchFacts(sides={'a': object(), 'b': object()} if sides == 2 else ({'a': object()} if sides else {}),
                      **values)


def report(a, b):
    return SimpleNamespace(score_a=a, score_b=b, sets=None)


def test_the_organizer_schedules_before_the_start_and_decides_after_it():
    waiting = match(state='combinando', starts_at=None)
    arranging = permissions_for(waiting, ORGANIZER, facts(), now=NOW)
    assert arranging.schedule_match and not arranging.decide_result
    assert arranging.read_chat and arranging.write_chat
    # A side still unknown cannot be scheduled.
    assert not permissions_for(waiting, ORGANIZER, facts(sides=1), now=NOW).schedule_match
    future = match(starts_at=NOW + 2 * 24 * H)
    before = permissions_for(future, ORGANIZER, facts(), now=NOW)
    assert before.schedule_match and not before.decide_result
    started = permissions_for(match(), ORGANIZER, facts(), now=NOW)
    assert started.decide_result and not started.schedule_match
    for name in ('propose_terms', 'accept_terms', 'cancel', 'report_result', 'register_walkover', 'attendance',
                 'send_stats', 'manage_slots', 'confirm_booking', 'suggest_court'):
        assert not getattr(started, name)
    assert not permissions_for(match(state='encerrada'), ORGANIZER, facts(), now=NOW).decide_result
    assert not permissions_for(match(state='realizada'), ORGANIZER, facts(), now=NOW).decide_result


def test_only_the_organizer_has_the_championship_flags():
    for access in (REPRESENTATIVE, ADMIN, None):
        flags = permissions_for(match(), access, facts(), now=NOW)
        assert not flags.schedule_match and not flags.decide_result
    friendly = permissions_for(match(origin='amistoso'), ORGANIZER, facts(), now=NOW)
    assert not friendly.schedule_match and not friendly.decide_result


def test_the_organizer_has_something_to_do_when_the_match_needs_a_date_or_a_decision():
    waiting = match(state='combinando', starts_at=None)
    perms = permissions_for(waiting, ORGANIZER, facts(), now=NOW)
    assert needs_my_action(waiting, ORGANIZER, perms, facts(), now=NOW)
    # Scheduled and before the start: nothing to do.
    future = match(starts_at=NOW + 2 * 24 * H)
    assert not needs_my_action(future, ORGANIZER, permissions_for(future, ORGANIZER, facts(), now=NOW), facts(),
                               now=NOW)
    # Started, no divergence and inside the 48 h: nothing yet; divergent or overdue: decide.
    running = match()
    assert not needs_my_action(running, ORGANIZER, permissions_for(running, ORGANIZER, facts(), now=NOW), facts(),
                               now=NOW)
    split = facts(reports={'a': report(2, 1), 'b': report(1, 2)})
    assert needs_my_action(running, ORGANIZER, permissions_for(running, ORGANIZER, split, now=NOW), split, now=NOW)
    late = match(starts_at=NOW - 49 * H)
    assert needs_my_action(late, ORGANIZER, permissions_for(late, ORGANIZER, facts(), now=NOW), facts(), now=NOW)

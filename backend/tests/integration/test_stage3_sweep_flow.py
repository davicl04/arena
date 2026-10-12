"""Stage 3 sweep and match access on PostgreSQL: expiries, pairing again, result deadlines and idempotency."""
from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models.events import Event
from app.models.matches import MatchMessage, MatchSearch, MatchSide, MatchSlot
from app.models.rankings import Standing
from app.models.teams import TeamMember
from app.services import match_lifecycle, standings
from app.services.match_access import (
    audience,
    can_read_chat,
    can_write_chat,
    load_match_for,
    match_access,
    side_actors,
)
from app.services.match_lifecycle import apply_final_score
from app.services.match_rules import validate_football_score
from app.services.matchmaking_queue import queue
from app.services.standings import RankingKey
from app.services.sweep import run_sweep
from tests.integration.match_helpers import (
    CITY,
    NOW,
    add,
    audit_actions,
    make_team,
    make_user,
    notifications_of,
    scheduled_match,
    team_search,
    tennis_search,
    walkin_search,
)

STAGE_THREE = ('buscas_expiradas', 'propostas_expiradas', 'ofertas_expiradas', 'pareamento', 'resultados_vencidos')


def stage_three(report):
    return {name: report[name] for name in STAGE_THREE}


def two_teams(db, **kwargs):
    rep_a, rep_b = make_user(db, 'rep-a'), make_user(db, 'rep-b')
    return rep_a, rep_b, make_team(db, rep_a, name='Ferrugem', **kwargs), make_team(db, rep_b, name='Leões', **kwargs)


def test_sweep_pairs_what_was_left_waiting_and_expires_what_is_due(client):
    _, db = client
    rep_a, rep_b, team_a, team_b = two_teams(db)
    # Two compatible searches that never met (e.g. inserted while pairing was down) and one past its 24 h.
    first = add(db, team_search(team_a, rep_a, started_at=NOW - timedelta(hours=2)))
    second = add(db, team_search(team_b, rep_b, started_at=NOW - timedelta(hours=1)))
    lapsed = add(db, tennis_search(make_user(db, 'tenista'), started_at=NOW - timedelta(hours=25)))
    report = run_sweep(db, NOW)
    assert stage_three(report) == {'buscas_expiradas': 1, 'propostas_expiradas': 0, 'ofertas_expiradas': 0,
                                   'pareamento': 1, 'resultados_vencidos': 0}
    for item in (first, second, lapsed):
        db.refresh(item)
    assert first.state == second.state == 'pareada' and first.match_id == second.match_id
    assert lapsed.state == 'expirada'
    # Running again changes nothing.
    assert set(stage_three(run_sweep(db, NOW + timedelta(seconds=30))).values()) == {0}

    # The proposal lapses after 2 h without answers: both searches end, nothing is paired again.
    report = run_sweep(db, NOW + timedelta(hours=2))
    assert report['propostas_expiradas'] == 1 and report['pareamento'] == 0
    db.refresh(first)
    assert first.state == 'sem_resposta'


def test_sweep_expires_slot_offers_and_offers_the_slot_again(client):
    _, db = client
    rep_a, rep_b, team_a, team_b = two_teams(db)
    match = scheduled_match(db, team_a, team_b, slots_a={'meio_campo': 1})
    first = queue.enqueue(db, walkin_search(make_user(db, 'primeiro'), started_at=NOW - timedelta(hours=1)),
                          now=NOW).searches[0]
    second = add(db, walkin_search(make_user(db, 'segundo')))
    report = run_sweep(db, NOW + timedelta(hours=2))
    assert report['ofertas_expiradas'] == 1
    db.refresh(first)
    db.refresh(second)
    assert first.state == 'sem_resposta' and second.state == 'pareada'
    slot = db.scalar(select(MatchSlot).where(MatchSlot.match_id == match.id))
    assert (slot.state, second.slot_id) == ('oferecida', slot.id)


def test_result_deadline_closes_friendlies_once(client, monkeypatch):
    _, db = client
    recalculated = []
    monkeypatch.setattr(match_lifecycle, 'recalculate_rankings',
                        lambda db, keys, *, now: recalculated.append(set(keys)))
    rep_a, rep_b, team_a, team_b = two_teams(db)
    member_b = make_user(db, 'membro-b')
    add(db, TeamMember(team_id=team_b.id, user_id=member_b.id, role='membro', joined_via='convite'))
    starts = NOW - timedelta(hours=48)
    silent = scheduled_match(db, team_a, team_b, starts_at=starts, slots_a={'atacante': 1})
    guest = make_user(db, 'avulso')
    slot = db.scalar(select(MatchSlot).where(MatchSlot.match_id == silent.id))
    slot.state, slot.filled_by_id, slot.filled_at = 'preenchida', guest.id, starts - timedelta(days=1)
    walkover = scheduled_match(db, team_a, team_b, starts_at=starts - timedelta(hours=1))
    walkover.walkover_absent_side, walkover.walkover_registered_at = 'b', starts + timedelta(minutes=30)
    contested = scheduled_match(db, team_a, team_b, starts_at=starts)
    contested.walkover_absent_side, contested.walkover_registered_at = 'a', starts
    contested.walkover_contested_at, contested.walkover_contest_reason = starts, 'O Ferrugem estava lá.'
    confirmed = scheduled_match(db, team_a, team_b, starts_at=starts)
    apply_final_score(confirmed, validate_football_score(2, 2), source='confirmacao', now=starts + timedelta(hours=2))
    confirmed.state = 'realizada'
    running = scheduled_match(db, team_a, team_b, starts_at=starts + timedelta(minutes=1))
    db.flush()

    assert match_lifecycle.close_due_results(db, NOW) == 3
    assert (silent.state, silent.closed_at, silent.score_a) == ('sem_resultado', NOW, None)
    assert (walkover.state, walkover.score_a, walkover.score_b, walkover.winner_side, walkover.result_source) == (
        'encerrada', 3, 0, 'a', 'wo')
    assert (confirmed.state, confirmed.closed_at, confirmed.score_a) == ('encerrada', NOW, 2)
    assert contested.state == running.state == 'agendada'
    # Two matches of the same format touch one category: it is recalculated once for the batch.
    assert recalculated == [{RankingKey('futebol_time', 'society')}]
    outcomes = {(item.user_id, item.payload['match_id']): item.payload['outcome']
                for item in notifications_of(db, 'resultado_partida')}
    for user in (rep_a, rep_b, member_b, guest):
        assert outcomes[(user.id, silent.id)] == 'sem_resultado'
    assert outcomes[(rep_a.id, walkover.id)] == 'wo'
    banners = db.scalars(select(MatchMessage.event_type).where(MatchMessage.match_id.in_([silent.id, walkover.id]))
                         ).all()
    assert sorted(banners) == ['resultado_confirmado', 'sem_resultado']
    assert [row.target_id for row in audit_actions(db, 'partida.sem_resultado')] == [silent.id]
    assert [row.target_id for row in audit_actions(db, 'partida.wo_confirmado')] == [walkover.id]
    assert [row.target_id for row in audit_actions(db, 'partida.encerrada')] == [confirmed.id]
    # A second run (or a late one) changes nothing; the running match closes one minute later.
    assert match_lifecycle.close_due_results(db, NOW) == 0
    assert match_lifecycle.close_due_results(db, NOW + timedelta(minutes=1)) == 1
    assert running.state == 'sem_resultado'
    assert len(recalculated) == 1


def test_closing_several_confirmed_matches_recalculates_each_category_once(client, monkeypatch):
    _, db = client
    rep_a, rep_b, team_a, team_b = two_teams(db)
    starts = NOW - timedelta(hours=48)
    for index in range(3):
        match = scheduled_match(db, team_a, team_b, starts_at=starts - timedelta(minutes=index), open_slots=False)
        apply_final_score(match, validate_football_score(2, index), source='confirmacao', now=starts)
        match.state = 'realizada'
    db.flush()
    seen = []
    original = standings._recalculate_key

    def spy(db, key, cuts, **kwargs):
        seen.append(key)
        return original(db, key, cuts, **kwargs)

    monkeypatch.setattr(standings, '_recalculate_key', spy)
    assert match_lifecycle.close_due_results(db, NOW) == 3
    # One recalculation of the category, not one per match, and every match counts in it.
    assert seen == [RankingKey('futebol_time', 'society')]
    row = db.scalar(select(Standing).where(Standing.team_id == team_a.id))
    assert (row.matches_played, row.wins, row.draws) == (3, 2, 1)
    assert match_lifecycle.close_due_results(db, NOW) == 0 and len(seen) == 1


def test_access_roles_and_chat_permissions(client):
    _, db = client
    rep_a, rep_b, team_a, team_b = two_teams(db)
    member, guest, stranger, admin = (make_user(db, name) for name in ('membro', 'avulso', 'estranho', 'admin'))
    admin.is_admin = True
    add(db, TeamMember(team_id=team_a.id, user_id=member.id, role='membro', joined_via='convite'))
    match = scheduled_match(db, team_a, team_b, slots_b={'goleiro': 1})
    slot = db.scalar(select(MatchSlot).where(MatchSlot.match_id == match.id))
    slot.state, slot.filled_by_id, slot.filled_at = 'preenchida', guest.id, NOW
    db.flush()

    roles = {user.id: match_access(db, match, user) for user in (rep_a, rep_b, member, guest, stranger, admin)}
    assert (roles[rep_a.id].role, roles[rep_a.id].side, roles[rep_a.id].acts_for_side) == ('representante', 'a', True)
    assert (roles[member.id].role, roles[member.id].side, roles[member.id].acts_for_side) == ('membro', 'a', False)
    assert (roles[guest.id].role, roles[guest.id].side) == ('avulso', 'b')
    assert (roles[admin.id].role, roles[admin.id].side) == ('administracao', None)
    assert roles[stranger.id] is None
    assert can_read_chat(match, roles[guest.id]) and can_write_chat(match, roles[guest.id])
    assert can_read_chat(match, roles[admin.id]) and not can_write_chat(match, roles[admin.id])
    assert not can_read_chat(match, None)
    assert audience(db, match) == [rep_a.id, member.id, rep_b.id, guest.id]
    assert audience(db, match, scope='representantes', include_guests=False) == [rep_a.id, rep_b.id]
    loaded, sides, access = load_match_for(db, match.id, rep_a, for_update=True)
    assert loaded is match and set(sides) == {'a', 'b'} and access.role == 'representante'
    for user, match_id in ((stranger, match.id), (rep_a, 999_999)):
        with pytest.raises(HTTPException) as error:
            load_match_for(db, match_id, user)
        assert (error.value.status_code, error.value.detail) == (404, 'Partida não encontrada.')

    # A person in both rosters belongs to the side they represent; the walk-in loses access when the match ends.
    add(db, TeamMember(team_id=team_b.id, user_id=member.id, role='representante', joined_via='convite'))
    assert match_access(db, match, member).side == 'b'
    match.state, match.closed_at = 'sem_resultado', NOW
    db.flush()
    assert match_access(db, match, guest) is None and not can_write_chat(match, roles[rep_a.id])
    assert can_read_chat(match, roles[rep_a.id])


def test_tennis_and_championship_access(client):
    _, db = client
    player_a, player_b, organizer = (make_user(db, name) for name in ('tenista-a', 'tenista-b', 'organiza'))
    queue.enqueue(db, tennis_search(player_a, started_at=NOW - timedelta(hours=1)), now=NOW)
    match = queue.enqueue(db, tennis_search(player_b), now=NOW).match
    assert match_access(db, match, player_a).role == 'atleta' and match_access(db, match, player_b).side == 'b'
    # The chat opens only after both acceptances.
    assert not can_read_chat(match, match_access(db, match, player_a))
    sides =db.scalars(select(MatchSide).where(MatchSide.match_id == match.id).order_by(MatchSide.side)).all()
    assert side_actors(db, sides[0]) == [player_a.id]

    event = add(db, Event(organizer_user_id=organizer.id, name='Copa Sudoeste', state='rascunho'))
    match.origin, match.event_id, match.proposal_expires_at = 'campeonato', event.id, None
    match.state = 'combinando'
    db.flush()
    access = match_access(db, match, organizer)
    assert (access.role, access.side) == ('organizador', None) and can_write_chat(match, access)
    searches = db.scalars(select(MatchSearch).where(MatchSearch.match_id == match.id)).all()
    assert len(searches) == 2 and all(item.city_id == CITY for item in searches)

"""Match cards and detail on PostgreSQL: rows created straight from the models, roles, privacy and query counts."""
import uuid
from contextlib import contextmanager
from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.models.events import Event
from app.models.identity import MediaObject, User, UserBlock
from app.models.matches import (
    Court,
    FootballStat,
    Match,
    MatchLineup,
    MatchResult,
    MatchSide,
    MatchSlot,
    MatchTerms,
)
from app.services.match_access import load_match_for, match_accesses
from app.services.match_rules import court_key, result_deadline
from app.services.match_views import match_cards, match_detail, sides_out
from tests.integration.match_helpers import (
    CITY,
    NOW,
    add,
    make_team,
    make_user,
    scheduled_match,
    walkin_search,
)

MINUTE = timedelta(minutes=1)
HOUR = timedelta(hours=1)
DAY = timedelta(days=1)


@pytest.fixture
def db(test_engine):
    with test_engine.connect() as connection:
        transaction = connection.begin()
        with Session(bind=connection, join_transaction_mode='create_savepoint', expire_on_commit=False) as session:
            yield session
        transaction.rollback()


@contextmanager
def queries(db):
    """The SELECT statements sent while the block runs."""
    statements = []

    def listener(connection, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith('SELECT'):
            statements.append(statement)

    engine = db.get_bind().engine
    event.listen(engine, 'before_cursor_execute', listener)
    try:
        yield statements
    finally:
        event.remove(engine, 'before_cursor_execute', listener)


def court(db, name='Quadra Central', *, kind='society', state='publicada', suggested_by=None, city_id=CITY):
    decided = state != 'em_revisao'
    return add(db, Court(city_id=city_id, name=name, name_key=court_key(name), kind=kind, state=state,
                         suggested_by_id=suggested_by.id if suggested_by else None,
                         published_at=NOW if state == 'publicada' else None, reviewed_at=NOW if decided else None,
                         review_reason='Duplicada' if state == 'rejeitada' else None))


def new_match(db, state, subjects, *, sport='futebol', format_='society', origin='amistoso', starts_at=None,
              place=None, tiers=(None, None), accepted=(True, True), **fields):
    """A match in any state with its sides; `subjects` are teams (football) or users (tennis)."""
    values = dict(sport=sport, format=format_ if sport == 'futebol' else None, city_id=CITY, origin=origin, state=state,
                  created_at=NOW - DAY, updated_at=NOW)
    if state == 'proposta':
        values['proposal_expires_at'] = NOW + HOUR
    if starts_at is not None:
        values.update(starts_at=starts_at, result_deadline=result_deadline(starts_at), booking_side='a',
                      court_id=place.id if place else None)
    if state in ('cancelada', 'sem_resultado', 'encerrada', 'recusada', 'expirada'):
        values['closed_at'] = NOW
    values.update(fields)
    match = add(db, Match(**values))
    key = 'user_id' if sport == 'tenis' else 'team_id'
    for label, subject, tier, answered in zip('ab', subjects, tiers, accepted):
        add(db, MatchSide(match_id=match.id, side=label, tier=tier, accepted_at=NOW - HOUR if answered else None,
                          **{key: subject.id}))
    return match


def terms(db, match, place, *, state, proposer=None, side='a', starts_at=None, **fields):
    both = state == 'aceita'
    return add(db, MatchTerms(
        match_id=match.id, proposed_by_id=proposer.id if proposer else None, proposed_by_side=side,
        starts_at=starts_at or NOW + 2 * DAY, court_id=place.id, booking_side='a', state=state,
        accepted_a_at=NOW - HOUR if side == 'a' or both else None, accepted_b_at=NOW - HOUR if side == 'b' or both
        else None, decided_at=NOW - HOUR if both else None, created_at=NOW - 2 * HOUR, **fields))


def report(db, match, side, goals_a, goals_b, user, **fields):
    return add(db, MatchResult(match_id=match.id, side=side, reported_by_id=user.id, score_a=goals_a, score_b=goals_b,
                               created_at=NOW - HOUR, updated_at=NOW - HOUR, **fields))


@pytest.fixture
def world(db):
    """Two football teams (representative + member each), a walk-in, a stranger, an administrator and a court."""
    people = {name: make_user(db, name) for name in ('rep_a', 'member_a', 'rep_b', 'member_b', 'guest', 'stranger')}
    people['admin'] = make_user(db, 'admin', admin=True)
    team_a = make_team(db, people['rep_a'], people['member_a'], name='Ferrugem FC')
    team_b = make_team(db, people['rep_b'], people['member_b'], name='Tigres do Lago')
    return {**people, 'team_a': team_a, 'team_b': team_b, 'court': court(db)}


def card_of(db, user, match, now=NOW):
    return match_cards(db, user, [match], now=now)[0]


# ----- Cards ------------------------------------------------------------------------------------------------

def test_proposal_card_shows_both_sides_and_who_has_to_answer(db, world):
    match = new_match(db, 'proposta', [world['team_a'], world['team_b']], tiers=('ouro', None), accepted=(True, False))
    waiting, answering, member = (card_of(db, world[name], match) for name in ('rep_a', 'rep_b', 'member_b'))

    assert (answering.id, answering.sport, answering.format, answering.origin) == (match.id, 'futebol', 'society',
                                                                                  'amistoso')
    assert (answering.state, answering.phase, answering.my_side, answering.my_role) == ('proposta', 'proposta', 'b',
                                                                                        'representante')
    first, second = answering.sides
    assert (first.side, first.kind, first.team.name, first.team.initials, first.athlete) == (
        'a', 'time', 'Ferrugem FC', 'FF', None)
    assert (first.tier, first.is_mine, first.accepted_at) == ('ouro', False, NOW - HOUR)
    # No tier is invented for who is in placement; the answering side has not accepted yet.
    assert (second.side, second.tier, second.is_mine, second.accepted_at) == ('b', None, True, None)
    assert (answering.starts_at, answering.court, answering.score, answering.result_deadline) == (None, None, None,
                                                                                                  None)
    assert (answering.needs_my_action, waiting.needs_my_action, member.needs_my_action) == (True, False, False)
    assert (member.my_role, member.my_side) == ('membro', 'b')
    # A proposal past its 2 hours reads as expired even before the sweep.
    late = card_of(db, world['rep_b'], match, now=NOW + 3 * HOUR)
    assert (late.state, late.phase, late.needs_my_action) == ('expirada', 'expirada', False)


def test_combining_match_with_pending_terms_and_a_provisional_court(db, world):
    suggested = court(db, 'Quadra Nova', state='em_revisao', suggested_by=world['rep_a'])
    match = new_match(db, 'combinando', [world['team_a'], world['team_b']])
    proposal = terms(db, match, suggested, state='pendente', proposer=world['rep_a'])
    answering = match_detail(db, world['rep_b'], match, now=NOW)
    proposing = match_detail(db, world['rep_a'], match, now=NOW)

    assert (answering.state, answering.phase, answering.starts_at, answering.court) == ('combinando', 'combinando',
                                                                                         None, None)
    assert answering.terms.current is None and answering.terms.pending.id == proposal.id
    pending = answering.terms.pending
    assert (pending.proposed_by.username, pending.proposed_by_side, pending.state) == (world['rep_a'].username, 'a',
                                                                                       'pendente')
    assert (pending.accepted_a_at, pending.accepted_b_at) == (NOW - HOUR, None)
    assert (pending.court.name, pending.court.provisional, pending.court.state) == ('Quadra Nova', True, 'em_revisao')
    assert pending.court.city.id == CITY and pending.booking_side == 'a'
    assert answering.needs_my_action and answering.permissions.accept_terms
    assert not proposing.needs_my_action and not proposing.permissions.accept_terms
    assert proposing.permissions.propose_terms and proposing.permissions.cancel and proposing.permissions.manage_slots
    assert answering.permissions.read_chat and answering.permissions.write_chat
    assert answering.proposal_expires_at is None and answering.cancel_until is None and answering.booking is None
    assert answering.result is None and answering.walkover is None and answering.cancellation is None


def test_declared_slots_show_while_the_match_is_being_arranged_and_become_slots_once_scheduled(db, world):
    match = new_match(db, 'combinando', [world['team_a'], world['team_b']])
    sides = {row.side: row for row in db.scalars(select(MatchSide).where(MatchSide.match_id == match.id))}
    sides['a'].declared_slots = {'goleiro': 1, 'atacante': 2}
    sides['b'].declared_slots = {}
    db.flush()

    for viewer in ('rep_a', 'rep_b', 'member_a'):
        first, second = match_detail(db, world[viewer], match, now=NOW).sides
        assert first.declared_slots.model_dump() == {'goleiro': 1, 'defesa': 0, 'meio_campo': 0, 'atacante': 2}
        # A side that declared nothing (complete team) has null, not zeros.
        assert second.declared_slots is None
    assert card_of(db, world['rep_a'], match).sides[0].declared_slots.atacante == 2

    # Scheduled, the declaration lives in the slots and is no longer shown.
    scheduled = scheduled_match(db, world['team_a'], world['team_b'], slots_a={'goleiro': 1})
    detail = match_detail(db, world['rep_a'], scheduled, now=NOW)
    assert [(slot.side, slot.position) for slot in detail.slots] == [('a', 'goleiro')]
    assert [side.declared_slots for side in detail.sides] == [None, None]


def test_scheduled_match_lists_the_slots_and_the_walk_in(db, world):
    starts_at = NOW + 2 * DAY
    match = scheduled_match(db, world['team_a'], world['team_b'], starts_at=starts_at,
                            slots_a={'atacante': 1}, slots_b={'goleiro': 1, 'defesa': 1})
    match.court_id, match.booking_side = world['court'].id, 'a'
    accepted = terms(db, match, world['court'], state='aceita', proposer=world['rep_a'], starts_at=starts_at)
    slots = {(slot.side, slot.position): slot for slot in db.scalars(select(MatchSlot).where(
        MatchSlot.match_id == match.id))}
    slots['b', 'goleiro'].state = 'preenchida'
    slots['b', 'goleiro'].filled_by_id, slots['b', 'goleiro'].filled_at = world['guest'].id, NOW - HOUR
    slots['b', 'defesa'].state = 'oferecida'
    add(db, MatchSlot(match_id=match.id, side='a', position='meio_campo', state='fechada', closed_at=NOW - HOUR))

    detail = match_detail(db, world['rep_a'], match, now=NOW)
    assert (detail.state, detail.phase, detail.my_side, detail.my_role) == ('agendada', 'agendada', 'a',
                                                                            'representante')
    assert detail.starts_at == starts_at and detail.result_deadline == starts_at + 48 * HOUR
    assert detail.court.name == 'Quadra Central' and not detail.court.provisional
    assert detail.terms.current.id == accepted.id and detail.terms.pending is None
    assert (detail.terms.current.accepted_a_at, detail.terms.current.accepted_b_at) == (NOW - HOUR, NOW - HOUR)
    assert detail.city.id == CITY and detail.event is None and detail.round_number is None
    assert detail.cancel_until == starts_at - 24 * HOUR and detail.proposal_expires_at is None
    assert (detail.booking.side, detail.booking.state, detail.booking.confirmed_at) == ('a', 'a_confirmar', None)
    assert [(slot.side, slot.position, slot.state) for slot in detail.slots] == [
        ('a', 'atacante', 'aberta'), ('b', 'goleiro', 'preenchida'), ('b', 'defesa', 'oferecida')]
    assert [slot.guest.id if slot.guest else None for slot in detail.slots] == [None, world['guest'].id, None]
    assert detail.slots[1].filled_at == NOW - HOUR
    assert detail.permissions.model_dump() == {
        'read_chat': True, 'write_chat': True, 'propose_terms': True, 'accept_terms': False, 'suggest_court': True,
        'confirm_booking': True, 'cancel': True, 'report_result': False, 'register_walkover': False,
        'withdraw_walkover': False, 'contest_walkover': False, 'attendance': False, 'send_stats': False,
        'manage_slots': True}
    assert not detail.needs_my_action and detail.result is None and detail.score is None

    # The booking turns confirmed; side B does not book, so it cannot confirm.
    match.booking_confirmed_at, match.booking_confirmed_by_id = NOW - HOUR, world['rep_a'].id
    db.flush()
    again = match_detail(db, world['rep_a'], match, now=NOW)
    assert (again.booking.state, again.booking.confirmed_at) == ('confirmada', NOW - HOUR)
    assert not match_detail(db, world['rep_b'], match, now=NOW).permissions.confirm_booking

    # The walk-in reads and writes in the chat but acts for nothing; the member only follows.
    guest = match_detail(db, world['guest'], match, now=NOW)
    assert (guest.my_role, guest.my_side) == ('avulso', 'b') and guest.sides[1].is_mine
    assert [name for name, value in guest.permissions if value] == ['read_chat', 'write_chat']
    member = match_detail(db, world['member_a'], match, now=NOW)
    assert (member.my_role, member.permissions.cancel, member.permissions.accept_terms) == ('membro', False, False)
    # The administration reads without acting.
    admin = match_detail(db, world['admin'], match, now=NOW)
    assert (admin.my_role, admin.my_side) == ('administracao', None) and not any(side.is_mine for side in admin.sides)
    assert [name for name, value in admin.permissions if value] == ['read_chat']


def test_strangers_get_404_and_only_an_offered_walk_in_sees_the_card(db, world):
    match = scheduled_match(db, world['team_a'], world['team_b'], slots_b={'goleiro': 1})
    slot = db.scalar(select(MatchSlot).where(MatchSlot.match_id == match.id))
    slot.state = 'oferecida'
    offered = make_user(db, 'oferecido')
    search = walkin_search(offered, position='goleiro', started_at=NOW - HOUR)
    search.state, search.slot_id, search.offer_expires_at = 'pareada', slot.id, NOW + HOUR
    add(db, search)

    for call in (lambda: match_cards(db, world['stranger'], [match], now=NOW),
                 lambda: match_detail(db, world['stranger'], match, now=NOW),
                 lambda: match_detail(db, offered, match, now=NOW)):
        with pytest.raises(HTTPException) as error:
            call()
        assert (error.value.status_code, error.value.detail) == (404, 'Partida não encontrada.')
    card = card_of(db, offered, match)
    assert (card.my_role, card.my_side, card.needs_my_action) == ('avulso', 'b', False)
    assert card.sides[1].is_mine and card.sides[0].team.name == 'Ferrugem FC'
    # Once the offer is declined the walk-in is a stranger again.
    search.state, search.ended_at = 'recusada', NOW
    search.slot_id = search.offer_expires_at = None
    db.flush()
    with pytest.raises(HTTPException):
        match_cards(db, offered, [match], now=NOW)
    assert match_cards(db, offered, [], now=NOW) == []


def test_result_card_follows_the_reports_of_each_side(db, world):
    started = NOW - 2 * HOUR
    match = scheduled_match(db, world['team_a'], world['team_b'], starts_at=started, open_slots=False)

    waiting = match_detail(db, world['rep_b'], match, now=NOW)
    assert (waiting.phase, waiting.state) == ('informar_resultado', 'agendada')
    assert waiting.result.state == 'aguardando' and waiting.result.deadline == started + 48 * HOUR
    assert waiting.result.reports == {'a': None, 'b': None} and waiting.result.final is None
    assert waiting.needs_my_action and waiting.permissions.report_result and waiting.permissions.register_walkover

    report(db, match, 'a', 3, 1, world['rep_a'])
    lineup = add(db, MatchLineup(match_id=match.id, side='a', user_id=world['rep_a'].id, team_id=world['team_a'].id,
                                 present=True))
    add(db, FootballStat(lineup_id=lineup.id, match_id=match.id, user_id=world['rep_a'].id, goals=1))
    reported = match_detail(db, world['rep_a'], match, now=NOW)
    assert reported.result.state == 'aguardando' and reported.result.reports['b'] is None
    sent = reported.result.reports['a']
    assert (sent.side, sent.score.a, sent.score.b, sent.score.winner, sent.reported_by.id) == (
        'a', 3, 1, 'a', world['rep_a'].id)
    # Nothing is pending for the side that reported and sent its stats; the other side still has to report.
    assert not reported.needs_my_action
    assert reported.permissions.register_walkover and reported.permissions.send_stats
    other = match_detail(db, world['rep_b'], match, now=NOW)
    assert other.needs_my_action and not other.permissions.register_walkover
    # Blind report (12.3): the other side only learns that A reported, not the score; the whole side is blind,
    # the administration (no side) sees it and the reporting side sees its own.
    hidden = other.result.reports['a']
    assert (hidden.side, hidden.score, hidden.reported_by.id) == ('a', None, world['rep_a'].id)
    assert other.result.reports['b'] is None
    assert match_detail(db, world['member_b'], match, now=NOW).result.reports['a'].score is None
    assert match_detail(db, world['admin'], match, now=NOW).result.reports['a'].score.a == 3

    report(db, match, 'b', 2, 2, world['rep_b'])
    divergent = match_detail(db, world['rep_a'], match, now=NOW)
    assert (divergent.phase, divergent.result.state) == ('divergente', 'divergente')
    assert (divergent.result.reports['a'].score.winner, divergent.result.reports['b'].score.winner) == ('a', None)
    # With both reported, the divergence shows both scores to both sides.
    seen_by_b = match_detail(db, world['rep_b'], match, now=NOW).result.reports
    assert (seen_by_b['a'].score.a, seen_by_b['a'].score.b, seen_by_b['b'].score.a) == (3, 1, 2)
    assert divergent.needs_my_action and match_detail(db, world['rep_b'], match, now=NOW).needs_my_action

    # After the 48 hours the window is closed even before the sweep: nothing to do.
    closed = match_detail(db, world['rep_a'], match, now=started + 49 * HOUR)
    assert not closed.needs_my_action and not closed.permissions.report_result and closed.result.state == 'divergente'


def test_confirmed_result_gives_team_points_to_the_roster_only(db, world):
    started = NOW - 3 * HOUR
    match = scheduled_match(db, world['team_a'], world['team_b'], starts_at=started, slots_b={'goleiro': 1})
    slot = db.scalar(select(MatchSlot).where(MatchSlot.match_id == match.id))
    slot.state, slot.filled_by_id, slot.filled_at = 'preenchida', world['guest'].id, NOW - 2 * DAY
    report(db, match, 'a', 3, 1, world['rep_a'])
    report(db, match, 'b', 3, 1, world['rep_b'])
    match.state, match.score_a, match.score_b, match.winner_side = 'realizada', 3, 1, 'a'
    match.result_source, match.result_confirmed_at = 'confirmacao', NOW - HOUR
    db.flush()

    winner = match_detail(db, world['member_a'], match, now=NOW)
    assert (winner.state, winner.phase) == ('realizada', 'confirmado')
    assert (winner.score.a, winner.score.b, winner.score.winner, winner.score.sets) == (3, 1, 'a', None)
    result = winner.result
    assert (result.state, result.source, result.confirmed_at, result.points) == ('confirmado', 'confirmacao',
                                                                                 NOW - HOUR, 3)
    assert (result.final.a, result.final.b) == (3, 1) and result.reports['a'].score.b == 1
    # A settled result is no longer blind.
    assert match_detail(db, world['rep_b'], match, now=NOW).result.reports['a'].score.b == 1
    assert match_detail(db, world['rep_b'], match, now=NOW).result.points == 0
    assert match_detail(db, world['guest'], match, now=NOW).result.points is None
    assert match_detail(db, world['admin'], match, now=NOW).result.points is None
    # The stats window is still open (the result is confirmed, the 48 hours are not over).
    assert winner.permissions.send_stats and winner.needs_my_action

    match.score_b, match.winner_side = 3, None
    db.flush()
    assert match_detail(db, world['rep_a'], match, now=NOW).result.points == 1
    assert match_detail(db, world['rep_b'], match, now=NOW).result.final.winner is None


def test_walkover_cancellation_and_closed_matches(db, world):
    started = NOW - 2 * HOUR
    walkover = scheduled_match(db, world['team_a'], world['team_b'], starts_at=started, open_slots=False)
    walkover.walkover_absent_side, walkover.walkover_registered_by_id = 'b', world['rep_a'].id
    walkover.walkover_registered_at = NOW - HOUR
    db.flush()
    present = match_detail(db, world['rep_a'], walkover, now=NOW)
    absent = match_detail(db, world['rep_b'], walkover, now=NOW)
    assert (present.phase, present.result.state) == ('wo_registrado', 'wo_registrado')
    assert (present.walkover.absent_side, present.walkover.registered_by.id, present.walkover.registered_at) == (
        'b', world['rep_a'].id, NOW - HOUR)
    assert present.walkover.contest_until == started + 48 * HOUR and present.walkover.decision is None
    assert present.permissions.withdraw_walkover and not present.permissions.report_result
    assert absent.permissions.contest_walkover and absent.needs_my_action and not present.needs_my_action

    walkover.walkover_contested_by_id, walkover.walkover_contested_at = world['rep_b'].id, NOW - 30 * MINUTE
    walkover.walkover_contest_reason = 'Chegamos no horário e esperamos 15 minutos.'
    db.flush()
    contested = match_detail(db, world['rep_a'], walkover, now=NOW)
    assert (contested.phase, contested.result.state) == ('wo_contestado', 'wo_contestado')
    assert contested.walkover.contested_by.id == world['rep_b'].id
    assert contested.walkover.contest_reason == 'Chegamos no horário e esperamos 15 minutos.'
    assert not contested.permissions.withdraw_walkover
    assert not match_detail(db, world['rep_b'], walkover, now=NOW).permissions.contest_walkover

    walkover.state, walkover.closed_at = 'sem_resultado', NOW
    walkover.walkover_decision, walkover.walkover_decided_at = 'anulado', NOW
    walkover.walkover_decided_by_id = world['admin'].id
    walkover.walkover_decision_reason = 'Há registros de que o time B esteve na quadra.'
    db.flush()
    annulled = match_detail(db, world['rep_a'], walkover, now=NOW)
    assert (annulled.phase, annulled.result.state, annulled.result.final) == ('sem_resultado', 'sem_resultado', None)
    assert annulled.walkover.decision == 'anulado'
    assert annulled.result.decision_reason == 'Há registros de que o time B esteve na quadra.'
    assert annulled.permissions.read_chat and not annulled.permissions.write_chat and not annulled.needs_my_action

    cancelled = scheduled_match(db, world['team_a'], world['team_b'], slots_b={'goleiro': 1})
    cancelled.state, cancelled.closed_at = 'cancelada', NOW
    cancelled.cancelled_at, cancelled.cancelled_by_id, cancelled.cancel_reason = NOW, world['rep_b'].id, 'Chuva forte'
    closed_slot = db.scalar(select(MatchSlot).where(MatchSlot.match_id == cancelled.id))
    closed_slot.state, closed_slot.closed_at = 'fechada', NOW
    db.flush()
    detail = match_detail(db, world['rep_a'], cancelled, now=NOW)
    assert (detail.state, detail.phase, detail.slots, detail.cancel_until) == ('cancelada', 'cancelada', [], None)
    assert (detail.cancellation.at, detail.cancellation.by.id, detail.cancellation.reason) == (
        NOW, world['rep_b'].id, 'Chuva forte')
    assert detail.permissions.read_chat and not any(
        value for name, value in detail.permissions if name != 'read_chat')


def test_tennis_match_has_athletes_sets_and_hides_the_avatar_of_blocked_people(db, world):
    player_a, player_b = make_user(db, 'tenista-a'), make_user(db, 'tenista-b')
    for user in (player_a, player_b):
        media = add(db, MediaObject(id=uuid.uuid4(), user_id=user.id, bucket='arena',
                                    object_key=f'avatars/{uuid.uuid4()}.webp', content_type='image/webp',
                                    size_bytes=10, width=1, height=1))
        user.avatar_media_id = media.id
    starts_at = NOW - 3 * HOUR
    sets = [{'a': 6, 'b': 4, 'tiebreak': None, 'super_tiebreak': False},
            {'a': 6, 'b': 7, 'tiebreak': {'a': 5, 'b': 7}, 'super_tiebreak': False},
            {'a': 10, 'b': 8, 'tiebreak': None, 'super_tiebreak': True}]
    match = new_match(db, 'realizada', [player_a, player_b], sport='tenis', starts_at=starts_at, place=court(
        db, 'Quadra 1', kind='tenis'), tiers=('prata', None), score_a=2, score_b=1, winner_side='a', sets=sets,
        result_source='confirmacao', result_confirmed_at=NOW - HOUR, super_tiebreak=True)
    add(db, UserBlock(blocker_id=player_a.id, blocked_id=player_b.id))

    detail = match_detail(db, player_a, match, now=NOW)
    assert (detail.sport, detail.format, detail.my_role, detail.my_side) == ('tenis', None, 'atleta', 'a')
    first, second = detail.sides
    assert (first.kind, first.team, first.athlete.id, first.tier, first.is_mine) == ('atleta', None, player_a.id,
                                                                                   'prata', True)
    assert first.athlete.avatar_url.startswith(f'/api/v1/users/{player_a.id}/avatar?v=')
    # A block hides the avatar in both directions, never the name.
    assert second.athlete.name == player_b.name and second.athlete.avatar_url is None and second.tier is None
    assert match_detail(db, player_b, match, now=NOW).sides[0].athlete.avatar_url is None
    assert (detail.super_tiebreak, detail.court.kind) == (True, 'tenis')
    assert [(item.a, item.b, item.super_tiebreak) for item in detail.score.sets] == [(6, 4, False), (6, 7, False),
                                                                                    (10, 8, True)]
    assert detail.score.sets[1].tiebreak == {'a': 5, 'b': 7} and (detail.score.a, detail.score.b) == (2, 1)
    assert detail.result.points == 10 and match_detail(db, player_b, match, now=NOW).result.points == 0
    assert not detail.permissions.send_stats and not detail.permissions.attendance
    payload = detail.model_dump_json()
    assert '@example.com' not in payload and player_a.email not in payload and 'birth_date' not in payload


def test_championship_match_has_the_event_and_the_organizer_role(db, world):
    organizer = make_user(db, 'organizador')
    event = add(db, Event(organizer_user_id=organizer.id, name='Copa Sudoeste', state='rascunho'))
    match = new_match(db, 'combinando', [world['team_a']], origin='campeonato', event_id=event.id, round_number=2)

    detail = match_detail(db, organizer, match, now=NOW)
    assert (detail.origin, detail.my_role, detail.my_side, detail.round_number) == ('campeonato', 'organizador', None, 2)
    assert (detail.event.id, detail.event.name) == (event.id, 'Copa Sudoeste')
    assert [side.side for side in detail.sides] == ['a'] and not any(side.is_mine for side in detail.sides)
    assert [name for name, value in detail.permissions if value] == ['read_chat', 'write_chat']
    representative = match_detail(db, world['rep_a'], match, now=NOW)
    assert representative.event.name == 'Copa Sudoeste'
    # The organizer sets the terms of a championship, so the representatives only chat.
    assert [name for name, value in representative.permissions if value] == ['read_chat', 'write_chat']


def test_sides_out_builds_the_sides_for_other_cards(db, world):
    match = new_match(db, 'proposta', [world['team_a'], world['team_b']], tiers=('bronze', 'prata'))
    sides = {match.id: {side.side: side for side in db.scalars(select(MatchSide).where(MatchSide.match_id == match.id))}}
    built = sides_out(db, world['rep_a'], sides, my_sides={match.id: 'a'})[match.id]
    assert [(side.side, side.team.name, side.tier, side.is_mine) for side in built] == [
        ('a', 'Ferrugem FC', 'bronze', True), ('b', 'Tigres do Lago', 'prata', False)]
    assert sides_out(db, world['rep_a'], {}) == {}


def test_batch_access_resolves_each_match_for_the_viewer(db, world):
    organizer = make_user(db, 'organizadora')
    event = add(db, Event(organizer_user_id=organizer.id, name='Liga', state='rascunho'))
    own = new_match(db, 'combinando', [world['team_a'], world['team_b']])
    other_teams = make_team(db, make_user(db, 'outro'), name='Outros FC')
    foreign = new_match(db, 'combinando', [other_teams, world['team_b']])
    hosted = new_match(db, 'combinando', [other_teams], origin='campeonato', event_id=event.id)
    walk_in = scheduled_match(db, other_teams, world['team_b'], slots_b={'defesa': 1})
    slot = db.scalar(select(MatchSlot).where(MatchSlot.match_id == walk_in.id))
    slot.state, slot.filled_by_id, slot.filled_at = 'preenchida', world['rep_a'].id, NOW
    db.flush()

    result = match_accesses(db, [own, foreign, hosted, walk_in, own], world['rep_a'])
    assert {key: (value.role, value.side) if value else None for key, value in result.items()} == {
        own.id: ('representante', 'a'), foreign.id: None, hosted.id: None, walk_in.id: ('avulso', 'b')}
    admin = match_accesses(db, [own, foreign, hosted], world['admin'])
    assert {value.role for value in admin.values()} == {'administracao'}
    assert match_accesses(db, [hosted, foreign], organizer)[hosted.id].role == 'organizador'
    assert match_accesses(db, [hosted, foreign], organizer)[foreign.id] is None
    assert match_accesses(db, [], organizer) == {}


# ----- Query counts -----------------------------------------------------------------------------------------

def page(db, world, copies):
    """The same mix of matches repeated: every kind of data the cards load is present in each copy."""
    place = world['court']
    matches = []
    for index in range(copies):
        team_a = make_team(db, world['rep_a'], world['member_a'], name=f'Time A{index}')
        team_b = make_team(db, make_user(db, f'rival{index}'), name=f'Time B{index}')
        matches.append(new_match(db, 'proposta', [team_a, team_b], tiers=('ouro', None), accepted=(False, True)))
        combining = new_match(db, 'combinando', [team_a, team_b])
        terms(db, combining, place, state='pendente', proposer=world['rep_a'])
        matches.append(combining)
        scheduled = scheduled_match(db, team_a, team_b, starts_at=NOW + 2 * DAY, slots_b={'goleiro': 1})
        scheduled.court_id = place.id
        terms(db, scheduled, place, state='aceita', proposer=world['rep_a'])
        matches.append(scheduled)
        started = scheduled_match(db, team_a, team_b, starts_at=NOW - 2 * HOUR, open_slots=False)
        report(db, started, 'a', 1, 0, world['rep_a'])
        matches.append(started)
        matches.append(new_match(db, 'combinando', [world['rep_a'], make_user(db, f'tenista{index}')], sport='tenis'))
        matches.append(new_match(db, 'cancelada', [team_a, team_b], cancelled_at=NOW,
                                 cancelled_by_id=world['rep_a'].id))
    db.flush()
    return matches


def cards_with_queries(db, world, matches):
    db.expire_all()
    viewer = db.get(User, world['rep_a'].id)
    rows = db.scalars(select(Match).where(Match.id.in_([match.id for match in matches])).order_by(Match.id)).all()
    with queries(db) as statements:
        cards = match_cards(db, viewer, rows, now=NOW)
    return cards, statements


def test_cards_use_a_fixed_number_of_queries_whatever_the_page_size(db, world):
    small = page(db, world, 1)
    large = small + page(db, world, 6)
    cards_small, small_statements = cards_with_queries(db, world, small)
    cards_large, large_statements = cards_with_queries(db, world, large)
    assert len(cards_small) == 6 and len(cards_large) == 42
    assert len(small_statements) == len(large_statements) <= 14
    assert {card.phase for card in cards_large} == {'proposta', 'combinando', 'agendada', 'informar_resultado',
                                                    'cancelada'}
    assert {card.my_role for card in cards_large} == {'representante', 'atleta'}
    # Cards come out in the order the matches were given, one per match.
    assert [card.id for card in cards_large] == sorted(card.id for card in cards_large)
    assert sum(card.needs_my_action for card in cards_large) == 14
    # The detail also loads in a fixed number of queries.
    with queries(db) as detail_statements:
        detail = match_detail(db, world['rep_a'], large[2], now=NOW)
    assert len(detail_statements) <= 16 and detail.id == large[2].id


def test_detail_reuses_the_sides_and_access_loaded_by_the_route(db, world):
    match = scheduled_match(db, world['team_a'], world['team_b'], slots_b={'goleiro': 1})
    loaded, sides, access = load_match_for(db, match.id, world['rep_a'])
    with queries(db) as full:
        match_detail(db, world['rep_a'], loaded, now=NOW)
    with queries(db) as reused:
        detail = match_detail(db, world['rep_a'], loaded, now=NOW, sides=sides, access=access)
    assert len(reused) < len(full) and detail.my_role == 'representante'

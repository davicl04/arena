"""The matchmaking queue (pairing, proposals, slot offers, expiry) over a simulated session (no database).

The real queue code runs on plain model instances: what is checked is who pairs with whom, the states the searches,
proposals and slots move to, what is told and audited, and the order of the bucket and row locks. The SQL, the
advisory locks and the races are checked on PostgreSQL (`tests/integration/test_matchmaking_*.py`).
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.models.audit import AuditLog
from app.models.matches import Match, MatchLineup, MatchMessage, MatchSearch, MatchSide, MatchSlot
from app.models.notifications import Notification
from app.services.match_rules import TransitionError
from app.services.matchmaking_queue import PostgresMatchmakingQueue, proposal_bucket
from tests.unit.fakes import FakeDb

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
HOUR = timedelta(hours=1)
DAY = timedelta(days=1)
REP_A, REP_B, GUEST, ACTOR = 11, 22, 33, 44


def make_search(search_id, *, kind='time', team_id=None, user_id=None, state='ativa', **values):
    base = dict(id=search_id, kind=kind, sport='tenis' if kind == 'tenis' else 'futebol', city_id=1,
                format='society' if kind == 'time' else None, team_id=team_id, user_id=user_id, tier=None, state=state,
                started_at=NOW - search_id * HOUR, expires_at=NOW + 20 * HOUR, open_slots=None)
    return MatchSearch(**{**base, **values})


def make_match(**values):
    base = dict(id=1, sport='futebol', format='society', city_id=1, origin='amistoso', state='proposta',
                proposal_expires_at=NOW + HOUR, created_at=NOW - HOUR, updated_at=NOW - HOUR)
    return Match(**{**base, **values})


def proposal_sides(**kwargs):
    return [MatchSide(id=1, match_id=1, side='a', team_id=1, search_id=10, **kwargs.get('a', {})),
            MatchSide(id=2, match_id=1, side='b', team_id=2, search_id=11, **kwargs.get('b', {}))]


def kinds(db, model):
    return [row for row in db.added if isinstance(row, model)]


def user(user_id=REP_A):
    return SimpleNamespace(id=user_id, name=f'Atleta {user_id}')


@pytest.fixture
def db():
    fake = FakeDb()
    fake.on('teams', [(1, 'Ferrugem FC'), (2, 'Tigres do Lago')])
    fake.on('team_members', [(1, REP_A), (2, REP_B)])
    return fake


@pytest.fixture
def queue():
    return PostgresMatchmakingQueue()


# ----- Small rules --------------------------------------------------------------------------------------------

def test_the_bucket_of_a_proposal_is_the_one_both_searches_share():
    assert proposal_bucket(make_match()) == 'futebol:time:1:society'
    assert proposal_bucket(make_match(sport='tenis', format=None)) == 'tenis:1'


def test_a_search_returns_to_the_queue_with_its_original_deadline_or_expires(queue):
    held = make_search(1, state='pareada', match_id=5, slot_id=9, offer_expires_at=NOW + HOUR)
    assert queue.requeue(None, held, now=NOW) is True
    assert (held.state, held.match_id, held.slot_id, held.offer_expires_at, held.expires_at) == (
        'ativa', None, None, None, NOW + 20 * HOUR)
    late = make_search(2, state='pareada', expires_at=NOW - HOUR)
    assert queue.requeue(None, late, now=NOW) is False
    assert (late.state, late.ended_at) == ('expirada', NOW)


def test_only_waiting_searches_enter_the_queue(db, queue):
    with pytest.raises(ValueError):
        queue.enqueue(db, make_search(1, state='cancelada'), now=NOW)


# ----- Pairing ------------------------------------------------------------------------------------------------

def test_a_new_search_pairs_with_the_best_waiting_one_and_a_proposal_is_made(db, queue):
    waiting = make_search(2, team_id=1)
    newcomer = make_search(1, team_id=2, started_at=NOW)
    db.then('match_searches', newcomer, [waiting], waiting)          # the re-read, the candidates, the re-read
    pairing = queue.try_match(db, newcomer, now=NOW)
    assert pairing.kind == 'proposta' and pairing.searches == (waiting, newcomer)
    match = pairing.match
    assert (match.state, match.sport, match.format, match.proposal_expires_at) == ('proposta', 'futebol', 'society',
                                                                                   NOW + 2 * HOUR)
    sides = {side.side: side for side in kinds(db, MatchSide)}
    assert (sides['a'].search_id, sides['b'].search_id) == (2, 1)           # side A is the search that waited
    assert (waiting.state, waiting.match_id, newcomer.state) == ('pareada', match.id, 'pareada')
    told = sorted((row.user_id, row.payload['opponent_name']) for row in kinds(db, Notification))
    assert told == [(REP_A, 'Tigres do Lago'), (REP_B, 'Ferrugem FC')]
    assert [row.action for row in kinds(db, AuditLog)] == ['partida.proposta_criada']


def test_nothing_pairs_when_the_search_is_gone_or_nobody_is_waiting(db, queue):
    search = make_search(1, team_id=1)
    db.then('match_searches', None)
    assert queue.try_match(db, search, now=NOW) is None
    db.then('match_searches', make_search(1, team_id=1, state='cancelada'))
    assert queue.try_match(db, search, now=NOW) is None
    db.then('match_searches', make_search(1, team_id=1, expires_at=NOW - HOUR))
    assert queue.try_match(db, search, now=NOW) is None
    db.then('match_searches', search, [])
    assert queue.try_match(db, search, now=NOW) is None
    # A candidate that was taken meanwhile is skipped.
    taken = make_search(2, team_id=2, state='pareada')
    db.then('match_searches', search, [make_search(2, team_id=2)], taken)
    assert queue.try_match(db, search, now=NOW) is None and db.of(Match) == []


def test_a_walkin_is_offered_the_first_open_slot_and_holds_it_for_two_hours(db, queue):
    match = make_match(state='agendada', starts_at=NOW + DAY, proposal_expires_at=None)
    side = MatchSide(id=1, match_id=1, side='a', team_id=1, tier=None)
    slot = MatchSlot(id=5, match_id=1, side='a', position='goleiro', state='aberta', opened_at=NOW - HOUR)
    walkin = make_search(3, kind='avulso', user_id=GUEST, position='goleiro')
    db.then('match_searches', walkin)
    db.then('match_slots', [(slot, match, side)], slot)
    db.on('standings', []).then('teams', 'Ferrugem FC')
    pairing = queue.try_match(db, walkin, now=NOW)
    assert pairing.kind == 'oferta' and pairing.slot is slot
    assert (slot.state, walkin.state, walkin.slot_id, walkin.offer_expires_at) == (
        'oferecida', 'pareada', 5, NOW + 2 * HOUR)
    [notice] = kinds(db, Notification)
    assert (notice.type, notice.user_id, notice.payload['team_name'], notice.payload['position']) == (
        'vaga_encontrada', GUEST, 'Ferrugem FC', 'goleiro')
    assert [row.action for row in kinds(db, AuditLog)] == ['vaga.oferecida']


def test_no_slot_means_no_offer(db, queue):
    walkin = make_search(3, kind='avulso', user_id=GUEST)
    db.then('match_searches', walkin)
    db.on('match_slots', []).on('standings', [])
    assert queue.try_match(db, walkin, now=NOW) is None


def test_open_slots_are_offered_to_the_walkins_waiting_in_order(db, queue):
    match = make_match(state='agendada', starts_at=NOW + DAY, proposal_expires_at=None, sport='futebol')
    sides = [MatchSide(id=1, match_id=1, side='a', team_id=1), MatchSide(id=2, match_id=1, side='b', team_id=2)]
    slots = [MatchSlot(id=5, match_id=1, side='a', position='goleiro', state='aberta', opened_at=NOW - 2 * HOUR),
             MatchSlot(id=6, match_id=1, side='b', position='defesa', state='aberta', opened_at=NOW - HOUR)]
    first, second = make_search(3, kind='avulso', user_id=GUEST), make_search(4, kind='avulso', user_id=ACTOR)
    db.on('match_sides', sides).on('match_slots', slots).on('standings', []).on('teams', 'Time')
    db.then('match_searches', [first], first, [second], second)
    pairings = queue.offer_slots(db, match, now=NOW)
    assert [(item.slot.id, item.searches[0].id) for item in pairings] == [(5, 3), (6, 4)]
    assert [slot.state for slot in slots] == ['oferecida', 'oferecida']
    # Nothing is offered for a match that is not scheduled, started, or is tennis.
    for other in (make_match(), make_match(state='agendada', starts_at=NOW - HOUR), make_match(sport='tenis')):
        assert queue.offer_slots(db, other, now=NOW) == []


# ----- Proposals ----------------------------------------------------------------------------------------------

def test_the_first_acceptance_tells_the_other_side_and_the_second_opens_the_match(db, queue):
    match, sides = make_match(), proposal_sides()
    db.on('match_sides', sides)
    searches = [make_search(10, team_id=1, state='pareada', match_id=1), make_search(11, team_id=2, state='pareada',
                                                                                    match_id=1)]
    db.on('match_searches', searches)
    assert queue.accept_proposal(db, match, 'a', user(REP_A), now=NOW) is False
    assert (sides[0].accepted_at, sides[0].accepted_by_id, match.state) == (NOW, REP_A, 'proposta')
    [notice] = kinds(db, Notification)
    assert (notice.user_id, notice.payload['complete'], notice.payload['opponent_name']) == (
        REP_B, False, 'Ferrugem FC')
    assert queue.accept_proposal(db, match, 'a', user(REP_A), now=NOW) is False          # idempotent for the side
    assert len(kinds(db, Notification)) == 1
    db.on('team_members', [(1, REP_A), (1, 12), (2, REP_B)])
    assert queue.accept_proposal(db, match, 'b', user(REP_B), now=NOW) is True
    assert match.state == 'combinando' and [s.state for s in searches] == ['concluida', 'concluida']
    complete = [row for row in kinds(db, Notification) if row.payload['complete']]
    assert sorted(row.user_id for row in complete) == [REP_A, 12]          # the one who accepted is not told
    assert [row.event_type for row in kinds(db, MatchMessage)] == ['partida_combinando']
    assert [row.action for row in kinds(db, AuditLog)] == ['partida.proposta_aceita'] * 2


def test_a_proposal_that_is_not_open_cannot_be_answered(db, queue):
    for match in (make_match(state='combinando'), make_match(proposal_expires_at=NOW), make_match(proposal_expires_at=None)):
        with pytest.raises(TransitionError) as error:
            queue.accept_proposal(db, match, 'a', user(), now=NOW)
        assert str(error.value) == 'Esta proposta não está mais aberta.'
        with pytest.raises(TransitionError):
            queue.decline_proposal(db, match, 'a', user(), now=NOW)
    assert db.added == []


def test_declining_ends_the_search_of_who_declined_and_pairs_the_other_again(db, queue, monkeypatch):
    match, sides = make_match(), proposal_sides()
    searches = [make_search(10, team_id=1, state='pareada', match_id=1), make_search(11, team_id=2, state='pareada',
                                                                                    match_id=1)]
    db.on('match_sides', sides).on('match_searches', searches)
    tried = []
    monkeypatch.setattr(queue, 'try_match', lambda _db, search, *, now: tried.append(search.id) or 'pairing')
    assert queue.decline_proposal(db, match, 'b', user(REP_B), now=NOW) == ['pairing']
    assert (match.state, match.closed_at) == ('recusada', NOW)
    assert (searches[1].state, searches[1].ended_at, sides[1].declined_by_id) == ('recusada', NOW, REP_B)
    assert searches[0].state == 'ativa' and tried == [10]
    [notice] = kinds(db, Notification)
    assert (notice.user_id, notice.payload['reason'], notice.payload['requeued']) == (REP_A, 'recusada', True)
    assert kinds(db, AuditLog)[0].data == {'requeued_search_ids': [10], 'side': 'b'}


def test_an_expired_proposal_requeues_who_accepted_and_ends_who_did_not_answer(db, queue):
    match = make_match(proposal_expires_at=NOW - HOUR)
    sides = proposal_sides(a={'accepted_at': NOW - 2 * HOUR})
    searches = [make_search(10, team_id=1, state='pareada', match_id=1), make_search(11, team_id=2, state='pareada',
                                                                                    match_id=1)]
    db.on('match_sides', sides).on('match_searches', searches)
    requeued = queue.dissolve_proposal(db, match, outcome='expirada', now=NOW)
    assert requeued == [searches[0]] and (match.state, match.closed_at) == ('expirada', NOW)
    assert (searches[0].state, searches[1].state, searches[1].ended_at) == ('ativa', 'sem_resposta', NOW)
    reasons = {(row.user_id, row.payload['reason'], row.payload['requeued']) for row in kinds(db, Notification)}
    assert reasons == {(REP_A, 'expirada', True), (REP_B, 'expirada', False)}
    assert kinds(db, AuditLog)[0].data == {'requeued_search_ids': [10], 'automatico': True}
    assert db.statements[0] == 'advisory'                                  # the bucket is taken before the searches


# ----- Slot offers --------------------------------------------------------------------------------------------

def offer_scene(db):
    match = make_match(state='agendada', starts_at=NOW + DAY, proposal_expires_at=None)
    slot = MatchSlot(id=5, match_id=1, side='a', position='goleiro', state='oferecida', opened_at=NOW - HOUR)
    search = make_search(3, kind='avulso', user_id=GUEST, state='pareada', slot_id=5, offer_expires_at=NOW + HOUR)
    db.put(MatchSlot, slot)
    db.on('match_sides', MatchSide(id=1, match_id=1, side='a', team_id=1))
    return match, slot, search


def test_quero_jogar_fills_the_slot_and_puts_the_walkin_in_the_lineup(db, queue):
    match, slot, search = offer_scene(db)
    db.then('match_searches', search, search).on('matches', match).on('match_slots', slot)
    lineup = queue.accept_offer(db, 5, user(GUEST), now=NOW)
    assert isinstance(lineup, MatchLineup) and (lineup.guest, lineup.side, lineup.position, lineup.team_id) == (
        True, 'a', 'goleiro', 1)
    assert (slot.state, slot.filled_by_id, search.state, search.match_id) == ('preenchida', GUEST, 'concluida', 1)
    [notice] = kinds(db, Notification)
    assert (notice.type, notice.user_id, notice.actor_id) == ('vaga_preenchida', REP_A, GUEST)
    assert [row.event_type for row in kinds(db, MatchMessage)] == ['avulso_entrou']
    assert [row.action for row in kinds(db, AuditLog)] == ['vaga.preenchida']


def test_quero_jogar_refuses_what_is_no_longer_his(db, queue):
    match, slot, search = offer_scene(db)
    db.then('match_searches', None)
    assert queue.accept_offer(db, 5, user(GUEST), now=NOW) is None                  # not his offer
    cases = [(make_search(3, kind='avulso', user_id=GUEST, state='ativa', slot_id=5), slot, match, 'reservada'),
             (make_search(3, kind='avulso', user_id=GUEST, state='pareada', slot_id=5, offer_expires_at=NOW), slot,
              match, 'prazo'),
             (search, slot, make_match(state='cancelada', starts_at=NOW + DAY), 'não recebe'),
             (search, MatchSlot(id=5, match_id=1, side='a', position='goleiro', state='aberta'), match, 'reservada'),
             (search, slot, make_match(state='agendada', starts_at=NOW - HOUR, proposal_expires_at=None), 'não recebe')]
    for offered, held_slot, held_match, text in cases:
        db.then('match_searches', offered, offered).on('matches', held_match).on('match_slots', held_slot)
        with pytest.raises(TransitionError) as error:
            queue.accept_offer(db, 5, user(GUEST), now=NOW)
        assert text in str(error.value)
    assert db.added == []


def test_declining_ends_the_search_and_offers_the_slot_to_the_next(db, queue, monkeypatch):
    match, slot, search = offer_scene(db)
    db.put(Match, match)
    db.then('match_searches', search, search).on('match_slots', slot)
    offered = []
    monkeypatch.setattr(queue, 'offer_slots', lambda _db, held, *, now: offered.append(held.id) or [])
    assert queue.decline_offer(db, 5, user(GUEST), now=NOW) is True
    assert (search.state, search.ended_at, slot.state) == ('recusada', NOW, 'aberta') and offered == [1]
    assert [row.action for row in kinds(db, AuditLog)] == ['vaga.oferta_recusada']
    assert kinds(db, AuditLog)[0].actor_id == GUEST
    db.then('match_searches', None)
    assert queue.decline_offer(db, 5, user(GUEST), now=NOW) is False
    db.then('match_searches', search, make_search(3, kind='avulso', user_id=GUEST, state='ativa'))
    with pytest.raises(TransitionError):
        queue.decline_offer(db, 5, user(GUEST), now=NOW)


@pytest.mark.parametrize(('outcome', 'state', 'slot_after', 'action'), [
    ('recusada', 'recusada', 'aberta', 'vaga.oferta_recusada'),
    ('sem_resposta', 'sem_resposta', 'aberta', 'vaga.oferta_sem_resposta'),
    ('devolvida', 'ativa', 'oferecida', 'vaga.oferta_devolvida')])
def test_a_released_offer_ends_or_returns_the_search(db, queue, outcome, state, slot_after, action):
    _, slot, search = offer_scene(db)
    db.then('teams', 'Ferrugem FC')
    queue.release_offer(db, search, slot, outcome=outcome, now=NOW, actor_id=None)
    assert (search.state, slot.state) == (state, slot_after)
    assert [row.action for row in kinds(db, AuditLog)] == [action]
    assert kinds(db, AuditLog)[0].data['automatico'] is True
    assert len(kinds(db, Notification)) == (1 if outcome == 'devolvida' else 0)


# ----- Expiry (sweep) -----------------------------------------------------------------------------------------

def test_searches_past_their_24_hours_expire_once(db, queue):
    rows = [make_search(1, team_id=1, expires_at=NOW - HOUR), make_search(2, team_id=2, expires_at=NOW)]
    db.on('match_searches', rows)
    assert queue.expire_searches(db, NOW) == 2
    assert [(row.state, row.ended_at) for row in rows] == [('expirada', NOW)] * 2
    assert [row.action for row in kinds(db, AuditLog)] == ['busca.expirada'] * 2


def test_the_sweep_ends_lapsed_proposals_one_at_a_time_with_a_commit_each(db, queue, monkeypatch):
    first, second = make_match(id=1, proposal_expires_at=NOW - HOUR), make_match(id=2, proposal_expires_at=NOW - HOUR)
    still_open = make_match(id=3, proposal_expires_at=NOW + HOUR)
    searches = [make_search(10, team_id=1, state='pareada', match_id=1), make_search(11, team_id=2, state='pareada',
                                                                                    match_id=1)]
    db.then('matches', [1, 2, 3, 4], first, second, still_open, None)
    db.on('match_sides', proposal_sides(a={'accepted_at': NOW - 2 * HOUR})).on('match_searches', searches)
    tried, commits = [], []
    monkeypatch.setattr(queue, 'try_match', lambda _db, search, *, now: tried.append(search.id))
    assert queue.expire_proposals(db, NOW, commit=lambda: commits.append(1)) == 2
    assert (first.state, second.state, still_open.state) == ('expirada', 'expirada', 'proposta')
    assert len(commits) == 2 and tried == [10]


def test_the_sweep_releases_lapsed_offers_bucket_by_bucket(db, queue, monkeypatch):
    _, slot, search = offer_scene(db)
    search.offer_expires_at = NOW - HOUR
    other = make_search(4, kind='avulso', user_id=ACTOR, state='pareada', slot_id=5, offer_expires_at=NOW + HOUR,
                        city_id=1)
    db.then('match_searches', [(3, 5, 1), (4, 5, 1)], search, other)
    db.then('match_slots', slot, slot)
    db.put(Match, make_match(id=1))
    offered, commits = [], []
    monkeypatch.setattr(queue, 'offer_slots', lambda _db, held, *, now: offered.append(held.id) or [])
    assert queue.expire_offers(db, NOW, commit=lambda: commits.append(1)) == 1
    assert (search.state, slot.state, other.state) == ('sem_resposta', 'aberta', 'pareada')
    assert offered == [1] and commits == [1]
    assert [row.action for row in kinds(db, AuditLog)] == ['vaga.oferta_sem_resposta']


def test_the_expiry_summary_counts_each_kind(db, queue, monkeypatch):
    monkeypatch.setattr(queue, 'expire_searches', lambda _db, now: 2)
    monkeypatch.setattr(queue, 'expire_proposals', lambda _db, now: 1)
    monkeypatch.setattr(queue, 'expire_offers', lambda _db, now: 3)
    assert queue.expire(db, NOW) == {'buscas': 2, 'propostas': 1, 'ofertas': 3}


def test_rematch_tries_every_waiting_search_bucket_by_bucket(db, queue, monkeypatch):
    first, second, tennis = make_search(1, team_id=1), make_search(2, team_id=2), make_search(3, kind='tenis', user_id=51)
    for row in (first, second, tennis):
        db.put(MatchSearch, row)
    db.then('match_searches', [('time', 1, 'society'), ('tenis', 1, None)], [3], [1, 2])       # tennis sorts first
    paired, commits = [], []
    monkeypatch.setattr(queue, 'try_match', lambda _db, search, *, now: paired.append(search.id) or (
        'pairing' if search.id == 1 else None))
    assert queue.rematch(db, NOW, commit=lambda: commits.append(1)) == 1
    assert paired == [3, 1, 2] and len(commits) == 2

"""`match_views.permissions_for` e as rotas dizem o mesmo: cada permissão do detalhe é verdadeira exatamente quando a
rota correspondente aceita a ação (etapa 3, contrato 0002 seções 8 e 10).

Para cada ação, cada papel (representante e membro de cada lado, avulso, administração) lê o detalhe, executa a
rota numa partida nova e o teste compara a permissão lida com o resultado (2xx). Quem não tem acesso (404) não tem
permissão a comparar.
"""
import pytest

from app.models.matches import FootballStat, MatchLineup, MatchResult, MatchTerms
from tests.integration.match_helpers import add
from tests.integration.partida.helpers import (
    API,
    DAY,
    HOUR,
    NOW,
    accepted_terms,
    agreed_match,
    fill_slot,
    make_match,
)

ROLES = ('rep_a', 'member_a', 'rep_b', 'member_b', 'guest', 'admin')


def arranging(db, world):
    return make_match(db, 'combinando', [world['team_a'], world['team_b']])


def with_pending_terms(db, world):
    match = arranging(db, world)
    db.add(MatchTerms(match_id=match.id, proposed_by_id=world['rep_a'].id, proposed_by_side='a',
                      starts_at=NOW + 2 * DAY, court_id=world['court'].id, booking_side='a', state='pendente',
                      accepted_a_at=NOW, created_at=NOW))
    db.flush()
    return match


def scheduled(db, world):
    match = agreed_match(db, world, starts_at=NOW + 3 * DAY)
    fill_slot(db, match, world['guest'])
    return match


def scheduled_close(db, world):
    match = agreed_match(db, world, starts_at=NOW + 5 * HOUR)
    fill_slot(db, match, world['guest'])
    return match


def started(db, world):
    match = agreed_match(db, world, starts_at=NOW - HOUR)
    fill_slot(db, match, world['guest'])
    return match


def with_walkover(db, world):
    match = started(db, world)
    match.walkover_absent_side, match.walkover_registered_by_id = 'b', world['rep_a'].id
    match.walkover_registered_at = NOW - HOUR / 2
    db.flush()
    return match


def with_other_side_report(db, world):
    match = started(db, world)
    db.add(MatchResult(match_id=match.id, side='b', reported_by_id=world['rep_b'].id, score_a=0, score_b=1))
    db.flush()
    return match


ATHLETES = (('rep_a', 'a', 'team_a'), ('member_a', 'a', 'team_a'), ('rep_b', 'b', 'team_b'),
            ('member_b', 'b', 'team_b'), ('guest', 'b', 'team_b'))


def with_stats(db, world, *, state='enviada', contested=False, present=True):
    """A match in progress where every athlete has a lineup row and a stat in the given state (and contest)."""
    match = started(db, world)
    for name, side, team in ATHLETES:
        lineup = add(db, MatchLineup(match_id=match.id, side=side, user_id=world[name].id, team_id=world[team].id,
                                     guest=name == 'guest', position='defesa', present=present, created_at=NOW,
                                     updated_at=NOW))
        values = {}
        if contested:
            values = dict(contested_at=NOW, contested_by_id=world['rep_b' if side == 'a' else 'rep_a'].id,
                          contest_reason='Foram só dois.', contested_fields=['gols'])
        if state == 'revisada':
            values.update(reviewed_at=NOW, reviewed_by_id=world['rep_a' if side == 'a' else 'rep_b'].id)
        add(db, FootballStat(lineup_id=lineup.id, match_id=match.id, user_id=world[name].id, goals=2, state=state,
                             submitted_at=NOW, **values))
    return match


def stats_sent(db, world):
    return with_stats(db, world)


def stats_reviewed(db, world):
    return with_stats(db, world, state='revisada')


def stats_awaiting_review(db, world):
    return with_stats(db, world, state='contestada', contested=True)


def stats_final_review(db, world):
    return with_stats(db, world, state='revisada', contested=True)


def marked_absent(db, world):
    return with_stats(db, world, present=False)


def closed(db, world):
    match = make_match(db, 'cancelada', [world['team_a'], world['team_b']])
    return match


def tennis(db, world):
    match = make_match(db, 'combinando', [world['tenista_a'], world['tenista_b']], sport='tenis')
    return match


def tennis_scheduled(db, world):
    start = NOW + 3 * DAY
    match = make_match(db, 'agendada', [world['tenista_a'], world['tenista_b']], sport='tenis', starts_at=start,
                       court=world['tennis_court'], super_tiebreak=False)
    accepted_terms(db, match, world['tennis_court'], start, super_tiebreak=False)
    return match


def propose_body(world):
    return {'starts_at': (NOW + 4 * DAY).isoformat(), 'court_id': world['court'].id, 'booking_side': 'b'}


def propose(http, world, match, who):
    return http.post(f'{API}/matches/{match.id}/terms', json=propose_body(world), headers=world['h'][who])


def accept(http, world, match, who):
    terms = http.get(f'{API}/matches/{match.id}', headers=world['h']['rep_a']).json()['terms']['pending']
    return http.put(f"{API}/matches/{match.id}/terms/{terms['id']}/accept", json={}, headers=world['h'][who])


def booking(http, world, match, who):
    return http.put(f'{API}/matches/{match.id}/booking', json={'confirmed': True}, headers=world['h'][who])


def cancel(http, world, match, who):
    return http.post(f'{API}/matches/{match.id}/cancel', json={}, headers=world['h'][who])


def register(http, world, match, who):
    return http.post(f'{API}/matches/{match.id}/walkover', json={}, headers=world['h'][who])


def withdraw(http, world, match, who):
    return http.delete(f'{API}/matches/{match.id}/walkover', headers=world['h'][who])


def contest(http, world, match, who):
    return http.post(f'{API}/matches/{match.id}/walkover/contest', json={'reason': 'Estávamos lá.'},
                     headers=world['h'][who])


def my_stats(http, world, match, who):
    return http.put(f'{API}/matches/{match.id}/my-stats', json={'position': 'defesa', 'goals': 1},
                    headers=world['h'][who])


def suggest(http, world, match, who):
    return http.post(f'{API}/courts/suggestions', json={'match_id': match.id, 'name': f'Quadra de {who}'},
                     headers=world['h'][who])


def read_chat(http, world, match, who):
    return http.get(f'{API}/matches/{match.id}/messages', headers=world['h'][who])


def write_chat(http, world, match, who):
    return http.post(f'{API}/matches/{match.id}/messages', json={'body': 'Oi'}, headers=world['h'][who])


SCENARIOS = [
    ('propose_terms', arranging, propose), ('propose_terms', scheduled, propose),
    ('propose_terms', scheduled_close, propose), ('propose_terms', started, propose), ('propose_terms', closed, propose),
    ('accept_terms', with_pending_terms, accept),
    ('suggest_court', arranging, suggest), ('suggest_court', scheduled, suggest), ('suggest_court', started, suggest),
    ('suggest_court', closed, suggest),
    ('confirm_booking', scheduled, booking), ('confirm_booking', started, booking), ('confirm_booking', arranging, booking),
    ('cancel', arranging, cancel), ('cancel', scheduled, cancel), ('cancel', scheduled_close, cancel),
    ('cancel', started, cancel), ('cancel', closed, cancel),
    ('register_walkover', started, register), ('register_walkover', scheduled, register),
    ('register_walkover', with_walkover, register), ('register_walkover', with_other_side_report, register),
    ('withdraw_walkover', with_walkover, withdraw), ('withdraw_walkover', started, withdraw),
    ('contest_walkover', with_walkover, contest), ('contest_walkover', started, contest),
    ('send_stats', started, my_stats), ('send_stats', scheduled, my_stats), ('send_stats', with_walkover, my_stats),
    ('send_stats', closed, my_stats), ('send_stats', stats_sent, my_stats), ('send_stats', stats_reviewed, my_stats),
    ('send_stats', stats_awaiting_review, my_stats), ('send_stats', stats_final_review, my_stats),
    ('send_stats', marked_absent, my_stats),
    ('read_chat', arranging, read_chat), ('read_chat', scheduled, read_chat), ('read_chat', closed, read_chat),
    ('write_chat', arranging, write_chat), ('write_chat', scheduled, write_chat), ('write_chat', closed, write_chat),
]


@pytest.mark.parametrize(('permission', 'build', 'call'), SCENARIOS,
                         ids=[f'{permission}-{build.__name__}' for permission, build, _ in SCENARIOS])
def test_each_permission_is_true_exactly_when_the_route_accepts(client, world, clock, permission, build, call):
    http, db = client
    checked = 0
    for who in ROLES:
        match = build(db, world)
        detail = http.get(f'{API}/matches/{match.id}', headers=world['h'][who])
        if detail.status_code == 404:
            assert call(http, world, match, who).status_code == 404, who
            continue
        allowed = detail.json()['permissions'][permission]
        response = call(http, world, match, who)
        if permission == 'accept_terms' and who == 'rep_a':
            # The proposer already accepted by proposing: accepting again is an idempotent no-op (200), not an action.
            assert not allowed and response.status_code == 200 and response.json()['state'] == 'combinando'
            checked += 1
            continue
        assert (200 <= response.status_code < 300) == allowed, (
            permission, build.__name__, who, allowed, response.status_code, response.text)
        checked += 1
    assert checked >= 4


@pytest.mark.parametrize('permission', ['propose_terms', 'accept_terms', 'confirm_booking', 'cancel',
                                        'register_walkover', 'withdraw_walkover', 'contest_walkover'])
def test_tennis_athletes_have_the_same_permissions_as_representatives(client, world, clock, permission):
    http, db = client
    if permission == 'accept_terms':
        match = tennis(db, world)
        db.add(MatchTerms(match_id=match.id, proposed_by_id=world['tenista_a'].id, proposed_by_side='a',
                          starts_at=NOW + 2 * DAY, court_id=world['tennis_court'].id, booking_side='a',
                          state='pendente', accepted_a_at=NOW, created_at=NOW))
        db.flush()
    elif permission in ('propose_terms',):
        match = tennis(db, world)
    elif permission in ('confirm_booking', 'cancel'):
        match = tennis_scheduled(db, world)
    else:
        match = tennis_scheduled(db, world)
        match.starts_at = NOW - HOUR
        match.result_deadline = NOW + 47 * HOUR
        if permission != 'register_walkover':
            match.walkover_absent_side, match.walkover_registered_by_id = 'b', world['tenista_a'].id
            match.walkover_registered_at = NOW
        db.flush()
    flags = {who: http.get(f'{API}/matches/{match.id}', headers=world['h'][who]).json()['permissions'][permission]
             for who in ('tenista_a', 'tenista_b')}
    expected = {'propose_terms': {'tenista_a': True, 'tenista_b': True},
                'accept_terms': {'tenista_a': False, 'tenista_b': True},
                'confirm_booking': {'tenista_a': True, 'tenista_b': False},
                'cancel': {'tenista_a': True, 'tenista_b': True},
                'register_walkover': {'tenista_a': True, 'tenista_b': True},
                'withdraw_walkover': {'tenista_a': True, 'tenista_b': False},
                'contest_walkover': {'tenista_a': False, 'tenista_b': True}}[permission]
    assert flags == expected

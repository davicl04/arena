"""Helpers of the championship tests (fases 6 e 7): the event is created, published and entered through the real
routes of the organizer and the athlete; only what the routes cannot do (closing the registrations in the past,
a moving clock) is done on the database or on the routers' clock.
"""
from datetime import timedelta

from sqlalchemy import select

from app.models.events import Event
from app.models.identity import utcnow
from app.models.matches import Match, MatchSide
from app.models.organizers import Organizer
from app.services.sweep import run_sweep
from tests.integration.match_helpers import CITY
from tests.integration.partida.helpers import make_court
from tests.integration.team_helpers import create_team, register

API = '/api/v1'
SOCIETY = {'sport': 'futebol', 'format': 'society', 'competition_type': 'eliminacao_simples', 'capacity': 8,
           'accepted_tiers': None, 'city_id': CITY, 'venue': 'Arena Sudoeste', 'price_cents': 0}
TENNIS = {'sport': 'tenis', 'competition_type': 'eliminacao_simples', 'capacity': 8, 'accepted_tiers': None,
          'city_id': CITY, 'venue': 'Clube do Lago', 'price_cents': 0}


class Clock:
    """The moment the routers use; real time until a test sets one."""

    def __init__(self):
        self.moment = None

    def __call__(self):
        return self.moment or utcnow()

    def set(self, moment):
        self.moment = moment


def install_clock(monkeypatch) -> Clock:
    clock = Clock()
    for path in ('app.routers.results.utcnow', 'app.routers.brackets.utcnow', 'app.routers.matches.utcnow'):
        monkeypatch.setattr(path, clock)
    return clock


def new_organizer(http, db, label='organiza'):
    headers, user_id = register(http, f'{label}@example.com', f'Organizador {label.title()}')
    db.add(Organizer(user_id=user_id, display_name='Liga do Cerrado', approved_at=utcnow()))
    db.commit()
    return headers, user_id


def publish_event(http, headers, **body) -> int:
    """A free event, published by the organizer's routes (create, then submit)."""
    moment = utcnow().replace(microsecond=0)
    payload = {'name': 'Copa do Lago', **SOCIETY, 'starts_at': (moment + timedelta(days=10)).isoformat(),
               'registration_closes_at': (moment + timedelta(days=7)).isoformat(), **body}
    created = http.post(f'{API}/organizer/events', json=payload, headers=headers)
    assert created.status_code == 201, created.text
    event_id = created.json()['id']
    submitted = http.post(f'{API}/organizer/events/{event_id}/submit', json={}, headers=headers)
    assert submitted.status_code == 200 and submitted.json()['state'] == 'publicado', submitted.text
    return event_id


def enroll_team(http, label, event_id, name=None) -> dict:
    """A representative with a team that enters the event (free: confirmed at once)."""
    headers, user_id = register(http, f'{label}@example.com', f'Atleta {label.title()}')
    team = create_team(http, headers, name or f'Time {label.title()}')
    entered = http.post(f'{API}/events/{event_id}/entries', json={'team_id': team['id']}, headers=headers)
    assert entered.status_code == 201 and entered.json()['state'] == 'confirmada', entered.text
    return {'headers': headers, 'user_id': user_id, 'team_id': team['id'], 'entry_id': entered.json()['id'],
            'name': team['name']}


def enroll_athlete(http, label, event_id) -> dict:
    headers, user_id = register(http, f'{label}@example.com', f'Tenista {label.title()}')
    entered = http.post(f'{API}/events/{event_id}/entries', json={}, headers=headers)
    assert entered.status_code == 201 and entered.json()['state'] == 'confirmada', entered.text
    return {'headers': headers, 'user_id': user_id, 'entry_id': entered.json()['id'], 'name': f'Tenista {label.title()}'}


def close_registrations(db, event_id) -> None:
    """The registration deadline passes (the routes only create events with future dates)."""
    event = db.get(Event, event_id)
    event.registration_closes_at = utcnow() - timedelta(hours=1)
    db.commit()


def organizer_with_teams(http, db, count, **event) -> dict:
    """A published football event with `count` confirmed teams and the registrations closed."""
    headers, owner_id = new_organizer(http, db)
    event_id = publish_event(http, headers, **event)
    teams = [enroll_team(http, f'time{index}', event_id) for index in range(1, count + 1)]
    close_registrations(db, event_id)
    return {'organizer': headers, 'owner_id': owner_id, 'event_id': event_id, 'teams': teams,
            'court': make_court(db, 'Quadra Central')}


def draw(http, world, expected=200):
    response = http.post(f'{API}/organizer/events/{world["event_id"]}/bracket', json={}, headers=world['organizer'])
    assert response.status_code == expected, response.text
    return response.json()


def confirm(http, world, expected=200):
    response = http.post(f'{API}/organizer/events/{world["event_id"]}/bracket/confirm', json={},
                         headers=world['organizer'])
    assert response.status_code == expected, response.text
    return response.json()


def bracket(http, headers, event_id, expected=200):
    response = http.get(f'{API}/events/{event_id}/bracket', headers=headers)
    assert response.status_code == expected, response.text
    return response.json()


def event_matches(http, world):
    response = http.get(f'{API}/organizer/events/{world["event_id"]}/matches', headers=world['organizer'])
    assert response.status_code == 200, response.text
    return response.json()


def schedule(http, world, match_id, starts_at, court_id=None, expected=200, **body):
    payload = {'starts_at': starts_at.isoformat(), 'court_id': court_id if court_id is not None else world['court'].id,
               **body}
    response = http.put(f'{API}/organizer/matches/{match_id}/schedule', json=payload, headers=world['organizer'])
    assert response.status_code == expected, response.text
    return response.json()


def team_matches(db, event_id):
    """{match id: {side: team id}} of the event's matches."""
    result = {}
    for match in db.scalars(select(Match).where(Match.event_id == event_id).order_by(Match.id)):
        sides = db.scalars(select(MatchSide).where(MatchSide.match_id == match.id)).all()
        result[match.id] = {side.side: side.team_id or side.user_id for side in sides}
    return result


def reporter(world, subject_id):
    """Headers of the representative of a team (or the athlete) of the world."""
    return next(item['headers'] for item in world['teams'] if item.get('team_id', item['user_id']) == subject_id)


def put_result(http, headers, match_id, goals_a=None, goals_b=None, expected=200, **body):
    if goals_a is not None:
        body.update(goals_a=goals_a, goals_b=goals_b)
    response = http.put(f'{API}/matches/{match_id}/result', json=body, headers=headers)
    assert response.status_code == expected, response.text
    return response.json()


def sweep(db, moment):
    report = run_sweep(db, moment)
    db.commit()
    return report


def organizer_with_athletes(http, db, count, **event) -> dict:
    """A published tennis event with `count` confirmed players and the registrations closed."""
    headers, owner_id = new_organizer(http, db)
    event_id = publish_event(http, headers, **{**TENNIS, 'format': None, **event})
    players = [enroll_athlete(http, f'tenista{index}', event_id) for index in range(1, count + 1)]
    close_registrations(db, event_id)
    return {'organizer': headers, 'owner_id': owner_id, 'event_id': event_id, 'teams': players,
            'court': make_court(db, 'Quadra de Saibro', kind='tenis')}


def confirmed_world(http, db, count=4, athletes=False, **event) -> dict:
    """Draw and confirm: the matches exist, none scheduled."""
    world = (organizer_with_athletes if athletes else organizer_with_teams)(http, db, count, **event)
    draw(http, world)
    confirm(http, world)
    return world


def kickoff(offset_days=3):
    """A start time in the future, on the hour."""
    return (utcnow() + timedelta(days=offset_days)).replace(minute=0, second=0, microsecond=0)


def schedule_round(http, world, round_number, first, step=timedelta(hours=3)):
    """Schedules every match of a round that has both sides, `step` apart on the same court; returns {id: start}."""
    starts, moment = {}, first
    for item in event_matches(http, world)['items']:
        if item['round_number'] == round_number and item['can_schedule']:
            schedule(http, world, item['card']['id'], moment)
            starts[item['card']['id']] = moment
            moment += step
    return starts


def sides_of(db, world, match_id):
    return team_matches(db, world['event_id'])[match_id]


def agree(http, db, world, match_id, goals_a=None, goals_b=None, sets=None):
    """Both sides inform the same score: the match is confirmed ('realizada')."""
    sides = sides_of(db, world, match_id)
    body = {'sets': sets} if sets else {'goals_a': goals_a, 'goals_b': goals_b}
    for label in ('a', 'b'):
        response = http.put(f'{API}/matches/{match_id}/result', json=body, headers=reporter(world, sides[label]))
        assert response.status_code == 200, response.text
    return response.json()


def diverge(http, db, world, match_id, a, b):
    """Side A reports `a` and side B reports `b` (goals): a divergence."""
    sides = sides_of(db, world, match_id)
    for label, (goals_a, goals_b) in (('a', a), ('b', b)):
        put_result(http, reporter(world, sides[label]), match_id, goals_a, goals_b)


def decide(http, world, match_id, expected=201, headers=None, **body):
    response = http.post(f'{API}/organizer/matches/{match_id}/result-decision', json=body,
                         headers=headers or world['organizer'])
    assert response.status_code == expected, response.text
    return response.json()

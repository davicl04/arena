"""Fixtures of the partida front: a fixed clock for the routes and a world of teams, players and courts."""
import pytest

from tests.integration.match_helpers import NOW, make_team, make_user
from tests.integration.partida.helpers import login, make_court


@pytest.fixture
def clock(monkeypatch):
    state = {'now': NOW}
    for module in ('matches', 'courts', 'results'):
        monkeypatch.setattr(f'app.routers.{module}.utcnow', lambda: state['now'])
    return state


@pytest.fixture
def world(client):
    """Two football teams (representative and member each), a walk-in, a stranger, an administrator, two tennis
    players, a published court of each kind and a logged-in header per person."""
    db = client[1]
    people = {name: make_user(db, name) for name in ('rep_a', 'member_a', 'rep_b', 'member_b', 'guest', 'stranger',
                                                    'tenista_a', 'tenista_b')}
    people['admin'] = make_user(db, 'admin', admin=True)
    team_a = make_team(db, people['rep_a'], people['member_a'], name='Ferrugem FC')
    team_b = make_team(db, people['rep_b'], people['member_b'], name='Tigres do Lago')
    headers = {name: login(db, user) for name, user in people.items()}
    return {**people, 'team_a': team_a, 'team_b': team_b, 'court': make_court(db),
            'tennis_court': make_court(db, 'Saibro Norte', kind='tenis'), 'h': headers}



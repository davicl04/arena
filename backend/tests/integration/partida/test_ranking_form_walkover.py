"""Recent form of the rankings after the W.O. paths (Ranking screen): an uncontested W.O. closed by the deadline and
the administration's decision on a contested one write the form of both teams in the same transaction; an annulled
one writes nothing. The W.O. flow itself is in `test_walkover_flow.py`."""
from sqlalchemy import select

from app.models.rankings import Standing
from app.services.match_lifecycle import close_due_results
from tests.integration.partida.helpers import HOUR
from tests.integration.partida.test_walkover_flow import decide, disputed, register, started


def forms(db, *teams):
    rows = {row.team_id: row.recent_form for row in db.scalars(select(Standing).where(Standing.team_id.is_not(None)))}
    return [rows.get(team.id) for team in teams]


def test_an_uncontested_walkover_closed_by_the_deadline_gives_the_showing_side_a_win(client, world, clock):
    http, db = client
    match = started(db, world)
    assert register(http, world, match).status_code == 200
    assert forms(db, world['team_a'], world['team_b']) == [None, None]            # nothing counts while it can be contested
    assert close_due_results(db, match.result_deadline + HOUR) == 1
    assert forms(db, world['team_a'], world['team_b']) == ['V', 'D']


def test_the_administration_keeping_a_contested_walkover_writes_the_form(client, world, clock):
    http, db = client
    match = disputed(http, db, world)
    assert forms(db, world['team_a'], world['team_b']) == [None, None]            # contested: no result yet
    assert decide(http, world, match).status_code == 200
    assert forms(db, world['team_a'], world['team_b']) == ['V', 'D']


def test_an_annulled_walkover_writes_no_form(client, world, clock):
    http, db = client
    match = disputed(http, db, world)
    assert decide(http, world, match, 'anular', 'Os dois lados estavam na quadra errada.').status_code == 200
    assert forms(db, world['team_a'], world['team_b']) == [None, None]

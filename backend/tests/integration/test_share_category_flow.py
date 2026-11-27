"""Elo bar of the result sticker on PostgreSQL: the `category` of `GET /me/share/matches/{id}` and
`GET /me/share/runs/{id}` (decision 0007, section 5). The category of the activity is resolved from the match (tennis;
football by the owner's position in the lineup or, without one, the owner's team in the format) or from the run's
standard distance, and the line is the current one of the Ranking screen: same tier, place inside it and size.

Most rankings are written straight to `standings` (a controlled layout of tiers over the cuts of calc_version 2:
rating 950/1050/1150, adjusted mean 2.6/3.9/5.2, 5 km 35:00/27:00/22:00, Lendário 15%); the last tests go through
the real recalculation."""
from datetime import timedelta
from decimal import Decimal

from app.models.rankings import Standing
from app.services.standings import RankingKey, recalculate_rankings
from tests.integration.match_helpers import NOW, add, make_user
from tests.integration.profile_helpers import football, join, new_team, tennis
from tests.integration.result_helpers import DAY, lineup, login
from tests.integration.run_helpers import TODAY, mark

API = '/api/v1'
CATEGORY_KEYS = {'ranking', 'state', 'tier', 'tier_position', 'tier_size', 'played', 'required', 'progress',
                 'next_tier', 'gap'}
# Society team ranking by rating, ranks 1 to 10: 10 classified give floor(1.5) = 1 Lendário slot.
TEAM_LAYOUT = [('lendario', '1260'), ('diamante', '1180'), ('ouro', '1100'), ('ouro', '1079.839'), ('prata', '1000'),
               ('prata', '960'), ('prata', '950'), ('bronze', '920.161'), ('bronze', '900'), ('bronze', '800')]


def standing(db, *, rank, tier, value, played=5, team=None, user=None, sport='futebol', fmt='society', position=None,
             distance_km=None):
    return add(db, Standing(
        team_id=team.id if team else None, user_id=user.id if user else None, sport=sport,
        format=fmt if sport == 'futebol' else None, position=position, distance_km=distance_km,
        metric_value=Decimal(value), matches_played=played, wins=0, draws=0, losses=0, goals_for=0, goals_against=0,
        rank_position=rank if tier else None, tier=tier, calc_version=2, recent_form='',
        best_mark_on=TODAY if sport == 'corrida' else None))


def category_of(http, headers, path):
    response = http.get(f'{API}/me/share/{path}', headers=headers)
    assert response.status_code == 200, response.text
    category = response.json()['category']
    assert category is None or set(category) == CATEGORY_KEYS
    return category


def ranking_line(http, headers, query, team_id=None):
    """The line the Ranking screen shows for the same category (the plate of `GET /rankings/overview`)."""
    suffix = f'&team_id={team_id}' if team_id is not None else ''
    response = http.get(f'{API}/rankings/overview?{query}{suffix}', headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    return next(line for line in body['mine'] if team_id is None or line['team']['id'] == team_id)


def assert_same_as_ranking(category, line):
    assert (category['tier'], category['tier_position'], category['tier_size'], category['required']) == (
        line['tier'], line['tier_position'], line['tier_size'], line['required'])


# ----- Team ranking (rating): every tier, compared with the Ranking screen ------------------------------------------

def test_team_bar_by_rating_in_every_tier_matches_the_ranking_screen(client):
    http, db = client
    rival = new_team(db, 'Time Rival')
    owners = {}
    for rank, (tier, value) in enumerate(TEAM_LAYOUT, start=1):
        team = new_team(db, f'Time {rank}')
        owner = make_user(db, f'dono{rank}')
        join(db, team, owner)
        standing(db, rank=rank, tier=tier, value=value, team=team)
        # The owner has no lineup row: the bar falls back to the team in the format.
        owners[rank] = (owner, team, football(db, team, rival, 2, 1, starts_at=NOW - rank * DAY))
    expected = {
        1: ('lendario', 1, 1, 1.0, None, None),
        2: ('diamante', 1, 1, 0.2727, 'lendario', {'amount': 1.0, 'unit': 'posicoes'}),
        4: ('ouro', 2, 2, 0.2984, 'diamante', {'amount': 70.161, 'unit': 'rating'}),
        7: ('prata', 3, 3, 0.0, 'ouro', {'amount': 100.0, 'unit': 'rating'}),
        8: ('bronze', 1, 3, 0.7016, 'prata', {'amount': 29.839, 'unit': 'rating'}),
        10: ('bronze', 3, 3, 0.0, 'prata', {'amount': 150.0, 'unit': 'rating'}),
    }
    for rank, (tier, position, size, progress, next_tier, gap) in expected.items():
        owner, team, match = owners[rank]
        headers = login(db, owner)
        category = category_of(http, headers, f'matches/{match.id}')
        assert (category['ranking'], category['state'], category['played'], category['required']) == (
            'futebol_time', 'ranqueado', 5, 3)
        assert (category['tier'], category['tier_position'], category['tier_size'], category['progress'],
                category['next_tier'], category['gap']) == (tier, position, size, progress, next_tier, gap), rank
        assert_same_as_ranking(category, ranking_line(
            http, headers, 'sport=futebol&kind=time&format=society', team.id))


def test_football_with_a_lineup_but_no_position_uses_the_team_of_the_owner_in_the_format(client):
    http, db = client
    owner = make_user(db, 'dono')
    team, rival = new_team(db, 'Time Dono'), new_team(db, 'Time Rival')
    join(db, team, owner)
    standing(db, rank=1, tier='prata', value='1000', team=team, fmt='futsal')
    match = football(db, rival, team, 0, 1, format_='futsal')
    lineup(db, match, owner, 'b', None, present=True, team_id=team.id)
    # A row of the owner in an individual ranking of another format does not matter.
    standing(db, rank=1, tier='ouro', value='4.0', user=owner, fmt='society', position='atacante')
    category = category_of(http, login(db, owner), f'matches/{match.id}')
    assert (category['ranking'], category['tier'], category['tier_position'], category['progress'],
            category['gap']) == ('futebol_time', 'prata', 1, 0.5, {'amount': 50.0, 'unit': 'rating'})


# ----- Individual ranking (adjusted mean) ---------------------------------------------------------------------------

def test_football_with_a_position_uses_the_individual_ranking_and_its_adjusted_mean(client):
    http, db = client
    owner, other = make_user(db, 'dono'), make_user(db, 'outro')
    team, rival = new_team(db, 'Time Dono'), new_team(db, 'Time Rival')
    join(db, team, owner)
    standing(db, rank=1, tier='prata', value='3.25', user=owner, position='atacante')
    standing(db, rank=2, tier='bronze', value='2.0', user=other, position='atacante')
    standing(db, rank=1, tier='diamante', value='1300', team=team)      # the team ranking is not the bar here
    match = football(db, team, rival, 3, 1)
    lineup(db, match, owner, 'a', 'atacante', present=True, team_id=team.id)
    headers = login(db, owner)
    category = category_of(http, headers, f'matches/{match.id}')
    assert category == {'ranking': 'futebol_individual', 'state': 'ranqueado', 'tier': 'prata', 'tier_position': 1,
                        'tier_size': 1, 'played': 5, 'required': 3, 'progress': 0.5, 'next_tier': 'ouro',
                        'gap': {'amount': 0.65, 'unit': 'media'}}
    assert_same_as_ranking(category, ranking_line(
        http, headers, 'sport=futebol&kind=individual&format=society&position=atacante'))
    # The Bronze of the same ranking starts at the floor 1.3 (one Prata width below 2.6).
    second = football(db, team, rival, 1, 0, starts_at=NOW - 3 * DAY)
    join(db, team, other)
    lineup(db, second, other, 'a', 'atacante', present=True, team_id=team.id)
    bronze = category_of(http, login(db, other), f'matches/{second.id}')
    assert (bronze['tier'], bronze['progress'], bronze['gap']) == ('bronze', 0.5385, {'amount': 0.6, 'unit': 'media'})


def test_individual_placement_shows_only_played_of_required(client):
    http, db = client
    owner = make_user(db, 'dono')
    team, rival = new_team(db, 'Time Dono'), new_team(db, 'Time Rival')
    join(db, team, owner)
    standing(db, rank=None, tier=None, value='4.5', played=2, user=owner, position='goleiro', fmt='campo')
    match = football(db, team, rival, 0, 0, format_='campo')
    lineup(db, match, owner, 'a', 'goleiro', present=True, team_id=team.id)
    category = category_of(http, login(db, owner), f'matches/{match.id}')
    assert category == {'ranking': 'futebol_individual', 'state': 'classificacao', 'tier': None,
                        'tier_position': None, 'tier_size': None, 'played': 2, 'required': 3, 'progress': 0.6667,
                        'next_tier': None, 'gap': None}


# ----- Tennis (rating): Diamante without Lendário slots and placement -----------------------------------------------

def test_diamante_without_lendario_slots_is_full_without_distance(client):
    http, db = client
    owner, second, third = make_user(db, 'dono'), make_user(db, 'segundo'), make_user(db, 'terceiro')
    # 3 classified at 15%: no Lendário slot.
    standing(db, rank=1, tier='diamante', value='1210', sport='tenis', user=owner)
    standing(db, rank=2, tier='ouro', value='1060', sport='tenis', user=second)
    standing(db, rank=3, tier='bronze', value='900', sport='tenis', user=third)
    match = tennis(db, owner, second)
    headers = login(db, owner)
    category = category_of(http, headers, f'matches/{match.id}')
    assert (category['ranking'], category['tier'], category['tier_position'], category['tier_size'],
            category['progress'], category['next_tier'], category['gap']) == (
        'tenis', 'diamante', 1, 1, 1.0, 'lendario', None)
    assert_same_as_ranking(category, ranking_line(http, headers, 'sport=tenis'))


def test_tennis_placement_never_exposes_the_rating(client):
    http, db = client
    owner, rival = make_user(db, 'dono'), make_user(db, 'rival')
    standing(db, rank=None, tier=None, value='1023.494', played=2, sport='tenis', user=owner)
    match = tennis(db, owner, rival)
    response = http.get(f'{API}/me/share/matches/{match.id}', headers=login(db, owner))
    category = response.json()['category']
    assert category == {'ranking': 'tenis', 'state': 'classificacao', 'tier': None, 'tier_position': None,
                        'tier_size': None, 'played': 2, 'required': 3, 'progress': 0.6667, 'next_tier': None,
                        'gap': None}
    assert '1023' not in response.text
    # Without any row (no match in the window), the athlete is in placement with nothing played.
    empty = category_of(http, login(db, rival), f'matches/{match.id}')
    assert (empty['state'], empty['played'], empty['required'], empty['progress']) == ('classificacao', 0, 3, 0.0)


# ----- Running (lower is better) ------------------------------------------------------------------------------------

def test_running_bar_counts_seconds_downwards_and_a_free_distance_has_no_bar(client):
    http, db = client
    owner, faster = make_user(db, 'dono'), make_user(db, 'rapido')
    standing(db, rank=1, tier='ouro', value='1500', sport='corrida', distance_km=5, user=faster, played=1)
    standing(db, rank=2, tier='prata', value='1860', sport='corrida', distance_km=5, user=owner, played=3)
    run = mark(db, owner, duration_s=1900, ran_on=TODAY - timedelta(days=1))
    free = mark(db, owner, distance_m=7000, duration_s=2400, standard=None)
    headers = login(db, owner)
    category = category_of(http, headers, f'runs/{run.id}')
    assert category == {'ranking': 'corrida_5', 'state': 'ranqueado', 'tier': 'prata', 'tier_position': 1,
                        'tier_size': 1, 'played': 3, 'required': 1, 'progress': 0.5, 'next_tier': 'ouro',
                        'gap': {'amount': 240.0, 'unit': 'segundos'}}
    assert_same_as_ranking(category, ranking_line(http, headers, 'sport=corrida&distance_km=5'))
    assert category_of(http, headers, f'runs/{free.id}') is None


# ----- Real recalculation -------------------------------------------------------------------------------------------

def test_tennis_bar_after_the_real_recalculation_of_three_matches(client):
    http, db = client
    owner, rival = make_user(db, 'dono'), make_user(db, 'rival')
    matches = [tennis(db, owner, rival, starts_at=NOW - days * DAY) for days in (3, 2, 1)]
    recalculate_rankings(db, [RankingKey('tenis')], now=NOW)
    # Three wins over the same opponent at K 64: 1079.839 (Ouro) and 920.161 (Bronze), decision 0006, section 10.
    mine = category_of(http, login(db, owner), f'matches/{matches[-1].id}')
    assert (mine['tier'], mine['tier_position'], mine['tier_size'], mine['played'], mine['progress'], mine['gap']) == (
        'ouro', 1, 1, 3, 0.2984, {'amount': 70.161, 'unit': 'rating'})
    rival_headers = login(db, rival)
    theirs = category_of(http, rival_headers, f'matches/{matches[0].id}')
    assert (theirs['tier'], theirs['progress'], theirs['next_tier'], theirs['gap']) == (
        'bronze', 0.7016, 'prata', {'amount': 29.839, 'unit': 'rating'})
    assert_same_as_ranking(theirs, ranking_line(http, rival_headers, 'sport=tenis'))


def test_individual_bar_after_the_real_recalculation_uses_the_position_played(client):
    http, db = client
    position = 'defesa'
    owner = make_user(db, 'dono')
    team, rival = new_team(db, 'Time Dono'), new_team(db, 'Time Rival')
    join(db, team, owner)
    match = football(db, team, rival, 1, 0, starts_at=NOW - DAY)
    lineup(db, match, owner, 'a', position, present=True, team_id=team.id)
    recalculate_rankings(db, [RankingKey('futebol_individual', 'society', position)], now=NOW)
    category = category_of(http, login(db, owner), f'matches/{match.id}')
    assert (category['ranking'], category['state'], category['played'], category['required'], category['progress']) == (
        'futebol_individual', 'classificacao', 1, 3, 0.3333)

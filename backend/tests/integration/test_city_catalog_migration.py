"""Reversão do catálogo nacional (0015): só remove municípios sem referência e fora das seis cidades originais."""
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, inspect, select, text

from app.models.identity import City, SportsProfile
from app.models.teams import Team
from tests.integration.match_helpers import make_user

ORIGINAL_IDS = {5300108, 3550308, 3304557, 2304400, 3106200, 5208707}


def alembic_config(db):
    root = Path(__file__).resolve().parents[2]
    config = Config(str(root / 'alembic.ini'))
    config.set_main_option('script_location', str(root / 'migrations'))
    config.attributes['connection'] = db.connection()
    return config


def city_count(db):
    return db.execute(text('SELECT count(*) FROM cities')).scalar_one()


def test_downgrade_keeps_the_original_cities_and_their_links_then_upgrade_restores_the_catalog(client):
    _, db = client
    owner = make_user(db, 'catalog-down')
    profile = SportsProfile(user_id=owner.id, sport='futebol', city_id=5208707)
    team = Team(name='Cerrado FC', city_id=3550308, state='ativo')
    db.add_all([profile, team])
    db.flush()
    config = alembic_config(db)

    command.downgrade(config, '0014')
    assert city_count(db) == 6
    assert set(db.execute(text('SELECT id FROM cities')).scalars()) == ORIGINAL_IDS
    columns = {column['name'] for column in inspect(db.connection()).get_columns('cities')}
    assert columns == {'id', 'name', 'state'}
    assert db.execute(text('SELECT city_id FROM sports_profiles WHERE id = :id'), {'id': profile.id}).scalar_one() == 5208707
    assert db.execute(text('SELECT city_id FROM teams WHERE id = :id'), {'id': team.id}).scalar_one() == 3550308

    command.upgrade(config, 'head')
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(City)) == 5571
    goiania = db.get(City, 5208707)
    assert (goiania.name, goiania.state, goiania.capital, goiania.search_text) == ('Goiânia', 'GO', True, 'goiania go')
    assert db.get(SportsProfile, profile.id).city_id == 5208707


@pytest.mark.parametrize('link', ['profile', 'team'])
def test_downgrade_fails_without_deleting_when_a_new_city_is_referenced(client, link):
    _, db = client
    owner = make_user(db, 'catalog-ref')
    if link == 'profile':
        db.add(SportsProfile(user_id=owner.id, sport='tenis', city_id=1100015))
    else:
        db.add(Team(name='Oeste FC', city_id=1100015, state='ativo'))
    db.flush()

    with pytest.raises(RuntimeError, match='municípios fora do catálogo original estão em uso') as error:
        command.downgrade(alembic_config(db), '0014')
    assert '1100015' in str(error.value)
    assert city_count(db) == 5571
    assert 'search_text' in {column['name'] for column in inspect(db.connection()).get_columns('cities')}
    assert db.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == '0015'

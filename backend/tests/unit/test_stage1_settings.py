import base64
import hashlib
import hmac

import pytest
from pydantic import ValidationError

from app.core.config import DEV_TEAM_LINK_SECRET, Settings, get_settings
from app.main import is_upload
from app.models.teams import Team, team_initials
from app.services import team_links

PRODUCTION = {'environment': 'production', 'cookie_secure': True, 'public_web_url': 'https://arena.example.com',
              'team_link_secret': 's' * 40}


@pytest.mark.parametrize(('method', 'path', 'expected'), [
    ('PUT', '/api/v1/me/avatar', True), ('PUT', '/api/v1/me/cover', True), ('POST', '/api/v1/posts', True),
    ('PUT', '/api/v1/teams/12/crest', True), ('PUT', '/api/v1/teams/0/crest', True),
    ('DELETE', '/api/v1/me/avatar', False), ('GET', '/api/v1/posts', False), ('POST', '/api/v1/teams/12/crest', False),
    ('DELETE', '/api/v1/teams/12/crest', False), ('PUT', '/api/v1/teams/abc/crest', False),
    ('PUT', '/api/v1/teams/12/crest/extra', False), ('PUT', '/api/v1/teams//crest', False),
    ('PUT', '/api/v1/me/avatar/', False), ('POST', '/api/v1/posts/1/comments', False),
    ('PUT', '/api/v1/teams/١٢/crest', False),
])
def test_upload_patterns_match_whole_paths_and_methods(method, path, expected):
    assert is_upload(method, path) is expected


def test_development_defaults_for_public_url_and_link_secret():
    settings = Settings(_env_file=None, public_web_url='http://localhost:5173/', team_link_secret='  ')
    assert settings.public_web_url == 'http://localhost:5173'
    assert settings.team_link_secret == DEV_TEAM_LINK_SECRET
    assert Settings(_env_file=None, team_link_secret='curto').team_link_secret == 'curto'


def test_production_accepts_explicit_https_and_long_secret():
    settings = Settings(_env_file=None, **PRODUCTION)
    assert settings.team_link_secret == 's' * 40 and settings.public_web_url == 'https://arena.example.com'


@pytest.mark.parametrize('overrides', [
    {'team_link_secret': None}, {'team_link_secret': ''}, {'team_link_secret': 'x' * 31},
    {'team_link_secret': DEV_TEAM_LINK_SECRET}, {'public_web_url': 'http://arena.example.com'},
])
def test_production_requires_explicit_secret_and_https(overrides):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **(PRODUCTION | overrides))


@pytest.mark.parametrize('url', ['localhost:5173', 'ftp://arena.example.com', 'https://', 'https://a.com/?x=1',
                                 'https://a.com/#topo'])
def test_public_web_url_must_be_plain_http_address(url):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, public_web_url=url)


def test_team_link_token_is_hmac_of_team_and_nonce_and_only_its_hash_is_kept():
    secret = get_settings().team_link_secret.encode()
    token = team_links.token_for(7, 'nonce-a')
    expected = base64.urlsafe_b64encode(hmac.new(secret, b'arena-team-link:v1:7:nonce-a', hashlib.sha256).digest())
    assert token == expected.decode().rstrip('=') and team_links.TOKEN_RE.fullmatch(token)
    assert token != team_links.token_for(8, 'nonce-a') != team_links.token_for(7, 'nonce-b')
    assert team_links.token_hash(token) == hashlib.sha256(token.encode()).hexdigest()
    assert team_links.join_url(token) == f'{get_settings().public_web_url}/entrar/{token}'


def test_issue_replaces_nonce_and_current_token_resyncs_hash():
    team = Team(id=5, name='Ferrugem FC', state='ativo')
    first = team_links.issue(team)
    assert team.link_token_hash == team_links.token_hash(first) and team.link_generated_at is not None
    assert team_links.current_token(team) == (first, False)
    second = team_links.issue(team)
    assert second != first and team_links.current_token(team) == (second, False)
    team.link_token_hash = 'stale'
    assert team_links.current_token(team) == (second, True) and team.link_token_hash == team_links.token_hash(second)
    assert team_links.current_token(Team(id=6, name='Sem link', state='ativo')) == (None, False)


def test_find_team_rejects_malformed_tokens_without_querying():
    class Db:
        def scalar(self, _):
            raise AssertionError('malformed token must not reach the database')

    for token in ('', 'curto', 'x' * 44, '!' * 43):
        assert team_links.find_team(Db(), token) is None


def test_find_team_requires_current_hmac_for_the_stored_nonce():
    team = Team(id=9, name='Real Cerrado', state='ativo')
    token = team_links.issue(team)

    class Db:
        def scalar(self, _):
            return team

    assert team_links.find_team(Db(), token) is team
    team.link_nonce = team_links.new_nonce()
    assert team_links.find_team(Db(), token) is None


@pytest.mark.parametrize(('name', 'initials'), [
    ('Ferrugem FC', 'FF'), ('Amigos do Lago', 'AL'), ('Unidos do Guará', 'UG'), ('Leões do Cerrado', 'LC'),
    ('Ferrugem', 'FE'), ('Real  Cerrado', 'RC'), ('dos e das', 'DD'), ('água viva', 'ÁV'),
])
def test_team_initials_for_the_neutral_crest(name, initials):
    assert team_initials(name) == initials
    assert Team(id=1, name=name).initials == initials


def test_team_crest_url_is_versioned_by_media():
    assert Team(id=4, name='Sem brasão').crest_url is None
    team = Team(id=4, name='Com brasão', crest_media_id='9d1d1f43-7f2a-4c3d-8a5e-2f6b3f0f7a11')
    assert team.crest_url == '/api/v1/teams/4/crest?v=9d1d1f43-7f2a-4c3d-8a5e-2f6b3f0f7a11'


def test_current_admin_allows_only_administrators():
    from types import SimpleNamespace

    from fastapi import HTTPException

    from app.core.security import current_admin

    admin = SimpleNamespace(is_admin=True)
    assert current_admin(admin) is admin
    with pytest.raises(HTTPException) as error:
        current_admin(SimpleNamespace(is_admin=False))
    assert error.value.status_code == 403 and error.value.detail == 'Acesso administrativo necessário.'

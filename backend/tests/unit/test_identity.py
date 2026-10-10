from datetime import date
from unittest.mock import Mock

import pytest

from app.core.config import Settings
from app.services.identity import (
    RESERVED_USERNAMES,
    USERNAME_RE,
    free_usernames,
    generate_username,
    is_adult,
    normalize_email,
    normalize_username,
    username_candidates,
    username_slug,
)


@pytest.mark.parametrize(('birth', 'today', 'expected'), [
    (date(2008, 10, 9), date(2026, 10, 9), True),
    (date(2008, 10, 10), date(2026, 10, 9), False),
    (date(2009, 1, 1), date(2026, 10, 9), False),
    (date(2027, 1, 1), date(2026, 10, 9), False),
    (date(2008, 2, 29), date(2026, 2, 28), False),
    (date(2008, 2, 29), date(2026, 3, 1), True),
])
def test_calendar_age(birth, today, expected):
    assert is_adult(birth, today) is expected


def test_email_normalization():
    assert normalize_email('  Athlete@EXAMPLE.com  ') == 'athlete@example.com'


def test_production_requires_secure_cookie():
    with pytest.raises(ValueError):
        Settings(environment='production', cookie_secure=False)


@pytest.mark.parametrize(('value', 'valid'), [
    ('ana', True), ('joao.silva', True), ('corrida_10k', True), ('a' * 30, True),
    ('ab', False), ('a' * 31, False), ('.ana', False), ('ana.', False), ('ana..silva', False),
    ('Ana', False), ('ana silva', False), ('ana-silva', False), ('joão', False),
])
def test_username_format(value, valid):
    assert bool(USERNAME_RE.fullmatch(value)) is valid


def test_username_normalization_strips_at_sign_and_case():
    assert normalize_username('  @Joao.Silva ') == 'joao.silva'
    assert normalize_username('ana') == 'ana'


@pytest.mark.parametrize(('name', 'expected'), [
    ('João da Silva', 'joao.da.silva'),
    ('  Ana   Lúcia  ', 'ana.lucia'),
    ('Zé', 'ze.atleta'),
    ('!!!', 'atleta'),
    ('Maria-Clara O\'Neil', 'mariaclara.oneil'),
    ('Nome ' * 10, 'nome.nome.nome.nome.nome.nome'),
])
def test_username_slug_is_valid_and_accent_free(name, expected):
    slug = username_slug(name)
    assert slug == expected and USERNAME_RE.fullmatch(slug)


def test_username_candidates_keep_limit_and_never_end_with_dot():
    candidates = username_candidates('a' * 29 + 'b')
    assert next(candidates) == 'a' * 29 + 'b'
    assert next(candidates) == 'a' * 29 + '1'
    dotted = username_candidates('nome.nome.nome.nome.nome.nome')
    next(dotted)
    assert all(USERNAME_RE.fullmatch(next(dotted)) for _ in range(120))


def test_reserved_usernames_are_skipped_when_generating():
    db = Mock()
    db.scalars.return_value.all.return_value = ['arena1']
    assert 'arena' in RESERVED_USERNAMES
    assert generate_username(db, 'Arena') == 'arena2'
    assert free_usernames(db, 'arena', 2, exclude={'arena2'}) == ['arena3', 'arena4']


def test_generation_falls_back_to_random_suffix_when_all_candidates_are_taken(monkeypatch):
    from app.services import identity
    monkeypatch.setattr(identity, 'free_usernames', lambda *_: [])
    username = generate_username(Mock(), 'Atleta')
    assert username.startswith('atleta.') and USERNAME_RE.fullmatch(username)

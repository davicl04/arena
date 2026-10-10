import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.schemas.identity import ProfileInput, Register, UpdateUser


@pytest.mark.parametrize('payload', [{'name': ' '}, {'name': 'A'}, {'name': 'A' * 101}, {'name': 'Atleta', 'email': 'new@example.com'}])
def test_account_update_rejects_invalid_or_immutable_fields(payload):
    with pytest.raises(ValidationError):
        UpdateUser(**payload)


def test_account_update_trims_name():
    assert UpdateUser(name='  Nome completo  ').name == 'Nome completo'


@pytest.mark.parametrize('overrides', [{'email': 'invalid'}, {'password': 'short'}, {'name': 123}, {'is_public': True}])
def test_registration_rejects_invalid_fields(overrides):
    with pytest.raises(ValidationError):
        Register(**({'name': 'Atleta', 'email': 'atleta@example.com', 'birth_date': '1990-01-01',
                     'password': 'TestPassword123'} | overrides))


@pytest.mark.parametrize('payload', [{'city_id': 0}, {'city_id': -1}, {'city_id': 1, 'position': 'invalid'},
                                   {'city_id': 1, 'level': 'Ouro'}, {'city_id': 1, 'user_id': 42},
                                   {'city_id': 1, 'is_public': True}])
def test_profile_rejects_invalid_values_or_server_owned_fields(payload):
    with pytest.raises(ValidationError):
        ProfileInput(**payload)


@pytest.mark.parametrize('overrides', [{'session_hours': 0}, {'session_hours': -1}, {'allowed_origins': ['*']}])
def test_settings_reject_unsafe_values(overrides):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **overrides)

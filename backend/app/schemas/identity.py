from datetime import date
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.services.identity import RESERVED_USERNAMES, USERNAME_RE, normalize_username


class Sport(StrEnum):
    futebol = 'futebol'
    tenis = 'tenis'
    corrida = 'corrida'


class Position(StrEnum):
    goleiro = 'goleiro'
    defesa = 'defesa'
    meio_campo = 'meio_campo'
    atacante = 'atacante'


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Register(Input):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    birth_date: date
    password: str = Field(min_length=10, max_length=128)

    @field_validator('name', mode='before')
    @classmethod
    def trim_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class Login(Input):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UpdateUser(Input):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    username: str | None = Field(default=None, max_length=60)

    @field_validator('name', mode='before')
    @classmethod
    def trim_name(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator('username', mode='before')
    @classmethod
    def normalize(cls, value):
        return normalize_username(value) if isinstance(value, str) else value

    @field_validator('username')
    @classmethod
    def check_username(cls, value):
        if value is not None and not USERNAME_RE.fullmatch(value):
            raise ValueError('Use de 3 a 30 letras minúsculas, números, ponto ou sublinhado, sem ponto no início, '
                             'no fim ou repetido.')
        if value in RESERVED_USERNAMES:
            raise ValueError('Este nome de usuário é reservado.')
        return value

    @model_validator(mode='after')
    def require_change(self):
        if self.name is None and self.username is None:
            raise ValueError('Informe o nome ou o nome de usuário.')
        return self


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    username: str
    email: str
    birth_date: date
    social_public: bool = False
    is_admin: bool = False
    avatar: 'AvatarOut | None' = None
    cover: 'AvatarOut | None' = None


class AvatarOut(BaseModel):
    id: str
    url: str


class UsernameAvailabilityOut(BaseModel):
    available: bool
    reason: Literal['invalid', 'reserved', 'taken', 'current'] | None = None
    suggestions: list[str] = []


class ProfileInput(Input):
    city_id: int = Field(gt=0)
    position: Position | None = None
    looking_for: bool = False


class ProfileOut(ProfileInput):
    model_config = ConfigDict(from_attributes=True)
    id: int
    sport: Sport
    is_public: bool
    level: str | None = None


class CityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    state: str


class SessionOut(BaseModel):
    user: UserOut
    expires_at: str
    token: str | None = None

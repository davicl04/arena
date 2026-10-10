from datetime import date
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


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
    name: str = Field(min_length=2, max_length=100)

    @field_validator('name', mode='before')
    @classmethod
    def trim_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: str
    birth_date: date
    avatar: 'AvatarOut | None' = None


class AvatarOut(BaseModel):
    id: str
    url: str


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

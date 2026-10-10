from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    database_url: str = 'postgresql+psycopg2://arena:arena@localhost:5432/arena'
    environment: str = 'development'
    allowed_origins: list[str] = ['http://localhost:5173', 'http://127.0.0.1:5173']
    session_hours: int = 24
    cookie_secure: bool = False
    media_s3_endpoint: str = 'http://localhost:9000'
    media_s3_region: str = 'us-east-1'
    media_s3_bucket: str = 'arena-media'
    media_s3_access_key: str = 'arena-local'
    media_s3_secret_key: str = 'arena-local-password-change-me'
    media_max_upload_bytes: int = 5 * 1024 * 1024

    @model_validator(mode='after')
    def production_settings(self):
        if self.session_hours <= 0:
            raise ValueError('SESSION_HOURS deve ser positivo.')
        if self.environment != 'development' and not self.cookie_secure:
            raise ValueError('COOKIE_SECURE deve estar ativo fora do desenvolvimento.')
        if '*' in self.allowed_origins:
            raise ValueError('Informe origens explícitas.')
        return self


@lru_cache
def get_settings():
    return Settings()

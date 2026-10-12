from functools import lru_cache
from urllib.parse import urlsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Only used when ENVIRONMENT=development; any other environment must define TEAM_LINK_SECRET.
DEV_TEAM_LINK_SECRET = 'arena-dev-team-link-secret-never-use-outside-development'
TEAM_LINK_SECRET_MIN_LENGTH = 32


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
    # Base of links shared outside the app (team link and QR): {public_web_url}/entrar/{token}.
    public_web_url: str = 'http://localhost:5173'
    # HMAC key that derives team link tokens from the stored nonce; never sent to clients.
    team_link_secret: str | None = None

    @model_validator(mode='after')
    def production_settings(self):
        development = self.environment == 'development'
        if self.session_hours <= 0:
            raise ValueError('SESSION_HOURS deve ser positivo.')
        if not development and not self.cookie_secure:
            raise ValueError('COOKIE_SECURE deve estar ativo fora do desenvolvimento.')
        if '*' in self.allowed_origins:
            raise ValueError('Informe origens explícitas.')
        url = urlsplit(self.public_web_url.strip())
        if url.scheme not in {'http', 'https'} or not url.netloc or url.query or url.fragment:
            raise ValueError('PUBLIC_WEB_URL deve ser um endereço http(s) sem parâmetros.')
        if not development and url.scheme != 'https':
            raise ValueError('PUBLIC_WEB_URL deve usar https fora do desenvolvimento.')
        self.public_web_url = self.public_web_url.strip().rstrip('/')
        secret = (self.team_link_secret or '').strip()
        if not secret:
            if not development:
                raise ValueError('TEAM_LINK_SECRET deve ser definido fora do desenvolvimento.')
            secret = DEV_TEAM_LINK_SECRET
        elif not development and (secret == DEV_TEAM_LINK_SECRET or len(secret) < TEAM_LINK_SECRET_MIN_LENGTH):
            raise ValueError(f'TEAM_LINK_SECRET deve ter pelo menos {TEAM_LINK_SECRET_MIN_LENGTH} caracteres '
                             'e ser exclusivo do ambiente.')
        self.team_link_secret = secret
        return self


@lru_cache
def get_settings():
    return Settings()

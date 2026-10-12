"""Team link tokens: HMAC-SHA256(server secret, team + nonce). The database keeps the nonce and SHA-256(token).

The representative can see the link again at any time (it is derived, not stored), a database leak alone
does not reveal valid links, and "Gerar outro link" swaps the nonce, which invalidates the previous token.
Changing TEAM_LINK_SECRET invalidates every link; `current_token` then re-syncs the stored hash.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.identity import utcnow
from app.models.teams import Team

TOKEN_RE = re.compile(r'^[A-Za-z0-9_-]{43}$')
_CONTEXT = 'arena-team-link:v1'


def new_nonce() -> str:
    return secrets.token_urlsafe(32)


def token_for(team_id: int, nonce: str) -> str:
    key = get_settings().team_link_secret.encode()
    digest = hmac.new(key, f'{_CONTEXT}:{team_id}:{nonce}'.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip('=')


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def join_url(token: str) -> str:
    return f'{get_settings().public_web_url}/entrar/{token}'


def issue(team: Team) -> str:
    """Creates or replaces the team link (team must have an id). The caller commits and audits."""
    team.link_nonce = new_nonce()
    token = token_for(team.id, team.link_nonce)
    team.link_token_hash = token_hash(token)
    team.link_generated_at = utcnow()
    return token


def synced_token(team: Team) -> str | None:
    """The current token when the link exists and the stored hash matches it (nothing to write), else None."""
    if team.link_nonce is None:
        return None
    token = token_for(team.id, team.link_nonce)
    return token if team.link_token_hash == token_hash(token) else None


def current_token(team: Team) -> tuple[str | None, bool]:
    """Current token and whether the stored hash had to be re-synced (the caller then commits)."""
    if team.link_nonce is None:
        return None, False
    token = token_for(team.id, team.link_nonce)
    digest = token_hash(token)
    if team.link_token_hash == digest:
        return token, False
    team.link_token_hash = digest
    return token, True


def find_team(db: Session, token: str, *, for_update: bool = False) -> Team | None:
    """Active team whose current link is `token`; None for malformed, replaced or closed links."""
    if not TOKEN_RE.fullmatch(token or ''):
        return None
    statement = select(Team).where(Team.link_token_hash == token_hash(token), Team.state == 'ativo')
    team = db.scalar(statement.with_for_update() if for_update else statement)
    if team is None or team.link_nonce is None or not hmac.compare_digest(token_for(team.id, team.link_nonce), token):
        return None
    return team

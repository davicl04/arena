from datetime import timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models.identity import AuthSession, User, utcnow
from app.services.identity import digest_token

COOKIE_NAME = 'arena_session'


def current_session(request: Request, db: Session = Depends(get_db)) -> AuthSession:
    authorization = request.headers.get('Authorization', '')
    if authorization:
        token = authorization[7:] if authorization.startswith('Bearer ') else None
    else:
        token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(401, 'Entre na sua conta para continuar.')
    if not authorization and request.method not in {'GET', 'HEAD', 'OPTIONS'}:
        if request.headers.get('origin') not in get_settings().allowed_origins:
            raise HTTPException(403, 'Origem da solicitação não autorizada.')
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == digest_token(token)))
    if not session or session.expires_at.replace(tzinfo=timezone.utc) <= utcnow():
        raise HTTPException(401, 'Sua sessão expirou. Entre novamente.')
    return session


def current_user(session: AuthSession = Depends(current_session), db: Session = Depends(get_db)) -> User:
    user = db.get(User, session.user_id)
    if not user or not user.active:
        raise HTTPException(401, 'Conta indisponível.')
    return user


def current_admin(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(403, 'Acesso administrativo necessário.')
    return user

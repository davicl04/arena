import hashlib
import secrets
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.identity import AuthSession, User, utcnow
from app.schemas.identity import Register

passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash('arena-dummy-password-never-used')


def is_adult(birth_date: date, today: date | None = None) -> bool:
    today = today or utcnow().astimezone(ZoneInfo('America/Sao_Paulo')).date()
    age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
    return age >= 18 and birth_date <= today


def normalize_email(email: str) -> str:
    return email.strip().lower()


def digest_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def register_user(db: Session, data: Register) -> User:
    if not is_adult(data.birth_date):
        raise HTTPException(422, 'O cadastro exige 18 anos completos.')
    user = User(name=data.name, email=normalize_email(str(data.email)), birth_date=data.birth_date,
                password_hash=passwords.hash(data.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'Este e-mail já está cadastrado.') from None
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == normalize_email(email)))
    valid = passwords.verify(password, user.password_hash if user else DUMMY_HASH)
    if not valid or not user or not user.active:
        raise HTTPException(401, 'E-mail ou senha inválidos.')
    return user


def create_session(db: Session, user: User) -> tuple[str, AuthSession]:
    token = secrets.token_urlsafe(32)
    session = AuthSession(user_id=user.id, token_hash=digest_token(token),
                          expires_at=utcnow() + timedelta(hours=get_settings().session_hours))
    db.add(session)
    db.commit()
    return token, session

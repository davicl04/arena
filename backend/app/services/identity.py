from __future__ import annotations

import hashlib
import re
import secrets
import unicodedata
from collections.abc import Iterator
from datetime import date, timedelta
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.identity import AuthSession, User, utcnow

if TYPE_CHECKING:
    from app.schemas.identity import Register

passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash('arena-dummy-password-never-used')
USERNAME_RE = re.compile(r'^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{3,30}$')
RESERVED_USERNAMES = frozenset({
    'admin', 'administrador', 'suporte', 'support', 'arena', 'api', 'me', 'root', 'sistema',
    'moderacao', 'moderador', 'ajuda', 'help', 'null', 'undefined', 'settings', 'configuracoes',
})
USERNAME_CONSTRAINT = 'uq_users_username'


def is_adult(birth_date: date, today: date | None = None) -> bool:
    today = today or utcnow().astimezone(ZoneInfo('America/Sao_Paulo')).date()
    age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
    return age >= 18 and birth_date <= today


def normalize_email(email: str) -> str:
    return email.strip().lower()


def normalize_username(value: str) -> str:
    value = value.strip()
    return (value[1:] if value.startswith('@') else value).lower()


def username_slug(name: str) -> str:
    """Accent-free, lower-case slug of a display name that satisfies USERNAME_RE."""
    text = ''.join(c for c in unicodedata.normalize('NFD', name) if unicodedata.category(c) != 'Mn')
    text = re.sub(r'\s+', '.', text.strip().lower())
    text = re.sub(r'[^a-z0-9._]', '', text)
    text = re.sub(r'\.{2,}', '.', text).strip('.')[:30].strip('.')
    if not text:
        return 'atleta'
    return text if len(text) >= 3 else f'{text}.atleta'


def username_candidates(base: str) -> Iterator[str]:
    """Yield the base followed by numbered variants that keep the 30-character limit."""
    yield base
    number = 1
    while True:
        suffix = str(number)
        yield base[:30 - len(suffix)].rstrip('.') + suffix
        number += 1


def free_usernames(db: Session, base: str, count: int, exclude: set[str] = frozenset()) -> list[str]:
    candidates = iter(username_candidates(base))
    found: list[str] = []
    for _ in range(5):
        batch = [next(candidates) for _ in range(50)]
        taken = set(db.scalars(select(User.username).where(User.username.in_(batch))).all())
        found += [name for name in batch
                  if name not in taken and name not in exclude and name not in RESERVED_USERNAMES]
        if len(found) >= count:
            return found[:count]
    return found


def generate_username(db: Session, name: str) -> str:
    found = free_usernames(db, username_slug(name), 1)
    return found[0] if found else f'{username_slug(name)[:23].rstrip(".")}.{secrets.token_hex(3)}'


def is_username_conflict(error: IntegrityError) -> bool:
    diag = getattr(error.orig, 'diag', None)
    return getattr(diag, 'constraint_name', None) == USERNAME_CONSTRAINT


def digest_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def register_user(db: Session, data: Register) -> User:
    if not is_adult(data.birth_date):
        raise HTTPException(422, 'O cadastro exige 18 anos completos.')
    password_hash = passwords.hash(data.password)
    for _ in range(3):
        # A concurrent sign-up may claim the same generated username; retry with a fresh one.
        user = User(name=data.name, username=generate_username(db, data.name),
                    email=normalize_email(str(data.email)), birth_date=data.birth_date,
                    password_hash=password_hash)
        db.add(user)
        try:
            db.commit()
            return user
        except IntegrityError as error:
            db.rollback()
            if not is_username_conflict(error):
                raise HTTPException(409, 'Este e-mail já está cadastrado.') from None
    raise HTTPException(409, 'Não foi possível concluir o cadastro. Tente novamente.')


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

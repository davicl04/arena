from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def sql_in(column: str, values: tuple[str, ...]) -> str:
    """SQL for CHECK constraints over a closed set of string values."""
    return f"{column} IN ({', '.join(repr(value) for value in values)})"


engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db():
    with SessionLocal() as db:
        yield db

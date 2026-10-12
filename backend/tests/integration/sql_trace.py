"""The SQL a transaction sends, in order: how the lock-order tests prove that a route takes its locks in the global
order (docs/decisoes/0002-jogar.md, section 15.5, and 0003, section 19.1) without depending on timing."""
from collections.abc import Callable

from sqlalchemy import event as sa_event
from sqlalchemy.orm import Session

Statement = tuple[str, list]


def record_sql(engine, job: Callable[[Session], object]) -> tuple[list[Statement], object]:
    """Runs `job` in its own session and transaction (committed at the end); returns the statements it sent as
    `(text, parameter values)` and what the job returned."""
    log: list[Statement] = []

    def listener(connection, cursor, statement, parameters, context, executemany):
        values = list(parameters.values()) if isinstance(parameters, dict) else list(parameters or ())
        log.append((statement, values))

    sa_event.listen(engine, 'before_cursor_execute', listener)
    try:
        with Session(engine, expire_on_commit=False) as db:
            outcome = job(db)
            db.commit()
    finally:
        sa_event.remove(engine, 'before_cursor_execute', listener)
    return log, outcome


def first_index(log: list[Statement], test: Callable[[str, list], bool]) -> int:
    """Position of the first statement the test accepts (StopIteration when none does)."""
    return next(index for index, (sql, values) in enumerate(log) if test(sql, values))


def row_lock(table: str, *ids: int, share: bool = False) -> Callable[[str, list], bool]:
    """A `SELECT … FROM table … FOR UPDATE` (or `FOR SHARE`) that carries one of the ids among its parameters."""
    mode = 'FOR SHARE' if share else 'FOR UPDATE'

    def test(sql: str, values: list) -> bool:
        return f'FROM {table}' in sql and mode in sql and any(item in values for item in ids)
    return test


def ranking_lock(sql: str, values: list) -> bool:
    return 'pg_advisory_xact_lock' in sql

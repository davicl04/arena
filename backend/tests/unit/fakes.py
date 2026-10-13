"""A simulated SQLAlchemy session for unit tests of the services (no database).

`FakeDb` answers each `select` by the first table of its FROM clause, with the rows the test registered for that
table (`db.on('match_sides', rows)`), so a service runs its real code over plain model instances and the test checks
what it wrote: rows added (notifications, audit, chat banners), commits, deletions and the state it changed. Statements
that change rows (`UPDATE`, `DELETE`, `INSERT`) are recorded and answered with an empty result. A query on a table
nobody registered fails the test, so a service never reads something the scenario did not provide.

This checks the logic around the queries (ordering of the rules, branches, side effects), not the SQL; the SQL and the
locks are checked by the PostgreSQL integration tests.
"""
from __future__ import annotations

import re
from contextlib import contextmanager

from sqlalchemy.dialects import postgresql

FROM_TABLE = re.compile(r'\bFROM\s+(\w+)', re.IGNORECASE)


class Result:
    """What `execute`/`scalars` return: a list of rows with the accessors the services use."""

    def __init__(self, rows):
        self.rows = list(rows)
        self.rowcount = len(self.rows)

    def all(self):
        return list(self.rows)

    def first(self):
        return self.rows[0] if self.rows else None

    def one(self):
        assert len(self.rows) == 1, f'expected one row, got {len(self.rows)}'
        return self.rows[0]

    def one_or_none(self):
        return self.rows[0] if self.rows else None

    def scalar(self):
        return self.rows[0] if self.rows else None

    def scalars(self):
        return Result(self.rows)

    def unique(self):
        return Result(self.rows)

    def __iter__(self):
        return iter(self.rows)

    def __len__(self):
        return len(self.rows)


def table_of(statement) -> str:
    text = str(statement.compile(dialect=postgresql.dialect()))
    head = text.lstrip().split(None, 1)[0].upper()
    if head in ('UPDATE', 'DELETE', 'INSERT'):
        return head.lower()
    found = FROM_TABLE.search(text)
    if found is None and 'pg_advisory' in text:
        return 'advisory'                                  # a transaction lock: nothing to read
    assert found, f'statement without a table: {text[:120]}'
    return found.group(1)


class FakeDb:
    def __init__(self):
        self.tables: dict[str, list] = {}
        self.sequences: dict[str, list] = {}
        self.objects: dict[tuple, object] = {}
        self.added: list = []
        self.deleted: list = []
        self.statements: list[str] = []
        self.commits = 0
        self.rollbacks = 0
        self.flushes = 0
        self._ids = 100

    # ----- Scenario ------------------------------------------------------------------------------------------
    def on(self, table: str, rows):
        """Rows (or a scalar value) every query on `table` answers."""
        self.tables[table] = rows
        return self

    def then(self, table: str, *answers):
        """Answers for successive queries on `table` (the static `on` answer serves once the sequence ends)."""
        self.sequences.setdefault(table, []).extend(answers)
        return self

    def put(self, model, row):
        """The row `db.get(model, row.id)` returns."""
        self.objects[(model, row.id)] = row
        return self

    # ----- Reads ---------------------------------------------------------------------------------------------
    def _answer(self, statement):
        table = table_of(statement)
        self.statements.append(table)
        if table in ('update', 'delete', 'insert', 'advisory'):
            return []
        if self.sequences.get(table):
            return self.sequences[table].pop(0)
        assert table in self.tables, f'unexpected query on {table}'
        return self.tables[table]

    def scalar(self, statement, *args, **kwargs):
        answer = self._answer(statement)
        if isinstance(answer, (list, tuple)):
            return answer[0] if answer else None
        return answer

    def scalars(self, statement, *args, **kwargs):
        answer = self._answer(statement)
        return Result(answer if isinstance(answer, (list, tuple)) else [answer])

    def execute(self, statement, *args, **kwargs):
        answer = self._answer(statement)
        return Result(answer if isinstance(answer, (list, tuple)) else [answer])

    def get(self, model, key, **kwargs):
        return self.objects.get((model, key))

    # ----- Writes --------------------------------------------------------------------------------------------
    def add(self, row):
        self.added.append(row)

    def add_all(self, rows):
        self.added.extend(rows)

    def delete(self, row):
        self.deleted.append(row)

    def flush(self):
        self.flushes += 1
        for row in self.added:
            if hasattr(row, 'id') and getattr(row, 'id', 0) is None:
                self._ids += 1
                row.id = self._ids

    def commit(self):
        self.flush()
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def refresh(self, row):
        return None

    @contextmanager
    def begin_nested(self):
        yield self

    # ----- Assertions ----------------------------------------------------------------------------------------
    def of(self, model):
        """The rows of a model added so far."""
        return [row for row in self.added if isinstance(row, model)]

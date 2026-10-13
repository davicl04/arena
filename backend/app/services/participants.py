"""Who acts for an entry and who reads about it: the athlete, or the team's active representatives or members.

Football entries belong to a team: representatives act (send the receipt, answer the refund, cancel) and every
active member follows the entry and reads the event notices. Tennis and running entries belong to the athlete.
"""
from __future__ import annotations

from collections.abc import Iterable
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.events import EventEntry
from app.models.teams import TeamMember

Scope = Literal['representantes', 'membros']


def entry_recipients(db: Session, entries: Iterable[EventEntry], *,
                     scope: Scope = 'representantes') -> dict[int, list[int]]:
    """Recipients per entry id, in one query for every team involved (representatives first, then by entry)."""
    entries = list(entries)
    team_ids = {entry.team_id for entry in entries if entry.team_id is not None}
    by_team: dict[int, list[int]] = {}
    if team_ids:
        statement = select(TeamMember.team_id, TeamMember.user_id).where(
            TeamMember.team_id.in_(team_ids), TeamMember.left_at.is_(None))
        if scope == 'representantes':
            statement = statement.where(TeamMember.role == 'representante')
        statement = statement.order_by((TeamMember.role == 'representante').desc(), TeamMember.joined_at,
                                       TeamMember.id)
        for team_id, user_id in db.execute(statement).all():
            by_team.setdefault(team_id, []).append(user_id)
    return {entry.id: [entry.user_id] if entry.user_id is not None else list(by_team.get(entry.team_id, []))
            for entry in entries}


def entry_role(db: Session, entry: EventEntry, user_id: int) -> Literal['atleta', 'representante', 'membro'] | None:
    """The viewer's relation to an entry; None means the entry is not theirs (answer 404, never 403)."""
    if entry.user_id is not None:
        return 'atleta' if entry.user_id == user_id else None
    role = db.scalar(select(TeamMember.role).where(
        TeamMember.team_id == entry.team_id, TeamMember.user_id == user_id, TeamMember.left_at.is_(None)))
    return role

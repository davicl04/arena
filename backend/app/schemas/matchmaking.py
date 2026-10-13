"""Response envelopes of the matchmaking routes (Jogar, fase 2; etapa 3).

The objects themselves (`MatchSearchOut`, `ProposalOut`, `MatchCardOut`, `PlayBoardOut`...) are shared and live in
`app/schemas/matches.py`; here are only the lists the routes wrap them in. Contract: docs/decisoes/0002-jogar.md,
section 9.
"""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.matches import MatchCardOut, MatchSearchOut, ProposalOut


class MatchSearchList(BaseModel):
    items: list[MatchSearchOut]


class ProposalList(BaseModel):
    items: list[ProposalOut]


class MatchCardList(BaseModel):
    """`proximas` answers only `items` (next_cursor stays null); `historico` is a page."""
    items: list[MatchCardOut]
    next_cursor: str | None = None

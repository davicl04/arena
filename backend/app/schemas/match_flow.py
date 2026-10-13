"""Formas da frente de partida: catálogo e fila de quadras, fila de W.O. contestado (etapa 3, seções 10.2 e 10.4).

As entradas (`TermsInput`, `CancelInput`, `ReasonInput`, `WalkoverDecisionInput`, `MessageInput`,
`CourtSuggestionInput`, `CourtDecisionInput`) e as saídas compartilhadas estão em `app/schemas/matches.py`.
"""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.matches import AdminCourtSuggestionOut, AdminWalkoverDisputeOut, CourtOut


class CourtListOut(BaseModel):
    items: list[CourtOut]


class CourtSuggestionOut(BaseModel):
    court: CourtOut
    existing: bool               # true: a quadra já estava no catálogo ou já tinha sido sugerida nesta partida


class AdminCourtSuggestionPage(BaseModel):
    items: list[AdminCourtSuggestionOut]
    next_cursor: str | None


class AdminWalkoverDisputePage(BaseModel):
    items: list[AdminWalkoverDisputeOut]
    next_cursor: str | None

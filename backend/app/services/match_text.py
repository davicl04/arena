"""Pequenos auxiliares de texto da frente de partida: nomes dos lados e datas dos payloads.

Os textos das faixas do chat e das notificações são gerados em português e não trazem datas (a web formata
`payload.starts_at` no fuso do aparelho); aqui ficam só os nomes e a serialização ISO dos payloads.
"""
from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.matches import MatchSide
from app.services.match_access import subject_names


def iso(moment: datetime | None) -> str | None:
    return moment.isoformat() if moment is not None else None


def side_names(db: Session, sides: Mapping[str, MatchSide]) -> dict[str, str]:
    """Display name per side label ('a', 'b'): the team name or the tennis player's name."""
    by_id = subject_names(db, sides.values())
    return {label: by_id[side.id] for label, side in sides.items()}


def side_name(db: Session, sides: Mapping[str, MatchSide], label: str | None) -> str:
    """Name of one side, or 'A administração' when the event has no side."""
    if label is None or label not in sides:
        return 'A administração'
    return side_names(db, {label: sides[label]})[label]

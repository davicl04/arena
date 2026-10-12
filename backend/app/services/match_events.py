"""Event banners of the match chat: proposal accepted, terms, schedule, booking, walk-ins, results and stats.

Every stage 3 front posts its events here, in the same transaction as the change (contract:
docs/decisoes/0002-jogar.md, section 11). The text is generated in Portuguese by the caller and shown as is by
both clients; `event_type` picks the icon and `side` the crest of the banner.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.identity import utcnow
from app.models.matches import MatchMessage

MATCH_EVENT_TYPES = frozenset({
    'partida_combinando',       # both sides accepted the proposal: the chat opens
    'condicoes_propostas',
    'condicoes_aceitas',
    'partida_agendada',
    'reserva_atualizada',
    'vagas_atualizadas',
    'avulso_entrou',
    'avulso_removido',
    'quadra_sugerida',
    'partida_cancelada',
    'wo_registrado',
    'wo_retirado',
    'wo_contestado',
    'wo_decidido',
    'placar_enviado',
    'resultado_confirmado',
    'resultado_divergente',
    'sem_resultado',
    'presenca_registrada',
    'estatisticas_enviadas',
    'estatistica_revisada',
    'estatistica_contestada',
})


def post_event(db: Session, match_id: int, event_type: str, body: str, *, side: str | None = None,
               author_id: int | None = None, payload: dict | None = None,
               now: datetime | None = None) -> MatchMessage:
    """Adds an event banner (no commit). Unknown types are refused so clients can rely on the list."""
    if event_type not in MATCH_EVENT_TYPES:
        raise ValueError(f'Evento de partida desconhecido: {event_type}')
    text = ' '.join(body.split())
    if not 1 <= len(text) <= 1000:
        raise ValueError('Evento de partida sem texto.')
    message = MatchMessage(match_id=match_id, author_id=author_id, side=side, kind='evento', event_type=event_type,
                           body=text, payload=dict(payload) if payload else None, created_at=now or utcnow())
    db.add(message)
    return message

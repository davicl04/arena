"""Stage 3 shared services without a database: chat event banners, access helpers and the ranking hook."""
import inspect
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.models.matches import MatchMessage
from app.services import standings
from app.services.match_access import MatchAccess, can_read_chat, can_write_chat
from app.services.match_events import MATCH_EVENT_TYPES, post_event
from app.services.matchmaking_queue import Pairing, PostgresMatchmakingQueue, queue

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)


class Db:
    def __init__(self):
        self.added = []

    def add(self, value):
        self.added.append(value)


def test_event_banners_are_added_without_commit():
    db = Db()
    message = post_event(db, 7, 'avulso_entrou', '  Ana   entrou como avulso. ', side='b', author_id=3,
                         payload={'slot_id': 9}, now=NOW)
    assert isinstance(message, MatchMessage) and db.added == [message]
    assert (message.match_id, message.kind, message.event_type, message.body, message.side) == (
        7, 'evento', 'avulso_entrou', 'Ana entrou como avulso.', 'b')
    assert (message.author_id, message.payload, message.created_at) == (3, {'slot_id': 9}, NOW)
    assert post_event(db, 7, 'sem_resultado', 'Sem resultado.').payload is None


@pytest.mark.parametrize(('event_type', 'body'), [('desconhecido', 'Texto'), ('sem_resultado', '   '),
                                                  ('sem_resultado', 'x' * 1001)])
def test_unknown_event_types_and_empty_texts_are_refused(event_type, body):
    with pytest.raises(ValueError):
        post_event(Db(), 1, event_type, body)


def test_event_types_cover_the_match_flow():
    assert {'partida_combinando', 'condicoes_propostas', 'condicoes_aceitas', 'partida_agendada', 'partida_cancelada',
            'wo_registrado', 'placar_enviado', 'resultado_confirmado', 'resultado_divergente',
            'estatisticas_enviadas', 'estatistica_contestada', 'avulso_entrou', 'avulso_removido'} <= MATCH_EVENT_TYPES


@pytest.mark.parametrize(('state', 'reads', 'writes'), [
    ('proposta', False, False), ('combinando', True, True), ('agendada', True, True), ('realizada', True, True),
    ('encerrada', True, False), ('sem_resultado', True, False), ('cancelada', True, False),
    ('recusada', False, False), ('expirada', False, False)])
def test_chat_opens_after_both_acceptances_and_turns_read_only_at_the_end(state, reads, writes):
    match = SimpleNamespace(state=state)
    member = MatchAccess('membro', 'a')
    assert can_read_chat(match, member) is reads and can_write_chat(match, member) is writes
    assert not can_write_chat(match, MatchAccess('administracao', None))
    assert not can_read_chat(match, None) and not can_write_chat(match, None)


def test_who_acts_for_a_side():
    assert MatchAccess('representante', 'a').acts_for_side and MatchAccess('atleta', 'b').acts_for_side
    assert not MatchAccess('membro', 'a').acts_for_side and not MatchAccess('avulso', 'a').acts_for_side
    assert not MatchAccess('organizador', None).acts_for_side


def test_queue_interface_and_ranking_hook():
    assert isinstance(queue, PostgresMatchmakingQueue)
    pairing = Pairing('oferta', SimpleNamespace(id=1), (SimpleNamespace(id=2),), SimpleNamespace(id=3))
    assert pairing.kind == 'oferta' and pairing.slot.id == 3
    # The ranking hook the lifecycle and the routes call: (db, match, now=...) inside the caller's transaction.
    inspect.signature(standings.recalculate_for_match).bind(None, SimpleNamespace(id=1), now=NOW)

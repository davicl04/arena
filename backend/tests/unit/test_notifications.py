from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.models.audit import AuditLog
from app.models.identity import User
from app.models.notifications import Notification
from app.services import audit, notifications
from app.services.notifications import NOTIFICATION_TYPES, notify, notify_many
from app.services.people import blocked_ids, person_out

TEAM = {'team_id': 3, 'team_name': 'Leões do Cerrado'}


class Db:
    def __init__(self):
        self.added = []

    def add(self, value):
        self.added.append(value)


STAGE_ONE_TYPES = {'convite_time', 'convite_aceito', 'pedido_entrada', 'pedido_entrada_decidido', 'removido_do_time',
                   'time_encerrado', 'pedido_organizador_decidido', 'organizador_revogado'}
STAGE_TWO_TYPES = {'evento_para_aprovar', 'evento_decidido', 'evento_cancelado', 'evento_revogacao_decidida',
                   'aviso_evento', 'time_inscrito', 'comprovante_recebido', 'comprovante_decidido', 'reserva_expirada',
                   'devolucao_enviada', 'devolucao_confirmada', 'devolucao_contestada', 'devolucao_decidida'}


STAGE_THREE_TYPES = {'proposta_partida', 'proposta_aceita', 'proposta_encerrada', 'vaga_encontrada',
                     'condicoes_propostas', 'partida_agendada', 'partida_cancelada', 'wo_registrado', 'wo_contestado',
                     'wo_decidido', 'resultado_partida', 'resultado_divergente', 'estatistica_contestada',
                     'vaga_preenchida', 'removido_da_partida', 'oferta_retirada', 'quadra_decidida'}

STAGE_FOUR_TYPES = {'tabela_publicada', 'adversario_definido', 'divergencia_para_decidir', 'decisao_registrada',
                    'evento_encerrado'}


def test_stage_one_types_are_registered_with_navigation_fields():
    assert set(NOTIFICATION_TYPES) == STAGE_ONE_TYPES | STAGE_TWO_TYPES | STAGE_THREE_TYPES | STAGE_FOUR_TYPES
    assert all({'team_id', 'team_name'} <= NOTIFICATION_TYPES[name] for name in STAGE_ONE_TYPES
               if 'organizador' not in name)


def test_stage_two_types_navigate_by_event_and_entry():
    # Every event notification names the event; the ones about one entry also carry it (the web opens it).
    assert all({'event_id', 'event_name'} <= NOTIFICATION_TYPES[name] for name in STAGE_TWO_TYPES)
    per_entry = STAGE_TWO_TYPES - {'evento_para_aprovar', 'evento_decidido', 'evento_revogacao_decidida', 'aviso_evento'}
    assert all('entry_id' in NOTIFICATION_TYPES[name] for name in per_entry)
    assert all('receipt_id' in NOTIFICATION_TYPES[name] for name in STAGE_TWO_TYPES
               if name.startswith(('comprovante', 'devolucao')))


def test_stage_four_types_navigate_by_event_and_match():
    # The table opens from the event; the others open the championship match, the web also names the event.
    assert all({'event_id', 'event_name'} <= NOTIFICATION_TYPES[name] for name in STAGE_FOUR_TYPES)
    assert all('match_id' in NOTIFICATION_TYPES[name]
               for name in STAGE_FOUR_TYPES - {'tabela_publicada', 'evento_encerrado'})
    assert {'kind'} <= NOTIFICATION_TYPES['decisao_registrada']


def test_stage_three_types_navigate_by_match_or_court():
    # The web opens the match (proposal, chat, result card) or, for a court decision, the court.
    assert all('match_id' in NOTIFICATION_TYPES[name] for name in STAGE_THREE_TYPES - {'quadra_decidida'})
    assert {'court_id', 'court_name', 'decision'} <= NOTIFICATION_TYPES['quadra_decidida']
    assert {'slot_id', 'position'} <= NOTIFICATION_TYPES['vaga_encontrada'] & NOTIFICATION_TYPES['vaga_preenchida']


def test_notify_adds_without_commit_and_skips_own_action():
    db = Db()
    created = notify(db, 5, 'convite_time', {**TEAM, 'invite_id': 9}, actor_id=2)
    assert isinstance(created, Notification) and db.added == [created]
    assert (created.user_id, created.actor_id, created.type, created.read_at) == (5, 2, 'convite_time', None)
    assert created.payload == {**TEAM, 'invite_id': 9}
    assert notify(db, 2, 'convite_time', {**TEAM, 'invite_id': 9}, actor_id=2) is None
    assert len(db.added) == 1


@pytest.mark.parametrize(('type_', 'payload'), [('desconhecido', {}), ('convite_time', TEAM),
                                               ('organizador_revogado', {})])
def test_notify_rejects_unknown_types_and_missing_payload_fields(type_, payload):
    with pytest.raises(ValueError):
        notify(Db(), 1, type_, payload)
    with pytest.raises(ValueError):
        notify_many(Db(), [1, 2], type_, payload)


def test_notify_many_sends_once_per_person_and_never_to_the_actor():
    db = Db()
    created = notify_many(db, [4, 5, 4, 2], 'pedido_entrada', {**TEAM, 'request_id': 1}, actor_id=2)
    assert [item.user_id for item in created] == [4, 5]
    assert notify_many(db, [], 'time_encerrado', TEAM) == []


def test_audit_record_adds_entry_with_copied_data():
    db, data = Db(), {'invite_id': 1}
    entry = audit.record(db, actor_id=4, action='convite.aceito', target_type='team_invite', target_id=1, data=data)
    data['invite_id'] = 2
    assert isinstance(entry, AuditLog) and db.added == [entry]
    assert (entry.actor_id, entry.action, entry.target_type, entry.target_id, entry.data) == (
        4, 'convite.aceito', 'team_invite', 1, {'invite_id': 1})
    assert audit.record(db, actor_id=None, action='time.encerrado', target_type='team', target_id=3).data == {}
    with pytest.raises(ValueError):
        audit.record(db, actor_id=1, action='aceito', target_type='team_invite', target_id=1)


def user(user_id, **values):
    return User(id=user_id, name=f'Atleta {user_id}', username=f'atleta{user_id}', active=values.get('active', True),
                avatar_media_id=values.get('avatar'))


def test_person_out_hides_avatar_of_blocked_people():
    avatar = '6a1c8a0b-8f7c-4bb1-9a0e-111111111111'
    assert person_out(user(3, avatar=avatar)).avatar_url == f'/api/v1/users/3/avatar?v={avatar}'
    assert person_out(user(3, avatar=avatar), blocked=True).avatar_url is None
    assert person_out(user(4)).model_dump() == {'id': 4, 'name': 'Atleta 4', 'username': 'atleta4', 'avatar_url': None}


def test_blocked_ids_checks_both_directions_in_one_query():
    db = Mock()
    db.execute.return_value.all.return_value = [(1, 5), (7, 1)]
    assert blocked_ids(db, 1, [5, 7, 8, 1]) == {5, 7}
    assert db.execute.call_count == 1
    assert blocked_ids(db, 1, [1]) == set() and db.execute.call_count == 1


def test_serialize_shows_actor_only_when_active_and_not_blocked(monkeypatch):
    stamp = datetime(2026, 10, 12, tzinfo=timezone.utc)
    rows = [Notification(id=index, user_id=1, actor_id=actor, type='time_encerrado', payload=TEAM, created_at=stamp)
            for index, actor in enumerate([2, 3, 4, None], start=1)]
    db = Mock()
    db.scalars.return_value.all.return_value = [user(2), user(3, active=False), user(4)]
    monkeypatch.setattr(notifications, 'blocked_ids', lambda _db, viewer, ids: {4})
    items = notifications.serialize(db, SimpleNamespace(id=1), rows)
    assert [item.actor.id if item.actor else None for item in items] == [2, None, None, None]
    assert items[0].payload == TEAM and items[0].read_at is None


# --- Categories and pending actions ---------------------------------------------------------------------

NOW = datetime(2026, 10, 12, 12, 0, tzinfo=timezone.utc)
HOUR = timedelta(hours=1)
PAYLOADS = {'convite_time': {**TEAM, 'invite_id': 9}}


def receipt_payload(decision):
    return {'event_id': 1, 'event_name': 'Copa', 'entry_id': 2, 'receipt_id': 3, 'decision': decision}


def test_every_type_has_a_category_and_the_catalog_is_exact():
    assert set(notifications.NOTIFICATION_CATEGORY) == set(NOTIFICATION_TYPES)
    assert set(notifications.NOTIFICATION_CATEGORY.values()) == {'partidas', 'times', 'eventos', 'conta'}
    by_category = {name: set(notifications.types_of(name)) for name in ('partidas', 'times', 'eventos', 'conta')}
    assert sum(len(value) for value in by_category.values()) == len(NOTIFICATION_TYPES) == 43
    assert by_category['conta'] == {'pedido_organizador_decidido', 'organizador_revogado', 'quadra_decidida'}
    assert by_category['times'] == {'convite_time', 'convite_aceito', 'pedido_entrada', 'pedido_entrada_decidido',
                                    'removido_do_time', 'time_encerrado'}


def test_action_types_are_a_subset_of_the_catalog():
    assert len(notifications.ACTION_TYPES) == 14
    assert notifications.ACTION_TYPES <= set(NOTIFICATION_TYPES)


def test_notify_stores_action_key_and_deadline():
    db = Db()
    created = notify(db, 5, 'convite_time', PAYLOADS['convite_time'], actor_id=2, action_key='invite:9',
                     action_until=NOW)
    assert (created.action_key, created.action_until, created.resolved_at) == ('invite:9', NOW, None)
    many = notify_many(db, [5, 6], 'convite_time', PAYLOADS['convite_time'], action_key='invite:9')
    assert [(item.user_id, item.action_key, item.action_until) for item in many] == [
        (5, 'invite:9', None), (6, 'invite:9', None)]
    plain = notify(db, 5, 'time_encerrado', TEAM)
    assert (plain.action_key, plain.action_until) == (None, None)


def test_action_key_is_optional_during_the_transition_and_required_afterwards(monkeypatch):
    assert notifications.REQUIRE_ACTION_KEYS is False
    assert notify(Db(), 5, 'convite_time', PAYLOADS['convite_time']) is not None
    monkeypatch.setattr(notifications, 'REQUIRE_ACTION_KEYS', True)
    for type_ in notifications.ACTION_TYPES - {'comprovante_decidido'}:
        payload = {key: 1 for key in NOTIFICATION_TYPES[type_]}
        with pytest.raises(ValueError):
            notify(Db(), 5, type_, payload)
        with pytest.raises(ValueError):
            notify_many(Db(), [5], type_, payload)
        assert notify(Db(), 5, type_, payload, action_key=f'{type_}:1') is not None
        assert notify(Db(), 5, type_, payload, informative=True) is not None
    assert notify(Db(), 5, 'time_encerrado', TEAM) is not None


def test_receipt_decision_only_needs_a_key_when_refused(monkeypatch):
    monkeypatch.setattr(notifications, 'REQUIRE_ACTION_KEYS', True)
    assert notify(Db(), 5, 'comprovante_decidido', receipt_payload('aprovado')) is not None
    with pytest.raises(ValueError):
        notify(Db(), 5, 'comprovante_decidido', receipt_payload('recusado'))
    assert notify(Db(), 5, 'comprovante_decidido', receipt_payload('recusado'),
                  action_key='entry_receipt:2') is not None


def test_action_key_rules_that_always_apply():
    with pytest.raises(ValueError):
        notify(Db(), 5, 'time_encerrado', TEAM, action_key='team:3')
    with pytest.raises(ValueError):
        notify(Db(), 5, 'convite_time', PAYLOADS['convite_time'], action_key='x' * 81)
    with pytest.raises(ValueError):
        notify(Db(), 5, 'convite_time', PAYLOADS['convite_time'], action_key='')
    with pytest.raises(ValueError):
        notify(Db(), 5, 'convite_time', PAYLOADS['convite_time'], action_key='invite:9', informative=True)
    with pytest.raises(ValueError):
        notify_many(Db(), [5], 'convite_time', PAYLOADS['convite_time'], action_key='invite:9', informative=True)
    assert notify(Db(), 5, 'convite_time', PAYLOADS['convite_time'], action_key='x' * 80) is not None


def test_pending_rule_respects_deadline_and_resolution():
    def item(**values):
        return Notification(user_id=1, type='convite_time', payload={}, created_at=NOW, **values)

    assert notifications.is_pending(item(action_key='invite:1'), NOW)
    assert notifications.is_pending(item(action_key='invite:1', action_until=NOW + HOUR), NOW)
    assert not notifications.is_pending(item(action_key='invite:1', action_until=NOW), NOW)
    assert not notifications.is_pending(item(action_key='invite:1', action_until=NOW - HOUR), NOW)
    assert not notifications.is_pending(item(action_key='invite:1', resolved_at=NOW), NOW)
    assert not notifications.is_pending(item(), NOW)
    assert not notifications.is_pending(item(action_until=NOW + HOUR), NOW)


def test_serialize_fills_category_pending_and_deadline():
    rows = [Notification(id=1, user_id=1, type='convite_time', payload={}, created_at=NOW, action_key='invite:1',
                         action_until=NOW + HOUR),
            Notification(id=2, user_id=1, type='quadra_decidida', payload={}, created_at=NOW),
            Notification(id=3, user_id=1, type='convite_time', payload={}, created_at=NOW, action_key='invite:3',
                         action_until=NOW - HOUR)]
    items = notifications.serialize(Mock(), SimpleNamespace(id=1), rows, NOW)
    assert [(item.category, item.pending, item.action_until) for item in items] == [
        ('times', True, NOW + HOUR), ('conta', False, None), ('times', False, NOW - HOUR)]


def test_resolve_actions_without_recipients_or_keys_does_nothing():
    db = Mock()
    assert notifications.resolve_actions(db, 'invite:1', user_ids=[]) == 0
    assert notifications.resolve_actions_many(db, []) == 0
    db.execute.assert_not_called()

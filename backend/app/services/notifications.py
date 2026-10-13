"""In-app notifications. `notify` only adds rows: the caller commits in the same transaction as the change."""
from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import Literal

from sqlalchemy import ColumnElement, and_, exists, func, or_, select, update
from sqlalchemy.orm import Session

from app.core.pagination import paginate
from app.models.identity import Follow, User, UserBlock, utcnow
from app.models.notifications import Notification
from app.schemas.notifications import NotificationOut, NotificationSummaryOut, UnreadByCategoryOut
from app.services.people import blocked_ids, person_out

# Type -> payload keys the clients rely on to build the text and navigate (docs/decisoes/0003).
NOTIFICATION_TYPES: dict[str, frozenset[str]] = {
    'convite_time': frozenset({'team_id', 'team_name', 'invite_id'}),
    'convite_aceito': frozenset({'team_id', 'team_name', 'invite_id'}),
    'pedido_entrada': frozenset({'team_id', 'team_name', 'request_id'}),
    'pedido_entrada_decidido': frozenset({'team_id', 'team_name', 'request_id', 'decision'}),
    'removido_do_time': frozenset({'team_id', 'team_name'}),
    'time_encerrado': frozenset({'team_id', 'team_name'}),
    'pedido_organizador_decidido': frozenset({'request_id', 'decision'}),
    'organizador_revogado': frozenset({'reason'}),
    # Stage 2: events, entries, receipts, refunds and the notice channel (docs/decisoes/0003, section 17).
    'evento_para_aprovar': frozenset({'event_id', 'event_name'}),
    'evento_decidido': frozenset({'event_id', 'event_name', 'decision'}),
    'evento_cancelado': frozenset({'event_id', 'event_name', 'entry_id', 'reason', 'refund'}),
    'evento_revogacao_decidida': frozenset({'event_id', 'event_name', 'decision'}),
    'aviso_evento': frozenset({'event_id', 'event_name', 'message_id'}),
    'time_inscrito': frozenset({'event_id', 'event_name', 'entry_id', 'team_id', 'team_name'}),
    'comprovante_recebido': frozenset({'event_id', 'event_name', 'entry_id', 'receipt_id'}),
    'comprovante_decidido': frozenset({'event_id', 'event_name', 'entry_id', 'receipt_id', 'decision'}),
    'reserva_expirada': frozenset({'event_id', 'event_name', 'entry_id'}),
    'devolucao_enviada': frozenset({'event_id', 'event_name', 'entry_id', 'receipt_id'}),
    'devolucao_confirmada': frozenset({'event_id', 'event_name', 'entry_id', 'receipt_id', 'automatic'}),
    'devolucao_contestada': frozenset({'event_id', 'event_name', 'entry_id', 'receipt_id'}),
    'devolucao_decidida': frozenset({'event_id', 'event_name', 'entry_id', 'receipt_id', 'decision'}),
    # Stage 3: matchmaking, matches, walk-ins, results and courts (docs/decisoes/0002-jogar.md, section 13).
    'proposta_partida': frozenset({'match_id', 'sport', 'format', 'opponent_name', 'expires_at'}),
    'proposta_aceita': frozenset({'match_id', 'opponent_name', 'complete'}),
    'proposta_encerrada': frozenset({'match_id', 'opponent_name', 'reason', 'requeued'}),
    'vaga_encontrada': frozenset({'match_id', 'slot_id', 'position', 'format', 'team_name', 'starts_at',
                                  'expires_at'}),
    'condicoes_propostas': frozenset({'match_id', 'terms_id', 'starts_at', 'court_name'}),
    'partida_agendada': frozenset({'match_id', 'terms_id', 'starts_at', 'court_name', 'changed'}),
    'partida_cancelada': frozenset({'match_id', 'reason'}),
    'wo_registrado': frozenset({'match_id', 'opponent_name', 'contest_until'}),
    'wo_contestado': frozenset({'match_id', 'reason'}),
    'wo_decidido': frozenset({'match_id', 'decision'}),
    'resultado_partida': frozenset({'match_id', 'outcome'}),
    'resultado_divergente': frozenset({'match_id', 'deadline'}),
    'estatistica_contestada': frozenset({'match_id', 'stat_id', 'fields', 'reason'}),
    'vaga_preenchida': frozenset({'match_id', 'slot_id', 'position'}),
    'removido_da_partida': frozenset({'match_id', 'team_name'}),
    'oferta_retirada': frozenset({'match_id', 'slot_id', 'position', 'team_name', 'reason', 'requeued'}),
    'quadra_decidida': frozenset({'court_id', 'court_name', 'decision'}),
    # Stage 4: brackets, schedule and decisions of the organizer (docs/decisoes/0003, section 21).
    'tabela_publicada': frozenset({'event_id', 'event_name'}),
    'adversario_definido': frozenset({'match_id', 'event_id', 'event_name', 'opponent_name'}),
    'divergencia_para_decidir': frozenset({'match_id', 'event_id', 'event_name', 'deadline'}),
    'decisao_registrada': frozenset({'match_id', 'event_id', 'event_name', 'kind'}),
    'evento_encerrado': frozenset({'event_id', 'event_name'}),
}


NotificationCategory = Literal['partidas', 'times', 'eventos', 'conta']

# Type -> category shown by the clients (docs/plano-notificacoes.md). `conta` only appears in the full list.
NOTIFICATION_CATEGORY: dict[str, NotificationCategory] = {
    **dict.fromkeys((
        'proposta_partida', 'proposta_aceita', 'proposta_encerrada', 'vaga_encontrada', 'condicoes_propostas',
        'partida_agendada', 'partida_cancelada', 'wo_registrado', 'wo_contestado', 'wo_decidido', 'resultado_partida',
        'resultado_divergente', 'estatistica_contestada', 'vaga_preenchida', 'removido_da_partida', 'oferta_retirada',
        'adversario_definido', 'divergencia_para_decidir', 'decisao_registrada'), 'partidas'),
    **dict.fromkeys((
        'convite_time', 'convite_aceito', 'pedido_entrada', 'pedido_entrada_decidido', 'removido_do_time',
        'time_encerrado'), 'times'),
    **dict.fromkeys((
        'evento_para_aprovar', 'evento_decidido', 'evento_cancelado', 'evento_revogacao_decidida', 'aviso_evento',
        'time_inscrito', 'comprovante_recebido', 'comprovante_decidido', 'reserva_expirada', 'devolucao_enviada',
        'devolucao_confirmada', 'devolucao_contestada', 'devolucao_decidida', 'tabela_publicada',
        'evento_encerrado'), 'eventos'),
    **dict.fromkeys(('pedido_organizador_decidido', 'organizador_revogado', 'quadra_decidida'), 'conta'),
}
CATEGORY_TYPES: dict[str, tuple[str, ...]] = {
    category: tuple(sorted(name for name, value in NOTIFICATION_CATEGORY.items() if value == category))
    for category in ('partidas', 'times', 'eventos', 'conta')}


def types_of(category: str) -> tuple[str, ...]:
    """Notification types of a category, for `Notification.type.in_(...)`."""
    return CATEGORY_TYPES[category]


# Types that ask the recipient for an answer: they carry an `action_key` until the action is resolved.
ACTION_TYPES: frozenset[str] = frozenset({
    'convite_time', 'pedido_entrada', 'proposta_partida', 'vaga_encontrada', 'condicoes_propostas', 'wo_registrado',
    'resultado_divergente', 'comprovante_decidido', 'devolucao_enviada', 'comprovante_recebido',
    'divergencia_para_decidir', 'evento_para_aprovar', 'devolucao_contestada', 'wo_contestado'})

ACTION_KEY_MAX = 80
# Value of `payload['decision']` in `comprovante_decidido` when the receipt was refused (the only case with action).
RECEIPT_REFUSED = 'recusado'

# Transition switch: while False, action types may still be sent without `action_key`. The next stage turns it on
# once every domain service passes its keys (the other `_check` rules always apply).
REQUIRE_ACTION_KEYS = False


def _needs_key(type_: str, payload: dict) -> bool:
    if type_ == 'comprovante_decidido':
        return payload.get('decision') == RECEIPT_REFUSED
    return type_ in ACTION_TYPES


def _check(type_: str, payload: dict, action_key: str | None = None, informative: bool = False) -> None:
    required = NOTIFICATION_TYPES.get(type_)
    if required is None:
        raise ValueError(f'Tipo de notificação desconhecido: {type_}')
    missing = required - payload.keys()
    if missing:
        raise ValueError(f'Notificação {type_} sem os campos {sorted(missing)}')
    if action_key is not None and informative:
        raise ValueError(f'Notificação {type_} não pode ter chave de ação e ser informativa')
    if action_key is not None:
        if type_ not in ACTION_TYPES:
            raise ValueError(f'Notificação {type_} não pede ação: não aceita action_key')
        if not action_key or len(action_key) > ACTION_KEY_MAX:
            raise ValueError(f'action_key de {type_} deve ter de 1 a {ACTION_KEY_MAX} caracteres')
    elif REQUIRE_ACTION_KEYS and not informative and _needs_key(type_, payload):
        raise ValueError(f'Notificação {type_} pede action_key (ou informative=True para quem não decide)')


def notify(db: Session, user_id: int, type_: str, payload: dict, *, actor_id: int | None = None,
           action_key: str | None = None, action_until: datetime | None = None,
           informative: bool = False) -> Notification | None:
    """Queues a notification for `user_id`. Nobody is notified of their own action (returns None).
    `action_key` marks it as pending until `resolve_actions` closes it (or `action_until` passes); `informative`
    states that a type that usually asks for an answer goes to someone who does not decide."""
    _check(type_, payload, action_key, informative)
    if actor_id is not None and actor_id == user_id:
        return None
    notification = Notification(user_id=user_id, actor_id=actor_id, type=type_, payload=dict(payload),
                                created_at=utcnow(), action_key=action_key, action_until=action_until)
    db.add(notification)
    return notification


def notify_many(db: Session, user_ids: Iterable[int], type_: str, payload: dict, *,
                actor_id: int | None = None, action_key: str | None = None, action_until: datetime | None = None,
                informative: bool = False) -> list[Notification]:
    """Same notification for several recipients (e.g. every representative), once per person."""
    _check(type_, payload, action_key, informative)
    created = []
    for user_id in dict.fromkeys(user_ids):
        notification = notify(db, user_id, type_, payload, actor_id=actor_id, action_key=action_key,
                              action_until=action_until, informative=informative)
        if notification is not None:
            created.append(notification)
    return created


def resolve_actions(db: Session, key: str, *, user_ids: Iterable[int] | None = None) -> int:
    """Closes the open actions with this key (every recipient, or only `user_ids`). No commit: the caller commits
    in the same transaction as the change that resolved them. Returns how many were closed."""
    return resolve_actions_many(db, [key], user_ids=user_ids)


def resolve_actions_many(db: Session, keys: Iterable[str], *, user_ids: Iterable[int] | None = None) -> int:
    """Same as `resolve_actions` for several keys in a single UPDATE."""
    key_list = list(dict.fromkeys(keys))
    recipients = None if user_ids is None else list(dict.fromkeys(user_ids))
    if not key_list or recipients == []:
        return 0
    statement = update(Notification).where(Notification.action_key.in_(key_list), Notification.resolved_at.is_(None))
    if recipients is not None:
        statement = statement.where(Notification.user_id.in_(recipients))
    return db.execute(statement.values(resolved_at=utcnow())).rowcount or 0


def pending_clause(now: datetime) -> ColumnElement[bool]:
    """Open action whose deadline (if any) has not passed. Same rule as `is_pending`."""
    return and_(Notification.action_key.is_not(None), Notification.resolved_at.is_(None),
                or_(Notification.action_until.is_(None), Notification.action_until > now))


def is_pending(item: Notification, now: datetime) -> bool:
    return (item.action_key is not None and item.resolved_at is None
            and (item.action_until is None or item.action_until > now))


def serialize(db: Session, viewer: User, notifications: list[Notification],
              now: datetime | None = None) -> list[NotificationOut]:
    """Resolves actors in one query; inactive or blocked actors are shown as null."""
    now = now or utcnow()
    actor_ids = {item.actor_id for item in notifications if item.actor_id is not None}
    actors = {user.id: user for user in db.scalars(select(User).where(User.id.in_(actor_ids))).all()} if actor_ids else {}
    hidden = blocked_ids(db, viewer.id, actor_ids)
    items = []
    for item in notifications:
        actor = actors.get(item.actor_id)
        visible = actor is not None and actor.active and actor.id not in hidden
        items.append(NotificationOut(id=item.id, type=item.type, category=NOTIFICATION_CATEGORY[item.type],
                                     payload=item.payload or {}, actor=person_out(actor) if visible else None,
                                     created_at=item.created_at, read_at=item.read_at,
                                     pending=is_pending(item, now), action_until=item.action_until))
    return items


def list_page(db: Session, viewer: User, cursor: str | None, limit: int, *, category: str | None = None,
              pending: bool | None = None) -> tuple[list[NotificationOut], str | None]:
    now = utcnow()
    statement = select(Notification).where(Notification.user_id == viewer.id)
    if category is not None:
        statement = statement.where(Notification.type.in_(types_of(category)))
    if pending is not None:
        statement = statement.where(pending_clause(now) if pending else ~pending_clause(now))
    rows, next_cursor = paginate(statement, cursor, limit, Notification.created_at, Notification.id, db)
    return serialize(db, viewer, rows, now), next_cursor


def list_pending(db: Session, viewer: User, *, category: str | None = None, limit: int = 20) -> list[NotificationOut]:
    """Open actions, most urgent first: nearest deadline, no deadline last, then newest."""
    now = utcnow()
    statement = select(Notification).where(Notification.user_id == viewer.id, pending_clause(now))
    if category is not None:
        statement = statement.where(Notification.type.in_(types_of(category)))
    statement = statement.order_by(Notification.action_until.asc().nulls_last(), Notification.created_at.desc(),
                                   Notification.id.desc()).limit(limit)
    return serialize(db, viewer, list(db.scalars(statement).all()), now)


def unread_count(db: Session, user_id: int) -> int:
    return db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user_id, Notification.read_at.is_(None))) or 0


def follow_requests_count(db: Session, user_id: int) -> int:
    """Pending follow requests from active people without a block in either direction (as `/me/follow-requests`)."""
    blocked = exists().where(or_(
        and_(UserBlock.blocker_id == user_id, UserBlock.blocked_id == Follow.follower_id),
        and_(UserBlock.blocked_id == user_id, UserBlock.blocker_id == Follow.follower_id)))
    return db.scalar(select(func.count()).select_from(Follow).join(User, User.id == Follow.follower_id).where(
        Follow.followed_id == user_id, Follow.approved.is_(False), User.active.is_(True), ~blocked)) or 0


def summary(db: Session, user: User) -> NotificationSummaryOut:
    """Counters of the bell, the pinned block and the chips: two aggregate queries, no loop."""
    unread = Notification.read_at.is_(None)
    categories = ('partidas', 'times', 'eventos')
    counts = db.execute(select(
        func.count().filter(unread),
        func.count().filter(pending_clause(utcnow())),
        *(func.count().filter(unread, Notification.type.in_(types_of(name))) for name in categories),
    ).where(Notification.user_id == user.id)).one()
    return NotificationSummaryOut(
        unread_count=counts[0], follow_requests_count=follow_requests_count(db, user.id), pending_count=counts[1],
        unread_by_category=UnreadByCategoryOut(**dict(zip(categories, counts[2:], strict=True))))


def mark_read(db: Session, user_id: int, notification_id: int) -> bool:
    """Marks one of the user's notifications as read (idempotent). False when it is not theirs. Reading never
    resolves a pending action."""
    notification = db.scalar(select(Notification).where(
        Notification.id == notification_id, Notification.user_id == user_id))
    if notification is None:
        return False
    if notification.read_at is None:
        notification.read_at = utcnow()
    return True


def mark_all_read(db: Session, user_id: int) -> int:
    result = db.execute(update(Notification).where(Notification.user_id == user_id, Notification.read_at.is_(None))
                        .values(read_at=utcnow()))
    return result.rowcount or 0

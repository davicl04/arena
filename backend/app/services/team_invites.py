"""Invites, team link and join requests (Times e campeonatos, fases 1 e 2; contrato 0003, seções 4 e 5).

Lock order is always team -> roster -> invite or request, so concurrent decisions serialize on the team row.
"""
from __future__ import annotations

from collections.abc import Callable, Iterable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.pagination import paginate
from app.models.identity import Follow, User, utcnow
from app.models.teams import Team, TeamInvite, TeamJoinRequest, TeamMember
from app.schemas.teams import (
    InviteCandidateOut,
    InviteDecisionResultOut,
    JoinPreviewOut,
    JoinRequestOut,
    TeamInviteReceivedOut,
    TeamInviteSentOut,
    TeamLinkOut,
)
from app.services import audit, notifications, team_links
from app.services.people import block_exists, blocked_between, blocked_ids, person_out, user_search_statement
from app.services.teams import (
    MEMBER,
    REPRESENTATIVE,
    actor_person,
    add_member,
    build_card,
    build_cards,
    get_team,
    load_context,
    lock_row,
    pending_invite,
    pending_request,
    team_context,
    users_by_id,
    visible_person,
)

INVITE_NOT_FOUND = 'Convite não encontrado.'
INVITE_NOT_PENDING = 'Este convite não está mais pendente.'
REQUEST_NOT_FOUND = 'Pedido não encontrado.'
REQUEST_NOT_PENDING = 'Este pedido não está mais pendente.'
ATHLETE_NOT_FOUND = 'Atleta não encontrado.'
ALREADY_IN_ROSTER = 'Este atleta já está no elenco.'
ALREADY_REQUESTED = 'Este atleta já pediu para entrar. Responda em Pedidos para entrar.'
ONLY_REP_INVITE = 'Só representantes podem convidar atletas.'
ONLY_REP_CANCEL_INVITE = 'Só representantes podem cancelar convites.'
ONLY_REP_LINK = 'Só representantes podem ver ou gerar o link do time.'
ONLY_REP_REQUESTS = 'Só representantes podem decidir pedidos para entrar.'
LINK_INVALID = 'Este link não vale mais.'
YOU_ARE_MEMBER = 'Você já está no elenco.'
YOU_HAVE_INVITE = 'Você já tem um convite deste time. Responda em Meus times.'
TRY_AGAIN = 'Não foi possível concluir agora. Tente novamente.'


# --- Pure rules (unit tested) ---------------------------------------------------------------------------

def status_for(user_id: int, members: set[int], invites: dict[int, int], requests: dict[int, int]) -> str:
    """Relation of a person with a team: membro > convite_pendente > pedido_pendente > disponivel."""
    if user_id in members:
        return 'membro'
    if user_id in invites:
        return 'convite_pendente'
    if user_id in requests:
        return 'pedido_pendente'
    return 'disponivel'


def insert_pending(db: Session, row, find_existing: Callable[[], object | None]):
    """Inserts a pending invite or request in a savepoint. A concurrent duplicate (unique partial index)
    returns the pending row that won the race as a resend, or 409 when it is already gone."""
    try:
        with db.begin_nested():
            db.add(row)
            db.flush()
    except IntegrityError:
        existing = find_existing()
        if existing is None:
            raise HTTPException(409, TRY_AGAIN) from None
        return existing, False
    return row, True


# --- Shared helpers ----------------------------------------------------------------------------------

def team_statuses(db: Session, team_id: int, user_ids: Iterable[int]) -> dict[int, tuple[str, int | None, int | None]]:
    """(team_status, pending invite id, pending request id) of several people, in three queries."""
    ids = set(user_ids)
    if not ids:
        return {}
    members = set(db.scalars(select(TeamMember.user_id).where(
        TeamMember.team_id == team_id, TeamMember.user_id.in_(ids), TeamMember.left_at.is_(None))))
    invites = dict(db.execute(select(TeamInvite.invitee_id, TeamInvite.id).where(
        TeamInvite.team_id == team_id, TeamInvite.invitee_id.in_(ids), TeamInvite.state == 'pendente')).all())
    requests = dict(db.execute(select(TeamJoinRequest.user_id, TeamJoinRequest.id).where(
        TeamJoinRequest.team_id == team_id, TeamJoinRequest.user_id.in_(ids),
        TeamJoinRequest.state == 'pendente')).all())
    return {user_id: (status_for(user_id, members, invites, requests), invites.get(user_id), requests.get(user_id))
            for user_id in ids}


def _sent_outs(db: Session, viewer: User, invites: list[TeamInvite]) -> list[TeamInviteSentOut]:
    users = users_by_id(db, [user_id for invite in invites for user_id in (invite.invitee_id, invite.inviter_id)])
    hidden = blocked_ids(db, viewer.id, users)
    return [TeamInviteSentOut(id=invite.id, invitee=visible_person(users[invite.invitee_id], hidden),
                              inviter=actor_person(users.get(invite.inviter_id), hidden), message=invite.message,
                              state=invite.state, created_at=invite.created_at) for invite in invites]


def _request_outs(db: Session, viewer: User, requests: list[TeamJoinRequest]) -> list[JoinRequestOut]:
    users = users_by_id(db, [request.user_id for request in requests])
    hidden = blocked_ids(db, viewer.id, users)
    return [JoinRequestOut(id=request.id, team_id=request.team_id,
                           requester=visible_person(users[request.user_id], hidden), state=request.state,
                           created_at=request.created_at, decided_at=request.decided_at) for request in requests]


# --- Invites (seção 4) -------------------------------------------------------------------------------

def invite_candidates(db: Session, viewer: User, team_id: int, q: str | None, cursor: str | None,
                      limit: int) -> tuple[list[InviteCandidateOut], str | None]:
    """Without `q`, people the representative follows (newest follow first); with `q`, the user search."""
    context = team_context(db, team_id, viewer.id)
    context.require_representative(ONLY_REP_INVITE)
    if q:
        people, next_cursor = paginate(user_search_statement(viewer.id, q), cursor, limit, User.created_at,
                                       User.id, db)
    else:
        statement = select(Follow).join(User, User.id == Follow.followed_id).where(
            Follow.follower_id == viewer.id, Follow.approved.is_(True), User.active.is_(True),
            ~block_exists(viewer.id, User.id))
        follows, next_cursor = paginate(statement, cursor, limit, Follow.created_at, Follow.id, db)
        users = users_by_id(db, [follow.followed_id for follow in follows])
        people = [users[follow.followed_id] for follow in follows]
    statuses = team_statuses(db, context.team.id, [person.id for person in people])
    return [InviteCandidateOut(person=person_out(person), team_status=statuses[person.id][0])
            for person in people], next_cursor


def create_invite(db: Session, viewer: User, team_id: int, invitee_id: int,
                  message: str | None) -> tuple[TeamInviteSentOut, bool]:
    """Returns the invite and whether it was created (False: the pending one, message unchanged)."""
    context = team_context(db, team_id, viewer.id, lock=True)
    context.require_representative(ONLY_REP_INVITE)
    team = context.team
    invitee = db.get(User, invitee_id)
    if invitee is None or not invitee.active or blocked_between(db, viewer.id, invitee.id):
        raise HTTPException(404, ATHLETE_NOT_FOUND)
    if invitee.id in context.roster:
        raise HTTPException(409, ALREADY_IN_ROSTER)
    if pending_request(db, team.id, invitee.id) is not None:
        raise HTTPException(409, ALREADY_REQUESTED)
    existing = pending_invite(db, team.id, invitee.id)
    if existing is not None:
        return _sent_outs(db, viewer, [existing])[0], False
    invite, created = insert_pending(
        db, TeamInvite(team_id=team.id, invitee_id=invitee.id, inviter_id=viewer.id, message=message,
                       state='pendente', created_at=utcnow()),
        lambda: pending_invite(db, team.id, invitee.id))
    if created:
        notifications.notify(db, invitee.id, 'convite_time',
                             {'team_id': team.id, 'team_name': team.name, 'invite_id': invite.id}, actor_id=viewer.id)
        audit.record(db, actor_id=viewer.id, action='convite.criado', target_type='team_invite', target_id=invite.id,
                     data={'team_id': team.id, 'invitee_id': invitee.id})
        db.commit()
    return _sent_outs(db, viewer, [invite])[0], created


def sent_invites(db: Session, viewer: User, team_id: int) -> list[TeamInviteSentOut]:
    context = team_context(db, team_id, viewer.id)
    context.require_representative(ONLY_REP_INVITE)
    invites = db.scalars(select(TeamInvite).where(TeamInvite.team_id == context.team.id,
                                                  TeamInvite.state == 'pendente')
                         .order_by(TeamInvite.created_at.desc(), TeamInvite.id.desc())).all()
    return _sent_outs(db, viewer, list(invites))


def cancel_invite(db: Session, viewer: User, invite_id: int) -> None:
    invite = db.get(TeamInvite, invite_id)
    if invite is None:
        raise HTTPException(404, INVITE_NOT_FOUND)
    context = load_context(db, invite.team_id, viewer.id, lock=True)
    if context is None or context.me is None:
        raise HTTPException(404, INVITE_NOT_FOUND)
    context.require_representative(ONLY_REP_CANCEL_INVITE)
    invite = lock_row(db, TeamInvite, invite_id)
    if invite.state != 'pendente':
        raise HTTPException(409, INVITE_NOT_PENDING)
    invite.state, invite.decided_at, invite.decided_by_id = 'cancelado', utcnow(), viewer.id
    audit.record(db, actor_id=viewer.id, action='convite.cancelado', target_type='team_invite', target_id=invite.id,
                 data={'team_id': invite.team_id, 'invitee_id': invite.invitee_id})
    db.commit()


def received_invites(db: Session, viewer: User) -> list[TeamInviteReceivedOut]:
    """Pending invites of active teams for the viewer (K1), newest first."""
    rows = db.execute(select(TeamInvite, Team).join(Team, Team.id == TeamInvite.team_id).where(
        TeamInvite.invitee_id == viewer.id, TeamInvite.state == 'pendente', Team.state == 'ativo',
    ).order_by(TeamInvite.created_at.desc(), TeamInvite.id.desc())).all()
    teams = list({team.id: team for _, team in rows}.values())
    cards = {card.id: card for card in build_cards(db, viewer.id, teams)}
    inviters = users_by_id(db, [invite.inviter_id for invite, _ in rows])
    hidden = blocked_ids(db, viewer.id, inviters)
    return [TeamInviteReceivedOut(id=invite.id, team=cards[team.id],
                                  inviter=actor_person(inviters.get(invite.inviter_id), hidden),
                                  message=invite.message, created_at=invite.created_at) for invite, team in rows]


def decide_invite(db: Session, viewer: User, invite_id: int, decision: str) -> InviteDecisionResultOut:
    invite = db.get(TeamInvite, invite_id)
    if invite is None or invite.invitee_id != viewer.id:
        raise HTTPException(404, INVITE_NOT_FOUND)
    context = load_context(db, invite.team_id, viewer.id, lock=True)
    invite = lock_row(db, TeamInvite, invite_id)
    if context is None or invite.state != 'pendente':
        raise HTTPException(409, INVITE_NOT_PENDING)
    team = context.team
    now = utcnow()
    invite.decided_at, invite.decided_by_id = now, viewer.id
    if decision == 'recusar':
        invite.state = 'recusado'
        audit.record(db, actor_id=viewer.id, action='convite.recusado', target_type='team_invite',
                     target_id=invite.id, data={'team_id': team.id})
        db.commit()
        return InviteDecisionResultOut(state='recusado', team=None)
    invite.state = 'aceito'
    if viewer.id not in context.roster:
        add_member(db, team, viewer.id, role=MEMBER, joined_via='convite')
        notifications.notify_many(db, context.representative_ids(), 'convite_aceito',
                                  {'team_id': team.id, 'team_name': team.name, 'invite_id': invite.id},
                                  actor_id=viewer.id)
    request = pending_request(db, team.id, viewer.id, lock=True)
    if request is not None:
        request.state, request.decided_at, request.decided_by_id = 'cancelado', now, viewer.id
        audit.record(db, actor_id=viewer.id, action='pedido_entrada.cancelado', target_type='team_join_request',
                     target_id=request.id, data={'team_id': team.id, 'user_id': viewer.id, 'automatico': True})
    audit.record(db, actor_id=viewer.id, action='convite.aceito', target_type='team_invite', target_id=invite.id,
                 data={'team_id': team.id})
    db.commit()
    return InviteDecisionResultOut(state='aceito', team=build_card(db, viewer.id, team))


# --- Team link and join requests (seção 5) ------------------------------------------------------------

def team_link(db: Session, viewer: User, team_id: int, *, regenerate: bool) -> TeamLinkOut:
    """Current link (recomputed from the nonce) or, with `regenerate`, a new one that voids the previous."""
    context = team_context(db, team_id, viewer.id, lock=True)
    context.require_representative(ONLY_REP_LINK)
    team = context.team
    if regenerate or team.link_nonce is None:
        token, changed = team_links.issue(team), True
        if regenerate:
            audit.record(db, actor_id=viewer.id, action='time.link_gerado', target_type='team', target_id=team.id)
    else:
        token, changed = team_links.current_token(team)
    if changed:
        db.commit()
    return TeamLinkOut(url=team_links.join_url(token), token=token, generated_at=team.link_generated_at)


def join_preview(db: Session, viewer: User, token: str) -> JoinPreviewOut:
    team = team_links.find_team(db, token)
    if team is None:
        raise HTTPException(404, LINK_INVALID)
    status, invite_id, request_id = team_statuses(db, team.id, [viewer.id])[viewer.id]
    return JoinPreviewOut(team=build_card(db, viewer.id, team), my_status=status, invite_id=invite_id,
                          request_id=request_id)


def request_to_join(db: Session, viewer: User, token: str) -> tuple[JoinRequestOut, bool]:
    team = team_links.find_team(db, token, for_update=True)
    if team is None:
        raise HTTPException(404, LINK_INVALID)
    context = load_context(db, team.id, viewer.id, lock=True)
    if context.me is not None:
        raise HTTPException(409, YOU_ARE_MEMBER)
    if pending_invite(db, team.id, viewer.id) is not None:
        raise HTTPException(409, YOU_HAVE_INVITE)
    existing = pending_request(db, team.id, viewer.id)
    if existing is not None:
        return _request_outs(db, viewer, [existing])[0], False
    request, created = insert_pending(
        db, TeamJoinRequest(team_id=team.id, user_id=viewer.id, state='pendente', created_at=utcnow()),
        lambda: pending_request(db, team.id, viewer.id))
    if created:
        notifications.notify_many(db, context.representative_ids(), 'pedido_entrada',
                                  {'team_id': team.id, 'team_name': team.name, 'request_id': request.id},
                                  actor_id=viewer.id)
        audit.record(db, actor_id=viewer.id, action='pedido_entrada.criado', target_type='team_join_request',
                     target_id=request.id, data={'team_id': team.id})
        db.commit()
    return _request_outs(db, viewer, [request])[0], created


def cancel_request(db: Session, viewer: User, request_id: int) -> None:
    request = db.get(TeamJoinRequest, request_id)
    if request is None or request.user_id != viewer.id:
        raise HTTPException(404, REQUEST_NOT_FOUND)
    get_team(db, request.team_id, lock=True)
    request = lock_row(db, TeamJoinRequest, request_id)
    if request.state != 'pendente':
        raise HTTPException(409, REQUEST_NOT_PENDING)
    request.state, request.decided_at, request.decided_by_id = 'cancelado', utcnow(), viewer.id
    audit.record(db, actor_id=viewer.id, action='pedido_entrada.cancelado', target_type='team_join_request',
                 target_id=request.id, data={'team_id': request.team_id})
    db.commit()


def join_requests(db: Session, viewer: User, team_id: int) -> list[JoinRequestOut]:
    context = team_context(db, team_id, viewer.id)
    context.require_representative(ONLY_REP_REQUESTS)
    requests = db.scalars(select(TeamJoinRequest).where(TeamJoinRequest.team_id == context.team.id,
                                                        TeamJoinRequest.state == 'pendente')
                          .order_by(TeamJoinRequest.created_at.desc(), TeamJoinRequest.id.desc())).all()
    return _request_outs(db, viewer, list(requests))


def decide_request(db: Session, viewer: User, request_id: int, decision: str) -> JoinRequestOut:
    request = db.get(TeamJoinRequest, request_id)
    if request is None:
        raise HTTPException(404, REQUEST_NOT_FOUND)
    context = load_context(db, request.team_id, viewer.id, lock=True)
    if (context is None or context.me is None) and request.user_id != viewer.id:
        raise HTTPException(404, REQUEST_NOT_FOUND)
    if context is None or context.me is None or context.me.role != REPRESENTATIVE:
        raise HTTPException(403, ONLY_REP_REQUESTS)
    request = lock_row(db, TeamJoinRequest, request_id)
    if request.state != 'pendente':
        raise HTTPException(409, REQUEST_NOT_PENDING)
    team = context.team
    now = utcnow()
    approved = decision == 'aprovar'
    request.state, request.decided_at, request.decided_by_id = ('aprovado' if approved else 'recusado'), now, viewer.id
    if approved:
        if request.user_id not in context.roster:
            add_member(db, team, request.user_id, role=MEMBER, joined_via='pedido')
        invite = pending_invite(db, team.id, request.user_id, lock=True)
        if invite is not None:
            invite.state, invite.decided_at, invite.decided_by_id = 'cancelado', now, viewer.id
            audit.record(db, actor_id=viewer.id, action='convite.cancelado', target_type='team_invite',
                         target_id=invite.id, data={'team_id': team.id, 'invitee_id': request.user_id,
                                                    'automatico': True})
    notifications.notify(db, request.user_id, 'pedido_entrada_decidido',
                         {'team_id': team.id, 'team_name': team.name, 'request_id': request.id,
                          'decision': request.state}, actor_id=viewer.id)
    audit.record(db, actor_id=viewer.id, action=f'pedido_entrada.{request.state}', target_type='team_join_request',
                 target_id=request.id, data={'team_id': team.id, 'user_id': request.user_id})
    db.commit()
    return _request_outs(db, viewer, [request])[0]

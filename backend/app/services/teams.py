"""Teams, roster and roles (Times e campeonatos, fase 1): visibility, team card C5 and roster transitions.

Every change locks the team row and then its active roster rows (SELECT ... FOR UPDATE) before reading
them, so "at least one active representative" holds under concurrency. The transition, its notifications
and its audit entry go in the same commit. Contract: docs/decisoes/0003-times-campeonatos.md, seção 3.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.identity import City, MediaObject, SportsProfile, User, utcnow
from app.models.teams import Team, TeamInvite, TeamJoinRequest, TeamMember
from app.schemas.common import PersonOut
from app.schemas.identity import CityOut
from app.schemas.teams import RosterPreviewItemOut, TeamCardOut, TeamMemberOut, TeamUpdateInput
from app.services import audit, notifications, team_links
from app.services.entries import team_ensure_no_active_entry
from app.services.people import avatar_url, blocked_ids, person_out
from app.services.rankings import team_format_grid

REPRESENTATIVE = 'representante'
MEMBER = 'membro'
ROSTER_PREVIEW_SIZE = 11

TEAM_NOT_FOUND = 'Time não encontrado.'
NOT_IN_ROSTER = 'Atleta não está no elenco.'
CITY_NOT_IN_CATALOG = 'Selecione uma cidade do catálogo.'
CREST_NOT_FOUND = 'Brasão não encontrado.'
ONLY_REP_EDIT = 'Só representantes podem editar o time.'
ONLY_REP_CREST = 'Só representantes podem trocar o brasão.'
ONLY_REP_ROLE = 'Só representantes podem mudar a braçadeira.'
ONLY_REP_REMOVE = 'Só representantes podem remover atletas.'
ONLY_REP_CLOSE = 'Só representantes podem encerrar o time.'
OWN_POSITION = 'Cada atleta escolhe a própria posição no time.'
LAST_REPRESENTATIVE_ROLE = 'O time precisa de pelo menos um representante. Passe a braçadeira a outro atleta antes.'
LAST_REPRESENTATIVE_LEAVE = 'Você é o último representante. Passe a braçadeira a outro atleta ou encerre o time.'
ALREADY_CLOSED = 'Este time já foi encerrado.'


# --- Pure rules (unit tested) ---------------------------------------------------------------------------

def first_name(name: str) -> str:
    parts = name.split()
    return parts[0] if parts else ''


def roster_key(member: TeamMember):
    """Representatives first, then the oldest stay, then the row id."""
    return (member.role != REPRESENTATIVE, member.joined_at, member.id)


def representative_count(members: Iterable[TeamMember]) -> int:
    return sum(1 for member in members if member.role == REPRESENTATIVE)


def ensure_representative_remains(members: Iterable[TeamMember], leaving: TeamMember, message: str) -> None:
    """409 when `leaving` (stepping down, leaving or being removed) is the team's only active representative."""
    if leaving.role == REPRESENTATIVE and representative_count(members) <= 1:
        raise HTTPException(409, message)


def ensure_closable(db: Session, team: Team) -> None:
    """The (locked) team must be active and without entries in play (stage 2: a spot held in an open event or a
    refund in progress). The match phase adds its scheduled matches to the same
    `409 Encerre ou cancele as partidas agendadas e as inscrições ativas antes de encerrar o time.`"""
    if team.state != 'ativo':
        raise HTTPException(409, ALREADY_CLOSED)
    team_ensure_no_active_entry(db, team)


def visible_person(user: User, hidden: set[int]) -> PersonOut:
    """Person shown in a list: the avatar is hidden for blocks either way and for inactive accounts."""
    return person_out(user, blocked=user.id in hidden or not user.active)


def actor_person(user: User | None, hidden: set[int]) -> PersonOut | None:
    """Who acted (inviter): null when the account is gone, inactive or blocked either way."""
    if user is None or not user.active or user.id in hidden:
        return None
    return person_out(user)


# --- Loading and locking ---------------------------------------------------------------------------------

def get_team(db: Session, team_id: int, *, lock: bool = False) -> Team | None:
    statement = select(Team).where(Team.id == team_id)
    if lock:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    return db.scalar(statement)


def lock_row(db: Session, model, row_id: int):
    """Re-reads one invite or request with FOR UPDATE (after the team lock) and refreshes the loaded copy."""
    return db.scalar(select(model).where(model.id == row_id).with_for_update()
                     .execution_options(populate_existing=True))


def active_roster(db: Session, team_id: int, *, lock: bool = False) -> dict[int, TeamMember]:
    statement = select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.left_at.is_(None)) \
        .order_by(TeamMember.id)
    if lock:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    return {member.user_id: member for member in db.scalars(statement)}


def users_by_id(db: Session, ids: Iterable[int | None]) -> dict[int, User]:
    wanted = {user_id for user_id in ids if user_id is not None}
    if not wanted:
        return {}
    return {user.id: user for user in db.scalars(select(User).where(User.id.in_(wanted)))}


def pending_invite(db: Session, team_id: int, user_id: int, *, lock: bool = False) -> TeamInvite | None:
    statement = select(TeamInvite).where(TeamInvite.team_id == team_id, TeamInvite.invitee_id == user_id,
                                         TeamInvite.state == 'pendente')
    if lock:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    return db.scalar(statement)


def pending_request(db: Session, team_id: int, user_id: int, *, lock: bool = False) -> TeamJoinRequest | None:
    statement = select(TeamJoinRequest).where(TeamJoinRequest.team_id == team_id, TeamJoinRequest.user_id == user_id,
                                              TeamJoinRequest.state == 'pendente')
    if lock:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    return db.scalar(statement)


def has_pending_link(db: Session, team_id: int, user_id: int) -> bool:
    """Pending invite of the team for the user, or pending join request of the user."""
    invite = select(TeamInvite.id).where(TeamInvite.team_id == team_id, TeamInvite.invitee_id == user_id,
                                         TeamInvite.state == 'pendente').exists()
    request = select(TeamJoinRequest.id).where(TeamJoinRequest.team_id == team_id, TeamJoinRequest.user_id == user_id,
                                               TeamJoinRequest.state == 'pendente').exists()
    return bool(db.scalar(select(or_(invite, request))))


@dataclass
class TeamContext:
    team: Team
    roster: dict[int, TeamMember]
    me: TeamMember | None

    def require_representative(self, message: str) -> None:
        if self.me is None or self.me.role != REPRESENTATIVE:
            raise HTTPException(403, message)

    def representative_ids(self) -> list[int]:
        return [user_id for user_id, member in self.roster.items() if member.role == REPRESENTATIVE]


def load_context(db: Session, team_id: int, viewer_id: int, *, lock: bool = False) -> TeamContext | None:
    """Active team with its active roster (both locked when `lock`), without any visibility check."""
    team = get_team(db, team_id, lock=lock)
    if team is None or team.state != 'ativo':
        return None
    roster = active_roster(db, team.id, lock=lock)
    return TeamContext(team, roster, roster.get(viewer_id))


def _visible(db: Session, context: TeamContext | None, viewer_id: int) -> bool:
    return context is not None and (context.me is not None or has_pending_link(db, context.team.id, viewer_id))


def team_context(db: Session, team_id: int, viewer_id: int, *, lock: bool = False) -> TeamContext:
    """Active team visible to the viewer (member, pending invite or pending join request); 404 otherwise.

    With `lock`, the visibility is checked first without any lock, so someone who cannot see the team never holds
    (or waits for) its row; only then the team and the roster are locked and checked again (`lock_context`).
    """
    context = load_context(db, team_id, viewer_id)
    if not _visible(db, context, viewer_id):
        raise HTTPException(404, TEAM_NOT_FOUND)
    return lock_context(db, context, viewer_id) if lock else context


def lock_context(db: Session, context: TeamContext, viewer_id: int, *,
                 representative: str | None = None) -> TeamContext:
    """Locks the team and its active roster (FOR UPDATE, fresh rows) for a context already authorized without
    locks, and repeats the checks: meanwhile the team may have closed (404) or the viewer may have left or lost the
    armband (403 with `representative`). Changes that depend on the roster (the last representative) are decided
    on this locked copy."""
    locked = load_context(db, context.team.id, viewer_id, lock=True)
    if not _visible(db, locked, viewer_id):
        raise HTTPException(404, TEAM_NOT_FOUND)
    if representative is not None:
        locked.require_representative(representative)
    return locked


def representative_context(db: Session, team_id: int, viewer_id: int, message: str, *,
                           lock: bool = False) -> TeamContext:
    """Visible team (404) where the viewer is a representative (403 with `message`), authorized without locks;
    with `lock`, only then locked and checked again."""
    context = team_context(db, team_id, viewer_id)
    context.require_representative(message)
    return lock_context(db, context, viewer_id, representative=message) if lock else context


def require_city(db: Session, city_id: int) -> None:
    if db.get(City, city_id) is None:
        raise HTTPException(422, CITY_NOT_IN_CATALOG)


def profile_position(db: Session, user_id: int) -> str | None:
    """Preferred position of the athlete's own football profile, copied to the roster on entry."""
    return db.scalar(select(SportsProfile.position).where(SportsProfile.user_id == user_id,
                                                          SportsProfile.sport == 'futebol'))


def add_member(db: Session, team: Team, user_id: int, *, role: str, joined_via: str) -> TeamMember:
    member = TeamMember(team_id=team.id, user_id=user_id, role=role, joined_via=joined_via,
                        position=profile_position(db, user_id), joined_at=utcnow())
    db.add(member)
    db.flush()
    return member


# --- Team card C5 and roster -------------------------------------------------------------------------

def _pending_counts(db: Session, model, team_ids: list[int]) -> dict[int, int]:
    if not team_ids:
        return {}
    return dict(db.execute(select(model.team_id, func.count()).where(
        model.team_id.in_(team_ids), model.state == 'pendente').group_by(model.team_id)).all())


def build_cards(db: Session, viewer_id: int, teams: Sequence[Team]) -> list[TeamCardOut]:
    """Cards of several teams with a fixed number of queries (cities, rosters, blocks, counts and the grid)."""
    if not teams:
        return []
    ids = [team.id for team in teams]
    cities = {city.id: city for city in db.scalars(select(City).where(City.id.in_({team.city_id for team in teams})))}
    rows = db.execute(select(TeamMember, User).join(User, User.id == TeamMember.user_id)
                      .where(TeamMember.team_id.in_(ids), TeamMember.left_at.is_(None))).all()
    hidden = blocked_ids(db, viewer_id, {user.id for _, user in rows})
    rosters: dict[int, list[tuple[TeamMember, User]]] = defaultdict(list)
    for member, user in rows:
        rosters[member.team_id].append((member, user))
    roles = {member.team_id: member.role for member, _ in rows if member.user_id == viewer_id}
    represented = [team_id for team_id, role in roles.items() if role == REPRESENTATIVE]
    invites = _pending_counts(db, TeamInvite, represented)
    requests = _pending_counts(db, TeamJoinRequest, represented)
    grid = team_format_grid(db, ids)
    cards = []
    for team in teams:
        roster = sorted(rosters[team.id], key=lambda pair: roster_key(pair[0]))
        my_role = roles.get(team.id)
        representative = my_role == REPRESENTATIVE
        preview = [RosterPreviewItemOut(
            user_id=user.id, first_name=first_name(user.name),
            avatar_url=None if user.id in hidden or not user.active else avatar_url(user),
            position=member.position, is_representative=member.role == REPRESENTATIVE,
        ) for member, user in roster[:ROSTER_PREVIEW_SIZE]]
        cards.append(TeamCardOut(
            id=team.id, name=team.name, initials=team.initials, city=CityOut.model_validate(cities[team.city_id]),
            crest_url=team.crest_url, my_role=my_role, member_count=len(roster),
            representative_count=representative_count(member for member, _ in roster), roster_preview=preview,
            formats=grid[team.id],
            pending_join_requests=requests.get(team.id, 0) if representative else None,
            pending_invites=invites.get(team.id, 0) if representative else None,
            created_at=team.created_at,
        ))
    return cards


def build_card(db: Session, viewer_id: int, team: Team) -> TeamCardOut:
    return build_cards(db, viewer_id, [team])[0]


def member_out(member: TeamMember, user: User, viewer_id: int, hidden: set[int]) -> TeamMemberOut:
    return TeamMemberOut(user_id=user.id, name=user.name, first_name=first_name(user.name), username=user.username,
                         avatar_url=visible_person(user, hidden).avatar_url, position=member.position,
                         role=member.role, joined_at=member.joined_at, is_me=user.id == viewer_id)


def my_teams(db: Session, viewer: User) -> list[TeamCardOut]:
    teams = db.scalars(select(Team).join(TeamMember, TeamMember.team_id == Team.id).where(
        TeamMember.user_id == viewer.id, TeamMember.left_at.is_(None), Team.state == 'ativo',
    ).order_by((TeamMember.role == REPRESENTATIVE).desc(), TeamMember.joined_at, Team.id)).all()
    return build_cards(db, viewer.id, teams)


def get_card(db: Session, viewer: User, team_id: int) -> TeamCardOut:
    return build_card(db, viewer.id, team_context(db, team_id, viewer.id).team)


def list_members(db: Session, viewer: User, team_id: int) -> list[TeamMemberOut]:
    context = team_context(db, team_id, viewer.id)
    users = users_by_id(db, context.roster)
    hidden = blocked_ids(db, viewer.id, users)
    return [member_out(member, users[member.user_id], viewer.id, hidden)
            for member in sorted(context.roster.values(), key=roster_key)]


# --- Transitions -------------------------------------------------------------------------------------

def create_team(db: Session, viewer: User, name: str, city_id: int) -> TeamCardOut:
    require_city(db, city_id)
    team = Team(name=name, city_id=city_id, created_by_id=viewer.id, state='ativo', created_at=utcnow())
    db.add(team)
    db.flush()
    team_links.issue(team)
    add_member(db, team, viewer.id, role=REPRESENTATIVE, joined_via='criacao')
    audit.record(db, actor_id=viewer.id, action='time.criado', target_type='team', target_id=team.id,
                 data={'name': name, 'city_id': city_id})
    db.commit()
    return build_card(db, viewer.id, team)


def update_team(db: Session, viewer: User, team_id: int, data: TeamUpdateInput) -> TeamCardOut:
    context = representative_context(db, team_id, viewer.id, ONLY_REP_EDIT, lock=True)
    team = context.team
    changes: dict[str, object] = {}
    if data.name is not None and data.name != team.name:
        changes['name'] = data.name
    if data.city_id is not None and data.city_id != team.city_id:
        require_city(db, data.city_id)
        changes['city_id'] = data.city_id
    if changes:
        for field, value in changes.items():
            setattr(team, field, value)
        audit.record(db, actor_id=viewer.id, action='time.editado', target_type='team', target_id=team.id,
                     data=changes)
    db.commit()
    return build_card(db, viewer.id, team)


def update_member(db: Session, viewer: User, team_id: int, user_id: int, *, fields: set[str],
                  role: str | None, position: str | None) -> TeamMemberOut:
    context = team_context(db, team_id, viewer.id, lock=True)
    if 'role' in fields:
        context.require_representative(ONLY_REP_ROLE)
    if 'position' in fields and user_id != viewer.id:
        raise HTTPException(403, OWN_POSITION)
    target = context.roster.get(user_id)
    if target is None:
        raise HTTPException(404, NOT_IN_ROSTER)
    if 'role' in fields and role != target.role:
        if role == MEMBER:
            ensure_representative_remains(context.roster.values(), target, LAST_REPRESENTATIVE_ROLE)
        target.role = role
        audit.record(db, actor_id=viewer.id, action='membro.papel_alterado', target_type='team_member',
                     target_id=target.id, data={'team_id': context.team.id, 'user_id': user_id, 'role': role})
    if 'position' in fields:
        target.position = position
    db.commit()
    users = users_by_id(db, [user_id])
    return member_out(target, users[user_id], viewer.id, blocked_ids(db, viewer.id, users))


def remove_member(db: Session, viewer: User, team_id: int, user_id: int) -> None:
    """Leaving (the viewer) or removing (another athlete, by a representative); the stay stays as history."""
    context = team_context(db, team_id, viewer.id, lock=True)
    team = context.team
    now = utcnow()
    if user_id == viewer.id:
        if context.me is None:
            raise HTTPException(404, NOT_IN_ROSTER)
        ensure_representative_remains(context.roster.values(), context.me, LAST_REPRESENTATIVE_LEAVE)
        context.me.left_at, context.me.left_reason = now, 'saiu'
        audit.record(db, actor_id=viewer.id, action='membro.saiu', target_type='team_member',
                     target_id=context.me.id, data={'team_id': team.id, 'user_id': user_id})
    else:
        context.require_representative(ONLY_REP_REMOVE)
        target = context.roster.get(user_id)
        if target is None:
            raise HTTPException(404, NOT_IN_ROSTER)
        ensure_representative_remains(context.roster.values(), target, LAST_REPRESENTATIVE_ROLE)
        target.left_at, target.left_reason, target.removed_by_id = now, 'removido', viewer.id
        notifications.notify(db, user_id, 'removido_do_time', {'team_id': team.id, 'team_name': team.name},
                             actor_id=viewer.id)
        audit.record(db, actor_id=viewer.id, action='membro.removido', target_type='team_member',
                     target_id=target.id, data={'team_id': team.id, 'user_id': user_id})
    db.commit()


def close_team(db: Session, viewer: User, team_id: int) -> None:
    """Closes the team: the roster, invites and requests stay as history; the link dies with it."""
    context = representative_context(db, team_id, viewer.id, ONLY_REP_CLOSE, lock=True)
    team = context.team
    ensure_closable(db, team)
    now = utcnow()
    team.state, team.closed_at, team.closed_by_id = 'encerrado', now, viewer.id
    team.link_nonce = team.link_token_hash = team.link_generated_at = None
    for member in context.roster.values():
        member.left_at, member.left_reason = now, 'time_encerrado'
    automatic = {'team_id': team.id, 'automatico': True}
    for invite in db.scalars(select(TeamInvite).where(TeamInvite.team_id == team.id, TeamInvite.state == 'pendente')
                             .with_for_update().execution_options(populate_existing=True)).all():
        invite.state, invite.decided_at, invite.decided_by_id = 'cancelado', now, viewer.id
        audit.record(db, actor_id=viewer.id, action='convite.cancelado', target_type='team_invite',
                     target_id=invite.id, data={**automatic, 'invitee_id': invite.invitee_id})
    for request in db.scalars(select(TeamJoinRequest).where(TeamJoinRequest.team_id == team.id,
                                                            TeamJoinRequest.state == 'pendente')
                              .with_for_update().execution_options(populate_existing=True)).all():
        request.state, request.decided_at, request.decided_by_id = 'cancelado', now, viewer.id
        audit.record(db, actor_id=viewer.id, action='pedido_entrada.cancelado', target_type='team_join_request',
                     target_id=request.id, data={**automatic, 'user_id': request.user_id})
    notifications.notify_many(db, list(context.roster), 'time_encerrado',
                              {'team_id': team.id, 'team_name': team.name}, actor_id=viewer.id)
    audit.record(db, actor_id=viewer.id, action='time.encerrado', target_type='team', target_id=team.id,
                 data={'member_count': len(context.roster)})
    db.commit()


# --- Crest ------------------------------------------------------------------------------------------

def crest_team(db: Session, viewer: User, team_id: int, *, lock: bool = False) -> Team:
    """Team whose crest the viewer may change (representative)."""
    return representative_context(db, team_id, viewer.id, ONLY_REP_CREST, lock=lock).team


def crest_media(db: Session, team_id: int, version: uuid.UUID) -> MediaObject:
    """Current crest of an active team; any other version answers 404."""
    team = get_team(db, team_id)
    media = db.get(MediaObject, version) if team is not None and team.crest_media_id == version else None
    if media is None or team.state != 'ativo':
        raise HTTPException(404, CREST_NOT_FOUND)
    return media

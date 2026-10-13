"""Times, elenco, convites, link do time e pedidos de entrada (Times e campeonatos, fases 1 e 2).

Contrato: docs/decisoes/0003-times-campeonatos.md, seções 3 a 5. As regras ficam em app/services/teams.py
e app/services/team_invites.py; aqui só entram sessão, corpo e códigos de resposta.
"""
import uuid

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from fastapi.responses import Response as BinaryResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import PAGE_DEFAULT, PAGE_MAX
from app.core.security import current_user
from app.models.identity import User
from app.routers.identity import _read_upload
from app.schemas.common import EmptyInput
from app.schemas.teams import (
    InviteCandidatePage,
    InviteCreateInput,
    InviteDecisionInput,
    InviteDecisionResultOut,
    JoinPreviewOut,
    JoinRequestDecisionInput,
    JoinRequestList,
    JoinRequestOut,
    MemberUpdateInput,
    TeamCardList,
    TeamCardOut,
    TeamCreateInput,
    TeamInviteReceivedList,
    TeamInviteSentList,
    TeamInviteSentOut,
    TeamLinkOut,
    TeamMemberList,
    TeamMemberOut,
    TeamUpdateInput,
)
from app.services import media, team_invites, teams

router = APIRouter(prefix='/api/v1')


def _no_content() -> Response:
    return Response(status_code=204)


# --- Times (seção 3) ---------------------------------------------------------------------------------

@router.post('/teams', response_model=TeamCardOut, status_code=201)
def create_team(data: TeamCreateInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return teams.create_team(db, user, data.name, data.city_id)


@router.get('/me/teams', response_model=TeamCardList)
def my_teams(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return TeamCardList(items=teams.my_teams(db, user))


@router.get('/teams/{team_id}', response_model=TeamCardOut)
def get_team(team_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return teams.get_card(db, user, team_id)


@router.patch('/teams/{team_id}', response_model=TeamCardOut)
def update_team(team_id: int, data: TeamUpdateInput, user: User = Depends(current_user),
                db: Session = Depends(get_db)):
    return teams.update_team(db, user, team_id, data)


@router.put('/teams/{team_id}/crest', response_model=TeamCardOut)
async def put_crest(team_id: int, file: UploadFile = File(...), user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    # Permission first (no lock), then the costly normalization, then the swap under the team lock.
    teams.crest_team(db, user, team_id)
    normalized = media.normalize_crest(await _read_upload(file))
    team = teams.crest_team(db, user, team_id, lock=True)
    media.store_team_crest(db, team, normalized, user.id)
    return teams.build_card(db, user.id, team)


@router.delete('/teams/{team_id}/crest', status_code=204)
def delete_crest(team_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    media.clear_team_crest(db, teams.crest_team(db, user, team_id, lock=True))
    return _no_content()


@router.get('/teams/{team_id}/crest')
def get_crest(team_id: int, v: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    crest = teams.crest_media(db, team_id, v)
    return BinaryResponse(media.read_object(crest), media_type=crest.content_type, headers={
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    })


@router.post('/teams/{team_id}/close', status_code=204)
def close_team(team_id: int, _: EmptyInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    teams.close_team(db, user, team_id)
    return _no_content()


@router.get('/teams/{team_id}/members', response_model=TeamMemberList)
def list_members(team_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return TeamMemberList(items=teams.list_members(db, user, team_id))


@router.patch('/teams/{team_id}/members/{user_id}', response_model=TeamMemberOut)
def update_member(team_id: int, user_id: int, data: MemberUpdateInput, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    return teams.update_member(db, user, team_id, user_id, fields=set(data.model_fields_set), role=data.role,
                               position=data.position)


@router.delete('/teams/{team_id}/members/{user_id}', status_code=204)
def remove_member(team_id: int, user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    teams.remove_member(db, user, team_id, user_id)
    return _no_content()


# --- Convites (seção 4) ------------------------------------------------------------------------------

@router.get('/teams/{team_id}/invite-candidates', response_model=InviteCandidatePage)
def invite_candidates(team_id: int, q: str | None = Query(None, max_length=100), cursor: str | None = None,
                      limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX), user: User = Depends(current_user),
                      db: Session = Depends(get_db)):
    items, next_cursor = team_invites.invite_candidates(db, user, team_id, q, cursor, limit)
    return InviteCandidatePage(items=items, next_cursor=next_cursor)


@router.post('/teams/{team_id}/invites', response_model=TeamInviteSentOut, status_code=201)
def create_invite(team_id: int, data: InviteCreateInput, response: Response, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    invite, created = team_invites.create_invite(db, user, team_id, data.user_id, data.message)
    if not created:
        response.status_code = 200
    return invite


@router.get('/teams/{team_id}/invites', response_model=TeamInviteSentList)
def sent_invites(team_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return TeamInviteSentList(items=team_invites.sent_invites(db, user, team_id))


@router.delete('/team-invites/{invite_id}', status_code=204)
def cancel_invite(invite_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    team_invites.cancel_invite(db, user, invite_id)
    return _no_content()


@router.get('/me/team-invites', response_model=TeamInviteReceivedList)
def received_invites(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return TeamInviteReceivedList(items=team_invites.received_invites(db, user))


@router.put('/team-invites/{invite_id}', response_model=InviteDecisionResultOut)
def decide_invite(invite_id: int, data: InviteDecisionInput, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    return team_invites.decide_invite(db, user, invite_id, data.decision)


# --- Link do time e pedidos de entrada (seção 5) ------------------------------------------------------

@router.get('/teams/{team_id}/invite-link', response_model=TeamLinkOut)
def get_invite_link(team_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return team_invites.team_link(db, user, team_id, regenerate=False)


@router.post('/teams/{team_id}/invite-link', response_model=TeamLinkOut)
def new_invite_link(team_id: int, _: EmptyInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return team_invites.team_link(db, user, team_id, regenerate=True)


@router.get('/join/{token}', response_model=JoinPreviewOut)
def join_preview(token: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return team_invites.join_preview(db, user, token)


@router.post('/join/{token}', response_model=JoinRequestOut, status_code=201)
def request_to_join(token: str, _: EmptyInput, response: Response, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    request, created = team_invites.request_to_join(db, user, token)
    if not created:
        response.status_code = 200
    return request


@router.delete('/team-join-requests/{request_id}', status_code=204)
def cancel_join_request(request_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    team_invites.cancel_request(db, user, request_id)
    return _no_content()


@router.get('/teams/{team_id}/join-requests', response_model=JoinRequestList)
def join_requests(team_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return JoinRequestList(items=team_invites.join_requests(db, user, team_id))


@router.put('/team-join-requests/{request_id}', response_model=JoinRequestOut)
def decide_join_request(request_id: int, data: JoinRequestDecisionInput, user: User = Depends(current_user),
                        db: Session = Depends(get_db)):
    return team_invites.decide_request(db, user, request_id, data.decision)

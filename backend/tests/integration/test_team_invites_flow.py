"""Invites, team link and join requests on PostgreSQL: decisions, permissions, blocks and notifications."""
import uuid

from sqlalchemy import select

from app.models.identity import MediaObject, User, UserBlock, utcnow
from app.models.teams import Team, TeamInvite, TeamJoinRequest, TeamMember
from tests.integration.team_helpers import (
    audit_actions,
    create_team,
    follow,
    invite,
    join_by_invite,
    link_token,
    notifications,
    register,
    set_position,
)


def test_invite_accept_creates_membership_and_notifies_representatives(client):
    http, db = client
    owner, owner_id = register(http, 'convite-dono@example.com', 'Caio Ramos')
    guest, guest_id = register(http, 'convite-guest@example.com', 'Lia Souza')
    set_position(http, guest, 'defesa')
    team = create_team(http, owner)
    team_id = team['id']

    created = invite(http, owner, team_id, guest_id, '  Bora jogar sábado  ')
    assert created.status_code == 201
    sent = created.json()
    assert (sent['state'], sent['message'], sent['invitee']['id'], sent['inviter']['id']) == (
        'pendente', 'Bora jogar sábado', guest_id, owner_id)
    repeated = invite(http, owner, team_id, guest_id, 'Outra mensagem')
    assert repeated.status_code == 200 and repeated.json() == sent
    assert invite(http, owner, team_id, guest_id, 'x' * 141).status_code == 422
    assert http.post(f'/api/v1/teams/{team_id}/invites', json={'user_id': guest_id, 'team_id': 1},
                     headers=owner).status_code == 422
    assert http.get(f'/api/v1/teams/{team_id}/invites', headers=owner).json() == {'items': [sent]}
    assert http.get(f'/api/v1/teams/{team_id}', headers=owner).json()['pending_invites'] == 1

    notice = notifications(http, guest, 'convite_time')
    assert len(notice) == 1 and notice[0]['actor']['id'] == owner_id
    assert notice[0]['payload'] == {'team_id': team_id, 'team_name': 'Leões do Cerrado', 'invite_id': sent['id']}
    received = http.get('/api/v1/me/team-invites', headers=guest).json()['items']
    assert len(received) == 1
    card = received[0]
    assert (card['id'], card['message'], card['inviter']['id']) == (sent['id'], 'Bora jogar sábado', owner_id)
    assert card['team']['my_role'] is None and card['team']['pending_invites'] is None
    assert card['team']['roster_preview'][0]['user_id'] == owner_id

    # A pending invite lets the guest see the team, but not act as a representative.
    visible = http.get(f'/api/v1/teams/{team_id}', headers=guest)
    assert visible.status_code == 200 and visible.json()['my_role'] is None
    assert http.get(f'/api/v1/teams/{team_id}/members', headers=guest).status_code == 200
    assert http.patch(f'/api/v1/teams/{team_id}', json={'name': 'Golpe'}, headers=guest).status_code == 403
    assert http.delete(f'/api/v1/teams/{team_id}/members/{guest_id}', headers=guest).status_code == 404

    decision_path = f"/api/v1/team-invites/{sent['id']}"
    assert http.put(decision_path, json={'decision': 'talvez'}, headers=guest).status_code == 422
    assert http.put(decision_path, json={'decision': 'aceitar'}, headers=owner).status_code == 404
    accepted = http.put(decision_path, json={'decision': 'aceitar'}, headers=guest)
    assert accepted.status_code == 200
    assert accepted.json()['state'] == 'aceito' and accepted.json()['team']['my_role'] == 'membro'
    again = http.put(decision_path, json={'decision': 'recusar'}, headers=guest)
    assert again.status_code == 409 and again.json()['detail'] == 'Este convite não está mais pendente.'

    stay = db.scalar(select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == guest_id))
    assert (stay.role, stay.joined_via, stay.position) == ('membro', 'convite', 'defesa')
    joined = notifications(http, owner, 'convite_aceito')
    assert len(joined) == 1 and joined[0]['actor']['id'] == guest_id
    assert joined[0]['payload'] == {'team_id': team_id, 'team_name': 'Leões do Cerrado', 'invite_id': sent['id']}
    assert [action for action, _ in audit_actions(db, 'team_invite', sent['id'])] == ['convite.criado', 'convite.aceito']
    assert http.get('/api/v1/me/team-invites', headers=guest).json() == {'items': []}
    assert [item['id'] for item in http.get('/api/v1/me/teams', headers=guest).json()['items']] == [team_id]
    member_again = invite(http, owner, team_id, guest_id)
    assert member_again.status_code == 409 and member_again.json()['detail'] == 'Este atleta já está no elenco.'


def test_invite_decline_cancel_and_representative_permissions(client):
    http, db = client
    owner, _ = register(http, 'recusa-dono@example.com', 'Dono Recusa')
    member, member_id = register(http, 'recusa-membro@example.com', 'Membro Recusa')
    guest, guest_id = register(http, 'recusa-guest@example.com', 'Convidado Recusa')
    outsider, _ = register(http, 'recusa-fora@example.com', 'Fora Recusa')
    team_id = create_team(http, owner, 'Unidos do Guará')['id']
    join_by_invite(http, owner, team_id, member, member_id)

    first = invite(http, owner, team_id, guest_id).json()
    declined = http.put(f"/api/v1/team-invites/{first['id']}", json={'decision': 'recusar'}, headers=guest)
    assert declined.status_code == 200 and declined.json() == {'state': 'recusado', 'team': None}
    assert http.get(f'/api/v1/teams/{team_id}', headers=guest).status_code == 404
    assert [item['actor']['id'] for item in notifications(http, owner, 'convite_aceito')] == [member_id]

    second = invite(http, owner, team_id, guest_id)
    assert second.status_code == 201 and second.json()['id'] != first['id']
    cancel_path = f"/api/v1/team-invites/{second.json()['id']}"
    member_cancel = http.delete(cancel_path, headers=member)
    assert member_cancel.status_code == 403 and member_cancel.json()['detail'] == 'Só representantes podem cancelar convites.'
    assert http.delete(cancel_path, headers=outsider).status_code == 404
    assert http.delete(cancel_path, headers=guest).status_code == 404
    assert http.delete('/api/v1/team-invites/999999', headers=owner).status_code == 404
    assert http.delete(cancel_path, headers=owner).status_code == 204
    assert http.delete(cancel_path, headers=owner).status_code == 409
    assert http.put(cancel_path, json={'decision': 'aceitar'}, headers=guest).status_code == 409
    cancelled = db.get(TeamInvite, second.json()['id'])
    assert cancelled.state == 'cancelado' and cancelled.decided_at is not None
    assert [action for action, _ in audit_actions(db, 'team_invite', first['id'])] == ['convite.criado', 'convite.recusado']
    assert [action for action, _ in audit_actions(db, 'team_invite', cancelled.id)] == ['convite.criado', 'convite.cancelado']

    member_invite = invite(http, member, team_id, guest_id)
    assert member_invite.status_code == 403 and member_invite.json()['detail'] == 'Só representantes podem convidar atletas.'
    assert http.get(f'/api/v1/teams/{team_id}/invites', headers=member).status_code == 403
    assert http.get(f'/api/v1/teams/{team_id}/invite-candidates', headers=member).status_code == 403
    assert invite(http, outsider, team_id, guest_id).status_code == 404
    missing = invite(http, owner, team_id, 999999)
    assert missing.status_code == 404 and missing.json()['detail'] == 'Atleta não encontrado.'
    db.get(User, guest_id).active = False
    db.flush()
    assert invite(http, owner, team_id, guest_id).status_code == 404


def test_invite_candidates_follows_search_status_and_blocks(client):
    http, db = client
    owner, owner_id = register(http, 'cand-dono@example.com', 'Dono Candidatos')
    _, followed_id = register(http, 'cand-seguido@example.com', 'Ana Seguida')
    _, blocked_id = register(http, 'cand-bloqueado@example.com', 'Ana Bloqueada')
    _, inactive_id = register(http, 'cand-inativo@example.com', 'Ana Inativa')
    member, member_id = register(http, 'cand-membro@example.com', 'Ana Membro')
    requester, requester_id = register(http, 'cand-pedido@example.com', 'Ana Pedido')
    team_id = create_team(http, owner, 'Candidatos FC')['id']
    join_by_invite(http, owner, team_id, member, member_id)
    http.post(f'/api/v1/join/{link_token(http, owner, team_id)}', json={}, headers=requester)
    for person_id in (blocked_id, inactive_id, member_id, requester_id, followed_id):
        follow(db, owner_id, person_id)
    db.add(UserBlock(blocker_id=blocked_id, blocked_id=owner_id))
    db.get(User, inactive_id).active = False
    db.flush()

    path = f'/api/v1/teams/{team_id}/invite-candidates'
    page = http.get(path, headers=owner).json()
    assert [(item['person']['id'], item['team_status']) for item in page['items']] == [
        (followed_id, 'disponivel'), (requester_id, 'pedido_pendente'), (member_id, 'membro')]
    assert page['next_cursor'] is None
    first = http.get(f'{path}?limit=1', headers=owner).json()
    assert len(first['items']) == 1 and first['next_cursor']
    rest = http.get(f"{path}?limit=5&cursor={first['next_cursor']}", headers=owner).json()
    assert [item['person']['id'] for item in rest['items']] == [requester_id, member_id]

    assert invite(http, owner, team_id, followed_id).status_code == 201
    searched = http.get(f'{path}?q=@ana', headers=owner).json()['items']
    assert {(item['person']['id'], item['team_status']) for item in searched} == {
        (followed_id, 'convite_pendente'), (member_id, 'membro'), (requester_id, 'pedido_pendente')}
    assert http.get(f'{path}?q=Bloqueada', headers=owner).json()['items'] == []
    assert http.get(f'{path}?q=%20%20', headers=owner).status_code == 422
    assert http.get(f"{path}?q={'x' * 101}", headers=owner).status_code == 422

    refused = invite(http, owner, team_id, blocked_id)
    assert refused.status_code == 404 and refused.json()['detail'] == 'Atleta não encontrado.'
    asked = invite(http, owner, team_id, requester_id)
    assert asked.status_code == 409
    assert asked.json()['detail'] == 'Este atleta já pediu para entrar. Responda em Pedidos para entrar.'
    # The representative blocking someone also refuses the invite.
    _, other_id = register(http, 'cand-outro@example.com', 'Outro Bloqueado')
    db.add(UserBlock(blocker_id=owner_id, blocked_id=other_id))
    db.flush()
    assert invite(http, owner, team_id, other_id).status_code == 404


def test_blocks_hide_avatars_in_the_roster_but_keep_the_member(client):
    http, db = client
    owner, owner_id = register(http, 'avatar-dono@example.com', 'Dono Avatar')
    guest, guest_id = register(http, 'avatar-membro@example.com', 'Membro Avatar')
    third, third_id = register(http, 'avatar-terceiro@example.com', 'Terceiro Avatar')
    team_id = create_team(http, owner, 'Rostos FC')['id']
    join_by_invite(http, owner, team_id, guest, guest_id)
    join_by_invite(http, owner, team_id, third, third_id)
    media = MediaObject(id=uuid.uuid4(), user_id=guest_id, bucket='arena-media', object_key=f'avatars/{uuid.uuid4()}.webp',
                        content_type='image/webp', size_bytes=10, width=1, height=1, created_at=utcnow())
    db.add(media)
    db.flush()
    db.get(User, guest_id).avatar_media_id = media.id
    db.add(UserBlock(blocker_id=owner_id, blocked_id=guest_id))
    db.flush()

    def guest_avatar(headers):
        members = http.get(f'/api/v1/teams/{team_id}/members', headers=headers).json()['items']
        preview = http.get(f'/api/v1/teams/{team_id}', headers=headers).json()['roster_preview']
        member = next(item for item in members if item['user_id'] == guest_id)
        tile = next(item for item in preview if item['user_id'] == guest_id)
        return member['avatar_url'], tile['avatar_url']

    assert guest_avatar(owner) == (None, None)
    expected = f'/api/v1/users/{guest_id}/avatar?v={media.id}'
    assert guest_avatar(third) == (expected, expected)
    assert len(http.get(f'/api/v1/teams/{team_id}/members', headers=owner).json()['items']) == 3


def test_link_join_request_approval_and_regeneration(client):
    http, db = client
    owner, owner_id = register(http, 'link-dono@example.com', 'Dono Link')
    member, member_id = register(http, 'link-membro@example.com', 'Membro Link')
    visitor, visitor_id = register(http, 'link-visita@example.com', 'Visita Link')
    outsider, _ = register(http, 'link-fora@example.com', 'Fora Link')
    set_position(http, visitor, 'meio_campo')
    team_id = create_team(http, owner, 'Ferrugem')['id']
    join_by_invite(http, owner, team_id, member, member_id)

    link_path = f'/api/v1/teams/{team_id}/invite-link'
    link = http.get(link_path, headers=owner).json()
    token = link['token']
    assert len(token) == 43 and link['url'] == f'http://localhost:5173/entrar/{token}' and link['generated_at']
    assert http.get(link_path, headers=owner).json() == link
    denied = http.get(link_path, headers=member)
    assert denied.status_code == 403 and denied.json()['detail'] == 'Só representantes podem ver ou gerar o link do time.'
    assert http.post(link_path, json={}, headers=member).status_code == 403
    assert http.get(link_path, headers=outsider).status_code == 404

    assert http.get(f'/api/v1/join/{token}').status_code == 401
    preview = http.get(f'/api/v1/join/{token}', headers=visitor).json()
    assert (preview['my_status'], preview['invite_id'], preview['request_id']) == ('disponivel', None, None)
    assert preview['team']['id'] == team_id and preview['team']['my_role'] is None
    assert preview['team']['initials'] == 'FE' and preview['team']['member_count'] == 2
    member_preview = http.get(f'/api/v1/join/{token}', headers=member).json()
    assert (member_preview['my_status'], member_preview['team']['my_role']) == ('membro', 'membro')
    assert http.post(f'/api/v1/join/{token}', headers=visitor).status_code == 415

    created = http.post(f'/api/v1/join/{token}', json={}, headers=visitor)
    assert created.status_code == 201
    request = created.json()
    assert (request['team_id'], request['state'], request['requester']['id'], request['decided_at']) == (
        team_id, 'pendente', visitor_id, None)
    repeated = http.post(f'/api/v1/join/{token}', json={}, headers=visitor)
    assert repeated.status_code == 200 and repeated.json() == request
    waiting = http.get(f'/api/v1/join/{token}', headers=visitor).json()
    assert (waiting['my_status'], waiting['request_id']) == ('pedido_pendente', request['id'])
    assert http.get(f'/api/v1/teams/{team_id}', headers=visitor).status_code == 200
    assert http.get(f'/api/v1/teams/{team_id}/join-requests', headers=owner).json() == {'items': [request]}
    assert http.get(f'/api/v1/teams/{team_id}', headers=owner).json()['pending_join_requests'] == 1
    asked = notifications(http, owner, 'pedido_entrada')
    assert len(asked) == 1 and asked[0]['actor']['id'] == visitor_id
    assert asked[0]['payload'] == {'team_id': team_id, 'team_name': 'Ferrugem', 'request_id': request['id']}
    assert notifications(http, member, 'pedido_entrada') == []
    assert audit_actions(db, 'team_join_request', request['id']) == [('pedido_entrada.criado', {'team_id': team_id})]

    renewed = http.post(link_path, json={}, headers=owner).json()
    assert renewed['token'] != token and renewed['url'].endswith(renewed['token'])
    for response in (http.get(f'/api/v1/join/{token}', headers=outsider),
                     http.post(f'/api/v1/join/{token}', json={}, headers=outsider)):
        assert response.status_code == 404 and response.json()['detail'] == 'Este link não vale mais.'
    assert http.get('/api/v1/join/curto', headers=outsider).status_code == 404
    assert audit_actions(db, 'team', team_id)[-1] == ('time.link_gerado', {})
    assert http.get(link_path, headers=owner).json()['token'] == renewed['token']
    # A team without a link (e.g. created before links) gets one on the first read, without the audit entry.
    team = db.get(Team, team_id)
    team.link_nonce = team.link_token_hash = team.link_generated_at = None
    db.flush()
    issued = http.get(link_path, headers=owner).json()
    assert issued['token'] not in {token, renewed['token']} and db.get(Team, team_id).link_nonce
    assert [action for action, _ in audit_actions(db, 'team', team_id)].count('time.link_gerado') == 1
    # A changed TEAM_LINK_SECRET re-syncs the stored hash on the next read.
    db.get(Team, team_id).link_token_hash = 'f' * 64
    db.flush()
    assert http.get(link_path, headers=owner).json()['token'] == issued['token']
    assert db.get(Team, team_id).link_token_hash != 'f' * 64

    # Pending requests stay valid after "Gerar outro link".
    approved = http.put(f"/api/v1/team-join-requests/{request['id']}", json={'decision': 'aprovar'}, headers=owner)
    assert approved.status_code == 200
    assert approved.json()['state'] == 'aprovado' and approved.json()['decided_at'] is not None
    stay = db.scalar(select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == visitor_id))
    assert (stay.role, stay.joined_via, stay.position) == ('membro', 'pedido', 'meio_campo')
    decided = notifications(http, visitor, 'pedido_entrada_decidido')
    assert len(decided) == 1 and decided[0]['actor']['id'] == owner_id
    assert decided[0]['payload'] == {'team_id': team_id, 'team_name': 'Ferrugem', 'request_id': request['id'],
                                     'decision': 'aprovado'}
    assert audit_actions(db, 'team_join_request', request['id'])[-1] == (
        'pedido_entrada.aprovado', {'team_id': team_id, 'user_id': visitor_id})
    again = http.put(f"/api/v1/team-join-requests/{request['id']}", json={'decision': 'recusar'}, headers=owner)
    assert again.status_code == 409 and again.json()['detail'] == 'Este pedido não está mais pendente.'
    member_now = http.post(f"/api/v1/join/{issued['token']}", json={}, headers=visitor)
    assert member_now.status_code == 409 and member_now.json()['detail'] == 'Você já está no elenco.'
    assert http.get(f'/api/v1/teams/{team_id}/join-requests', headers=owner).json() == {'items': []}


def test_join_request_decline_cancel_and_permissions(client):
    http, db = client
    owner, _ = register(http, 'pedido-dono@example.com', 'Dono Pedido')
    member, member_id = register(http, 'pedido-membro@example.com', 'Membro Pedido')
    visitor, _ = register(http, 'pedido-visita@example.com', 'Visita Pedido')
    outsider, _ = register(http, 'pedido-fora@example.com', 'Fora Pedido')
    invited, invited_id = register(http, 'pedido-convidado@example.com', 'Convidado Pedido')
    team_id = create_team(http, owner, 'Pedidos FC')['id']
    join_by_invite(http, owner, team_id, member, member_id)
    token = link_token(http, owner, team_id)

    request = http.post(f'/api/v1/join/{token}', json={}, headers=visitor).json()
    decide_path = f"/api/v1/team-join-requests/{request['id']}"
    for headers in (member, visitor):
        denied = http.put(decide_path, json={'decision': 'aprovar'}, headers=headers)
        assert denied.status_code == 403
        assert denied.json()['detail'] == 'Só representantes podem decidir pedidos para entrar.'
    assert http.put(decide_path, json={'decision': 'aprovar'}, headers=outsider).status_code == 404
    assert http.put('/api/v1/team-join-requests/999999', json={'decision': 'aprovar'}, headers=owner).status_code == 404
    assert http.put(decide_path, json={'decision': 'aceitar'}, headers=owner).status_code == 422
    assert http.get(f'/api/v1/teams/{team_id}/join-requests', headers=member).status_code == 403

    declined = http.put(decide_path, json={'decision': 'recusar'}, headers=owner)
    assert declined.status_code == 200 and declined.json()['state'] == 'recusado'
    assert notifications(http, visitor, 'pedido_entrada_decidido')[0]['payload']['decision'] == 'recusado'
    assert audit_actions(db, 'team_join_request', request['id'])[-1][0] == 'pedido_entrada.recusado'
    assert http.get(f'/api/v1/teams/{team_id}', headers=visitor).status_code == 404

    second = http.post(f'/api/v1/join/{token}', json={}, headers=visitor)
    assert second.status_code == 201 and second.json()['id'] != request['id']
    cancel_path = f"/api/v1/team-join-requests/{second.json()['id']}"
    foreign = http.delete(cancel_path, headers=owner)
    assert foreign.status_code == 404 and foreign.json()['detail'] == 'Pedido não encontrado.'
    assert http.delete(cancel_path, headers=visitor).status_code == 204
    gone = http.delete(cancel_path, headers=visitor)
    assert gone.status_code == 409 and gone.json()['detail'] == 'Este pedido não está mais pendente.'
    assert http.put(cancel_path, json={'decision': 'aprovar'}, headers=owner).status_code == 409
    assert audit_actions(db, 'team_join_request', second.json()['id'])[-1] == (
        'pedido_entrada.cancelado', {'team_id': team_id})

    pending = invite(http, owner, team_id, invited_id).json()
    blocked = http.post(f'/api/v1/join/{token}', json={}, headers=invited)
    assert blocked.status_code == 409
    assert blocked.json()['detail'] == 'Você já tem um convite deste time. Responda em Meus times.'
    preview = http.get(f'/api/v1/join/{token}', headers=invited).json()
    assert (preview['my_status'], preview['invite_id'], preview['request_id']) == ('convite_pendente', pending['id'], None)


def test_join_request_is_refused_with_a_block_with_any_representative(client):
    """Same rule and answer as the invite (404 Atleta não encontrado.): a block in either direction with any active
    representative refuses the request; a block with a plain member does not."""
    http, db = client
    owner, owner_id = register(http, 'bloq-dono@example.com', 'Dono Bloqueio')
    second, second_id = register(http, 'bloq-segundo@example.com', 'Segundo Representante')
    member, member_id = register(http, 'bloq-membro@example.com', 'Membro Comum')
    blocker, blocker_id = register(http, 'bloq-bloqueia@example.com', 'Quem Bloqueia')
    blocked, blocked_id = register(http, 'bloq-bloqueado@example.com', 'Quem Foi Bloqueado')
    neighbour, neighbour_id = register(http, 'bloq-vizinho@example.com', 'Vizinho do Membro')
    team_id = create_team(http, owner, 'Bloqueios FC')['id']
    join_by_invite(http, owner, team_id, second, second_id)
    join_by_invite(http, owner, team_id, member, member_id)
    promoted = http.patch(f'/api/v1/teams/{team_id}/members/{second_id}', json={'role': 'representante'},
                          headers=owner)
    assert promoted.status_code == 200, promoted.text
    token = link_token(http, owner, team_id)
    db.add_all([UserBlock(blocker_id=blocker_id, blocked_id=second_id),   # the athlete blocked a representative
                UserBlock(blocker_id=owner_id, blocked_id=blocked_id),    # a representative blocked the athlete
                UserBlock(blocker_id=neighbour_id, blocked_id=member_id)])  # a block with a plain member only
    db.flush()

    for headers, user_id in ((blocker, blocker_id), (blocked, blocked_id)):
        refused = http.post(f'/api/v1/join/{token}', json={}, headers=headers)
        assert (refused.status_code, refused.json()) == (404, {'detail': 'Atleta não encontrado.'})
        assert db.scalars(select(TeamJoinRequest).where(TeamJoinRequest.team_id == team_id,
                                                        TeamJoinRequest.user_id == user_id)).all() == []
    for headers in (owner, second):
        assert notifications(http, headers, 'pedido_entrada') == []
    accepted = http.post(f'/api/v1/join/{token}', json={}, headers=neighbour)
    assert accepted.status_code == 201, accepted.text

    # Without the block, the same athlete can ask again.
    db.execute(UserBlock.__table__.delete().where(UserBlock.blocker_id == blocker_id))
    db.flush()
    assert http.post(f'/api/v1/join/{token}', json={}, headers=blocker).status_code == 201


def test_accepting_or_approving_closes_the_other_pending_entry(client):
    """The two entries cannot coexist through the API; a race leaves both pending, and the decision closes the other."""
    http, db = client
    owner, owner_id = register(http, 'corrida-dono@example.com', 'Dono Corrida')
    first, first_id = register(http, 'corrida-um@example.com', 'Atleta Um')
    second, second_id = register(http, 'corrida-dois@example.com', 'Atleta Dois')
    team_id = create_team(http, owner, 'Corrida FC')['id']
    token = link_token(http, owner, team_id)

    request = http.post(f'/api/v1/join/{token}', json={}, headers=first).json()
    raced_invite = TeamInvite(team_id=team_id, invitee_id=first_id, inviter_id=owner_id, created_at=utcnow())
    db.add(raced_invite)
    db.flush()
    accepted = http.put(f'/api/v1/team-invites/{raced_invite.id}', json={'decision': 'aceitar'}, headers=first)
    assert accepted.status_code == 200 and accepted.json()['team']['my_role'] == 'membro'
    assert db.get(TeamJoinRequest, request['id']).state == 'cancelado'
    assert audit_actions(db, 'team_join_request', request['id'])[-1] == (
        'pedido_entrada.cancelado', {'team_id': team_id, 'user_id': first_id, 'automatico': True})

    pending = invite(http, owner, team_id, second_id).json()
    raced_request = TeamJoinRequest(team_id=team_id, user_id=second_id, created_at=utcnow())
    db.add(raced_request)
    db.flush()
    approved = http.put(f'/api/v1/team-join-requests/{raced_request.id}', json={'decision': 'aprovar'}, headers=owner)
    assert approved.status_code == 200 and approved.json()['state'] == 'aprovado'
    assert db.get(TeamInvite, pending['id']).state == 'cancelado'
    assert audit_actions(db, 'team_invite', pending['id'])[-1] == (
        'convite.cancelado', {'team_id': team_id, 'invitee_id': second_id, 'automatico': True})
    roster = http.get(f'/api/v1/teams/{team_id}/members', headers=owner).json()['items']
    assert [item['user_id'] for item in roster] == [owner_id, first_id, second_id]

    # Accepting while already in the roster (another race) only marks the invite.
    late_invite = TeamInvite(team_id=team_id, invitee_id=second_id, inviter_id=owner_id, created_at=utcnow())
    db.add(late_invite)
    db.flush()
    assert http.put(f'/api/v1/team-invites/{late_invite.id}', json={'decision': 'aceitar'},
                    headers=second).status_code == 200
    assert len(db.scalars(select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == second_id,
                                                   TeamMember.left_at.is_(None))).all()) == 1
    assert len(notifications(http, owner, 'convite_aceito')) == 1
    late_request = TeamJoinRequest(team_id=team_id, user_id=first_id, created_at=utcnow())
    db.add(late_request)
    db.flush()
    assert http.put(f'/api/v1/team-join-requests/{late_request.id}', json={'decision': 'aprovar'},
                    headers=owner).json()['state'] == 'aprovado'
    assert len(http.get(f'/api/v1/teams/{team_id}/members', headers=owner).json()['items']) == 3


def test_team_routes_require_session_and_reject_foreign_origins(client):
    http, db = client
    owner, _ = register(http, 'sessao-dono@example.com', 'Dono Sessão')
    team_id = create_team(http, owner, 'Sessão FC')['id']
    for method, path in (('get', f'/api/v1/teams/{team_id}'), ('get', f'/api/v1/teams/{team_id}/members'),
                         ('get', '/api/v1/me/team-invites'), ('get', f'/api/v1/teams/{team_id}/invite-link'),
                         ('delete', f'/api/v1/teams/{team_id}/crest'), ('delete', '/api/v1/team-invites/1')):
        assert getattr(http, method)(path).status_code == 401
    assert http.post(f'/api/v1/teams/{team_id}/close', json={}).status_code == 401
    foreign = http.post(f'/api/v1/teams/{team_id}/close', json={}, headers={'Origin': 'https://attacker.invalid'})
    assert foreign.status_code == 403
    assert http.put('/api/v1/team-invites/1', content='decision=aceitar',
                    headers={**owner, 'Content-Type': 'application/x-www-form-urlencoded'}).status_code == 415
    assert db.get(Team, team_id).state == 'ativo'

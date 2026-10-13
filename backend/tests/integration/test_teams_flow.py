"""Teams on PostgreSQL: card C5, visibility, roster roles, leaving/removing, closing and the crest."""
import io

from PIL import Image
from sqlalchemy import select

from app.models.teams import Team, TeamInvite, TeamJoinRequest, TeamMember
from app.services import media as media_service
from tests.integration.team_helpers import (
    CITY,
    audit_actions,
    create_team,
    invite,
    join_by_invite,
    link_token,
    notifications,
    register,
    set_position,
)

FORMATS = ['futsal', 'society', 'campo']


def test_create_team_card_visibility_and_edit(client):
    http, db = client
    assert http.post('/api/v1/teams', json={'name': 'Sem sessão', 'city_id': CITY}).status_code == 401
    assert http.get('/api/v1/me/teams').status_code == 401
    owner, owner_id = register(http, 'time-dono@example.com', 'Caio Ramos')
    outsider, _ = register(http, 'time-fora@example.com', 'Fora do Time')
    set_position(http, owner, 'goleiro')

    created = http.post('/api/v1/teams', json={'name': '  Leões   do Cerrado ', 'city_id': CITY}, headers=owner)
    assert created.status_code == 201
    card = created.json()
    assert (card['name'], card['initials'], card['crest_url'], card['my_role']) == (
        'Leões do Cerrado', 'LC', None, 'representante')
    assert card['city'] == {'id': CITY, 'name': 'Brasília', 'state': 'DF'}
    assert (card['member_count'], card['representative_count']) == (1, 1)
    assert card['roster_preview'] == [{'user_id': owner_id, 'first_name': 'Caio', 'avatar_url': None,
                                       'position': 'goleiro', 'is_representative': True}]
    assert [cell['format'] for cell in card['formats']] == FORMATS
    assert {cell['state'] for cell in card['formats']} == {'sem_jogos'}
    assert (card['pending_join_requests'], card['pending_invites']) == (0, 0)
    team_id = card['id']
    team = db.get(Team, team_id)
    assert team.state == 'ativo' and team.link_nonce and team.link_token_hash and team.created_by_id == owner_id
    member = db.scalar(select(TeamMember).where(TeamMember.team_id == team_id))
    assert (member.role, member.joined_via, member.position) == ('representante', 'criacao', 'goleiro')
    assert audit_actions(db, 'team', team_id) == [('time.criado', {'name': 'Leões do Cerrado', 'city_id': CITY})]

    for body in ({'name': 'ab', 'city_id': CITY}, {'name': 'x' * 41, 'city_id': CITY},
                 {'name': 'Time Bom', 'city_id': CITY, 'state': 'encerrado'}, {'name': 'Time Bom'}):
        response = http.post('/api/v1/teams', json=body, headers=owner)
        assert response.status_code == 422 and response.json()['detail'] == 'Revise os campos informados.'
    catalog = http.post('/api/v1/teams', json={'name': 'Time Bom', 'city_id': 999}, headers=owner)
    assert catalog.status_code == 422 and catalog.json()['detail'] == 'Selecione uma cidade do catálogo.'
    assert http.post('/api/v1/teams', content='name=x', headers={**owner, 'Content-Type': 'text/plain'}).status_code == 415

    assert http.get('/api/v1/me/teams', headers=owner).json() == {'items': [card]}
    assert http.get(f'/api/v1/teams/{team_id}', headers=owner).json() == card
    for path in (f'/api/v1/teams/{team_id}', f'/api/v1/teams/{team_id}/members', '/api/v1/teams/999999'):
        hidden = http.get(path, headers=outsider)
        assert hidden.status_code == 404 and hidden.json()['detail'] == 'Time não encontrado.'
    assert http.patch(f'/api/v1/teams/{team_id}', json={'name': 'Invasores'}, headers=outsider).status_code == 404

    edited = http.patch(f'/api/v1/teams/{team_id}', json={'name': ' Leões  FC '}, headers=owner)
    assert edited.status_code == 200 and edited.json()['name'] == 'Leões FC' and edited.json()['initials'] == 'LF'
    assert http.patch(f'/api/v1/teams/{team_id}', json={'name': 'Leões FC', 'city_id': CITY}, headers=owner).status_code == 200
    assert http.patch(f'/api/v1/teams/{team_id}', json={}, headers=owner).status_code == 422
    bad_city = http.patch(f'/api/v1/teams/{team_id}', json={'city_id': 999}, headers=owner)
    assert bad_city.status_code == 422 and bad_city.json()['detail'] == 'Selecione uma cidade do catálogo.'
    moved = http.patch(f'/api/v1/teams/{team_id}', json={'city_id': 5208707}, headers=owner)
    assert moved.status_code == 200 and moved.json()['city'] == {'id': 5208707, 'name': 'Goiânia', 'state': 'GO'}
    assert [(action, data) for action, data in audit_actions(db, 'team', team_id)][1:] == [
        ('time.editado', {'name': 'Leões FC'}), ('time.editado', {'city_id': 5208707})]


def test_roles_positions_and_the_last_representative(client):
    http, db = client
    owner, owner_id = register(http, 'papel-dono@example.com', 'Dona Braçadeira')
    guest, guest_id = register(http, 'papel-membro@example.com', 'Bruno Membro')
    set_position(http, guest, 'defesa')
    team_id = create_team(http, owner)['id']
    joined = join_by_invite(http, owner, team_id, guest, guest_id)
    assert joined['state'] == 'aceito' and joined['team']['my_role'] == 'membro'

    members = http.get(f'/api/v1/teams/{team_id}/members', headers=guest).json()['items']
    assert [(item['user_id'], item['role'], item['position'], item['is_me']) for item in members] == [
        (owner_id, 'representante', None, False), (guest_id, 'membro', 'defesa', True)]
    assert members[1]['first_name'] == 'Bruno' and members[1]['username']

    member_path = f'/api/v1/teams/{team_id}/members'
    forbidden = http.patch(f'/api/v1/teams/{team_id}', json={'name': 'Golpe'}, headers=guest)
    assert forbidden.status_code == 403 and forbidden.json()['detail'] == 'Só representantes podem editar o time.'
    last = http.patch(f'{member_path}/{owner_id}', json={'role': 'membro'}, headers=owner)
    assert last.status_code == 409 and last.json()['detail'] == (
        'O time precisa de pelo menos um representante. Passe a braçadeira a outro atleta antes.')
    leave = http.delete(f'{member_path}/{owner_id}', headers=owner)
    assert leave.status_code == 409 and leave.json()['detail'] == (
        'Você é o último representante. Passe a braçadeira a outro atleta ou encerre o time.')
    armband = http.patch(f'{member_path}/{guest_id}', json={'role': 'representante'}, headers=guest)
    assert armband.status_code == 403 and armband.json()['detail'] == 'Só representantes podem mudar a braçadeira.'
    other_position = http.patch(f'{member_path}/{guest_id}', json={'position': 'atacante'}, headers=owner)
    assert other_position.status_code == 403
    assert other_position.json()['detail'] == 'Cada atleta escolhe a própria posição no time.'
    assert http.patch(f'{member_path}/{guest_id}', json={}, headers=guest).status_code == 422
    assert http.patch(f'{member_path}/{guest_id}', json={'role': None}, headers=owner).status_code == 422
    assert http.patch(f'{member_path}/{guest_id}', json={'role': 'capitao'}, headers=owner).status_code == 422
    missing = http.patch(f'{member_path}/999999', json={'role': 'membro'}, headers=owner)
    assert missing.status_code == 404 and missing.json()['detail'] == 'Atleta não está no elenco.'

    own = http.patch(f'{member_path}/{guest_id}', json={'position': 'atacante'}, headers=guest)
    assert own.status_code == 200 and own.json()['position'] == 'atacante' and own.json()['is_me']
    assert http.patch(f'{member_path}/{guest_id}', json={'position': None}, headers=guest).json()['position'] is None

    promoted = http.patch(f'{member_path}/{guest_id}', json={'role': 'representante'}, headers=owner)
    assert promoted.status_code == 200 and promoted.json()['role'] == 'representante'
    assert http.patch(f'{member_path}/{guest_id}', json={'role': 'representante'}, headers=owner).status_code == 200
    guest_row = db.scalar(select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == guest_id))
    assert audit_actions(db, 'team_member', guest_row.id) == [
        ('membro.papel_alterado', {'team_id': team_id, 'user_id': guest_id, 'role': 'representante'})]
    assert http.get(f'/api/v1/teams/{team_id}', headers=owner).json()['representative_count'] == 2

    stepped_down = http.patch(f'{member_path}/{owner_id}', json={'role': 'membro', 'position': 'meio_campo'},
                              headers=owner)
    assert stepped_down.status_code == 200 and stepped_down.json()['role'] == 'membro'
    assert stepped_down.json()['position'] == 'meio_campo'
    assert http.delete(f'{member_path}/{guest_id}', headers=guest).status_code == 409
    assert http.delete(f'{member_path}/{owner_id}', headers=owner).status_code == 204
    assert http.get(f'/api/v1/teams/{team_id}', headers=owner).status_code == 404
    assert http.get('/api/v1/me/teams', headers=owner).json() == {'items': []}
    assert http.delete(f'{member_path}/{owner_id}', headers=owner).status_code == 404
    history = db.scalar(select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == owner_id))
    assert (history.left_reason, history.left_at is not None) == ('saiu', True)
    assert audit_actions(db, 'team_member', history.id)[-1] == ('membro.saiu', {'team_id': team_id, 'user_id': owner_id})
    assert notifications(http, owner, 'removido_do_time') == []
    remaining = http.get(f'/api/v1/teams/{team_id}', headers=guest).json()
    assert (remaining['member_count'], remaining['representative_count']) == (1, 1)


def test_remove_member_notifies_and_keeps_the_history(client):
    http, db = client
    owner, owner_id = register(http, 'remove-dono@example.com', 'Dono Remove')
    guest, guest_id = register(http, 'remove-membro@example.com', 'Membro Remove')
    third, third_id = register(http, 'remove-terceiro@example.com', 'Terceiro Remove')
    team_id = create_team(http, owner, 'Ferrugem FC')['id']
    join_by_invite(http, owner, team_id, guest, guest_id)
    join_by_invite(http, owner, team_id, third, third_id)
    member_path = f'/api/v1/teams/{team_id}/members'

    forbidden = http.delete(f'{member_path}/{third_id}', headers=guest)
    assert forbidden.status_code == 403 and forbidden.json()['detail'] == 'Só representantes podem remover atletas.'
    assert http.delete(f'{member_path}/999999', headers=owner).status_code == 404
    assert http.patch(f'{member_path}/{third_id}', json={'role': 'representante'}, headers=owner).status_code == 200
    assert http.delete(f'{member_path}/{owner_id}', headers=third).status_code == 204

    removed = db.scalar(select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == owner_id))
    assert (removed.left_reason, removed.removed_by_id) == ('removido', third_id)
    assert audit_actions(db, 'team_member', removed.id) == [
        ('membro.removido', {'team_id': team_id, 'user_id': owner_id})]
    notice = notifications(http, owner, 'removido_do_time')
    assert len(notice) == 1 and notice[0]['payload'] == {'team_id': team_id, 'team_name': 'Ferrugem FC'}
    assert notice[0]['actor']['id'] == third_id
    assert http.get('/api/v1/me/teams', headers=owner).json() == {'items': []}
    assert http.delete(f'{member_path}/{owner_id}', headers=third).status_code == 404

    again = invite(http, third, team_id, owner_id)
    assert again.status_code == 201
    assert http.put(f"/api/v1/team-invites/{again.json()['id']}", json={'decision': 'aceitar'},
                    headers=owner).status_code == 200
    stays = db.scalars(select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == owner_id)
                       .order_by(TeamMember.id)).all()
    assert [(stay.left_reason, stay.joined_via) for stay in stays] == [('removido', 'criacao'), (None, 'convite')]


def test_close_team_cancels_pending_entries_and_notifies_the_roster(client):
    http, db = client
    owner, owner_id = register(http, 'encerra-dono@example.com', 'Dono Encerra')
    guest, guest_id = register(http, 'encerra-membro@example.com', 'Membro Encerra')
    invited, invited_id = register(http, 'encerra-convidado@example.com', 'Convidado Encerra')
    visitor, visitor_id = register(http, 'encerra-visita@example.com', 'Visita Encerra')
    team_id = create_team(http, owner, 'Amigos do Lago')['id']
    join_by_invite(http, owner, team_id, guest, guest_id)
    pending_invite = invite(http, owner, team_id, invited_id).json()
    token = link_token(http, owner, team_id)
    pending_request = http.post(f'/api/v1/join/{token}', json={}, headers=visitor).json()

    close_path = f'/api/v1/teams/{team_id}/close'
    forbidden = http.post(close_path, json={}, headers=guest)
    assert forbidden.status_code == 403 and forbidden.json()['detail'] == 'Só representantes podem encerrar o time.'
    assert http.post(close_path, json={}, headers=invited).status_code == 403
    assert http.post(close_path, headers=owner).status_code == 415
    assert http.post(close_path, json={'force': True}, headers=owner).status_code == 422
    assert http.post(close_path, json={}, headers=owner).status_code == 204

    for headers in (owner, guest, invited, visitor):
        assert http.get(f'/api/v1/teams/{team_id}', headers=headers).status_code == 404
        assert http.get('/api/v1/me/teams', headers=headers).json() == {'items': []}
    dead = http.get(f'/api/v1/join/{token}', headers=visitor)
    assert dead.status_code == 404 and dead.json()['detail'] == 'Este link não vale mais.'
    assert http.get('/api/v1/me/team-invites', headers=invited).json() == {'items': []}
    late = http.put(f"/api/v1/team-invites/{pending_invite['id']}", json={'decision': 'aceitar'}, headers=invited)
    assert late.status_code == 409 and late.json()['detail'] == 'Este convite não está mais pendente.'
    assert http.post(close_path, json={}, headers=owner).status_code == 404

    team = db.get(Team, team_id)
    assert team.state == 'encerrado' and team.closed_by_id == owner_id and team.closed_at is not None
    assert (team.link_nonce, team.link_token_hash, team.link_generated_at) == (None, None, None)
    stays = db.scalars(select(TeamMember).where(TeamMember.team_id == team_id)).all()
    assert {stay.left_reason for stay in stays} == {'time_encerrado'}
    assert db.get(TeamInvite, pending_invite['id']).state == 'cancelado'
    assert db.get(TeamJoinRequest, pending_request['id']).state == 'cancelado'
    assert audit_actions(db, 'team', team_id)[-1] == ('time.encerrado', {'member_count': 2})
    assert audit_actions(db, 'team_invite', pending_invite['id'])[-1] == (
        'convite.cancelado', {'team_id': team_id, 'automatico': True, 'invitee_id': invited_id})
    assert audit_actions(db, 'team_join_request', pending_request['id'])[-1] == (
        'pedido_entrada.cancelado', {'team_id': team_id, 'automatico': True, 'user_id': visitor_id})
    closed = notifications(http, guest, 'time_encerrado')
    assert len(closed) == 1 and closed[0]['payload'] == {'team_id': team_id, 'team_name': 'Amigos do Lago'}
    assert notifications(http, owner, 'time_encerrado') == []
    assert notifications(http, invited, 'time_encerrado') == []


class FakeStorage:
    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, **_):
        self.objects[(Bucket, Key)] = Body

    def get_object(self, Bucket, Key):
        return {'Body': io.BytesIO(self.objects[(Bucket, Key)])}

    def delete_object(self, Bucket, Key):
        self.objects.pop((Bucket, Key), None)


def transparent_png():
    image = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    image.paste((40, 118, 77, 255), (16, 16, 48, 48))
    data = io.BytesIO()
    image.save(data, format='PNG')
    return data.getvalue()


def test_crest_upload_keeps_transparency_replaces_and_deletes(client, monkeypatch):
    http, db = client
    storage = FakeStorage()
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    owner, _ = register(http, 'brasao-dono@example.com', 'Dono Brasão')
    guest, guest_id = register(http, 'brasao-membro@example.com', 'Membro Brasão')
    outsider, _ = register(http, 'brasao-fora@example.com', 'Fora Brasão')
    team_id = create_team(http, owner, 'Real Cerrado')['id']
    join_by_invite(http, owner, team_id, guest, guest_id)
    crest_path = f'/api/v1/teams/{team_id}/crest'
    upload = {'file': ('crest.png', transparent_png(), 'image/png')}

    forbidden = http.put(crest_path, files=upload, headers=guest)
    assert forbidden.status_code == 403 and forbidden.json()['detail'] == 'Só representantes podem trocar o brasão.'
    assert http.put(crest_path, files=upload, headers=outsider).status_code == 404
    assert http.put(crest_path, files={'file': ('x.gif', b'not-an-image', 'image/gif')}, headers=owner).status_code == 422
    assert storage.objects == {}

    first = http.put(crest_path, files=upload, headers=owner)
    assert first.status_code == 200
    first_url = first.json()['crest_url']
    assert first_url.startswith(f'{crest_path}?v=')
    media_row = db.get(Team, team_id).crest_media_id
    assert [key for _, key in storage.objects] == [f'crests/{media_row}.webp']
    assert http.get(first_url).status_code == 401
    image = http.get(first_url, headers=outsider)
    assert image.status_code == 200 and image.headers['content-type'] == 'image/webp'
    assert 'no-store' in image.headers['cache-control']
    with Image.open(io.BytesIO(image.content)) as crest:
        assert crest.format == 'WEBP' and crest.mode == 'RGBA' and crest.size == (64, 64)
        assert crest.getpixel((2, 2))[3] == 0 and crest.getpixel((32, 32))[3] == 255
    assert http.get(f'{crest_path}?v=9d1d1f43-7f2a-4c3d-8a5e-2f6b3f0f7a11', headers=owner).status_code == 404

    second = http.put(crest_path, files=upload, headers=owner)
    assert second.status_code == 200 and second.json()['crest_url'] != first_url
    old = http.get(first_url, headers=owner)
    assert old.status_code == 404 and old.json()['detail'] == 'Brasão não encontrado.'
    assert len(storage.objects) == 1
    assert http.get('/api/v1/me/teams', headers=guest).json()['items'][0]['crest_url'] == second.json()['crest_url']

    assert http.delete(crest_path, headers=guest).status_code == 403
    assert http.delete(crest_path, headers=owner).status_code == 204
    assert http.delete(crest_path, headers=owner).status_code == 204
    assert storage.objects == {} and db.get(Team, team_id).crest_media_id is None
    assert http.get(f'/api/v1/teams/{team_id}', headers=owner).json()['crest_url'] is None

    third = http.put(crest_path, files=upload, headers=owner).json()['crest_url']
    assert http.post(f'/api/v1/teams/{team_id}/close', json={}, headers=owner).status_code == 204
    assert http.get(third, headers=owner).status_code == 404

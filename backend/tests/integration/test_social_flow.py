import io

from PIL import Image
from sqlalchemy import select

from app.models.identity import Follow, MediaObject, ModerationAction, Post, PostComment, PostLike, User
from app.routers import identity as identity_router
from app.routers import social as social_router
from app.services import media as media_service

PASSWORD = 'social-test-password'
ACCOUNT = {'name': 'Atleta Social', 'email': 'social-a@example.com', 'birth_date': '1995-01-01', 'password': PASSWORD}


class FakeStorage:
    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, **_):
        self.objects[(Bucket, Key)] = Body

    def get_object(self, Bucket, Key):
        return {'Body': io.BytesIO(self.objects[(Bucket, Key)])}

    def delete_object(self, Bucket, Key):
        self.objects.pop((Bucket, Key), None)


def square_png():
    output = io.BytesIO()
    Image.new('RGB', (120, 120), 'green').save(output, format='PNG')
    return output.getvalue()


def register(http, email, name='Atleta Social'):
    data = {**ACCOUNT, 'email': email, 'name': name}
    assert http.post('/api/v1/auth/register', json=data).status_code == 201
    response = http.post('/api/v1/auth/login', json={'email': email, 'password': PASSWORD})
    assert response.status_code == 200
    return {'Authorization': f"Bearer {response.json()['token']}"}


def create_post(http, headers, caption='Momento no esporte'):
    return http.post('/api/v1/posts', data={'caption': caption},
        files={'file': ('foto.png', square_png(), 'image/png')}, headers=headers)


def test_private_post_request_approval_feed_comments_and_block(client, monkeypatch):
    http, db = client
    storage = FakeStorage()
    monkeypatch.setattr(social_router, 'storage_client', lambda: storage)
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    owner = register(http, 'social-owner@example.com', 'Pessoa Proprietária')
    viewer = register(http, 'social-viewer@example.com', 'Pessoa Visitante')
    post_response = create_post(http, owner)
    assert post_response.status_code == 201, post_response.text
    post = post_response.json()
    assert http.get('/api/v1/posts', headers=viewer).json()['items'] == []
    assert http.get(f"/api/v1/posts/{post['id']}", headers=viewer).status_code == 404
    assert http.get(post['image_url'], headers=viewer).status_code == 404

    request = http.put(f"/api/v1/users/{post['author']['id']}/follow", headers=viewer)
    assert request.status_code == 200 and request.json()['state'] == 'pending'
    pending = http.get('/api/v1/me/follow-requests', headers=owner).json()['items']
    assert [entry['user']['id'] for entry in pending] == [http.get('/api/v1/me', headers=viewer).json()['id']]
    approved = http.put(f"/api/v1/me/follow-requests/{pending[0]['user']['id']}?approve=true", headers=owner)
    assert approved.status_code == 200 and approved.json()['state'] == 'approved'
    feed = http.get('/api/v1/posts', headers=viewer).json()['items']
    assert [entry['id'] for entry in feed] == [post['id']]
    assert http.get(post['image_url'], headers=viewer).content.startswith(b'RIFF')

    assert http.put(f"/api/v1/posts/{post['id']}/like", headers=viewer).status_code == 204
    assert http.put(f"/api/v1/posts/{post['id']}/like", headers=viewer).status_code == 204
    assert db.scalar(select(PostLike).where(PostLike.post_id == post['id'])) is not None
    comment = http.post(f"/api/v1/posts/{post['id']}/comments", json={'body': 'Boa!'}, headers=viewer)
    assert comment.status_code == 201 and comment.json()['author_name'] == 'Pessoa Visitante'
    assert http.get(f"/api/v1/comments/{comment.json()['id']}/avatar?v=bad", headers=viewer).status_code == 422
    assert http.get(f"/api/v1/posts/{post['id']}/comments", headers=viewer).json()['items'][0]['body'] == 'Boa!'

    blocked = http.put(f"/api/v1/users/{post['author']['id']}/block", headers=viewer)
    assert blocked.status_code == 204
    assert db.scalars(select(Follow)).all() == []
    assert http.get('/api/v1/posts', headers=viewer).json()['items'] == []
    assert http.get(post['image_url'], headers=viewer).status_code == 404
    assert http.delete(f"/api/v1/users/{post['author']['id']}/block", headers=viewer).status_code == 204
    assert http.get('/api/v1/posts', headers=viewer).json()['items'] == []


def test_public_toggle_approves_requests_and_report_moderation_revokes_session(client, monkeypatch):
    http, db = client
    storage = FakeStorage()
    monkeypatch.setattr(social_router, 'storage_client', lambda: storage)
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    owner = register(http, 'social-public-owner@example.com')
    follower = register(http, 'social-public-follower@example.com')
    admin = register(http, 'social-admin@example.com')
    owner_id = http.get('/api/v1/me', headers=owner).json()['id']
    follower_id = http.get('/api/v1/me', headers=follower).json()['id']
    assert http.put(f'/api/v1/users/{owner_id}/follow', headers=follower).json()['state'] == 'pending'
    assert http.put('/api/v1/me/privacy', json={'social_public': True}, headers=owner).json()['social_public'] is True
    relation = db.scalar(select(Follow).where(Follow.follower_id == follower_id, Follow.followed_id == owner_id))
    assert relation.approved is True
    post = create_post(http, owner).json()
    assert [item['id'] for item in http.get('/api/v1/posts', headers=follower).json()['items']] == [post['id']]

    report = http.post('/api/v1/reports', json={'target_type': 'post', 'target_id': post['id'],
        'reason': 'spam', 'description': 'Conteúdo para análise'}, headers=follower)
    assert report.status_code == 201
    admin_user_id = http.get('/api/v1/me', headers=admin).json()['id']
    db.get(User, admin_user_id).is_admin = True
    db.commit()
    queue = http.get('/api/v1/admin/reports', headers=admin)
    assert queue.status_code == 200 and queue.json()['items'][0]['target_preview']['caption'] == 'Momento no esporte'
    image = http.get(queue.json()['items'][0]['target_preview']['image_url'], headers=admin)
    assert image.status_code == 200 and image.content.startswith(b'RIFF')
    decision = http.post(f"/api/v1/admin/reports/{report.json()['id']}/decision",
        json={'action': 'suspend', 'justification': 'Revisão confirmou abuso.'}, headers=admin)
    assert decision.status_code == 200
    assert db.scalar(select(ModerationAction).where(ModerationAction.report_id == report.json()['id'])) is not None
    assert http.get('/api/v1/me', headers=owner).status_code == 401
    assert http.get(post['image_url'], headers=follower).status_code == 404


def test_social_search_profiles_pagination_avatar_interactions_and_post_cleanup(client, monkeypatch):
    http, db = client
    storage = FakeStorage()
    monkeypatch.setattr(social_router, 'storage_client', lambda: storage)
    monkeypatch.setattr(identity_router, 'storage_client', lambda: storage)
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    owner = register(http, 'social-routes-owner@example.com', 'Conta Pública')
    viewer = register(http, 'social-routes-viewer@example.com', 'Conta Visitante')
    owner_id = http.get('/api/v1/me', headers=owner).json()['id']
    viewer_id = http.get('/api/v1/me', headers=viewer).json()['id']
    assert http.put('/api/v1/me/privacy', json={'social_public': True}, headers=owner).status_code == 200
    owner_avatar = http.put('/api/v1/me/avatar', files={'file': ('avatar.png', square_png(), 'image/png')}, headers=owner)
    viewer_avatar = http.put('/api/v1/me/avatar', files={'file': ('avatar.png', square_png(), 'image/png')}, headers=viewer)
    assert owner_avatar.status_code == viewer_avatar.status_code == 200

    first = create_post(http, owner, 'Primeira legenda').json()
    second = create_post(http, owner, 'Segunda legenda').json()
    search = http.get('/api/v1/users?q=Conta%20P%C3%BAblica', headers=viewer)
    assert search.status_code == 200 and [person['id'] for person in search.json()['items']] == [owner_id]
    assert http.get('/api/v1/users?q=%20%20', headers=viewer).status_code == 422
    profile = http.get(f'/api/v1/users/{owner_id}', headers=viewer).json()
    assert profile['post_count'] == 2 and profile['social_public'] is True
    first_page = http.get(f'/api/v1/users/{owner_id}/posts?limit=1', headers=viewer).json()
    assert len(first_page['items']) == 1 and first_page['next_cursor']
    second_page = http.get(f"/api/v1/users/{owner_id}/posts?limit=1&cursor={first_page['next_cursor']}", headers=viewer).json()
    assert len(second_page['items']) == 1 and first_page['items'][0]['id'] != second_page['items'][0]['id']
    assert http.get(f"/api/v1/users/{owner_id}/avatar?v={owner_avatar.json()['avatar']['id']}", headers=viewer).content.startswith(b'RIFF')
    assert http.get(f"/api/v1/users/{owner_id}/avatar?v={viewer_avatar.json()['avatar']['id']}", headers=viewer).status_code == 404

    assert http.put(f"/api/v1/users/{owner_id}/follow", headers=viewer).json()['state'] == 'approved'
    assert len(http.get(f'/api/v1/users/{owner_id}/followers', headers=viewer).json()['items']) == 1
    assert len(http.get(f'/api/v1/users/{viewer_id}/following', headers=viewer).json()['items']) == 1
    followers = http.get(f'/api/v1/users/{owner_id}/followers', headers=owner).json()['items']
    assert followers[0]['user']['id'] == viewer_id
    assert http.delete(f'/api/v1/me/followers/{viewer_id}', headers=owner).status_code == 204

    assert http.put(f"/api/v1/posts/{first['id']}/like", headers=viewer).status_code == 204
    assert http.delete(f"/api/v1/posts/{first['id']}/like", headers=viewer).status_code == 204
    assert db.scalar(select(PostLike).where(PostLike.post_id == first['id'])) is None
    comment = http.post(f"/api/v1/posts/{first['id']}/comments", json={'body': 'Comentário com avatar'}, headers=viewer)
    assert comment.status_code == 201
    comment_avatar_url = f"/api/v1/comments/{comment.json()['id']}/avatar?v={viewer_avatar.json()['avatar']['id']}"
    assert http.get(comment_avatar_url, headers=owner).content.startswith(b'RIFF')
    assert http.get(f"/api/v1/posts/{first['id']}/comments", headers=viewer).json()['items'][0]['author_avatar_url'] == comment_avatar_url
    report = http.post('/api/v1/reports', json={'target_type': 'comment', 'target_id': comment.json()['id'],
        'reason': 'assedio'}, headers=viewer)
    assert report.status_code == 201
    assert http.delete(f"/api/v1/comments/{comment.json()['id']}", headers=viewer).status_code == 204
    assert http.delete(f"/api/v1/comments/{comment.json()['id']}", headers=owner).status_code == 404
    assert http.patch(f"/api/v1/posts/{second['id']}", json={'caption': 'Legenda atualizada'}, headers=owner).json()['caption'] == 'Legenda atualizada'
    assert http.delete(f"/api/v1/posts/{first['id']}", headers=owner).status_code == 204
    assert http.get(f"/api/v1/posts/{first['id']}", headers=owner).status_code == 404
    deleted_media_id = first['image_url'].split('v=')[1]
    assert all(key != f'posts/{deleted_media_id}.webp' for _, key in storage.objects)
    assert db.get(MediaObject, deleted_media_id) is None
    assert db.get(Post, first['id']) is None


def test_block_lists_report_permissions_and_moderation_decisions(client, monkeypatch):
    http, db = client
    storage = FakeStorage()
    monkeypatch.setattr(social_router, 'storage_client', lambda: storage)
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    owner = register(http, 'social-admin-target@example.com', 'Pessoa Alvo')
    reporter = register(http, 'social-admin-reporter@example.com', 'Pessoa Denunciante')
    admin = register(http, 'social-admin-reviewer@example.com', 'Pessoa Moderadora')
    owner_id = http.get('/api/v1/me', headers=owner).json()['id']
    reporter_id = http.get('/api/v1/me', headers=reporter).json()['id']
    admin_id = http.get('/api/v1/me', headers=admin).json()['id']
    denied = http.get('/api/v1/admin/reports', headers=reporter)
    assert denied.status_code == 403
    assert http.get('/api/v1/users?q=Pessoa', headers=reporter).status_code == 200
    assert http.put(f'/api/v1/users/{owner_id}/follow', headers=reporter).json()['state'] == 'pending'
    assert len(http.get('/api/v1/me/follow-requests', headers=owner).json()['items']) == 1
    assert http.put(f'/api/v1/me/follow-requests/{reporter_id}?approve=false', headers=owner).json()['state'] == 'rejected'
    assert http.put(f'/api/v1/users/{owner_id}/follow', headers=reporter).json()['state'] == 'pending'
    assert http.put(f'/api/v1/users/{owner_id}/block', headers=reporter).status_code == 204
    assert [person['id'] for person in http.get('/api/v1/me/blocks', headers=reporter).json()['items']] == [owner_id]
    assert http.get(f'/api/v1/users/{owner_id}', headers=reporter).status_code == 404
    assert http.delete(f'/api/v1/users/{owner_id}/block', headers=reporter).status_code == 204
    assert http.get('/api/v1/me/blocks', headers=reporter).json()['items'] == []

    public = http.put('/api/v1/me/privacy', json={'social_public': True}, headers=owner)
    assert public.status_code == 200
    post = create_post(http, owner, 'Post sob revisão').json()
    comment = http.post(f"/api/v1/posts/{post['id']}/comments", json={'body': 'Comentário reportável'}, headers=reporter).json()
    reports = []
    for target_type, target_id in [('post', post['id']), ('comment', comment['id']), ('user', owner_id)]:
        response = http.post('/api/v1/reports', json={'target_type': target_type, 'target_id': target_id,
            'reason': 'spam', 'description': 'Revisar conteúdo'}, headers=reporter)
        assert response.status_code == 201
        reports.append(response.json()['id'])
    assert http.post(f"/api/v1/posts/{post['id']}/comments", json={'body': '   '}, headers=reporter).status_code == 422

    db.get(User, admin_id).is_admin = True
    db.commit()
    page = http.get('/api/v1/admin/reports?limit=1', headers=admin)
    assert page.status_code == 200 and page.json()['next_cursor']
    following_page = http.get(f"/api/v1/admin/reports?limit=1&cursor={page.json()['next_cursor']}", headers=admin)
    assert following_page.status_code == 200 and len(following_page.json()['items']) == 1
    queue = http.get('/api/v1/admin/reports', headers=admin).json()['items']
    assert queue and queue[0]['target_preview'] is not None
    image_path = f"/api/v1/admin/reports/{reports[0]}/image"
    assert http.get(image_path, headers=admin).status_code == 200
    assert http.post(f'/api/v1/admin/reports/{reports[0]}/decision', json={'action': 'dismiss',
        'justification': 'Após análise, sem violação.'}, headers=admin).status_code == 200
    assert http.get(image_path, headers=admin).status_code == 404
    assert http.get('/api/v1/admin/reports?status=resolved', headers=admin).status_code == 200

    remaining = reports[1:]
    comment_report = http.post(f'/api/v1/admin/reports/{remaining[0]}/decision', json={'action': 'remove',
        'justification': 'Comentário viola a regra.'}, headers=admin)
    assert comment_report.status_code == 200 and db.get(PostComment, comment['id']) is None
    post_report = http.post(f'/api/v1/admin/reports/{remaining[1]}/decision', json={'action': 'suspend',
        'justification': 'Suspensão após revisão.'}, headers=admin)
    assert post_report.status_code == 200 and http.get('/api/v1/me', headers=owner).status_code == 401
    assert http.put(f'/api/v1/admin/users/{owner_id}/status?active=true&justification=Conta%20revisada', json={}, headers=admin).status_code == 200
    assert http.get('/api/v1/me', headers=owner).status_code == 401
    actions = db.scalars(select(ModerationAction).where(ModerationAction.admin_id == admin_id)).all()
    assert len(actions) == 4

import io

from PIL import Image
from sqlalchemy.exc import SQLAlchemyError

from app.routers import identity as identity_router
from app.routers import social as social_router
from app.services import media as media_service

ACCOUNT = {'name': 'Atleta Capa', 'email': 'cover@example.com', 'birth_date': '1995-01-01', 'password': 'test-password-123'}


class FakeStorage:
    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, **_):
        self.objects[(Bucket, Key)] = Body

    def get_object(self, Bucket, Key):
        return {'Body': io.BytesIO(self.objects[(Bucket, Key)])}

    def delete_object(self, Bucket, Key):
        self.objects.pop((Bucket, Key), None)


def png(size=(1000, 1000)):
    data = io.BytesIO()
    Image.new('RGB', size, 'green').save(data, format='PNG')
    return data.getvalue()


def account(http, email):
    assert http.post('/api/v1/auth/register', json={**ACCOUNT, 'email': email}).status_code == 201
    response = http.post('/api/v1/auth/login', json={'email': email, 'password': ACCOUNT['password']})
    return {'Authorization': f"Bearer {response.json()['token']}"}


def use_storage(monkeypatch):
    storage = FakeStorage()
    for module in (media_service, identity_router, social_router):
        monkeypatch.setattr(module, 'storage_client', lambda: storage)
    return storage


def test_cover_upload_replacement_private_read_and_reset(client, monkeypatch):
    http, _ = client
    storage = use_storage(monkeypatch)
    owner = account(http, 'cover-owner@example.com')
    first = http.put('/api/v1/me/cover', files={'file': ('capa.png', png(), 'image/png')}, headers=owner)
    assert first.status_code == 200, first.text
    cover = first.json()['cover']
    assert cover['url'].startswith('/api/v1/me/cover?v=') and first.json()['avatar'] is None
    content = http.get(cover['url'], headers=owner).content
    with Image.open(io.BytesIO(content)) as image:
        assert image.format == 'WEBP' and image.size == (1000, 400)
    assert http.get(cover['url']).status_code == 401
    assert list(storage.objects)[0][1].startswith('covers/')

    avatar = http.put('/api/v1/me/avatar', files={'file': ('foto.png', png((40, 40)), 'image/png')}, headers=owner)
    assert avatar.json()['cover'] == cover

    replacement = http.put('/api/v1/me/cover', files={'file': ('nova.png', png(), 'image/png')}, headers=owner)
    assert replacement.json()['cover']['id'] != cover['id']
    assert http.get(cover['url'], headers=owner).status_code == 404
    assert len(storage.objects) == 2

    assert http.delete('/api/v1/me/cover', headers=owner).status_code == 204
    assert http.delete('/api/v1/me/cover', headers=owner).status_code == 204
    me = http.get('/api/v1/me', headers=owner).json()
    assert me['cover'] is None and me['avatar'] is not None
    assert len(storage.objects) == 1


def test_cover_upload_requires_session_origin_and_valid_file(client):
    http, _ = client
    assert http.put('/api/v1/me/cover', files={'file': ('x.png', png(), 'image/png')}).status_code == 401
    owner = account(http, 'cover-limits@example.com')
    oversized = {'file': ('big.png', b'x' * (6 * 1024 * 1024), 'image/png')}
    early_limit = http.put('/api/v1/me/cover', files=oversized, headers={**owner, 'Origin': 'http://localhost:5173'})
    assert early_limit.status_code == 413
    assert early_limit.headers['access-control-allow-origin'] == 'http://localhost:5173'
    assert http.put('/api/v1/me/cover', files={'file': ('x.png', b'not-an-image', 'image/png')}, headers=owner).status_code == 422
    assert http.put('/api/v1/me/cover', json={'file': 'x'}, headers=owner).status_code == 415
    attacker = {**owner, 'Origin': 'https://attacker.invalid'}
    assert http.put('/api/v1/me/cover', files={'file': ('x.png', png(), 'image/png')}, headers=attacker).status_code == 403
    assert http.delete('/api/v1/me/cover', headers=attacker).status_code == 403


def test_failed_database_commit_preserves_current_cover(client, monkeypatch):
    http, db = client
    use_storage(monkeypatch)
    owner = account(http, 'cover-commit@example.com')
    previous = http.put('/api/v1/me/cover', files={'file': ('a.png', png(), 'image/png')}, headers=owner).json()['cover']

    def fail_commit():
        raise SQLAlchemyError('database detail must stay private')

    with monkeypatch.context() as patcher:
        patcher.setattr(db, 'commit', fail_commit)
        failed = http.put('/api/v1/me/cover', files={'file': ('b.png', png(), 'image/png')}, headers=owner)
    assert failed.status_code == 503 and 'database detail' not in failed.text
    assert http.get('/api/v1/me', headers=owner).json()['cover'] == previous


def test_other_members_see_cover_of_private_account_unless_blocked(client, monkeypatch):
    http, _ = client
    use_storage(monkeypatch)
    owner = account(http, 'cover-private-owner@example.com')
    visitor = account(http, 'cover-visitor@example.com')
    owner_id = http.get('/api/v1/me', headers=owner).json()['id']
    visitor_id = http.get('/api/v1/me', headers=visitor).json()['id']
    http.put('/api/v1/me/cover', files={'file': ('a.png', png(), 'image/png')}, headers=owner)

    profile = http.get(f'/api/v1/users/{owner_id}', headers=visitor).json()
    assert profile['social_public'] is False and profile['cover_url'].startswith(f'/api/v1/users/{owner_id}/cover?v=')
    assert http.get(profile['cover_url'], headers=visitor).content.startswith(b'RIFF')
    assert http.get(profile['cover_url']).status_code == 401
    stale = profile['cover_url'].split('v=')[0] + 'v=00000000-0000-0000-0000-000000000000'
    assert http.get(stale, headers=visitor).status_code == 404

    assert http.put(f'/api/v1/users/{visitor_id}/block', headers=owner).status_code == 204
    assert http.get(profile['cover_url'], headers=visitor).status_code == 404

import io
import os
import uuid

import boto3
import pytest
from botocore import UNSIGNED
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError
from PIL import Image
from sqlalchemy.exc import SQLAlchemyError

from app.routers import identity as identity_router
from app.services import media as media_service

ACCOUNT = {'name': 'Atleta Avatar', 'email': 'avatar@example.com', 'birth_date': '1995-01-01', 'password': 'test-password-123'}


class FakeStorage:
    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, **_):
        self.objects[(Bucket, Key)] = Body

    def get_object(self, Bucket, Key):
        from io import BytesIO
        return {'Body': BytesIO(self.objects[(Bucket, Key)])}

    def delete_object(self, Bucket, Key):
        self.objects.pop((Bucket, Key), None)


def png():
    data = io.BytesIO()
    Image.new('RGB', (30, 20), 'green').save(data, format='PNG')
    return data.getvalue()


def gif():
    data = io.BytesIO()
    Image.new('RGB', (20, 20), 'orange').save(data, format='GIF')
    return data.getvalue()


def login(http, email):
    response = http.post('/api/v1/auth/login', json={'email': email, 'password': ACCOUNT['password']})
    return {'Authorization': f"Bearer {response.json()['token']}"}


def test_avatar_upload_replacement_private_read_and_idempotent_delete(client, monkeypatch):
    http, _ = client
    storage = FakeStorage()
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    monkeypatch.setattr(identity_router, 'storage_client', lambda: storage)
    assert http.post('/api/v1/auth/register', json=ACCOUNT).status_code == 201
    owner = login(http, ACCOUNT['email'])
    first = http.put('/api/v1/me/avatar', files={'file': ('photo.jpg', png(), 'image/jpeg')}, headers=owner)
    assert first.status_code == 200
    avatar = first.json()['avatar']
    assert avatar['url'].startswith('/api/v1/me/avatar?v=')
    assert http.get(avatar['url'], headers=owner).content.startswith(b'RIFF')
    assert http.get(avatar['url']).status_code == 401
    assert len(storage.objects) == 1

    other = {**ACCOUNT, 'email': 'other-avatar@example.com'}
    assert http.post('/api/v1/auth/register', json=other).status_code == 201
    outsider = login(http, other['email'])
    assert http.get(avatar['url'], headers=outsider).status_code == 404
    assert http.delete('/api/v1/me/avatar', headers=outsider).status_code == 204

    replacement = http.put('/api/v1/me/avatar', files={'file': ('renamed.png', png(), 'image/png')}, headers=owner)
    assert replacement.status_code == 200
    assert replacement.json()['avatar']['id'] != avatar['id']
    assert http.get(avatar['url'], headers=owner).status_code == 404
    assert len(storage.objects) == 1
    assert http.delete('/api/v1/me/avatar', headers=owner).status_code == 204
    assert http.delete('/api/v1/me/avatar', headers=owner).status_code == 204
    assert http.get('/api/v1/me', headers=owner).json()['avatar'] is None
    assert storage.objects == {}


def test_avatar_upload_requires_session_origin_and_valid_file(client):
    http, _ = client
    assert http.put('/api/v1/me/avatar', files={'file': ('x.png', png(), 'image/png')}).status_code == 401
    assert http.post('/api/v1/auth/register', json=ACCOUNT).status_code == 201
    owner = login(http, ACCOUNT['email'])
    assert http.put('/api/v1/me/avatar', files={'file': ('oversized.png', b'x' * (5 * 1024 * 1024 + 1), 'image/png')}, headers=owner).status_code == 413
    early_limit = http.put('/api/v1/me/avatar', files={'file': ('oversized.png', b'x' * (6 * 1024 * 1024), 'image/png')}, headers={**owner, 'Origin': 'http://localhost:5173'})
    assert early_limit.status_code == 413
    assert early_limit.headers['access-control-allow-origin'] == 'http://localhost:5173'
    assert http.put('/api/v1/me/avatar', files={'file': ('disguised.png', gif(), 'image/png')}, headers=owner).status_code == 415
    assert http.put('/api/v1/me/avatar', files={'file': ('x.gif', b'GIF89a', 'image/gif')}, headers=owner).status_code == 422
    assert http.put('/api/v1/me/avatar', files={'file': ('x.gif', b'not-a-image', 'image/gif')}, headers=owner).status_code == 422
    assert http.put('/api/v1/me/avatar', files={'file': ('x.png', png(), 'image/png')}, headers={**owner, 'Origin': 'https://attacker.invalid'}).status_code == 403


def test_failed_database_commit_preserves_current_avatar(client, monkeypatch):
    http, db = client
    storage = FakeStorage()
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    monkeypatch.setattr(identity_router, 'storage_client', lambda: storage)
    assert http.post('/api/v1/auth/register', json=ACCOUNT).status_code == 201
    owner = login(http, ACCOUNT['email'])
    first = http.put('/api/v1/me/avatar', files={'file': ('first.png', png(), 'image/png')}, headers=owner)
    previous = first.json()['avatar']

    def fail_commit():
        raise SQLAlchemyError('database detail must stay private')

    with monkeypatch.context() as patcher:
        patcher.setattr(db, 'commit', fail_commit)
        failed = http.put('/api/v1/me/avatar', files={'file': ('next.png', png(), 'image/png')}, headers=owner)
    assert failed.status_code == 503
    assert 'database detail' not in failed.text
    assert http.get('/api/v1/me', headers=owner).json()['avatar'] == previous


@pytest.mark.skipif(os.environ.get('MEDIA_TEST_S3') != '1', reason='Configure um bucket S3 isolado em MEDIA_TEST_S3=1.')
def test_s3_compatible_storage_roundtrip():
    settings = media_service.get_settings()
    key = f'tests/{uuid.uuid4()}.webp'
    client = media_service.storage_client()
    try:
        client.put_object(Bucket=settings.media_s3_bucket, Key=key, Body=b'private-avatar-check', ContentType='image/webp')
        received = client.get_object(Bucket=settings.media_s3_bucket, Key=key)
        assert received['Body'].read() == b'private-avatar-check'
        received['Body'].close()
        anonymous = boto3.client('s3', endpoint_url=settings.media_s3_endpoint,
                                 region_name=settings.media_s3_region,
                                 config=BotoConfig(signature_version=UNSIGNED, s3={'addressing_style': 'path'}))
        with pytest.raises(ClientError):
            anonymous.get_object(Bucket=settings.media_s3_bucket, Key=key)
    finally:
        client.delete_object(Bucket=settings.media_s3_bucket, Key=key)

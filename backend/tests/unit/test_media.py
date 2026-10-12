import asyncio
import io
from datetime import timedelta

import pytest
from fastapi import HTTPException
from PIL import Image

from app.services import media as media_service
from app.services.media import normalize_avatar, normalize_cover, normalize_post_image


def image_bytes(image_format='PNG', size=(900, 600)):
    stream = io.BytesIO()
    Image.new('RGB', size, '#28764d').save(stream, format=image_format)
    return stream.getvalue()


def test_avatar_is_cropped_to_square_webp_without_original_metadata():
    normalized = normalize_avatar(image_bytes())
    with Image.open(io.BytesIO(normalized)) as image:
        assert image.format == 'WEBP'
        assert image.size == (512, 512)
        assert not image.getexif()


def test_small_avatar_is_not_upscaled():
    normalized = normalize_avatar(image_bytes(size=(120, 80)))
    with Image.open(io.BytesIO(normalized)) as image:
        assert image.size == (80, 80)


def test_post_image_must_be_square_and_is_optimized_without_upscaling():
    with pytest.raises(HTTPException) as error:
        normalize_post_image(image_bytes())
    assert error.value.status_code == 422
    normalized = normalize_post_image(image_bytes(size=(700, 700)))
    with Image.open(io.BytesIO(normalized)) as image:
        assert image.format == 'WEBP' and image.size == (700, 700)
        assert not image.getexif()


def test_rejects_animation_and_unsupported_image_formats():
    frames = [Image.new('RGB', (10, 10), color) for color in ('red', 'blue')]
    stream = io.BytesIO()
    frames[0].save(stream, format='GIF', save_all=True, append_images=frames[1:])
    with pytest.raises(HTTPException) as animation:
        normalize_avatar(stream.getvalue())
    assert animation.value.status_code == 415
    with pytest.raises(HTTPException) as invalid:
        normalize_avatar(b'not an image')
    assert invalid.value.status_code == 422


def test_rejects_images_over_pixel_limit():
    stream = io.BytesIO()
    Image.new('RGB', (5001, 5000)).save(stream, format='PNG')
    with pytest.raises(HTTPException) as error:
        normalize_avatar(stream.getvalue())
    assert error.value.status_code == 413


def test_stores_normalized_image_before_linking_user(monkeypatch):
    class Storage:
        saved = None

        def put_object(self, **values):
            self.saved = values

        def delete_object(self, **_):
            pass

    class Db:
        def add(self, value): self.added = value
        def flush(self): pass
        def commit(self): pass
        def delete(self, _): pass
        def rollback(self): pass

    class User:
        id = 7
        avatar_media = None

    storage = Storage()
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    db, user = Db(), User()
    media = media_service.store_avatar(db, user, normalize_avatar(image_bytes(size=(40, 40))))
    assert media.user_id == 7 and media.content_type == 'image/webp'
    assert media.width == media.height == 40
    assert user.avatar_media is media
    assert storage.saved['Key'] == f'avatars/{media.id}.webp'


def test_replacement_cleans_previous_object_after_commit(monkeypatch):
    from types import SimpleNamespace

    class Storage:
        deleted = []
        def put_object(self, **_): pass
        def delete_object(self, **values): self.deleted.append(values['Key'])

    class Db:
        commits = 0
        def add(self, _): pass
        def flush(self): pass
        def commit(self): self.commits += 1
        def delete(self, _): pass
        def rollback(self): pass

    class User:
        id = 8
        avatar_media = SimpleNamespace(bucket='arena-media', object_key='avatars/old.webp')

    storage, db = Storage(), Db()
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    media_service.store_avatar(db, User(), normalize_avatar(image_bytes(size=(40, 40))))
    assert storage.deleted == ['avatars/old.webp']
    assert db.commits == 2


def test_replacement_keeps_new_avatar_when_old_object_cleanup_fails(monkeypatch):
    from types import SimpleNamespace

    class Storage:
        def put_object(self, **_): pass
        def delete_object(self, **_): raise OSError('storage temporarily unavailable')

    class Db:
        commits = 0
        rollbacks = 0
        def add(self, _): pass
        def flush(self): pass
        def commit(self): self.commits += 1
        def delete(self, _): pass
        def rollback(self): self.rollbacks += 1

    class User:
        id = 9
        avatar_media = SimpleNamespace(bucket='arena-media', object_key='avatars/old.webp')

    monkeypatch.setattr(media_service, 'storage_client', lambda: Storage())
    db, user = Db(), User()
    result = media_service.store_avatar(db, user, normalize_avatar(image_bytes(size=(40, 40))))
    assert user.avatar_media is result
    assert db.commits == 1 and db.rollbacks == 1


def test_storage_failures_return_safe_503(monkeypatch):
    monkeypatch.setattr(media_service, 'storage_client', lambda: (_ for _ in ()).throw(OSError('secret endpoint')))
    with pytest.raises(HTTPException) as error:
        media_service.require_storage(lambda: media_service.storage_client().get_object(Bucket='x', Key='y'))
    assert error.value.status_code == 503
    assert 'secret endpoint' not in str(error.value.detail)


def test_bucket_setup_is_idempotent_and_creates_missing_bucket(monkeypatch):
    class Storage:
        missing = False
        created = False

        def head_bucket(self, **_):
            if self.missing:
                from botocore.exceptions import ClientError
                raise ClientError({'Error': {'Code': 'NoSuchBucket'}, 'ResponseMetadata': {'HTTPStatusCode': 404}}, 'HeadBucket')

        def create_bucket(self, **_): self.created = True

    storage = Storage()
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    media_service.ensure_bucket()
    assert not storage.created
    storage.missing = True
    media_service.ensure_bucket()
    assert storage.created


def test_reconcile_removes_old_unlinked_objects_and_metadata(monkeypatch):
    from datetime import datetime, timezone
    from types import SimpleNamespace

    class Storage:
        deleted = []

        def get_paginator(self, _):
            return self

        def paginate(self, Prefix, **_):
            keys = [f'{Prefix}linked.webp', f'{Prefix}orphan.webp']
            return [{'Contents': [
                {'Key': keys[0], 'LastModified': datetime.now(timezone.utc) - timedelta(days=30)},
                {'Key': keys[1], 'LastModified': datetime.now(timezone.utc) - timedelta(days=2)},
            ]}]

        def delete_object(self, **values): self.deleted.append(values['Key'])

    class Values:
        def __init__(self, value): self.value = value
        def all(self): return self.value

    class Db:
        def __init__(self):
            self.results = [Values(['avatars/linked.webp', 'covers/linked.webp']), Values(['posts/linked.webp']),
                            Values(['crests/linked.webp']), Values(['receipts/linked.webp']),
                            Values([SimpleNamespace()])]
            self.deleted = 0
        def scalars(self, _): return self.results.pop(0)
        def delete(self, _): self.deleted += 1
        def commit(self): pass

    storage, db = Storage(), Db()
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    assert media_service.reconcile_orphans(db) == 5
    assert storage.deleted == ['avatars/orphan.webp', 'covers/orphan.webp', 'posts/orphan.webp', 'crests/orphan.webp',
                               'receipts/orphan.webp']
    assert db.deleted == 1


def test_avatar_body_limit_rejects_length_before_reading_and_sets_cors():
    from app.core.config import get_settings
    from app.main import AvatarBodyLimitMiddleware

    sent = []

    async def unused_app(*_):
        raise AssertionError('oversized body must not reach the API')

    async def receive():
        raise AssertionError('known oversized body must not be read')

    async def send(message): sent.append(message)

    scope = {'type': 'http', 'method': 'PUT', 'path': '/api/v1/me/avatar', 'headers': [
        (b'content-length', str(get_settings().media_max_upload_bytes + 300_000).encode()),
        (b'origin', b'http://localhost:5173'),
    ]}
    asyncio.run(AvatarBodyLimitMiddleware(unused_app)(scope, receive, send))
    assert sent[0]['status'] == 413
    assert (b'access-control-allow-origin', b'http://localhost:5173') in sent[0]['headers']


def test_avatar_body_limit_bounds_chunked_requests_and_replays_allowed_body():
    from app.main import AvatarBodyLimitMiddleware

    async def exercise(body, should_reject):
        sent, called = [], []
        messages = iter(body)

        async def receive():
            return next(messages, {'type': 'http.disconnect'})

        async def send(message): sent.append(message)

        async def app(scope, downstream_receive, downstream_send):
            chunks = []
            while True:
                message = await downstream_receive()
                if message['type'] == 'http.disconnect':
                    break
                chunks.append(message.get('body', b''))
                if not message.get('more_body', False):
                    break
            called.append(b''.join(chunks))
            await downstream_send({'type': 'http.response.start', 'status': 204, 'headers': []})
            await downstream_send({'type': 'http.response.body', 'body': b''})

        scope = {'type': 'http', 'method': 'PUT', 'path': '/api/v1/me/avatar', 'headers': []}
        await AvatarBodyLimitMiddleware(app)(scope, receive, send)
        assert (sent[0]['status'] == 413) is should_reject
        assert bool(called) is not should_reject
        return called[0] if called else None

    limit = media_service.get_settings().media_max_upload_bytes + 256 * 1024
    rejected = [{'type': 'http.request', 'body': b'x' * (limit + 1), 'more_body': False}]
    assert asyncio.run(exercise(rejected, True)) is None
    allowed = [
        {'type': 'http.request', 'body': b'part-1', 'more_body': True},
        {'type': 'http.request', 'body': b'part-2', 'more_body': False},
    ]
    assert asyncio.run(exercise(allowed, False)) == b'part-1part-2'


@pytest.mark.parametrize(('size', 'expected'), [((3000, 3000), (1500, 600)), ((4000, 1000), (1500, 600)),
                                                ((500, 400), (500, 200)), ((100, 20), (50, 20)), ((1, 1), (1, 1))])
def test_cover_is_center_cropped_to_five_by_two_without_upscaling(size, expected):
    normalized = normalize_cover(image_bytes(size=size))
    with Image.open(io.BytesIO(normalized)) as image:
        assert image.format == 'WEBP' and image.size == expected
        assert not image.getexif()


def test_cover_rejects_animation_and_invalid_files():
    frames = [Image.new('RGB', (10, 10), color) for color in ('red', 'blue')]
    stream = io.BytesIO()
    frames[0].save(stream, format='GIF', save_all=True, append_images=frames[1:])
    with pytest.raises(HTTPException) as animation:
        normalize_cover(stream.getvalue())
    assert animation.value.status_code == 415
    with pytest.raises(HTTPException) as invalid:
        normalize_cover(b'not an image')
    assert invalid.value.status_code == 422


def test_cover_is_stored_under_its_prefix_and_replaces_only_the_cover(monkeypatch):
    from types import SimpleNamespace

    class Storage:
        saved, deleted = [], []
        def put_object(self, **values): self.saved.append(values['Key'])
        def delete_object(self, **values): self.deleted.append(values['Key'])

    class Db:
        def add(self, _): pass
        def flush(self): pass
        def commit(self): pass
        def delete(self, _): pass
        def rollback(self): pass

    avatar = SimpleNamespace(bucket='arena-media', object_key='avatars/kept.webp')
    user = SimpleNamespace(id=5, avatar_media=avatar,
                           cover_media=SimpleNamespace(bucket='arena-media', object_key='covers/old.webp'))
    storage = Storage()
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    media = media_service.store_user_image(Db(), user, normalize_cover(image_bytes(size=(500, 200))), 'cover')
    assert storage.saved == [f'covers/{media.id}.webp'] and storage.deleted == ['covers/old.webp']
    assert user.cover_media is media and user.avatar_media is avatar
    assert (media.width, media.height) == (500, 200)


def test_clearing_profile_image_unlinks_before_cleanup_and_tolerates_storage_failure(monkeypatch):
    from types import SimpleNamespace

    class Storage:
        def delete_object(self, **_): raise OSError('storage temporarily unavailable')

    class Db:
        commits = rollbacks = 0
        def commit(self): self.commits += 1
        def delete(self, _): pass
        def rollback(self): self.rollbacks += 1

    monkeypatch.setattr(media_service, 'storage_client', lambda: Storage())
    db = Db()
    user = SimpleNamespace(cover_media=SimpleNamespace(bucket='arena-media', object_key='covers/x.webp'))
    media_service.clear_user_image(db, user, 'cover')
    assert user.cover_media is None and db.commits == 1 and db.rollbacks == 1
    media_service.clear_user_image(db, user, 'cover')
    assert db.commits == 1

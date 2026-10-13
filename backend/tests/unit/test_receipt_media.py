import asyncio
import io
import json

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from app.main import UPLOAD_MESSAGES, app, upload_kind
from app.models.identity import MediaObject
from app.services import media as media_service
from app.services.media import prepare_receipt, private_file_response, read_receipt_upload, store_receipt

PDF = b'%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n'


def image_bytes(image_format='PNG', size=(1200, 800), **save):
    stream = io.BytesIO()
    Image.new('RGB', size, '#e9eef2').save(stream, format=image_format, **save)
    return stream.getvalue()


def test_pdf_receipt_is_kept_as_sent_without_rendering():
    receipt = prepare_receipt(PDF)
    assert (receipt.content, receipt.content_type, receipt.extension, receipt.file_type) == (
        PDF, 'application/pdf', 'pdf', 'pdf')
    assert receipt.width is None and receipt.height is None


def test_truncated_pdf_and_empty_file_are_refused():
    with pytest.raises(HTTPException) as truncated:
        prepare_receipt(PDF[:-7])
    assert truncated.value.status_code == 422 and 'PDF' in truncated.value.detail
    with pytest.raises(HTTPException) as empty:
        prepare_receipt(b'')
    assert empty.value.status_code == 422


def test_oversized_receipt_is_refused_with_the_file_message():
    limit = media_service.get_settings().media_max_upload_bytes
    with pytest.raises(HTTPException) as error:
        prepare_receipt(PDF + b' ' * limit)
    assert (error.value.status_code, error.value.detail) == (413, 'O arquivo excede o limite de 5 MiB.')


def test_image_receipt_keeps_proportions_loses_metadata_and_is_not_upscaled():
    exif = Image.Exif()
    exif[0x010E] = 'Comprovante de Pix com dados pessoais'
    receipt = prepare_receipt(image_bytes('JPEG', exif=exif.tobytes()))
    assert (receipt.content_type, receipt.extension, receipt.file_type) == ('image/webp', 'webp', 'imagem')
    assert (receipt.width, receipt.height) == (1200, 800)
    with Image.open(io.BytesIO(receipt.content)) as image:
        assert image.format == 'WEBP' and not image.getexif()
    large = prepare_receipt(image_bytes(size=(4800, 1200)))
    assert (large.width, large.height) == (2400, 600)


def test_unsupported_receipts_get_one_message_for_image_or_pdf():
    gif = io.BytesIO()
    Image.new('RGB', (10, 10)).save(gif, format='GIF')
    for raw in (gif.getvalue(), b'texto qualquer', b'\x89PNG quebrado'):
        with pytest.raises(HTTPException) as error:
            prepare_receipt(raw)
        assert (error.value.status_code, error.value.detail) == (415, media_service.RECEIPT_WRONG_TYPE)
    frames = [Image.new('RGB', (10, 10), color) for color in ('red', 'blue')]
    animated = io.BytesIO()
    frames[0].save(animated, format='WEBP', save_all=True, append_images=frames[1:])
    with pytest.raises(HTTPException) as error:
        prepare_receipt(animated.getvalue())
    assert error.value.detail == 'Imagens animadas não são aceitas.'
    huge = io.BytesIO()
    Image.new('RGB', (5001, 5000)).save(huge, format='PNG')
    with pytest.raises(HTTPException) as error:
        prepare_receipt(huge.getvalue())
    assert error.value.status_code == 413


class Storage:
    def __init__(self, body=b'', fail=False):
        self.saved, self.deleted, self.body, self.fail = None, [], body, fail

    def put_object(self, **values):
        self.saved = values

    def delete_object(self, **values):
        if self.fail:
            raise OSError('storage down')
        self.deleted.append(values['Key'])

    def get_object(self, **_):
        return {'Body': io.BytesIO(self.body)}


class Db:
    def __init__(self):
        self.added, self.flushed, self.committed = [], False, False

    def add(self, value):
        self.added.append(value)

    def flush(self):
        self.flushed = True

    def commit(self):
        self.committed = True


def test_store_receipt_uploads_privately_and_leaves_the_commit_to_the_caller(monkeypatch):
    storage, db = Storage(), Db()
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    media = store_receipt(db, 7, prepare_receipt(PDF))
    assert db.added == [media] and db.flushed and not db.committed
    assert media.object_key == f'receipts/{media.id}.pdf' and storage.saved['Key'] == media.object_key
    assert storage.saved['ContentType'] == 'application/pdf' and storage.saved['CacheControl'] == 'private, no-store'
    assert (media.user_id, media.size_bytes, media.width, media.height) == (7, len(PDF), None, None)
    image = store_receipt(db, 7, prepare_receipt(image_bytes()))
    assert image.object_key.endswith('.webp') and (image.width, image.height) == (1200, 800)


def test_discard_object_tolerates_storage_failures(monkeypatch):
    media = MediaObject(bucket='arena-media', object_key='receipts/x.pdf')
    storage = Storage()
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    media_service.discard_object(media)
    assert storage.deleted == ['receipts/x.pdf']
    monkeypatch.setattr(media_service, 'storage_client', lambda: Storage(fail=True))
    media_service.discard_object(media)


def test_private_file_response_serves_pdf_inline_and_images_without_disposition(monkeypatch):
    monkeypatch.setattr(media_service, 'storage_client', lambda: Storage(body=PDF))
    pdf = private_file_response(MediaObject(bucket='b', object_key='receipts/a.pdf', content_type='application/pdf'),
                                filename='comprovante-12')
    assert pdf.body == PDF and pdf.media_type == 'application/pdf'
    assert pdf.headers['content-disposition'] == 'inline; filename="comprovante-12.pdf"'
    assert pdf.headers['cache-control'] == 'private, no-store' and pdf.headers['x-content-type-options'] == 'nosniff'
    image = private_file_response(MediaObject(bucket='b', object_key='receipts/a.webp', content_type='image/webp'),
                                  filename='comprovante-12')
    assert 'content-disposition' not in image.headers and image.media_type == 'image/webp'


def test_read_receipt_upload_stops_one_byte_after_the_limit():
    limit = media_service.get_settings().media_max_upload_bytes

    class Upload:
        def __init__(self, size):
            self.size, self.closed, self.asked = size, False, None

        async def read(self, amount):
            self.asked = amount
            return b'x' * min(self.size, amount)

        async def close(self):
            self.closed = True

    small = Upload(10)
    assert asyncio.run(read_receipt_upload(small)) == b'x' * 10 and small.closed and small.asked == limit + 1
    with pytest.raises(HTTPException) as error:
        asyncio.run(read_receipt_upload(Upload(limit + 50)))
    assert error.value.status_code == 413 and error.value.detail == 'O arquivo excede o limite de 5 MiB.'


@pytest.mark.parametrize(('method', 'path', 'kind'), [
    ('PUT', '/api/v1/entries/3/receipt', 'arquivo'), ('PUT', '/api/v1/entries/3/refund-receipt', 'arquivo'),
    ('PUT', '/api/v1/me/avatar', 'imagem'), ('PUT', '/api/v1/teams/1/crest', 'imagem'),
    ('POST', '/api/v1/entries/3/receipt', None), ('GET', '/api/v1/entries/3/receipt', None),
    ('PUT', '/api/v1/entries/x/receipt', None), ('PUT', '/api/v1/entries/3/receipt/1', None),
    ('PUT', '/api/v1/entries//refund-receipt', None),
])
def test_receipt_routes_are_file_uploads(method, path, kind):
    assert upload_kind(method, path) == kind


def test_body_limit_and_content_type_messages_fit_images_or_pdfs():
    from app.core.config import get_settings
    from app.main import AvatarBodyLimitMiddleware

    sent = []

    async def unused_app(*_):
        raise AssertionError('oversized body must not reach the API')

    async def receive():
        raise AssertionError('known oversized body must not be read')

    async def send(message):
        sent.append(message)

    scope = {'type': 'http', 'method': 'PUT', 'path': '/api/v1/entries/5/receipt', 'headers': [
        (b'content-length', str(get_settings().media_max_upload_bytes + 300_000).encode())]}
    asyncio.run(AvatarBodyLimitMiddleware(unused_app)(scope, receive, send))
    assert sent[0]['status'] == 413
    assert json.loads(sent[1]['body'])['detail'] == 'O arquivo excede o limite de 5 MiB.'

    client = TestClient(app)
    response = client.put('/api/v1/entries/5/receipt', json={})
    assert response.status_code == 415
    assert response.json()['detail'] == UPLOAD_MESSAGES['arquivo']['not_multipart']
    assert client.put('/api/v1/me/avatar', json={}).json()['detail'] == 'Envie uma imagem em multipart/form-data.'

from __future__ import annotations

import io
import logging
import uuid
import warnings
from datetime import timedelta

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.identity import MediaObject, Post, User, utcnow
from app.models.teams import Team

logger = logging.getLogger('arena.media')
MAX_PIXELS = 25_000_000
ALLOWED_FORMATS = {'JPEG', 'PNG', 'WEBP'}
COVER_RATIO = (5, 2)
COVER_MAX_SIZE = (1500, 600)
# Profile image kinds: user attribute holding the media and the storage key prefix.
PROFILE_IMAGES = {'avatar': ('avatar_media', 'avatars/'), 'cover': ('cover_media', 'covers/')}


def storage_client():
    settings = get_settings()
    return boto3.client(
        's3', endpoint_url=settings.media_s3_endpoint, region_name=settings.media_s3_region,
        aws_access_key_id=settings.media_s3_access_key,
        aws_secret_access_key=settings.media_s3_secret_key,
        config=BotoConfig(signature_version='s3v4', s3={'addressing_style': 'path'}),
    )


def _normalize_profile_image(raw: bytes, reshape) -> bytes:
    """Validate an untrusted upload, apply EXIF orientation, reshape it and re-encode as WebP."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as probe:
                if probe.format not in ALLOWED_FORMATS:
                    raise HTTPException(415, 'Use uma imagem JPEG, PNG ou WebP.')
                if getattr(probe, 'is_animated', False) or getattr(probe, 'n_frames', 1) != 1:
                    raise HTTPException(415, 'Imagens animadas não são aceitas.')
                if probe.width * probe.height > MAX_PIXELS:
                    raise HTTPException(413, 'A imagem excede o limite de 25 megapixels.')
                probe.verify()
            with Image.open(io.BytesIO(raw)) as source:
                image = reshape(ImageOps.exif_transpose(source).convert('RGB'))
                output = io.BytesIO()
                image.save(output, format='WEBP', quality=85, method=6)
                return output.getvalue()
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError,
            Image.DecompressionBombWarning) as error:
        raise HTTPException(422, 'O arquivo não contém uma imagem válida.') from error


def _square(image: Image.Image) -> Image.Image:
    side = min(image.size)
    left = (image.width - side) // 2
    top = (image.height - side) // 2
    image = image.crop((left, top, left + side, top + side))
    image.thumbnail((512, 512), Image.Resampling.LANCZOS)
    return image


def _cover(image: Image.Image) -> Image.Image:
    """Centered 5:2 crop, downscaled to at most 1500x600 and never upscaled."""
    if image.width * COVER_RATIO[1] > image.height * COVER_RATIO[0]:
        width, height = max(1, round(image.height * COVER_RATIO[0] / COVER_RATIO[1])), image.height
    else:
        width, height = image.width, max(1, round(image.width * COVER_RATIO[1] / COVER_RATIO[0]))
    left = (image.width - width) // 2
    top = (image.height - height) // 2
    image = image.crop((left, top, left + width, top + height))
    image.thumbnail(COVER_MAX_SIZE, Image.Resampling.LANCZOS)
    return image


def normalize_avatar(raw: bytes) -> bytes:
    return _normalize_profile_image(raw, _square)


def normalize_cover(raw: bytes) -> bytes:
    return _normalize_profile_image(raw, _cover)


def normalize_post_image(raw: bytes) -> bytes:
    """Validate a client-cropped square image and optimize it without upscaling."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as probe:
                if probe.format not in ALLOWED_FORMATS:
                    raise HTTPException(415, 'Use uma imagem JPEG, PNG ou WebP.')
                if getattr(probe, 'is_animated', False) or getattr(probe, 'n_frames', 1) != 1:
                    raise HTTPException(415, 'Imagens animadas não são aceitas.')
                if probe.width * probe.height > MAX_PIXELS:
                    raise HTTPException(413, 'A imagem excede o limite de 25 megapixels.')
                probe.verify()
            with Image.open(io.BytesIO(raw)) as source:
                image = ImageOps.exif_transpose(source).convert('RGB')
                if image.width != image.height:
                    raise HTTPException(422, 'A imagem precisa ser recortada em formato quadrado.')
                image.thumbnail((1080, 1080), Image.Resampling.LANCZOS)
                output = io.BytesIO()
                image.save(output, format='WEBP', quality=86, method=6)
                return output.getvalue()
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError,
            Image.DecompressionBombWarning) as error:
        raise HTTPException(422, 'O arquivo não contém uma imagem válida.') from error


def require_storage(operation):
    try:
        return operation()
    except (BotoCoreError, ClientError, OSError) as error:
        logger.error('Media storage operation failed: %s', type(error).__name__)
        raise HTTPException(503, 'Armazenamento de imagens indisponível. Tente novamente.') from None


def ensure_bucket() -> None:
    client = storage_client()
    bucket = get_settings().media_s3_bucket
    try:
        client.head_bucket(Bucket=bucket)
    except ClientError as error:
        status = error.response.get('ResponseMetadata', {}).get('HTTPStatusCode')
        code = error.response.get('Error', {}).get('Code')
        if status != 404 and code not in {'NoSuchBucket', '404'}:
            raise
        client.create_bucket(Bucket=bucket)


def store_user_image(db: Session, user: User, normalized: bytes, kind: str) -> MediaObject:
    attribute, prefix = PROFILE_IMAGES[kind]
    settings = get_settings()
    media_id = uuid.uuid4()
    key = f'{prefix}{media_id}.webp'
    require_storage(lambda: storage_client().put_object(
        Bucket=settings.media_s3_bucket, Key=key, Body=normalized,
        ContentType='image/webp', CacheControl='private, no-store',
    ))
    with Image.open(io.BytesIO(normalized)) as image:
        width, height = image.size
    media = MediaObject(id=media_id, user_id=user.id, bucket=settings.media_s3_bucket,
                        object_key=key, content_type='image/webp', size_bytes=len(normalized),
                        width=width, height=height)
    db.add(media)
    db.flush()
    previous = getattr(user, attribute)
    setattr(user, attribute, media)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    if previous is not None:
        try:
            remove_object(previous)
            db.delete(previous)
            db.commit()
        except Exception as error:
            db.rollback()
            logger.error('Old %s cleanup deferred: %s', kind, type(error).__name__)
    return media


def store_avatar(db: Session, user: User, normalized: bytes) -> MediaObject:
    return store_user_image(db, user, normalized, 'avatar')


def clear_user_image(db: Session, user: User, kind: str) -> None:
    """Unlink the profile image first, then remove the object; failures are left for reconcile."""
    attribute, _ = PROFILE_IMAGES[kind]
    media = getattr(user, attribute)
    if media is None:
        return
    setattr(user, attribute, None)
    db.commit()
    try:
        remove_object(media)
        db.delete(media)
        db.commit()
    except Exception as error:
        db.rollback()
        logger.error('Removed %s cleanup deferred: %s', kind, type(error).__name__)


def remove_object(media: MediaObject) -> None:
    require_storage(lambda: storage_client().delete_object(Bucket=media.bucket, Key=media.object_key))


def reconcile_orphans(db: Session, older_than_hours: int = 24) -> int:
    settings = get_settings()
    client = storage_client()
    linked = set(db.scalars(select(MediaObject.object_key).join(
        User, or_(User.avatar_media_id == MediaObject.id, User.cover_media_id == MediaObject.id)
    )).all())
    linked.update(db.scalars(select(MediaObject.object_key).join(Post, Post.media_id == MediaObject.id)).all())
    linked.update(db.scalars(select(MediaObject.object_key).join(Team, Team.crest_media_id == MediaObject.id)).all())
    threshold = utcnow() - timedelta(hours=older_than_hours)
    removed = 0
    try:
        paginator = client.get_paginator('list_objects_v2')
        for prefix in ('avatars/', 'covers/', 'posts/', 'crests/'):
            for page in paginator.paginate(Bucket=settings.media_s3_bucket, Prefix=prefix):
                for obj in page.get('Contents', []):
                    if obj['Key'] not in linked and obj['LastModified'] < threshold:
                        client.delete_object(Bucket=settings.media_s3_bucket, Key=obj['Key'])
                        removed += 1
    except (BotoCoreError, ClientError) as error:
        logger.error('Media reconciliation failed: %s', type(error).__name__)
        raise
    stale_metadata = db.scalars(select(MediaObject).where(
        MediaObject.created_at < threshold,
        ~MediaObject.id.in_(select(User.avatar_media_id).where(User.avatar_media_id.is_not(None))),
        ~MediaObject.id.in_(select(User.cover_media_id).where(User.cover_media_id.is_not(None))),
        ~MediaObject.id.in_(select(Post.media_id)),
        ~MediaObject.id.in_(select(Team.crest_media_id).where(Team.crest_media_id.is_not(None))),
    )).all()
    for media in stale_metadata:
        db.delete(media)
    db.commit()
    return removed


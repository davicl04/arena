from __future__ import annotations

import base64
import io
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from fastapi.responses import Response as BinaryResponse
from PIL import Image
from sqlalchemy import and_, func, or_, select, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import current_user
from app.models.identity import (
    AuthSession,
    ContentReport,
    Follow,
    MediaObject,
    ModerationAction,
    Post,
    PostComment,
    PostLike,
    User,
    UserBlock,
    utcnow,
)
from app.schemas.social import (
    CaptionInput,
    CommentInput,
    CommentOut,
    FollowOut,
    ModerationInput,
    ModerationResult,
    MutualFollowersOut,
    PostOut,
    PrivacyInput,
    ReportInput,
    ReportOut,
    SocialUserOut,
)
from app.services.media import normalize_post_image, remove_object, require_storage, storage_client

router = APIRouter(prefix='/api/v1')
PAGE_DEFAULT = 20
PAGE_MAX = 50
logger = logging.getLogger('arena.social')


def _cursor(value: str | None) -> tuple[datetime, int] | None:
    if not value:
        return None
    try:
        raw = base64.urlsafe_b64decode(value + '=' * (-len(value) % 4)).decode()
        stamp, item_id = raw.rsplit('|', 1)
        parsed = datetime.fromisoformat(stamp)
        return parsed, int(item_id)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(422, 'Cursor de paginação inválido.') from None


def _encode_cursor(stamp: datetime, item_id: int) -> str:
    raw = f'{stamp.isoformat()}|{item_id}'.encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')


def _blocked(db: Session, left: int, right: int) -> bool:
    return db.scalar(select(UserBlock.id).where(or_(
        and_(UserBlock.blocker_id == left, UserBlock.blocked_id == right),
        and_(UserBlock.blocker_id == right, UserBlock.blocked_id == left),
    )).limit(1)) is not None


def _can_discover(db: Session, viewer: User, owner: User | None) -> bool:
    return owner is not None and owner.active and not _blocked(db, viewer.id, owner.id)


def _can_view(db: Session, viewer: User, owner: User | None) -> bool:
    if not _can_discover(db, viewer, owner):
        return False
    if viewer.id == owner.id or owner.social_public:
        return True
    return db.scalar(select(Follow.id).where(
        Follow.follower_id == viewer.id, Follow.followed_id == owner.id, Follow.approved.is_(True)
    ).limit(1)) is not None


def _blocked_with(viewer_id: int, other_id_column):
    return select(UserBlock.id).where(or_(
        and_(UserBlock.blocker_id == viewer_id, UserBlock.blocked_id == other_id_column),
        and_(UserBlock.blocker_id == other_id_column, UserBlock.blocked_id == viewer_id))).exists()


def _image(media: MediaObject) -> BinaryResponse:
    result = require_storage(lambda: storage_client().get_object(Bucket=media.bucket, Key=media.object_key))
    try:
        content = result['Body'].read()
    finally:
        result['Body'].close()
    return BinaryResponse(content, media_type=media.content_type, headers={'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'})


def _social_user(db: Session, viewer: User, user: User) -> SocialUserOut:
    # Connection counts are public to authenticated members; content stays behind _can_view.
    allowed = _can_view(db, viewer, user)
    follower_count = db.scalar(select(func.count()).select_from(Follow).where(
        Follow.followed_id == user.id, Follow.approved.is_(True))) or 0
    following_count = db.scalar(select(func.count()).select_from(Follow).where(
        Follow.follower_id == user.id, Follow.approved.is_(True))) or 0
    post_count = db.scalar(select(func.count()).select_from(Post).where(Post.user_id == user.id)) or 0
    if viewer.id != user.id:
        relation = db.scalar(select(Follow.approved).where(
            Follow.follower_id == viewer.id, Follow.followed_id == user.id).limit(1))
        follow_state = 'approved' if relation is True else ('pending' if relation is False else 'none')
        follows_you = db.scalar(select(Follow.id).where(
            Follow.follower_id == user.id, Follow.followed_id == viewer.id, Follow.approved.is_(True)).limit(1)) is not None
    else:
        follow_state, follows_you = 'self', False
    return SocialUserOut(id=user.id, name=user.name, username=user.username,
        avatar_url=f'/api/v1/users/{user.id}/avatar?v={user.avatar_media_id}' if user.avatar_media_id else None,
        cover_url=f'/api/v1/users/{user.id}/cover?v={user.cover_media_id}' if user.cover_media_id else None,
        social_public=user.social_public,
        post_count=post_count if allowed else 0,
        follower_count=follower_count, following_count=following_count,
        follows_you=follows_you, follow_state=follow_state)


def _post(db: Session, viewer: User, post: Post) -> PostOut:
    author = db.get(User, post.user_id)
    media = db.get(MediaObject, post.media_id)
    if author is None or media is None:
        raise HTTPException(404, 'Publicação não encontrada.')
    likes = db.scalar(select(func.count()).select_from(PostLike).where(PostLike.post_id == post.id)) or 0
    comments = db.scalar(select(func.count()).select_from(PostComment).where(PostComment.post_id == post.id)) or 0
    liked = db.scalar(select(PostLike.id).where(PostLike.post_id == post.id, PostLike.user_id == viewer.id).limit(1)) is not None
    return PostOut(id=post.id, author=_social_user(db, viewer, author), caption=post.caption,
        image_url=f'/api/v1/posts/{post.id}/image?v={post.media_id}', created_at=post.created_at,
        like_count=likes, comment_count=comments, liked_by_me=liked, can_edit=viewer.id == author.id)


def _visible_post(db: Session, post_id: int, viewer: User) -> Post:
    post = db.get(Post, post_id)
    author = db.get(User, post.user_id) if post else None
    if post is None or author is None or not _can_view(db, viewer, author):
        raise HTTPException(404, 'Publicação não encontrada.')
    return post


def _page(statement, cursor: str | None, limit: int, stamp_field, id_field, db: Session):
    point = _cursor(cursor)
    if point:
        statement = statement.where(tuple_(stamp_field, id_field) < tuple_(*point))
    statement = statement.order_by(stamp_field.desc(), id_field.desc()).limit(limit + 1)
    rows = list(db.scalars(statement).all())
    more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = _encode_cursor(getattr(rows[-1], stamp_field.key), getattr(rows[-1], id_field.key)) if more and rows else None
    return rows, next_cursor


@router.get('/me/privacy')
def get_privacy(user: User = Depends(current_user)):
    return {'social_public': user.social_public}


@router.put('/me/privacy')
def put_privacy(data: PrivacyInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.social_public = data.social_public
    if data.social_public:
        db.query(Follow).filter(Follow.followed_id == user.id, Follow.approved.is_(False)).update(
            {'approved': True}, synchronize_session=False)
    db.commit()
    return {'social_public': user.social_public}


@router.get('/users')
def search_users(q: str = Query(min_length=1, max_length=100), cursor: str | None = None,
                 limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX), user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    term = q.strip().removeprefix('@').strip()
    if not term:
        raise HTTPException(422, 'Informe ao menos um caractere para buscar.')
    pattern = '%' + term.replace('!', '!!').replace('%', '!%').replace('_', '!_') + '%'
    statement = select(User).where(User.active.is_(True), User.id != user.id,
        or_(User.name.ilike(pattern, escape='!'), User.username.ilike(pattern, escape='!')),
        ~_blocked_with(user.id, User.id))
    rows, next_cursor = _page(statement, cursor, limit, User.created_at, User.id, db)
    return {'items': [_social_user(db, user, person) for person in rows], 'next_cursor': next_cursor}


@router.get('/users/{user_id}')
def get_social_profile(user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if target is None or not target.active or (user.id != target.id and _blocked(db, user.id, target.id)):
        raise HTTPException(404, 'Perfil não encontrado.')
    return _social_user(db, user, target)


@router.get('/users/{user_id}/posts')
def user_posts(user_id: int, cursor: str | None = None,
               limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX), user: User = Depends(current_user),
               db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if target is None or not _can_view(db, user, target):
        raise HTTPException(404, 'Perfil não encontrado.')
    statement = select(Post).where(Post.user_id == user_id)
    rows, next_cursor = _page(statement, cursor, limit, Post.created_at, Post.id, db)
    return {'items': [_post(db, user, item) for item in rows], 'next_cursor': next_cursor}


@router.get('/users/{user_id}/avatar')
def social_avatar(user_id: int, v: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    media = db.get(MediaObject, v)
    if target is None or media is None or target.avatar_media_id != v or not target.active or _blocked(db, user.id, target.id):
        raise HTTPException(404, 'Foto não encontrada.')
    return _image(media)


@router.get('/users/{user_id}/cover')
def social_cover(user_id: int, v: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    media = db.get(MediaObject, v)
    if target is None or media is None or target.cover_media_id != v or not target.active or _blocked(db, user.id, target.id):
        raise HTTPException(404, 'Foto de capa não encontrada.')
    return _image(media)


@router.get('/users/{user_id}/mutual-followers', response_model=MutualFollowersOut)
def mutual_followers(user_id: int, cursor: str | None = None, limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX),
                     user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Accounts the viewer follows that also follow the profile owner."""
    target = db.get(User, user_id)
    if target is None or not target.active or (user.id != target.id and _blocked(db, user.id, target.id)):
        raise HTTPException(404, 'Perfil não encontrado.')
    if user.id == target.id:
        return MutualFollowersOut(items=[], total=0, next_cursor=None)
    viewer_follows = select(Follow.followed_id).where(Follow.follower_id == user.id, Follow.approved.is_(True))
    statement = select(Follow).join(User, User.id == Follow.follower_id).where(
        Follow.followed_id == target.id, Follow.approved.is_(True), Follow.follower_id.in_(viewer_follows),
        User.active.is_(True), ~_blocked_with(user.id, User.id))
    total = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    rows, next_cursor = _page(statement, cursor, limit, Follow.created_at, Follow.id, db)
    return MutualFollowersOut(items=[_social_user(db, user, db.get(User, row.follower_id)) for row in rows],
                              total=total, next_cursor=next_cursor)


@router.get('/posts')
def feed(cursor: str | None = None, limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX),
         user: User = Depends(current_user), db: Session = Depends(get_db)):
    approved_following = select(Follow.followed_id).where(Follow.follower_id == user.id, Follow.approved.is_(True))
    statement = select(Post).join(User, User.id == Post.user_id).where(
        User.active.is_(True), or_(Post.user_id == user.id, User.social_public.is_(True), Post.user_id.in_(approved_following)),
        ~select(UserBlock.id).where(or_(and_(UserBlock.blocker_id == user.id, UserBlock.blocked_id == User.id),
        and_(UserBlock.blocker_id == User.id, UserBlock.blocked_id == user.id))).exists())
    rows, next_cursor = _page(statement, cursor, limit, Post.created_at, Post.id, db)
    return {'items': [_post(db, user, item) for item in rows], 'next_cursor': next_cursor}


@router.post('/posts', status_code=201)
async def create_post(file: UploadFile = File(...), caption: str = Form('', max_length=2200),
                      user: User = Depends(current_user), db: Session = Depends(get_db)):
    raw = await file.read(5 * 1024 * 1024 + 1)
    await file.close()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(413, 'A imagem excede o limite de 5 MiB.')
    optimized = normalize_post_image(raw)
    media_id = uuid.uuid4()
    key = f'posts/{media_id}.webp'
    bucket = get_settings().media_s3_bucket
    require_storage(lambda: storage_client().put_object(Bucket=bucket, Key=key, Body=optimized,
        ContentType='image/webp', CacheControl='private, no-store'))
    with Image.open(io.BytesIO(optimized)) as image:
        width, height = image.size
    media = MediaObject(id=media_id, user_id=user.id, bucket=bucket, object_key=key,
        content_type='image/webp', size_bytes=len(optimized), width=width, height=height)
    db.add(media)
    try:
        db.flush()
        post = Post(user_id=user.id, media_id=media_id, caption=caption.strip())
        db.add(post)
        db.commit()
    except Exception:
        db.rollback()
        try:
            require_storage(lambda: storage_client().delete_object(Bucket=bucket, Key=key))
        except HTTPException:
            logger.error('Uncommitted post image cleanup deferred')
        raise
    # A failed read after commit must never delete an already linked image.
    db.refresh(post)
    return _post(db, user, post)


@router.get('/posts/{post_id}')
def get_post(post_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _post(db, user, _visible_post(db, post_id, user))


@router.patch('/posts/{post_id}')
def edit_post(post_id: int, data: CaptionInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    post = _visible_post(db, post_id, user)
    if post.user_id != user.id:
        raise HTTPException(404, 'Publicação não encontrada.')
    post.caption = data.caption.strip()
    db.commit()
    return _post(db, user, post)


@router.delete('/posts/{post_id}', status_code=204)
def delete_post(post_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    post = db.get(Post, post_id)
    if post is None or post.user_id != user.id:
        raise HTTPException(404, 'Publicação não encontrada.')
    media = db.get(MediaObject, post.media_id)
    db.delete(post)
    db.commit()
    if media:
        try:
            require_storage(lambda: storage_client().delete_object(Bucket=media.bucket, Key=media.object_key))
            db.delete(media)
            db.commit()
        except Exception:
            db.rollback()
    return Response(status_code=204)


@router.get('/posts/{post_id}/image')
def post_image(post_id: int, v: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    post = _visible_post(db, post_id, user)
    media = db.get(MediaObject, post.media_id)
    if media is None or media.id != v:
        raise HTTPException(404, 'Imagem não encontrada.')
    result = require_storage(lambda: storage_client().get_object(Bucket=media.bucket, Key=media.object_key))
    try:
        content = result['Body'].read()
    finally:
        result['Body'].close()
    return BinaryResponse(content, media_type=media.content_type, headers={'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'})


@router.put('/posts/{post_id}/like', status_code=204)
def like_post(post_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _visible_post(db, post_id, user)
    db.execute(insert(PostLike).values(post_id=post_id, user_id=user.id, created_at=utcnow()).on_conflict_do_nothing(constraint='uq_post_like_user'))
    db.commit()
    return Response(status_code=204)


@router.delete('/posts/{post_id}/like', status_code=204)
def unlike_post(post_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _visible_post(db, post_id, user)
    db.query(PostLike).filter(PostLike.post_id == post_id, PostLike.user_id == user.id).delete()
    db.commit()
    return Response(status_code=204)


@router.get('/posts/{post_id}/comments')
def list_comments(post_id: int, cursor: str | None = None,
                  limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX), user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    _visible_post(db, post_id, user)
    blocked_ids = select(UserBlock.blocked_id).where(UserBlock.blocker_id == user.id).union(
        select(UserBlock.blocker_id).where(UserBlock.blocked_id == user.id))
    statement = select(PostComment).where(PostComment.post_id == post_id, PostComment.user_id.not_in(blocked_ids))
    rows, next_cursor = _page(statement, cursor, limit, PostComment.created_at, PostComment.id, db)
    items = []
    for comment in rows:
        author = db.get(User, comment.user_id)
        if author and author.active:
            items.append(CommentOut(id=comment.id, author_id=author.id, author_name=author.name,
                author_avatar_url=f'/api/v1/comments/{comment.id}/avatar?v={author.avatar_media_id}' if author.avatar_media_id else None,
                body=comment.body, created_at=comment.created_at, can_delete=user.id in {author.id, _visible_post(db, post_id, user).user_id}))
    return {'items': items, 'next_cursor': next_cursor}


@router.post('/posts/{post_id}/comments', status_code=201)
def create_comment(post_id: int, data: CommentInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    post = _visible_post(db, post_id, user)
    comment = PostComment(post_id=post.id, user_id=user.id, body=data.body.strip())
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return CommentOut(id=comment.id, author_id=user.id, author_name=user.name,
        author_avatar_url=f'/api/v1/comments/{comment.id}/avatar?v={user.avatar_media_id}' if user.avatar_media_id else None,
        body=comment.body, created_at=comment.created_at, can_delete=True)


@router.get('/comments/{comment_id}/avatar')
def comment_avatar(comment_id: int, v: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    comment = db.get(PostComment, comment_id)
    post = db.get(Post, comment.post_id) if comment else None
    author = db.get(User, comment.user_id) if comment else None
    media = db.get(MediaObject, v)
    if (comment is None or post is None or author is None or media is None or
            author.avatar_media_id != v or not _can_discover(db, user, author) or
            not _can_view(db, user, db.get(User, post.user_id))):
        raise HTTPException(404, 'Foto não encontrada.')
    result = require_storage(lambda: storage_client().get_object(Bucket=media.bucket, Key=media.object_key))
    try:
        content = result['Body'].read()
    finally:
        result['Body'].close()
    return BinaryResponse(content, media_type=media.content_type, headers={'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'})


@router.delete('/comments/{comment_id}', status_code=204)
def delete_comment(comment_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    comment = db.get(PostComment, comment_id)
    post = db.get(Post, comment.post_id) if comment else None
    if comment is None or post is None or user.id not in {comment.user_id, post.user_id} or not _can_view(db, user, db.get(User, post.user_id)):
        raise HTTPException(404, 'Comentário não encontrado.')
    db.delete(comment)
    db.commit()
    return Response(status_code=204)


@router.put('/users/{user_id}/follow')
def follow_user(user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if target is None or not target.active or user.id == target.id or _blocked(db, user.id, target.id):
        raise HTTPException(404, 'Perfil não encontrado.')
    db.execute(insert(Follow).values(follower_id=user.id, followed_id=target.id,
        approved=target.social_public, created_at=utcnow()).on_conflict_do_nothing(constraint='uq_follow_pair'))
    db.commit()
    relation = db.scalar(select(Follow).where(Follow.follower_id == user.id, Follow.followed_id == target.id))
    return {'state': 'approved' if relation.approved else 'pending'}


@router.delete('/users/{user_id}/follow', status_code=204)
def unfollow_user(user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(Follow).filter(Follow.follower_id == user.id, Follow.followed_id == user_id).delete()
    db.commit()
    return Response(status_code=204)


@router.get('/me/follow-requests')
def follow_requests(cursor: str | None = None, limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX),
                    user: User = Depends(current_user), db: Session = Depends(get_db)):
    statement = select(Follow).where(Follow.followed_id == user.id, Follow.approved.is_(False))
    rows, next_cursor = _page(statement, cursor, limit, Follow.created_at, Follow.id, db)
    items = []
    for follow in rows:
        requester = db.get(User, follow.follower_id)
        if requester and requester.active and not _blocked(db, user.id, requester.id):
            items.append(FollowOut(user=_social_user(db, user, requester), state='pending'))
    return {'items': items, 'next_cursor': next_cursor}


@router.put('/me/follow-requests/{follower_id}')
def resolve_follow_request(follower_id: int, approve: bool = Query(...),
                           user: User = Depends(current_user), db: Session = Depends(get_db)):
    requester = db.get(User, follower_id)
    if not _can_discover(db, user, requester):
        raise HTTPException(404, 'Solicitação não encontrada.')
    relation = db.scalar(select(Follow).where(Follow.follower_id == follower_id, Follow.followed_id == user.id))
    if relation is None:
        if not approve:
            return {'state': 'rejected'}
        raise HTTPException(404, 'Solicitação não encontrada.')
    if approve:
        relation.approved = True
        db.commit()
        return {'state': 'approved'}
    if relation.approved:
        raise HTTPException(404, 'Solicitação pendente não encontrada.')
    db.delete(relation)
    db.commit()
    return {'state': 'rejected'}


@router.get('/users/{user_id}/followers')
def followers(user_id: int, cursor: str | None = None, limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX),
              user: User = Depends(current_user), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if target is None or not _can_view(db, user, target):
        raise HTTPException(404, 'Perfil não encontrado.')
    statement = select(Follow).where(Follow.followed_id == user_id, Follow.approved.is_(True))
    rows, next_cursor = _page(statement, cursor, limit, Follow.created_at, Follow.id, db)
    return {'items': [FollowOut(user=_social_user(db, user, person), state='approved')
        for row in rows if (person := db.get(User, row.follower_id)) and person.active and not _blocked(db, user.id, person.id)], 'next_cursor': next_cursor}


@router.get('/users/{user_id}/following')
def following(user_id: int, cursor: str | None = None, limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX),
              user: User = Depends(current_user), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if target is None or not _can_view(db, user, target):
        raise HTTPException(404, 'Perfil não encontrado.')
    statement = select(Follow).where(Follow.follower_id == user_id, Follow.approved.is_(True))
    rows, next_cursor = _page(statement, cursor, limit, Follow.created_at, Follow.id, db)
    items = [FollowOut(user=_social_user(db, user, person), state='approved')
        for row in rows if (person := db.get(User, row.followed_id)) and person.active and not _blocked(db, user.id, person.id)]
    return {'items': items, 'next_cursor': next_cursor}


@router.delete('/me/followers/{follower_id}', status_code=204)
def remove_follower(follower_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(Follow).filter(Follow.follower_id == follower_id, Follow.followed_id == user.id).delete()
    db.commit()
    return Response(status_code=204)


@router.get('/me/blocks')
def list_blocks(cursor: str | None = None, limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX),
                user: User = Depends(current_user), db: Session = Depends(get_db)):
    statement = select(UserBlock).where(UserBlock.blocker_id == user.id)
    rows, next_cursor = _page(statement, cursor, limit, UserBlock.created_at, UserBlock.id, db)
    return {'items': [_social_user(db, user, target) for row in rows
                     if (target := db.get(User, row.blocked_id))], 'next_cursor': next_cursor}


@router.put('/users/{user_id}/block', status_code=204)
def block_user(user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.id == user_id or db.get(User, user_id) is None:
        raise HTTPException(404, 'Perfil não encontrado.')
    db.execute(insert(UserBlock).values(blocker_id=user.id, blocked_id=user_id, created_at=utcnow()).on_conflict_do_nothing(constraint='uq_user_block_pair'))
    db.query(Follow).filter(or_(and_(Follow.follower_id == user.id, Follow.followed_id == user_id),
        and_(Follow.follower_id == user_id, Follow.followed_id == user.id))).delete(synchronize_session=False)
    db.commit()
    return Response(status_code=204)


@router.delete('/users/{user_id}/block', status_code=204)
def unblock_user(user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(UserBlock).filter(UserBlock.blocker_id == user.id, UserBlock.blocked_id == user_id).delete()
    db.commit()
    return Response(status_code=204)


@router.post('/reports', status_code=201)
def report_content(data: ReportInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    exists = {'user': lambda: db.get(User, data.target_id),
              'post': lambda: db.get(Post, data.target_id),
              'comment': lambda: db.get(PostComment, data.target_id)}[data.target_type]()
    if exists is None:
        raise HTTPException(404, 'Conteúdo não encontrado.')
    target_user = exists if data.target_type == 'user' else (
        db.get(User, exists.user_id) if data.target_type == 'post' else
        db.get(User, (db.get(Post, exists.post_id).user_id if db.get(Post, exists.post_id) else -1)))
    allowed = _can_discover(db, user, target_user) if data.target_type == 'user' else _can_view(db, user, target_user)
    if data.target_type == 'comment':
        allowed = allowed and _can_discover(db, user, db.get(User, exists.user_id))
    if not allowed:
        raise HTTPException(404, 'Conteúdo não encontrado.')
    report = ContentReport(reporter_id=user.id, target_type=data.target_type, target_id=data.target_id,
        reason=data.reason.value, description=data.description.strip() if data.description else None)
    db.add(report)
    db.commit()
    db.refresh(report)
    return {'id': report.id, 'status': report.status}


def _admin(user: User):
    if not user.is_admin:
        raise HTTPException(403, 'Acesso administrativo necessário.')


@router.get('/admin/reports')
def admin_reports(cursor: str | None = None, limit: int = Query(PAGE_DEFAULT, ge=1, le=PAGE_MAX),
                  status: str = Query('pending', pattern='^(pending|resolved)$'), user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    _admin(user)
    statement = select(ContentReport).where(ContentReport.status == status)
    rows, next_cursor = _page(statement, cursor, limit, ContentReport.created_at, ContentReport.id, db)
    items = []
    for report in rows:
        target = db.get({'user': User, 'post': Post, 'comment': PostComment}[report.target_type], report.target_id)
        target_user = target if isinstance(target, User) else db.get(User, target.user_id) if target else None
        preview = None
        is_private_target = False
        if isinstance(target, User):
            is_private_target = not target.social_public
            preview = {'name': target.name, 'social_public': target.social_public}
        elif isinstance(target, Post):
            author = db.get(User, target.user_id)
            is_private_target = author is None or not author.social_public
            preview = {'caption': target.caption, 'author': author.name if author else 'Conta indisponível',
                       'image_url': f'/api/v1/admin/reports/{report.id}/image' if target.media_id else None}
        elif isinstance(target, PostComment):
            author = db.get(User, target.user_id)
            post = db.get(Post, target.post_id)
            post_owner = db.get(User, post.user_id) if post else None
            is_private_target = post_owner is None or not post_owner.social_public
            preview = {'body': target.body, 'author': author.name if author else 'Conta indisponível'}
        if status != 'pending' and is_private_target:
            preview = None
        items.append(ReportOut(id=report.id, target_type=report.target_type, target_id=report.target_id,
            reason=report.reason, description=report.description, status=report.status,
            created_at=report.created_at, target_preview=preview,
            target_user_id=target_user.id if target_user else None,
            target_user_active=target_user.active if target_user else None))
    return {'items': items, 'next_cursor': next_cursor}


@router.get('/admin/reports/{report_id}/image')
def admin_report_image(report_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _admin(user)
    report = db.get(ContentReport, report_id)
    post = db.get(Post, report.target_id) if report and report.status == 'pending' and report.target_type == 'post' else None
    media = db.get(MediaObject, post.media_id) if post else None
    if media is None:
        raise HTTPException(404, 'Imagem indisponível.')
    result = require_storage(lambda: storage_client().get_object(Bucket=media.bucket, Key=media.object_key))
    try:
        content = result['Body'].read()
    finally:
        result['Body'].close()
    return BinaryResponse(content, media_type=media.content_type, headers={'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'})


@router.post('/admin/reports/{report_id}/decision')
def moderate(report_id: int, data: ModerationInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _admin(user)
    report = db.get(ContentReport, report_id)
    if report is None or report.status != 'pending':
        raise HTTPException(404, 'Denúncia pendente não encontrada.')
    action = data.action
    if action == 'remove':
        if report.target_type == 'post':
            post = db.get(Post, report.target_id)
            if post:
                media = db.get(MediaObject, post.media_id)
                db.delete(post)
                db.flush()
        elif report.target_type == 'comment':
            comment = db.get(PostComment, report.target_id)
            if comment:
                db.delete(comment)
        else:
            raise HTTPException(422, 'Remoção de conta exige suspensão.')
    elif action in {'suspend', 'reactivate'}:
        target_id = report.target_id if report.target_type == 'user' else None
        if report.target_type == 'post':
            item = db.get(Post, report.target_id)
            target_id = item.user_id if item else None
        elif report.target_type == 'comment':
            item = db.get(PostComment, report.target_id)
            target_id = item.user_id if item else None
        target = db.get(User, target_id) if target_id else None
        if target is None:
            raise HTTPException(404, 'Conta alvo não encontrada.')
        target.active = action == 'reactivate'
        if action == 'suspend':
            db.query(AuthSession).filter(AuthSession.user_id == target.id).delete(synchronize_session=False)
    report.status = 'resolved'
    db.add(ModerationAction(admin_id=user.id, report_id=report.id, target_type=report.target_type,
        target_id=report.target_id, action=action, justification=data.justification.strip()))
    db.commit()
    if action == 'remove' and report.target_type == 'post' and 'media' in locals() and media:
        try:
            remove_object(media)
            db.delete(media)
            db.commit()
        except Exception:
            db.rollback()
    return ModerationResult(report_id=report.id, status=report.status, action=action)


@router.put('/admin/users/{user_id}/status')
def admin_user_status(user_id: int, active: bool = Query(...), justification: str = Query(min_length=5, max_length=1000),
                      user: User = Depends(current_user), db: Session = Depends(get_db)):
    _admin(user)
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(404, 'Conta não encontrada.')
    target.active = active
    if not active:
        db.query(AuthSession).filter(AuthSession.user_id == target.id).delete(synchronize_session=False)
    reason = justification.strip()
    if len(reason) < 5:
        raise HTTPException(422, 'Informe uma justificativa de pelo menos 5 caracteres.')
    db.add(ModerationAction(admin_id=user.id, target_type='user', target_id=target.id,
        action='suspend' if not active else 'reactivate', justification=reason))
    db.commit()
    return {'active': target.active}

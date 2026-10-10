import asyncio
import io
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException, UploadFile
from PIL import Image
from sqlalchemy.exc import SQLAlchemyError

from app.models.identity import ContentReport, Follow, MediaObject, Post, PostComment, User, utcnow
from app.routers import social
from app.schemas.social import ReportInput


def person(user_id=1, **values):
    return User(id=user_id, name='Atleta', username='atleta', active=True, social_public=False, is_admin=False,
                avatar_media_id=None, cover_media_id=None, **values)


@pytest.mark.parametrize(('active', 'blocked', 'public', 'self_view', 'following', 'expected'), [
    (False, False, True, False, True, False),
    (True, True, True, False, True, False),
    (True, False, True, False, False, True),
    (True, False, False, True, False, True),
    (True, False, False, False, True, True),
    (True, False, False, False, False, False),
])
def test_visibility_rechecks_account_block_and_relationship(monkeypatch, active, blocked, public, self_view, following, expected):
    viewer, owner = person(), person(1 if self_view else 2)
    owner.active, owner.social_public = active, public
    db = Mock()
    db.scalar.return_value = 5 if following else None
    monkeypatch.setattr(social, '_blocked', lambda *_: blocked)
    assert social._can_view(db, viewer, owner) is expected
    assert social._can_view(db, viewer, None) is False


def test_block_checks_relationship_in_both_directions():
    db = Mock()
    db.scalar.return_value = 4
    assert social._blocked(db, 1, 2)
    db.scalar.return_value = None
    assert not social._blocked(db, 2, 1)


def test_cursor_round_trip_and_invalid_input():
    stamp = utcnow()
    assert social._cursor(social._encode_cursor(stamp, 21)) == (stamp, 21)
    assert social._cursor(None) is None
    for invalid in ('!', 'bm90LWEtZGF0ZQ', social._encode_cursor(stamp, 'invalid')):
        with pytest.raises(HTTPException) as error:
            social._cursor(invalid)
        assert error.value.status_code == 422


@pytest.mark.parametrize('has_more', [True, False])
def test_page_returns_cursor_only_when_more_items_exist(has_more):
    from sqlalchemy import select
    stamp = utcnow()
    rows = [Post(id=3, created_at=stamp), Post(id=2, created_at=stamp)]
    db = Mock()
    db.scalars.return_value.all.return_value = rows if has_more else rows[:1]
    items, cursor = social._page(select(Post), social._encode_cursor(stamp, 4), 1, Post.created_at, Post.id, db)
    assert [item.id for item in items] == [3]
    assert (social._cursor(cursor) == (stamp, 3)) if has_more else cursor is None


@pytest.mark.parametrize('allowed', [False, True])
def test_social_profile_keeps_counts_visible_and_hides_private_post_count(monkeypatch, allowed):
    viewer, owner = person(), person(2)
    owner.cover_media_id = uuid4()
    db = Mock()
    db.scalar.side_effect = [9, 7, 3, False, None]
    monkeypatch.setattr(social, '_can_view', lambda *_: allowed)
    result = social._social_user(db, viewer, owner)
    assert (result.follower_count, result.following_count) == (9, 7)
    assert result.post_count == (3 if allowed else 0)
    assert result.follow_state == 'pending'
    assert result.username == 'atleta' and str(owner.cover_media_id) in result.cover_url
    assert result.cover_url.startswith('/api/v1/users/2/cover?v=')
    assert 'email' not in result.model_dump()


def test_own_social_profile_and_post_counts(monkeypatch):
    viewer = person()
    viewer.avatar_media_id = uuid4()
    db = Mock()
    db.scalar.side_effect = [9, 7, 3]
    monkeypatch.setattr(social, '_can_view', lambda *_: True)
    result = social._social_user(db, viewer, viewer)
    assert result.follow_state == 'self'
    assert str(viewer.avatar_media_id) in result.avatar_url
    media = MediaObject(id=uuid4())
    post = Post(id=9, user_id=viewer.id, media_id=media.id, caption='Treino', created_at=utcnow())
    db.get.side_effect = [viewer, media]
    db.scalar.side_effect = [4, 2, 10]
    monkeypatch.setattr(social, '_social_user', lambda *_: result)
    output = social._post(db, viewer, post)
    assert output.like_count == 4 and output.comment_count == 2 and output.liked_by_me
    assert output.can_edit and str(media.id) in output.image_url


@pytest.mark.parametrize('missing', ['post', 'author', 'permission'])
def test_post_detail_denies_unavailable_content(monkeypatch, missing):
    db = Mock()
    post = None if missing == 'post' else Post(user_id=2)
    db.get.side_effect = [post] if post is None else [post, None if missing == 'author' else person(2)]
    monkeypatch.setattr(social, '_can_view', lambda *_: missing != 'permission')
    with pytest.raises(HTTPException) as error:
        social._visible_post(db, 2, person())
    assert error.value.status_code == 404


@pytest.mark.parametrize(('approve', 'approved', 'exists', 'expected'), [
    (True, False, True, 'approved'), (True, True, True, 'approved'),
    (False, False, True, 'rejected'), (False, False, False, 'rejected'),
    (False, True, True, 404), (True, False, False, 404),
])
def test_follow_resolution_retries_preserve_approved_connections(monkeypatch, approve, approved, exists, expected):
    db = Mock()
    db.get.return_value = person(2)
    relation = Follow(approved=approved) if exists else None
    db.scalar.return_value = relation
    monkeypatch.setattr(social, '_can_discover', lambda *_: True)
    if expected == 404:
        with pytest.raises(HTTPException) as error:
            social.resolve_follow_request(2, approve, person(), db)
        assert error.value.status_code == 404
        db.delete.assert_not_called()
    else:
        assert social.resolve_follow_request(2, approve, person(), db)['state'] == expected
        if approve:
            assert relation.approved


@pytest.mark.parametrize(('kind', 'public', 'allowed'), [('user', False, True), ('post', False, False), ('comment', False, False)])
def test_reporting_profile_does_not_grant_access_to_private_content(monkeypatch, kind, public, allowed):
    db = Mock()
    owner = person(2)
    owner.social_public = public
    target = owner if kind == 'user' else Post(id=4, user_id=2) if kind == 'post' else PostComment(id=4, user_id=2, post_id=4)
    db.get.side_effect = lambda model, _: target if model in (PostComment,) or (model == Post and kind == 'post') else owner if model == User else Post(user_id=2)
    def save(report):
        report.id, report.status = 1, 'pending'
    db.add.side_effect = save
    monkeypatch.setattr(social, '_can_view', lambda *_: public)
    monkeypatch.setattr(social, '_can_discover', lambda *_: True)
    data = ReportInput(target_type=kind, target_id=4, reason='assedio')
    if allowed:
        assert social.report_content(data, person(), db) == {'id': 1, 'status': 'pending'}
        db.commit.assert_called_once()
    else:
        with pytest.raises(HTTPException) as error:
            social.report_content(data, person(), db)
        assert error.value.status_code == 404
        db.add.assert_not_called()


@pytest.mark.parametrize(('status', 'private', 'preview'), [('pending', True, True), ('resolved', True, False), ('resolved', False, True)])
@pytest.mark.parametrize('kind', ['user', 'post', 'comment'])
def test_admin_queue_redacts_resolved_private_content_but_retains_account_status(monkeypatch, status, private, preview, kind):
    db = Mock()
    owner = person(2)
    owner.social_public, owner.active = not private, False
    target = owner if kind == 'user' else Post(user_id=2, media_id=uuid4(), caption='Privado') if kind == 'post' else PostComment(user_id=2, post_id=4, body='Privado')
    db.get.side_effect = lambda model, _: owner if model == User else target if model != Post or kind == 'post' else Post(user_id=2)
    report = ContentReport(id=3, target_id=4, target_type=kind, reason='spam', status=status, created_at=utcnow())
    monkeypatch.setattr(social, '_page', lambda *_: ([report], None))
    admin = person()
    admin.is_admin = True
    result = social.admin_reports(None, 20, status, admin, db)['items'][0]
    assert (result.target_preview is not None) is preview
    assert result.target_user_id == 2 and result.target_user_active is False


def test_admin_requires_role_and_valid_justification():
    with pytest.raises(HTTPException) as error:
        social._admin(person())
    assert error.value.status_code == 403
    admin, db = person(), Mock()
    admin.is_admin = True
    db.get.return_value = person(2)
    with pytest.raises(HTTPException) as error:
        social.admin_user_status(2, True, '     ', admin, db)
    assert error.value.status_code == 422
    db.commit.assert_not_called()


@pytest.mark.parametrize('active', [False, True])
def test_account_status_logs_decision_and_revokes_only_on_suspension(active):
    db, admin, target = Mock(), person(), person(2)
    admin.is_admin = True
    db.get.return_value = target
    result = social.admin_user_status(2, active, 'Conta revisada', admin, db)
    assert result['active'] is active
    action = db.add.call_args.args[0]
    assert action.admin_id == admin.id and action.target_id == target.id
    assert action.action == ('reactivate' if active else 'suspend')
    assert db.query.called is not active


@pytest.mark.parametrize('failure', ['commit', 'refresh'])
def test_post_compensation_only_before_commit(monkeypatch, failure):
    stream = io.BytesIO()
    Image.new('RGB', (20, 20)).save(stream, format='PNG')
    db, storage = Mock(), Mock()
    monkeypatch.setattr(social, 'storage_client', lambda: storage)
    if failure == 'commit':
        db.commit.side_effect = SQLAlchemyError('injected commit failure')
    else:
        db.refresh.side_effect = SQLAlchemyError('injected read failure')
    with pytest.raises(SQLAlchemyError):
        asyncio.run(social.create_post(UploadFile(file=io.BytesIO(stream.getvalue())), '', person(), db))
    assert storage.delete_object.called is (failure == 'commit')
    assert db.rollback.called is (failure == 'commit')
    assert storage.put_object.called


@pytest.mark.parametrize('state', ['blocked', 'suspended', 'wrong-version', 'private-post'])
def test_comment_avatar_denies_every_revoked_access(monkeypatch, state):
    db = Mock()
    media_id = uuid4()
    author = person(2)
    author.avatar_media_id = media_id if state != 'wrong-version' else uuid4()
    author.active = state != 'suspended'
    db.get.side_effect = [PostComment(post_id=4, user_id=2), Post(user_id=3), author, MediaObject(id=media_id), person(3)]
    monkeypatch.setattr(social, '_blocked', lambda *_: state == 'blocked')
    monkeypatch.setattr(social, '_can_view', lambda *_: state != 'private-post')
    monkeypatch.setattr(social, 'storage_client', Mock())
    with pytest.raises(HTTPException) as error:
        social.comment_avatar(5, media_id, person(), db)
    assert error.value.status_code == 404
    social.storage_client.assert_not_called()

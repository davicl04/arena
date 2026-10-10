import pytest
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.models.identity import Post, User, UserBlock, utcnow
from app.routers import identity as identity_router
from app.routers import social as social_router
from app.services import media as media_service
from tests.integration.test_social_flow import FakeStorage, create_post, register, square_png


@pytest.fixture
def storage(monkeypatch):
    value = FakeStorage()
    for module in (social_router, identity_router, media_service):
        monkeypatch.setattr(module, 'storage_client', lambda: value)
    return value


def test_incoming_block_excludes_public_post(client, storage):
    http, _ = client
    owner = register(http, 'review-owner@example.com')
    viewer = register(http, 'review-viewer@example.com')
    viewer_id = http.get('/api/v1/me', headers=viewer).json()['id']
    http.put('/api/v1/me/privacy', headers=owner, json={'social_public': True})
    post = create_post(http, owner).json()
    assert http.put(f'/api/v1/users/{viewer_id}/block', headers=owner).status_code == 204
    assert http.get(f"/api/v1/posts/{post['id']}", headers=viewer).status_code == 404
    assert http.get('/api/v1/posts', headers=viewer).json()['items'] == [], 'feed leaks incoming-blocked author'


def test_comment_avatar_revoked_after_block(client, storage):
    http, _ = client
    owner = register(http, 'review-third@example.com')
    commenter = register(http, 'review-commenter@example.com')
    viewer = register(http, 'review-reader@example.com')
    viewer_id = http.get('/api/v1/me', headers=viewer).json()['id']
    http.put('/api/v1/me/privacy', headers=owner, json={'social_public': True})
    http.put('/api/v1/me/avatar', headers=commenter, files={'file': ('avatar.png', square_png(), 'image/png')})
    post = create_post(http, owner).json()
    comment = http.post(f"/api/v1/posts/{post['id']}/comments", headers=commenter, json={'body': 'Olá'}).json()
    url = comment['author_avatar_url']
    assert http.get(url, headers=viewer).status_code == 200
    http.put(f'/api/v1/users/{viewer_id}/block', headers=commenter)
    assert http.get(f"/api/v1/posts/{post['id']}/comments", headers=viewer).json()['items'] == []
    assert http.get(url, headers=viewer).status_code == 404, 'cached comment avatar URL bypasses block'


def test_report_private_account_without_following(client, storage):
    http, _ = client
    target = register(http, 'review-private@example.com')
    reporter = register(http, 'review-reporter@example.com')
    target_id = http.get('/api/v1/me', headers=target).json()['id']
    assert http.get(f'/api/v1/users/{target_id}', headers=reporter).status_code == 200
    response = http.post('/api/v1/reports', headers=reporter, json={'target_type': 'user', 'target_id': target_id, 'reason': 'assedio'})
    assert response.status_code == 201, response.text


def test_repeat_follow_approval(client, storage):
    http, _ = client
    owner = register(http, 'review-approval-owner@example.com')
    follower = register(http, 'review-approval-follower@example.com')
    owner_id = http.get('/api/v1/me', headers=owner).json()['id']
    follower_id = http.get('/api/v1/me', headers=follower).json()['id']
    http.put(f'/api/v1/users/{owner_id}/follow', headers=follower)
    path = f'/api/v1/me/follow-requests/{follower_id}?approve=true'
    assert http.put(path, headers=owner).status_code == 200
    assert http.put(path, headers=owner).status_code == 200


def test_post_refresh_failure_keeps_committed_image(client, storage, monkeypatch):
    http, db = client
    owner = register(http, 'review-commit@example.com')
    actual_refresh = db.refresh
    def fail_post_refresh(item, *args, **kwargs):
        if isinstance(item, Post):
            raise SQLAlchemyError('injected read failure after commit')
        return actual_refresh(item, *args, **kwargs)
    with monkeypatch.context() as patch:
        patch.setattr(db, 'refresh', fail_post_refresh)
        response = create_post(http, owner)
    assert response.status_code == 503
    assert db.scalar(select(Post)) is not None, 'post committed'
    assert any(key.startswith('posts/') for _, key in storage.objects), 'post persisted but its S3 image was deleted'


def test_blocks_can_be_paginated_past_fifty_and_limit_is_validated(client):
    http, db = client
    headers = register(http, 'review-many-blocks@example.com')
    owner_id = http.get('/api/v1/me', headers=headers).json()['id']
    owner = db.get(User, owner_id)
    stamp = utcnow()
    for number in range(51):
        other = User(name=f'Conta {number}', email=f'blocked-{number}@example.com',
                     birth_date=owner.birth_date, password_hash=owner.password_hash)
        db.add(other)
        db.flush()
        db.add(UserBlock(blocker_id=owner.id, blocked_id=other.id, created_at=stamp))
    db.commit()
    first = http.get('/api/v1/me/blocks?limit=50', headers=headers).json()
    assert len(first['items']) == 50 and first['next_cursor']
    second = http.get(f"/api/v1/me/blocks?limit=50&cursor={first['next_cursor']}", headers=headers).json()
    assert len(second['items']) == 1 and second['next_cursor'] is None
    assert not {item['id'] for item in first['items']} & {item['id'] for item in second['items']}
    assert http.get('/api/v1/me/blocks?limit=51', headers=headers).status_code == 422


def test_resolved_private_report_retains_reactivation_reference_and_audit(client):
    from app.models.identity import ModerationAction
    http, db = client
    owner = register(http, 'review-suspended-private@example.com')
    reporter = register(http, 'review-reactivation-admin@example.com')
    owner_id = http.get('/api/v1/me', headers=owner).json()['id']
    admin_id = http.get('/api/v1/me', headers=reporter).json()['id']
    db.get(User, admin_id).is_admin = True
    db.commit()
    report = http.post('/api/v1/reports', headers=reporter,
        json={'target_type': 'user', 'target_id': owner_id, 'reason': 'spam'}).json()
    result = http.post(f"/api/v1/admin/reports/{report['id']}/decision", headers=reporter,
        json={'action': 'suspend', 'justification': 'Análise de abuso'} )
    assert result.status_code == 200
    queue = http.get('/api/v1/admin/reports?status=resolved', headers=reporter).json()['items']
    assert queue[0]['target_preview'] is None
    assert queue[0]['target_user_id'] == owner_id and queue[0]['target_user_active'] is False
    response = http.put(f'/api/v1/admin/users/{owner_id}/status?active=true&justification=Conta%20revisada', headers=reporter, json={})
    assert response.status_code == 200
    assert db.get(User, owner_id).active is True
    assert http.get('/api/v1/me', headers=owner).status_code == 401
    actions = db.scalars(select(ModerationAction).where(ModerationAction.admin_id == admin_id)).all()
    assert [action.action for action in actions] == ['suspend', 'reactivate']

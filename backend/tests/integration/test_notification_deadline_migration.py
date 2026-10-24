from datetime import timedelta
from pathlib import Path

from alembic import command
from alembic.config import Config

from app.models.identity import utcnow
from app.models.notifications import Notification
from tests.integration.match_helpers import make_user


def test_0014_repairs_only_unresolved_organizer_decisions(client):
    _, db = client
    owner = make_user(db, 'migration-review')
    now = utcnow()
    values = {'user_id': owner.id, 'payload': {}, 'created_at': now, 'action_until': now - timedelta(hours=1)}
    pending = Notification(**values, type='divergencia_para_decidir', action_key='decision:1')
    resolved = Notification(**values, type='divergencia_para_decidir', action_key='decision:2', resolved_at=now)
    legacy = Notification(**values, type='divergencia_para_decidir')
    athlete = Notification(**values, type='resultado_divergente', action_key='result:1')
    db.add_all([pending, resolved, legacy, athlete])
    db.flush()
    config = Config(str(Path(__file__).resolve().parents[2] / 'alembic.ini'))
    config.set_main_option('script_location', str(Path(__file__).resolve().parents[2] / 'migrations'))
    config.attributes['connection'] = db.connection()
    command.downgrade(config, '0013')
    command.upgrade(config, 'head')
    for item in (pending, resolved, legacy, athlete):
        db.refresh(item)
    assert pending.action_until is None
    assert all(item.action_until == values['action_until'] for item in (resolved, legacy, athlete))

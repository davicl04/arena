"""Unique public username and optional profile cover image."""
import re
import unicodedata

import sqlalchemy as sa
from alembic import op

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None

# Frozen copy of the rules in app.services.identity: migrations must not change when the app does.
RESERVED = {
    'admin', 'administrador', 'suporte', 'support', 'arena', 'api', 'me', 'root', 'sistema',
    'moderacao', 'moderador', 'ajuda', 'help', 'null', 'undefined', 'settings', 'configuracoes',
}


def _slug(name: str) -> str:
    text = ''.join(c for c in unicodedata.normalize('NFD', name or '') if unicodedata.category(c) != 'Mn')
    text = re.sub(r'\s+', '.', text.strip().lower())
    text = re.sub(r'[^a-z0-9._]', '', text)
    text = re.sub(r'\.{2,}', '.', text).strip('.')[:30].strip('.')
    if not text:
        return 'atleta'
    return text if len(text) >= 3 else f'{text}.atleta'


def _candidates(base: str):
    yield base
    number = 1
    while True:
        suffix = str(number)
        yield base[:30 - len(suffix)].rstrip('.') + suffix
        number += 1


def upgrade():
    op.add_column('users', sa.Column('username', sa.String(30), nullable=True))
    connection = op.get_bind()
    users = sa.table('users', sa.column('id', sa.Integer()), sa.column('name', sa.String()),
                     sa.column('username', sa.String()))
    taken = set(RESERVED)
    for user_id, name in connection.execute(sa.select(users.c.id, users.c.name).order_by(users.c.id)).all():
        username = next(candidate for candidate in _candidates(_slug(name)) if candidate not in taken)
        taken.add(username)
        connection.execute(users.update().where(users.c.id == user_id).values(username=username))
    op.alter_column('users', 'username', existing_type=sa.String(30), nullable=False)
    op.create_unique_constraint('uq_users_username', 'users', ['username'])

    op.add_column('users', sa.Column('cover_media_id', sa.Uuid(), nullable=True))
    op.create_foreign_key('fk_users_cover_media_id_media_objects', 'users', 'media_objects',
                          ['cover_media_id'], ['id'], ondelete='SET NULL')


def downgrade():
    op.drop_constraint('fk_users_cover_media_id_media_objects', 'users', type_='foreignkey')
    op.drop_column('users', 'cover_media_id')
    op.drop_constraint('uq_users_username', 'users', type_='unique')
    op.drop_column('users', 'username')

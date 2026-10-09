from alembic import context

from app.core.database import Base, engine
from app.models import identity  # noqa: F401

if context.is_offline_mode():
    from app.core.config import get_settings
    context.configure(url=get_settings().database_url, target_metadata=Base.metadata,
                      literal_binds=True, dialect_opts={'paramstyle': 'named'})
    with context.begin_transaction():
        context.run_migrations()
else:
    from contextlib import nullcontext
    supplied_connection = context.config.attributes.get('connection')
    with nullcontext(supplied_connection) if supplied_connection is not None else engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()

"""Catálogo nacional de municípios do IBGE com coordenadas da sede, capital e coluna de busca normalizada.

Os municípios vêm do arquivo versionado `migrations/data/municipios/municipios.csv` (derivado de
kelvins/municipios-brasileiros, MIT; commit de origem e licença ao lado do arquivo). Nada é baixado.
As seis cidades da 0001 mantêm ID, nome e UF e só recebem as colunas novas.
"""
import csv
from pathlib import Path

import sqlalchemy as sa
from alembic import op

from app.services.cities import city_search_text

revision = '0015'
down_revision = '0014'
branch_labels = None
depends_on = None

CATALOG = Path(__file__).resolve().parents[1] / 'data' / 'municipios' / 'municipios.csv'
ORIGINAL_IDS = (5300108, 3550308, 3304557, 2304400, 3106200, 5208707)

cities = sa.table(
    'cities', sa.column('id', sa.Integer()), sa.column('name', sa.String()), sa.column('state', sa.String()),
    sa.column('latitude', sa.Double()), sa.column('longitude', sa.Double()), sa.column('capital', sa.Boolean()),
    sa.column('search_text', sa.String()),
)


def read_catalog() -> dict[int, dict]:
    with CATALOG.open(encoding='utf-8', newline='') as file:
        rows = {int(row['codigo_ibge']): {
            'id': int(row['codigo_ibge']), 'name': row['nome'], 'state': row['uf'],
            'latitude': float(row['latitude']), 'longitude': float(row['longitude']), 'capital': row['capital'] == '1',
        } for row in csv.DictReader(file)}
    if len(rows) < 5000:
        raise RuntimeError(f'Catálogo de municípios incompleto em {CATALOG}: {len(rows)} linhas.')
    return rows


def upgrade():
    op.add_column('cities', sa.Column('latitude', sa.Double(), nullable=True))
    op.add_column('cities', sa.Column('longitude', sa.Double(), nullable=True))
    op.add_column('cities', sa.Column('capital', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('cities', sa.Column('search_text', sa.String(120), nullable=True))

    catalog = read_catalog()
    bind = op.get_bind()
    existing = {row.id: row for row in bind.execute(sa.select(cities.c.id, cities.c.name, cities.c.state))}
    unknown = sorted(set(existing) - set(catalog))
    if unknown:
        raise RuntimeError(f'Cidades sem correspondência no catálogo do IBGE: {unknown}. Nenhuma alteração foi feita.')
    # Linhas existentes mantêm ID, nome e UF; só as colunas novas vêm do catálogo.
    for city_id, row in existing.items():
        source = catalog[city_id]
        bind.execute(cities.update().where(cities.c.id == city_id).values(
            latitude=source['latitude'], longitude=source['longitude'], capital=source['capital'],
            search_text=city_search_text(row.name, row.state)))
    new_rows = [{**row, 'search_text': city_search_text(row['name'], row['state'])}
                for city_id, row in sorted(catalog.items()) if city_id not in existing]
    if new_rows:
        op.bulk_insert(cities, new_rows)

    op.alter_column('cities', 'latitude', nullable=False)
    op.alter_column('cities', 'longitude', nullable=False)
    op.alter_column('cities', 'search_text', nullable=False)
    op.alter_column('cities', 'capital', server_default=None)
    op.create_index('ix_cities_search_text', 'cities', ['search_text'],
                    postgresql_ops={'search_text': 'text_pattern_ops'})


def referenced_new_cities(bind) -> dict[str, list[int]]:
    """IDs fora das seis cidades originais usados por alguma chave estrangeira para `cities`, por coluna."""
    references = bind.execute(sa.text("""
        SELECT con.conrelid::regclass::text AS table_name, att.attname AS column_name
        FROM pg_constraint con
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
        WHERE con.contype = 'f' AND con.confrelid = 'cities'::regclass
        ORDER BY 1, 2
    """)).all()
    quote = bind.dialect.identifier_preparer.quote
    found: dict[str, list[int]] = {}
    for table_name, column_name in references:
        # table_name vem de regclass, já entre aspas quando preciso; só a coluna precisa ser citada.
        ids = bind.execute(sa.text(
            f'SELECT DISTINCT {quote(column_name)} FROM {table_name} '
            f'WHERE {quote(column_name)} IS NOT NULL AND NOT ({quote(column_name)} = ANY (:original)) ORDER BY 1'
        ), {'original': list(ORIGINAL_IDS)}).scalars().all()
        if ids:
            found[f'{table_name}.{column_name}'] = list(ids)
    return found


def downgrade():
    bind = op.get_bind()
    # EXCLUSIVE também conflita com os bloqueios de linha das chaves estrangeiras novas: nenhuma referência
    # surge entre a verificação e a exclusão abaixo.
    bind.execute(sa.text('LOCK TABLE cities IN EXCLUSIVE MODE'))
    in_use = referenced_new_cities(bind)
    if in_use:
        detail = '; '.join(f'{column}: {ids[:20]}{" …" if len(ids) > 20 else ""}' for column, ids in in_use.items())
        raise RuntimeError(
            'Downgrade da 0015 interrompido: municípios fora do catálogo original estão em uso '
            f'({detail}). Nenhum dado foi apagado; altere ou remova essas referências antes de reverter.')
    bind.execute(cities.delete().where(cities.c.id.notin_(ORIGINAL_IDS)))
    op.drop_index('ix_cities_search_text', table_name='cities')
    op.drop_column('cities', 'search_text')
    op.drop_column('cities', 'capital')
    op.drop_column('cities', 'longitude')
    op.drop_column('cities', 'latitude')

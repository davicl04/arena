"""Explicit administrative operations; never called during application startup.

- `promote-admin <email>` / `remove-admin <email>`: administrative role of an existing account.
- `sweep [--loop SEGUNDOS]`: periodic sweep (expired reservations, refunds counted as received, expired searches,
  proposals and slot offers, pairing again, result deadlines and championships whose matches are all done).
  In development, run
  `python -m app.admin_cli sweep --loop 60` in a terminal; production scheduling is decided at deployment.
- `recalculate-rankings`: recalculates every ranking category whole (the recent form and the best mark day included),
  keeping the update stamps of unchanged rows. Idempotent; run once after the migration that added those columns.
"""
import argparse
import time

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.identity import User, utcnow
from app.models.rankings import FOOTBALL_FORMATS, RUN_DISTANCES_KM
from app.models.teams import POSITIONS
from app.services.standings import RankingKey, recalculate_rankings
from app.services.sweep import run_sweep


def sweep_once() -> dict[str, int | None]:
    with SessionLocal() as db:
        report = run_sweep(db)
    summary = ', '.join(f'{name}={"falhou" if count is None else count}' for name, count in report.items())
    print(f'Varredura {utcnow().isoformat(timespec="seconds")}: {summary}.', flush=True)
    return report


def sweep(loop: int | None, *, sleep=time.sleep) -> None:
    if loop is None:
        sweep_once()
        return
    try:
        while True:
            sweep_once()
            sleep(loop)
    except KeyboardInterrupt:
        print('Varredura encerrada.', flush=True)


def all_ranking_keys() -> list[RankingKey]:
    """Every category: teams and each position by format, tennis and each running distance."""
    return [*(RankingKey('futebol_time', fmt) for fmt in FOOTBALL_FORMATS),
            *(RankingKey('futebol_individual', fmt, position) for fmt in FOOTBALL_FORMATS for position in POSITIONS),
            RankingKey('tenis'), *(RankingKey.run(km) for km in RUN_DISTANCES_KM)]


def recalculate_all_rankings() -> int:
    """Recalculates all categories in one transaction without stamping unchanged rows (`touch=False`), so a second
    run changes nothing; returns how many `standings` rows were written, created or removed."""
    with SessionLocal() as db:
        changed = recalculate_rankings(db, all_ranking_keys(), now=utcnow(), touch=False)
        db.commit()
    print(f'Rankings recalculados {utcnow().isoformat(timespec="seconds")}: {changed} linhas alteradas.', flush=True)
    return changed


def main(argv=None):
    parser = argparse.ArgumentParser(description='Operações administrativas explícitas do Arena.')
    commands = parser.add_subparsers(dest='command', required=True)
    promote = commands.add_parser('promote-admin', help='Concede o papel de administrador a uma conta existente.')
    promote.add_argument('email')
    demote = commands.add_parser('remove-admin', help='Remove o papel administrativo de uma conta existente.')
    demote.add_argument('email')
    periodic = commands.add_parser('sweep', help='Expira reservas, buscas, propostas e ofertas vencidas, confirma '
                                   'devoluções sem resposta, refaz o pareamento, fecha os prazos de resultado e encerra os '
                                   'campeonatos concluídos.')
    periodic.add_argument('--loop', type=int, metavar='SEGUNDOS',
                          help='Repete a varredura a cada SEGUNDOS (por exemplo, 60) até Ctrl+C.')
    commands.add_parser('recalculate-rankings', help='Recalcula todos os rankings (forma recente e melhor marca '
                        'incluídas). Idempotente; rode uma vez depois da migração que criou essas colunas.')
    args = parser.parse_args(argv)
    if args.command == 'recalculate-rankings':
        recalculate_all_rankings()
        return
    if args.command == 'sweep':
        if args.loop is not None and args.loop < 1:
            parser.error('Use --loop com pelo menos 1 segundo.')
        sweep(args.loop)
        return
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == args.email.strip().lower()))
        if user is None:
            parser.error('Conta não encontrada.')
        user.is_admin = args.command == 'promote-admin'
        db.commit()
        print(f'Papel administrativo atualizado para a conta {user.id}.')


if __name__ == '__main__':
    main()

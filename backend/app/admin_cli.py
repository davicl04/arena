"""Explicit administrative operations; never called during application startup.

- `promote-admin <email>` / `remove-admin <email>`: administrative role of an existing account.
- `sweep [--loop SEGUNDOS]`: periodic sweep (expired reservations, refunds counted as received, expired searches,
  proposals and slot offers, pairing again and result deadlines). In development, run
  `python -m app.admin_cli sweep --loop 60` in a terminal; production scheduling is decided at deployment.
"""
import argparse
import time

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.identity import User, utcnow
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


def main(argv=None):
    parser = argparse.ArgumentParser(description='Operações administrativas explícitas do Arena.')
    commands = parser.add_subparsers(dest='command', required=True)
    promote = commands.add_parser('promote-admin', help='Concede o papel de administrador a uma conta existente.')
    promote.add_argument('email')
    demote = commands.add_parser('remove-admin', help='Remove o papel administrativo de uma conta existente.')
    demote.add_argument('email')
    periodic = commands.add_parser('sweep', help='Expira reservas, buscas, propostas e ofertas vencidas, confirma '
                                   'devoluções sem resposta, refaz o pareamento e fecha os prazos de resultado.')
    periodic.add_argument('--loop', type=int, metavar='SEGUNDOS',
                          help='Repete a varredura a cada SEGUNDOS (por exemplo, 60) até Ctrl+C.')
    args = parser.parse_args(argv)
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

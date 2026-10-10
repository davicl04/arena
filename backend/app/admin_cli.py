"""Explicit administrative account operations; never called during application startup."""
import argparse

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.identity import User


def main():
    parser = argparse.ArgumentParser(description='Operações administrativas explícitas do Arena.')
    commands = parser.add_subparsers(dest='command', required=True)
    promote = commands.add_parser('promote-admin', help='Concede o papel de administrador a uma conta existente.')
    promote.add_argument('email')
    demote = commands.add_parser('remove-admin', help='Remove o papel administrativo de uma conta existente.')
    demote.add_argument('email')
    args = parser.parse_args()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == args.email.strip().lower()))
        if user is None:
            parser.error('Conta não encontrada.')
        user.is_admin = args.command == 'promote-admin'
        db.commit()
        print(f'Papel administrativo atualizado para a conta {user.id}.')


if __name__ == '__main__':
    main()

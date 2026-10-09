"""Run with python -m app.seed after migrations. Development only."""
import os
from datetime import date

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models.identity import SportsProfile, User
from app.schemas.identity import Register
from app.services.identity import register_user


def main():
    if get_settings().environment != 'development':
        raise SystemExit('Dados de demonstração são permitidos somente em desenvolvimento.')
    password = os.environ.get('ARENA_DEMO_PASSWORD')
    if not password or len(password) < 10:
        raise SystemExit('Defina ARENA_DEMO_PASSWORD com pelo menos 10 caracteres.')
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == 'atleta@example.com'))
        if not user:
            user = register_user(db, Register(name='Atleta Demo', email='atleta@example.com',
                                 birth_date=date(1995, 1, 10), password=password))
        for sport in ('futebol', 'tenis', 'corrida'):
            db.execute(insert(SportsProfile).values(user_id=user.id, sport=sport, city_id=5300108,
                       position='meio_campo' if sport == 'futebol' else None, looking_for=True)
                       .on_conflict_do_nothing(constraint='uq_profile_user_sport'))
        db.commit()
    print('Conta de demonstração pronta: atleta@example.com (perfis privados).')


if __name__ == '__main__':
    main()

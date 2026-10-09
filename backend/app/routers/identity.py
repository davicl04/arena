from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import COOKIE_NAME, current_session, current_user
from app.models.identity import AuthSession, City, SportsProfile, User, utcnow
from app.schemas.identity import (
    CityOut,
    Login,
    ProfileInput,
    ProfileOut,
    Register,
    SessionOut,
    Sport,
    UpdateUser,
    UserOut,
)
from app.services.identity import authenticate, create_session, register_user

router = APIRouter(prefix='/api/v1')


@router.post('/auth/register', response_model=UserOut, status_code=201)
def register(data: Register, db: Session = Depends(get_db)):
    return register_user(db, data)


@router.post('/auth/login', response_model=SessionOut)
def login(data: Login, request: Request, response: Response, db: Session = Depends(get_db)):
    user = authenticate(db, str(data.email), data.password)
    token, session = create_session(db, user)
    # Browser tokens never enter JavaScript; native clients use secure storage.
    browser = request.headers.get('origin') is not None
    if browser:
        response.set_cookie(COOKIE_NAME, token, httponly=True, secure=get_settings().cookie_secure,
                            samesite='lax', max_age=get_settings().session_hours * 3600, path='/')
    return SessionOut(user=UserOut.model_validate(user), expires_at=session.expires_at.isoformat(),
                      token=None if browser else token)


@router.post('/auth/logout', status_code=204)
def logout(response: Response, session: AuthSession = Depends(current_session), db: Session = Depends(get_db)):
    db.delete(session)
    db.commit()
    response.delete_cookie(COOKIE_NAME, path='/')


@router.get('/me', response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.patch('/me', response_model=UserOut)
def update_me(data: UpdateUser, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.name = data.name
    db.commit()
    return user


@router.get('/cities', response_model=list[CityOut])
def cities(q: str = Query('', max_length=100), db: Session = Depends(get_db)):
    statement = select(City).order_by(City.name).limit(100)
    if q:
        statement = statement.where(City.name.ilike(f'%{q}%'))
    return db.scalars(statement).all()


@router.get('/me/sports-profiles', response_model=list[ProfileOut])
def profiles(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(SportsProfile).where(SportsProfile.user_id == user.id)
                      .order_by(SportsProfile.sport)).all()


@router.put('/me/sports-profiles/{sport}', response_model=ProfileOut)
def put_profile(sport: Sport, data: ProfileInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if data.position and sport != Sport.futebol:
        raise HTTPException(422, 'Posição é permitida somente no futebol.')
    if not db.get(City, data.city_id):
        raise HTTPException(422, 'Selecione uma cidade do catálogo.')
    values = dict(user_id=user.id, sport=sport.value, city_id=data.city_id,
                  position=data.position.value if data.position else None, looking_for=data.looking_for)
    statement = insert(SportsProfile).values(**values).on_conflict_do_update(
        constraint='uq_profile_user_sport',
        set_={**data.model_dump(), 'updated_at': utcnow()},
    ).returning(SportsProfile)
    profile = db.scalars(statement.execution_options(populate_existing=True)).one()
    db.commit()
    return profile

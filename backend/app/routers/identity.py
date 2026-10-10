import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import Response as BinaryResponse
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
from app.services.media import normalize_avatar, remove_object, require_storage, storage_client, store_avatar

router = APIRouter(prefix='/api/v1')
logger = logging.getLogger('arena.media')


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


@router.put('/me/avatar', response_model=UserOut)
async def put_avatar(file: UploadFile = File(...), user: User = Depends(current_user),
                     db: Session = Depends(get_db)):
    raw = await file.read(get_settings().media_max_upload_bytes + 1)
    await file.close()
    if len(raw) > get_settings().media_max_upload_bytes:
        raise HTTPException(413, 'A imagem excede o limite de 5 MiB.')
    normalized = normalize_avatar(raw)
    store_avatar(db, user, normalized)
    return user


@router.get('/me/avatar')
def get_avatar(v: uuid.UUID, user: User = Depends(current_user)):
    media = user.avatar_media
    if media is None or media.id != v:
        raise HTTPException(404, 'Foto de perfil não encontrada.')
    result = require_storage(lambda: storage_client().get_object(Bucket=media.bucket, Key=media.object_key))
    try:
        content = result['Body'].read()
    finally:
        result['Body'].close()
    return BinaryResponse(content, media_type=media.content_type, headers={
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    })


@router.delete('/me/avatar', status_code=204)
def delete_avatar(user: User = Depends(current_user), db: Session = Depends(get_db)):
    media = user.avatar_media
    if media is None:
        return Response(status_code=204)
    user.avatar_media = None
    db.commit()
    try:
        remove_object(media)
        db.delete(media)
        db.commit()
    except Exception as error:
        db.rollback()
        logger.error('Removed avatar cleanup deferred: %s', type(error).__name__)
    return Response(status_code=204)


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

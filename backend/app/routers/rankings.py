from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import current_user
from app.models.identity import User
from app.schemas.rankings import MeStandingsOut
from app.services.rankings import my_standings

router = APIRouter(prefix='/api/v1')


@router.get('/me/standings', response_model=MeStandingsOut)
def get_my_standings(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return my_standings(db, user)

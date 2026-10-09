import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.core.database import engine
from app.routers.identity import router

app = FastAPI(title='Arena API', version='0.1.0')
app.add_middleware(CORSMiddleware, allow_origins=get_settings().allowed_origins,
                   allow_credentials=True, allow_methods=['GET', 'POST', 'PUT', 'PATCH'],
                   allow_headers=['Content-Type', 'Authorization'])


@app.middleware('http')
async def origin_protection(request: Request, call_next):
    if request.method not in {'GET', 'HEAD', 'OPTIONS'}:
        origin = request.headers.get('origin')
        if origin and origin not in get_settings().allowed_origins:
            return JSONResponse({'detail': 'Origem da solicitação não autorizada.'}, status_code=403)
        if request.url.path != '/api/v1/auth/logout' and request.headers.get('content-type', '').split(';')[0] != 'application/json':
            return JSONResponse({'detail': 'Envie os dados em JSON.'}, status_code=415)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


@app.exception_handler(RequestValidationError)
async def invalid_input(request: Request, error: RequestValidationError):
    # Never echo passwords or other submitted values in validation errors.
    return JSONResponse({'detail': 'Revise os campos informados.', 'fields': [
        {'field': '.'.join(str(part) for part in item['loc'][1:]), 'message': item['msg']}
        for item in error.errors()
    ]}, status_code=422)


@app.exception_handler(SQLAlchemyError)
async def database_error(request: Request, error: SQLAlchemyError):
    logging.getLogger('arena').error('Database operation failed: %s', type(error).__name__)
    return JSONResponse({'detail': 'Não foi possível acessar os dados. Tente novamente.'}, status_code=503)


@app.get('/health/live')
def live():
    return {'status': 'ok'}


@app.get('/health/ready')
def ready():
    with engine.connect() as connection:
        connection.execute(text('SELECT 1 FROM users LIMIT 1'))
    return {'status': 'ready'}


app.include_router(router)

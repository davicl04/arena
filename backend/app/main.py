import json
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
                   allow_credentials=True, allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
                   allow_headers=['Content-Type', 'Authorization'])


class AvatarBodyLimitMiddleware:
    """Buffers only the bounded avatar body before multipart parsing begins."""

    def __init__(self, application):
        self.application = application

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['method'] != 'PUT' or scope['path'] != '/api/v1/me/avatar':
            await self.application(scope, receive, send)
            return

        max_body = get_settings().media_max_upload_bytes + 256 * 1024
        request_headers = dict(scope.get('headers', []))
        content_length = request_headers.get(b'content-length')
        try:
            too_large = content_length is not None and int(content_length) > max_body
        except ValueError:
            too_large = True
        chunks = []
        received = 0
        if not too_large:
            while True:
                message = await receive()
                if message['type'] == 'http.disconnect':
                    return
                received += len(message.get('body', b''))
                if received > max_body:
                    too_large = True
                    break
                chunks.append(message)
                if not message.get('more_body', False):
                    break

        if too_large:
            body = json.dumps({'detail': 'A imagem excede o limite de 5 MiB.'}).encode()
            headers = [(b'content-type', b'application/json'),
                       (b'content-length', str(len(body)).encode()),
                       (b'cache-control', b'no-store'), (b'x-content-type-options', b'nosniff')]
            origin = request_headers.get(b'origin', b'').decode('latin1')
            if origin in get_settings().allowed_origins:
                headers.extend([(b'access-control-allow-origin', origin.encode('latin1')),
                                (b'access-control-allow-credentials', b'true'), (b'vary', b'Origin')])
            await send({'type': 'http.response.start', 'status': 413, 'headers': headers})
            await send({'type': 'http.response.body', 'body': body})
            return

        async def replay():
            if chunks:
                return chunks.pop(0)
            return await receive()

        await self.application(scope, replay, send)


app.add_middleware(AvatarBodyLimitMiddleware)


@app.middleware('http')
async def origin_protection(request: Request, call_next):
    if request.method not in {'GET', 'HEAD', 'OPTIONS'}:
        origin = request.headers.get('origin')
        if origin and origin not in get_settings().allowed_origins:
            return JSONResponse({'detail': 'Origem da solicitação não autorizada.'}, status_code=403)
        upload = request.url.path == '/api/v1/me/avatar' and request.method == 'PUT'
        delete_avatar = request.url.path == '/api/v1/me/avatar' and request.method == 'DELETE'
        content_type = request.headers.get('content-type', '').split(';')[0]
        if not upload and not delete_avatar and request.url.path != '/api/v1/auth/logout' and content_type != 'application/json':
            return JSONResponse({'detail': 'Envie os dados em JSON.'}, status_code=415)
        if upload:
            if content_type != 'multipart/form-data':
                return JSONResponse({'detail': 'Envie uma imagem em multipart/form-data.'}, status_code=415)
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

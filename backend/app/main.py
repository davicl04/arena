import json
import logging
import re

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.access_log import install_access_log_filter
from app.core.config import get_settings
from app.core.database import engine
from app.routers.brackets import router as brackets_router
from app.routers.courts import router as courts_router
from app.routers.entries import router as entries_router
from app.routers.events import router as events_router
from app.routers.identity import router
from app.routers.matches import router as matches_router
from app.routers.matchmaking import router as matchmaking_router
from app.routers.notifications import router as notifications_router
from app.routers.organizers import router as organizers_router
from app.routers.profile import router as profile_router
from app.routers.rankings import router as rankings_router
from app.routers.results import router as results_router
from app.routers.runs import router as runs_router
from app.routers.slots import router as slots_router
from app.routers.social import router as social_router
from app.routers.teams import router as teams_router
from app.services.match_rules import RuleError, TransitionError

app = FastAPI(title='Arena API', version='0.1.0')
# The team link token travels in GET/POST /api/v1/join/{token}: the access log shows /join/*** instead.
install_access_log_filter()
app.add_middleware(CORSMiddleware, allow_origins=get_settings().allowed_origins,
                   allow_credentials=True, allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
                   allow_headers=['Content-Type', 'Authorization'])


# Multipart uploads as (method, full-path regex, kind): bounded by AvatarBodyLimitMiddleware and exempt from
# JSON. 'imagem' accepts images only; 'arquivo' accepts an image or a PDF (payment and refund receipts).
UPLOAD_PATTERNS = (
    ('PUT', re.compile(r'/api/v1/me/avatar'), 'imagem'),
    ('PUT', re.compile(r'/api/v1/me/cover'), 'imagem'),
    ('POST', re.compile(r'/api/v1/posts'), 'imagem'),
    ('PUT', re.compile(r'/api/v1/teams/[0-9]+/crest'), 'imagem'),
    ('PUT', re.compile(r'/api/v1/entries/[0-9]+/receipt'), 'arquivo'),
    ('PUT', re.compile(r'/api/v1/entries/[0-9]+/refund-receipt'), 'arquivo'),
)
UPLOAD_MESSAGES = {
    'imagem': {'too_large': 'A imagem excede o limite de 5 MiB.',
               'not_multipart': 'Envie uma imagem em multipart/form-data.'},
    'arquivo': {'too_large': 'O arquivo excede o limite de 5 MiB.',
                'not_multipart': 'Envie o arquivo (imagem ou PDF) em multipart/form-data.'},
}


def upload_kind(method: str, path: str) -> str | None:
    return next((kind for allowed, pattern, kind in UPLOAD_PATTERNS
                 if method == allowed and pattern.fullmatch(path)), None)


def is_upload(method: str, path: str) -> bool:
    return upload_kind(method, path) is not None


class AvatarBodyLimitMiddleware:
    """Bounds multipart uploads (images and receipts) before multipart parsing begins."""

    def __init__(self, application):
        self.application = application

    async def __call__(self, scope, receive, send):
        kind = upload_kind(scope['method'], scope['path']) if scope['type'] == 'http' else None
        if kind is None:
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
            body = json.dumps({'detail': UPLOAD_MESSAGES[kind]['too_large']}).encode()
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
        kind = upload_kind(request.method, request.url.path)
        upload = kind is not None
        delete_avatar = request.url.path == '/api/v1/me/avatar' and request.method == 'DELETE'
        bodyless_action = request.method == 'DELETE' or (
            request.method == 'PUT' and any(marker in request.url.path for marker in ('/like', '/follow', '/block'))
        ) or (request.method == 'PUT' and '/me/follow-requests/' in request.url.path)
        content_type = request.headers.get('content-type', '').split(';')[0]
        if (not upload and not delete_avatar and not bodyless_action and request.url.path != '/api/v1/auth/logout'
                and content_type != 'application/json'):
            return JSONResponse({'detail': 'Envie os dados em JSON.'}, status_code=415)
        if upload:
            if content_type != 'multipart/form-data':
                return JSONResponse({'detail': UPLOAD_MESSAGES[kind]['not_multipart']}, status_code=415)
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


@app.exception_handler(RuleError)
async def rule_error(request: Request, error: RuleError):
    """Rule of the product violated (stage 3): `422 { detail, fields }`, the same shape as the input validation.

    The services raise it after checking everything and before writing, so the open transaction is discarded when
    the request session closes. `fields` names the field when the rule has one (contract 0002, section 7)."""
    fields = [{'field': error.field, 'message': str(error)}] if error.field else []
    return JSONResponse({'detail': str(error), 'fields': fields}, status_code=422)


@app.exception_handler(TransitionError)
async def transition_error(request: Request, error: TransitionError):
    """Action outside the state of the search, match, stat or event: `409 { detail }`."""
    return JSONResponse({'detail': str(error)}, status_code=409)


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
app.include_router(social_router)
app.include_router(notifications_router)
app.include_router(rankings_router)
app.include_router(teams_router)
app.include_router(organizers_router)
app.include_router(events_router)
app.include_router(entries_router)
app.include_router(matchmaking_router)
app.include_router(matches_router)
app.include_router(courts_router)
app.include_router(slots_router)
app.include_router(results_router)
app.include_router(brackets_router)
app.include_router(runs_router)
app.include_router(profile_router)

"""The team link token never reaches the access log in clear (GET/POST /api/v1/join/{token})."""
import logging

import app.main  # noqa: F401  (loading the app installs the filter)
from app.core.access_log import ACCESS_LOGGER, JoinTokenFilter, install_access_log_filter, redact_join_token

TOKEN = 'Ab3_dEf-ghIJklMNopQRstUVwxYZ0123456789abcde'
UVICORN_FORMAT = '%s - "%s %s HTTP/%s" %d'


class Capture(logging.Handler):
    def __init__(self):
        super().__init__()
        self.lines: list[str] = []

    def emit(self, record):
        self.lines.append(record.getMessage())


def test_join_token_is_masked_and_other_paths_stay():
    assert redact_join_token(f'/api/v1/join/{TOKEN}') == '/api/v1/join/***'
    assert redact_join_token(f'/api/v1/join/{TOKEN}?utm=1') == '/api/v1/join/***?utm=1'
    for path in ('/api/v1/team-join-requests/7', '/api/v1/teams/3/join-requests', '/api/v1/teams/3/invite-link'):
        assert redact_join_token(path) == path


def test_filter_rewrites_uvicorn_records_without_dropping_them():
    record = logging.LogRecord(ACCESS_LOGGER, logging.INFO, __file__, 1, UVICORN_FORMAT,
                               ('127.0.0.1:50000', 'POST', f'/api/v1/join/{TOKEN}', '1.1', 201), None)
    assert JoinTokenFilter().filter(record) is True
    assert record.getMessage() == '127.0.0.1:50000 - "POST /api/v1/join/*** HTTP/1.1" 201'
    plain = logging.LogRecord(ACCESS_LOGGER, logging.INFO, __file__, 1, f'GET /api/v1/join/{TOKEN}', None, None)
    JoinTokenFilter().filter(plain)
    assert TOKEN not in plain.getMessage()
    keyed = logging.LogRecord(ACCESS_LOGGER, logging.INFO, __file__, 1, '%(path)s', None, None)
    keyed.args = {'path': f'/api/v1/join/{TOKEN}'}
    JoinTokenFilter().filter(keyed)
    assert keyed.getMessage() == '/api/v1/join/***'


def test_loading_the_app_installs_the_filter_once_on_the_access_logger():
    logger = logging.getLogger(ACCESS_LOGGER)
    installed = [item for item in logger.filters if isinstance(item, JoinTokenFilter)]
    assert len(installed) == 1
    assert install_access_log_filter() is installed[0]
    assert len([item for item in logger.filters if isinstance(item, JoinTokenFilter)]) == 1

    capture = Capture()
    level, logger.level = logger.level, logging.INFO
    logger.addHandler(capture)
    try:
        logger.info(UVICORN_FORMAT, '10.0.0.2:1234', 'GET', f'/api/v1/join/{TOKEN}', '1.1', 200)
    finally:
        logger.removeHandler(capture)
        logger.setLevel(level)
    assert capture.lines == ['10.0.0.2:1234 - "GET /api/v1/join/*** HTTP/1.1" 200']

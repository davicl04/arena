"""Keeps the team link token out of the access log.

`GET` and `POST /api/v1/join/{token}` carry the token in the path, and uvicorn's access log writes the path in
clear. Anyone with the token can ask to join the team, so the log shows `/join/***` instead. Installed by
`app.main` when the application is loaded; production proxies must do the same for the web path `/entrar/*`
(README, "Link do time").
"""
from __future__ import annotations

import logging
import re

ACCESS_LOGGER = 'uvicorn.access'
# `/join/` followed by the token, up to the query string or the end of the path. `/team-join-requests/` and
# `/join-requests` never match: they do not have `/join/`.
JOIN_TOKEN = re.compile(r'(/join/)[^/?#\s"]+')


def redact_join_token(text: str) -> str:
    return JOIN_TOKEN.sub(r'\1***', text)


class JoinTokenFilter(logging.Filter):
    """Replaces the token of `/join/<token>` with `***` in the record (arguments and message); never drops it."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple):
            record.args = tuple(redact_join_token(value) if isinstance(value, str) else value
                                for value in record.args)
        elif isinstance(record.args, dict):
            record.args = {key: redact_join_token(value) if isinstance(value, str) else value
                           for key, value in record.args.items()}
        if isinstance(record.msg, str):
            record.msg = redact_join_token(record.msg)
        return True


def install_access_log_filter(logger_name: str = ACCESS_LOGGER) -> JoinTokenFilter:
    """Adds the filter to the access logger once (loading the app again does not stack copies)."""
    logger = logging.getLogger(logger_name)
    for existing in logger.filters:
        if isinstance(existing, JoinTokenFilter):
            return existing
    installed = JoinTokenFilter()
    logger.addFilter(installed)
    return installed

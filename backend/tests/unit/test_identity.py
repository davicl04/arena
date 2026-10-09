from datetime import date

import pytest

from app.core.config import Settings
from app.services.identity import is_adult, normalize_email


@pytest.mark.parametrize(('birth', 'today', 'expected'), [
    (date(2008, 10, 9), date(2026, 10, 9), True),
    (date(2008, 10, 10), date(2026, 10, 9), False),
    (date(2009, 1, 1), date(2026, 10, 9), False),
    (date(2027, 1, 1), date(2026, 10, 9), False),
    (date(2008, 2, 29), date(2026, 2, 28), False),
    (date(2008, 2, 29), date(2026, 3, 1), True),
])
def test_calendar_age(birth, today, expected):
    assert is_adult(birth, today) is expected


def test_email_normalization():
    assert normalize_email('  Athlete@EXAMPLE.com  ') == 'athlete@example.com'


def test_production_requires_secure_cookie():
    with pytest.raises(ValueError):
        Settings(environment='production', cookie_secure=False)

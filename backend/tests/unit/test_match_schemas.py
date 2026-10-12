"""Shared stage 3 shapes: strict inputs and the pure builders of scores and courts."""
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.models.identity import City
from app.models.matches import Court
from app.schemas.matches import (
    AttendanceInput,
    ResultInput,
    SearchInput,
    StatContestInput,
    TermsInput,
    court_out,
    score_out,
)
from app.services.match_rules import validate_tennis_sets, walkover_score


def test_inputs_reject_unknown_fields_and_values():
    assert SearchInput(sport='futebol').team_id is None
    search = SearchInput(sport='futebol', team_id=3, format='society', open_slots={'atacante': 2})
    assert search.open_slots.atacante == 2 and search.open_slots.goleiro == 0
    for bad in ({'sport': 'corrida'}, {'sport': 'tenis', 'city_id': 1}, {'sport': 'futebol', 'position': 'ponta'},
                {'sport': 'futebol', 'open_slots': {'lateral': 1}}):
        with pytest.raises(ValidationError):
            SearchInput(**bad)
    with pytest.raises(ValidationError):
        TermsInput(starts_at='2026-10-20T19:00:00-03:00', court_id=1, booking_side='c')
    with pytest.raises(ValidationError):
        StatContestInput(fields=['cartoes'], reason='Não aconteceu')
    with pytest.raises(ValidationError):
        AttendanceInput(athletes=[])
    assert ResultInput(sets=[{'a': 7, 'b': 6, 'tiebreak': {'a': 7, 'b': 5}}, {'a': 6, 'b': 1}]).sets[0].tiebreak.a == 7


def test_score_builder_for_football_tennis_and_missing_scores():
    assert score_out(None, None, None, None) is None
    football = score_out(3, 0, None, 'a')
    assert (football.a, football.b, football.winner, football.sets) == (3, 0, 'a', None)
    tennis = validate_tennis_sets([{'a': 6, 'b': 4}, {'a': 3, 'b': 6}, {'a': 10, 'b': 8}], super_tiebreak=True)
    built = score_out(tennis.score_a, tennis.score_b, tennis.sets_json(), tennis.winner)
    assert (built.a, built.b, built.winner) == (2, 1, 'a')
    assert built.sets[2].super_tiebreak and built.sets[0].tiebreak is None
    walkover = walkover_score('tenis', 'b')
    assert [(item.a, item.b) for item in score_out(2, 0, walkover.sets_json(), 'a').sets] == [(6, 0), (6, 0)]


def test_court_builder_marks_suggestions_as_provisional():
    city = City(id=5300108, name='Brasília', state='DF')
    court = Court(id=4, city_id=city.id, name='Arena Sudoeste', name_key='arena sudoeste', kind='society',
                  state='em_revisao', created_at=datetime(2026, 10, 12, tzinfo=timezone.utc))
    out = court_out(court, city)
    assert (out.name, out.kind, out.city.name, out.state, out.provisional) == (
        'Arena Sudoeste', 'society', 'Brasília', 'em_revisao', True)
    court.state = 'publicada'
    assert court_out(court, city).provisional is False

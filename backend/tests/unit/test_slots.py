"""Walk-in slots without a database: who may adjust them, the change plan, the guest removal rule and the texts."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.schemas.matches import SlotsInput
from app.services.match_access import MatchAccess
from app.services.match_views import MatchFacts, permissions_for
from app.services.slots import (
    GUEST_STARTED,
    SLOTS_ONLY_FRIENDLY_FOOTBALL,
    SLOTS_ONLY_REPRESENTATIVES,
    SLOTS_STARTED,
    SLOTS_STATE,
    SlotPlan,
    counts,
    guest_removal_error,
    plan_slot_changes,
    slots_error,
    slots_text,
)

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
HOUR = timedelta(hours=1)
REPRESENTATIVE = MatchAccess('representante', 'a')
ROLES = {
    'representante': REPRESENTATIVE, 'membro': MatchAccess('membro', 'a'), 'avulso': MatchAccess('avulso', 'a'),
    'atleta': MatchAccess('atleta', 'a'), 'organizador': MatchAccess('organizador', None),
    'administracao': MatchAccess('administracao', None),
}


def match(**values):
    base = dict(sport='futebol', origin='amistoso', state='agendada', starts_at=NOW + 2 * HOUR,
                result_deadline=NOW + 50 * HOUR, booking_side='a', walkover_absent_side=None,
                walkover_contested_at=None, proposal_expires_at=None, score_a=None)
    return SimpleNamespace(**{**base, **values})


def slot(slot_id, position, state='aberta', opened_hours=0):
    return SimpleNamespace(id=slot_id, position=position, state=state, opened_at=NOW - opened_hours * HOUR)


# ----- Who may adjust the slots --------------------------------------------------------------------------------

def test_a_representative_adjusts_the_slots_while_arranging_or_before_the_start():
    assert slots_error(match(state='combinando', starts_at=None), REPRESENTATIVE, now=NOW) is None
    assert slots_error(match(), REPRESENTATIVE, now=NOW) is None


@pytest.mark.parametrize(('values', 'role', 'expected'), [
    ({'sport': 'tenis'}, 'atleta', (409, SLOTS_ONLY_FRIENDLY_FOOTBALL)),
    ({'origin': 'campeonato'}, 'representante', (409, SLOTS_ONLY_FRIENDLY_FOOTBALL)),
    ({}, 'membro', (403, SLOTS_ONLY_REPRESENTATIVES)),
    ({}, 'avulso', (403, SLOTS_ONLY_REPRESENTATIVES)),
    ({}, 'administracao', (403, SLOTS_ONLY_REPRESENTATIVES)),
    ({'state': 'proposta', 'starts_at': None}, 'representante', (409, SLOTS_STATE)),
    ({'state': 'cancelada'}, 'representante', (409, SLOTS_STATE)),
    ({'state': 'realizada', 'starts_at': NOW - HOUR}, 'representante', (409, SLOTS_STATE)),
    ({'starts_at': NOW - HOUR}, 'representante', (409, SLOTS_STARTED)),
    ({'starts_at': NOW}, 'representante', (409, SLOTS_STARTED)),
])
def test_who_cannot_adjust_the_slots_and_why(values, role, expected):
    assert slots_error(match(**values), ROLES[role], now=NOW) == expected


def test_the_route_rule_and_the_manage_slots_permission_agree():
    """`permissions_for(...).manage_slots` (what the clients show) and `slots_error` (what the route enforces)."""
    cases = 0
    for role, access in ROLES.items():
        for sport in ('futebol', 'tenis'):
            for origin in ('amistoso', 'campeonato'):
                for started in (False, True):
                    for state in ('proposta', 'combinando', 'agendada', 'realizada', 'encerrada', 'cancelada'):
                        starts_at = None if state in ('proposta', 'combinando') else NOW + (
                            -HOUR if started else 2 * HOUR)
                        subject = match(sport=sport, origin=origin, state=state, starts_at=starts_at,
                                        result_deadline=None if starts_at is None else starts_at + 48 * HOUR)
                        shown = permissions_for(subject, access, MatchFacts(), now=NOW).manage_slots
                        assert shown == (slots_error(subject, access, now=NOW) is None), (
                            role, sport, origin, started, state)
                        cases += 1
    assert cases == 6 * 2 * 2 * 2 * 6


# ----- Change plan -----------------------------------------------------------------------------------------------

def test_the_plan_opens_the_missing_slots_per_position():
    held = [slot(1, 'atacante'), slot(2, 'defesa')]
    plan = plan_slot_changes(held, {'goleiro': 1, 'defesa': 1, 'atacante': 3})
    assert plan == SlotPlan({'goleiro': 1, 'atacante': 2}, ())
    assert not plan.empty


def test_the_plan_is_empty_when_nothing_changes():
    held = [slot(1, 'atacante'), slot(2, 'atacante', 'oferecida')]
    assert plan_slot_changes(held, {'atacante': 2}).empty
    assert plan_slot_changes([], {}).empty


def test_the_plan_closes_the_newest_open_slots_before_the_offered_ones():
    held = [slot(1, 'atacante', opened_hours=5), slot(2, 'atacante', 'oferecida', opened_hours=1),
            slot(3, 'atacante', opened_hours=3), slot(4, 'atacante', opened_hours=2)]
    # One fewer: the newest open slot (4); two fewer: also the next newest (3); three fewer: 1; the offer goes last.
    assert plan_slot_changes(held, {'atacante': 3}).close == (4,)
    assert plan_slot_changes(held, {'atacante': 2}).close == (4, 3)
    assert plan_slot_changes(held, {'atacante': 1}).close == (4, 3, 1)
    assert plan_slot_changes(held, {'atacante': 0}).close == (4, 3, 1, 2)


def test_the_plan_uses_ids_to_break_ties_and_adjusts_each_position_alone():
    held = [slot(7, 'defesa'), slot(9, 'defesa'), slot(5, 'goleiro')]
    plan = plan_slot_changes(held, {'defesa': 1, 'goleiro': 1, 'meio_campo': 2})
    assert plan == SlotPlan({'meio_campo': 2}, (9,))


def test_counts_and_the_banner_text():
    assert counts(None) == {'goleiro': 0, 'defesa': 0, 'meio_campo': 0, 'atacante': 0}
    assert counts({'atacante': 2}) == {'goleiro': 0, 'defesa': 0, 'meio_campo': 0, 'atacante': 2}
    assert slots_text('Ferrugem FC', counts({'goleiro': 1, 'atacante': 2})) == (
        'Ferrugem FC atualizou as vagas para avulsos: Goleiro (1), Atacante (2).')
    assert slots_text('Ferrugem FC', counts({})) == 'Ferrugem FC não tem vagas abertas para avulsos.'


# ----- Guest removal and input ---------------------------------------------------------------------------------

def test_a_guest_is_removed_only_before_the_start():
    assert guest_removal_error(NOW + HOUR, NOW) is None
    assert guest_removal_error(NOW, NOW) == GUEST_STARTED
    assert guest_removal_error(NOW - HOUR, NOW) == GUEST_STARTED
    assert guest_removal_error(None, NOW) == GUEST_STARTED


def test_the_slots_body_rejects_unknown_fields_and_defaults_to_zero():
    assert SlotsInput(open_slots={'atacante': 2}).open_slots.model_dump() == {
        'goleiro': 0, 'defesa': 0, 'meio_campo': 0, 'atacante': 2}
    with pytest.raises(ValidationError):
        SlotsInput(open_slots={'atacante': 1}, side='b')
    with pytest.raises(ValidationError):
        SlotsInput(open_slots={'lateral': 1})
    with pytest.raises(ValidationError):
        SlotsInput()

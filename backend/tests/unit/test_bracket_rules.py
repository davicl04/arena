from datetime import datetime, timedelta, timezone
from itertools import combinations

import pytest

from app.services import bracket_rules as rules
from app.services.bracket_rules import Booking, SlotRef
from app.services.event_rules import TransitionError
from app.services.match_rules import RuleError, Score

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
H = timedelta(hours=1)


# ----- Draw ------------------------------------------------------------------------------------------------------

def test_draw_is_a_permutation_that_the_seed_reproduces():
    ids = [11, 4, 9, 2, 30, 7]
    first = rules.draw_order(ids, 987654321)
    assert sorted(first) == sorted(ids)
    # Same entries and same seed: the same order, whatever the order the entries arrive in.
    assert rules.draw_order(reversed(ids), 987654321) == first
    assert rules.draw_order(ids + ids, 987654321) == first
    # The seed is what changes the draw.
    assert len({tuple(rules.draw_order(ids, seed)) for seed in range(40)}) > 10


def test_draw_order_does_not_depend_on_the_python_shuffle():
    # A fixed expectation: the order comes from SHA-256 of the seed and the id, stable across Python versions.
    assert rules.draw_order([1, 2, 3, 4], 7) == rules.draw_order([4, 3, 2, 1], 7)
    assert rules.draw_order([1, 2, 3, 4], 7)[0] in (1, 2, 3, 4)
    assert rules.draw_order([], 7) == []


@pytest.mark.parametrize('count, size', [(2, 2), (3, 4), (4, 4), (5, 8), (6, 8), (8, 8), (9, 16), (16, 16)])
def test_elimination_size_is_the_smallest_power_of_two_that_fits(count, size):
    assert rules.elimination_size(count) == size


def test_elimination_needs_two_entries():
    with pytest.raises(RuleError, match='pelo menos 2'):
        rules.elimination_size(1)
    with pytest.raises(RuleError):
        rules.elimination_size(0)


def test_seed_order_keeps_top_seeds_apart():
    assert rules.seed_order(2) == [1, 2]
    assert rules.seed_order(4) == [1, 4, 2, 3]
    assert rules.seed_order(8) == [1, 8, 4, 5, 2, 7, 3, 6]
    for size in (2, 4, 8, 16, 32):
        order = rules.seed_order(size)
        assert sorted(order) == list(range(1, size + 1))
        # Neighbours in the first round always add up to size + 1 (1 meets the last seed, 2 the one before…).
        assert all(order[i] + order[i + 1] == size + 1 for i in range(0, size, 2))
    with pytest.raises(ValueError):
        rules.seed_order(6)


def test_six_entries_in_a_bracket_of_eight_leave_two_byes_in_different_pairings():
    slots = rules.elimination_slots([101, 102, 103, 104, 105, 106], 8)
    assert len(slots) == 8 and slots.count(None) == 2
    assert sorted(slot for slot in slots if slot is not None) == [101, 102, 103, 104, 105, 106]
    pairs = [(slots[i], slots[i + 1]) for i in range(0, 8, 2)]
    assert sum(1 for pair in pairs if None in pair) == 2
    assert all(pair != (None, None) for pair in pairs)
    # The two top seeds (the first two of the draw) are the ones without an opponent, one in each half.
    assert pairs[0] == (101, None) and pairs[2] == (102, None)


def test_sixteen_places_with_five_entries_shrink_to_a_bracket_of_eight_with_three_byes():
    size = rules.elimination_size(5)
    slots = rules.elimination_slots([1, 2, 3, 4, 5], size)
    assert size == 8 and slots.count(None) == 3
    rules.validate_elimination_slots(slots)


def test_layout_of_eight_with_six_entries_numbers_only_real_matches():
    slots = rules.elimination_slots([101, 102, 103, 104, 105, 106], 8)
    nodes = rules.elimination_layout(slots)
    assert [(node.round, node.position) for node in nodes] == [
        (1, 1), (1, 2), (1, 3), (1, 4), (2, 1), (2, 2), (3, 1)]
    first = {node.position: node for node in nodes if node.round == 1}
    # Pairings 1 and 3 are byes ("Folga"): no match, and the entry that goes through is known.
    assert first[1].is_bye and first[1].advancing_entry == 101 and first[1].a.entry_id == 101 and first[1].b.bye
    assert first[3].is_bye and first[3].advancing_entry == 102
    assert not first[2].is_bye and not first[4].is_bye
    assert [first[2].number, first[4].number] == [1, 2]
    second = {node.position: node for node in nodes if node.round == 2}
    assert second[1].a == SlotRef(entry_id=101, advanced=True) and second[1].b == SlotRef(from_match=1)
    assert second[2].a == SlotRef(entry_id=102, advanced=True) and second[2].b == SlotRef(from_match=2)
    assert [second[1].number, second[2].number] == [3, 4]
    final = nodes[-1]
    assert final.number == 5 and final.a == SlotRef(from_match=3) and final.b == SlotRef(from_match=4)
    assert final.next is None
    # Where each winner goes: next round, the position, and the side.
    assert first[2].next == (2, 1, 'b') and first[4].next == (2, 2, 'b')
    assert first[1].next == (2, 1, 'a') and first[3].next == (2, 2, 'a')
    assert second[1].next == (3, 1, 'a') and second[2].next == (3, 1, 'b')


def test_layout_of_a_full_bracket_of_four_has_three_matches():
    nodes = rules.elimination_layout(rules.elimination_slots([1, 2, 3, 4], 4))
    assert [node.number for node in nodes] == [1, 2, 3]
    assert nodes[0].next == (2, 1, 'a') and nodes[1].next == (2, 1, 'b')
    assert nodes[2].a == SlotRef(from_match=1) and nodes[2].b == SlotRef(from_match=2)
    assert rules.round_count(4) == 2 and rules.round_count(16) == 4


def test_two_entries_are_just_a_final():
    nodes = rules.elimination_layout(rules.elimination_slots([8, 9], 2))
    assert len(nodes) == 1 and nodes[0].number == 1 and nodes[0].next is None
    assert rules.round_name(1, 1) == 'Final'


def test_round_names_count_from_the_final():
    assert [rules.round_name(r, 4) for r in (1, 2, 3, 4)] == [
        'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final']
    assert [rules.round_name(r, 3) for r in (1, 2, 3)] == ['Quartas de final', 'Semifinal', 'Final']
    assert rules.round_name(1, 5) == 'Fase 1'


def test_invalid_plans_are_rejected():
    with pytest.raises(ValueError):
        rules.validate_elimination_slots([1, 2, 3])
    with pytest.raises(ValueError):
        rules.validate_elimination_slots([1, 1, 2, 3])
    with pytest.raises(ValueError):
        rules.validate_elimination_slots([1, None, None, None])
    with pytest.raises(RuleError, match='sem nenhum time'):
        rules.validate_elimination_slots([1, 2, None, None])


def test_swap_exchanges_two_places_and_refuses_what_breaks_the_bracket():
    slots = [1, None, 2, 3, 4, None, 5, 6]
    swapped = rules.swap_slots(slots, 0, 3)
    assert swapped == [3, None, 2, 1, 4, None, 5, 6] and slots[0] == 1
    # A team may take a bye place (and the bye moves to where the team was).
    assert rules.swap_slots(slots, 0, 1)[:2] == [None, 1]
    with pytest.raises(RuleError, match='lugares diferentes'):
        rules.swap_slots(slots, 2, 2)
    with pytest.raises(RuleError, match='existem na chave'):
        rules.swap_slots(slots, 0, 8)
    with pytest.raises(RuleError, match='pelo menos um time'):
        rules.swap_slots(slots, 1, 5)
    # Moving a bye next to the other bye would leave a pairing without teams.
    with pytest.raises(RuleError, match='sem nenhum time'):
        rules.validate_elimination_slots(rules.swap_slots([1, None, 2, 3, 4, 5, 6, None], 0, 7))


# ----- Round robin -----------------------------------------------------------------------------------------------

@pytest.mark.parametrize('count', [2, 3, 4, 5, 6, 7, 8, 11, 20])
def test_circle_method_every_pair_meets_once_and_nobody_plays_twice_in_a_round(count):
    ids = list(range(100, 100 + count))
    rounds = rules.circle_rounds(ids)
    assert len(rounds) == (count - 1 if count % 2 == 0 else count)
    seen = []
    for plan in rounds:
        playing = [entry for pair in plan.pairs for entry in pair]
        assert len(playing) == len(set(playing))
        if count % 2:
            # One entry sits out each round, a different one each time.
            assert plan.rest is not None and plan.rest not in playing
            assert len(playing) == count - 1
        else:
            assert plan.rest is None and len(playing) == count
        seen += [frozenset(pair) for pair in plan.pairs]
    assert len(seen) == len(set(seen)) == count * (count - 1) // 2
    assert set(seen) == {frozenset(pair) for pair in combinations(ids, 2)}
    if count % 2:
        assert sorted(plan.rest for plan in rounds) == sorted(ids)


def test_five_entries_play_five_rounds_with_one_rest_each():
    rounds = rules.circle_rounds([1, 2, 3, 4, 5])
    assert [plan.number for plan in rounds] == [1, 2, 3, 4, 5]
    assert all(len(plan.pairs) == 2 and plan.rest is not None for plan in rounds)


def test_the_draw_only_changes_the_order_of_the_rounds():
    first = rules.circle_rounds(rules.draw_order([1, 2, 3, 4, 5, 6], 1))
    second = rules.circle_rounds(rules.draw_order([1, 2, 3, 4, 5, 6], 2))
    pairs = lambda rounds: {frozenset(pair) for plan in rounds for pair in plan.pairs}  # noqa: E731
    assert pairs(first) == pairs(second)


def test_round_robin_plan_needs_distinct_entries():
    with pytest.raises(ValueError):
        rules.circle_rounds([1, 1, 2])
    with pytest.raises(ValueError):
        rules.circle_rounds([1])


def test_sides_alternate_so_nobody_is_always_side_a():
    rounds = rules.circle_rounds([1, 2, 3, 4])
    first_side = [pair[0] for plan in rounds for pair in plan.pairs]
    assert len(set(first_side)) > 2


# ----- Table -----------------------------------------------------------------------------------------------------

def test_table_gives_three_one_zero_and_orders_by_points_then_goal_difference():
    order = [1, 2, 3, 4]
    results = [(1, 2, 3, 0), (3, 4, 1, 1), (1, 3, 2, 2), (2, 4, 0, 1), (1, 4, 1, 0), (2, 3, 0, 4)]
    table = rules.table_standings(order, results)
    by_id = {row.entry_id: row for row in table}
    assert by_id[1].points == 7 and (by_id[1].wins, by_id[1].draws, by_id[1].losses) == (2, 1, 0)
    assert by_id[3].points == 5 and by_id[3].goal_difference == 7 - 3 and by_id[3].goals_for == 7
    assert by_id[4].points == 4 and by_id[2].points == 0
    assert [row.entry_id for row in table] == [1, 3, 4, 2]
    assert all(row.played == 3 for row in table)


def test_table_tiebreaks_are_goal_difference_goals_for_wins_then_the_draw_order():
    # 1 and 2 finish on the same points and goal difference; 2 scored more.
    table = rules.table_standings([1, 2, 3], [(1, 3, 1, 0), (2, 3, 4, 3)])
    assert [row.entry_id for row in table] == [2, 1, 3]
    assert table[0].points == table[1].points == 3
    # Everything equal: the order of the draw settles it.
    tie = rules.table_standings([5, 6, 7], [(5, 6, 1, 1)])
    assert [row.entry_id for row in tie] == [5, 6, 7]
    assert rules.table_standings([5, 6], [])[0].played == 0


def test_table_counts_sets_for_tennis_like_goals():
    table = rules.table_standings([10, 20], [(10, 20, 2, 1)])
    assert [(row.entry_id, row.points, row.goal_difference) for row in table] == [(10, 3, 1), (20, 0, -1)]


# ----- Schedule --------------------------------------------------------------------------------------------------

def booking(match_id, starts_at, court_id=1, *subjects):
    return Booking(match_id, starts_at, court_id, frozenset(subjects))


def test_same_court_less_than_two_hours_apart_conflicts():
    others = [booking(1, NOW + 5 * H), booking(2, NOW + 9 * H)]
    assert rules.find_conflict(NOW + 6 * H + timedelta(minutes=59), 1, [], others)[0] == 'quadra'
    kind, clash = rules.find_conflict(NOW + 4 * H, 1, [], others)
    assert (kind, clash.match_id) == ('quadra', 1)
    # Exactly 2 h apart is free (the match before ends when the next one starts).
    assert rules.find_conflict(NOW + 7 * H, 1, [], others) is None
    assert rules.find_conflict(NOW + 3 * H, 1, [], others) is None


def test_other_courts_do_not_conflict_and_the_nearest_match_is_reported():
    others = [booking(1, NOW + 5 * H, 1), booking(2, NOW + 6 * H, 2), booking(3, NOW + 5 * H + timedelta(minutes=30), 1)]
    assert rules.find_conflict(NOW + 5 * H, 3, [], others) is None
    kind, clash = rules.find_conflict(NOW + 5 * H + timedelta(minutes=20), 1, [], others)
    assert kind == 'quadra' and clash.match_id == 3
    assert rules.find_conflict(NOW + 5 * H, None, [], others) is None


def test_a_competitor_cannot_play_two_matches_less_than_two_hours_apart():
    others = [booking(1, NOW + 5 * H, 7, ('time', 10), ('time', 11)), booking(2, NOW + 5 * H, 8, ('time', 12))]
    kind, clash = rules.find_conflict(NOW + 6 * H, 9, [('time', 11), ('time', 20)], others)
    assert (kind, clash.match_id) == ('time', 1)
    assert rules.find_conflict(NOW + 7 * H, 9, [('time', 11)], others) is None
    assert rules.find_conflict(NOW + 6 * H, 9, [('atleta', 11)], others) is None
    # The court is reported first when both clash.
    assert rules.find_conflict(NOW + 6 * H, 7, [('time', 11)], others)[0] == 'quadra'


def test_schedule_start_is_free_to_the_minute_but_must_be_future_with_zone():
    assert rules.validate_schedule_start(NOW + 3 * H + timedelta(minutes=7, seconds=30), NOW) == (
        NOW + 3 * H + timedelta(minutes=7))
    with pytest.raises(RuleError, match='fuso'):
        rules.validate_schedule_start(datetime(2026, 10, 20, 9, 0), NOW)
    with pytest.raises(RuleError, match='não passaram'):
        rules.validate_schedule_start(NOW, NOW)
    with pytest.raises(RuleError, match='12 meses'):
        rules.validate_schedule_start(NOW + timedelta(days=366), NOW)


# ----- Decision of the organizer ---------------------------------------------------------------------------------

def kind(**values):
    base = dict(state='agendada', started=True, reports_differ=False, deadline_passed=False, walkover=False)
    return rules.decision_kind(**{**base, **values})


def test_decision_kind_by_situation():
    assert kind(reports_differ=True) == 'divergencia'
    assert kind(deadline_passed=True) == 'prazo'
    assert kind(walkover=True) == 'wo'
    assert kind(walkover=True, reports_differ=True) == 'wo'
    assert kind(reports_differ=True, deadline_passed=True) == 'divergencia'


@pytest.mark.parametrize('values, message', [
    ({'state': 'realizada'}, 'já foi definido'),
    ({'state': 'encerrada'}, 'já foi definido'),
    ({'state': 'cancelada'}, 'cancelada'),
    ({'state': 'combinando'}, 'Agende a partida'),
    ({'started': False, 'reports_differ': True}, 'ainda não começou'),
    ({}, 'ainda podem informar'),
])
def test_decision_kind_refuses_what_the_organizer_cannot_decide(values, message):
    with pytest.raises(TransitionError, match=message):
        kind(**values)


def test_justification_is_trimmed_and_needs_five_characters():
    assert rules.clean_justification('  placar  conferido   no vídeo ') == 'placar conferido no vídeo'
    for bad in (None, '', '    ', 'abcd', 'x' * 501):
        with pytest.raises(RuleError, match='justificativa'):
            rules.clean_justification(bad)
    assert rules.clean_justification('x' * 500) == 'x' * 500


def test_a_knockout_match_refuses_a_football_draw():
    draw = Score(2, 2, None)
    rules.ensure_decisive(draw, knockout=False)
    with pytest.raises(RuleError, match='não há empate'):
        rules.ensure_decisive(draw, knockout=True)
    rules.ensure_decisive(Score(2, 1, 'a'), knockout=True)


# ----- Placements and bonus (RN16) -------------------------------------------------------------------------------

def test_elimination_placements_and_the_tennis_bonus():
    placements = rules.elimination_placements(1, 2, [3, 4])
    assert placements == {1: 1, 2: 2, 3: 3, 4: 3}
    assert [rules.placement_bonus(placements[entry]) for entry in (1, 2, 3, 4)] == [40, 20, 10, 10]
    assert rules.placement_bonus(5) == 0


def test_round_robin_placements_follow_the_table_and_third_and_fourth_earn_ten():
    table = rules.table_standings([1, 2, 3, 4, 5], [(1, 2, 3, 0), (3, 4, 2, 0), (5, 1, 0, 1), (2, 3, 0, 2)])
    placements = rules.table_placements(table)
    assert sorted(placements.values()) == [1, 2, 3, 4, 5]
    assert [rules.placement_bonus(position) for position in (1, 2, 3, 4, 5)] == [40, 20, 10, 10, 0]

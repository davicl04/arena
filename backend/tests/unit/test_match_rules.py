"""Pure rules of matchmaking, matches and results (stage 3): deadlines, slots, buckets, scores and transitions."""
from datetime import datetime, timedelta, timezone

import pytest

from app.services import match_rules
from app.services.match_rules import (
    Candidate,
    RuleError,
    Score,
    TennisSet,
    TransitionError,
    bucket_key,
    bucket_lock_id,
    cancel_deadline,
    cancel_error,
    clean_court_name,
    counted_stat_fields,
    court_key,
    court_kind_for,
    effective_match_state,
    effective_search_state,
    expand_slots,
    match_phase,
    max_slots,
    next_match_state,
    next_search_state,
    next_stat_state,
    normalize_contested_fields,
    normalize_open_slots,
    offer_expires_at,
    other_side,
    pairing_rank,
    proposal_expires_at,
    rank_candidates,
    result_deadline,
    result_state,
    result_window_open,
    scores_agree,
    search_expires_at,
    slot_position_matches,
    slot_total,
    tennis_sets_from_json,
    validate_football_score,
    validate_stat,
    validate_tennis_sets,
    validate_terms_start,
    walkover_score,
)

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)


# ----- Deadlines ---------------------------------------------------------------------------------------------

def test_deadlines_of_search_proposal_offer_cancellation_and_result():
    assert search_expires_at(NOW) == NOW + timedelta(hours=24)
    assert proposal_expires_at(NOW) == NOW + timedelta(hours=2)
    starts = NOW + timedelta(days=3)
    assert offer_expires_at(NOW, starts) == NOW + timedelta(hours=2)
    # An offer never outlives the start of the match.
    assert offer_expires_at(NOW, NOW + timedelta(minutes=40)) == NOW + timedelta(minutes=40)
    assert cancel_deadline(starts) == starts - timedelta(hours=24)
    assert result_deadline(starts) == starts + timedelta(hours=48)


def test_result_window_opens_at_the_start_and_closes_after_48_hours():
    assert not result_window_open(None, NOW)
    assert not result_window_open(NOW + timedelta(seconds=1), NOW)
    assert result_window_open(NOW, NOW)
    assert result_window_open(NOW - timedelta(hours=47, minutes=59), NOW)
    assert not result_window_open(NOW - timedelta(hours=48), NOW)


def test_reads_show_lapsed_searches_and_proposals_as_expired():
    assert effective_search_state('ativa', NOW, NOW) == 'expirada'
    assert effective_search_state('ativa', NOW + timedelta(seconds=1), NOW) == 'ativa'
    assert effective_search_state('pareada', NOW - timedelta(hours=1), NOW) == 'pareada'
    assert effective_match_state('proposta', NOW, NOW) == 'expirada'
    assert effective_match_state('proposta', NOW + timedelta(minutes=1), NOW) == 'proposta'
    assert effective_match_state('agendada', None, NOW) == 'agendada'


def test_phase_of_the_status_card():
    starts = NOW - timedelta(hours=1)
    assert match_phase('proposta', now=NOW, proposal_expires_at_=NOW + timedelta(hours=1)) == 'proposta'
    assert match_phase('proposta', now=NOW, proposal_expires_at_=NOW) == 'expirada'
    assert match_phase('agendada', now=NOW, starts_at=NOW + timedelta(hours=1)) == 'agendada'
    assert match_phase('agendada', now=NOW, starts_at=starts) == 'informar_resultado'
    assert match_phase('agendada', now=NOW, starts_at=starts, reports_differ=True) == 'divergente'
    assert match_phase('agendada', now=NOW, starts_at=starts, walkover_absent_side='b') == 'wo_registrado'
    assert match_phase('agendada', now=NOW, starts_at=starts, walkover_absent_side='b',
                       walkover_contested=True) == 'wo_contestado'
    assert match_phase('realizada', now=NOW, starts_at=starts) == 'confirmado'
    assert {match_phase(state, now=NOW) for state in ('combinando', 'encerrada', 'sem_resultado', 'cancelada',
                                                      'recusada')} <= set(match_rules.MATCH_PHASES)


def test_cancellation_until_24_hours_before_the_start():
    starts = NOW + timedelta(days=2)
    assert cancel_error('combinando', None, NOW) is None
    assert cancel_error('agendada', starts, starts - timedelta(hours=24, seconds=1)) is None
    assert 'W.O.' in cancel_error('agendada', starts, starts - timedelta(hours=24))
    assert cancel_error('agendada', None, NOW) == 'Só partidas combinando ou agendadas podem ser canceladas.'
    assert cancel_error('encerrada', starts, NOW) == 'Só partidas combinando ou agendadas podem ser canceladas.'


@pytest.mark.parametrize(('starts', 'message'), [
    (datetime(2026, 10, 14, 16, 0), 'fuso'),
    (NOW, 'ainda não passaram'),
    (NOW - timedelta(days=1), 'ainda não passaram'),
    (NOW + timedelta(days=61), '60 dias'),
    (NOW + timedelta(days=1, minutes=10), '15 minutos'),
    (NOW + timedelta(days=1, seconds=30), '15 minutos'),
])
def test_proposed_start_is_future_on_quarter_hours_within_60_days(starts, message):
    with pytest.raises(RuleError, match=message) as error:
        validate_terms_start(starts, NOW)
    assert error.value.field == 'starts_at'


def test_valid_proposed_start_is_returned():
    starts = NOW + timedelta(days=5, minutes=45)
    assert validate_terms_start(starts, NOW) == starts


# ----- Slots -------------------------------------------------------------------------------------------------

def test_open_slots_fill_missing_positions_and_respect_the_format():
    assert normalize_open_slots('society', {'defesa': 1, 'atacante': 2}) == {
        'goleiro': 0, 'defesa': 1, 'meio_campo': 0, 'atacante': 2}
    assert normalize_open_slots('futsal', None) == {'goleiro': 0, 'defesa': 0, 'meio_campo': 0, 'atacante': 0}
    assert max_slots('futsal') == 4 and max_slots('society') == 6 and max_slots('campo') == 10
    # Up to size − 1: the team brings at least one athlete.
    assert slot_total(normalize_open_slots('campo', {'goleiro': 1, 'defesa': 4, 'meio_campo': 3, 'atacante': 2})) == 10


@pytest.mark.parametrize(('format_', 'slots', 'filled', 'message'), [
    ('society', {'goleiro': 2}, None, 'No máximo uma vaga de goleiro.'),
    ('society', {'goleiro': 1}, {'goleiro': 1}, 'No máximo uma vaga de goleiro.'),
    ('futsal', {'defesa': 3, 'atacante': 2}, None, 'No futsal cabem até 4 vagas para avulsos.'),
    ('society', {'defesa': 4}, {'atacante': 3}, 'No society cabem até 6 vagas para avulsos.'),
    ('society', {'ponta': 1}, None, 'Posição inválida nas vagas.'),
    ('society', {'defesa': -1}, None, 'números inteiros'),
    ('society', {'defesa': 1.5}, None, 'números inteiros'),
    ('society', {'defesa': True}, None, 'números inteiros'),
])
def test_open_slots_limits(format_, slots, filled, message):
    with pytest.raises(RuleError, match=message) as error:
        normalize_open_slots(format_, slots, filled=filled)
    assert error.value.field == 'open_slots'


def test_invalid_format_and_slot_helpers():
    with pytest.raises(RuleError, match='Formato inválido.'):
        max_slots('beach')
    assert expand_slots({'goleiro': 1, 'atacante': 2, 'defesa': 0}) == ['goleiro', 'atacante', 'atacante']
    assert expand_slots(None) == [] and slot_total(None) == 0
    assert slot_position_matches(None, 'goleiro') and slot_position_matches('defesa', 'defesa')
    assert not slot_position_matches('defesa', 'atacante')


# ----- Buckets and pairing order -----------------------------------------------------------------------------

def test_bucket_keys_and_lock_ids():
    assert bucket_key('time', 5300108, 'society') == 'futebol:time:5300108:society'
    assert bucket_key('tenis', 5300108) == 'tenis:5300108'
    # Walk-ins: one bucket per city, since "any position" and "any format" cross positions and formats.
    assert bucket_key('avulso', 5300108, None) == 'futebol:avulso:5300108'
    with pytest.raises(ValueError):
        bucket_key('time', 1, None)
    with pytest.raises(ValueError):
        bucket_key('corrida', 1)
    lock = bucket_lock_id('tenis:5300108')
    assert lock == bucket_lock_id('tenis:5300108') and -2 ** 63 <= lock < 2 ** 63
    assert lock != bucket_lock_id('tenis:3550308')


def test_pairing_rank_same_tier_then_neighbour_then_placement():
    assert pairing_rank('prata', 'prata') == 0 and pairing_rank(None, None) == 0
    assert pairing_rank('prata', 'ouro') == 1 and pairing_rank('prata', 'bronze') == 1
    assert pairing_rank('prata', None) == 2 and pairing_rank(None, 'diamante') == 2


def test_candidates_are_filtered_by_tier_and_ordered():
    early, late = NOW - timedelta(hours=5), NOW - timedelta(hours=1)
    candidates = [
        Candidate('diamante', 'prata', 'diamante', early, 1),     # two tiers apart: never paired
        Candidate('ouro-antigo', 'prata', 'ouro', early, 2),
        Candidate('sem-elo', 'prata', None, early, 3),
        Candidate('prata-recente', 'prata', 'prata', late, 4),
        Candidate('bronze-recente', 'prata', 'bronze', late, 5),
        Candidate('prata-antiga', 'prata', 'prata', early, 6),
    ]
    assert rank_candidates(candidates) == ['prata-antiga', 'prata-recente', 'ouro-antigo', 'bronze-recente',
                                           'sem-elo']
    # In placement, any level: the other placement first, then the oldest.
    assert rank_candidates([Candidate('lendario', None, 'lendario', early, 1),
                            Candidate('classificacao', None, None, late, 2)]) == ['classificacao', 'lendario']
    assert rank_candidates([]) == []


# ----- Courts ------------------------------------------------------------------------------------------------

def test_court_keys_ignore_accents_case_and_punctuation():
    assert court_key('  Arena  Sudoeste – Quadra 2 ') == 'arena sudoeste quadra 2'
    assert court_key('Ginásio do SESC') == court_key('ginasio do sesc')
    assert court_kind_for('futebol', 'society') == 'society' and court_kind_for('tenis', None) == 'tenis'
    with pytest.raises(ValueError):
        court_kind_for('futebol', None)
    assert clean_court_name('  Arena   Sudoeste ') == 'Arena Sudoeste'
    for bad in ('A', '--', 'x' * 81):
        with pytest.raises(RuleError, match='nome da quadra'):
            clean_court_name(bad)


# ----- Scores ------------------------------------------------------------------------------------------------

def test_football_scores():
    assert validate_football_score(3, 1) == Score(3, 1, 'a')
    assert validate_football_score(0, 2) == Score(0, 2, 'b')
    assert validate_football_score(2, 2) == Score(2, 2, None)
    for bad in ((-1, 0), (0, 100), (1.0, 0), (True, 0), ('2', 1), (None, 1)):
        with pytest.raises(RuleError, match='0 a 99'):
            validate_football_score(*bad)


def sets(*items):
    return [dict(zip(('a', 'b'), item[:2]), **({'tiebreak': {'a': item[2], 'b': item[3]}} if len(item) > 2 else {}))
            for item in items]


@pytest.mark.parametrize(('raw', 'super_tb', 'expected'), [
    (sets((6, 4), (6, 0)), False, (2, 0, 'a')),
    (sets((4, 6), (5, 7)), False, (0, 2, 'b')),
    (sets((7, 6, 7, 5), (3, 6), (7, 5)), False, (2, 1, 'a')),
    (sets((6, 7, 8, 10), (6, 2), (6, 7, 4, 7)), False, (1, 2, 'b')),
    (sets((6, 3), (2, 6), (10, 8)), True, (2, 1, 'a')),
    (sets((6, 3), (2, 6), (12, 14)), True, (1, 2, 'b')),
])
def test_valid_tennis_scores(raw, super_tb, expected):
    score = validate_tennis_sets(raw, super_tiebreak=super_tb)
    assert (score.score_a, score.score_b, score.winner) == expected
    assert len(score.sets) == len(raw)
    assert score.sets[-1].super_tiebreak is (super_tb and len(raw) == 3)
    # Stored as JSON and read back the same.
    assert tennis_sets_from_json(score.sets_json()) == score.sets


@pytest.mark.parametrize(('raw', 'super_tb', 'message'), [
    (sets((6, 4)), False, 'dois ou três sets'),
    (sets((6, 4), (6, 4), (6, 4), (6, 4)), False, 'dois ou três sets'),
    ('6-4 6-4', False, 'dois ou três sets'),
    ([{'a': 6, 'b': 4}, 'x'], False, 'games dos dois lados'),
    (sets((6, 5), (6, 4)), False, '6-0 a 6-4, 7-5 ou 7-6'),
    (sets((8, 6), (6, 4)), False, '0 a 7'),
    (sets((5, 3), (6, 4)), False, '6-0 a 6-4, 7-5 ou 7-6'),
    (sets((7, 6), (6, 4)), False, 'tie-break do 1º set'),
    (sets((7, 6, 5, 7), (6, 4)), False, 'quem venceu o set'),
    (sets((7, 6, 7, 6), (6, 4)), False, '2 de vantagem'),
    (sets((7, 6, 9, 6), (6, 4)), False, '2 de vantagem'),
    (sets((6, 4, 7, 5), (6, 4)), False, 'não teve tie-break'),
    (sets((6, 4), (3, 6)), False, 'informe o terceiro'),
    (sets((6, 4), (6, 3), (6, 1)), False, 'não há terceiro set'),
    (sets((6, 4), (3, 6), (10, 9)), True, 'super tie-break'),
    (sets((6, 4), (3, 6), (9, 7)), True, 'super tie-break'),
    (sets((6, 4), (3, 6), (13, 10)), True, 'super tie-break'),
    (sets((6, 4), (3, 6), (7, 6, 7, 3)), True, 'super tie-break'),
])
def test_invalid_tennis_scores(raw, super_tb, message):
    with pytest.raises(RuleError, match=message):
        validate_tennis_sets(raw, super_tiebreak=super_tb)


def test_walkover_scores_for_the_side_that_showed_up():
    football = walkover_score('futebol', 'b')
    assert (football.score_a, football.score_b, football.winner, football.sets) == (3, 0, 'a', None)
    assert walkover_score('futebol', 'a') == Score(0, 3, 'b')
    tennis = walkover_score('tenis', 'a')
    assert (tennis.score_a, tennis.score_b, tennis.winner) == (0, 2, 'b')
    assert [(item.a, item.b) for item in tennis.sets] == [(0, 6), (0, 6)]
    assert walkover_score('tenis', 'b').sets_json() == [
        {'a': 6, 'b': 0, 'tiebreak': None, 'super_tiebreak': False}] * 2
    with pytest.raises(ValueError):
        walkover_score('futebol', 'c')


def test_bilateral_confirmation_needs_the_same_score():
    three_one = validate_football_score(3, 1)
    assert scores_agree(three_one, validate_football_score(3, 1))
    assert not scores_agree(three_one, validate_football_score(1, 3)) and not scores_agree(three_one, None)
    assert result_state(None, None) == 'aguardando' and result_state(three_one, None) == 'aguardando'
    assert result_state(three_one, validate_football_score(3, 1)) == 'confirmado'
    assert result_state(three_one, validate_football_score(2, 1)) == 'divergente'
    # Tennis compares the sets too, not only who won.
    left = validate_tennis_sets(sets((6, 4), (6, 4)))
    right = validate_tennis_sets(sets((6, 4), (6, 3)))
    assert result_state(left, right) == 'divergente'
    assert other_side('a') == 'b' and other_side('b') == 'a'
    with pytest.raises(ValueError):
        other_side('x')


def test_tennis_set_json_keeps_the_tiebreak():
    item = TennisSet(7, 6, 7, 4)
    assert item.as_json() == {'a': 7, 'b': 6, 'tiebreak': {'a': 7, 'b': 4}, 'super_tiebreak': False}
    assert tennis_sets_from_json(None) is None


# ----- Transitions -------------------------------------------------------------------------------------------

def test_search_transitions():
    assert next_search_state('ativa', 'parear') == 'pareada'
    assert next_search_state('pareada', 'voltar_a_fila') == 'ativa'
    assert next_search_state('pareada', 'concluir') == 'concluida'
    assert next_search_state('pareada', 'sem_resposta') == 'sem_resposta'
    with pytest.raises(TransitionError, match='encontrou uma partida ou foi encerrada'):
        next_search_state('pareada', 'cancelar')
    with pytest.raises(TransitionError, match='não está mais na fila'):
        next_search_state('cancelada', 'parear')
    with pytest.raises(TransitionError, match='já foi encerrada'):
        next_search_state('expirada', 'expirar')


def test_match_transitions():
    assert next_match_state('proposta', 'aceitar_proposta') == 'combinando'
    assert next_match_state('combinando', 'agendar') == 'agendada'
    assert next_match_state('agendada', 'confirmar_resultado') == 'realizada'
    assert next_match_state('agendada', 'confirmar_wo') == 'encerrada'
    assert next_match_state('agendada', 'fechar_sem_resultado') == 'sem_resultado'
    assert next_match_state('realizada', 'encerrar') == 'encerrada'
    with pytest.raises(TransitionError, match='não está mais aberta'):
        next_match_state('expirada', 'aceitar_proposta')
    with pytest.raises(TransitionError, match='combinando ou agendadas'):
        next_match_state('realizada', 'cancelar')
    with pytest.raises(TransitionError, match='estado da partida'):
        next_match_state('cancelada', 'encerrar')


def test_stat_transitions_allow_one_contest():
    assert next_stat_state('enviada', 'revisar') == 'revisada'
    assert next_stat_state('revisada', 'editar') == 'enviada'
    assert next_stat_state('revisada', 'contestar') == 'contestada'
    assert next_stat_state('contestada', 'revisar') == 'revisada'
    assert next_stat_state('contestada', 'revisar', contested_before=True) == 'revisada'
    for action in ('editar', 'revisar'):
        with pytest.raises(TransitionError, match='a revisão é final'):
            next_stat_state('revisada', action, contested_before=True)
    with pytest.raises(TransitionError, match='já foi contestada'):
        next_stat_state('revisada', 'contestar', contested_before=True)
    with pytest.raises(TransitionError, match='representante do seu time revisa'):
        next_stat_state('contestada', 'editar')
    with pytest.raises(TransitionError, match='não pode mudar agora'):
        next_stat_state('contestada', 'enviar')


# ----- Stats -------------------------------------------------------------------------------------------------

def test_stats_are_optional_whole_numbers():
    assert validate_stat(None, 'goals') is None and validate_stat(0, 'goals') == 0 and validate_stat(50, 'goals') == 50
    for bad in (-1, 51, 2.5, True):
        with pytest.raises(RuleError, match='0 a 50'):
            validate_stat(bad, 'goals')
    assert normalize_contested_fields(['estatistica_posicao', 'gols', 'gols']) == ['gols', 'estatistica_posicao']
    for bad in ([], ['cartoes']):
        with pytest.raises(RuleError, match='itens contestados'):
            normalize_contested_fields(bad)


def test_only_reviewed_items_count_and_contested_items_wait_for_a_new_review():
    everything = frozenset(match_rules.STAT_FIELDS)
    assert counted_stat_fields('revisada') == everything
    assert counted_stat_fields('enviada') == frozenset() and counted_stat_fields(None) == frozenset()
    assert counted_stat_fields('contestada', ['gols'], reviewed=True) == everything - {'gols'}
    # Contested before any review: nothing was reviewed, so nothing counts yet.
    assert counted_stat_fields('contestada', ['gols'], reviewed=False) == frozenset()

"""Pure parts of the result services (stage 3, results and ranking front): score validation, banners, points
preview, ranking parameters and cursors, and the standings keys. Persistence is verified on PostgreSQL."""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.schemas.matches import ResultInput
from app.services import ranking_views
from app.services.match_rules import RuleError, validate_tennis_sets
from app.services.ranking_views import RankingParams, ranking_category
from app.services.results import (
    points_preview,
    score_text,
    stats_text,
    validate_score,
)
from app.services.standings import RankingKey, ranking_lock_id

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)


def football(**body):
    return validate_score(SimpleNamespace(sport='futebol', super_tiebreak=None), ResultInput(**body))


def tennis(super_tiebreak=False, **body):
    return validate_score(SimpleNamespace(sport='tenis', super_tiebreak=super_tiebreak), ResultInput(**body))


def test_football_scores_are_whole_goals_without_sets():
    score = football(goals_a=3, goals_b=3)
    assert (score.score_a, score.score_b, score.winner, score.sets) == (3, 3, None, None)
    assert football(goals_a=0, goals_b=1).winner == 'b'
    for body, field in (({'goals_a': 100, 'goals_b': 0}, 'goals_a'), ({'goals_a': 0}, 'goals_b'),
                        ({'sets': [{'a': 6, 'b': 0}, {'a': 6, 'b': 0}]}, 'sets')):
        with pytest.raises(RuleError) as error:
            football(**body)
        assert error.value.field == field


def test_tennis_scores_are_sets_and_the_super_tiebreak_only_when_agreed():
    won = tennis(sets=[{'a': 6, 'b': 4}, {'a': 4, 'b': 6}, {'a': 10, 'b': 8}], super_tiebreak=True)
    assert (won.score_a, won.score_b, won.winner) == (2, 1, 'a') and won.sets[2].super_tiebreak
    for body in ({}, {'goals_a': 6, 'goals_b': 4}):
        with pytest.raises(RuleError) as error:
            tennis(**body)
        assert error.value.field == 'sets'
    with pytest.raises(RuleError) as error:
        tennis(sets=[{'a': 6, 'b': 4}, {'a': 4, 'b': 6}, {'a': 10, 'b': 8}])
    assert error.value.field == 'sets.3'


def test_banners_show_the_score_from_the_winners_point_of_view():
    assert score_text('futebol', 'Ferrugem FC', 'Tigres', football(goals_a=2, goals_b=1)) == (
        'Resultado confirmado: Ferrugem FC 2 × 1 Tigres.')
    score = validate_tennis_sets([{'a': 6, 'b': 7, 'tiebreak': {'a': 4, 'b': 7}}, {'a': 6, 'b': 3},
                                  {'a': 8, 'b': 10}], super_tiebreak=True)
    assert score.winner == 'b'
    assert score_text('tenis', 'Ana', 'Bia', score) == (
        'Resultado confirmado: Bia venceu Ana por 2 sets a 1 (7-6(4), 3-6, 10-8).')
    straight = validate_tennis_sets([{'a': 6, 'b': 0}, {'a': 6, 'b': 1}])
    assert score_text('tenis', 'Ana', 'Bia', straight) == (
        'Resultado confirmado: Ana venceu Bia por 2 sets a 0 (6-0, 6-1).')


def test_stats_banner_counts_what_was_sent():
    assert stats_text('Tiago', 'atacante', 2, None, 4) == 'Tiago enviou: 2 gols, 4 finalizações no alvo (ATA).'
    assert stats_text('Bia', 'goleiro', 1, 1, 1) == 'Bia enviou: 1 gol, 1 assistência, 1 defesa (GOL).'
    assert stats_text('Caio', 'meio_campo', 0, 3, 2) == (
        'Caio enviou: 0 gols, 3 assistências, 2 passes decisivos (MEI).')
    assert stats_text('Davi', 'defesa', None, None, 5) == 'Davi enviou: 5 desarmes (DEF).'
    assert stats_text('Eva', 'defesa', None, None, None) == 'Eva confirmou presença como defesa (DEF).'


def stat(state, goals=None, assists=None, position_stat=None, contested=None, reviewed=False):
    return SimpleNamespace(state=state, goals=goals, assists=assists, position_stat=position_stat,
                           contested_fields=contested, reviewed_at=NOW if reviewed else None)


def test_points_preview_adds_what_was_sent_and_lists_what_already_scores():
    sent = points_preview(outcome='vitoria', stat=stat('enviada', 2, 1, 4), final=False)
    assert (sent.presence, sent.result, sent.goals, sent.assists, sent.position_stat, sent.total) == (
        1.0, 3.0, 2.0, 1.0, 2.0, 9.0)
    assert sent.counted == [] and sent.final is False
    reviewed = points_preview(outcome='empate', stat=stat('revisada', 1, None, 20, reviewed=True), final=True)
    assert (reviewed.result, reviewed.goals, reviewed.position_stat, reviewed.total) == (1.0, 1.0, 4.0, 7.0)
    assert reviewed.counted == ['gols', 'assistencias', 'estatistica_posicao'] and reviewed.final is True
    contested = points_preview(outcome=None, stat=stat('contestada', 2, 1, 0, ['gols'], reviewed=True), final=False)
    assert (contested.result, contested.total, contested.counted) == (
        None, 4.0, ['assistencias', 'estatistica_posicao'])
    # Contested before any review: nothing scores until the representative reviews.
    assert points_preview(outcome='vitoria', stat=stat('contestada', 2, contested=['gols']), final=False).counted == []
    bare = points_preview(outcome='derrota', stat=None, final=False)
    assert (bare.presence, bare.result, bare.total, bare.counted) == (1.0, 0.0, 1.0, [])


def test_ranking_categories_need_the_format_position_or_distance():
    assert ranking_category(RankingParams('futebol', 'time', 'society')) == ('futebol_time', 'society', None, None)
    assert ranking_category(RankingParams('futebol', 'individual', 'campo', 'goleiro')) == (
        'futebol_individual', 'campo', 'goleiro', None)
    assert ranking_category(RankingParams('tenis', 'time', 'society', 'goleiro')) == ('tenis', None, None, None)
    assert ranking_category(RankingParams('corrida', distance_km=21)) == ('corrida_21', None, None, 21)
    for params, message in (
        (RankingParams('futebol'), 'Escolha se o ranking é de times ou individual.'),
        (RankingParams('futebol', 'time'), 'Escolha o formato.'),
        (RankingParams('futebol', 'time', 'salao'), 'Escolha o formato.'),
        (RankingParams('futebol', 'individual', 'campo'), 'Escolha a posição.'),
        (RankingParams('corrida'), 'Escolha a distância.'),
        (RankingParams('corrida', distance_km=8), 'Distância inválida.'),
    ):
        with pytest.raises(HTTPException) as error:
            ranking_category(params)
        assert (error.value.status_code, error.value.detail) == (422, message)


def test_the_cursor_is_an_opaque_position():
    assert ranking_views._decode_position(None) == 0 and ranking_views._decode_position('') == 0
    assert ranking_views._decode_position(ranking_views._encode_position(41)) == 41
    assert '=' not in ranking_views._encode_position(7)
    for cursor in ('%%', 'MA', 'abc', 'LTE'):
        with pytest.raises(HTTPException) as error:
            ranking_views._decode_position(cursor)
        assert (error.value.status_code, error.value.detail) == (422, 'Cursor de paginação inválido.')


def test_standings_keys_order_and_labels():
    keys = [RankingKey('tenis'), RankingKey('futebol_individual', 'society', 'atacante'),
            RankingKey('futebol_time', 'society'), RankingKey('futebol_time', 'campo')]
    ordered = sorted(keys, key=lambda key: key.sort_key)
    assert [key.label for key in ordered] == [
        'futebol_time:campo', 'futebol_time:society', 'futebol_individual:society:atacante', 'tenis']
    assert [key.sport for key in ordered] == ['futebol', 'futebol', 'futebol', 'tenis']
    assert len({ranking_lock_id(key) for key in keys}) == 4

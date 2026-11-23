"""Simulação de calibragem da média ajustada do futebol · individual (decisão docs/decisoes/0006-ranking-por-rating.md).

Gera uma população sintética e determinística (semente fixa) de atletas por posição, sorteia as atuações com as
regras reais de pontos por atuação (RN12, `scoring.individual_points`) e compara a distribuição por elo:

- versão 1: média simples com os cortes 2,5 / 4,0 / 5,5;
- média ajustada (`m = 5`, `μ = 3,0`) com os cortes da versão 1 mantidos;
- média ajustada com os cortes revisados.

Os cortes revisados são escolhidos aqui: em cada fronteira, o valor da grade de 0,1 cuja parcela de atletas acima
dele, com a média ajustada e 30 partidas, fica mais próxima da parcela acima do corte da versão 1 com a média simples
e as mesmas 30 partidas. Assim, quem já tem uma amostra estável mantém o elo que a versão 1 pretendia, e só as
amostras pequenas são amortecidas. A população é uma suposição (não há dados reais de partidas em volume): o script
documenta a distribuição e não é gate de CI. A Lendário depende da posição e não entra aqui (conta como Diamante).

Execução, em `backend/`:

    .venv/bin/python scripts/simular_media_ajustada.py
"""
from __future__ import annotations

import math
import random
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.rankings import Cuts, base_tier  # noqa: E402
from app.services.scoring import adjusted_mean, individual_points  # noqa: E402

SEED = 20261122
ATHLETES_PER_POSITION = 500
SAMPLES = (3, 5, 10, 20, 30)
REFERENCE_SAMPLE = 30
PRIOR_MATCHES = Decimal(5)
PRIOR_MEAN = Decimal('3.0')
V1_CUTS = (Decimal('2.5'), Decimal('4.0'), Decimal('5.5'))
GRID = Decimal('0.1')
TIERS = ('bronze', 'prata', 'ouro', 'diamante')
# Probability that the stats of an appearance were reviewed and score (RN10); otherwise only presence and result.
COUNTED_SHARE = 0.8
DRAW_SHARE = 0.20
# Per position: expected goals, assists and occurrences of the position stat per appearance of an average athlete.
POSITION_RATES = {
    'goleiro': (0.02, 0.05, 3.0),
    'defesa': (0.10, 0.15, 2.0),
    'meio_campo': (0.25, 0.35, 1.5),
    'atacante': (0.60, 0.30, 1.0),
}


def poisson(rng: random.Random, rate: float) -> int:
    """Knuth's sampler: deterministic for a given seed, enough for small rates."""
    limit, count, product = math.exp(-rate), 0, rng.random()
    while product > limit:
        count += 1
        product *= rng.random()
    return count


def appearance(rng: random.Random, skill: float, rates: tuple[float, float, float]) -> Decimal:
    """RN12 points of one appearance. The skill moves the win share (the team result) a little and the individual
    contributions more."""
    win = min(max(0.40 + 0.10 * skill, 0.05), 0.75)
    draw_or_win = rng.random()
    outcome = 'vitoria' if draw_or_win < win else 'empate' if draw_or_win < win + DRAW_SHARE else 'derrota'
    goals_rate, assists_rate, stat_rate = rates
    boost = math.exp(0.4 * skill)
    goals, assists, stat = (poisson(rng, goals_rate * boost), poisson(rng, assists_rate * boost),
                            poisson(rng, stat_rate * math.exp(0.3 * skill)))
    counted = ('gols', 'assistencias', 'estatistica_posicao') if rng.random() < COUNTED_SHARE else ()
    return individual_points(outcome=outcome, goals=goals, assists=assists, position_stat=stat,
                             counted=counted).total


def population() -> list[list[Decimal]]:
    """Per athlete, the points of the first 30 appearances in one position (a sample of n matches is the prefix)."""
    rng = random.Random(SEED)
    athletes = []
    for rates in POSITION_RATES.values():
        for _ in range(ATHLETES_PER_POSITION):
            skill = rng.gauss(0, 1)
            athletes.append([appearance(rng, skill, rates) for _ in range(max(SAMPLES))])
    return athletes


def cuts(values: tuple[Decimal, Decimal, Decimal], *, adjusted: bool) -> Cuts:
    prata, ouro, diamante = values
    return Cuts('futebol_individual', 'media', 'maior', prata, ouro, diamante, 3, Decimal('0.15'), 52,
                prior_matches=PRIOR_MATCHES if adjusted else None, prior_mean=PRIOR_MEAN if adjusted else None)


def metrics(athletes: list[list[Decimal]], sample: int, cut: Cuts) -> list[Decimal]:
    return [adjusted_mean(sum(points[:sample], Decimal(0)), sample, cut.prior_matches, cut.prior_mean)
            for points in athletes]


def share_at_least(values: list[Decimal], cut: Decimal) -> float:
    return sum(value >= cut for value in values) / len(values)


def distribution(values: list[Decimal], cut: Cuts) -> dict[str, float]:
    tiers = [base_tier(value, cut) for value in values]
    return {tier: tiers.count(tier) / len(tiers) for tier in TIERS}


def revised_cuts(athletes: list[list[Decimal]]) -> tuple[Decimal, Decimal, Decimal]:
    """Each v1 cut mapped to the 0.1 grid value whose share above it, with the adjusted mean and 30 matches, is the
    closest to the share above the v1 cut with the plain mean and the same 30 matches (ties: the lower value)."""
    plain = metrics(athletes, REFERENCE_SAMPLE, cuts(V1_CUTS, adjusted=False))
    adjusted = metrics(athletes, REFERENCE_SAMPLE, cuts(V1_CUTS, adjusted=True))
    grid = [GRID * step for step in range(0, 101)]
    chosen = []
    for cut in V1_CUTS:
        target = share_at_least(plain, cut)
        chosen.append(min(grid, key=lambda value: (abs(share_at_least(adjusted, value) - target), value)))
    return tuple(chosen)


def matches_to_diamante(mean: Decimal, diamante: Decimal, *, limit: int = 200) -> int | None:
    """Fewest matches at a constant real mean that reach Diamante with the adjusted mean (None beyond `limit`)."""
    for matches in range(1, limit + 1):
        if adjusted_mean(mean * matches, matches, PRIOR_MATCHES, PRIOR_MEAN) >= diamante:
            return matches
    return None


def percent(value: float) -> str:
    return f'{value * 100:.1f}'.replace('.', ',') + '%'


def decimal_text(value: Decimal) -> str:
    return f'{value:.1f}'.replace('.', ',')


def main() -> None:
    athletes = population()
    revised = revised_cuts(athletes)
    every_point = [point for points in athletes for point in points]
    print(f'População: {len(athletes)} atletas ({ATHLETES_PER_POSITION} por posição), semente {SEED}.')
    print(f'Média real das atuações: {decimal_text(sum(every_point) / len(every_point))} pontos '
          f'({len(every_point)} atuações).')
    print(f'Cortes revisados (Prata/Ouro/Diamante): {" / ".join(decimal_text(value) for value in revised)}.')
    print()
    scenarios = (('Versão 1 (média simples, 2,5/4,0/5,5)', cuts(V1_CUTS, adjusted=False)),
                 ('Média ajustada, cortes da versão 1', cuts(V1_CUTS, adjusted=True)),
                 ('Média ajustada, cortes revisados', cuts(revised, adjusted=True)))
    print('| Cenário | Partidas | Bronze | Prata | Ouro | Diamante |')
    print('| --- | --- | --- | --- | --- | --- |')
    for label, cut in scenarios:
        for sample in SAMPLES:
            shares = distribution(metrics(athletes, sample, cut), cut)
            print(f'| {label} | {sample} | ' + ' | '.join(percent(shares[tier]) for tier in TIERS) + ' |')
    print()
    print('| Média real constante | Partidas até Diamante (cortes da versão 1) | Partidas até Diamante (revisados) |')
    print('| --- | --- | --- |')
    for mean in (Decimal(6), Decimal(7), Decimal(8), Decimal(9)):
        kept, chosen = matches_to_diamante(mean, V1_CUTS[2]), matches_to_diamante(mean, revised[2])
        print(f'| {decimal_text(mean)} | {kept or "mais de 200"} | {chosen or "mais de 200"} |')


if __name__ == '__main__':
    main()

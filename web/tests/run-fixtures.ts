import type { Run, RunBest, RunCreated, RunImpact, RunOrigin, RunPreview, RunRace } from '../src/api/runs'
import type { RunDistance } from '../src/data/arena'

/*
 * Corrida (etapa 5): respostas de `/me/runs`, `/me/run-bests` e `/me/run-races` no formato do contrato
 * (docs/decisoes/0002-jogar.md, seção 18.2), para os testes do cronômetro (K2), das marcas (K4) e da placa.
 */

export const treino: RunOrigin = { source: 'treino', label: 'Treino', event_id: null }
export const lago: RunOrigin = { source: 'prova', label: 'Corrida do Lago', event_id: 9 }

export const sec = (text: string) => text.split(':').reduce((total, part) => total * 60 + Number(part), 0)

export const impact = (overrides: Partial<RunImpact> = {}): RunImpact => ({
  kind: 'primeira_marca', previous_best_s: null, delta_s: null, tier_before: null, tier_after: 'ouro', tier_up: false, ...overrides,
})

export const preview = (overrides: Partial<RunPreview> = {}): RunPreview => ({
  distance_m: 5000, duration_s: sec('24:12'), pace_s_per_km: 290, date: '2026-10-12', standard_distance_km: 5, origin: treino,
  impact: impact(), ...overrides,
})

export const run = (overrides: Partial<Run> = {}): Run => ({
  id: 1, distance_m: 5000, standard_distance_km: 5, duration_s: sec('24:12'), pace_s_per_km: 290, date: '2026-10-12', origin: treino,
  counts_for_ranking: true, created_at: '2026-10-12T12:00:00Z', ...overrides,
})

/** Cartão sem marca. */
export const emptyCard = (distance_km: RunDistance): RunBest => ({ distance_km, state: 'sem_marca', tier: null, rank_position: null, best: null, marks: 0, series: [] })

/** Cartão ranqueado com a melhor marca e a série (da mais antiga à mais nova). */
export function markCard(distance_km: RunDistance, series: string[], overrides: Partial<RunBest> = {}): RunBest {
  const times = series.map(sec)
  const best = Math.min(...times)
  const day = (index: number) => `2026-10-${String(index + 1).padStart(2, '0')}`
  return {
    distance_km, state: 'ranqueado', tier: 'ouro', rank_position: 3, marks: times.length,
    best: { id: 10 + distance_km, distance_m: distance_km * 1000, duration_s: best, pace_s_per_km: Math.round(best / distance_km), date: day(times.indexOf(best)), origin: treino },
    series: times.map((duration_s, index) => ({ id: 100 + index, date: day(index), duration_s })),
    ...overrides,
  }
}

/** Os cinco cartões, vazios, com `cards` no lugar dos que têm marca. */
export const bests = (...cards: RunBest[]): { items: RunBest[] } => ({
  items: ([3, 5, 10, 21, 42] as const).map(km => cards.find(card => card.distance_km === km) ?? emptyCard(km)),
})

export const created = (overrides: Partial<RunCreated> = {}): RunCreated => ({ run: run(), impact: impact(), best: markCard(5, ['24:12']), ...overrides })

export const lagoRace = (overrides: Partial<RunRace> = {}): RunRace => ({
  entry_id: 31, event_id: 9, event_name: 'Corrida do Lago', distance_km: 10, starts_at: '2026-10-08T10:00:00Z', date: '2026-10-08', ...overrides,
})

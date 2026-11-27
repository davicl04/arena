import type { ShareCategory, ShareMatch, ShareRun } from '../../src/api/share'
import { teamSides, tennisSides } from './timeline'

/* Dados do adesivo no formato do contrato (docs/decisoes/0007-compartilhamento-stories.md); os números são de teste. */

export function shareCategory(overrides: Partial<ShareCategory> = {}): ShareCategory {
  return { ranking: 'futebol_time', state: 'ranqueado', tier: 'prata', tier_position: 3, tier_size: 9, played: 5, required: 3, progress: 0.42, next_tier: 'ouro', gap: { amount: 70.161, unit: 'rating' }, ...overrides }
}

export const placementCategory = (overrides: Partial<ShareCategory> = {}): ShareCategory =>
  shareCategory({ state: 'classificacao', tier: null, tier_position: null, tier_size: null, played: 2, required: 3, progress: 0.6667, next_tier: null, gap: null, ...overrides })

export function shareMatch(overrides: Partial<ShareMatch> = {}): ShareMatch {
  return {
    id: 100, sport: 'futebol', format: 'society', origin: 'amistoso', event: null, round_label: null, occurred_at: '2026-10-10T19:00:00Z',
    sides: teamSides(), owner_side: 'a', score: { a: 3, b: 1, sets: null, winner: 'a' }, outcome: 'vitoria', walkover_absent_side: null, points: 3,
    stats: { position: 'atacante', goals: 1, assists: 1, position_stat: null }, category: shareCategory(), ...overrides,
  }
}

export const shareTennis = (overrides: Partial<ShareMatch> = {}): ShareMatch => shareMatch({
  sport: 'tenis', format: null, sides: tennisSides, points: 10, stats: null,
  score: { a: 2, b: 0, sets: [{ a: 6, b: 4, tiebreak: null, super_tiebreak: false }, { a: 7, b: 6, tiebreak: { a: 7, b: 5 }, super_tiebreak: false }], winner: 'a' },
  category: shareCategory({ ranking: 'tenis' }), ...overrides,
})

export function shareRun(overrides: Partial<ShareRun> = {}): ShareRun {
  return {
    id: 7, occurred_at: '2026-10-05T03:00:00Z', date: '2026-10-05', distance_m: 5020, standard_distance_km: 5, duration_s: 1574, pace_s_per_km: 314,
    previous_best_s: 1623, mark_kind: 'novo_melhor', origin: { source: 'treino', label: 'Treino', event_id: null },
    category: shareCategory({ ranking: 'corrida_5', required: 1, played: 3, progress: 0.5, gap: { amount: 240, unit: 'segundos' } }), ...overrides,
  }
}

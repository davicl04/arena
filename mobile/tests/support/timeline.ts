import type { TimelineMatch, TimelineMatchSide, TimelineRun } from '../../src/api/profile'

/* Registros da linha do tempo do perfil no formato do contrato (docs/plano-perfil-partidas.md). */

export const ferrugem = { id: 10, name: 'Ferrugem FC', initials: 'FF', crest_url: null }
export const leoes = { id: 20, name: 'Leões do Cerrado', initials: 'LC', crest_url: null }

export const teamSides = (ownerSide: 'a' | 'b' = 'a'): TimelineMatchSide[] => [
  { side: 'a', kind: 'time', team: ferrugem, athlete: null, is_owner: ownerSide === 'a' },
  { side: 'b', kind: 'time', team: leoes, athlete: null, is_owner: ownerSide === 'b' },
]
export const tennisSides: TimelineMatchSide[] = [
  { side: 'a', kind: 'atleta', team: null, athlete: { id: 1, name: 'Eu Mesmo', username: 'eu.atleta', avatar_url: null }, is_owner: true },
  { side: 'b', kind: 'atleta', team: null, athlete: { id: 9, name: 'Bia Costa', username: 'bia', avatar_url: null }, is_owner: false },
]

export function timelineMatch(overrides: Partial<TimelineMatch> = {}): TimelineMatch {
  return {
    kind: 'partida', id: 100, sport: 'futebol', format: 'society', origin: 'amistoso', state: 'encerrada', occurred_at: '2026-10-10T19:00:00Z',
    sides: teamSides(), owner_side: 'a', score: { a: 3, b: 1, sets: null, winner: 'a' }, outcome: 'vitoria', walkover_absent_side: null, points: 3,
    stats: null, event: null, round_label: null, court: { name: 'Arena Sudoeste' }, ...overrides,
  }
}

export function timelineRun(overrides: Partial<TimelineRun> = {}): TimelineRun {
  return {
    kind: 'corrida', id: 7, occurred_at: '2026-10-05T00:00:00Z', date: '2026-10-05', distance_m: 5000, standard_distance_km: 5, duration_s: 1512, pace_s_per_km: 302,
    origin: { source: 'treino', label: 'Treino', event_id: null }, previous_best_s: 1560, mark_kind: 'novo_melhor', ...overrides,
  }
}

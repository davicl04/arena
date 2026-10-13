import type { ProfileStats, TimelineMatch, TimelineRun, TimelineSide } from '../src/api/profile'

/*
 * Registros da linha do tempo do perfil (formato de GET /users/{id}/timeline) e das estatísticas do perfil
 * (GET /me/profile-stats), conforme docs/plano-perfil-partidas.md. O titular joga pelo Ferrugem FC (lado A).
 */

export const teamSide = (side: 'a' | 'b', id: number, name: string, initials: string, owner = false): TimelineSide => ({
  side, kind: 'time', team: { id, name, initials, crest_url: null }, athlete: null, is_owner: owner,
})
export const athleteSide = (side: 'a' | 'b', id: number, name: string, owner = false): TimelineSide => ({
  side, kind: 'atleta', team: null, athlete: { id, name, username: name.toLowerCase().replace(/\s/g, '.'), avatar_url: null }, is_owner: owner,
})

export const ferrugem = (owner = true) => teamSide('a', 10, 'Ferrugem FC', 'FF', owner)
export const leoes = () => teamSide('b', 20, 'Leões do Cerrado', 'LC')

export function match(overrides: Partial<TimelineMatch> = {}): TimelineMatch {
  return {
    kind: 'partida', id: 50, sport: 'futebol', format: 'society', origin: 'amistoso', state: 'encerrada',
    occurred_at: '2026-10-10T19:00:00Z', sides: [ferrugem(), leoes()], owner_side: 'a',
    score: { a: 3, b: 1, sets: null, winner: 'a' }, outcome: 'vitoria', walkover_absent_side: null, points: 3,
    stats: null, event: null, round_label: null, court: null, ...overrides,
  }
}

export function run(overrides: Partial<TimelineRun> = {}): TimelineRun {
  return {
    kind: 'corrida', id: 7, occurred_at: '2026-10-05T00:00:00Z', date: '2026-10-05', distance_m: 5000, standard_distance_km: 5,
    duration_s: 1452, pace_s_per_km: 290, origin: { source: 'treino', label: 'Treino', event_id: null },
    previous_best_s: 1500, mark_kind: 'novo_melhor', ...overrides,
  }
}

export const tennisMatch = (overrides: Partial<TimelineMatch> = {}) => match({
  id: 51, sport: 'tenis', format: null, sides: [athleteSide('a', 1, 'Ricardo Moura', true), athleteSide('b', 2, 'Caio Ramos')],
  score: { a: 2, b: 1, winner: 'a', sets: [
    { a: 6, b: 4, tiebreak: null, super_tiebreak: false },
    { a: 3, b: 6, tiebreak: null, super_tiebreak: false },
    { a: 7, b: 6, tiebreak: { a: 7, b: 5 }, super_tiebreak: false },
  ] },
  points: 10, ...overrides,
})

export const stats = (overrides: Partial<ProfileStats> = {}): ProfileStats => ({
  played: 8, wins: 5, draws: 1, losses: 2, win_rate: 62.5, best_tier: 'ouro', in_placement: false, ...overrides,
})

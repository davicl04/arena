import { vi } from 'vitest'
import type { ShareCategory, ShareMatch, ShareRun } from '../src/api/share'
import { athleteSide, ferrugem, leoes } from './timeline-fixtures'

/*
 * Respostas de GET /me/share/matches/{id} e /me/share/runs/{id} (docs/decisoes/0007-compartilhamento-stories.md) e um
 * contexto de Canvas falso para os testes do desenho. Os números são de teste, não de uma conta.
 */

export const ranked = (overrides: Partial<ShareCategory> = {}): ShareCategory => ({
  ranking: 'futebol_time', state: 'ranqueado', tier: 'prata', tier_position: 3, tier_size: 8, played: 5, required: 3,
  progress: 0.42, next_tier: 'ouro', gap: { amount: 70.161, unit: 'rating' }, ...overrides,
})

export const placement = (overrides: Partial<ShareCategory> = {}): ShareCategory => ({
  ranking: 'tenis', state: 'classificacao', tier: null, tier_position: null, tier_size: null, played: 2, required: 3,
  progress: 0.6667, next_tier: null, gap: null, ...overrides,
})

export function shareMatch(overrides: Partial<ShareMatch> = {}): ShareMatch {
  return {
    id: 50, sport: 'futebol', format: 'society', origin: 'amistoso', event: null, round_label: null,
    occurred_at: '2026-10-10T19:00:00Z', sides: [ferrugem(), leoes()], owner_side: 'a',
    score: { a: 3, b: 1, sets: null, winner: 'a' }, outcome: 'vitoria', walkover_absent_side: null, points: 3,
    stats: { position: 'atacante', goals: 1, assists: 1, position_stat: 2 }, category: ranked(), ...overrides,
  }
}

export const shareTennis = (overrides: Partial<ShareMatch> = {}) => shareMatch({
  id: 51, sport: 'tenis', format: null, sides: [athleteSide('a', 1, 'Ricardo Moura', true), athleteSide('b', 2, 'Caio Ramos')],
  score: { a: 2, b: 1, winner: 'a', sets: [
    { a: 6, b: 4, tiebreak: null, super_tiebreak: false },
    { a: 3, b: 6, tiebreak: null, super_tiebreak: false },
    { a: 7, b: 6, tiebreak: { a: 7, b: 5 }, super_tiebreak: false },
  ] },
  points: 10, stats: null, category: ranked({ ranking: 'tenis' }), ...overrides,
})

export function shareRun(overrides: Partial<ShareRun> = {}): ShareRun {
  return {
    id: 7, occurred_at: '2026-10-05T00:00:00-03:00', date: '2026-10-05', distance_m: 5020, standard_distance_km: 5,
    duration_s: 1574, pace_s_per_km: 314, previous_best_s: 1623, mark_kind: 'novo_melhor',
    origin: { source: 'treino', label: 'Treino', event_id: null },
    category: ranked({ ranking: 'corrida_5', gap: { amount: 240, unit: 'segundos' } }), ...overrides,
  }
}

/** Contexto 2D falso: registra as chamadas e mede o texto pelo número de letras e pelo tamanho da fonte. */
export function fakeContext() {
  const texts: { text: string; x: number; y: number; font: string }[] = []
  const ctx = {
    font: '10px sans-serif', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: 'left', textBaseline: 'alphabetic',
    letterSpacing: '0px', shadowColor: '', shadowBlur: 0, shadowOffsetY: 0, imageSmoothingEnabled: true, imageSmoothingQuality: 'low',
    drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
    arcTo: vi.fn(), arc: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(), translate: vi.fn(), scale: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * (Number(/([\d.]+)px/.exec(ctx.font)?.[1]) || 10) * 0.55 })),
    fillText: vi.fn((text: string, x: number, y: number) => { texts.push({ text, x, y, font: ctx.font }) }),
  }
  return { ctx, texts }
}

/** `Path2D` não existe no jsdom: um substituto que guarda o caminho. */
export class FakePath2D {
  d: string | undefined
  constructor(d?: string) { this.d = d }
}

export const coliseumSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 146" fill="currentColor"><path fill-rule="evenodd" d="M0 0L10 10Z"/><path d="M5 5L6 6Z"/></svg>'

/** Bitmap falso de `createImageBitmap` (o jsdom não decodifica imagens). */
export const fakeBitmap = (width: number, height: number) => ({ width, height, close: vi.fn() })

/** Arquivo de foto escolhido pela pessoa. */
export const photoFile = (name = 'foto.jpg', type = 'image/jpeg') => new File(['foto'], name, { type })

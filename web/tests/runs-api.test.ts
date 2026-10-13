import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRun, deleteRun, getRunBests, getRunRaces, previewRun, runsPath } from '../src/api/runs'
import { MAX_DURATION_S, MAX_DISTANCE_M, MIN_DISTANCE_M, distanceLabel, formatKm, formatPace, formatRunDate, fromSeconds, impactView, originInline, originLabel, paceOf, standardMeters, toSeconds } from '../src/components/play/runView'
import { formatMetric, isRunRanking, metricText, metricUnit } from '../src/components/ranking/metric'
import { mockApi, reply } from './teams-fixtures'
import { impact, lago, treino } from './run-fixtures'

/* Cliente e textos da corrida (contrato 0002, seção 18), sem tela. */

afterEach(() => { vi.unstubAllGlobals() })

describe('cliente da corrida', () => {
  it('usa as rotas do contrato, com JSON nas ações e DELETE sem corpo', async () => {
    const api = mockApi({
      'POST /me/runs/preview': { ok: 'preview' },
      'POST /me/runs': reply(201, { ok: 'created' }),
      'DELETE /me/runs/7': undefined,
      'GET /me/run-bests': { items: [] },
      'GET /me/run-races': { items: [] },
    })
    const input = { distance_m: 10_150, duration_s: 3000, source: 'prova' as const, entry_id: 4 }
    await previewRun(input)
    await createRun({ distance_m: 5000, duration_s: 1500, source: 'treino', date: '2026-10-09' })
    await deleteRun(7)
    await getRunBests()
    await getRunRaces()
    expect(api.calls).toEqual([
      { method: 'POST', path: '/me/runs/preview', body: input },
      { method: 'POST', path: '/me/runs', body: { distance_m: 5000, duration_s: 1500, source: 'treino', date: '2026-10-09' } },
      { method: 'DELETE', path: '/me/runs/7', body: undefined },
      { method: 'GET', path: '/me/run-bests', body: undefined },
      { method: 'GET', path: '/me/run-races', body: undefined },
    ])
  })

  it('o histórico filtra por distância padrão ou "outra" e a página vai de 20 em 20', () => {
    expect(runsPath('5')).toBe('/me/runs?distance=5&limit=20')
    expect(runsPath('outra', 50)).toBe('/me/runs?distance=outra&limit=50')
  })
})

describe('medidas e ritmo', () => {
  it('as distâncias da régua são as oficiais, todas dentro de ±2% da padrão', () => {
    expect(standardMeters).toEqual({ 3: 3000, 5: 5000, 10: 10_000, 21: 21_097, 42: 42_195 })
    for (const [km, meters] of Object.entries(standardMeters)) expect(Math.abs(meters - Number(km) * 1000) * 50).toBeLessThanOrEqual(Number(km) * 1000)
    expect([MIN_DISTANCE_M, MAX_DISTANCE_M, MAX_DURATION_S]).toEqual([1000, 100_000, 86_400])
    expect(distanceLabel(21)).toBe('21 km')
  })

  it('o ritmo arredonda para cima na metade, como o servidor', () => {
    expect(paceOf(1452, 5000)).toBe(290) // 290,4
    expect(paceOf(1500, 5000)).toBe(300)
    expect(paceOf(1503, 5000)).toBe(301) // 300,6
    expect(paceOf(1, 3000)).toBe(0)
    expect(paceOf(0, 5000)).toBeNull()
    expect(paceOf(1500, 0)).toBeNull()
    expect(formatPace(302)).toBe('5:02/km')
    expect(formatPace(65)).toBe('1:05/km')
  })

  it('h : min : s ⇄ segundos, limitado a 0 e 24 h', () => {
    expect(toSeconds({ h: 1, m: 2, s: 3 })).toBe(3723)
    expect(fromSeconds(3723)).toEqual({ h: 1, m: 2, s: 3 })
    expect(fromSeconds(-5)).toEqual({ h: 0, m: 0, s: 0 })
    expect(fromSeconds(200_000)).toEqual({ h: 24, m: 0, s: 0 })
  })

  it('formata a distância em km, a data da marca e a origem', () => {
    expect(formatKm(5000)).toBe('5 km')
    expect(formatKm(7500)).toBe('7,5 km')
    expect(formatKm(10_150)).toBe('10,15 km')
    expect(formatRunDate('2026-10-09', new Date(2026, 9, 12))).toBe('9 out')
    expect(formatRunDate('2025-09-27', new Date(2026, 9, 12))).toBe('27 set 2025')
    expect(formatRunDate('lixo')).toBe('lixo')
    expect([originLabel(treino), originInline(treino), originLabel(lago), originInline(lago)]).toEqual(['Treino', 'treino', 'Corrida do Lago', 'Corrida do Lago'])
  })
})

describe('textos da prévia', () => {
  it('primeira marca, novo melhor com e sem subida de elo, sem melhora e fora do ranking', () => {
    expect(impactView(impact(), '5 km')).toEqual({ tone: 'best', tier: 'ouro', title: 'Primeira marca nos 5 km', detail: 'Você entra no ranking dos 5 km como Ouro.' })
    expect(impactView(impact(), '5 km', { saved: true }).detail).toBe('Você entrou no ranking dos 5 km como Ouro.')
    expect(impactView(impact({ tier_after: null }), '5 km').detail).toBe('Você entra no ranking dos 5 km.')
    const better = impact({ kind: 'novo_melhor', previous_best_s: 1452, delta_s: -24, tier_before: 'ouro', tier_after: 'ouro' })
    expect(impactView(better, '5 km')).toEqual({ tone: 'best', tier: 'ouro', title: 'Novo melhor tempo · −0:24', detail: 'Continua Ouro nos 5 km. Antes: 24:12.' })
    expect(impactView({ ...better, tier_up: true, tier_after: 'diamante', delta_s: -3725 }, '5 km').title).toBe('Novo melhor tempo · −1:02:05')
    expect(impactView({ ...better, tier_up: true, tier_after: 'diamante' }, '5 km').detail).toBe('Sobe para Diamante nos 5 km. Antes: 24:12.')
    expect(impactView(impact({ kind: 'sem_melhora', previous_best_s: 1452, tier_after: 'ouro' }), '5 km')).toEqual({ tone: 'plain', tier: null, title: 'Seu melhor continua 24:12', detail: 'Esta marca fica no histórico dos 5 km.' })
    expect(impactView(impact({ kind: 'fora_do_ranking', tier_after: null }), '7 km').title).toBe('Fica só no histórico')
  })
})

describe('métrica do ranking da corrida', () => {
  it('segundos viram tempo, a unidade é "tempo" e o ranking é só da corrida', () => {
    expect(isRunRanking('corrida_21')).toBe(true)
    expect(isRunRanking('tenis')).toBe(false)
    expect(formatMetric(1452, 'corrida_5')).toBe('24:12')
    expect(formatMetric(5400, 'corrida_21')).toBe('1:30:00')
    expect(metricUnit('corrida_10')).toBe('tempo')
    expect(metricText(1452, 'corrida_5')).toBe('24:12')
    expect(metricText(38, 'futebol_time')).toBe('38 pontos')
    expect(metricText(4.256, 'futebol_individual')).toBe('4,26 média')
  })
})

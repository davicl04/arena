import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { RunDistance } from '../src/data/arena'
import { useRunBests } from '../src/hooks/useRunBests'
import { RunEntrySheet } from '../src/components/run/RunEntrySheet'
import { RunMarksSection } from '../src/components/run/RunMarksSection'
import { RunPlateActions } from '../src/components/run/RunPlateActions'
import { enableAct, press, textOf, type } from './support/native'
import { byId, callsTo, findByPrefix, navigationMock, serve } from './support/review'
import { bests, created, impact, lagoRace, markCard, preview, run, sec } from './support/runs'

/*
 * As duas partes da corrida na tela Jogar (`RunArea part="plate"` e `part="marks"`), montadas como a `PlayScreen` as monta:
 * a distância dos chips e as marcas (`useRunBests`) pertencem à tela e descem como propriedades. Porta do bloco "placa da
 * corrida" de `web/tests/run-marks.test.tsx`. O `request` é simulado; o relógio é falso (12 de outubro de 2026, 10h).
 */

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

const h = React.createElement
const BESTS = 'GET /me/run-bests'
const PREVIEW = 'POST /me/runs/preview'
const SAVE = 'POST /me/runs'

beforeEach(() => {
  enableAct()
  vi.useFakeTimers({ now: new Date(2026, 9, 12, 10, 0) })
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})
afterEach(() => { vi.useRealTimers() })

const tick = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const navigation = navigationMock()
const onExpired = vi.fn()

/** A tela: lê as marcas uma vez, guarda a distância dos chips e entrega tudo às duas partes. */
function Screen({ initial = 5 as RunDistance }) {
  const [distance, setDistance] = React.useState<RunDistance>(initial)
  const runBests = useRunBests(onExpired, true)
  const props = { distance, onDistance: setDistance, bests: runBests, navigation, onExpired }
  return h(React.Fragment, null,
    h('Text', { testID: 'chips' }, `chips:${distance}`),
    h(RunPlateActions, props),
    h(RunMarksSection, props))
}
async function mount(routes: Record<string, unknown>, initial: RunDistance = 5) {
  serve(routes)
  onExpired.mockReset()
  vi.mocked(navigation.go).mockReset()
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(h(Screen, { initial })) })
  await tick()
  await tick()
  return tree
}
const sheet = (tree: ReactTestRenderer) => tree.root.findAllByType(RunEntrySheet as never)
const savedCards = (tree: ReactTestRenderer) => byId(tree, 'run-saved')
const markCardOf = (tree: ReactTestRenderer, km: number) => byId(tree, `run-mark-${km}`)[0]
const inside = (node: { findAllByType: (type: never) => { props: { children?: unknown } }[] }) => node.findAllByType('Text' as never).map(entry => [entry.props.children].flat().filter(part => typeof part === 'string' || typeof part === 'number').join('')).join(' | ')
const radio = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('Pressable' as never).find(node => node.props.accessibilityLabel === label && node.props.accessibilityRole === 'radio')!.props.accessibilityState.selected
async function fill(tree: ReactTestRenderer, h_: number, m: number, s: number) {
  await type(tree, 'Horas', String(h_))
  await type(tree, 'Minutos', String(m))
  await type(tree, 'Segundos', String(s))
  await tick(300)
}
const saveNow = async (tree: ReactTestRenderer) => {
  const button = tree.root.findAllByType('Pressable' as never).find(node => node.props.accessibilityLabel === 'Salvar corrida')!
  await act(async () => { button.props.onPress() })
  await tick()
  await tick()
}

describe('placa: "Registrar corrida" e o cartão de salvo', () => {
  const diamond = created({
    run: run({ id: 5, duration_s: sec('23:48'), pace_s_per_km: 286 }),
    impact: impact({ kind: 'novo_melhor', previous_best_s: sec('24:12'), delta_s: -24, tier_before: 'ouro', tier_after: 'diamante', tier_up: true }),
    best: markCard(5, ['24:12', '23:48'], { tier: 'diamante' }),
  })

  it('abre o K2 na distância dos chips; salvar mostra o cartão e o aviso, relê as marcas e atualiza o cartão da distância', async () => {
    let saved = false
    const tree = await mount({
      [BESTS]: () => (saved ? bests(markCard(5, ['24:12', '23:48'], { tier: 'diamante' })) : bests(markCard(5, ['24:12']))),
      [PREVIEW]: preview({ duration_s: sec('23:48'), impact: diamond.impact }),
      [SAVE]: () => { saved = true; return diamond },
    })
    expect(inside(markCardOf(tree, 5))).toContain('24:12')
    expect(inside(markCardOf(tree, 5))).toContain('Ouro')
    expect(sheet(tree)).toHaveLength(0)
    await press(tree, 'Registrar corrida')
    expect(sheet(tree)).toHaveLength(1)
    expect(sheet(tree)[0].props.initialDistance).toBe(5)
    expect(radio(tree, '5 km')).toBe(true)
    await fill(tree, 0, 23, 48)
    expect(textOf(tree)).toContain('Novo melhor tempo · −0:24')
    await saveNow(tree)
    expect(sheet(tree)).toHaveLength(0)
    expect(savedCards(tree)).toHaveLength(1)
    expect(textOf(tree)).toContain('Novo melhor tempo · 5 km')
    expect(textOf(tree)).toContain('23:48 · 4:46/km · treino')
    expect(textOf(tree)).toContain('−0:24 · Sobe para Diamante nos 5 km. Antes: 24:12.')
    expect(textOf(tree)).toContain('Marca salva. O ranking dos 5 km foi atualizado.')
    const notice = tree.root.findAll(node => String(node.type) === 'Text' && node.props.children === 'Marca salva. O ranking dos 5 km foi atualizado.')[0]
    expect(notice.props.accessibilityLiveRegion).toBe('polite')
    // As marcas são relidas no lugar: o cartão mostra o tempo novo e o elo novo, sem recarregar a tela.
    expect(callsTo('GET', '/me/run-bests')).toHaveLength(2)
    expect(inside(markCardOf(tree, 5))).toContain('23:48')
    expect(inside(markCardOf(tree, 5))).toContain('Diamante')
    // O aviso sai com o toque em dispensar.
    await press(tree, 'Dispensar aviso')
    expect(savedCards(tree)).toHaveLength(0)
    expect(textOf(tree)).not.toContain('Marca salva.')
  })

  it('o K2 abre na distância escolhida nos chips (a mesma do TierLine)', async () => {
    const tree = await mount({ [BESTS]: bests() }, 21)
    await press(tree, 'Registrar corrida')
    expect(sheet(tree)[0].props.initialDistance).toBe(21)
    expect(radio(tree, '21 km')).toBe(true)
    await press(tree, 'Fechar')
    expect(sheet(tree)).toHaveLength(0)
    expect(callsTo('POST', '/me/runs')).toHaveLength(0)
  })

  it('"Ver provas" fecha o K2 e leva à lista de provas da corrida', async () => {
    const tree = await mount({ [BESTS]: bests(), 'GET /me/run-races': { items: [] } })
    await press(tree, 'Registrar corrida')
    await press(tree, 'Prova do Arena')
    await tick()
    await press(tree, 'Ver provas')
    expect(navigation.go).toHaveBeenCalledExactlyOnceWith('events', { sport: 'corrida' })
    expect(sheet(tree)).toHaveLength(0)
  })

  it('a prova registrada pelo K2 aparece com o nome dela, sem a palavra "autodeclarado"', async () => {
    const result = created({
      run: run({ id: 8, distance_m: 10_000, standard_distance_km: 10, duration_s: sec('52:40'), pace_s_per_km: 316, origin: { source: 'prova', label: 'Corrida do Lago', event_id: 9 } }),
      impact: impact(), best: markCard(10, ['52:40']),
    })
    const tree = await mount({
      [BESTS]: bests(), 'GET /me/run-races': { items: [lagoRace()] },
      [PREVIEW]: preview({ distance_m: 10_000, standard_distance_km: 10, impact: impact() }), [SAVE]: result,
    })
    await press(tree, 'Registrar corrida')
    await press(tree, 'Prova do Arena')
    await tick()
    await press(tree, 'Corrida do Lago, 10 km · 8 out')
    await fill(tree, 0, 52, 40)
    await saveNow(tree)
    expect(textOf(tree)).toContain('Primeira marca registrada · 10 km')
    expect(textOf(tree)).toContain('52:40 · 5:16/km · Corrida do Lago')
    expect(textOf(tree)).not.toMatch(/autodeclarad/i)
    expect(callsTo('POST', '/me/runs')[0][2]).toEqual({ distance_m: 10_000, duration_s: sec('52:40'), source: 'prova', entry_id: 31 })
  })

  it('sessão expirada ao reler as marcas depois de salvar chama onExpired', async () => {
    let reads = 0
    const tree = await mount({
      [BESTS]: () => (++reads > 1 ? new ApiError('Entre na sua conta para continuar.', 401) : bests()),
      [PREVIEW]: preview(), [SAVE]: created(),
    })
    await press(tree, 'Registrar corrida')
    await fill(tree, 0, 24, 12)
    await saveNow(tree)
    expect(onExpired).toHaveBeenCalled()
  })
})

describe('marcas: "+" na distância, histórico, "Ver ranking" e estados', () => {
  it('o "+" escolhe a distância nos chips, abre o K2 nela e salvar fora das cinco só vai ao histórico', async () => {
    const outside = created({ run: run({ id: 8, distance_m: 7000, standard_distance_km: null, duration_s: sec('40:00'), pace_s_per_km: 343 }), impact: impact({ kind: 'fora_do_ranking', tier_after: null }), best: null })
    const tree = await mount({ [BESTS]: bests(), [PREVIEW]: preview({ distance_m: 7000, standard_distance_km: null, impact: outside.impact }), [SAVE]: outside })
    expect(markCardOf(tree, 5).props.accessibilityState).toEqual({ selected: true })
    await press(tree, 'Registrar 21 km')
    expect(textOf(tree)).toContain('chips:21')
    expect(markCardOf(tree, 21).props.accessibilityState).toEqual({ selected: true })
    expect(sheet(tree)[0].props.initialDistance).toBe(21)
    expect(radio(tree, '21 km')).toBe(true)
    await press(tree, 'Outra')
    await type(tree, 'Distância em metros', '7000')
    await fill(tree, 0, 40, 0)
    expect(textOf(tree)).toContain('Fica só no histórico')
    await saveNow(tree)
    // O cartão aparece onde a ação começou: acima dos cartões (a placa não mostra um segundo).
    expect(savedCards(tree)).toHaveLength(1)
    expect(textOf(tree)).toContain('Corrida registrada · 7 km')
    expect(textOf(tree)).toContain('Marca salva no histórico.')
    // A placa continua na distância escolhida pelo "+", e as marcas foram relidas.
    expect(textOf(tree)).toContain('chips:21')
    expect(callsTo('GET', '/me/run-bests')).toHaveLength(2)
  })

  it('o último cartão de salvo vence: salvar na placa depois do "+" deixa um só', async () => {
    const tree = await mount({ [BESTS]: bests(), [PREVIEW]: preview(), [SAVE]: created() })
    await press(tree, 'Registrar 5 km')
    await fill(tree, 0, 24, 12)
    await saveNow(tree)
    expect(savedCards(tree)).toHaveLength(1)
    await press(tree, 'Registrar corrida')
    await fill(tree, 0, 24, 30)
    await saveNow(tree)
    expect(savedCards(tree)).toHaveLength(1)
  })

  it('"Ver ranking" leva o Ranking à corrida e à distância escolhida nos chips', async () => {
    const tree = await mount({ [BESTS]: bests(markCard(10, ['52:40'], { tier: 'prata' })) }, 10)
    await press(tree, 'Ver ranking')
    expect(navigation.go).toHaveBeenCalledExactlyOnceWith('ranking', { sport: 'corrida', distanceKm: 10 })
  })

  it('tocar no cartão abre o histórico e remover relê as marcas e limpa o cartão de salvo', async () => {
    let removed = false
    const tree = await mount({
      [BESTS]: () => (removed ? bests() : bests(markCard(5, ['24:12']))),
      [PREVIEW]: preview(), [SAVE]: created(),
      '/me/runs?distance=5&limit=20': { items: [run({ id: 4 })], next_cursor: null },
      'DELETE /me/runs/4': () => { removed = true; return undefined },
    })
    await press(tree, 'Registrar corrida')
    await fill(tree, 0, 24, 12)
    await saveNow(tree)
    expect(savedCards(tree)).toHaveLength(1)
    const reads = callsTo('GET', '/me/run-bests').length
    await act(async () => { findByPrefix(tree, 'Histórico dos 5 km')!.props.onPress() })
    await tick()
    await press(tree, 'Remover a marca de 24:12 em 12 out')
    await press(tree, 'Remover marca')
    await tick()
    await tick()
    expect(callsTo('DELETE', '/me/runs/4')).toHaveLength(1)
    expect(callsTo('GET', '/me/run-bests').length).toBeGreaterThan(reads)
    expect(inside(markCardOf(tree, 5))).toContain('Sem marca')
    expect(savedCards(tree)).toHaveLength(0)
    await press(tree, 'Fechar')
    expect(textOf(tree)).not.toContain('Histórico dos 5 km')
  })

  it('"Outras distâncias" abre o histórico delas, sem convite para registrar; o vazio de uma distância registra nela', async () => {
    const tree = await mount({
      [BESTS]: bests(),
      '/me/runs?distance=outra&limit=20': { items: [], next_cursor: null },
      '/me/runs?distance=10&limit=20': { items: [], next_cursor: null },
    })
    await press(tree, 'Outras distâncias')
    await tick()
    expect(textOf(tree)).toContain('Nenhuma marca fora das cinco distâncias.')
    await press(tree, 'Fechar')
    await act(async () => { findByPrefix(tree, 'Histórico dos 10 km')!.props.onPress() })
    await tick()
    await press(tree, 'Registrar 10 km')
    expect(textOf(tree)).not.toContain('Nenhuma marca nos 10 km.')
    expect(textOf(tree)).toContain('chips:10')
    expect(sheet(tree)[0].props.initialDistance).toBe(10)
  })

  it('erro ao ler as marcas: o alerta oferece tentar de novo, o registro continua disponível e não há "sem marca" inventado', async () => {
    let fail = true
    const tree = await mount({ [BESTS]: () => (fail ? new ApiError('Marcas indisponíveis.', 500) : bests(markCard(5, ['24:12']))) })
    expect(textOf(tree)).toContain('Marcas indisponíveis.')
    expect(byId(tree, 'run-mark-5')).toHaveLength(0)
    expect(textOf(tree)).not.toContain('Sem marca')
    const register = tree.root.findAllByType('Pressable' as never).find(node => node.props.accessibilityLabel === 'Registrar corrida')!
    expect(register.props.disabled).toBeFalsy()
    fail = false
    await press(tree, 'Tentar novamente')
    await tick()
    await tick()
    expect(inside(markCardOf(tree, 5))).toContain('24:12')
    expect(textOf(tree)).not.toContain('Marcas indisponíveis.')
  })
})

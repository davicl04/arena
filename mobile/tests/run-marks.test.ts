import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { RunBest } from '../src/api/runs'
import { brandSvgs } from '../src/assets/brand-svgs'
import { RunHistorySheet } from '../src/components/run/RunHistorySheet'
import { RunMarks, cardSummary } from '../src/components/run/RunMarks'
import { RunSavedCard, savedNotice } from '../src/components/run/RunSavedCard'
import { RunSpark, sparkLabel, sparkPoints } from '../src/components/run/RunSpark'
import { enableAct, press, textOf } from './support/native'
import { toastText } from './support/toast'
import { allText, byId, callsTo, findButton, findByPrefix, serve } from './support/review'
import { bests, created, emptyCard, impact, lago, markCard, run, sec } from './support/runs'

/*
 * "Suas marcas" (K4): minigráfico, cartões, histórico paginado com remoção e o cartão de marca salva, porta de
 * `web/tests/run-marks.test.tsx`. O `request` é simulado e o relógio é falso (hoje: 12 de outubro de 2026, 10h).
 */

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

const h = React.createElement
const NOW = new Date(2026, 9, 12, 10, 0)

beforeEach(() => {
  enableAct()
  vi.useFakeTimers({ now: NOW })
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})
afterEach(() => { vi.useRealTimers() })

const tick = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(element) })
  await tick()
  await tick()
  return tree
}
const svgXml = (tree: ReactTestRenderer) => tree.root.findAllByType('SvgXml' as never).map(node => node.props.xml)
const withLabel = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('Pressable' as never).filter(node => node.props.accessibilityLabel === label)
const pressPrefix = async (tree: ReactTestRenderer, prefix: string) => {
  const target = findByPrefix(tree, prefix)
  expect(target, `botão iniciado por "${prefix}"`).toBeTruthy()
  await act(async () => { target!.props.onPress() })
  await tick()
}
const within = (node: ReactTestInstance) => node.findAllByType('Text' as never).map(entry => [entry.props.children].flat().filter(part => typeof part === 'string' || typeof part === 'number').join('')).join(' | ')

describe('RunSpark: minigráfico de evolução em react-native-svg', () => {
  const draw = (tree: ReactTestRenderer) => {
    const path = tree.root.findAllByType('Path' as never)[0]
    const points = path ? String(path.props.d).split(/(?=[ML])/).map(part => part.slice(1).trim().split(' ').map(Number)) : []
    return { points, dot: tree.root.findByType('Circle' as never) }
  }

  it('o tempo menor sobe o traço e a marca mais recente fica marcada', async () => {
    const series = markCard(5, ['26:05', '25:00', '24:12']).series
    const tree = await mount(h(RunSpark, { series }))
    const { points, dot } = draw(tree)
    expect(points).toHaveLength(3)
    expect(points[0][0]).toBe(0)
    expect(points[2][0]).toBe(92)
    expect(points[0][1]).toBeGreaterThan(points[1][1]) // y maior = mais baixo no gráfico
    expect(points[1][1]).toBeGreaterThan(points[2][1])
    expect([dot.props.cx, dot.props.cy]).toEqual(points[2])
    const image = byId(tree, 'run-spark')[0]
    expect(image.props.accessibilityRole).toBe('image')
    expect(image.props.accessibilityLabel).toBe('Evolução: 3 marcas, de 26:05 a 24:12')
  })

  it('uma marca é só um ponto; marcas iguais, uma linha reta; sem marcas, nada', async () => {
    const one = await mount(h(RunSpark, { series: markCard(5, ['24:12']).series }))
    expect(one.root.findAllByType('Path' as never)).toHaveLength(0)
    expect(draw(one).dot.props.cx).toBe(46)
    expect(byId(one, 'run-spark')[0].props.accessibilityLabel).toBe('Evolução: uma marca, 24:12')
    const flat = await mount(h(RunSpark, { series: markCard(5, ['24:12', '24:12']).series }))
    expect(draw(flat).points.map(point => point[1])).toEqual([14, 14])
    const none = await mount(h(RunSpark, { series: [] }))
    expect(none.toJSON()).toBeNull()
    expect(sparkLabel([])).toBe('')
    expect(sparkPoints([{ duration_s: 1 }, { duration_s: 3 }])).toEqual([[0, 4], [92, 24]])
  })
})

describe('RunMarks: os cinco cartões', () => {
  const cards = bests(
    markCard(5, ['26:05', '25:00', '24:12'], { tier: 'ouro' }),
    markCard(10, ['52:40'], { tier: 'prata', best: { ...markCard(10, ['52:40']).best!, origin: lago, date: '2026-09-14' } }),
  ).items

  async function renderMarks(overrides: Partial<Parameters<typeof RunMarks>[0]> = {}) {
    const handlers = { onAdd: vi.fn(), onOpen: vi.fn(), onRetry: vi.fn(), onOpenRanking: vi.fn() }
    const tree = await mount(h(RunMarks, { items: cards, loading: false, error: '', selected: 5, now: NOW, ...handlers, ...overrides }))
    return { tree, ...handlers }
  }
  const card = (tree: ReactTestRenderer, km: number) => byId(tree, `run-mark-${km}`)[0]

  it('mostra o melhor tempo, o elo, a origem com a data e o minigráfico; sem marca, o convite e nunca um elo', async () => {
    const { tree } = await renderMarks()
    expect([3, 5, 10, 21, 42].map(km => byId(tree, `run-mark-${km}`).length)).toEqual([1, 1, 1, 1, 1])
    const five = within(card(tree, 5))
    expect(five).toContain('5 km')
    expect(five).toContain('Ouro')
    expect(five).toContain('24:12')
    expect(five).toContain('Treino · 3 out') // melhor marca da série: o terceiro ponto (dia 3)
    expect(five).toContain('Melhor nas últimas 52 semanas')
    expect(card(tree, 5).findAllByType('SvgXml' as never).map(node => node.props.xml)).toEqual([brandSvgs.ouro])
    expect(card(tree, 5).findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === 'Evolução: 3 marcas, de 26:05 a 24:12')).toHaveLength(1)
    expect(card(tree, 5).props.accessibilityState).toEqual({ selected: true })
    // A origem da prova é o nome dela, com a data no rodapé; nunca "autodeclarado".
    expect(within(card(tree, 10))).toContain('Corrida do Lago · 14 set')
    expect(within(card(tree, 10))).toContain('Prata')
    expect(card(tree, 10).props.accessibilityState).toEqual({ selected: false })
    const three = card(tree, 3)
    expect(within(three)).toContain('Sem marca')
    expect(within(three)).toContain('Registre um treino ou prova para entrar no ranking dos 3 km.')
    expect(three.findAllByType('SvgXml' as never).map(node => node.props.xml)).toEqual([brandSvgs.coliseum])
    expect(byId(tree, 'run-spark')).toHaveLength(2)
    expect(allText(tree)).not.toMatch(/autodeclarad/i)
    expect(textOf(tree)).toContain('O ranking usa o melhor tempo das últimas 52 semanas de cada distância.')
  })

  it('nunca atribui elo a quem está sem marca, mesmo que a resposta traga uma chave', async () => {
    const odd: RunBest = { ...emptyCard(3), tier: 'ouro' }
    const { tree } = await renderMarks({ items: [odd, ...cards.slice(1)] })
    expect(card(tree, 3).findAllByType('SvgXml' as never).map(node => node.props.xml)).toEqual([brandSvgs.coliseum])
    expect(within(card(tree, 3))).toContain('Sem marca')
    expect(cardSummary(odd)).toBe('3 km: sem marca. Registre um treino ou prova para entrar no ranking.')
    // Marca sem elo na resposta: a marca aparece, o elo não.
    const noTier: RunBest = { ...cards[1], tier: null }
    expect(cardSummary(noTier, NOW)).toContain('marca registrada, melhor tempo 24:12')
  })

  it('o cartão se lê inteiro para leitores de tela e o "+" registra naquela distância', async () => {
    const { tree, onAdd, onOpen } = await renderMarks()
    const open = findByPrefix(tree, 'Histórico dos 5 km')!
    expect(open.props.accessibilityLabel).toBe('Histórico dos 5 km. 5 km: Ouro, melhor tempo 24:12, Treino, 3 out. Melhor nas últimas 52 semanas.')
    expect(open.props.accessibilityRole).toBe('button')
    await press(tree, 'Registrar 21 km')
    expect(onAdd).toHaveBeenCalledExactlyOnceWith(21)
    expect(onOpen).not.toHaveBeenCalled()
    await act(async () => { open.props.onPress() })
    expect(onOpen).toHaveBeenLastCalledWith('5')
    await pressPrefix(tree, 'Histórico dos 3 km')
    expect(onOpen).toHaveBeenLastCalledWith('3')
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('os alvos de toque têm 44 pt ou mais e papel de botão', async () => {
    const { tree } = await renderMarks()
    const touchables = tree.root.findAllByType('Pressable' as never)
    expect(touchables.length).toBe(5 + 5 + 2) // abrir e "+" de cada cartão, "Outras distâncias" e "Ver ranking"
    for (const node of touchables) {
      expect(node.props.accessibilityRole).toBe('button')
      expect(node.props.accessibilityLabel).toBeTruthy()
      expect(node.props.style.minHeight ?? node.props.style.height).toBeGreaterThanOrEqual(44)
    }
  })

  it('"Outras distâncias" abre o histórico das marcas fora das cinco', async () => {
    const { tree, onOpen } = await renderMarks()
    await press(tree, 'Outras distâncias')
    expect(onOpen).toHaveBeenCalledWith('outra')
    expect(withLabel(tree, 'Outras distâncias')[0].props.accessibilityHint).toContain('só no histórico')
  })

  it('"Ver ranking" abre o Ranking da corrida na distância escolhida na placa', async () => {
    const first = await renderMarks()
    await press(first.tree, 'Ver ranking')
    expect(first.onOpenRanking).toHaveBeenCalledExactlyOnceWith(5)
    const second = await renderMarks({ selected: 21 })
    await press(second.tree, 'Ver ranking')
    expect(second.onOpenRanking).toHaveBeenCalledExactlyOnceWith(21)
    expect(card(second.tree, 21).props.accessibilityState).toEqual({ selected: true })
  })

  it('carregando e erro: texto de estado e nova tentativa, sem cartões inventados', async () => {
    const loading = await mount(h(RunMarks, { items: [], loading: true, error: '', selected: 5, onAdd: vi.fn(), onOpen: vi.fn(), onRetry: vi.fn(), onOpenRanking: vi.fn() }))
    expect(textOf(loading)).toContain('Carregando suas marcas…')
    expect(byId(loading, 'run-mark-5')).toHaveLength(0)
    expect(withLabel(loading, 'Outras distâncias')).toHaveLength(0)
    const failed = await renderMarks({ items: [], error: 'Não foi possível carregar suas marcas.' })
    expect(textOf(failed.tree)).toContain('Não foi possível carregar suas marcas.')
    expect(byId(failed.tree, 'run-mark-5')).toHaveLength(0)
    await press(failed.tree, 'Tentar novamente')
    expect(failed.onRetry).toHaveBeenCalled()
  })
})

describe('RunSavedCard: a confirmação depois de salvar', () => {
  const render = (value: ReturnType<typeof created>) => mount(h(RunSavedCard, { created: value, onDismiss: vi.fn() }))

  it('novo melhor tempo que sobe de elo: título, tempo, ritmo, origem e o que mudou, com o brasão', async () => {
    const value = created({
      run: run({ id: 5, duration_s: sec('23:48'), pace_s_per_km: 286 }),
      impact: impact({ kind: 'novo_melhor', previous_best_s: sec('24:12'), delta_s: -24, tier_before: 'ouro', tier_after: 'diamante', tier_up: true }),
    })
    const tree = await render(value)
    expect(textOf(tree)).toContain('Novo melhor tempo · 5 km')
    expect(textOf(tree)).toContain('23:48 · 4:46/km · treino')
    expect(textOf(tree)).toContain('−0:24 · Sobe para Diamante nos 5 km. Antes: 24:12.')
    expect(svgXml(tree)).toContain(brandSvgs.diamante)
    expect(byId(tree, 'run-saved')[0].props.accessibilityLiveRegion).toBe('polite')
    expect(byId(tree, 'run-saved')[0].props.accessibilityLabel).toBe('Novo melhor tempo · 5 km. 23:48 · 4:46/km · treino. −0:24 · Sobe para Diamante nos 5 km. Antes: 24:12.')
    expect(savedNotice(value)).toBe('Marca salva. O ranking dos 5 km foi atualizado.')
  })

  it('primeira marca, prova (com o nome dela) e marca que não melhora ou fica fora do ranking', async () => {
    const first = created({ run: run({ origin: lago, duration_s: sec('52:40'), distance_m: 10_000, standard_distance_km: 10, pace_s_per_km: 316 }), impact: impact() })
    const tree = await render(first)
    expect(textOf(tree)).toContain('Primeira marca registrada · 10 km')
    expect(textOf(tree)).toContain('52:40 · 5:16/km · Corrida do Lago')
    expect(textOf(tree)).toContain('Você entrou no ranking dos 10 km como Ouro.')
    expect(svgXml(tree)).toContain(brandSvgs.ouro)

    const same = created({ impact: impact({ kind: 'sem_melhora', previous_best_s: sec('24:12'), delta_s: 30, tier_before: 'ouro', tier_after: 'ouro' }) })
    const slower = await render(same)
    expect(textOf(slower)).toContain('Corrida registrada · 5 km')
    expect(textOf(slower)).toContain('Seu melhor continua 24:12. Esta marca fica no histórico dos 5 km.')
    expect(svgXml(slower)).toEqual([])
    expect(savedNotice(same)).toBe('Marca salva no histórico.')

    const outside = created({ run: run({ distance_m: 7000, standard_distance_km: null, duration_s: sec('40:00'), pace_s_per_km: 343 }), impact: impact({ kind: 'fora_do_ranking', tier_after: null }), best: null })
    const tree3 = await render(outside)
    expect(textOf(tree3)).toContain('Corrida registrada · 7 km')
    expect(textOf(tree3)).toContain('Fica só no histórico. A distância não é de 3, 5, 10, 21 ou 42 km')
    expect(savedNotice(outside)).toBe('Marca salva no histórico.')
    for (const text of [textOf(tree), textOf(slower), textOf(tree3)]) expect(text).not.toMatch(/autodeclarad/i)
  })

  it('dispensar o aviso tem alvo de 44 pt e nome', async () => {
    const onDismiss = vi.fn()
    const tree = await mount(h(RunSavedCard, { created: created(), onDismiss }))
    const dismiss = withLabel(tree, 'Dispensar aviso')[0]
    expect(dismiss.props.style).toMatchObject({ width: 44, height: 44 })
    await press(tree, 'Dispensar aviso')
    expect(onDismiss).toHaveBeenCalled()
  })
})

describe('RunHistorySheet: histórico paginado e remoção', () => {
  const path = (filter: string, cursor = '') => `/me/runs?distance=${filter}&limit=20${cursor ? `&cursor=${cursor}` : ''}`
  const rows = [
    run({ id: 3, duration_s: sec('24:12'), date: '2026-10-09', pace_s_per_km: 290 }),
    run({ id: 2, duration_s: sec('25:31'), date: '2026-09-27', pace_s_per_km: 306, origin: lago, distance_m: 5050 }),
    run({ id: 1, duration_s: sec('26:05'), date: '2025-10-01', counts_for_ranking: false, pace_s_per_km: 313 }),
  ]
  async function open(filter: Parameters<typeof RunHistorySheet>[0]['filter'], routes: Record<string, unknown>, extra: Partial<Parameters<typeof RunHistorySheet>[0]> = {}) {
    serve(routes)
    const handlers = { onClose: vi.fn(), onChanged: vi.fn(), onExpired: vi.fn(), onAdd: vi.fn() }
    const tree = await mount(h(RunHistorySheet, { filter, now: NOW, ...handlers, ...extra }))
    return { tree, ...handlers }
  }
  const row = (tree: ReactTestRenderer, id: number) => byId(tree, `run-history-${id}`)[0]

  it('lista as marcas do dia mais recente ao mais antigo, com ritmo, data, origem e distância', async () => {
    const { tree } = await open('5', { [path('5')]: { items: rows, next_cursor: null } })
    expect(textOf(tree)).toContain('Histórico dos 5 km')
    expect([3, 2, 1].map(id => byId(tree, `run-history-${id}`).length)).toEqual([1, 1, 1])
    expect(within(row(tree, 3))).toContain('4:50/km')
    expect(within(row(tree, 3))).toContain('9 out · Treino · 5 km')
    expect(within(row(tree, 3))).not.toContain('fora das 52 semanas')
    expect(within(row(tree, 2))).toContain('27 set · Corrida do Lago · 5,05 km')
    expect(within(row(tree, 1))).toContain('1 out 2025 · Treino · 5 km · fora das 52 semanas')
    expect(row(tree, 3).findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === '24:12, ritmo 4:50/km, 9 out, Treino, 5 km')).toHaveLength(1)
    expect(allText(tree)).not.toMatch(/autodeclarad/i)
  })

  it('pagina por cursor: "Carregar mais" acrescenta as marcas e some no fim', async () => {
    const { tree } = await open('5', { [path('5')]: { items: [rows[0]], next_cursor: 'abc' }, [path('5', 'abc')]: { items: [rows[1]], next_cursor: null } })
    expect(byId(tree, 'run-history-2')).toHaveLength(0)
    await press(tree, 'Carregar mais')
    await tick()
    expect(byId(tree, 'run-history-2')).toHaveLength(1)
    expect(findButton(tree, 'Carregar mais')).toBeUndefined()
    expect(vi.mocked(request).mock.calls.map(call => call[0])).toEqual([path('5'), path('5', 'abc')])
  })

  it('erro ao carregar mais fica visível e deixa tentar de novo', async () => {
    let fail = true
    const { tree } = await open('5', { [path('5')]: { items: [rows[0]], next_cursor: 'abc' }, [path('5', 'abc')]: () => (fail ? new ApiError('Sem conexão.', 503) : { items: [rows[1]], next_cursor: null }) })
    await press(tree, 'Carregar mais')
    await tick()
    expect(textOf(tree)).toContain('Sem conexão.')
    expect(byId(tree, 'run-history-2')).toHaveLength(0)
    fail = false
    await press(tree, 'Carregar mais')
    await tick()
    expect(byId(tree, 'run-history-2')).toHaveLength(1)
  })

  it('remover pede confirmação, apaga a marca e avisa quem chamou; cancelar não apaga', async () => {
    const { tree, onChanged } = await open('5', { [path('5')]: { items: rows, next_cursor: null }, 'DELETE /me/runs/2': undefined })
    await press(tree, 'Remover a marca de 25:31 em 27 set')
    const box = () => tree.root.findAll(node => String(node.type) === 'View' && node.props.accessibilityLabel === 'Confirmação')
    expect(box()).toHaveLength(1)
    expect(within(box()[0])).toContain('Remover esta marca?')
    expect(within(box()[0])).toContain('o ranking da distância é recalculado')
    await press(tree, 'Cancelar')
    expect(box()).toHaveLength(0)
    expect(callsTo('DELETE', '/me/runs/2')).toHaveLength(0)
    await press(tree, 'Remover a marca de 25:31 em 27 set')
    await press(tree, 'Remover marca')
    await tick()
    expect(callsTo('DELETE', '/me/runs/2')).toHaveLength(1)
    expect(byId(tree, 'run-history-2')).toHaveLength(0)
    expect(byId(tree, 'run-history-3')).toHaveLength(1)
    expect(textOf(tree)).toContain('Marca removida.')
    expect(onChanged).toHaveBeenCalledExactlyOnceWith(rows[1])
  })

  it('a marca fora das 52 semanas avisa que não conta para o ranking; um erro ao remover vira toast e a confirmação continua', async () => {
    const { tree, onChanged } = await open('5', { [path('5')]: { items: rows, next_cursor: null }, 'DELETE /me/runs/1': new ApiError('Serviço indisponível.', 500) })
    await press(tree, 'Remover a marca de 26:05 em 1 out 2025')
    expect(within(tree.root.findAll(node => node.props.accessibilityLabel === 'Confirmação')[0])).toContain('Não conta para o ranking.')
    await press(tree, 'Remover marca')
    await tick()
    expect(toastText()).toContain('Serviço indisponível.')
    expect(onChanged).not.toHaveBeenCalled()
    expect(byId(tree, 'run-history-1')).toHaveLength(1)
  })

  it('404 ao remover (a marca já não existe): relê a lista e os cartões, fecha a confirmação e deixa a mensagem do servidor', async () => {
    let gone = false
    const { tree, onChanged } = await open('5', {
      [path('5')]: () => ({ items: gone ? rows.filter(item => item.id !== 1) : rows, next_cursor: null }),
      'DELETE /me/runs/1': () => { gone = true; return new ApiError('Marca não encontrada.', 404) },
    })
    await press(tree, 'Remover a marca de 26:05 em 1 out 2025')
    await press(tree, 'Remover marca')
    await tick()
    await tick()
    expect(callsTo('GET', path('5'))).toHaveLength(2)
    expect(textOf(tree)).toContain('Marca não encontrada.')
    expect(byId(tree, 'run-history-1')).toHaveLength(0)
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Confirmação')).toHaveLength(0)
    // Quem chamou também relê (os cartões e a placa mostravam uma marca que não existe mais).
    expect(onChanged).toHaveBeenCalledExactlyOnceWith(rows.find(item => item.id === 1))
  })

  it('histórico vazio de uma distância oferece registrar; o de "Outra" explica que fica só ali', async () => {
    const first = await open('5', { [path('5')]: { items: [], next_cursor: null } })
    expect(textOf(first.tree)).toContain('Nenhuma marca nos 5 km.')
    await press(first.tree, 'Registrar 5 km')
    expect(first.onAdd).toHaveBeenCalled()
    const other = await open('outra', { [path('outra')]: { items: [run({ id: 9, distance_m: 7000, standard_distance_km: null, duration_s: sec('40:00'), counts_for_ranking: false, pace_s_per_km: 343 })], next_cursor: null } }, { onAdd: undefined })
    expect(textOf(other.tree)).toContain('Outras distâncias')
    expect(textOf(other.tree)).toContain('Ficam só aqui, sem ranking.')
    expect(within(row(other.tree, 9))).toContain('7 km')
    expect(within(row(other.tree, 9))).not.toContain('fora das 52 semanas') // sem distância padrão
    const none = await open('outra', { [path('outra')]: { items: [], next_cursor: null } }, { onAdd: undefined })
    expect(textOf(none.tree)).toContain('Nenhuma marca fora das cinco distâncias.')
    expect(findButton(none.tree, 'Registrar 5 km')).toBeUndefined()
  })

  it('erro de leitura oferece tentar de novo; Fechar sai da folha', async () => {
    let fail = true
    const { tree, onClose } = await open('10', { [path('10')]: () => (fail ? new ApiError('Serviço indisponível.', 500) : { items: [rows[0]], next_cursor: null }) })
    expect(textOf(tree)).toContain('Serviço indisponível.')
    expect(byId(tree, 'load-error-section')).toHaveLength(1)
    fail = false
    await press(tree, 'Tentar novamente')
    await tick()
    expect(byId(tree, 'run-history-3')).toHaveLength(1)
    await press(tree, 'Fechar')
    expect(onClose).toHaveBeenCalled()
  })

  it('sessão expirada ao ler ou remover chama onExpired', async () => {
    const reading = await open('5', { [path('5')]: new ApiError('Entre na sua conta para continuar.', 401) })
    expect(reading.onExpired).toHaveBeenCalled()
    const removing = await open('5', { [path('5')]: { items: [rows[0]], next_cursor: null }, 'DELETE /me/runs/3': new ApiError('Entre na sua conta para continuar.', 401) })
    await press(removing.tree, 'Remover a marca de 24:12 em 9 out')
    await press(removing.tree, 'Remover marca')
    await tick()
    expect(removing.onExpired).toHaveBeenCalled()
  })
})

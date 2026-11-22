import React from 'react'
import { act } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { City, Profile } from '../src/api/client'
import type { EventCard } from '../src/api/entries'
import { eventsPath } from '../src/api/entries'
import {
  CHAMPIONSHIPS_LIMIT, championshipMeta, championshipTags, championshipsSport, championshipsTitle, emptyChampionshipsText, mergeChampionships, missingSportsCount,
} from '../src/data/home'
import HomeScreen from '../src/screens/HomeScreen'
import { eventCard } from './support/events'
import { enableAct } from './support/native'
import { admin, allText, byId, callsTo, findButton, flush, me, navigationMock, page, pressButton, render, serve } from './support/review'
import type { Route } from './support/review'
import { brasilia, emptySummary, football, notificationSummaryState, standings, tennis } from './support/play'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({
  sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' },
  sportIconsAlpha: { futebol: 'futebol-alfa.png', tenis: 'tenis-alfa.png', corrida: 'corrida-alfa.png' },
}))

const h = React.createElement
const PROFILES = '/me/sports-profiles'
const goiania: City = { id: 5208707, name: 'Goiânia', state: 'GO' }
const runner: Profile = { ...football, id: 3, sport: 'corrida', position: null, city_id: goiania.id, city: goiania }
const FOOTBALL_EVENTS = '/events?sport=futebol&city_id=5300108&limit=2'
const TENNIS_EVENTS = '/events?sport=tenis&city_id=5300108&limit=2'
const RUN_EVENTS = '/events?sport=corrida&city_id=5208707&limit=2'
const DAY = 86_400_000
/** Preço como o `Intl` o escreve, com o espaço inseparável depois de "R$". */
const brl = (value: string) => `R$\u00a0${value}`
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString()

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})

/** Monta o Início com os perfis dados (ou a rota de perfis dada) e as listas de eventos por caminho. */
function mount(profiles: Route, events: Record<string, Route> = {}, user = me) {
  const navigation = navigationMock()
  const onExpired = vi.fn()
  serve({ '/me/standings': standings(), [PROFILES]: profiles, ...events })
  const notificationSummary = notificationSummaryState(emptySummary())
  return render(h(HomeScreen, { user, navigation, onExpired, notificationSummary })).then(tree => ({ tree, navigation, onExpired }))
}
type Tree = Awaited<ReturnType<typeof mount>>['tree']
const eventCalls = () => vi.mocked(request).mock.calls.filter(([path]) => String(path).startsWith('/events'))
const section = (tree: Tree) => allText({ root: byId(tree, 'campeonatos')[0] } as never)
const rows = (tree: Tree) => tree.root.findAll(node => typeof node.type === 'string' && String(node.props.testID ?? '').startsWith('campeonato-') && node.props.accessibilityRole === 'button')

describe('Campeonatos: lógica pura', () => {
  const card = (id: number, startsAt: string | null) => ({ id, starts_at: startsAt })

  it('une as listas sem duplicatas por id, ordena por starts_at crescente e corta nos 2 primeiros', () => {
    expect(CHAMPIONSHIPS_LIMIT).toBe(2)
    const a = card(1, '2026-12-10T12:00:00Z')
    const b = card(2, '2026-12-03T12:00:00Z')
    const c = card(3, '2026-12-05T12:00:00Z')
    expect(mergeChampionships([[a, b], [{ ...b }, c]])).toEqual([b, c])
    expect(mergeChampionships([[a, b], [c]], 5)).toEqual([b, c, a])
    // A primeira ocorrência fica; sem data vai por último; empate de data pelo id.
    const first = { ...card(7, '2026-12-01T12:00:00Z'), name: 'primeira' }
    expect(mergeChampionships([[first], [{ ...card(7, '2026-12-01T12:00:00Z'), name: 'segunda' }]])).toEqual([first])
    expect(mergeChampionships([[card(9, null), card(8, '2026-12-01T12:00:00Z')]])).toEqual([card(8, '2026-12-01T12:00:00Z'), card(9, null)])
    expect(mergeChampionships([[card(5, '2026-12-01T12:00:00Z'), card(4, '2026-12-01T12:00:00Z')]])).toEqual([card(4, '2026-12-01T12:00:00Z'), card(5, '2026-12-01T12:00:00Z')])
    expect(mergeChampionships([[], []])).toEqual([])
    expect(mergeChampionships([])).toEqual([])
  })

  it('título: "Campeonatos em {cidade}" com a mesma cidade, "Campeonatos perto de você" com cidades diferentes e "Perto de você" sem perfis', () => {
    expect(championshipsTitle([football, tennis])).toBe('Campeonatos em Brasília')
    expect(championshipsTitle([football])).toBe('Campeonatos em Brasília')
    expect(championshipsTitle([football, runner])).toBe('Campeonatos perto de você')
    expect(championshipsTitle([])).toBe('Perto de você')
    // Perfis carregando ou com falha não contam como "sem perfis".
    expect(championshipsTitle(null)).toBe('Campeonatos perto de você')
  })

  it('estado vazio pela cidade, a modalidade de "Ver todos" e as modalidades que faltam', () => {
    expect(emptyChampionshipsText([football, tennis])).toBe('Nenhum campeonato aberto em Brasília')
    expect(emptyChampionshipsText([football, runner])).toBe('Nenhum campeonato aberto perto de você')
    expect(championshipsSport([{ sport: 'tenis' }], [football])).toBe('tenis')
    expect(championshipsSport([], [runner, football])).toBe('corrida')
    expect(championshipsSport([{ sport: null }], [football])).toBe('futebol')
    expect(championshipsSport([], [])).toBeNull()
    expect(missingSportsCount([])).toBe(3)
    expect(missingSportsCount([football, tennis])).toBe(1)
    expect(missingSportsCount([football, tennis, runner])).toBe(0)
  })

  it('linha: "{data e hora} · {local}", com a cidade sem local e "Data a definir" sem data', () => {
    const now = new Date(2026, 10, 22, 10, 0)
    const startsAt = new Date(2026, 11, 6, 8, 0).toISOString()
    expect(championshipMeta({ starts_at: startsAt, venue: 'Arena Guará', city: brasilia }, now)).toBe('dom, 6 dez · 08:00 · Arena Guará')
    expect(championshipMeta({ starts_at: startsAt, venue: '  ', city: brasilia }, now)).toBe('dom, 6 dez · 08:00 · Brasília')
    expect(championshipMeta({ starts_at: null, venue: 'Arena Guará', city: null }, now)).toBe('Data a definir · Arena Guará')
    expect(championshipMeta({ starts_at: startsAt, venue: null, city: null }, now)).toBe('dom, 6 dez · 08:00')
  })

  it('etiquetas: preço ("Gratuita" ou o formato dos cartazes), vagas (ou "Vagas esgotadas"), elegibilidade e "Em andamento"', () => {
    const labels = (extra: Partial<EventCard>) => championshipTags(eventCard(5, extra)).map(tag => tag.label)
    expect(labels({})).toEqual([brl('240'), '3 de 8 times', 'Você pode se inscrever'])
    expect(labels({ price_cents: 0 })[0]).toBe('Gratuita')
    expect(labels({ price_cents: 4250 })[0]).toBe(brl('42,50'))
    expect(labels({ entries_count: 8 })).toContain('Vagas esgotadas')
    expect(labels({ capacity: null })).toEqual([brl('240'), 'Você pode se inscrever'])
    expect(labels({ sport: 'corrida', capacity: 300, entries_count: 120 })).toContain('120 de 300 corredores')
    expect(labels({ eligibility: { eligible: false, reason: 'fora_da_faixa', message: null, tier: null, teams: null } })).toEqual([brl('240'), '3 de 8 times'])
    // Em andamento: o estado vem primeiro e o evento não recebe mais inscrições.
    expect(championshipTags(eventCard(5, { state: 'em_andamento', phase: 'em_andamento' }))).toEqual([
      { kind: 'ongoing', label: 'Em andamento' }, { kind: 'price', label: brl('240') }, { kind: 'spots', label: '3 de 8 times' },
    ])
  })

  it('eventsPath acrescenta o limite só quando pedido', () => {
    expect(eventsPath('futebol', 5300108, 2)).toBe(FOOTBALL_EVENTS)
    expect(eventsPath('tenis', 12)).toBe('/events?sport=tenis&city_id=12')
  })
})

describe('Início: Campeonatos', () => {
  it('uma leitura por perfil com sport, city_id e limit=2, em paralelo; mostra os 2 primeiros da união, sem duplicatas', async () => {
    const late = eventCard(11, { name: 'Copa Tardia', starts_at: inDays(20) })
    const shared = eventCard(12, { name: 'Copa Compartilhada', starts_at: inDays(3) })
    const tennisCup = eventCard(13, { name: 'Aberto de Tênis', sport: 'tenis', starts_at: inDays(5), format: null })
    const { tree } = await mount([football, tennis], { [FOOTBALL_EVENTS]: page([late, shared]), [TENNIS_EVENTS]: page([shared, tennisCup]) })
    expect(callsTo('GET', FOOTBALL_EVENTS)).toHaveLength(1)
    expect(callsTo('GET', TENNIS_EVENTS)).toHaveLength(1)
    expect(eventCalls()).toHaveLength(2)
    // Os perfis são lidos uma vez e servem às pílulas, ao botão e aos campeonatos.
    expect(callsTo('GET', PROFILES)).toHaveLength(1)
    expect(section(tree)).toContain('Campeonatos em Brasília')
    expect(rows(tree).map(row => row.props.testID)).toEqual(['campeonato-12', 'campeonato-13'])
    expect(section(tree)).not.toContain('Copa Tardia')
  })

  it('linha com nome, "{data e hora} · {local}" e as etiquetas; "Em andamento" quando for o caso; o toque abre o campeonato', async () => {
    const ongoing = eventCard(21, { name: 'Liga em Curso', state: 'em_andamento', phase: 'em_andamento', starts_at: inDays(-1), price_cents: 0, venue: 'Quadra Central' })
    const full = eventCard(22, { name: 'Copa Lotada', starts_at: inDays(2), entries_count: 8, eligibility: { eligible: false, reason: 'fora_da_faixa', message: null, tier: null, teams: null } })
    const { tree, navigation } = await mount([football], { [FOOTBALL_EVENTS]: page([full, ongoing]) })
    const [first, second] = rows(tree)
    const firstText = allText({ root: first } as never)
    expect(firstText).toContain('Liga em Curso')
    expect(firstText).toContain('· Quadra Central')
    expect(firstText).toContain('Em andamento')
    expect(firstText).toContain('Gratuita')
    expect(firstText).not.toContain('Você pode se inscrever')
    expect(byId(tree, 'state-badge-live')).toHaveLength(1)
    const secondText = allText({ root: second } as never)
    expect(secondText).toContain(brl('240'))
    expect(secondText).toContain('Vagas esgotadas')
    expect(secondText).not.toContain('Você pode se inscrever')
    expect(String(first.props.accessibilityLabel)).toMatch(/^Liga em Curso, .+ · Quadra Central, Em andamento, Gratuita, 3 de 8 times$/)
    await act(async () => { second.props.onPress() })
    expect(navigation.go).toHaveBeenLastCalledWith('event', { eventId: 22, sport: 'futebol' })
  })

  it('"Você pode se inscrever" com eligibility.eligible; "Ver todos" abre a lista na modalidade do primeiro campeonato exibido', async () => {
    const tennisCup = eventCard(31, { name: 'Aberto de Tênis', sport: 'tenis', starts_at: inDays(1), format: null })
    const { tree, navigation } = await mount([football, tennis], { [FOOTBALL_EVENTS]: page([eventCard(32, { starts_at: inDays(4) })]), [TENNIS_EVENTS]: page([tennisCup]) })
    expect(allText({ root: rows(tree)[0] } as never)).toContain('Você pode se inscrever')
    await pressButton(tree, 'Ver todos os campeonatos')
    expect(navigation.go).toHaveBeenLastCalledWith('events', { sport: 'tenis' })
  })

  it('sem campeonatos na mesma cidade: "Nenhum campeonato aberto em {cidade}", com "Ver campeonatos"; "Ver todos" na modalidade do primeiro perfil', async () => {
    const { tree, navigation } = await mount([tennis, football], { [FOOTBALL_EVENTS]: page([]), [TENNIS_EVENTS]: page([]) })
    expect(byId(tree, 'campeonatos-vazio')).toHaveLength(1)
    expect(section(tree)).toContain('Nenhum campeonato aberto em Brasília')
    await pressButton(tree, 'Ver a lista de campeonatos')
    expect(navigation.go).toHaveBeenLastCalledWith('events', { sport: 'tenis' })
    await pressButton(tree, 'Ver todos os campeonatos')
    expect(navigation.go).toHaveBeenLastCalledWith('events', { sport: 'tenis' })
  })

  it('cidades diferentes: "Campeonatos perto de você" e o vazio "Nenhum campeonato aberto perto de você"', async () => {
    const { tree } = await mount([football, runner], { [FOOTBALL_EVENTS]: page([]), [RUN_EVENTS]: page([]) })
    expect(callsTo('GET', RUN_EVENTS)).toHaveLength(1)
    expect(section(tree)).toContain('Campeonatos perto de você')
    expect(section(tree)).toContain('Nenhum campeonato aberto perto de você')
  })

  it('sem perfis: "Perto de você" e o cartão "Configure suas modalidades", que abre as modalidades; nenhuma leitura de eventos', async () => {
    const { tree, navigation } = await mount([])
    expect(eventCalls()).toHaveLength(0)
    expect(section(tree)).toContain('Perto de você')
    expect(section(tree)).not.toContain('Campeonatos')
    expect(findButton(tree, 'Ver todos os campeonatos')).toBeUndefined()
    await pressButton(tree, 'Configure suas modalidades. Para ver campeonatos perto de você')
    expect(navigation.go).toHaveBeenLastCalledWith('profile')
    expect(section(tree)).toContain('Para ver campeonatos perto de você')
  })

  it('falha em qualquer leitura: o erro só na seção, com "Tentar novamente", que lê de novo', async () => {
    let fail = true
    const { tree, onExpired } = await mount([football, tennis], {
      [FOOTBALL_EVENTS]: page([eventCard(41, { name: 'Copa Volta' })]),
      [TENNIS_EVENTS]: () => (fail ? new ApiError('Servidor com problema.', 500) : page([])),
    })
    expect(section(tree)).toContain('Não foi possível carregar os campeonatos')
    expect(section(tree)).toContain('Servidor com problema.')
    expect(rows(tree)).toHaveLength(0)
    // As demais seções seguem de pé.
    expect(allText(tree)).toContain('Seu elo')
    expect(allText(tree)).toContain('A arena te chama, Carlos')
    expect(onExpired).not.toHaveBeenCalled()
    fail = false
    await pressButton(tree, 'Tentar novamente')
    expect(callsTo('GET', TENNIS_EVENTS)).toHaveLength(2)
    expect(callsTo('GET', FOOTBALL_EVENTS)).toHaveLength(2)
    expect(rows(tree).map(row => row.props.testID)).toEqual(['campeonato-41'])
    expect(section(tree)).not.toContain('Não foi possível carregar os campeonatos')
  })

  it('401 em uma leitura de eventos encerra a sessão pelo fluxo existente', async () => {
    const { onExpired } = await mount([football], { [FOOTBALL_EVENTS]: new ApiError('Sessão expirada', 401) })
    expect(onExpired).toHaveBeenCalled()
  })

  it('falha nos perfis: erro só na seção, sem leitura de eventos; "Tentar novamente" relê os perfis e então os campeonatos', async () => {
    let fail = true
    const { tree } = await mount(() => (fail ? new ApiError('Fora do ar', 500) : [football]), { [FOOTBALL_EVENTS]: page([eventCard(51)]) })
    expect(eventCalls()).toHaveLength(0)
    expect(section(tree)).toContain('Não foi possível carregar os campeonatos')
    expect(section(tree)).toContain('Campeonatos perto de você')
    expect(byId(tree, 'proximo-passo')).toHaveLength(0)
    fail = false
    await pressButton(tree, 'Tentar novamente')
    await flush()
    expect(callsTo('GET', PROFILES)).toHaveLength(2)
    expect(callsTo('GET', FOOTBALL_EVENTS)).toHaveLength(1)
    expect(rows(tree)).toHaveLength(1)
  })
})

describe('Início: próximo passo e fim dos atalhos', () => {
  it('"Complete seu perfil esportivo" enquanto falta modalidade, depois de "Seu elo" e antes de Campeonatos; abre as modalidades', async () => {
    const { tree, navigation } = await mount([football], { [FOOTBALL_EVENTS]: page([]) })
    expect(byId(tree, 'proximo-passo')).toHaveLength(1)
    const text = allText(tree)
    expect(text).toContain('Seu próximo passo')
    expect(text).toContain('Mostre onde e como você gosta de jogar.')
    const order = ['Seu elo', 'Complete seu perfil esportivo', 'Campeonatos em Brasília'].map(item => text.indexOf(item))
    expect(order.every(index => index >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    await pressButton(tree, 'Complete seu perfil esportivo. Mostre onde e como você gosta de jogar.')
    expect(navigation.go).toHaveBeenLastCalledWith('profile')
  })

  it('sem perfis o cartão aparece; com as três modalidades, não', async () => {
    expect(byId((await mount([])).tree, 'proximo-passo')).toHaveLength(1)
    const { tree } = await mount([football, tennis, runner], { [FOOTBALL_EVENTS]: page([]), [TENNIS_EVENTS]: page([]), [RUN_EVENTS]: page([]) })
    expect(byId(tree, 'proximo-passo')).toHaveLength(0)
    expect(allText(tree)).not.toContain('Complete seu perfil esportivo')
    expect(eventCalls()).toHaveLength(3)
  })

  it('sem os grupos JOGAR, ORGANIZADOR e ADMINISTRAÇÃO, inclusive para quem administra', async () => {
    const { tree } = await mount([football], { [FOOTBALL_EVENTS]: page([]) }, admin)
    const text = allText(tree)
    expect(text).not.toMatch(/JOGAR|ORGANIZADOR|ADMINISTRAÇÃO/)
    for (const label of ['Meus times', 'Provas de corrida', 'Seja organizador', 'Meus eventos', 'Pedidos de organizador', 'Eventos pagos', 'Denúncias']) expect(findButton(tree, label)).toBeUndefined()
  })
})

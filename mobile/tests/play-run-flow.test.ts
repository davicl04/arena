import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import ArenaShell from '../src/screens/ArenaShell'
import { enableAct } from './support/native'
import { brasilia, emptyBoard, football, standings, tennis } from './support/play'
import { rankingPage } from './support/results'
import { bests, markCard } from './support/runs'
import { allText, findButton, flush, labelled, me, pressButton } from './support/review'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))
// Telas que carregam módulos nativos do Expo e não entram neste fluxo (a Comunidade, o Perfil e Meus times).
vi.mock('../src/screens/CommunityScreen', () => ({ default: () => null }))
vi.mock('../src/screens/ProfileScreen', () => ({ default: () => null }))
vi.mock('../src/screens/TeamsScreen', () => ({ default: () => null }))
vi.mock('../src/screens/UserProfileScreen', () => ({ default: () => null }))

/*
 * A corrida pelo shell, sem sósias: a placa do Jogar (`PlayScreen`) na aba Corrida abre o registro (K2) pelo botão da placa e
 * pelo "+" de um cartão de "Suas marcas", e o "Ver ranking" abre o Ranking real na corrida e na distância escolhida.
 */

const h = React.createElement
const trees: ReactTestRenderer[] = []
const running = { ...football, id: 3, sport: 'corrida' as const, position: null }

async function mountShell() {
  vi.mocked(request).mockImplementation(async (path: string) => {
    if (path === '/me/play') return emptyBoard() as never
    if (path === '/me/sports-profiles') return [football, tennis, running] as never
    if (path === '/cities') return [brasilia] as never
    if (path === '/me/standings') return standings() as never
    if (path === '/me/run-bests') return bests(markCard(10, ['52:40'])) as never
    if (path === '/me/run-races') return { items: [] } as never
    if (path === '/me/notifications/unread-count') return { unread_count: 0 } as never
    if (path.startsWith('/rankings')) return rankingPage({ ranking: 'corrida_10', distance_km: 10 }) as never
    return { items: [], next_cursor: null } as never
  })
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(h(ArenaShell, { user: me, onUser: vi.fn(), onLogout: vi.fn(), onExpired: vi.fn() })) })
  trees.push(tree)
  await flush()
  await pressButton(tree, 'JOGAR')
  await pressButton(tree, 'Corrida')
  return tree
}
/** Estado do chip (ou da distância do K2) pelo nome; o último casa com a folha, que fica por cima da placa. */
const stateOf = (tree: ReactTestRenderer, label: string) => labelled(tree, label).filter(node => node.props.accessibilityRole === 'radio').at(-1)?.props.accessibilityState
/** Escolhe o chip (rádio) de rótulo `label`: o `pressButton` pegaria também os cartões das marcas, que repetem o texto. */
const choose = (tree: ReactTestRenderer, label: string) => act(async () => {
  labelled(tree, label).filter(node => node.props.accessibilityRole === 'radio')[0].props.onPress()
})
const rankingCalls = () => vi.mocked(request).mock.calls.map(([path]) => String(path)).filter(path => path.startsWith('/rankings'))

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})
afterEach(async () => {
  for (const tree of trees.splice(0)) await act(async () => { tree.unmount() })
})

describe('Corrida pelo Jogar', () => {
  it('a placa traz o registro no lugar do botão redondo e, abaixo, "Suas marcas"', async () => {
    const tree = await mountShell()
    expect(findButton(tree, 'Registrar corrida')).toBeTruthy()
    expect(allText(tree)).toContain('Suas marcas')
    expect(allText(tree)).not.toContain('chega na próxima atualização')
  })

  it('"Registrar corrida" abre o K2 na distância dos chips; Fechar volta à placa', async () => {
    const tree = await mountShell()
    await choose(tree, '21 km')
    await pressButton(tree, 'Registrar corrida')
    expect(findButton(tree, 'Salvar corrida')).toBeTruthy()
    expect(stateOf(tree, '21 km')).toMatchObject({ checked: true })
    await pressButton(tree, 'Fechar')
    expect(findButton(tree, 'Salvar corrida')).toBeUndefined()
    expect(findButton(tree, 'Registrar corrida')).toBeTruthy()
  })

  it('o "+" do cartão abre o K2 na distância do cartão', async () => {
    const tree = await mountShell()
    await pressButton(tree, 'Registrar 10 km')
    expect(findButton(tree, 'Salvar corrida')).toBeTruthy()
    expect(stateOf(tree, '10 km')).toMatchObject({ checked: true })
  })

  it('"Ver ranking" abre o Ranking real na corrida e na distância escolhida', async () => {
    const tree = await mountShell()
    await choose(tree, '10 km')
    await pressButton(tree, 'Ver ranking')
    expect(rankingCalls().at(-1)).toBe('/rankings?sport=corrida&distance_km=10&limit=20')
    expect(allText(tree)).toContain('Ranking')
    expect(stateOf(tree, 'Corrida')).toMatchObject({ checked: true })
    expect(stateOf(tree, '10 km')).toMatchObject({ checked: true })
  })

  it('voltar ao Início relê a classificação: a marca salva na corrida aparece no cartão da modalidade', async () => {
    const tree = await mountShell()
    const reads = () => vi.mocked(request).mock.calls.filter(([path]) => path === '/me/standings').length
    const before = reads()
    await pressButton(tree, 'Início')
    expect(reads()).toBe(before + 1)
  })
})

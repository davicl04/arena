import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import ArenaShell from '../src/screens/ArenaShell'
import { enableAct } from './support/native'
import { athleteSide, brasilia, caio, football, matchCard, matchDetail, messagePage, playBoard, ricardo, sides, standings, teamSide, tennis, ferrugemRef, leoesRef } from './support/play'
import { allText, findButton, flush, me, pressButton, pressPrefix, serve } from './support/review'

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
 * Fluxo integrado pelo shell, sem sósias: a placa do Jogar (`PlayScreen`) abre a tela real da partida (`MatchScreen`) e o
 * voltar devolve a placa na mesma modalidade. O shell não põe a faixa "arena." acima da placa.
 */

const h = React.createElement
const trees: ReactTestRenderer[] = []
const futebol = matchCard({ id: 50, sides: sides(teamSide('a', ferrugemRef), teamSide('b', leoesRef)) })
const tenis = matchCard({ id: 61, sport: 'tenis', format: null, sides: [athleteSide('a', ricardo), athleteSide('b', caio)] })
const unread = { unread_count: 0 }

async function mountShell() {
  serve({
    '/me/play': playBoard({ matches: [futebol, tenis] }),
    '/me/sports-profiles': [football, tennis],
    '/cities': [brasilia],
    '/me/standings': standings(),
    '/me/notifications/unread-count': unread,
    '/matches/50': matchDetail({ id: 50, sides: futebol.sides }),
    '/matches/50/messages': messagePage([]),
    '/matches/61': matchDetail({ id: 61, sport: 'tenis', format: null, sides: tenis.sides }),
    '/matches/61/messages': messagePage([]),
  })
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(h(ArenaShell, { user: me, onUser: vi.fn(), onLogout: vi.fn(), onExpired: vi.fn() })) })
  trees.push(tree)
  await flush()
  return tree
}
const selected = (tree: ReactTestRenderer) => ['Futebol', 'Tênis', 'Corrida'].filter(name =>
  tree.root.findAllByType('Pressable' as never).some(item => item.props.accessibilityRole === 'tab' && item.props.accessibilityLabel === name && item.props.accessibilityState?.selected))

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})
afterEach(async () => {
  for (const tree of trees.splice(0)) await act(async () => { tree.unmount() })
})

describe('Jogar pelo shell: placa e partida', () => {
  it('a placa abre sem a faixa "arena." do shell e a partida de futebol abre a tela real; o voltar retoma a placa', async () => {
    const tree = await mountShell()
    await pressButton(tree, 'JOGAR')
    expect(allText(tree)).toContain('Jogar')
    expect(allText(tree)).not.toContain('arena.')
    expect(selected(tree)).toEqual(['Futebol'])
    await pressPrefix(tree, 'Ferrugem FC')
    // A tela real da partida: pede o detalhe e o chat, e traz a própria barra (Voltar).
    expect(vi.mocked(request).mock.calls.some(([path]) => path === '/matches/50')).toBe(true)
    expect(findButton(tree, 'Voltar')).toBeTruthy()
    await pressButton(tree, 'Voltar')
    expect(findButton(tree, 'JOGAR')).toBeTruthy()
    expect(selected(tree)).toEqual(['Futebol'])
  })

  it('voltar da partida de tênis retoma a placa na aba Tênis', async () => {
    const tree = await mountShell()
    await pressButton(tree, 'JOGAR')
    await pressButton(tree, 'Tênis')
    expect(selected(tree)).toEqual(['Tênis'])
    await pressPrefix(tree, 'Ricardo Moura')
    expect(vi.mocked(request).mock.calls.some(([path]) => path === '/matches/61')).toBe(true)
    await pressButton(tree, 'Voltar')
    expect(selected(tree)).toEqual(['Tênis'])
  })
})

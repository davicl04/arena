import { act } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import { appState, enableAct } from './support/native'
import { matchRoutes, mountMatch, tick, unmountAll } from './support/match'
import { messagePage, scheduled } from './support/play'
import { acting, result } from './support/results'
import { allText, callsTo } from './support/review'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

beforeEach(() => {
  enableAct()
  appState.reset()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-12T15:00:00Z'))
})
afterEach(async () => { await unmountAll(); vi.useRealTimers(); appState.reset() })

async function setup() {
  const before = scheduled(0.01)
  const after = { ...before, phase: 'informar_resultado' as const, result: result(), permissions: acting() }
  let fail = false
  const mounted = await mountMatch(matchRoutes(before, {
    '/matches/1': () => Date.now() < Date.parse(before.starts_at!) ? before : fail ? (() => { throw new ApiError('Sem conexão', 503) })() : after,
    '/matches/1/messages?after=0': messagePage([]),
    '/matches/1/stats': { items: [] },
  }), { fake: true })
  return { ...mounted, fail: (value: boolean) => { fail = value } }
}

it('libera o placar no início mesmo sem novos eventos no chat', async () => {
  const { tree } = await setup()
  expect(allText(tree)).not.toContain('Informe o placar')
  await tick(36_000)
  expect(allText(tree)).toContain('Informe o placar')
  expect(callsTo('GET', '/matches/1')).toHaveLength(2)
  await unmountAll()
  await tick(60_000)
  expect(callsTo('GET', '/matches/1')).toHaveLength(2)
})

it('pausa em segundo plano e relê ao voltar depois do início', async () => {
  const { tree } = await setup()
  await act(async () => { appState.set('background') })
  await tick(60_000)
  expect(callsTo('GET', '/matches/1')).toHaveLength(1)
  await act(async () => { appState.set('active') })
  expect(allText(tree)).toContain('Informe o placar')
})

it('repete a leitura após falha de rede sem entrar em loop', async () => {
  const state = await setup()
  state.fail(true)
  await tick(36_000)
  expect(callsTo('GET', '/matches/1')).toHaveLength(2)
  state.fail(false)
  await tick(15_000)
  expect(callsTo('GET', '/matches/1')).toHaveLength(3)
  expect(allText(state.tree)).toContain('Informe o placar')
})

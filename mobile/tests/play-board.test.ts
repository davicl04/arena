import React, { useEffect } from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import { useNow } from '../src/hooks/useNow'
import { PLAY_BOARD_POLL_MS, usePlayBoard } from '../src/hooks/usePlayBoard'
import type { PlayBoardState } from '../src/hooks/usePlayBoard'
import { useRunBests } from '../src/hooks/useRunBests'
import { appState, enableAct } from './support/native'
import { matchCard, playBoard, search } from './support/play'
import { bests, markCard } from './support/runs'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
let current!: PlayBoardState
function BoardProbe({ onExpired, active }: { onExpired: () => void; active: boolean }) {
  const state = usePlayBoard(onExpired, active)
  useEffect(() => { current = state })
  return null
}
async function mount(props: { onExpired?: () => void; active?: boolean } = {}) {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(h(BoardProbe, { onExpired: props.onExpired ?? vi.fn(), active: props.active ?? false })) })
  return tree
}
const rerender = (tree: ReactTestRenderer, props: { onExpired?: () => void; active: boolean }) =>
  act(async () => { tree.update(h(BoardProbe, { onExpired: props.onExpired ?? vi.fn(), active: props.active })) })
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const playReads = () => vi.mocked(request).mock.calls.filter(([path]) => path === '/me/play').length

beforeEach(() => {
  enableAct()
  appState.reset()
  vi.useFakeTimers()
  vi.mocked(request).mockReset().mockResolvedValue(playBoard() as never)
})
afterEach(() => { vi.useRealTimers() })

describe('usePlayBoard: a placa do Jogar (GET /me/play)', () => {
  it('lê a placa ao montar e entrega as listas completas', async () => {
    vi.mocked(request).mockResolvedValue({ attention: false } as never)
    const tree = await mount()
    expect(current.loading).toBe(false)
    expect(current.error).toBe('')
    expect(current.board).toEqual({ attention: false, searches: [], proposals: [], offers: [], matches: [] })
    expect(playReads()).toBe(1)
    await act(async () => { tree.unmount() })
  })

  it('sem atenção, não há leitura periódica', async () => {
    const tree = await mount()
    await advance(5 * PLAY_BOARD_POLL_MS)
    expect(playReads()).toBe(1)
    await act(async () => { tree.unmount() })
  })

  it('com atenção, relê a cada 15 s; ao acabar a atenção, para; ao desmontar, para', async () => {
    vi.mocked(request).mockResolvedValue(playBoard({ searches: [search()] }) as never)
    const tree = await mount()
    expect(current.board?.attention).toBe(true)
    await advance(PLAY_BOARD_POLL_MS)
    expect(playReads()).toBe(2)
    await advance(PLAY_BOARD_POLL_MS)
    expect(playReads()).toBe(3)
    vi.mocked(request).mockResolvedValue(playBoard() as never)
    await advance(PLAY_BOARD_POLL_MS)
    expect(playReads()).toBe(4)
    expect(current.board?.attention).toBe(false)
    await advance(3 * PLAY_BOARD_POLL_MS)
    expect(playReads()).toBe(4)
    await act(async () => { tree.unmount() })
    expect(vi.getTimerCount()).toBe(0)
    expect(appState.listeners).toHaveLength(0)
  })

  it('com o app em segundo plano a leitura periódica pausa; ao voltar, relê e retoma', async () => {
    vi.mocked(request).mockResolvedValue(playBoard({ matches: [matchCard()] }) as never)
    const tree = await mount()
    expect(current.board?.attention).toBe(true)
    await act(async () => { appState.set('background') })
    await advance(4 * PLAY_BOARD_POLL_MS)
    expect(playReads()).toBe(1)
    await act(async () => { appState.set('active') })
    expect(playReads()).toBe(2)
    await advance(PLAY_BOARD_POLL_MS)
    expect(playReads()).toBe(3)
    await act(async () => { appState.set('inactive') })
    await advance(2 * PLAY_BOARD_POLL_MS)
    expect(playReads()).toBe(3)
    await act(async () => { tree.unmount() })
  })

  it('voltar ao app logo após a última leitura (menos de 3 s) reaproveita a placa', async () => {
    const tree = await mount()
    await act(async () => { appState.set('background') })
    await act(async () => { appState.set('active') })
    expect(playReads()).toBe(1)
    await advance(4000)
    await act(async () => { appState.set('active') })
    expect(playReads()).toBe(2)
    await act(async () => { tree.unmount() })
  })

  it('abrir o Jogar ou o Início (active) relê a placa velha, mas não a recém-lida', async () => {
    const tree = await mount({ active: false })
    await rerender(tree, { active: true })
    expect(playReads()).toBe(1)
    await rerender(tree, { active: false })
    await advance(5000)
    await rerender(tree, { active: true })
    expect(playReads()).toBe(2)
    await act(async () => { tree.unmount() })
  })

  it('um app que já abre em segundo plano não lê a cada 15 s até voltar', async () => {
    appState.current = 'background'
    vi.mocked(request).mockResolvedValue(playBoard({ searches: [search()] }) as never)
    const tree = await mount()
    await advance(3 * PLAY_BOARD_POLL_MS)
    expect(playReads()).toBe(1)
    await act(async () => { tree.unmount() })
  })

  it('"reload" devolve a placa nova; a resposta antiga é descartada', async () => {
    const first = playBoard({ searches: [search({ id: 1 })] })
    const second = playBoard({ searches: [search({ id: 2 })] })
    const releases: (() => void)[] = []
    vi.mocked(request).mockImplementation(() => new Promise(resolve => {
      const board = releases.length === 0 ? first : second
      releases.push(() => resolve(board as never))
    }))
    const tree = await mount()
    let older: Promise<unknown> | undefined
    let newer: Promise<unknown> | undefined
    await act(async () => { older = current.reload(); newer = current.reload() })
    expect(releases).toHaveLength(3)
    await act(async () => { releases[2](); releases[1](); releases[0]() })
    expect(await newer).toEqual(second)
    expect(await older).toBeNull()
    expect(current.board?.searches[0].id).toBe(2)
    await act(async () => { tree.unmount() })
  })

  it('erro mantém a placa anterior e mostra a mensagem; 401 chama onExpired', async () => {
    const expired = vi.fn()
    vi.mocked(request).mockResolvedValueOnce(playBoard({ searches: [search()] }) as never)
    const tree = await mount({ onExpired: expired })
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Fora do ar', 500))
    let result: unknown = 'x'
    await act(async () => { result = await current.reload() })
    expect(result).toBeNull()
    expect(current.error).toBe('Fora do ar')
    expect(current.board?.attention).toBe(true)
    expect(expired).not.toHaveBeenCalled()
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Sessão expirada', 401))
    await act(async () => { await current.reload() })
    expect(expired).toHaveBeenCalledTimes(1)
    vi.mocked(request).mockRejectedValueOnce('texto solto')
    await act(async () => { await current.reload() })
    expect(current.error).toBe('Não foi possível carregar a placa.')
    vi.mocked(request).mockResolvedValueOnce(playBoard() as never)
    await act(async () => { await current.reload() })
    expect(current.error).toBe('')
    await act(async () => { tree.unmount() })
  })

  it('a leitura que falha na primeira vez deixa a placa nula, sem carregando', async () => {
    vi.mocked(request).mockRejectedValue(new ApiError('Fora do ar', 500))
    const tree = await mount()
    expect(current.board).toBeNull()
    expect(current.loading).toBe(false)
    expect(current.error).toBe('Fora do ar')
    await act(async () => { tree.unmount() })
  })

  it('"Responder depois": a proposta adiada fica só na memória, sem repetir', async () => {
    const tree = await mount()
    expect(current.deferred).toEqual([])
    await act(async () => { current.defer(50); current.defer(50); current.defer(51) })
    expect(current.deferred).toEqual([50, 51])
    await act(async () => { tree.unmount() })
  })

  it('usa o onExpired mais novo, sem ler de novo', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const tree = await mount({ onExpired: first })
    await rerender(tree, { onExpired: second, active: false })
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Sessão expirada', 401))
    await act(async () => { await current.reload() })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    await act(async () => { tree.unmount() })
  })
})

describe('useNow: o relógio das contagens', () => {
  let value = 0
  function NowProbe({ interval, enabled }: { interval: number; enabled: boolean }) {
    const now = useNow(interval, enabled)
    useEffect(() => { value = now })
    return null
  }

  it('atualiza a cada intervalo, pausa quando desligado e relê o relógio ao voltar ao primeiro plano', async () => {
    vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 0))
    let tree!: ReactTestRenderer
    await act(async () => { tree = create(h(NowProbe, { interval: 1000, enabled: true })) })
    const start = value
    await advance(3000)
    expect(value).toBe(start + 3000)
    await act(async () => { tree.update(h(NowProbe, { interval: 1000, enabled: false })) })
    const frozen = value
    await advance(5000)
    expect(value).toBe(frozen)
    expect(appState.listeners).toHaveLength(0)
    await act(async () => { tree.update(h(NowProbe, { interval: 60_000, enabled: true })) })
    vi.setSystemTime(Date.now() + 10 * 60_000)
    await act(async () => { appState.set('background') })
    expect(value).toBe(frozen)
    await act(async () => { appState.set('active') })
    expect(value).toBe(Date.now())
    await act(async () => { tree.unmount() })
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('useRunBests: os cartões de "Suas marcas"', () => {
  let state!: ReturnType<typeof useRunBests>
  function RunProbe({ enabled, onExpired }: { enabled: boolean; onExpired: () => void }) {
    const bests = useRunBests(onExpired, enabled)
    useEffect(() => { state = bests })
    return null
  }

  it('lê quando habilitado, recarrega sem limpar a tela e trata o 401', async () => {
    const expired = vi.fn()
    vi.mocked(request).mockResolvedValue(bests(markCard(5, ['24:12'])) as never)
    let tree!: ReactTestRenderer
    await act(async () => { tree = create(h(RunProbe, { enabled: false, onExpired: expired })) })
    expect(vi.mocked(request)).not.toHaveBeenCalled()
    expect(state.items).toEqual([])
    expect(state.loaded).toBe(false)
    await act(async () => { tree.update(h(RunProbe, { enabled: true, onExpired: expired })) })
    expect(vi.mocked(request)).toHaveBeenCalledWith('/me/run-bests')
    expect(state.loaded).toBe(true)
    expect(state.items.map(item => item.distance_km)).toEqual([3, 5, 10, 21, 42])
    vi.mocked(request).mockResolvedValue(bests(markCard(5, ['24:12']), markCard(10, ['50:00'])) as never)
    await act(async () => { await state.refresh() })
    expect(state.items.find(item => item.distance_km === 10)?.state).toBe('ranqueado')
    vi.mocked(request).mockRejectedValue(new ApiError('Fora do ar', 500))
    await act(async () => { await state.refresh() })
    expect(expired).not.toHaveBeenCalled()
    expect(state.items).toHaveLength(5)
    vi.mocked(request).mockRejectedValue(new ApiError('Sessão expirada', 401))
    await act(async () => { await state.refresh() })
    expect(expired).toHaveBeenCalledTimes(1)
    await act(async () => { tree.unmount() })
  })
})

import React, { useEffect } from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import { NOTIFICATION_SUMMARY_POLL_MS, summaryCount, useNotificationSummary } from '../src/hooks/useNotificationSummary'
import type { NotificationSummaryState } from '../src/hooks/useNotificationSummary'
import { appState, enableAct } from './support/native'
import { summaryOf } from './support/notifications'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
let current!: NotificationSummaryState
function Probe({ onExpired, tab }: { onExpired: () => void; tab: string }) {
  const state = useNotificationSummary(onExpired, tab)
  useEffect(() => { current = state })
  return null
}
async function mount(props: { onExpired?: () => void; tab?: string } = {}) {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(h(Probe, { onExpired: props.onExpired ?? vi.fn(), tab: props.tab ?? 'home' })) })
  return tree
}
const rerender = (tree: ReactTestRenderer, tab: string, onExpired: () => void = vi.fn()) => act(async () => { tree.update(h(Probe, { onExpired, tab })) })
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const reads = () => vi.mocked(request).mock.calls.filter(([path]) => path === '/me/notifications/summary').length

beforeEach(() => {
  enableAct()
  appState.reset()
  vi.useFakeTimers()
  vi.mocked(request).mockReset().mockResolvedValue(summaryOf({ unread_count: 2, follow_requests_count: 1 }) as never)
})
afterEach(() => { vi.useRealTimers() })

describe('useNotificationSummary: o resumo das notificações (GET /me/notifications/summary)', () => {
  it('lê ao montar e entrega o resumo e o número do sino (não lidas mais pedidos para seguir)', async () => {
    const tree = await mount()
    expect(reads()).toBe(1)
    expect(current.data).toEqual(summaryOf({ unread_count: 2, follow_requests_count: 1 }))
    expect(current.count).toBe(3)
    await act(async () => { tree.unmount() })
  })

  it('antes da primeira resposta não há resumo e o número é 0; summaryCount tolera campos ausentes', async () => {
    vi.mocked(request).mockReturnValue(new Promise(() => undefined) as never)
    const tree = await mount()
    expect(current.data).toBeNull()
    expect(current.count).toBe(0)
    expect([summaryCount(null), summaryCount({} as never), summaryCount(summaryOf({ unread_count: 4 }))]).toEqual([0, 0, 4])
    await act(async () => { tree.unmount() })
  })

  it('relê na troca de aba raiz, e só nela', async () => {
    const tree = await mount({ tab: 'home' })
    await rerender(tree, 'home')
    expect(reads()).toBe(1)
    await rerender(tree, 'ranking')
    expect(reads()).toBe(2)
    await rerender(tree, 'profile')
    expect(reads()).toBe(3)
    await act(async () => { tree.unmount() })
  })

  it('relê quando o app volta ao primeiro plano', async () => {
    const tree = await mount()
    await act(async () => { appState.set('background') })
    expect(reads()).toBe(1)
    await act(async () => { appState.set('active') })
    expect(reads()).toBe(2)
    await act(async () => { tree.unmount() })
  })

  it('relê a cada 60 s só em primeiro plano; em segundo plano o intervalo pausa e retoma ao voltar', async () => {
    const tree = await mount()
    await advance(NOTIFICATION_SUMMARY_POLL_MS)
    expect(reads()).toBe(2)
    await advance(NOTIFICATION_SUMMARY_POLL_MS)
    expect(reads()).toBe(3)
    await act(async () => { appState.set('background') })
    await advance(5 * NOTIFICATION_SUMMARY_POLL_MS)
    expect(reads()).toBe(3)
    await act(async () => { appState.set('active') })
    expect(reads()).toBe(4)
    await advance(NOTIFICATION_SUMMARY_POLL_MS)
    expect(reads()).toBe(5)
    await act(async () => { tree.unmount() })
    expect(vi.getTimerCount()).toBe(0)
    expect(appState.listeners).toHaveLength(0)
  })

  it('o app já em segundo plano ao montar não lê no intervalo até voltar', async () => {
    appState.set('background')
    const tree = await mount()
    expect(reads()).toBe(1)
    await advance(3 * NOTIFICATION_SUMMARY_POLL_MS)
    expect(reads()).toBe(1)
    await act(async () => { tree.unmount() })
  })

  it('`setData` troca o resumo (ler, ler todas) e descarta a leitura que ainda estava em curso', async () => {
    let release!: (value: unknown) => void
    vi.mocked(request).mockReturnValueOnce(new Promise(resolve => { release = resolve }) as never)
    const tree = await mount()
    await act(async () => { current.setData(summaryOf({ unread_count: 0, pending_count: 2 })) })
    expect(current.count).toBe(0)
    expect(current.data?.pending_count).toBe(2)
    await act(async () => { release(summaryOf({ unread_count: 7 })) })
    expect(current.data?.unread_count).toBe(0)
    await act(async () => { tree.unmount() })
  })

  it('`reload` mantém o resumo anterior na tela; uma leitura que falha não o zera nem expira a sessão', async () => {
    const onExpired = vi.fn()
    const tree = await mount({ onExpired })
    vi.mocked(request).mockRejectedValue(new ApiError('Fora do ar', 500))
    await act(async () => { current.reload() })
    expect(current.count).toBe(3)
    expect(onExpired).not.toHaveBeenCalled()
    await act(async () => { tree.unmount() })
  })

  it('a resposta mais antiga que outra leitura é descartada', async () => {
    let releaseFirst!: (value: unknown) => void
    vi.mocked(request).mockReturnValueOnce(new Promise(resolve => { releaseFirst = resolve }) as never)
    const tree = await mount()
    vi.mocked(request).mockResolvedValue(summaryOf({ unread_count: 9 }) as never)
    await act(async () => { current.reload() })
    expect(current.data?.unread_count).toBe(9)
    await act(async () => { releaseFirst(summaryOf({ unread_count: 1 })) })
    expect(current.data?.unread_count).toBe(9)
    await act(async () => { tree.unmount() })
  })

  it('401 chama onExpired (a versão mais recente); respostas fora do formato são ignoradas', async () => {
    vi.mocked(request).mockResolvedValue(null as never)
    const tree = await mount()
    expect(current.data).toBeNull()
    const first = vi.fn()
    const second = vi.fn()
    vi.mocked(request).mockRejectedValue(new ApiError('Sessão expirada', 401))
    await rerender(tree, 'home', first)
    await rerender(tree, 'ranking', second)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    await act(async () => { tree.unmount() })
  })
})

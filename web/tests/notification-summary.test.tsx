import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { ApiError, request } from '../src/api/client'
import type { NotificationSummary } from '../src/api/notifications'
import { NOTIFICATION_SUMMARY_POLL_MS, useNotificationSummary } from '../src/hooks/useNotificationSummary'
import { summaryOf } from './notifications-fixtures'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(),
}))

let visibility: DocumentVisibilityState
const reads = () => vi.mocked(request).mock.calls.filter(([path]) => path === '/me/notifications/summary').length
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const setVisibility = (state: DocumentVisibilityState) => { visibility = state }

beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  vi.mocked(request).mockReset()
  vi.mocked(request).mockResolvedValue(summaryOf({ unread_count: 2, follow_requests_count: 1 }) as never)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Reflect.deleteProperty(document, 'visibilityState')
})

const setup = (onExpired = vi.fn(), root = 'home') => {
  const view = renderHook(({ root: current }) => useNotificationSummary(onExpired, current), { initialProps: { root } })
  return { ...view, onExpired }
}

describe('useNotificationSummary', () => {
  it('lê o resumo ao montar e soma não lidas e pedidos para seguir', async () => {
    const { result } = setup()
    expect(result.current.data).toBeNull()
    expect(result.current.count).toBe(0)
    await flush()
    expect(reads()).toBe(1)
    expect(result.current.data?.unread_count).toBe(2)
    expect(result.current.count).toBe(3)
  })

  it('lê de novo quando a aba raiz muda, sem esvaziar o número enquanto lê', async () => {
    const { result, rerender } = setup()
    await flush()
    let release: (summary: NotificationSummary) => void = () => {}
    vi.mocked(request).mockReturnValueOnce(new Promise(resolve => { release = resolve as never }) as never)
    rerender({ root: 'ranking' })
    await flush()
    expect(reads()).toBe(2)
    expect(result.current.count).toBe(3)
    release(summaryOf({ unread_count: 5 }))
    await flush()
    expect(result.current.count).toBe(5)
    // A mesma aba de novo não lê.
    rerender({ root: 'ranking' })
    await flush()
    expect(reads()).toBe(2)
  })

  it('lê de novo ao voltar o foco para a janela, mas não duas vezes seguidas', async () => {
    setup()
    await flush()
    await advance(5_000)
    act(() => { window.dispatchEvent(new Event('focus')) })
    await flush()
    expect(reads()).toBe(2)
    // Foco e visibilitychange costumam vir juntos: a segunda leitura é reaproveitada.
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    await flush()
    expect(reads()).toBe(2)
  })

  it('lê de novo quando a aba volta a ficar visível, e não lê enquanto ela está oculta', async () => {
    setup()
    await flush()
    await advance(5_000)
    setVisibility('hidden')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    await flush()
    expect(reads()).toBe(1)
    setVisibility('visible')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    await flush()
    expect(reads()).toBe(2)
  })

  it('lê a cada 60 s com a página visível e não lê com ela oculta', async () => {
    setup()
    await flush()
    await advance(NOTIFICATION_SUMMARY_POLL_MS)
    expect(reads()).toBe(2)
    await advance(NOTIFICATION_SUMMARY_POLL_MS)
    expect(reads()).toBe(3)
    setVisibility('hidden')
    await advance(NOTIFICATION_SUMMARY_POLL_MS * 3)
    expect(reads()).toBe(3)
    setVisibility('visible')
    await advance(NOTIFICATION_SUMMARY_POLL_MS)
    expect(reads()).toBe(4)
  })

  it('para de ler ao desmontar', async () => {
    const { unmount } = setup()
    await flush()
    unmount()
    await advance(NOTIFICATION_SUMMARY_POLL_MS * 2)
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(reads()).toBe(1)
  })

  it('setData aplica o resumo da resposta e descarta a leitura em andamento', async () => {
    const { result } = setup()
    await flush()
    let release: (summary: NotificationSummary) => void = () => {}
    vi.mocked(request).mockReturnValueOnce(new Promise(resolve => { release = resolve as never }) as never)
    await act(async () => { void result.current.reload() })
    act(() => { result.current.setData(summaryOf({ unread_count: 0, follow_requests_count: 0, pending_count: 1 })) })
    expect(result.current.count).toBe(0)
    release(summaryOf({ unread_count: 9 }))
    await flush()
    expect(result.current.count).toBe(0)
    expect(result.current.data?.pending_count).toBe(1)
  })

  it('mantém o último resumo quando uma leitura falha e guarda a mensagem', async () => {
    const { result } = setup()
    await flush()
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Sem conexão.', 503))
    await act(async () => { await result.current.reload() })
    expect(result.current.count).toBe(3)
    expect(result.current.error).toBe('Sem conexão.')
    await act(async () => { await result.current.reload() })
    expect(result.current.error).toBe('')
  })

  it('sessão expirada (401) chama onExpired', async () => {
    vi.mocked(request).mockRejectedValue(new ApiError('Sessão expirada.', 401))
    const { onExpired } = setup()
    await flush()
    expect(onExpired).toHaveBeenCalledTimes(1)
  })
})

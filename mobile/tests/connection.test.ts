import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHECK_TIMEOUT_MS, RESTORED_MS, RETRY_DELAYS_MS, RETRY_STEADY_MS, connection as appConnection, createConnectionStore } from '../src/api/connection'
import type { ConnectionStore } from '../src/api/connection'

const HEALTH = 'http://api.test/health/ready'
let store: ConnectionStore
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-13T12:00:00Z'))
  fetchMock = vi.fn().mockRejectedValue(new TypeError('network'))
  vi.stubGlobal('fetch', fetchMock)
  store = createConnectionStore({ healthUrl: HEALTH })
})
afterEach(() => { store.reset(); vi.useRealTimers() })

describe('loja de conexão: ligar o aviso', () => {
  it('começa online; uma leitura que falha só liga a faixa e agenda a nova tentativa em 5 s', () => {
    expect(store.getState()).toMatchObject({ status: 'online', sheetOpen: false, sheetDismissed: false, nextRetryAt: null, checking: false, nudge: 0 })
    store.lost({ mutating: false })
    expect(store.getState()).toMatchObject({ status: 'offline', sheetOpen: false, nextRetryAt: Date.now() + 5000 })
  })

  it('uma ação que falha abre a folha uma vez; as próximas falhas não a reabrem', () => {
    store.lost({ mutating: true })
    expect(store.getState().sheetOpen).toBe(true)
    store.lost({ mutating: true })
    expect(store.getState()).toMatchObject({ sheetOpen: true, nudge: 0 })
  })

  it('leitura em segundo plano nunca abre a folha, mesmo que o método altere dados', () => {
    store.lost({ mutating: false, background: true })
    store.lost({ mutating: true, background: true })
    expect(store.getState()).toMatchObject({ status: 'offline', sheetOpen: false, nudge: 0 })
  })

  it('a mesma falha não conta duas vezes (o cliente e o useSubmit chamam com a mesma causa)', () => {
    const cause = new Error('sem rede')
    store.lost({ mutating: true, cause })
    store.dismissSheet()
    store.attempted(cause)
    expect(store.getState().nudge).toBe(0)
    store.attempted(new Error('outra'))
    expect(store.getState().nudge).toBe(1)
  })

  it('"Continuar sem conexão" dispensa a folha: a próxima ação não a reabre e faz a faixa tremer', () => {
    store.lost({ mutating: true })
    store.dismissSheet()
    expect(store.getState()).toMatchObject({ sheetOpen: false, sheetDismissed: true })
    store.attempted()
    store.attempted()
    expect(store.getState()).toMatchObject({ sheetOpen: false, sheetDismissed: true, nudge: 2 })
    store.dismissSheet()
    expect(store.getState().nudge).toBe(2)
  })

  it('uma ação tentada com o app ainda online (erro já classificado pelo hook) liga o aviso e abre a folha', () => {
    store.attempted()
    expect(store.getState()).toMatchObject({ status: 'offline', sheetOpen: true })
  })
})

describe('loja de conexão: reconexão', () => {
  it('consulta o /health/ready em 5, 10 e 20 s e depois a cada 30 s, sem enviar Bearer', async () => {
    store.lost({ mutating: false })
    expect(RETRY_DELAYS_MS).toEqual([5000, 10000, 20000])
    expect(RETRY_STEADY_MS).toBe(30000)
    const waits: number[] = []
    for (const delay of [5000, 10000, 20000, 30000, 30000]) {
      waits.push(store.getState().nextRetryAt! - Date.now())
      const before = fetchMock.mock.calls.length
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(fetchMock).toHaveBeenCalledTimes(before)
      await vi.advanceTimersByTimeAsync(1)
      expect(fetchMock).toHaveBeenCalledTimes(before + 1)
    }
    expect(waits).toEqual([5000, 10000, 20000, 30000, 30000])
    expect(fetchMock.mock.calls[0][0]).toBe(HEALTH)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store' })
    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined()
    expect(store.getState()).toMatchObject({ status: 'offline', checking: false })
  })

  it('"Tentar agora" consulta já e não empilha consultas enquanto uma está em andamento', async () => {
    let finish!: (response: Response) => void
    fetchMock.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve }))
    store.lost({ mutating: false })
    store.retryNow()
    store.retryNow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(store.getState().checking).toBe(true)
    finish(new Response('{}', { status: 503 }))
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState()).toMatchObject({ status: 'offline', checking: false, nextRetryAt: Date.now() + 10_000 })
  })

  it('"Tentar agora" com o app online não faz nada', () => {
    store.retryNow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('o /health/ready responder bem restabelece: fecha a folha, avisa quem ouve e, em 2,5 s, volta a online sem a dispensa', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    const restored = vi.fn()
    store.onRestored(restored)
    store.lost({ mutating: true })
    store.dismissSheet()
    store.retryNow()
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState()).toMatchObject({ status: 'restored', sheetOpen: false, sheetDismissed: true, nextRetryAt: null, checking: false })
    expect(restored).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(RESTORED_MS - 1)
    expect(store.getState().status).toBe('restored')
    await vi.advanceTimersByTimeAsync(1)
    expect(store.getState()).toMatchObject({ status: 'online', sheetDismissed: false })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('qualquer resposta HTTP do cliente também restabelece, e `reached` com o app online não faz nada', () => {
    const restored = vi.fn()
    store.onRestored(restored)
    store.reached()
    expect(store.getState().status).toBe('online')
    store.lost({ mutating: false })
    store.reached()
    expect(store.getState().status).toBe('restored')
    expect(restored).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('perder a conexão de novo durante "restabelecida" volta a offline e recomeça a contagem de tentativas', async () => {
    store.lost({ mutating: false })
    await vi.advanceTimersByTimeAsync(5000)
    await vi.advanceTimersByTimeAsync(10_000)
    store.reached()
    store.lost({ mutating: true })
    expect(store.getState()).toMatchObject({ status: 'offline', sheetOpen: true, nextRetryAt: Date.now() + 5000 })
    await vi.advanceTimersByTimeAsync(RESTORED_MS * 2)
    expect(store.getState().status).toBe('offline')
  })

  it('a resposta tardia do /health/ready não vale se a conexão já voltou por outro caminho', async () => {
    let finish!: (response: Response) => void
    fetchMock.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve }))
    const restored = vi.fn()
    store.onRestored(restored)
    store.lost({ mutating: false })
    store.retryNow()
    store.reached()
    finish(new Response('{}', { status: 200 }))
    await vi.advanceTimersByTimeAsync(0)
    expect(restored).toHaveBeenCalledOnce()
    expect(store.getState().status).toBe('restored')
  })

  it('uma consulta que não responde é abortada depois de 8 s e a próxima tentativa é agendada', async () => {
    let signal!: AbortSignal
    fetchMock.mockImplementation((_url: string, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      signal = options.signal
      options.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')))
    }))
    store.lost({ mutating: false })
    store.retryNow()
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS - 1)
    expect(signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(signal.aborted).toBe(true)
    expect(store.getState()).toMatchObject({ status: 'offline', checking: false, nextRetryAt: Date.now() + 10_000 })
  })

  it('o endereço do /health/ready pode ser trocado; quem se cadastra recebe avisos até cancelar', async () => {
    const listener = vi.fn()
    const cancel = store.subscribe(listener)
    store.configure({ healthUrl: 'http://outro.test/health/ready' })
    store.lost({ mutating: false })
    expect(listener).toHaveBeenCalled()
    store.retryNow()
    expect(fetchMock.mock.calls[0][0]).toBe('http://outro.test/health/ready')
    await vi.advanceTimersByTimeAsync(0)
    const calls = listener.mock.calls.length
    cancel()
    store.reached()
    expect(listener).toHaveBeenCalledTimes(calls)
  })

  it('cancelar o ouvinte de restabelecimento evita o aviso; reset volta ao estado inicial e cancela os temporizadores', () => {
    const restored = vi.fn()
    store.onRestored(restored)()
    store.lost({ mutating: true })
    store.reached()
    expect(restored).not.toHaveBeenCalled()
    store.lost({ mutating: true })
    store.reset()
    expect(store.getState()).toMatchObject({ status: 'online', sheetOpen: false, sheetDismissed: false, nudge: 0 })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a loja única do app começa online', () => {
    expect(appConnection.getState().status).toBe('online')
  })
})

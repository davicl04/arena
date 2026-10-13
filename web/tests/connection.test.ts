import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RESTORED_MS, RETRY_STEADY_MS, createConnectionStore } from '../src/api/connection'

const HEALTH = 'http://localhost:8000/health/ready'

function setup(replies: (() => Response | Promise<Response>)[] = []) {
  const fetch = vi.fn(async () => (replies.shift() ?? (() => new Response('{}', { status: 503 })))())
  vi.stubGlobal('fetch', fetch)
  return { store: createConnectionStore({ healthUrl: HEALTH }), fetch }
}
const ok = () => new Response('{"status":"ok"}')
const down = () => new Response('{}', { status: 503 })

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('loja de conexão', () => {
  it('começa online e uma leitura que falha só liga a faixa, sem abrir a folha', () => {
    const { store } = setup()
    expect(store.getState()).toMatchObject({ status: 'online', sheetOpen: false, sheetDismissed: false, nudge: 0, nextRetryAt: null })
    store.lost({ mutating: false })
    expect(store.getState()).toMatchObject({ status: 'offline', sheetOpen: false, nudge: 0 })
    expect(store.getState().nextRetryAt).toBe(Date.now() + 5000)
  })

  it('uma ação tentada (requisição que altera dados) abre a folha uma vez; dispensada, só faz a faixa tremer', () => {
    const { store } = setup()
    store.lost({ mutating: true })
    expect(store.getState()).toMatchObject({ status: 'offline', sheetOpen: true, nudge: 0 })
    store.attempted()
    expect(store.getState().nudge).toBe(0)
    store.dismissSheet()
    expect(store.getState()).toMatchObject({ sheetOpen: false, sheetDismissed: true })
    store.lost({ mutating: true })
    store.attempted()
    expect(store.getState()).toMatchObject({ sheetOpen: false, sheetDismissed: true, nudge: 2 })
  })

  it('segundo plano nunca abre a folha nem faz a faixa tremer', () => {
    const { store } = setup()
    store.lost({ mutating: true, background: true })
    expect(store.getState()).toMatchObject({ status: 'offline', sheetOpen: false, nudge: 0 })
  })

  it('a mesma falha não conta duas vezes: o cliente já registrou a ação e o useSubmit chama attempted de novo', () => {
    const { store } = setup()
    const cause = new Error('rede')
    store.lost({ mutating: true, cause })
    store.dismissSheet()
    store.attempted(cause)
    expect(store.getState().nudge).toBe(0)
    store.attempted(new Error('outra'))
    expect(store.getState().nudge).toBe(1)
  })

  it('attempted com a loja online liga a faixa e abre a folha', () => {
    const { store } = setup()
    store.attempted()
    expect(store.getState()).toMatchObject({ status: 'offline', sheetOpen: true })
  })

  it('reached volta por "restabelecida" (cerca de 2,5 s), avisa os assinantes e limpa a folha dispensada', () => {
    const { store } = setup()
    const restored = vi.fn()
    store.onRestored(restored)
    store.lost({ mutating: true })
    store.dismissSheet()
    store.reached()
    expect(store.getState()).toMatchObject({ status: 'restored', sheetOpen: false, nextRetryAt: null })
    expect(restored).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(RESTORED_MS - 1)
    expect(store.getState().status).toBe('restored')
    vi.advanceTimersByTime(1)
    expect(store.getState()).toMatchObject({ status: 'online', sheetDismissed: false })
    // Online, uma resposta qualquer não faz nada.
    store.reached()
    expect(restored).toHaveBeenCalledTimes(1)
    // Depois de restabelecida, a folha volta a abrir na próxima ação sem conexão.
    store.lost({ mutating: true })
    expect(store.getState().sheetOpen).toBe(true)
  })

  it('uma falha durante "restabelecida" volta a ficar sem conexão e cancela a saída', () => {
    const { store } = setup()
    store.lost({ mutating: false })
    store.reached()
    store.lost({ mutating: false })
    expect(store.getState().status).toBe('offline')
    vi.advanceTimersByTime(RESTORED_MS)
    expect(store.getState().status).toBe('offline')
  })

  it('cancelar a assinatura de onRestored e dos ouvintes da loja', () => {
    const { store } = setup()
    const restored = vi.fn()
    const changed = vi.fn()
    store.onRestored(restored)()
    store.subscribe(changed)()
    store.lost({ mutating: false })
    store.reached()
    expect(restored).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalled()
  })

  it('reconecta sozinha em 5, 10 e 20 s e depois a cada 30 s, consultando o /health/ready sem cookie', async () => {
    const { store, fetch } = setup([down, down, down, down, ok])
    store.lost({ mutating: false })
    for (const seconds of [5, 10, 20, 30]) {
      await vi.advanceTimersByTimeAsync(seconds * 1000 - 1)
      expect(store.getState().status).toBe('offline')
      await vi.advanceTimersByTimeAsync(1)
    }
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(fetch.mock.calls[0]).toEqual([HEALTH, expect.objectContaining({ credentials: 'omit', cache: 'no-store' })])
    expect(store.getState()).toMatchObject({ status: 'offline', checking: false })
    expect(store.getState().nextRetryAt).toBe(Date.now() + RETRY_STEADY_MS)
    await vi.advanceTimersByTimeAsync(RETRY_STEADY_MS)
    expect(store.getState().status).toBe('restored')
  })

  it('"Tentar agora" consulta na hora; falha mantém o aviso, sucesso restabelece', async () => {
    const { store, fetch } = setup([down, ok])
    store.lost({ mutating: false })
    store.retryNow()
    expect(store.getState().checking).toBe(true)
    // Duas consultas ao mesmo tempo não existem.
    store.retryNow()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(store.getState()).toMatchObject({ status: 'offline', checking: false })
    store.retryNow()
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState().status).toBe('restored')
  })

  it('um erro de rede na consulta mantém o aviso e agenda a próxima', async () => {
    const { store, fetch } = setup([() => { throw new TypeError('network') }])
    store.lost({ mutating: false })
    store.retryNow()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(store.getState()).toMatchObject({ status: 'offline', checking: false })
    expect(store.getState().nextRetryAt).toBe(Date.now() + 10_000)
  })

  it('uma resposta de outra requisição durante a consulta restabelece sem esperar por ela', async () => {
    let finish: (response: Response) => void = () => undefined
    const { store } = setup([() => new Promise<Response>(resolve => { finish = resolve })])
    store.lost({ mutating: false })
    store.retryNow()
    store.reached()
    expect(store.getState().status).toBe('restored')
    finish(down())
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState().status).toBe('restored')
  })

  it('retryNow fora do aviso não consulta nada', () => {
    const { store, fetch } = setup()
    store.retryNow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('dispensar sem folha aberta não marca a folha como dispensada', () => {
    const { store } = setup()
    store.lost({ mutating: false })
    store.dismissSheet()
    expect(store.getState().sheetDismissed).toBe(false)
  })

  it('os eventos online e offline da janela são só dicas, confirmadas no /health/ready', async () => {
    const { store, fetch } = setup([down, ok, ok])
    const stop = store.listenToWindow(window)
    // A rede caiu segundo o navegador, mas o servidor não confirma: aviso ligado.
    window.dispatchEvent(new Event('offline'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(store.getState().status).toBe('offline')
    // Voltou segundo o navegador: confirma com o servidor antes de restabelecer.
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState().status).toBe('restored')
    // Dica de queda com o servidor respondendo: nada muda.
    await vi.advanceTimersByTimeAsync(RESTORED_MS)
    window.dispatchEvent(new Event('offline'))
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState().status).toBe('online')
    stop()
    window.dispatchEvent(new Event('offline'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('uma dica de queda com a loja já offline apenas tenta de novo, e uma falha de rede na dica liga o aviso', async () => {
    const { store, fetch } = setup([() => { throw new TypeError('network') }, down])
    store.listenToWindow(window)
    window.dispatchEvent(new Event('offline'))
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState().status).toBe('offline')
    window.dispatchEvent(new Event('offline'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('configure troca o endereço da consulta e reset volta ao estado inicial sem temporizadores', async () => {
    const { store, fetch } = setup([ok])
    store.configure({ healthUrl: 'http://api.test/health/ready' })
    store.lost({ mutating: true })
    store.retryNow()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/health/ready')
    store.lost({ mutating: false })
    store.reset()
    expect(store.getState()).toMatchObject({ status: 'online', sheetOpen: false, nextRetryAt: null })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

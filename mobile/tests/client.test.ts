import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as SecureStore from 'expo-secure-store'
import { ApiError, clearToken, request, saveToken } from '../src/api/client'

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('sessão e transporte mobile', () => {
  it('salva e remove token no SecureStore', async () => {
    await saveToken('test-only-token')
    await clearToken()
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('arena.session.v1', 'test-only-token')
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('arena.session.v1')
  })

  it('envia Bearer do SecureStore e corpo JSON', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-only-token')
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":1}'))
    vi.stubGlobal('fetch', fetch)
    await expect(request('/me', 'PATCH', { name: 'Atleta' })).resolves.toEqual({ id: 1 })
    expect(fetch).toHaveBeenCalledWith('http://10.0.2.2:8000/api/v1/me', expect.objectContaining({
      method: 'PATCH', body: '{"name":"Atleta"}',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-only-token' },
    }))
  })

  it('faz chamada sem autenticação quando não há token', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('[]'))
    vi.stubGlobal('fetch', fetch)
    await request('/cities')
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: {}, body: undefined })
  })

  it('aceita logout com resposta vazia', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(request('/auth/logout', 'POST')).resolves.toBeUndefined()
  })

  it.each([401, 403, 409, 422])('preserva status %s para o cliente tratar erros', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"Ação recusada"}', { status })))
    await expect(request('/me')).rejects.toMatchObject({ status, message: 'Ação recusada' })
  })

  it.each(['not-json', '{"detail":[]}'])('trata resposta de erro sem detalhe textual: %s', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 500 })))
    await expect(request('/me')).rejects.toMatchObject({ status: 500, message: 'Não foi possível concluir a ação.' })
  })

  it('encerra o timer após falha de rede', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
    await expect(request('/me')).rejects.toBeInstanceOf(ApiError)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborta uma chamada após 15 segundos e libera o timer', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')))
    })))
    const result = expect(request('/me')).rejects.toMatchObject({ status: 0 })
    await vi.advanceTimersByTimeAsync(15000)
    await result
    expect(vi.getTimerCount()).toBe(0)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiBaseUrl, ApiError, request } from '../src/api/client'

afterEach(() => vi.unstubAllGlobals())

describe('transporte da API web', () => {
  it.each(['localhost', '127.0.0.1', '192.168.0.95'])('usa o endereço da página %s em desenvolvimento', hostname => {
    expect(apiBaseUrl('', true, { protocol: 'http:', hostname })).toBe(`http://${hostname}:8000`)
  })

  it('preserva a API configurada explicitamente', () => {
    expect(apiBaseUrl('https://api.arena.example/', true, { protocol: 'http:', hostname: '192.168.0.95' })).toBe('https://api.arena.example')
  })

  it('mantém o fallback anterior fora do desenvolvimento', () => {
    expect(apiBaseUrl(undefined, false, { protocol: 'https:', hostname: 'arena.example' })).toBe('http://localhost:8000')
  })

  it('envia cookie e JSON sem expor um token ao JavaScript', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1 })))
    vi.stubGlobal('fetch', fetch)
    await expect(request('/me', 'PATCH', { name: 'Atleta' })).resolves.toEqual({ id: 1 })
    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/api/v1/me', expect.objectContaining({
      credentials: 'include', method: 'PATCH', body: '{"name":"Atleta"}',
      headers: { 'Content-Type': 'application/json' }, signal: expect.any(AbortSignal),
    }))
  })

  it('faz leitura sem corpo nem Content-Type desnecessário', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('[]'))
    vi.stubGlobal('fetch', fetch)
    await request('/cities')
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: {}, body: undefined })
  })

  it('envia multipart sem definir o boundary manualmente', async () => {
    const form = new FormData()
    form.append('file', new Blob(['avatar']), 'avatar.webp')
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":1}'))
    vi.stubGlobal('fetch', fetch)
    await request('/me/avatar', 'PUT', form)
    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/api/v1/me/avatar', expect.objectContaining({
      method: 'PUT', body: form, headers: {},
    }))
  })

  it('aceita resposta 204 sem tentar ler JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(request('/auth/logout', 'POST')).resolves.toBeUndefined()
  })

  it.each([401, 403, 409, 422])('preserva o status %s e a mensagem do servidor', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"Ação recusada"}', { status })))
    await expect(request('/me')).rejects.toMatchObject({ status, message: 'Ação recusada' })
  })

  it.each(['not-json', '{"detail":[{"msg":"invalid"}]}'])('usa mensagem segura para erro sem detalhe textual: %s', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 500 })))
    await expect(request('/me')).rejects.toMatchObject({ status: 500, message: 'Não foi possível concluir a ação.' })
  })

  it.each([new TypeError('network'), new DOMException('timeout', 'TimeoutError')])('transforma falha de transporte em ApiError', async (error) => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error))
    await expect(request('/me')).rejects.toBeInstanceOf(ApiError)
    await expect(request('/me')).rejects.toMatchObject({ status: 0 })
  })
})

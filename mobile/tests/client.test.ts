import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as SecureStore from 'expo-secure-store'
import { ApiError, apiUrl, clearToken, fileForm, getToken, request, REQUEST_TIMEOUT_MS, saveToken, UPLOAD_TIMEOUT_MS } from '../src/api/client'
import { isApiPath } from '../src/api/path'

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

  it('lê o token da sessão e resolve a URL autenticada do avatar', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-only-token')
    await expect(getToken()).resolves.toBe('test-only-token')
    expect(apiUrl('/api/v1/me/avatar?v=uuid')).toBe('http://10.0.2.2:8000/api/v1/me/avatar?v=uuid')
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

  it('envia multipart com Bearer sem definir Content-Type', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-only-token')
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":1}'))
    vi.stubGlobal('fetch', fetch)
    const form = new FormData()
    form.append('file', new Blob(['avatar']), 'avatar.webp')
    await request('/me/avatar', 'PUT', form)
    expect(fetch).toHaveBeenCalledWith('http://10.0.2.2:8000/api/v1/me/avatar', expect.objectContaining({
      method: 'PUT', body: form, headers: { Authorization: 'Bearer test-only-token' },
    }))
  })

  it('envia a capa em multipart e consulta a disponibilidade do @ com Bearer', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-only-token')
    const fetch = vi.fn().mockImplementation(async () => new Response('{"available":true,"reason":null,"suggestions":[]}'))
    vi.stubGlobal('fetch', fetch)
    const form = new FormData()
    form.append('file', new Blob(['capa']), 'capa.jpg')
    await request('/me/cover', 'PUT', form)
    await expect(request('/me/username-availability?u=ana.um')).resolves.toMatchObject({ available: true })
    expect(fetch).toHaveBeenNthCalledWith(1, 'http://10.0.2.2:8000/api/v1/me/cover', expect.objectContaining({ method: 'PUT', headers: { Authorization: 'Bearer test-only-token' } }))
    expect(fetch).toHaveBeenNthCalledWith(2, 'http://10.0.2.2:8000/api/v1/me/username-availability?u=ana.um', expect.objectContaining({ method: 'GET' }))
    expect(apiUrl('/api/v1/users/2/cover?v=uuid')).toBe('http://10.0.2.2:8000/api/v1/users/2/cover?v=uuid')
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

  it('expõe os campos recusados num 422, ignorando itens malformados', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: 'Revise os campos.', fields: [{ field: 'name', message: 'Nome curto demais.' }, { field: 'city_id' }, 'x', null],
    }), { status: 422 })))
    const error = await request('/teams', 'POST', { name: 'A' }).catch(cause => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 422, message: 'Revise os campos.', fields: [{ field: 'name', message: 'Nome curto demais.' }] })
  })

  it('expõe o corpo JSON do erro (o conflict do 409 da agenda) e devolve null quando não é um objeto', async () => {
    const conflict = { kind: 'quadra', match_id: 12, label: 'J2', stage: 'Quartas de final', starts_at: '2026-10-20T19:00:00Z', court_name: 'Quadra Central' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'A quadra já tem o J2.', conflict }), { status: 409 })))
    const error = await request('/organizer/matches/11/schedule', 'PUT', { starts_at: '2026-10-20T19:30:00.000Z', court_id: 7 }).catch(cause => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'A quadra já tem o J2.', body: { detail: 'A quadra já tem o J2.', conflict } })
    for (const body of ['[1,2]', 'null', '"texto"', 'not-json']) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 409 })))
      await expect(request('/me')).rejects.toMatchObject({ status: 409, body: null })
    }
    expect(new ApiError('Falha', 500).body).toBeNull()
  })

  it('devolve fields vazio quando o corpo de erro não os traz', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{"detail":"Ação recusada","fields":"x"}', { status: 409 })))
    await expect(request('/me')).rejects.toMatchObject({ status: 409, fields: [] })
    expect(new ApiError('Falha', 500).fields).toEqual([])
  })

  it('monta o multipart do arquivo local como parte { uri, name, type }, que o fetch do React Native lê', () => {
    const parts: unknown[][] = []
    vi.stubGlobal('FormData', class { append(...args: unknown[]) { parts.push(args) } })
    const form = fileForm({ uri: 'file:///cache/foto.jpg', name: 'foto.jpg', type: 'image/jpeg', size: 10 })
    expect(form).toBeInstanceOf(FormData)
    expect(parts).toEqual([['file', { uri: 'file:///cache/foto.jpg', name: 'foto.jpg', type: 'image/jpeg' }]])
  })

  it('aborta uma chamada após 15 segundos e libera o timer', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')))
    })))
    const result = expect(request('/me')).rejects.toMatchObject({ status: 0 })
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    await result
    expect(REQUEST_TIMEOUT_MS).toBe(15000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('o envio de arquivo (multipart) tem um teto bem maior: 5 MiB a 1 Mbps passam dos 15 s sem abortar', async () => {
    vi.useFakeTimers()
    let aborted = false
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('timeout', 'AbortError')) })
      // 5 MiB a 1 Mbps levam cerca de 42 s para subir.
      setTimeout(() => resolve(new Response('{"id":1}')), 42_000)
    })))
    const form = new FormData()
    form.append('file', new Blob(['avatar']), 'avatar.webp')
    const result = request('/me/avatar', 'PUT', form)
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1)
    expect(aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(42_000)
    await expect(result).resolves.toEqual({ id: 1 })
    expect(aborted).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('o envio de arquivo que passa do teto do upload é abortado e libera o timer', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')))
    })))
    const form = new FormData()
    form.append('file', new Blob(['capa']), 'capa.jpg')
    const result = expect(request('/me/cover', 'PUT', form)).rejects.toMatchObject({ status: 0 })
    await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS)
    await result
    expect(UPLOAD_TIMEOUT_MS).toBe(120_000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('isApiPath aceita só o que começa com uma barra e não com duas', () => {
    expect(['/api/v1/me/avatar?v=uuid', '/x', '/'].map(isApiPath)).toEqual([true, true, true])
    expect(['@evil.example/x', '.evil.example/x', '//evil.example/x', 'https://evil.example/x', 'api/v1/x', ''].map(isApiPath)).toEqual([false, false, false, false, false, false])
    // Os exemplos do revisor: concatenados à base, desviariam o host.
    expect(new URL('http://10.0.2.2:8000@evil.example/x').host).toBe('evil.example')
  })

  it('só anexa a base a caminhos da API: o que poderia desviar o host é recusado', () => {
    expect(apiUrl('/api/v1/ok')).toBe('http://10.0.2.2:8000/api/v1/ok')
    // `base + path` com `@host/x` ou `.host/x` trocaria o servidor que recebe o Bearer.
    for (const path of ['@evil.example/x', '.evil.example/x', '//evil.example/x', 'https://evil.example/x', 'api/v1/x', '']) {
      expect(() => apiUrl(path), path).toThrow('Caminho fora da API.')
    }
  })
})

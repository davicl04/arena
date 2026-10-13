import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiBaseUrl, ApiError, isConnectionStatus, request } from '../src/api/client'
import { connection } from '../src/api/connection'

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

  it('guarda os campos recusados de um 422, descartando itens malformados', async () => {
    const body = { detail: 'Revise os campos informados.', fields: [{ field: 'name', message: 'Informe o nome.' }, { field: 1 }, null] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 422 })))
    await expect(request('/organizer/events', 'POST', {})).rejects.toMatchObject({
      status: 422, fields: [{ field: 'name', message: 'Informe o nome.' }],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"Conflito"}', { status: 409 })))
    await expect(request('/me')).rejects.toMatchObject({ status: 409, fields: [] })
  })

  it('guarda o corpo do erro (o conflict do 409 da agenda) e não inventa corpo para lista', async () => {
    const body = { detail: 'A quadra já tem o J3.', conflict: { kind: 'quadra', label: 'J3' } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 409 })))
    await expect(request('/organizer/matches/7/schedule', 'PUT', {})).rejects.toMatchObject({ status: 409, body })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[1,2]', { status: 500 })))
    await expect(request('/me')).rejects.toMatchObject({ status: 500, body: null })
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

  it('prepara o endereço do /health/ready, fora de /api/v1, para a reconexão', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetch)
    await expect(request('/me')).rejects.toBeInstanceOf(ApiError)
    connection.retryNow()
    await vi.waitFor(() => expect(connection.getState().status).toBe('restored'))
    expect(fetch.mock.calls[1]).toEqual(['http://localhost:8000/health/ready', expect.objectContaining({ credentials: 'omit' })])
  })
})

describe('classificação de falhas de conexão', () => {
  it.each([0, 502, 503, 504])('o status %s é falha de conexão', status => {
    expect(isConnectionStatus(status)).toBe(true)
    expect(new ApiError('x', status).isConnection).toBe(true)
  })

  it.each([200, 400, 401, 403, 404, 409, 413, 422, 500])('o status %s não é falha de conexão', status => {
    expect(isConnectionStatus(status)).toBe(false)
    expect(new ApiError('x', status).isConnection).toBe(false)
  })

  it('rede ou timeout (status 0): leitura liga só a faixa; escrita abre a folha; a mensagem de antes continua', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
    const read = await request('/me').catch(error => error)
    expect(read).toMatchObject({ status: 0, isConnection: true, message: 'Não foi possível conectar ao Arena. Verifique a conexão e tente novamente.' })
    expect(connection.getState()).toMatchObject({ status: 'offline', sheetOpen: false })
    connection.reset()
    await request('/me', 'PUT', { name: 'Atleta' }).catch(() => undefined)
    expect(connection.getState()).toMatchObject({ status: 'offline', sheetOpen: true })
  })

  it.each([502, 503, 504])('%s com detalhe do servidor é falha de conexão, mantendo a mensagem', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"Serviço indisponível."}', { status })))
    await expect(request('/me/play')).rejects.toMatchObject({ status, isConnection: true, message: 'Serviço indisponível.' })
    expect(connection.getState()).toMatchObject({ status: 'offline', sheetOpen: false })
    connection.reset()
    await expect(request('/matches/1/accept', 'PUT', {})).rejects.toMatchObject({ isConnection: true })
    expect(connection.getState()).toMatchObject({ status: 'offline', sheetOpen: true })
  })

  it('o método é lido sem diferenciar maiúsculas de minúsculas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })))
    await request('/me', 'get').catch(() => undefined)
    expect(connection.getState()).toMatchObject({ status: 'offline', sheetOpen: false })
  })

  it('leitura em segundo plano nunca abre a folha, nem se alterar dados', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
    await request('/me/play', 'POST', {}, { background: true }).catch(() => undefined)
    expect(connection.getState()).toMatchObject({ status: 'offline', sheetOpen: false, nudge: 0 })
  })

  it.each([400, 401, 404, 409, 422, 500])('qualquer resposta HTTP, mesmo %s, prova a conexão e a restabelece', async status => {
    connection.lost({ mutating: false })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"Recusado"}', { status })))
    await expect(request('/me')).rejects.toMatchObject({ status, isConnection: false })
    expect(connection.getState().status).toBe('restored')
  })

  it('uma resposta de sucesso (inclusive 204) restabelece a conexão', async () => {
    connection.lost({ mutating: false })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await request('/auth/logout', 'POST')
    expect(connection.getState().status).toBe('restored')
  })

  it('um 503 não restabelece a conexão', async () => {
    connection.lost({ mutating: false })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })))
    await request('/me').catch(() => undefined)
    expect(connection.getState().status).toBe('offline')
  })
})

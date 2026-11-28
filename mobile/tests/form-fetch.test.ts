import { afterEach, describe, expect, it, vi } from 'vitest'
import { formFetch } from '../src/api/formFetch'

/** XMLHttpRequest simulado: guarda o que o envio fez e deixa o teste responder. */
class FakeXhr {
  static last: FakeXhr
  method = ''
  url = ''
  headers: Record<string, string> = {}
  body: unknown = null
  status = 0
  responseText = ''
  aborted = false
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  ontimeout: (() => void) | null = null
  onabort: (() => void) | null = null
  constructor() { FakeXhr.last = this }
  open(method: string, url: string) { this.method = method; this.url = url }
  setRequestHeader(name: string, value: string) { this.headers[name] = value }
  send(body: unknown) { this.body = body }
  abort() { this.aborted = true; this.onabort?.() }
  respond(status: number, text = '') { this.status = status; this.responseText = text; this.onload?.() }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('upload de FormData pelo XMLHttpRequest (o fetch do Expo não envia a parte de arquivo do React Native)', () => {
  it('envia método, cabeçalhos e o FormData como estão e devolve a resposta do servidor', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    const form = new FormData()
    const result = formFetch('http://api/x', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: form, signal: new AbortController().signal })
    const xhr = FakeXhr.last
    expect([xhr.method, xhr.url, xhr.headers, xhr.body]).toEqual(['POST', 'http://api/x', { Authorization: 'Bearer t' }, form])
    xhr.respond(422, '{"detail":"A imagem precisa ser recortada em formato quadrado."}')
    const response = await result
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({ detail: 'A imagem precisa ser recortada em formato quadrado.' })
  })

  it('204 vem sem corpo; falha de rede rejeita como o fetch', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    const signal = new AbortController().signal
    const empty = formFetch('http://api/x', { method: 'DELETE', headers: {}, body: new FormData(), signal })
    FakeXhr.last.respond(204)
    expect((await empty).status).toBe(204)
    const failed = formFetch('http://api/x', { method: 'PUT', headers: {}, body: new FormData(), signal })
    FakeXhr.last.onerror?.()
    await expect(failed).rejects.toThrow('Network request failed')
  })

  it('o sinal de abortar (o teto do upload) cancela o envio', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    const controller = new AbortController()
    const result = formFetch('http://api/x', { method: 'PUT', headers: {}, body: new FormData(), signal: controller.signal })
    controller.abort()
    await expect(result).rejects.toThrow('Aborted')
    expect(FakeXhr.last.aborted).toBe(true)
  })

  it('com o sinal já abortado, nem envia', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    const controller = new AbortController()
    controller.abort()
    await expect(formFetch('http://api/x', { method: 'PUT', headers: {}, body: new FormData(), signal: controller.signal })).rejects.toThrow('Aborted')
    expect(FakeXhr.last.body).toBeNull()
  })
})

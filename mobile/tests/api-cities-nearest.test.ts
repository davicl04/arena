import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as SecureStore from 'expo-secure-store'
import { ApiError } from '../src/api/client'
import { nearestCity, roundCoordinate } from '../src/api/cities'
import { connection } from '../src/api/connection'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

/*
 * Cidade mais próxima pelo transporte real do Expo (`fetch` simulado): Bearer do SecureStore, coordenadas arredondadas
 * para 2 casas e só no corpo JSON (a URL é fixa), 404 fora da cobertura e falha de rede sem abrir a folha de conexão.
 */

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-only-token')
})
afterEach(() => { vi.unstubAllGlobals() })

describe('POST /cities/nearest', () => {
  it('arredonda para 2 casas', () => {
    expect(roundCoordinate(-16.686891)).toBe(-16.69)
    expect(roundCoordinate(-49.264794)).toBe(-49.26)
    expect(roundCoordinate(-15.7801)).toBe(-15.78)
    expect(roundCoordinate(0)).toBe(0)
  })

  it('envia Bearer e as coordenadas arredondadas como números no corpo, nunca na URL', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":5208707,"name":"Goiânia","state":"GO"}'))
    vi.stubGlobal('fetch', fetch)
    await expect(nearestCity(-16.686891, -49.264794)).resolves.toEqual({ id: 5208707, name: 'Goiânia', state: 'GO' })
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://10.0.2.2:8000/api/v1/cities/nearest')
    expect(url).not.toMatch(/16|49|latitude|longitude/)
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-only-token' } })
    expect(init.body).toBe('{"latitude":-16.69,"longitude":-49.26}')
    expect(JSON.parse(init.body as string)).toEqual({ latitude: -16.69, longitude: -49.26 })
  })

  it('404 fora da cobertura chega como ApiError com o detalhe do servidor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"Não encontramos um município perto de você."}', { status: 404 })))
    const failure = await nearestCity(-30, -20).catch((cause: unknown) => cause)
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ status: 404, message: 'Não encontramos um município perto de você.' })
  })

  it('falha de rede não abre a folha "Sem conexão" (o passo da cidade mostra o próprio aviso)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network request failed')))
    await expect(nearestCity(-15.78, -47.93)).rejects.toMatchObject({ status: 0 })
    expect(connection.getState().sheetOpen).toBe(false)
  })
})

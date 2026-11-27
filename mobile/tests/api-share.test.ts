import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import { getShareMatch, getShareRun, getShareSubject } from '../src/api/share'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(),
}))

beforeEach(() => { vi.mocked(request).mockReset().mockResolvedValue({ id: 5 } as never) })

describe('cliente dos dados do adesivo (compartilhamento nos Stories)', () => {
  it('lê a partida e a corrida do titular da sessão, sob /me, sem enviar o usuário', async () => {
    await getShareMatch(12)
    await getShareRun(7)
    expect(vi.mocked(request).mock.calls).toEqual([['/me/share/matches/12'], ['/me/share/runs/7']])
  })

  it('uma requisição por abertura: a rota da partida ou a da corrida, conforme o item tocado', async () => {
    await expect(getShareSubject({ kind: 'partida', id: 3 })).resolves.toEqual({ kind: 'partida', data: { id: 5 } })
    await expect(getShareSubject({ kind: 'corrida', id: 4 })).resolves.toEqual({ kind: 'corrida', data: { id: 5 } })
    expect(vi.mocked(request).mock.calls).toEqual([['/me/share/matches/3'], ['/me/share/runs/4']])
  })
})

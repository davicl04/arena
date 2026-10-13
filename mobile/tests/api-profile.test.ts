import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import { getProfileStats, timelinePath } from '../src/api/profile'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(),
}))

beforeEach(() => { vi.mocked(request).mockReset().mockResolvedValue(undefined as never) })

describe('cliente do perfil (linha do tempo e estatísticas)', () => {
  it('monta o caminho da linha do tempo com o filtro de modalidade opcional', () => {
    expect(timelinePath(7)).toBe('/users/7/timeline')
    expect(timelinePath(7, null)).toBe('/users/7/timeline')
    expect(timelinePath(7, 'tenis')).toBe('/users/7/timeline?sport=tenis')
  })

  it('lê as estatísticas do titular da sessão, sem enviar o usuário', async () => {
    await getProfileStats()
    expect(vi.mocked(request).mock.calls).toEqual([['/me/profile-stats']])
  })
})

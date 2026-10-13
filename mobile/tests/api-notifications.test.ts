import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import { getNotificationSummary, listPendingNotifications, markAllNotificationsRead, markNotificationRead, notificationsPath } from '../src/api/notifications'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

beforeEach(() => { vi.mocked(request).mockReset().mockResolvedValue(undefined as never) })

describe('cliente das notificações com pendências (contrato 0003, seção 7)', () => {
  it('monta o caminho da lista com `categoria` e `pendente`, sem chaves vazias', () => {
    expect(notificationsPath()).toBe('/me/notifications')
    expect(notificationsPath({})).toBe('/me/notifications')
    expect(notificationsPath({ pendente: false })).toBe('/me/notifications?pendente=false')
    expect(notificationsPath({ pendente: true })).toBe('/me/notifications?pendente=true')
    expect(notificationsPath({ categoria: 'times' })).toBe('/me/notifications?categoria=times')
    expect(notificationsPath({ categoria: 'partidas', pendente: false })).toBe('/me/notifications?categoria=partidas&pendente=false')
  })

  it('lê o resumo, as pendências por urgência (com categoria e limite opcionais) e devolve o resumo ao ler', async () => {
    await getNotificationSummary()
    await listPendingNotifications()
    await listPendingNotifications({ limit: 2 })
    await listPendingNotifications({ categoria: 'eventos' })
    await listPendingNotifications({ categoria: 'times', limit: 50 })
    await markNotificationRead(7)
    await markAllNotificationsRead()
    expect(vi.mocked(request).mock.calls).toEqual([
      ['/me/notifications/summary'],
      ['/me/notifications/pending'],
      ['/me/notifications/pending?limit=2'],
      ['/me/notifications/pending?categoria=eventos'],
      ['/me/notifications/pending?categoria=times&limit=50'],
      ['/me/notifications/7/read', 'PUT', {}],
      ['/me/notifications/read-all', 'PUT', {}],
    ])
  })
})

import React, { useEffect } from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import { connection } from '../src/api/connection'
import type { NotificationFilterCategory } from '../src/api/notifications'
import { usePendingNotifications } from '../src/hooks/usePendingNotifications'
import type { PendingNotificationsState } from '../src/hooks/usePendingNotifications'
import { enableAct } from './support/native'
import { pendingNote, resetNotificationIds } from './support/notifications'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

type Props = { categoria?: NotificationFilterCategory; limit?: number; onExpired?: () => void; enabled?: boolean; refreshKey?: number }
let current!: PendingNotificationsState
function Probe({ categoria, limit, onExpired = () => undefined, enabled, refreshKey }: Props) {
  const state = usePendingNotifications({ categoria, limit }, onExpired, { enabled, refreshKey })
  useEffect(() => { current = state })
  return null
}
const h = React.createElement
async function mount(props: Props = {}) {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(h(Probe, props)) })
  return tree
}
const reads = (path: string) => vi.mocked(request).mock.calls.filter(([called]) => called === path).length

beforeEach(() => { enableAct(); resetNotificationIds(); vi.mocked(request).mockReset().mockResolvedValue({ items: [pendingNote('convite_time')] } as never) })

describe('usePendingNotifications: pendências abertas (GET /me/notifications/pending)', () => {
  it('lê com categoria e limite, carrega até a primeira resposta e entrega as pendências', async () => {
    let release!: (value: unknown) => void
    vi.mocked(request).mockReturnValueOnce(new Promise(resolve => { release = resolve }) as never)
    const tree = await mount({ categoria: 'times', limit: 50 })
    expect(current.loading).toBe(true)
    expect(current.items).toEqual([])
    await act(async () => { release({ items: [pendingNote('convite_time')] }) })
    expect(current.loading).toBe(false)
    expect(current.items).toHaveLength(1)
    expect(reads('/me/notifications/pending?categoria=times&limit=50')).toBe(1)
    await act(async () => { tree.unmount() })
  })

  it('trocar a consulta volta a carregar sem mostrar as pendências da anterior; refreshKey relê sem esvaziar', async () => {
    const tree = await mount({ limit: 2, refreshKey: 1 })
    expect(current.items).toHaveLength(1)
    vi.mocked(request).mockReturnValueOnce(new Promise(() => undefined) as never)
    await act(async () => { tree.update(h(Probe, { limit: 2, refreshKey: 2 })) })
    expect(current.loading).toBe(false)
    expect(current.items).toHaveLength(1)
    vi.mocked(request).mockReturnValueOnce(new Promise(() => undefined) as never)
    await act(async () => { tree.update(h(Probe, { categoria: 'partidas', limit: 2, refreshKey: 2 })) })
    expect(current.loading).toBe(true)
    expect(current.items).toEqual([])
    await act(async () => { tree.unmount() })
  })

  it('`setItems` altera a lista (lida) e `reload` mostra o carregamento e lê de novo', async () => {
    const tree = await mount()
    await act(async () => { current.setItems(old => old.map(item => ({ ...item, read_at: 'x' }))) })
    expect(current.items[0].read_at).toBe('x')
    await act(async () => { current.reload() })
    expect(reads('/me/notifications/pending')).toBe(2)
    expect(current.items[0].read_at).toBeNull()
    await act(async () => { tree.unmount() })
  })

  it('erro vira mensagem (genérica sem texto), 401 expira a sessão e `enabled` falso não lê', async () => {
    const onExpired = vi.fn()
    vi.mocked(request).mockRejectedValue(new ApiError('Fora do ar', 500))
    const failed = await mount({ onExpired })
    expect(current.error).toBe('Fora do ar')
    expect(current.items).toEqual([])
    expect(onExpired).not.toHaveBeenCalled()
    await act(async () => { failed.unmount() })
    vi.mocked(request).mockRejectedValue(new ApiError('Sessão expirada', 401))
    const expired = await mount({ onExpired })
    expect(onExpired).toHaveBeenCalledTimes(1)
    await act(async () => { expired.unmount() })
    vi.mocked(request).mockRejectedValue('quebrou')
    const odd = await mount()
    expect(current.error).toBe('Não foi possível carregar as pendências.')
    await act(async () => { odd.unmount() })
    vi.mocked(request).mockReset()
    const off = await mount({ enabled: false })
    expect(request).not.toHaveBeenCalled()
    expect(current.loading).toBe(false)
    await act(async () => { off.unmount() })
  })

  it('guarda a causa do erro e, se foi falta de conexão, relê uma única vez quando a conexão volta', async () => {
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Sem conexão.', 0))
    const tree = await mount()
    expect(current.error).toBe('Sem conexão.')
    expect(current.errorCause).toBeInstanceOf(ApiError)
    await act(async () => { connection.lost({ mutating: false }); connection.reached() })
    expect(reads('/me/notifications/pending')).toBe(2)
    expect(current.error).toBe('')
    expect(current.errorCause).toBeNull()
    expect(current.items).toHaveLength(1)
    await act(async () => { connection.lost({ mutating: false }); connection.reached() })
    expect(reads('/me/notifications/pending')).toBe(2)
    await act(async () => { tree.unmount() })
  })

  it('uma resposta fora do formato vira lista vazia', async () => {
    vi.mocked(request).mockResolvedValue({ items: null } as never)
    const tree = await mount()
    expect(current.items).toEqual([])
    expect(current.error).toBe('')
    await act(async () => { tree.unmount() })
  })
})

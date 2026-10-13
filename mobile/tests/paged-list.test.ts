import React, { useEffect } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import { usePagedList } from '../src/hooks/usePagedList'
import type { PagedList } from '../src/hooks/usePagedList'
import { enableAct } from './support/native'

vi.mock('../src/api/client', () => ({
  ApiError: class ApiError extends Error { constructor(message: string, public status: number) { super(message) } },
  request: vi.fn(),
}))

type Item = { id: number }
let current!: PagedList<Item>
function Probe({ path, onExpired }: { path: string; onExpired: () => void }) {
  const list = usePagedList<Item>(path, onExpired)
  useEffect(() => { current = list })
  return null
}
async function mount(path: string, onExpired = vi.fn()) {
  let tree!: ReturnType<typeof create>
  await act(async () => { tree = create(React.createElement(Probe, { path, onExpired })) })
  return { tree, onExpired }
}
const page = (ids: number[], next: string | null) => ({ items: ids.map(id => ({ id })), next_cursor: next })

describe('usePagedList (mobile)', () => {
  beforeEach(() => { enableAct(); vi.mocked(request).mockReset() })

  it('expõe o total quando a resposta o traz e o mantém ao carregar mais', async () => {
    vi.mocked(request).mockImplementation(async path => (path.includes('cursor=')
      ? { items: [{ id: 3 }], next_cursor: null }
      : { ...page([1, 2], 'c2'), total: 3 }) as never)
    const { tree } = await mount('/timeline')
    expect(current.total).toBe(3)
    await act(async () => { await current.loadMore() })
    expect(current.items).toHaveLength(3)
    expect(current.total).toBe(3)
    await act(async () => { tree.unmount() })
  })

  it('sem total na resposta, o total fica indefinido', async () => {
    vi.mocked(request).mockResolvedValue(page([1], null) as never)
    const { tree } = await mount('/posts')
    expect(current.total).toBeUndefined()
    await act(async () => { tree.unmount() })
  })

  it('carrega a primeira página, acrescenta a próxima pelo cursor e ignora chamadas duplicadas', async () => {
    let release!: () => void
    vi.mocked(request).mockImplementation(async path => {
      if (path.includes('cursor=')) { await new Promise<void>(resolve => { release = resolve }); return page([3], null) as never }
      return page([1, 2], 'c 1') as never
    })
    const { tree } = await mount('/posts')
    expect(current.loading).toBe(false)
    expect(current.items.map(item => item.id)).toEqual([1, 2])
    expect(current.hasMore).toBe(true)
    await act(async () => { void current.loadMore(); void current.loadMore() })
    expect(current.busy).toBe(true)
    expect(vi.mocked(request).mock.calls.filter(([path]) => path.includes('cursor='))).toHaveLength(1)
    expect(request).toHaveBeenCalledWith('/posts?cursor=c%201')
    await act(async () => { release() })
    expect(current.items.map(item => item.id)).toEqual([1, 2, 3])
    expect(current.hasMore).toBe(false)
    expect(current.busy).toBe(false)
    await act(async () => { await current.loadMore() })
    expect(vi.mocked(request).mock.calls).toHaveLength(2)
    await act(async () => { tree.unmount() })
  })

  it('usa & quando o caminho já tem consulta e mostra o erro ao carregar mais', async () => {
    vi.mocked(request).mockImplementation(async path => {
      if (path.includes('cursor=')) throw new Error('Sem conexão.')
      return page([1], 'next') as never
    })
    const { tree } = await mount('/users?q=ana')
    await act(async () => { await current.loadMore() })
    expect(request).toHaveBeenCalledWith('/users?q=ana&cursor=next')
    expect(current.moreError).toBe('Sem conexão.')
    expect(current.items).toHaveLength(1)
    expect(current.busy).toBe(false)
    await act(async () => { tree.unmount() })
  })

  it('avisa a expiração da sessão na primeira página e ao carregar mais', async () => {
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Sessão expirada', 401))
    const first = await mount('/posts')
    expect(first.onExpired).toHaveBeenCalledOnce()
    expect(current.error?.message).toBe('Sessão expirada')
    expect(current.items).toEqual([])
    await act(async () => { first.tree.unmount() })

    vi.mocked(request).mockResolvedValueOnce(page([1], 'next') as never).mockRejectedValueOnce(new ApiError('Sessão expirada', 401))
    const second = await mount('/posts')
    await act(async () => { await current.loadMore() })
    expect(second.onExpired).toHaveBeenCalledOnce()
    expect(current.moreError).toBe('Sessão expirada')
    await act(async () => { second.tree.unmount() })
  })

  it('permite editar os itens localmente, recarregar e trocar de caminho', async () => {
    let calls = 0
    vi.mocked(request).mockImplementation(async path => { calls += 1; return page(path === '/b' ? [9] : [calls], null) as never })
    const onExpired = vi.fn()
    const { tree } = await mount('/a', onExpired)
    await act(async () => { current.setItems(old => [...old, { id: 50 }]) })
    expect(current.items.map(item => item.id)).toEqual([1, 50])
    await act(async () => { current.setItems([{ id: 7 }]) })
    expect(current.items.map(item => item.id)).toEqual([7])
    await act(async () => { current.reload() })
    expect(current.items.map(item => item.id)).toEqual([2])
    await act(async () => { tree.update(React.createElement(Probe, { path: '/b', onExpired })) })
    expect(current.items.map(item => item.id)).toEqual([9])
    await act(async () => { tree.unmount() })
  })

  it('descarta a resposta de um caminho que já foi trocado', async () => {
    let slow!: (value: unknown) => void
    vi.mocked(request).mockImplementation(path => path === '/lento' ? new Promise(resolve => { slow = resolve }) as never : Promise.resolve(page([2], null) as never))
    const onExpired = vi.fn()
    const { tree } = await mount('/lento', onExpired)
    expect(current.loading).toBe(true)
    await act(async () => { tree.update(React.createElement(Probe, { path: '/rapido', onExpired })) })
    await act(async () => { slow(page([1], null)) })
    expect(current.items.map(item => item.id)).toEqual([2])
    await act(async () => { tree.unmount() })
  })

  it('refresh relê a primeira página mantendo os itens, descarta o "carregar mais" pendente e trata falha', async () => {
    let reads = 0
    let releaseFirst!: () => void
    let releaseMore!: () => void
    vi.mocked(request).mockImplementation(async path => {
      if (path.includes('cursor=')) { await new Promise<void>(resolve => { releaseMore = resolve }); return page([3], null) as never }
      reads += 1
      if (reads === 2) { await new Promise<void>(resolve => { releaseFirst = resolve }); return page([0, 1], null) as never }
      if (reads === 3) throw new Error('Sem conexão.')
      return page([1, 2], 'c2') as never
    })
    const { tree } = await mount('/posts')
    await act(async () => { void current.loadMore() })
    await act(async () => { current.refresh() })
    expect(current.refreshing).toBe(true)
    expect(current.loading).toBe(false)
    expect(current.items.map(item => item.id)).toEqual([1, 2])
    await act(async () => { releaseMore() })
    expect(current.items.map(item => item.id)).toEqual([1, 2])
    await act(async () => { releaseFirst() })
    expect(current.refreshing).toBe(false)
    expect(current.items.map(item => item.id)).toEqual([0, 1])
    expect(current.hasMore).toBe(false)
    await act(async () => { current.refresh() })
    expect(current.refreshing).toBe(false)
    expect(current.error?.message).toBe('Sem conexão.')
    await act(async () => { tree.unmount() })
  })
})

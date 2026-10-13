import React, { useEffect } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import { connection } from '../src/api/connection'
import { usePagedList } from '../src/hooks/usePagedList'
import type { PagedList } from '../src/hooks/usePagedList'
import { useResource } from '../src/hooks/useResource'
import { enableAct } from './support/native'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const onExpired = vi.fn()
beforeEach(() => { enableAct(); onExpired.mockReset(); vi.mocked(request).mockReset() })

/** Perde a conexão e a recupera, como `request` e o `/health/ready` fariam. */
const offlineThenBack = () => act(async () => { connection.lost({ mutating: false }); connection.reached() })

type Resource = ReturnType<typeof useResource<string>>
let resource!: Resource
function ResourceProbe({ load }: { load: () => Promise<string> }) {
  const value = useResource(load, onExpired)
  useEffect(() => { resource = value })
  return null
}
async function mountResource(load: () => Promise<string>) {
  let tree!: ReturnType<typeof create>
  await act(async () => { tree = create(React.createElement(ResourceProbe, { load })) })
  return tree
}

describe('useResource: recarrega uma vez quando a conexão volta', () => {
  it('a falha de conexão marca `connectionError` e `errorCause`; ao restabelecer, relê sozinho e entrega os dados', async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new ApiError('Sem conexão.', 0)).mockResolvedValue('dados')
    const tree = await mountResource(load)
    expect(resource.error).toBe('Sem conexão.')
    expect(resource.connectionError).toBe(true)
    expect(resource.errorCause).toBeInstanceOf(ApiError)
    await offlineThenBack()
    expect(load).toHaveBeenCalledTimes(2)
    expect(resource.data).toBe('dados')
    expect(resource.connectionError).toBe(false)
    expect(resource.errorCause).toBeNull()
    await act(async () => { tree.unmount() })
  })

  it('só uma vez por falha: se a releitura falha de novo por conexão, a próxima volta tenta de novo; as outras falhas esperam o "Tentar novamente"', async () => {
    const load = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ApiError('Sem conexão.', 503))
      .mockRejectedValueOnce(new ApiError('Servidor recusou.', 500))
      .mockResolvedValue('dados')
    const tree = await mountResource(load)
    await offlineThenBack()
    expect(load).toHaveBeenCalledTimes(2)
    expect(resource.connectionError).toBe(false)
    expect(resource.error).toBe('Servidor recusou.')
    await offlineThenBack()
    expect(load).toHaveBeenCalledTimes(2)
    await act(async () => { resource.reload() })
    expect(resource.data).toBe('dados')
    await offlineThenBack()
    expect(load).toHaveBeenCalledTimes(3)
    await act(async () => { tree.unmount() })
  })

  it('sem erro, o restabelecimento não relê; desmontar cancela o ouvinte; `setData` limpa o erro e a causa', async () => {
    const load = vi.fn<() => Promise<string>>().mockResolvedValue('dados')
    const tree = await mountResource(load)
    await offlineThenBack()
    expect(load).toHaveBeenCalledTimes(1)
    await act(async () => { resource.setData('outro') })
    expect(resource.data).toBe('outro')
    await act(async () => { tree.unmount() })
    await offlineThenBack()
    expect(load).toHaveBeenCalledTimes(1)
    const failing = vi.fn<() => Promise<string>>().mockRejectedValue(new ApiError('Erro.', 500))
    const second = await mountResource(failing)
    expect(resource.errorCause).toBeInstanceOf(ApiError)
    await act(async () => { resource.setData('curado') })
    expect(resource.error).toBe('')
    await act(async () => { second.unmount() })
  })
})

let list!: PagedList<{ id: number }>
function ListProbe({ path }: { path: string }) {
  const value = usePagedList<{ id: number }>(path, onExpired)
  useEffect(() => { list = value })
  return null
}
async function mountList(path = '/posts') {
  let tree!: ReturnType<typeof create>
  await act(async () => { tree = create(React.createElement(ListProbe, { path })) })
  return tree
}

describe('usePagedList: recarrega a primeira página uma vez quando a conexão volta', () => {
  it('falha da primeira página por conexão: `connectionError` e releitura automática ao restabelecer', async () => {
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Sem conexão.', 0)).mockResolvedValue({ items: [{ id: 1 }], next_cursor: null } as never)
    const tree = await mountList()
    expect(list.connectionError).toBe(true)
    expect(list.items).toEqual([])
    await offlineThenBack()
    expect(request).toHaveBeenCalledTimes(2)
    expect(list.items).toEqual([{ id: 1 }])
    expect(list.connectionError).toBe(false)
    await offlineThenBack()
    expect(request).toHaveBeenCalledTimes(2)
    await act(async () => { tree.unmount() })
  })

  it('erro comum (500) ou erro ao carregar mais não relê sozinho; o rodapé continua com o botão', async () => {
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Servidor recusou.', 500))
    const tree = await mountList()
    expect(list.connectionError).toBe(false)
    await offlineThenBack()
    expect(request).toHaveBeenCalledTimes(1)
    vi.mocked(request).mockResolvedValueOnce({ items: [{ id: 1 }], next_cursor: 'c' } as never)
    await act(async () => { list.reload() })
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Sem conexão.', 0))
    await act(async () => { await list.loadMore() })
    expect(list.moreError).toBe('Sem conexão.')
    expect(list.connectionError).toBe(false)
    await offlineThenBack()
    expect(request).toHaveBeenCalledTimes(3)
    await act(async () => { tree.unmount() })
  })
})

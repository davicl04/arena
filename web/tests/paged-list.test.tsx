import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { Page } from '../src/api/client'
import { usePagedList } from '../src/hooks/usePagedList'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(), request: vi.fn(),
}))

afterEach(() => { cleanup(); vi.mocked(request).mockReset() })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const page = (item: string, cursor: string | null = null): Page<string> => ({ items: [item], next_cursor: cursor })
const followers = '/users/1/followers'
const following = '/users/1/following'

it('carrega a próxima página com cursor e preserva os itens atuais', async () => {
  vi.mocked(request).mockResolvedValueOnce(page('primeiro', 'cursor /?'))
    .mockResolvedValueOnce(page('segundo'))
  const onExpired = vi.fn()
  const { result } = renderHook(() => usePagedList<string>(followers, onExpired))
  await waitFor(() => expect(result.current.items).toEqual(['primeiro']))
  await act(async () => { await result.current.loadMore() })
  expect(vi.mocked(request)).toHaveBeenLastCalledWith(`${followers}?cursor=cursor%20%2F%3F`)
  expect(result.current.items).toEqual(['primeiro', 'segundo'])
  expect(result.current.hasMore).toBe(false)
  expect(result.current.busy).toBe(false)
})

it('não concatena seguidores antigos nem substitui o cursor da aba seguindo', async () => {
  const oldMore = deferred<Page<string>>()
  vi.mocked(request).mockResolvedValueOnce(page('seguidor', 'followers-next'))
    .mockReturnValueOnce(oldMore.promise).mockResolvedValueOnce(page('seguido', 'following-next'))
  const onExpired = vi.fn()
  const { result, rerender } = renderHook(({ path }) => usePagedList<string>(path, onExpired), { initialProps: { path: followers } })
  await waitFor(() => expect(result.current.items).toEqual(['seguidor']))
  let pending!: Promise<void>
  act(() => { pending = result.current.loadMore() })
  rerender({ path: following })
  await waitFor(() => expect(result.current.items).toEqual(['seguido']))
  await act(async () => { oldMore.resolve(page('seguidor antigo')); await pending })
  expect(result.current.items).toEqual(['seguido'])
  expect(result.current.hasMore).toBe(true)
})

it('descarta a página de seguidores ao mudar para seguindo sem liberar o carregamento atual', async () => {
  const oldMore = deferred<Page<string>>()
  const newMore = deferred<Page<string>>()
  vi.mocked(request).mockResolvedValueOnce(page('seguidor', 'followers-next'))
    .mockReturnValueOnce(oldMore.promise).mockResolvedValueOnce(page('seguido', 'following-next'))
    .mockReturnValueOnce(newMore.promise)
  const onExpired = vi.fn()
  const { result, rerender } = renderHook(({ path }) => usePagedList<string>(path, onExpired), { initialProps: { path: followers } })
  await waitFor(() => expect(result.current.items).toEqual(['seguidor']))
  let oldPending!: Promise<void>
  act(() => { oldPending = result.current.loadMore() })
  expect(result.current.busy).toBe(true)
  rerender({ path: following })
  await waitFor(() => expect(result.current.items).toEqual(['seguido']))
  expect(result.current.busy).toBe(false)
  let newPending!: Promise<void>
  act(() => { newPending = result.current.loadMore() })
  await act(async () => { oldMore.resolve(page('seguidor antigo')); await oldPending })
  expect(result.current.items).toEqual(['seguido'])
  expect(result.current.hasMore).toBe(true)
  expect(result.current.busy).toBe(true)
  await act(async () => { newMore.resolve(page('novo seguido')); await newPending })
  expect(vi.mocked(request)).toHaveBeenLastCalledWith(`${following}?cursor=following-next`)
  expect(result.current.items).toEqual(['seguido', 'novo seguido'])
  expect(result.current.busy).toBe(false)
})

it.each([new Error('Falha antiga'), new ApiError('Sessão antiga', 401)])('ignora o erro obsoleto %s após trocar a lista', async error => {
  const oldMore = deferred<Page<string>>()
  vi.mocked(request).mockResolvedValueOnce(page('seguidor', 'next'))
    .mockReturnValueOnce(oldMore.promise).mockResolvedValueOnce(page('seguido'))
  const onExpired = vi.fn()
  const { result, rerender } = renderHook(({ path }) => usePagedList<string>(path, onExpired), { initialProps: { path: followers } })
  await waitFor(() => expect(result.current.hasMore).toBe(true))
  let pending!: Promise<void>
  act(() => { pending = result.current.loadMore() })
  rerender({ path: following })
  await waitFor(() => expect(result.current.items).toEqual(['seguido']))
  await act(async () => { oldMore.reject(error); await pending })
  expect(result.current.moreError).toBe('')
  expect(result.current.error).toBeNull()
  expect(onExpired).not.toHaveBeenCalled()
})

it('invalida a continuação anterior ao recarregar a mesma URL', async () => {
  const oldMore = deferred<Page<string>>()
  vi.mocked(request).mockResolvedValueOnce(page('antigo', 'next'))
    .mockReturnValueOnce(oldMore.promise).mockResolvedValueOnce(page('atualizado', 'new-next'))
  const onExpired = vi.fn()
  const { result } = renderHook(() => usePagedList<string>(followers, onExpired))
  await waitFor(() => expect(result.current.items).toEqual(['antigo']))
  let pending!: Promise<void>
  act(() => { pending = result.current.loadMore() })
  act(() => { result.current.reload() })
  await waitFor(() => expect(result.current.items).toEqual(['atualizado']))
  await act(async () => { oldMore.resolve(page('página antiga')); await pending })
  expect(result.current.items).toEqual(['atualizado'])
  expect(result.current.hasMore).toBe(true)
  expect(result.current.busy).toBe(false)
})

it('ignora uma expiração de paginação depois de desmontar a lista', async () => {
  const more = deferred<Page<string>>()
  vi.mocked(request).mockResolvedValueOnce(page('seguidor', 'next')).mockReturnValueOnce(more.promise)
  const onExpired = vi.fn()
  const { result, unmount } = renderHook(() => usePagedList<string>(followers, onExpired))
  await waitFor(() => expect(result.current.hasMore).toBe(true))
  let pending!: Promise<void>
  act(() => { pending = result.current.loadMore() })
  unmount()
  await act(async () => { more.reject(new ApiError('Sessão antiga', 401)); await pending })
  expect(onExpired).not.toHaveBeenCalled()
})

it('mantém o erro e a expiração da paginação atual e limpa o erro ao tentar novamente', async () => {
  const retry = deferred<Page<string>>()
  vi.mocked(request).mockResolvedValueOnce(page('seguidor', 'next'))
    .mockRejectedValueOnce(new ApiError('Sessão expirada', 401)).mockReturnValueOnce(retry.promise)
  const onExpired = vi.fn()
  const { result } = renderHook(() => usePagedList<string>(followers, onExpired))
  await waitFor(() => expect(result.current.hasMore).toBe(true))
  await act(async () => { await result.current.loadMore() })
  expect(result.current.moreError).toBe('Sessão expirada')
  expect(result.current.items).toEqual(['seguidor'])
  expect(onExpired).toHaveBeenCalledOnce()
  let pending!: Promise<void>
  act(() => { pending = result.current.loadMore() })
  expect(result.current.moreError).toBe('')
  expect(result.current.busy).toBe(true)
  await act(async () => { retry.resolve(page('seguidor adicional')); await pending })
  expect(result.current.items).toEqual(['seguidor', 'seguidor adicional'])
  expect(result.current.busy).toBe(false)
})

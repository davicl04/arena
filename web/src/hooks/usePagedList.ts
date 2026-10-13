import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { ApiError, request } from '../api/client'
import { connection } from '../api/connection'
import type { Page } from '../api/client'

interface State<T> {
  path: string; generation: number; items: T[]; cursor: string | null; total: number | null; error: ApiError | Error | null
  busy: boolean; moreError: string
}

/**
 * Lista paginada por cursor. Trocar `path` recarrega a primeira página. Se a primeira página falhou por conexão
 * (`connectionError`), recarrega uma única vez quando a conexão volta; `moreError` (carregar mais) continua no rodapé.
 */
export function usePagedList<T>(path: string, onExpired: () => void) {
  const [state, setState] = useState<State<T> | null>(null)
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)
  useEffect(() => {
    const requestGeneration = ++generation.current
    request<Page<T>>(path).then(page => {
      if (generation.current === requestGeneration) setState({ path, generation: requestGeneration, items: page.items, cursor: page.next_cursor, total: page.total ?? null, error: null, busy: false, moreError: '' })
    }).catch((err: unknown) => {
      if (generation.current !== requestGeneration) return
      if (err instanceof ApiError && err.status === 401) onExpired()
      setState({ path, generation: requestGeneration, items: [], cursor: null, total: null, error: err instanceof Error ? err : new Error('Não foi possível carregar a lista.'), busy: false, moreError: '' })
    })
    return () => { generation.current = requestGeneration + 1 }
  }, [path, attempt, onExpired])
  const current = state && state.path === path ? state : null
  const setItems: Dispatch<SetStateAction<T[]>> = useCallback(update => {
    setState(old => old ? { ...old, items: typeof update === 'function' ? update(old.items) : update } : old)
  }, [])
  const loadMore = useCallback(async () => {
    if (!current?.cursor || current.busy || generation.current !== current.generation) return
    const requestGeneration = current.generation
    setState(old => old?.generation === requestGeneration ? { ...old, busy: true, moreError: '' } : old)
    try {
      const page = await request<Page<T>>(`${path}${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(current.cursor)}`)
      if (generation.current !== requestGeneration) return
      setState(old => old?.generation === requestGeneration ? { ...old, items: [...old.items, ...page.items], cursor: page.next_cursor, total: page.total ?? old.total } : old)
    } catch (err) {
      if (generation.current !== requestGeneration) return
      if (err instanceof ApiError && err.status === 401) onExpired()
      setState(old => old?.generation === requestGeneration ? { ...old, moreError: err instanceof Error ? err.message : 'Não foi possível carregar mais itens.' } : old)
    } finally {
      if (generation.current === requestGeneration) setState(old => old?.generation === requestGeneration ? { ...old, busy: false } : old)
    }
  }, [current, path, onExpired])
  const connectionError = current?.error instanceof ApiError && current.error.isConnection
  const retryOnRestore = useRef(false)
  useEffect(() => { retryOnRestore.current = connectionError }, [connectionError])
  const reload = useCallback(() => { generation.current++; setState(null); setAttempt(n => n + 1) }, [])
  useEffect(() => connection.onRestored(() => { if (retryOnRestore.current) { retryOnRestore.current = false; reload() } }), [reload])
  return {
    items: current?.items ?? [], loading: !current, error: current?.error ?? null, connectionError, moreError: current?.moreError ?? '',
    total: current?.total ?? null, hasMore: Boolean(current?.cursor), busy: current?.busy ?? false, setItems, loadMore,
    reload,
  }
}

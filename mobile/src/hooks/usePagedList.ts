import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { ApiError, request } from '../api/client'
import type { Page } from '../api/client'

interface State<T> {
  path: string; generation: number; items: T[]; cursor: string | null; error: ApiError | Error | null
  busy: boolean; moreError: string
}

export interface PagedList<T> {
  items: T[]; loading: boolean; error: ApiError | Error | null; moreError: string; hasMore: boolean; busy: boolean
  /** Verdadeiro durante `refresh`: a primeira página é relida sem esvaziar a lista (puxar para atualizar). */
  refreshing: boolean
  setItems: Dispatch<SetStateAction<T[]>>; loadMore: () => Promise<void>; reload: () => void; refresh: () => void
}

/** Lista paginada por cursor (porta do hook da web). Trocar `path` recarrega a primeira página. */
export function usePagedList<T>(path: string, onExpired: () => void): PagedList<T> {
  const [state, setState] = useState<State<T> | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const generation = useRef(0)
  // `onEndReached` pode disparar várias vezes antes de o estado `busy` chegar à tela.
  const loadingMore = useRef(false)
  useEffect(() => {
    const requestGeneration = ++generation.current
    loadingMore.current = false
    request<Page<T>>(path).then(page => {
      if (generation.current !== requestGeneration) return
      setState({ path, generation: requestGeneration, items: page.items, cursor: page.next_cursor, error: null, busy: false, moreError: '' })
      setRefreshing(false)
    }).catch((err: unknown) => {
      if (generation.current !== requestGeneration) return
      setRefreshing(false)
      if (err instanceof ApiError && err.status === 401) onExpired()
      setState({ path, generation: requestGeneration, items: [], cursor: null, error: err instanceof Error ? err : new Error('Não foi possível carregar a lista.'), busy: false, moreError: '' })
    })
    return () => { generation.current = requestGeneration + 1 }
  }, [path, attempt, onExpired])
  const current = state && state.path === path ? state : null
  const setItems: Dispatch<SetStateAction<T[]>> = useCallback(update => {
    setState(old => old ? { ...old, items: typeof update === 'function' ? update(old.items) : update } : old)
  }, [])
  const loadMore = useCallback(async () => {
    if (!current?.cursor || current.busy || loadingMore.current || generation.current !== current.generation) return
    const requestGeneration = current.generation
    loadingMore.current = true
    setState(old => old?.generation === requestGeneration ? { ...old, busy: true, moreError: '' } : old)
    try {
      const page = await request<Page<T>>(`${path}${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(current.cursor)}`)
      if (generation.current !== requestGeneration) return
      setState(old => old?.generation === requestGeneration ? { ...old, items: [...old.items, ...page.items], cursor: page.next_cursor } : old)
    } catch (err) {
      if (generation.current !== requestGeneration) return
      if (err instanceof ApiError && err.status === 401) onExpired()
      setState(old => old?.generation === requestGeneration ? { ...old, moreError: err instanceof Error ? err.message : 'Não foi possível carregar mais itens.' } : old)
    } finally {
      if (generation.current === requestGeneration) {
        loadingMore.current = false
        setState(old => old?.generation === requestGeneration ? { ...old, busy: false } : old)
      }
    }
  }, [current, path, onExpired])
  const reload = useCallback(() => { generation.current++; loadingMore.current = false; setRefreshing(false); setState(null); setAttempt(n => n + 1) }, [])
  // Mantém os itens na tela; a nova geração (no efeito) descarta um "carregar mais" ainda pendente.
  const refresh = useCallback(() => { setRefreshing(true); setAttempt(n => n + 1) }, [])
  return {
    items: current?.items ?? [], loading: !current, error: current?.error ?? null, moreError: current?.moreError ?? '',
    hasMore: Boolean(current?.cursor), busy: current?.busy ?? false, refreshing, setItems, loadMore, reload, refresh,
  }
}

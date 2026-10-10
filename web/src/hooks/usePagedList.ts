import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { ApiError, request } from '../api/client'
import type { Page } from '../api/client'

interface State<T> { path: string; items: T[]; cursor: string | null; error: ApiError | Error | null }

/** Lista paginada por cursor. Trocar `path` recarrega a primeira página. */
export function usePagedList<T>(path: string, onExpired: () => void) {
  const [state, setState] = useState<State<T> | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [moreError, setMoreError] = useState('')
  useEffect(() => {
    let alive = true
    request<Page<T>>(path).then(page => {
      if (alive) setState({ path, items: page.items, cursor: page.next_cursor, error: null })
    }).catch((err: unknown) => {
      if (!alive) return
      if (err instanceof ApiError && err.status === 401) onExpired()
      setState({ path, items: [], cursor: null, error: err instanceof Error ? err : new Error('Não foi possível carregar a lista.') })
    })
    return () => { alive = false }
  }, [path, attempt, onExpired])
  const current = state && state.path === path ? state : null
  const setItems: Dispatch<SetStateAction<T[]>> = useCallback(update => {
    setState(old => old ? { ...old, items: typeof update === 'function' ? update(old.items) : update } : old)
  }, [])
  const loadMore = useCallback(async () => {
    if (!current?.cursor || busy) return
    setBusy(true); setMoreError('')
    try {
      const page = await request<Page<T>>(`${path}${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(current.cursor)}`)
      setState(old => old ? { ...old, items: [...old.items, ...page.items], cursor: page.next_cursor } : old)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired()
      setMoreError(err instanceof Error ? err.message : 'Não foi possível carregar mais itens.')
    } finally { setBusy(false) }
  }, [current, busy, path, onExpired])
  return {
    items: current?.items ?? [], loading: !current, error: current?.error ?? null, moreError,
    hasMore: Boolean(current?.cursor), busy, setItems, loadMore, reload: () => { setState(null); setAttempt(n => n + 1) },
  }
}

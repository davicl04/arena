import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { ApiError, request } from '../api/client'
import type { Page } from '../api/client'
import { connection } from '../api/connection'

interface State<T> {
  path: string; generation: number; items: T[]; cursor: string | null; total?: number; error: ApiError | Error | null
  busy: boolean; moreError: string
}

export interface PagedList<T> {
  items: T[]; loading: boolean; error: ApiError | Error | null; moreError: string; hasMore: boolean; busy: boolean
  /** A primeira página falhou por conexão: recarrega sozinha, uma vez, quando a conexão volta. */
  connectionError: boolean
  /** Total de registros, quando a resposta o traz (a linha do tempo do perfil); `undefined` nas demais listas. */
  total: number | undefined
  /** Verdadeiro durante `refresh`: a primeira página é relida sem esvaziar a lista (puxar para atualizar). */
  refreshing: boolean
  setItems: Dispatch<SetStateAction<T[]>>; loadMore: () => Promise<void>; reload: () => void; refresh: () => void
}

/**
 * Lista paginada por cursor (porta do hook da web). Trocar `path` recarrega a primeira página. Com `enabled` falso não há leitura
 * (`loading` é falso e a lista, vazia): a tela de notificações não lê a lista no chip "Para responder". Se a primeira página falhou
 * por conexão (`connectionError`), recarrega uma única vez quando a conexão volta; `moreError` (carregar mais) continua no rodapé.
 */
export function usePagedList<T>(path: string, onExpired: () => void, enabled = true): PagedList<T> {
  const [state, setState] = useState<State<T> | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const generation = useRef(0)
  // `onEndReached` pode disparar várias vezes antes de o estado `busy` chegar à tela.
  const loadingMore = useRef(false)
  useEffect(() => {
    if (!enabled) return
    const requestGeneration = ++generation.current
    loadingMore.current = false
    request<Page<T>>(path).then(page => {
      if (generation.current !== requestGeneration) return
      setState({ path, generation: requestGeneration, items: page.items, cursor: page.next_cursor, total: page.total, error: null, busy: false, moreError: '' })
      setRefreshing(false)
    }).catch((err: unknown) => {
      if (generation.current !== requestGeneration) return
      setRefreshing(false)
      if (err instanceof ApiError && err.status === 401) onExpired()
      setState({ path, generation: requestGeneration, items: [], cursor: null, error: err instanceof Error ? err : new Error('Não foi possível carregar a lista.'), busy: false, moreError: '' })
    })
    return () => { generation.current = requestGeneration + 1 }
  }, [path, attempt, onExpired, enabled])
  const current = enabled && state && state.path === path ? state : null
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
      setState(old => old?.generation === requestGeneration ? { ...old, items: [...old.items, ...page.items], cursor: page.next_cursor, total: page.total ?? old.total } : old)
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
  const connectionError = current?.error instanceof ApiError && current.error.isConnection
  const retryOnRestore = useRef(false)
  useEffect(() => { retryOnRestore.current = connectionError }, [connectionError])
  useEffect(() => connection.onRestored(() => { if (retryOnRestore.current) { retryOnRestore.current = false; reload() } }), [reload])
  return {
    items: current?.items ?? [], loading: enabled && !current, error: current?.error ?? null, connectionError, moreError: current?.moreError ?? '',
    total: current?.total, hasMore: Boolean(current?.cursor), busy: current?.busy ?? false, refreshing, setItems, loadMore, reload, refresh,
  }
}

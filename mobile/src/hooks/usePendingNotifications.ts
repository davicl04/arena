import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { ApiError } from '../api/client'
import { connection } from '../api/connection'
import { listPendingNotifications } from '../api/notifications'
import type { ArenaNotification, NotificationFilterCategory } from '../api/notifications'

interface State { key: string; generation: number; items: ArenaNotification[]; cursor: string | null; error: string; cause: unknown; busy: boolean; moreError: string }

export interface PendingNotificationsState {
  items: ArenaNotification[]
  /** Verdadeiro até a primeira resposta da consulta atual (trocar `categoria` ou `limit` volta a carregar). */
  loading: boolean
  error: string
  /** O erro lançado pela consulta (para o `LoadError` reconhecer a falta de conexão). */
  errorCause: unknown
  setItems: Dispatch<SetStateAction<ArenaNotification[]>>
  /** Lê de novo mostrando o carregamento (o "Tentar novamente"). */
  reload: () => void
  hasMore: boolean
  busy: boolean
  moreError: string
  loadMore: () => Promise<void>
}

/**
 * Pendências abertas (`GET /me/notifications/pending`), da mais urgente à menos, com cursor. Trocar `categoria` ou `limit` lê
 * outra consulta; `refreshKey` (por exemplo, o `pending_count` do resumo) relê sem esvaziar a lista. 401 chama `onExpired`;
 * `enabled` falso não lê. Respostas antigas são descartadas.
 */
export function usePendingNotifications({ categoria, limit }: { categoria?: NotificationFilterCategory; limit?: number }, onExpired: () => void, { enabled = true, refreshKey = 0 } = {}): PendingNotificationsState {
  const [state, setState] = useState<State | null>(null)
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)
  const loadingMore = useRef(false)
  const expired = useRef(onExpired)
  useEffect(() => { expired.current = onExpired }, [onExpired])
  const key = `${categoria ?? ''}|${limit ?? ''}`
  useEffect(() => {
    if (!enabled) return
    const mine = ++generation.current
    loadingMore.current = false
    void Promise.resolve().then(() => listPendingNotifications({ categoria, limit })).then(page => {
      if (generation.current === mine) setState({ key, generation: mine, items: Array.isArray(page?.items) ? page.items : [], cursor: page?.next_cursor ?? null, error: '', cause: null, busy: false, moreError: '' })
    }, (cause: unknown) => {
      if (generation.current !== mine) return
      if (cause instanceof ApiError && cause.status === 401) expired.current()
      setState({ key, generation: mine, items: [], cursor: null, error: cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar as pendências.', cause, busy: false, moreError: '' })
    })
    return () => { generation.current = mine + 1 }
  }, [categoria, limit, key, enabled, attempt, refreshKey])
  const current = enabled && state?.key === key ? state : null
  const setItems: Dispatch<SetStateAction<ArenaNotification[]>> = useCallback(update => {
    setState(old => old ? { ...old, items: typeof update === 'function' ? update(old.items) : update } : old)
  }, [])
  const loadMore = useCallback(async () => {
    if (!current?.cursor || loadingMore.current || generation.current !== current.generation) return
    const mine = current.generation
    loadingMore.current = true
    setState(old => old?.generation === mine ? { ...old, busy: true, moreError: '' } : old)
    try {
      const page = await listPendingNotifications({ categoria, limit, cursor: current.cursor })
      if (generation.current !== mine) return
      setState(old => {
        if (old?.generation !== mine) return old
        const known = new Set(old.items.map(item => item.id))
        return { ...old, items: [...old.items, ...page.items.filter(item => !known.has(item.id))], cursor: page.next_cursor ?? null }
      })
    } catch (cause) {
      if (generation.current !== mine) return
      if (cause instanceof ApiError && cause.status === 401) expired.current()
      setState(old => old?.generation === mine ? { ...old, moreError: cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar mais pendências.' } : old)
    } finally {
      if (generation.current === mine) {
        loadingMore.current = false
        setState(old => old?.generation === mine ? { ...old, busy: false } : old)
      }
    }
  }, [current, categoria, limit])
  const reload = useCallback(() => { generation.current++; setState(null); setAttempt(n => n + 1) }, [])
  // Falha de conexão: recarrega uma única vez quando a conexão volta (como `useResource` e `usePagedList`).
  const connectionError = current?.cause instanceof ApiError && current.cause.isConnection
  const retryOnRestore = useRef(false)
  useEffect(() => { retryOnRestore.current = connectionError }, [connectionError])
  useEffect(() => connection.onRestored(() => { if (retryOnRestore.current) { retryOnRestore.current = false; reload() } }), [reload])
  return { items: current?.items ?? [], loading: enabled && !current, error: current?.error ?? '', errorCause: current?.cause ?? null, setItems, reload,
    hasMore: Boolean(current?.cursor), busy: current?.busy ?? false, moreError: current?.moreError ?? '', loadMore }
}

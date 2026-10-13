import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { ApiError } from '../api/client'
import { listPendingNotifications } from '../api/notifications'
import type { ArenaNotification, NotificationFilterCategory } from '../api/notifications'

interface State { key: string; items: ArenaNotification[]; error: string }

/**
 * Pendências abertas (`GET /me/notifications/pending`), da mais urgente à menos urgente. Trocar `categoria` ou `limit`
 * lê de novo e esconde o resultado anterior; `enabled` falso não lê; `version` muda quando o resumo muda e lê de novo
 * mantendo o resultado anterior na tela. 401 chama `onExpired`.
 */
export function usePendingNotifications(onExpired: () => void, { categoria, limit, enabled = true, version }: { categoria?: NotificationFilterCategory; limit: number; enabled?: boolean; version?: string | number }) {
  const key = `${categoria ?? ''}|${limit}`
  const [state, setState] = useState<State | null>(null)
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)
  const expired = useRef(onExpired)
  useEffect(() => { expired.current = onExpired }, [onExpired])
  useEffect(() => {
    if (!enabled) return
    const mine = ++generation.current
    listPendingNotifications({ categoria, limit }).then(result => {
      if (generation.current === mine) setState({ key, items: result.items, error: '' })
    }).catch((cause: unknown) => {
      if (generation.current !== mine) return
      if (cause instanceof ApiError && cause.status === 401) expired.current()
      setState({ key, items: [], error: cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar as pendências.' })
    })
    return () => { generation.current = mine + 1 }
  }, [categoria, limit, key, enabled, attempt, version])
  const current = enabled && state?.key === key ? state : null
  const setItems: Dispatch<SetStateAction<ArenaNotification[]>> = useCallback(update => {
    setState(old => old ? { ...old, items: typeof update === 'function' ? update(old.items) : update } : old)
  }, [])
  const reload = useCallback(() => { generation.current++; setState(null); setAttempt(n => n + 1) }, [])
  return { items: current?.items ?? [], loading: enabled && !current, error: current?.error ?? '', setItems, reload }
}

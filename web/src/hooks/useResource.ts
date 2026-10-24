import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { ApiError } from '../api/client'
import { connection } from '../api/connection'

interface State<T> { generation: number; data: T | null; error: string; cause: unknown }

/**
 * Leitura única da API ao montar (e em `reload`), com 401 tratado por `onExpired`. `load` deve ser estável
 * (uma função do módulo da API); `enabled` falso não faz a leitura. Respostas antigas são descartadas.
 * Se a leitura falhou por conexão (`connectionError`), recarrega uma única vez quando a conexão volta; as demais falhas
 * esperam o `reload` ("Tentar novamente"). `errorCause` é o erro lançado, para o `LoadError`.
 */
export function useResource<T>(load: () => Promise<T>, onExpired: () => void, { enabled = true, fallback = 'Não foi possível carregar os dados.' } = {}) {
  const [state, setState] = useState<State<T> | null>(null)
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)
  useEffect(() => {
    if (!enabled) return
    const current = ++generation.current
    load().then(data => {
      if (generation.current === current) setState({ generation: current, data, error: '', cause: null })
    }).catch((cause: unknown) => {
      if (generation.current !== current) return
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setState({ generation: current, data: null, error: cause instanceof Error && cause.message ? cause.message : fallback, cause })
    })
    return () => { generation.current = current + 1 }
  }, [load, onExpired, enabled, attempt, fallback])
  const setData: Dispatch<SetStateAction<T | null>> = useCallback(update => {
    setState(old => old ? { ...old, data: typeof update === 'function' ? (update as (value: T | null) => T | null)(old.data) : update, error: '', cause: null } : old)
  }, [])
  const reload = useCallback(() => { generation.current++; setState(null); setAttempt(n => n + 1) }, [])
  const connectionError = state?.cause instanceof ApiError && state.cause.isConnection
  const retryOnRestore = useRef(false)
  useEffect(() => { retryOnRestore.current = connectionError }, [connectionError])
  useEffect(() => connection.onRestored(() => { if (retryOnRestore.current) { retryOnRestore.current = false; reload() } }), [reload])
  return { data: state?.data ?? null, loading: enabled && !state, error: state?.error ?? '', errorCause: state?.cause ?? null, connectionError, setData, reload }
}

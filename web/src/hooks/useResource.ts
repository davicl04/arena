import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { ApiError } from '../api/client'

interface State<T> { generation: number; data: T | null; error: string }

/**
 * Leitura única da API ao montar (e em `reload`), com 401 tratado por `onExpired`. `load` deve ser estável
 * (uma função do módulo da API); `enabled` falso não faz a leitura. Respostas antigas são descartadas.
 */
export function useResource<T>(load: () => Promise<T>, onExpired: () => void, { enabled = true, fallback = 'Não foi possível carregar os dados.' } = {}) {
  const [state, setState] = useState<State<T> | null>(null)
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)
  useEffect(() => {
    if (!enabled) return
    const current = ++generation.current
    load().then(data => {
      if (generation.current === current) setState({ generation: current, data, error: '' })
    }).catch((cause: unknown) => {
      if (generation.current !== current) return
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setState({ generation: current, data: null, error: cause instanceof Error && cause.message ? cause.message : fallback })
    })
    return () => { generation.current = current + 1 }
  }, [load, onExpired, enabled, attempt, fallback])
  const setData: Dispatch<SetStateAction<T | null>> = useCallback(update => {
    setState(old => old ? { ...old, data: typeof update === 'function' ? (update as (value: T | null) => T | null)(old.data) : update, error: '' } : old)
  }, [])
  const reload = useCallback(() => { generation.current++; setState(null); setAttempt(n => n + 1) }, [])
  return { data: state?.data ?? null, loading: enabled && !state, error: state?.error ?? '', setData, reload }
}

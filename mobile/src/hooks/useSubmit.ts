import { useCallback, useState } from 'react'
import { ApiError } from '../api/client'

/**
 * Executa uma ação assíncrona com estado de ocupado e de erro e o tratamento do 401 (porta de `useSubmit` da web).
 * `run` devolve o resultado, ou `undefined` quando a ação falhou (a mensagem fica em `error`).
 */
export function useSubmit(onExpired: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = useCallback(async <T,>(action: () => Promise<T>, fallback: string): Promise<T | undefined> => {
    setBusy(true); setError('')
    try { return await action() }
    catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setError(cause instanceof Error && cause.message ? cause.message : fallback)
      return undefined
    } finally { setBusy(false) }
  }, [onExpired])
  return { busy, error, setError, run }
}

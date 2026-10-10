import { useCallback, useState } from 'react'
import { ApiError } from '../api/client'

/** Executa uma ação assíncrona com estado de ocupado/erro e tratamento de 401. */
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

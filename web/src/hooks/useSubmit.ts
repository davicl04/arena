import { useCallback, useState } from 'react'
import { ApiError } from '../api/client'

/** O recurso mudou ou sumiu no servidor (`404`/`409`): quem agiu sobre um estado velho deve reler antes de seguir. */
export function isStale(cause: unknown): boolean {
  return cause instanceof ApiError && (cause.status === 404 || cause.status === 409)
}

/**
 * Executa uma ação assíncrona com estado de ocupado/erro e tratamento de 401. `onFailure` recebe o erro depois de a
 * mensagem do servidor ficar visível (a leitura do estado atual depois de um `404`/`409`); a ação segue ocupada até ela
 * terminar, e uma falha dela não troca a mensagem.
 */
export function useSubmit(onExpired: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = useCallback(async <T,>(action: () => Promise<T>, fallback: string, onFailure?: (cause: unknown) => void | Promise<void>): Promise<T | undefined> => {
    setBusy(true); setError('')
    try { return await action() }
    catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setError(cause instanceof Error && cause.message ? cause.message : fallback)
      try { await onFailure?.(cause) } catch { /* a releitura é um auxílio: a mensagem do servidor já está na tela */ }
      return undefined
    } finally { setBusy(false) }
  }, [onExpired])
  return { busy, error, setError, run }
}

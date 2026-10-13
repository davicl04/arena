import { useCallback, useState } from 'react'
import { ApiError } from '../api/client'
import type { FieldError } from '../api/client'
import { connection } from '../api/connection'
import { toast } from '../components/toast/toastStore'

/** O recurso mudou ou sumiu no servidor (`404`/`409`): quem agiu sobre um estado velho deve reler antes de seguir. */
export function isStale(cause: unknown): boolean {
  return cause instanceof ApiError && (cause.status === 404 || cause.status === 409)
}

/**
 * O que `reportActionError` fez com a falha:
 * - `expired`: 401, `onExpired()` já foi chamado (fluxo de sessão expirada, sem toast);
 * - `connection`: sem conexão, o aviso de conexão cuida (nenhuma mensagem local);
 * - `form`: validação do servidor que pertence à tela (422 com `fields`, ou o conflito de agenda do `409`):
 *   nada foi mostrado, o chamador distribui `fields` e/ou exibe `message` junto ao campo ou ao bloco;
 * - `stale`: 404/409 de algo que outra pessoa já decidiu, `toast.warning` com a mensagem do servidor;
 * - `error`: qualquer outro erro, `toast.error` com a mensagem do servidor.
 */
export type ActionErrorKind = 'expired' | 'connection' | 'form' | 'stale' | 'error'
export interface ActionErrorReport { kind: ActionErrorKind; message: string; fields: FieldError[] }

/** Mensagem do servidor (`detail`) ou o texto de reserva. */
export function actionErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

/** A falha fica junto ao formulário: campos recusados (`422` com `fields`) ou o conflito de agenda (`409` com `conflict`). */
function staysWithForm(cause: unknown): cause is ApiError {
  if (!(cause instanceof ApiError)) return false
  return (cause.status === 422 && cause.fields.length > 0) || (cause.status === 409 && Boolean(cause.body?.conflict))
}

/**
 * Regra única dos erros de ação (plano de toasts, A4/C3), para o `useSubmit` e para os `catch` manuais:
 * 401 → `onExpired`; sem conexão → aviso de conexão (`connection.attempted`); 422 com campos → devolvido ao formulário;
 * 404/409 → `toast.warning`; o resto → `toast.error` com a mensagem do servidor (ou `fallback`).
 */
export function reportActionError(cause: unknown, fallback: string, onExpired: () => void): ActionErrorReport {
  const message = actionErrorMessage(cause, fallback)
  if (cause instanceof ApiError && cause.status === 401) { onExpired(); return { kind: 'expired', message, fields: [] } }
  if (cause instanceof ApiError && cause.isConnection) { connection.attempted(cause); return { kind: 'connection', message, fields: [] } }
  if (staysWithForm(cause)) return { kind: 'form', message, fields: cause.fields }
  if (isStale(cause)) { toast.warning(message); return { kind: 'stale', message, fields: [] } }
  toast.error(message)
  return { kind: 'error', message, fields: [] }
}

/**
 * Executa uma ação assíncrona com estado de ocupado e o tratamento de erros de `reportActionError` (porta de `useSubmit`
 * da web). `run` devolve o resultado, ou `undefined` quando a ação falhou. `error` e `fields` só guardam o que pertence ao
 * formulário (422 com campos; conflito de agenda): o resto vira toast ou aviso de conexão e deixa `error` vazio.
 * `onFailure` recebe o erro depois de o toast ficar visível (a releitura do estado atual depois de um `404`/`409`); a ação
 * segue ocupada até ela terminar, e uma falha dela não troca a mensagem.
 */
export function useSubmit(onExpired: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fields, setFields] = useState<FieldError[]>([])
  const run = useCallback(async <T,>(action: () => Promise<T>, fallback: string, onFailure?: (cause: unknown) => void | Promise<void>): Promise<T | undefined> => {
    setBusy(true); setError(''); setFields([])
    try { return await action() }
    catch (cause) {
      const report = reportActionError(cause, fallback, onExpired)
      if (report.kind === 'form') { setError(report.message); setFields(report.fields) }
      try { await onFailure?.(cause) } catch { /* a releitura é um auxílio: a mensagem do servidor já está na tela */ }
      return undefined
    } finally { setBusy(false) }
  }, [onExpired])
  return { busy, error, fields, setError, run }
}

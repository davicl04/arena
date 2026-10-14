import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { getNotificationSummary } from '../api/notifications'
import type { NotificationSummary } from '../api/notifications'

/** Intervalo da releitura com o app visível (contrato do plano: sem tempo real). */
export const NOTIFICATION_SUMMARY_POLL_MS = 60_000
/** Foco e volta à aba costumam disparar juntos: leituras mais próximas que isto reaproveitam a última. */
const FRESH_MS = 2_000

export interface NotificationSummaryState {
  /** Último resumo lido; `null` até a primeira resposta (a leitura anterior continua valendo se uma nova falhar). */
  data: NotificationSummary | null
  /** Não lidas mais pedidos para seguir: o número do sino. */
  count: number
  /** Mensagem da última leitura que falhou. */
  error: string
  /** Lê de novo agora, sem esvaziar o número do sino. */
  reload: () => Promise<void>
  /** Aplica um resumo já conhecido (resposta de ler, ler todas) e descarta leituras em andamento. */
  setData: (summary: NotificationSummary) => void
}

/**
 * Resumo das notificações (`GET /me/notifications/summary`): alimenta o sino das cinco abas raiz, os chips da tela, a
 * linha do Menu e a placa do Início. Lido ao montar e, depois, quando a aba raiz muda (`root`), ao voltar à janela
 * (`focus` e `visibilitychange` para visível) e a cada 60 s com a página visível. Instancie uma vez (ArenaPage).
 * Respostas antigas são descartadas; 401 chama `onExpired`.
 */
export function useNotificationSummary(onExpired: () => void, root: string): NotificationSummaryState {
  const [data, setDataState] = useState<NotificationSummary | null>(null)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const loadedAt = useRef(0)
  const expired = useRef(onExpired)
  useEffect(() => { expired.current = onExpired }, [onExpired])

  const reload = useCallback((): Promise<void> => {
    const mine = ++generation.current
    loadedAt.current = Date.now()
    return Promise.resolve().then(getNotificationSummary).then(summary => {
      if (generation.current !== mine) return
      setDataState(summary)
      setError('')
    }, (cause: unknown) => {
      if (generation.current !== mine) return
      if (cause instanceof ApiError && cause.status === 401) expired.current()
      setError(cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar as notificações.')
    })
  }, [])
  const setData = useCallback((summary: NotificationSummary) => {
    generation.current++
    setDataState(summary)
    setError('')
  }, [])

  const refresh = useCallback(() => {
    if (Date.now() - loadedAt.current >= FRESH_MS) void reload()
  }, [reload])

  useEffect(() => { void reload() }, [reload])

  // Troca de aba raiz: nova leitura (a primeira passagem é a leitura de montagem).
  const lastRoot = useRef(root)
  useEffect(() => {
    if (lastRoot.current === root) return
    lastRoot.current = root
    void reload()
  }, [root, reload])

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void reload() }, NOTIFICATION_SUMMARY_POLL_MS)
    return () => window.clearInterval(id)
  }, [reload])

  const count = (data?.unread_count ?? 0) + (data?.follow_requests_count ?? 0)
  return { data, count, error, reload, setData }
}

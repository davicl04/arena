import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { ApiError } from '../api/client'
import { getNotificationSummary } from '../api/notifications'
import type { NotificationSummary } from '../api/notifications'

/** Intervalo da releitura do resumo enquanto o app está em primeiro plano (sem tempo real). */
export const NOTIFICATION_SUMMARY_POLL_MS = 60_000

export interface NotificationSummaryState {
  /** Último resumo lido; `null` até a primeira resposta (ou se nenhuma deu certo). */
  data: NotificationSummary | null
  /** Número do sino: não lidas mais pedidos para seguir; 0 sem resumo. */
  count: number
  /** Relê o resumo agora, mantendo o anterior na tela (a leitura que falha não zera o sino). */
  reload: () => void
  /** Troca o resumo pelo devolvido por uma ação (ler, ler todas) e descarta leituras ainda em curso. */
  setData: (summary: NotificationSummary) => void
}

/** Soma do sino: não lidas e pedidos para seguir pendentes. Campos ausentes valem 0. */
export const summaryCount = (summary: NotificationSummary | null): number => (summary ? (summary.unread_count || 0) + (summary.follow_requests_count || 0) : 0)

/**
 * Resumo das notificações (`GET /me/notifications/summary`) compartilhado pelas abas raiz e pela tela de notificações,
 * lido uma vez no shell (como a placa do Jogar). Relê ao montar, quando `tab` (a aba raiz aberta) muda, quando o app volta
 * ao primeiro plano e a cada 60 s com o app visível. Respostas antigas são descartadas; 401 chama `onExpired`; uma leitura
 * que falha mantém o último resumo.
 */
export function useNotificationSummary(onExpired: () => void, tab: string): NotificationSummaryState {
  const [data, setState] = useState<NotificationSummary | null>(null)
  const [foreground, setForeground] = useState(() => AppState.currentState !== 'background' && AppState.currentState !== 'inactive')
  const generation = useRef(0)
  const expired = useRef(onExpired)
  useEffect(() => { expired.current = onExpired }, [onExpired])

  const reload = useCallback(() => {
    const mine = ++generation.current
    void Promise.resolve().then(getNotificationSummary).then(next => {
      if (generation.current === mine && next && typeof next === 'object') setState(next)
    }, (cause: unknown) => {
      if (generation.current === mine && cause instanceof ApiError && cause.status === 401) expired.current()
    })
  }, [])
  const setData = useCallback((next: NotificationSummary) => { generation.current++; setState(next) }, [])

  // Ao montar e a cada troca de aba raiz.
  useEffect(() => { reload() }, [reload, tab])

  // O app volta ao primeiro plano: relê agora e retoma a leitura periódica.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      const visible = state === 'active'
      setForeground(visible)
      if (visible) reload()
    })
    return () => subscription.remove()
  }, [reload])

  useEffect(() => {
    if (!foreground) return
    const id = setInterval(reload, NOTIFICATION_SUMMARY_POLL_MS)
    return () => clearInterval(id)
  }, [foreground, reload])

  return { data, count: summaryCount(data), reload, setData }
}

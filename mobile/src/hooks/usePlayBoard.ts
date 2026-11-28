import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { ApiError } from '../api/client'
import { connection } from '../api/connection'
import { getPlayBoard, normalizeBoard } from '../api/matchmaking'
import type { PlayBoard } from '../api/matchmaking'

/** Intervalo da releitura com atenção calma (p. ex. só partida combinando) ou depois de uma falha (contrato 0002, seção 9.3). */
export const PLAY_BOARD_POLL_MS = 15_000
/** Intervalo da releitura enquanto há busca aberta, proposta ou oferta: a outra pessoa pode mudar a placa a qualquer instante. */
export const PLAY_BOARD_LIVE_POLL_MS = 3_000
/** Leituras mais próximas que isto (volta ao app, volta à placa) reaproveitam a última. */
const FRESH_MS = 3_000

export interface PlayBoardState {
  /** Última placa lida; `null` até a primeira resposta (ou se nenhuma deu certo). */
  board: PlayBoard | null
  loading: boolean
  /** Mensagem da última leitura que falhou (a placa anterior continua valendo). */
  error: string
  /** O erro lançado pela última leitura que falhou (para o `LoadError` reconhecer a falta de conexão). */
  errorCause?: unknown
  /** Lê de novo agora e devolve a placa; `null` se a leitura falhar ou for superada por outra mais nova. */
  reload: () => Promise<PlayBoard | null>
  /** Propostas que a pessoa deixou para "Responder depois": não reabrem sozinhas em tela cheia (só na memória da sessão). */
  deferred: readonly number[]
  defer: (matchId: number) => void
}

/**
 * Placa do Jogar (`GET /me/play`), lida ao montar, ao voltar o app ao primeiro plano, ao abrir a tela Jogar ou o Início
 * (`active`) e periodicamente enquanto `attention` estiver ligada: o mesmo dado acende o ponto da navegação. A leitura
 * periódica é de 3 s com busca, proposta ou oferta na placa e de 15 s no resto ou enquanto a última leitura falhou; ela
 * pula o tique se a anterior ainda não respondeu. Sem atenção, não há leitura periódica; com o app em segundo plano
 * (`AppState`), ela pausa. Respostas antigas são descartadas; 401 chama `onExpired`.
 */
export function usePlayBoard(onExpired: () => void, active: boolean): PlayBoardState {
  const [board, setBoard] = useState<PlayBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errorCause, setErrorCause] = useState<unknown>(null)
  const [deferred, setDeferred] = useState<readonly number[]>([])
  const [foreground, setForeground] = useState(() => AppState.currentState !== 'background' && AppState.currentState !== 'inactive')
  const defer = useCallback((matchId: number) => setDeferred(old => old.includes(matchId) ? old : [...old, matchId]), [])
  const generation = useRef(0)
  const loadedAt = useRef(0)
  /** A leitura mais nova ainda não respondeu (a periódica espera por ela em vez de descartá-la). */
  const pending = useRef(false)
  const expired = useRef(onExpired)
  useEffect(() => { expired.current = onExpired }, [onExpired])

  const reload = useCallback((): Promise<PlayBoard | null> => {
    const mine = ++generation.current
    loadedAt.current = Date.now()
    pending.current = true
    return Promise.resolve().then(() => getPlayBoard({ background: true })).then(raw => {
      if (generation.current !== mine) return null
      pending.current = false
      const next = normalizeBoard(raw)
      setBoard(next)
      setError('')
      setErrorCause(null)
      setLoading(false)
      return next
    }, (cause: unknown) => {
      if (generation.current !== mine) return null
      pending.current = false
      if (cause instanceof ApiError && cause.status === 401) expired.current()
      setError(cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar a placa.')
      setErrorCause(cause)
      setLoading(false)
      return null
    })
  }, [])

  const refresh = useCallback(() => {
    if (Date.now() - loadedAt.current >= FRESH_MS) void reload()
  }, [reload])

  useEffect(() => { void reload() }, [reload])

  /* Se a última leitura falhou por conexão, relê uma única vez quando ela volta (como `useResource`). */
  const retryOnRestore = useRef(false)
  useEffect(() => { retryOnRestore.current = errorCause instanceof ApiError && errorCause.isConnection }, [errorCause])
  useEffect(() => connection.onRestored(() => {
    if (retryOnRestore.current) { retryOnRestore.current = false; void reload() }
  }), [reload])

  // O app volta ao primeiro plano: relê a placa (se a última leitura já ficou velha) e retoma a leitura periódica.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      const visible = state === 'active'
      setForeground(visible)
      if (visible) refresh()
    })
    return () => subscription.remove()
  }, [refresh])

  const wasActive = useRef(active)
  useEffect(() => {
    if (active && !wasActive.current) refresh()
    wasActive.current = active
  }, [active, refresh])

  const attention = Boolean(board?.attention)
  const live = Boolean(board && (board.searches.length > 0 || board.proposals.length > 0 || board.offers.length > 0))
  const interval = live && !error ? PLAY_BOARD_LIVE_POLL_MS : PLAY_BOARD_POLL_MS
  useEffect(() => {
    if (!attention || !foreground) return
    const id = setInterval(() => { if (!pending.current) void reload() }, interval)
    return () => clearInterval(id)
  }, [attention, foreground, interval, reload])

  return { board, loading, error, errorCause, reload, deferred, defer }
}

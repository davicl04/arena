import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { ApiError } from '../api/client'
import { getPlayBoard, normalizeBoard } from '../api/matchmaking'
import type { PlayBoard } from '../api/matchmaking'

/** Intervalo da releitura enquanto há busca, proposta, oferta ou partida combinando (contrato 0002, seção 9.3). */
export const PLAY_BOARD_POLL_MS = 15_000
/** Leituras mais próximas que isto (volta ao app, volta à placa) reaproveitam a última. */
const FRESH_MS = 3_000

export interface PlayBoardState {
  /** Última placa lida; `null` até a primeira resposta (ou se nenhuma deu certo). */
  board: PlayBoard | null
  loading: boolean
  /** Mensagem da última leitura que falhou (a placa anterior continua valendo). */
  error: string
  /** Lê de novo agora e devolve a placa; `null` se a leitura falhar ou for superada por outra mais nova. */
  reload: () => Promise<PlayBoard | null>
  /** Propostas que a pessoa deixou para "Responder depois": não reabrem sozinhas em tela cheia (só na memória da sessão). */
  deferred: readonly number[]
  defer: (matchId: number) => void
}

/**
 * Placa do Jogar (`GET /me/play`), lida ao montar, ao voltar o app ao primeiro plano, ao abrir a tela Jogar ou o Início
 * (`active`) e a cada 15 s enquanto `attention` estiver ligada: o mesmo dado acende o ponto da navegação. Sem atenção,
 * não há leitura periódica; com o app em segundo plano (`AppState`), a leitura periódica pausa. Respostas antigas são
 * descartadas; 401 chama `onExpired`.
 */
export function usePlayBoard(onExpired: () => void, active: boolean): PlayBoardState {
  const [board, setBoard] = useState<PlayBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deferred, setDeferred] = useState<readonly number[]>([])
  const [foreground, setForeground] = useState(() => AppState.currentState !== 'background' && AppState.currentState !== 'inactive')
  const defer = useCallback((matchId: number) => setDeferred(old => old.includes(matchId) ? old : [...old, matchId]), [])
  const generation = useRef(0)
  const loadedAt = useRef(0)
  const expired = useRef(onExpired)
  useEffect(() => { expired.current = onExpired }, [onExpired])

  const reload = useCallback((): Promise<PlayBoard | null> => {
    const mine = ++generation.current
    loadedAt.current = Date.now()
    return Promise.resolve().then(getPlayBoard).then(raw => {
      if (generation.current !== mine) return null
      const next = normalizeBoard(raw)
      setBoard(next)
      setError('')
      setLoading(false)
      return next
    }, (cause: unknown) => {
      if (generation.current !== mine) return null
      if (cause instanceof ApiError && cause.status === 401) expired.current()
      setError(cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar a placa.')
      setLoading(false)
      return null
    })
  }, [])

  const refresh = useCallback(() => {
    if (Date.now() - loadedAt.current >= FRESH_MS) void reload()
  }, [reload])

  useEffect(() => { void reload() }, [reload])

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
  useEffect(() => {
    if (!attention || !foreground) return
    const id = setInterval(() => { void reload() }, PLAY_BOARD_POLL_MS)
    return () => clearInterval(id)
  }, [attention, foreground, reload])

  return { board, loading, error, reload, deferred, defer }
}

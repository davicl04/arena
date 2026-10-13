import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { getPlayBoard, normalizeBoard } from '../api/matchmaking'
import type { PlayBoard } from '../api/matchmaking'

/** Intervalo da releitura enquanto há busca, proposta, oferta ou partida combinando (contrato 0002, seção 9.3). */
export const PLAY_BOARD_POLL_MS = 15_000
/** Leituras mais próximas que isto (foco, volta à placa) reaproveitam a última. */
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
 * Placa do Jogar (`GET /me/play`), lida ao montar, ao voltar a atenção à janela (foco e aba visível), ao abrir a tela
 * Jogar (`active`) e a cada 15 s enquanto `attention` estiver ligada — o mesmo dado acende o ponto menta da navegação.
 * Sem atenção, não há leitura periódica. Respostas antigas são descartadas; 401 chama `onExpired`.
 */
export function usePlayBoard(onExpired: () => void, active: boolean): PlayBoardState {
  const [board, setBoard] = useState<PlayBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deferred, setDeferred] = useState<readonly number[]>([])
  const defer = useCallback((matchId: number) => setDeferred(old => old.includes(matchId) ? old : [...old, matchId]), [])
  const generation = useRef(0)
  const loadedAt = useRef(0)
  const expired = useRef(onExpired)
  useEffect(() => { expired.current = onExpired }, [onExpired])

  const reload = useCallback((): Promise<PlayBoard | null> => {
    const mine = ++generation.current
    loadedAt.current = Date.now()
    return Promise.resolve().then(() => getPlayBoard({ background: true })).then(raw => {
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

  useEffect(() => {
    const onVisible = () => { if (!document.hidden) refresh() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const wasActive = useRef(active)
  useEffect(() => {
    if (active && !wasActive.current) refresh()
    wasActive.current = active
  }, [active, refresh])

  const attention = Boolean(board?.attention)
  useEffect(() => {
    if (!attention) return
    const id = window.setInterval(() => { if (!document.hidden) void reload() }, PLAY_BOARD_POLL_MS)
    return () => window.clearInterval(id)
  }, [attention, reload])

  return { board, loading, error, reload, deferred, defer }
}

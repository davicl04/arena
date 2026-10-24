import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, request } from '../../api/client'
import { connection } from '../../api/connection'
import { rankingOverviewPath } from '../../api/results'
import type { RankingCategory, RankingOverview } from '../../api/results'

interface State { path: string; overview: RankingOverview | null; error: string; cause: unknown }

/**
 * Leitura da tela Ranking (`GET /rankings/overview`): as linhas do titular com a posição no elo, a janela ao redor dele e a
 * prévia do Salão (porta de `useRankingOverview` da web). Trocar a categoria ou o time (`teamId`) lê de novo; respostas antigas são
 * descartadas e o 401 chama `onExpired`. `errorCause` é o erro lançado (para o `LoadError`); se a leitura falhou por conexão, relê
 * uma única vez quando ela volta.
 */
export function useRankingOverview(category: RankingCategory, teamId: number | null, onExpired: () => void) {
  const path = rankingOverviewPath(category, teamId)
  const [state, setState] = useState<State | null>(null)
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)

  useEffect(() => {
    const current = ++generation.current
    request<RankingOverview>(path).then(overview => {
      if (generation.current === current) setState({ path, overview, error: '', cause: null })
    }).catch((cause: unknown) => {
      if (generation.current !== current) return
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setState({ path, overview: null, cause, error: cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar o ranking.' })
    })
    return () => { generation.current = current + 1 }
  }, [path, attempt, onExpired])

  const current = state && state.path === path ? state : null
  const reload = useCallback(() => { generation.current++; setState(null); setAttempt(n => n + 1) }, [])
  const connectionError = current?.cause instanceof ApiError && current.cause.isConnection
  useEffect(() => {
    if (!connectionError) return
    return connection.onRestored(reload)
  }, [connectionError, reload])
  // `previous` é a última resposta de outro caminho: mantém os chips dos times à vista enquanto a leitura do time escolhido chega.
  return { path, loading: !current, error: current?.error ?? '', errorCause: current?.cause ?? null, overview: current?.overview ?? null, previous: state?.overview ?? null, reload }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, request } from '@/api/client'
import { connection } from '@/api/connection'
import { rankingOverviewPath } from '@/api/results'
import type { RankingCategoryQuery, RankingOverview } from '@/api/results'

interface State {
  path: string
  overview: RankingOverview | null
  error: string
  cause: unknown
}

/**
 * Resumo do Ranking (`GET /rankings/overview`): as linhas do titular, a contagem por elo, a janela no elo dele e a
 * prévia do Salão. Trocar a categoria ou o time (`teamId`, só no ranking de times) relê o resumo; 401 chama `onExpired`;
 * respostas antigas são descartadas. `errorCause` é o erro lançado (para o `LoadError`); se a leitura falhou por
 * conexão, relê uma única vez quando ela volta. `last` é o último resumo lido (de qualquer categoria): a página o usa
 * para manter os chips dos times enquanto a nova leitura chega.
 */
export function useRankingOverview(category: RankingCategoryQuery, teamId: number | null, onExpired: () => void) {
  const path = rankingOverviewPath(category, teamId)
  const [state, setState] = useState<State | null>(null)
  const [last, setLast] = useState<RankingOverview | null>(null)
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)

  useEffect(() => {
    const current = ++generation.current
    request<RankingOverview>(path).then(overview => {
      if (generation.current !== current) return
      setState({ path, overview, error: '', cause: null })
      setLast(overview)
    }).catch((cause: unknown) => {
      if (generation.current !== current) return
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setState({ path, overview: null, cause,
        error: cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar o ranking.' })
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

  return { loading: !current, error: current?.error ?? '', errorCause: current?.cause ?? null, overview: current?.overview ?? null, last, reload }
}

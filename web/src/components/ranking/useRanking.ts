import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, request } from '@/api/client'
import { connection } from '@/api/connection'
import { rankingPath } from '@/api/results'
import type { RankingPage, RankingQuery, RankingRow } from '@/api/results'

/** Linhas por página do Ranking (o servidor aceita até 50). */
export const RANKING_PAGE_SIZE = 20

interface State {
  path: string
  generation: number
  page: RankingPage | null
  items: RankingRow[]
  cursor: string | null
  error: string
  cause: unknown
  busy: boolean
  moreError: string
}

/**
 * Lista geral do Ranking (`GET /rankings`) paginada por cursor. Trocar a categoria recarrega a primeira página; a
 * primeira resposta guarda os totais e as linhas do titular (`mine`), e "carregar mais" só acrescenta linhas. 401 chama
 * `onExpired`; respostas antigas são descartadas. `errorCause` é o erro lançado (para o `LoadError`); se a primeira página
 * falhou por conexão, relê uma única vez quando ela volta.
 */
export function useRanking(query: Omit<RankingQuery, 'cursor' | 'limit'>, onExpired: () => void) {
  const path = rankingPath({ ...query, limit: RANKING_PAGE_SIZE })
  const [state, setState] = useState<State | null>(null)
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)

  useEffect(() => {
    const current = ++generation.current
    request<RankingPage>(path).then(page => {
      if (generation.current === current)
        setState({ path, generation: current, page, items: page.items, cursor: page.next_cursor, error: '', cause: null, busy: false, moreError: '' })
    }).catch((cause: unknown) => {
      if (generation.current !== current) return
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setState({ path, generation: current, page: null, items: [], cursor: null, busy: false, moreError: '', cause,
        error: cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar o ranking.' })
    })
    return () => { generation.current = current + 1 }
  }, [path, attempt, onExpired])

  const current = state && state.path === path ? state : null
  const loadMore = useCallback(async () => {
    if (!current?.cursor || current.busy) return
    const token = current.generation
    setState(old => (old?.generation === token ? { ...old, busy: true, moreError: '' } : old))
    try {
      const page = await request<RankingPage>(`${path}&cursor=${encodeURIComponent(current.cursor)}`)
      if (generation.current !== token) return
      setState(old => (old?.generation === token ? { ...old, items: [...old.items, ...page.items], cursor: page.next_cursor } : old))
    } catch (cause) {
      if (generation.current !== token) return
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setState(old => (old?.generation === token
        ? { ...old, moreError: cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar mais.' } : old))
    } finally {
      if (generation.current === token) setState(old => (old?.generation === token ? { ...old, busy: false } : old))
    }
  }, [current, path, onExpired])

  const reload = useCallback(() => { generation.current++; setState(null); setAttempt(n => n + 1) }, [])
  const connectionError = current?.cause instanceof ApiError && current.cause.isConnection
  useEffect(() => {
    if (!connectionError) return
    return connection.onRestored(reload)
  }, [connectionError, reload])

  return {
    loading: !current, error: current?.error ?? '', errorCause: current?.cause ?? null, page: current?.page ?? null, items: current?.items ?? [],
    hasMore: Boolean(current?.cursor), busy: current?.busy ?? false, moreError: current?.moreError ?? '',
    loadMore, reload,
  }
}

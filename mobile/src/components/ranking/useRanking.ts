import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, request } from '../../api/client'
import { rankingPath } from '../../api/results'
import type { RankingPage, RankingQuery, RankingRow } from '../../api/results'

/** Linhas por página do Ranking (o servidor aceita até 50). */
export const RANKING_PAGE_SIZE = 20

interface State {
  path: string
  generation: number
  page: RankingPage | null
  items: RankingRow[]
  cursor: string | null
  error: string
  busy: boolean
  moreError: string
}

/**
 * Lista geral do Ranking (`GET /rankings`) paginada por cursor (porta de `useRanking` da web). Trocar a categoria recarrega
 * a primeira página; a primeira resposta guarda os totais e as linhas do titular (`mine`), e "carregar mais" só acrescenta
 * linhas. 401 chama `onExpired`; respostas antigas (de outra categoria) são descartadas.
 */
export function useRanking(query: Omit<RankingQuery, 'cursor' | 'limit'>, onExpired: () => void) {
  const path = rankingPath({ ...query, limit: RANKING_PAGE_SIZE })
  const [state, setState] = useState<State | null>(null)
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)
  // `onEndReached` e toques repetidos podem pedir a próxima página antes de o estado `busy` chegar à tela.
  const loadingMore = useRef(false)

  useEffect(() => {
    const current = ++generation.current
    loadingMore.current = false
    request<RankingPage>(path).then(page => {
      if (generation.current === current)
        setState({ path, generation: current, page, items: page.items ?? [], cursor: page.next_cursor ?? null, error: '', busy: false, moreError: '' })
    }).catch((cause: unknown) => {
      if (generation.current !== current) return
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setState({ path, generation: current, page: null, items: [], cursor: null, busy: false, moreError: '',
        error: cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar o ranking.' })
    })
    return () => { generation.current = current + 1 }
  }, [path, attempt, onExpired])

  const current = state && state.path === path ? state : null
  const loadMore = useCallback(async () => {
    if (!current?.cursor || current.busy || loadingMore.current) return
    const token = current.generation
    loadingMore.current = true
    setState(old => (old?.generation === token ? { ...old, busy: true, moreError: '' } : old))
    try {
      const page = await request<RankingPage>(`${path}&cursor=${encodeURIComponent(current.cursor)}`)
      if (generation.current !== token) return
      setState(old => (old?.generation === token ? { ...old, items: [...old.items, ...(page.items ?? [])], cursor: page.next_cursor ?? null } : old))
    } catch (cause) {
      if (generation.current !== token) return
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setState(old => (old?.generation === token
        ? { ...old, moreError: cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar mais.' } : old))
    } finally {
      if (generation.current === token) {
        loadingMore.current = false
        setState(old => (old?.generation === token ? { ...old, busy: false } : old))
      }
    }
  }, [current, path, onExpired])

  const reload = useCallback(() => { generation.current++; loadingMore.current = false; setState(null); setAttempt(n => n + 1) }, [])
  return {
    loading: !current, error: current?.error ?? '', page: current?.page ?? null, items: current?.items ?? [],
    hasMore: Boolean(current?.cursor), busy: current?.busy ?? false, moreError: current?.moreError ?? '',
    loadMore, reload,
  }
}

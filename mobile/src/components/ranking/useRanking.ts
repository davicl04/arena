import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, request } from '../../api/client'
import { connection } from '../../api/connection'
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
  cause: unknown
  busy: boolean
  moreError: string
}

/** Linhas lidas para mostrar "Os 5 primeiros" de um elo: a sexta só diz que há mais e vira a borda esmaecida. */
export const PREVIEW_PAGE_SIZE = 6

/**
 * Lista do Ranking (`GET /rankings`) paginada por cursor (porta de `useRanking` da web). Com `query.tier`, só os classificados
 * do elo, com a posição dentro dele. Trocar a categoria ou o elo recarrega a primeira página; "carregar mais" só acrescenta
 * linhas. 401 chama `onExpired`; respostas antigas (de outra categoria) são descartadas. `errorCause` é o erro lançado (para o
 * `LoadError`); se a primeira página falhou por conexão, relê uma única vez quando ela volta. `enabled: false` não lê nada (a
 * lista só é lida na expansão do elo, ao trocar de elo e no Salão); `pageSize` muda o tamanho da página.
 */
export function useRanking(query: Omit<RankingQuery, 'cursor' | 'limit'>, onExpired: () => void, { enabled = true, pageSize = RANKING_PAGE_SIZE } = {}) {
  const path = rankingPath({ ...query, limit: pageSize })
  const [state, setState] = useState<State | null>(null)
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)
  // `onEndReached` e toques repetidos podem pedir a próxima página antes de o estado `busy` chegar à tela.
  const loadingMore = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const current = ++generation.current
    loadingMore.current = false
    request<RankingPage>(path).then(page => {
      if (generation.current === current)
        setState({ path, generation: current, page, items: page.items ?? [], cursor: page.next_cursor ?? null, error: '', cause: null, busy: false, moreError: '' })
    }).catch((cause: unknown) => {
      if (generation.current !== current) return
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setState({ path, generation: current, page: null, items: [], cursor: null, busy: false, moreError: '', cause,
        error: cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar o ranking.' })
    })
    return () => { generation.current = current + 1 }
  }, [path, attempt, onExpired, enabled])

  const current = enabled && state && state.path === path ? state : null
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
  const connectionError = current?.cause instanceof ApiError && current.cause.isConnection
  useEffect(() => {
    if (!connectionError) return
    return connection.onRestored(reload)
  }, [connectionError, reload])
  return {
    loading: enabled && !current, error: current?.error ?? '', errorCause: current?.cause ?? null, page: current?.page ?? null, items: current?.items ?? [],
    hasMore: Boolean(current?.cursor), busy: current?.busy ?? false, moreError: current?.moreError ?? '',
    loadMore, reload,
  }
}

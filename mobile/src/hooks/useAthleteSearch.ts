import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, request } from '../api/client'
import { connection } from '../api/connection'
import type { Page, SocialUser } from '../api/client'

export const SEARCH_DEBOUNCE_MS = 300

interface Result { term: string; items: SocialUser[]; cursor: string | null; error: string; cause: unknown; moreError: string }

export interface AthleteSearch {
  /** Há um termo válido (o servidor rejeita "@" sozinho). */
  active: boolean
  /** Aguardando o debounce ou a resposta da primeira página do termo atual. */
  loading: boolean
  items: SocialUser[]; error: string; moreError: string; hasMore: boolean; busy: boolean
  /** O erro lançado pela primeira página (para o `LoadError` reconhecer a falta de conexão). */
  errorCause: unknown
  /** "Tentar novamente" da primeira página do termo atual. */
  reload: () => void
  loadMore: () => Promise<void>
  update: (id: number, change: (person: SocialUser) => SocialUser) => void
  remove: (id: number) => void
}

const message = (err: unknown, fallback: string) => err instanceof Error ? err.message : fallback

/**
 * Busca de atletas em `/users?q=` com debounce. Cada novo termo abre uma geração:
 * respostas de termos anteriores (inclusive de "carregar mais") são descartadas. Se a primeira página falhou por conexão,
 * a busca é refeita uma única vez quando ela volta.
 */
export function useAthleteSearch(query: string, onExpired: () => void): AthleteSearch {
  const term = query.trim()
  const active = term.replace(/^@/, '').trim().length > 0
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)
  const loadingMore = useRef(false)

  useEffect(() => {
    const id = ++generation.current
    loadingMore.current = false
    if (!active) return
    const timer = setTimeout(() => {
      request<Page<SocialUser>>(`/users?q=${encodeURIComponent(term)}`).then(page => {
        if (generation.current === id) setResult({ term, items: page.items, cursor: page.next_cursor, error: '', cause: null, moreError: '' })
      }).catch((err: unknown) => {
        if (generation.current !== id) return
        if (err instanceof ApiError && err.status === 401) onExpired()
        setResult({ term, items: [], cursor: null, error: message(err, 'Busca indisponível.'), cause: err, moreError: '' })
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [term, active, onExpired, attempt])

  const current = active && result?.term === term ? result : null
  const reload = useCallback(() => { setResult(null); setAttempt(count => count + 1) }, [])
  const connectionError = current?.cause instanceof ApiError && current.cause.isConnection
  useEffect(() => {
    if (!connectionError) return
    return connection.onRestored(reload)
  }, [connectionError, reload])
  const loadMore = useCallback(async () => {
    if (!current?.cursor || loadingMore.current) return
    const id = generation.current
    const { term: searched, cursor } = current
    loadingMore.current = true
    setBusy(true)
    try {
      const page = await request<Page<SocialUser>>(`/users?q=${encodeURIComponent(searched)}&cursor=${encodeURIComponent(cursor)}`)
      if (generation.current === id) setResult(old => old?.term === searched ? { ...old, items: [...old.items, ...page.items], cursor: page.next_cursor, moreError: '' } : old)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired()
      if (generation.current === id) setResult(old => old?.term === searched ? { ...old, moreError: message(err, 'Não foi possível carregar mais atletas.') } : old)
    } finally {
      if (generation.current === id) loadingMore.current = false
      setBusy(false)
    }
  }, [current, onExpired])
  const update = useCallback((id: number, change: (person: SocialUser) => SocialUser) => {
    setResult(old => old ? { ...old, items: old.items.map(person => person.id === id ? change(person) : person) } : old)
  }, [])
  const remove = useCallback((id: number) => {
    setResult(old => old ? { ...old, items: old.items.filter(person => person.id !== id) } : old)
  }, [])

  return {
    active, loading: active && !current, items: current?.items ?? [], error: current?.error ?? '', moreError: current?.moreError ?? '',
    errorCause: current?.cause ?? null, reload, hasMore: Boolean(current?.cursor), busy, loadMore, update, remove,
  }
}

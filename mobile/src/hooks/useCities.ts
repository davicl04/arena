import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, request } from '../api/client'
import type { City, Profile } from '../api/client'
import { citiesByIds, CITY_SEARCH_MIN, searchCities } from '../api/cities'

/** Perfis esportivos do titular (`GET /me/sports-profiles`): a cidade (`city`) e a posição de cada modalidade. */
export const loadProfiles = () => request<Profile[]>('/me/sports-profiles')

/** Atraso de digitação antes de consultar o servidor. */
export const CITY_SEARCH_DEBOUNCE_MS = 250

const message = (cause: unknown, fallback: string) => cause instanceof Error && cause.message ? cause.message : fallback

interface SearchResult { term: string; items: City[]; error: string; cause: unknown }

export interface CitySearchState {
  /** O termo tem 2 ou mais caracteres (abaixo disso, nada é consultado). */
  active: boolean
  /** Aguardando o atraso de digitação ou a resposta do termo atual. */
  loading: boolean
  items: City[]
  error: string
  /** O erro lançado (para reconhecer a falta de conexão). */
  errorCause: unknown
  /** "Tentar novamente" do termo atual. */
  retry: () => void
}

/**
 * Busca de municípios no servidor (`GET /cities?q=`) com atraso de digitação. Cada termo abre uma geração: a resposta de
 * um termo anterior nunca sobrescreve a do termo atual. O 401 vai para `onExpired`.
 */
export function useCitySearch(query: string, onExpired?: () => void): CitySearchState {
  const term = query.trim()
  const active = term.length >= CITY_SEARCH_MIN
  const [result, setResult] = useState<SearchResult | null>(null)
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)

  useEffect(() => {
    const id = ++generation.current
    if (!active) return
    const timer = setTimeout(() => {
      searchCities(term).then(items => {
        if (generation.current === id) setResult({ term, items, error: '', cause: null })
      }).catch((cause: unknown) => {
        if (generation.current !== id) return
        if (cause instanceof ApiError && cause.status === 401) onExpired?.()
        setResult({ term, items: [], error: message(cause, 'Não foi possível buscar as cidades.'), cause })
      })
    }, CITY_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [term, active, attempt, onExpired])

  const current = active && result?.term === term ? result : null
  const retry = useCallback(() => { setResult(null); setAttempt(count => count + 1) }, [])
  return { active, loading: active && !current, items: current?.items ?? [], error: current?.error ?? '', errorCause: current?.cause ?? null, retry }
}

export interface CityById {
  city: City | null
  /** Consultando `ids=` (a cidade não veio na resposta nem foi escolhida agora). */
  loading: boolean
  /** A consulta por `ids=` falhou ou não achou a cidade. */
  failed: boolean
}

/**
 * A cidade de um ID já salvo: usa `known` (o objeto `city` da resposta ou a cidade recém-escolhida) quando é a mesma e,
 * sem ela, consulta `GET /cities?ids=`. Sem ID, não há cidade.
 */
export function useCity(id: number | null, known: City | null | undefined, onExpired?: () => void): CityById {
  const hit = known && known.id === id ? known : null
  const [fetched, setFetched] = useState<{ id: number; city: City | null } | null>(null)
  const needed = id !== null && !hit
  useEffect(() => {
    if (!needed || id === null) return
    let alive = true
    citiesByIds([id]).then(found => {
      if (alive) setFetched({ id, city: found.find(item => item.id === id) ?? null })
    }).catch((cause: unknown) => {
      if (!alive) return
      if (cause instanceof ApiError && cause.status === 401) onExpired?.()
      setFetched({ id, city: null })
    })
    return () => { alive = false }
  }, [id, needed, onExpired])
  const own = fetched && fetched.id === id ? fetched : null
  return { city: hit ?? own?.city ?? null, loading: needed && !own, failed: needed && Boolean(own) && !own?.city }
}

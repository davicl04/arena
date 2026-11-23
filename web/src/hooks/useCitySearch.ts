import { useCallback, useEffect, useRef, useState } from 'react'
import type { City } from '../api/client'
import { ApiError } from '../api/client'
import { CITY_SEARCH_DELAY_MS, CITY_SEARCH_MIN, searchCities } from '../api/cities'
import { connection } from '../api/connection'

interface Settled { key: string; results: City[] | null; error: string; cause: unknown }

/**
 * Busca de cidade no servidor para o texto digitado: espera `CITY_SEARCH_DELAY_MS` sem digitação e só consulta com
 * `CITY_SEARCH_MIN` caracteres ou mais. Uma resposta atrasada de um texto anterior é descartada (o efeito do texto antigo
 * já foi desligado). Se a busca falhou por conexão, repete uma única vez quando a conexão volta; `retry` é o
 * "Tentar novamente".
 */
export function useCitySearch(query: string) {
  const term = query.trim()
  const short = term.length < CITY_SEARCH_MIN
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled | null>(null)
  const key = `${attempt}:${term}`
  useEffect(() => {
    if (short) return
    let alive = true
    const timer = setTimeout(() => {
      searchCities(term).then(results => {
        if (alive) setSettled({ key, results, error: '', cause: null })
      }).catch((cause: unknown) => {
        if (alive) setSettled({ key, results: null, error: cause instanceof Error && cause.message ? cause.message : 'Não foi possível buscar as cidades.', cause })
      })
    }, CITY_SEARCH_DELAY_MS)
    return () => { alive = false; clearTimeout(timer) }
  }, [key, term, short])
  const retry = useCallback(() => setAttempt(n => n + 1), [])
  const current = !short && settled?.key === key ? settled : null
  const connectionError = current?.cause instanceof ApiError && current.cause.isConnection
  const retryOnRestore = useRef(false)
  useEffect(() => { retryOnRestore.current = connectionError }, [connectionError])
  useEffect(() => connection.onRestored(() => { if (retryOnRestore.current) { retryOnRestore.current = false; retry() } }), [retry])
  return {
    /** Texto curto demais: nada é consultado. */
    short,
    loading: !short && !current,
    results: current?.results ?? [],
    error: current?.error ?? '',
    errorCause: current?.cause ?? null,
    retry,
  }
}

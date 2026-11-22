import { act } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { vi } from 'vitest'
import type { City } from '../../src/api/client'
import { CITY_SEARCH_DEBOUNCE_MS } from '../../src/hooks/useCities'
import { type } from './native'

/*
 * Peças dos testes da busca de cidade (catálogo nacional): municípios de exemplo, inclusive um fora dos 100 primeiros em
 * ordem alfabética, e a digitação na busca vencendo o atraso de digitação.
 */

export const brasiliaCity: City = { id: 5300108, name: 'Brasília', state: 'DF' }
export const goianiaCity: City = { id: 5208707, name: 'Goiânia', state: 'GO' }
/** Fora dos 100 primeiros em ordem alfabética: só aparece pela busca (ID IBGE do catálogo versionado). */
export const valparaisoCity: City = { id: 5221858, name: 'Valparaíso de Goiás', state: 'GO' }

/** Caminho da busca no servidor para o termo (como `searchCities` o monta). */
export const searchPath = (term: string) => `/cities?q=${encodeURIComponent(term.trim())}`

/**
 * Digita na busca de cidade e vence o atraso de digitação; a resposta simulada já chega na árvore. Com `realClock`, espera
 * o atraso de verdade (para testes que já simulam só a data e não podem trocar os relógios).
 */
export async function searchCity(tree: ReactTestRenderer, term: string, { label = 'Buscar cidade', realClock = false } = {}) {
  if (realClock) {
    await type(tree, label, term)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, CITY_SEARCH_DEBOUNCE_MS + 20)) })
    return
  }
  vi.useFakeTimers()
  try {
    await type(tree, label, term)
    await act(async () => { await vi.advanceTimersByTimeAsync(CITY_SEARCH_DEBOUNCE_MS) })
  } finally { vi.useRealTimers() }
}

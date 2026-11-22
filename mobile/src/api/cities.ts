import { request } from './client'
import type { City } from './client'

/*
 * Catálogo nacional de municípios (`GET /cities`). O Expo não lê a lista inteira: escolhe pela busca (`q`, 2 ou mais
 * caracteres, até 20 resultados) e nomeia uma cidade já salva pelo objeto `city` da resposta ou por `ids=`.
 */

/** Caracteres mínimos para buscar (o servidor devolve vazio abaixo disso). */
export const CITY_SEARCH_MIN = 2
/** Teto de resultados da busca no servidor. */
export const CITY_SEARCH_LIMIT = 20

/** "Nome · UF", o rótulo de uma cidade nos seletores, nos resultados e nos resumos. */
export const cityLabel = (city: City) => `${city.name} · ${city.state}`

/** Municípios que casam com o termo (nome ou UF, sem acento e sem caixa); termo curto não chama a API. */
export async function searchCities(query: string): Promise<City[]> {
  const term = query.trim()
  if (term.length < CITY_SEARCH_MIN) return []
  const found = await request<City[]>(`/cities?q=${encodeURIComponent(term)}`)
  return found.slice(0, CITY_SEARCH_LIMIT)
}

/** Municípios pelos IDs (para nomear cidades já salvas quando a resposta não traz o objeto `city`). */
export async function citiesByIds(ids: readonly number[]): Promise<City[]> {
  const unique = [...new Set(ids.filter(id => Number.isInteger(id) && id > 0))]
  if (!unique.length) return []
  return request<City[]>(`/cities?ids=${unique.join(',')}`)
}

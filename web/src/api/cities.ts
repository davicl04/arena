import { request } from './client'
import type { City } from './client'

/*
 * Catálogo nacional de municípios (decisão 0001, seção "Cidades"). A web não carrega mais a lista inteira: quem nomeia uma
 * cidade usa o objeto `city` que já vem nas respostas (perfil, time, evento, partida, pedido) e quem escolhe usa a busca
 * do servidor (`GET /cities?q=`), com pelo menos 2 caracteres e no máximo 20 resultados.
 */

/** Caracteres mínimos (depois de aparar) para consultar o servidor. */
export const CITY_SEARCH_MIN = 2
/** Atraso de digitação antes de consultar o servidor. */
export const CITY_SEARCH_DELAY_MS = 250

/** Nome exibido de uma cidade: "Nome · UF". */
export const cityLabel = (city: Pick<City, 'name' | 'state'>) => `${city.name} · ${city.state}`

/** Busca por nome ou UF, sem acento nem caixa (até 20 municípios, por relevância). */
export function searchCities(query: string) {
  return request<City[]>(`/cities?${new URLSearchParams({ q: query.trim() })}`)
}

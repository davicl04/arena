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

/** Arredonda uma coordenada para 2 casas decimais (cerca de 1 km): o navegador nunca envia a posição exata. */
export const roundCoordinate = (value: number) => Math.round(value * 100) / 100

/**
 * Cidade sugerida pela localização (`POST /cities/nearest`): a sede do município mais próxima das coordenadas, que vão
 * arredondadas e só no corpo (nunca na URL), sem ficar gravadas no navegador. Fora da cobertura, o servidor responde 404.
 * É uma leitura: falha de conexão não abre a folha "Sem conexão" (o passo da cidade mostra o próprio aviso).
 */
export function nearestCity(latitude: number, longitude: number) {
  return request<City>('/cities/nearest', 'POST', { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) }, { background: true })
}

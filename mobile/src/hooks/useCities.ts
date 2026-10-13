import { request } from '../api/client'
import type { City, Profile } from '../api/client'
import { useResource } from './useResource'

/** Catálogo de cidades (o mesmo de Meus times, do pedido de organizador, do Criar evento, do Jogar e dos campeonatos). */
export const loadCities = () => request<City[]>('/cities')

/** Perfis esportivos do titular (`GET /me/sports-profiles`): a cidade e a posição de cada modalidade. */
export const loadProfiles = () => request<Profile[]>('/me/sports-profiles')

/** Perfis e cidades de uma vez: a cidade e a posição da placa, do filtro de eventos e do formulário do time vêm do perfil. */
export const loadPlaces = () => Promise.all([loadProfiles(), loadCities()])

/** Lê o catálogo ao montar; `reload` tenta de novo e o 401 vai para `onExpired`. */
export const useCities = (onExpired: () => void) => useResource(loadCities, onExpired, { fallback: 'Não foi possível carregar as cidades.' })

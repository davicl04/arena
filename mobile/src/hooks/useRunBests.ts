import { useCallback } from 'react'
import { ApiError } from '../api/client'
import { getRunBests } from '../api/runs'
import type { RunBest } from '../api/runs'
import { useResource } from './useResource'

const none: RunBest[] = []

/**
 * Os cinco cartões de "Suas marcas" (`GET /me/run-bests`), lidos quando `enabled` (aba Corrida da placa e Marcas).
 * `refresh` relê sem limpar a tela: depois de salvar ou remover uma marca, os cartões e a placa se atualizam no lugar.
 */
export function useRunBests(onExpired: () => void, enabled: boolean) {
  const resource = useResource(getRunBests, onExpired, { enabled, fallback: 'Não foi possível carregar suas marcas.' })
  const { setData } = resource
  const refresh = useCallback(async () => {
    try { setData(await getRunBests()) }
    catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired() }
  }, [setData, onExpired])
  return { items: resource.data?.items ?? none, loaded: Boolean(resource.data), loading: resource.loading, error: resource.error, errorCause: resource.errorCause, reload: resource.reload, refresh }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import type { City } from '../api/client'
import { nearestCity } from '../api/cities'

/*
 * Cidade sugerida pela localização do navegador no passo da cidade (os mesmos estados do Expo). O pedido de permissão só
 * acontece ao tocar em "Usar minha localização" (é o `getCurrentPosition` que abre o pedido do navegador), nunca ao abrir a
 * tela. A posição vem com precisão baixa, é arredondada para 2 casas por `nearestCity` e só vai no corpo de
 * `POST /cities/nearest`; nada é gravado no navegador (nem localStorage, nem sessionStorage) nem registrado.
 */

/**
 * - `checking`: lendo a permissão atual pela Permissions API (nada aparece ainda);
 * - `ask`: permissão não decidida (ou concedida num perfil existente): botão "Usar minha localização";
 * - `seeking`: obtendo a posição e a cidade;
 * - `suggested`: cidade sugerida em `suggestion`;
 * - `denied`: permissão negada agora ou antes;
 * - `failed`: tempo esgotado, posição indisponível, contexto não seguro (sem `navigator.geolocation`) ou erro de conexão;
 * - `outside`: o servidor não achou município perto (404).
 */
export type CityLocationPhase = 'checking' | 'ask' | 'seeking' | 'suggested' | 'denied' | 'failed' | 'outside'

/** Teto para obter a posição do navegador. */
export const LOCATION_TIMEOUT_MS = 10_000
/** Idade máxima de uma posição já conhecida pelo navegador para reaproveitá-la. */
export const LOCATION_MAX_AGE_MS = 5 * 60_000

/** Textos dos estados (os mesmos do Expo). */
export const locationText = {
  seeking: 'Buscando sua localização…',
  suggested: 'Pela sua localização',
  denied: 'Sem acesso à localização. Busque sua cidade abaixo.',
  failed: 'Não foi possível obter sua localização.',
  outside: 'Não encontramos um município perto de você.',
} as const

/** Código do `GeolocationPositionError` para permissão negada. */
const PERMISSION_DENIED = 1

/** Estado da permissão pela Permissions API; sem ela (ou se a consulta falhar), "não decidida". */
async function permissionState(): Promise<PermissionState> {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' })
    return status?.state ?? 'prompt'
  } catch {
    return 'prompt'
  }
}

/** Contexto que permite a geolocalização: `navigator.geolocation` presente e contexto seguro (HTTPS ou localhost). */
const geolocationAvailable = () => 'geolocation' in navigator && Boolean(navigator.geolocation) && window.isSecureContext !== false

/** Posição aproximada: precisão baixa, até 5 min de idade e tempo limite de 10 s. */
function approximatePosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
    enableHighAccuracy: false,
    maximumAge: LOCATION_MAX_AGE_MS,
    timeout: LOCATION_TIMEOUT_MS,
  }))
}

const isPermissionDenied = (cause: unknown) => typeof cause === 'object' && cause !== null && (cause as { code?: unknown }).code === PERMISSION_DENIED

export interface CityLocation {
  phase: CityLocationPhase
  suggestion: City | null
  /** A sugestão aparece como confirmação ("Pela sua localização", cidade, UF e "Não, escolher outra cidade"). */
  confirming: boolean
  /** "Usar minha localização": abre o pedido do navegador (sem pedido se já concedida) e busca a cidade. */
  locate: () => void
  /** "Não, escolher outra cidade": sai da confirmação para a busca, mantendo a sugestão disponível. */
  dismiss: () => void
}

/**
 * Estado da localização de uma folha de modalidade. Com `auto` (perfil novo) e a permissão já concedida, busca a cidade
 * ao abrir, sem novo pedido. `onSuggested(city, requested)` recebe a sugestão; `requested` diz se veio de um toque (num
 * perfil existente, a cidade salva só é trocada assim). O 401 vai para `onExpired`, como nas demais ações.
 */
export function useCityLocation({ auto, onSuggested, onExpired }: {
  auto: boolean
  onSuggested: (city: City, requested: boolean) => void
  onExpired?: () => void
}): CityLocation {
  const [phase, setPhase] = useState<CityLocationPhase>('checking')
  const [suggestion, setSuggestion] = useState<City | null>(null)
  const [confirming, setConfirming] = useState(false)
  const alive = useRef(true)
  const running = useRef(false)
  const handlers = useRef({ onSuggested, onExpired })
  useEffect(() => { handlers.current = { onSuggested, onExpired } }, [onSuggested, onExpired])

  const run = useCallback(async (requested: boolean) => {
    if (running.current) return
    if (!geolocationAvailable()) { setPhase('failed'); return }
    running.current = true
    setPhase('seeking')
    try {
      let position: GeolocationPosition
      try { position = await approximatePosition() } catch (cause) {
        if (alive.current) setPhase(isPermissionDenied(cause) ? 'denied' : 'failed')
        return
      }
      if (!alive.current) return
      try {
        const city = await nearestCity(position.coords.latitude, position.coords.longitude)
        if (!alive.current) return
        setSuggestion(city)
        setConfirming(true)
        setPhase('suggested')
        handlers.current.onSuggested(city, requested)
      } catch (cause) {
        if (!alive.current) return
        if (cause instanceof ApiError && cause.status === 401) handlers.current.onExpired?.()
        setPhase(cause instanceof ApiError && cause.status === 404 ? 'outside' : 'failed')
      }
    } finally { running.current = false }
  }, [])

  // A permissão é lida ao abrir a folha (`auto` não muda com ela aberta); a consulta não abre pedido nenhum.
  useEffect(() => {
    alive.current = true
    void permissionState().then(state => {
      if (!alive.current) return
      if (state === 'denied') setPhase('denied')
      else if (state === 'granted' && auto) void run(false)
      else setPhase('ask')
    })
    return () => { alive.current = false }
  }, [auto, run])

  const locate = useCallback(() => { void run(true) }, [run])
  const dismiss = useCallback(() => setConfirming(false), [])
  return { phase, suggestion, confirming, locate, dismiss }
}

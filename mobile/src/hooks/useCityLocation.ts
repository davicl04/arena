import * as Location from 'expo-location'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import type { City } from '../api/client'
import { nearestCity } from '../api/cities'

/*
 * Cidade sugerida pela localização do aparelho no passo da cidade (os mesmos estados da web). Só a permissão aproximada em
 * primeiro plano: o pedido acontece ao tocar em "Usar minha localização", nunca ao abrir a tela. A posição vem com precisão
 * baixa, é arredondada para 2 casas por `nearestCity` e só vai no corpo de `POST /cities/nearest`; nada é gravado no
 * aparelho nem registrado.
 */

/**
 * - `checking`: lendo a permissão atual (nada aparece ainda);
 * - `ask`: permissão não decidida (ou concedida num perfil existente): botão "Usar minha localização";
 * - `seeking`: obtendo a posição e a cidade;
 * - `suggested`: cidade sugerida em `suggestion`;
 * - `denied`: permissão negada agora ou antes (sem poder perguntar de novo);
 * - `failed`: tempo esgotado, posição indisponível, localização desligada ou erro de conexão;
 * - `outside`: o servidor não achou município perto (404).
 */
export type CityLocationPhase = 'checking' | 'ask' | 'seeking' | 'suggested' | 'denied' | 'failed' | 'outside'

/** Teto para obter a posição do aparelho. */
export const LOCATION_TIMEOUT_MS = 10_000
/** Idade máxima da última posição conhecida para reaproveitá-la sem ligar o GPS. */
export const LAST_KNOWN_MAX_AGE_MS = 5 * 60_000

/** Textos dos estados (os mesmos da web). */
export const locationText = {
  seeking: 'Buscando sua localização…',
  suggested: 'Pela sua localização',
  denied: 'Sem acesso à localização. Busque sua cidade abaixo.',
  failed: 'Não foi possível obter sua localização.',
  outside: 'Não encontramos um município perto de você.',
} as const

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Tempo esgotado.')), ms) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** Posição aproximada: a última conhecida (até 5 min) ou uma leitura nova com precisão baixa, dentro do tempo limite. */
export function approximatePosition(): Promise<{ latitude: number; longitude: number }> {
  return withTimeout((async () => {
    const fix = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS })
      ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low })
    return { latitude: fix.coords.latitude, longitude: fix.coords.longitude }
  })(), LOCATION_TIMEOUT_MS)
}

export interface CityLocation {
  phase: CityLocationPhase
  suggestion: City | null
  /** A sugestão aparece como confirmação ("Pela sua localização", cidade, UF e "Não, escolher outra cidade"). */
  confirming: boolean
  /** "Usar minha localização": pede a permissão (sem diálogo se já concedida) e busca a cidade. */
  locate: () => void
  /** "Não, escolher outra cidade": sai da confirmação para a busca, mantendo a sugestão disponível. */
  dismiss: () => void
}

/**
 * Estado da localização de uma folha de modalidade. Com `auto` (perfil novo) e a permissão já concedida, busca a cidade
 * ao abrir, sem novo pedido. `onSuggested(city, requested)` recebe a sugestão; `requested` diz se veio de um toque (num
 * perfil existente, a cidade salva só é trocada assim). O 401 vai para `onExpired`.
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
    running.current = true
    try {
      if (requested) {
        const permission = await Location.requestForegroundPermissionsAsync()
        if (!alive.current) return
        if (!permission.granted) { setPhase('denied'); return }
      }
      setPhase('seeking')
      let position: { latitude: number; longitude: number }
      try { position = await approximatePosition() } catch {
        if (alive.current) setPhase('failed')
        return
      }
      if (!alive.current) return
      try {
        const city = await nearestCity(position.latitude, position.longitude)
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
    } catch {
      if (alive.current) setPhase('failed')
    } finally { running.current = false }
  }, [])

  // A permissão é lida ao abrir a folha (`auto` não muda com ela aberta).
  useEffect(() => {
    alive.current = true
    Promise.resolve().then(() => Location.getForegroundPermissionsAsync()).then(permission => {
      if (!alive.current) return
      if (permission.granted) {
        if (auto) void run(false)
        else setPhase('ask')
      } else setPhase(permission.canAskAgain ? 'ask' : 'denied')
    }).catch(() => { if (alive.current) setPhase('ask') })
    return () => { alive.current = false }
  }, [auto, run])

  const locate = useCallback(() => { void run(true) }, [run])
  const dismiss = useCallback(() => setConfirming(false), [])
  return { phase, suggestion, confirming, locate, dismiss }
}

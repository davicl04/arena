import { useEffect, useState } from 'react'
import { AppState } from 'react-native'

/**
 * Instante atual em milissegundos, atualizado a cada `intervalMs` enquanto `enabled` (porta de `useNow` da web). Prazos,
 * anéis e contagens acompanham o relógio sem chamar `Date.now()` na renderização; parado (`enabled = false`), mantém o
 * último valor. Os temporizadores do sistema param com o app em segundo plano: ao voltar, o relógio é relido na hora.
 */
export function useNow(intervalMs = 30_000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') setNow(Date.now()) })
    return () => { clearInterval(id); subscription.remove() }
  }, [enabled, intervalMs])
  return now
}

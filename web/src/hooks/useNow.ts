import { useEffect, useState } from 'react'

/**
 * Instante atual em milissegundos, atualizado a cada `intervalMs` enquanto `enabled`.
 * Prazos, anéis e contagens acompanham o relógio sem chamar `Date.now()` na renderização;
 * parado (`enabled = false`), mantém o último valor.
 */
export function useNow(intervalMs = 30_000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [enabled, intervalMs])
  return now
}

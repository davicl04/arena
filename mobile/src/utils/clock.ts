/*
 * Cronômetros da placa do Jogar: tempo decorrido da busca ("02:15") e contagem regressiva da proposta e da oferta
 * ("1:59:42") (porta de `web/src/utils/clock.ts`). Os textos para leitores de tela falam em minutos, para não anunciar
 * cada segundo.
 */

const two = (value: number) => String(value).padStart(2, '0')

/** "02:15" ou, a partir de 1 h, "1:02:15". Negativo vira zero. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`
}

/** Contagem regressiva "h:mm:ss" (a proposta e a oferta duram 2 h); zero quando o prazo passou. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 3600)}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`
}

/** "1 hora e 5 minutos", "35 minutos" ou "menos de 1 minuto". */
export function spokenDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 1) return 'menos de 1 minuto'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const h = hours ? `${hours} ${hours === 1 ? 'hora' : 'horas'}` : ''
  const m = rest ? `${rest} ${rest === 1 ? 'minuto' : 'minutos'}` : ''
  return [h, m].filter(Boolean).join(' e ')
}

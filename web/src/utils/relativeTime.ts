const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Tempo relativo curto, em português, para notificações, convites e pedidos: "agora", "há 5 min",
 * "há 1 hora", "há 3 horas", "ontem", "há 3 dias" e, a partir de uma semana, a data ("12 de out.", com o ano
 * quando for outro). Data inválida devolve texto vazio.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''
  const diff = Math.max(0, now - time)
  if (diff < MINUTE) return 'agora'
  if (diff < HOUR) return `há ${Math.floor(diff / MINUTE)} min`
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR)
    return `há ${hours} ${hours === 1 ? 'hora' : 'horas'}`
  }
  const days = Math.floor(diff / DAY)
  if (days === 1) return 'ontem'
  if (days < 7) return `há ${days} dias`
  const date = new Date(time)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

/** Data curta para registros ("12 de out. de 2026"). */
export function shortDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Mês e ano de entrada no time ("mar. de 2025"). */
export function monthYear(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
}

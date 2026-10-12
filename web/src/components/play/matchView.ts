import { positions } from '@/api/client'
import { sideName } from '@/data/match'
import type { MatchCard, MatchSideOut } from '@/api/matches'
import { tiers } from '@/data/arena'
import { formatClock, formatDeadline, formatShortDate, parseIso } from '@/utils/format'

/** Rótulo da posição ("Meio de campo"). */
export const positionLabel = (position: string) => positions.find(item => item.value === position)?.label ?? position

/** "Ferrugem FC × Leões do Cerrado" (ou os nomes dos tenistas), com o lado do titular primeiro. */
export function matchTitle(card: Pick<MatchCard, 'sides' | 'my_side'>): string {
  const mine = card.sides.find(side => side.side === card.my_side)
  const other = card.sides.find(side => side !== mine)
  const first = mine ?? card.sides[0]
  const second = mine ? other : card.sides[1]
  return `${sideName(first)} × ${second ? sideName(second) : 'adversário a definir'}`
}

/** "sáb, 18 out · 16:00 · Arena Sudoeste" quando há data; senão o que falta combinar. */
export function matchWhen(card: Pick<MatchCard, 'starts_at' | 'court' | 'phase' | 'result_deadline' | 'score'>, now: Date = new Date()): string {
  const start = parseIso(card.starts_at)
  if (!start) return card.phase === 'combinando' ? 'Data e quadra a combinar no chat' : 'Data a definir'
  const when = `${formatShortDate(start, now)} · ${formatClock(start)}`
  return card.court ? `${when} · ${card.court.name}` : when
}

/** Linha de apoio do cartão: o placar final, o prazo do placar ou o horário. */
export function matchDetail(card: MatchCard, now: Date = new Date()): string {
  if (card.score && (card.phase === 'confirmado' || card.phase === 'encerrada'))
    return `Placar ${card.score.a} × ${card.score.b} · ${matchWhen(card, now)}`
  if (card.phase === 'informar_resultado' && card.result_deadline)
    return `Informe o placar até ${formatDeadline(card.result_deadline, now)}`
  return matchWhen(card, now)
}

/** A próxima partida: a agendada que ainda não começou e tem o horário mais próximo (as demais fases não são "próxima"). */
export function nextScheduledMatch(cards: readonly MatchCard[], now: number): MatchCard | null {
  let next: MatchCard | null = null
  let nextAt = Infinity
  for (const card of cards) {
    const at = card.state === 'agendada' ? parseIso(card.starts_at)?.getTime() : undefined
    if (at !== undefined && at > now && at < nextAt) { next = card; nextAt = at }
  }
  return next
}

/** Elo do lado no pareamento, ou "Em classificação": nunca se atribui elo antes da classificação. */
export function sideTierName(side: MatchSideOut | undefined): string | null {
  return side?.tier && side.tier in tiers ? tiers[side.tier].name : null
}

import type { EventMatchRow } from '../../api/brackets'
import type { Side } from '../../api/matches'
import type { StateTone } from '../../data/arena'
import { sideName, sideOf, whenText } from '../../data/match'
import { scoreText } from '../results/format'

/*
 * Textos e selos de uma linha da lista de partidas do campeonato (S1): quem joga (ou "Vencedor J1" enquanto o lado não
 * está definido), a linha de data, quadra ou placar e o selo do que o organizador pode fazer.
 */


/** [lado A, lado B]: o nome de quem joga ou o "Vencedor J1" que ocupa o lugar. */
export function rowNames(row: EventMatchRow): [string, string] {
  const name = (key: Side, index: 0 | 1) => {
    const side = sideOf(row.card, key)
    return side ? sideName(side) : (row.placeholders[index] ?? 'A definir')
  }
  return [name('a', 0), name('b', 1)]
}

/** Placar final do ponto de vista do lado A ("2 × 1", "6-4 3-6"). */
export const rowScore = (row: EventMatchRow) => (row.card.score ? scoreText(row.card.sport, row.card.score, 'a') : null)

/** Linha de apoio: placar, data e quadra, "Sem data" ou o jogo anterior que falta. */
export function rowSubtitle(row: EventMatchRow): string {
  const { card } = row
  const score = rowScore(row)
  if (score) return `${score} · ${row.stage}`
  if (card.state === 'cancelada') return `Partida cancelada · ${row.stage}`
  if (card.starts_at) return `${whenText(card.starts_at)}${card.court ? ` · ${card.court.name}` : ''}`
  if (card.sides.length < 2) return `Espera o resultado de ${row.placeholders.filter(Boolean).map(item => item?.replace('Vencedor ', '')).join(' e ') || 'jogo anterior'} · ${row.stage}`
  return `Sem data · ${row.stage}`
}

export interface RowBadge { label: string; tone: StateTone }

/** Selo da linha: o que o organizador faz agora (Agendar, Decidir) ou como a partida está. */
export function rowBadge(row: EventMatchRow): RowBadge {
  const { card } = row
  if (row.awaiting_decision) return { label: 'Decidir', tone: 'danger' }
  if (card.state === 'cancelada') return { label: 'Cancelada', tone: 'danger' }
  if (card.state === 'realizada' || card.state === 'encerrada') return { label: 'Encerrada', tone: 'closed' }
  if (card.state === 'agendada') {
    return card.phase === 'informar_resultado' ? { label: 'Aguardando placar', tone: 'live' } : { label: 'Agendada', tone: 'open' }
  }
  if (row.can_schedule) return { label: 'Agendar', tone: 'pending' }
  return { label: 'Aguardando', tone: 'draft' }
}

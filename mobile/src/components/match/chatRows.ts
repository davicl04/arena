import type { MatchMessageOut } from '../../api/matches'
import { formatShortDate, parseIso } from '../../utils/format'

/** Linha do chat: separador de dia, faixa de evento da partida ou grupo de mensagens seguidas da mesma pessoa. */
export type ChatRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'event'; key: string; message: MatchMessageOut }
  | { kind: 'group'; key: string; messages: MatchMessageOut[] }

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

function dayLabel(date: Date, now: Date): string {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (dayKey(date) === dayKey(now)) return 'Hoje'
  if (dayKey(date) === dayKey(yesterday)) return 'Ontem'
  return formatShortDate(date, now)
}

/**
 * Dias, faixas de evento e grupos do chat (C1). Mensagens seguidas da mesma pessoa, do mesmo lado, formam um
 * grupo; um evento ou a mudança de dia interrompe o grupo.
 */
export function chatRows(messages: readonly MatchMessageOut[], now = new Date()): ChatRow[] {
  const rows: ChatRow[] = []
  let day = ''
  for (const message of messages) {
    const date = parseIso(message.created_at)
    if (date && dayKey(date) !== day) {
      day = dayKey(date)
      rows.push({ kind: 'day', key: `day-${message.id}`, label: dayLabel(date, now) })
    }
    if (message.kind === 'evento') {
      rows.push({ kind: 'event', key: `event-${message.id}`, message })
      continue
    }
    const last = rows[rows.length - 1]
    if (last?.kind === 'group' && last.messages[0].author?.id === message.author?.id && last.messages[0].side === message.side) {
      last.messages.push(message)
    } else {
      rows.push({ kind: 'group', key: `group-${message.id}`, messages: [message] })
    }
  }
  return rows
}

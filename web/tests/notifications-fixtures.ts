import { screen } from '@testing-library/react'
import type { ArenaNotification, NotificationSummary } from '../src/api/notifications'

/** Resumo de `GET /me/notifications/summary` com tudo zerado; `overrides` muda só o que o teste usa. */
export const summaryOf = (overrides: Partial<Omit<NotificationSummary, 'unread_by_category'>> & { unread_by_category?: Partial<NotificationSummary['unread_by_category']> } = {}): NotificationSummary => {
  const { unread_by_category, ...rest } = overrides
  return { unread_count: 0, follow_requests_count: 0, pending_count: 0, ...rest, unread_by_category: { partidas: 0, times: 0, eventos: 0, ...unread_by_category } }
}

/** Notificação com os campos novos do contrato (categoria, pendência e prazo) e `created_at` há `id` horas. */
export function noteOf(id: number, type: string, payload: Record<string, unknown> = {}, extra: Partial<ArenaNotification> = {}): ArenaNotification {
  return {
    id, type, payload, actor: null, created_at: new Date(Date.now() - id * 3600_000).toISOString(), read_at: null,
    category: 'partidas', pending: false, action_until: null, ...extra,
  }
}

/** Espera as linhas de notificação (agrupadas por dia: o número de listas depende da hora do teste) e devolve a raiz delas. */
export async function listed(): Promise<HTMLElement> {
  await screen.findAllByRole('listitem')
  return document.body
}

import type { Person } from '../../src/api/client'
import type { ArenaNotification, NotificationSummary } from '../../src/api/notifications'
import { page, serve } from './events'
import type { Route } from './events'
import { emptySummary } from './play'

/*
 * Fixtures das notificações com pendências, categorias e resumo (`GET /me/notifications/summary`), e o servidor simulado das
 * consultas da tela: a lista de cada chip e o bloco "Para responder".
 */

export const person = (name: string, id = 2): Person => ({ id, name, username: name.toLowerCase().replace(/\s+/g, '.'), avatar_url: null })

let nextId = 1
export const resetNotificationIds = () => { nextId = 1 }

/** Notificação do titular: não lida, de há 5 min, sem pendência, a menos que `extra` diga o contrário. */
export function note(type: string, payload: Record<string, unknown> = {}, actor: string | null = null, extra: Partial<ArenaNotification> = {}): ArenaNotification {
  return {
    id: nextId++, type, category: 'conta', payload, actor: actor ? person(actor) : null, created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    read_at: null, pending: false, action_until: null, ...extra,
  }
}

const HOUR = 3_600_000
/** Pendência aberta: criada há `agoH` horas, com prazo em `leftH` horas (`null`: sem prazo). */
export function pendingNote(type: string, payload: Record<string, unknown> = {}, actor: string | null = null, { agoH = 1, leftH = 2 as number | null, ...extra }: Partial<ArenaNotification> & { agoH?: number; leftH?: number | null } = {}): ArenaNotification {
  return note(type, payload, actor, {
    category: 'partidas', pending: true, created_at: new Date(Date.now() - agoH * HOUR).toISOString(),
    action_until: leftH === null ? null : new Date(Date.now() + leftH * HOUR).toISOString(), ...extra,
  })
}

/** Resumo com as contagens dadas (`unread_by_category` aceita só as categorias que interessam). */
export function summaryOf(counts: Partial<Omit<NotificationSummary, 'unread_by_category'>> & { by?: Partial<NotificationSummary['unread_by_category']> } = {}): NotificationSummary {
  const { by, ...rest } = counts
  return emptySummary({ ...rest, unread_by_category: { partidas: 0, times: 0, eventos: 0, ...by } })
}

export const PENDING_ALL = '/me/notifications/pending?limit=50'
export const FEED_ALL = '/me/notifications?pendente=false'
export const pendingOf = (categoria: string) => `/me/notifications/pending?categoria=${categoria}&limit=50`
export const feedOf = (categoria: string) => `/me/notifications?categoria=${categoria}&pendente=false`

/** Servidor simulado de "Tudo": o bloco fixado, a lista sem pendências e a fila de pedidos para seguir; `extra` acrescenta e troca rotas. */
export function serveNotifications({ pending = [], feed = [], next = null, requests = [], extra = {} }: {
  pending?: ArenaNotification[]
  feed?: ArenaNotification[]
  next?: string | null
  requests?: unknown[]
  extra?: Record<string, Route>
} = {}) {
  serve({
    [PENDING_ALL]: { items: pending },
    [FEED_ALL]: page(feed, next),
    '/me/follow-requests': page(requests),
    ...extra,
  })
}

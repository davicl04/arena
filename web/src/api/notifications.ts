import { request } from './client'
import type { Person } from './client'

/** Contrato: docs/decisoes/0003-times-campeonatos.md, seção 7. Os pedidos para seguir ficam em `/me/follow-requests`. */

/** Tipos da etapa 1. As fases seguintes acrescentam outros; a web mostra um texto genérico para os desconhecidos. */
export type NotificationType =
  | 'convite_time'
  | 'convite_aceito'
  | 'pedido_entrada'
  | 'pedido_entrada_decidido'
  | 'removido_do_time'
  | 'time_encerrado'
  | 'pedido_organizador_decidido'
  | 'organizador_revogado'

export interface ArenaNotification {
  id: number
  type: NotificationType | (string & {})
  payload: Record<string, unknown>
  /** null: administração, sistema, conta inativa ou bloqueada. */
  actor: Person | null
  created_at: string
  read_at: string | null
}
export interface UnreadCount { unread_count: number }

export const NOTIFICATIONS_PATH = '/me/notifications'
export const getUnreadCount = () => request<UnreadCount>('/me/notifications/unread-count')
export const markNotificationRead = (id: number) => request<UnreadCount>(`/me/notifications/${id}/read`, 'PUT', {})
export const markAllNotificationsRead = () => request<UnreadCount>('/me/notifications/read-all', 'PUT', {})

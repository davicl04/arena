import { request } from './client'
import type { Person } from './client'

/** Contrato: docs/decisoes/0003-times-campeonatos.md, seção 7. Os pedidos para seguir ficam em `/me/follow-requests`. */

/**
 * Tipos das etapas 1 (seção 7), 2 (seção 17: eventos, inscrições, comprovantes, devoluções e avisos), 3 (0002-jogar,
 * seção 13: propostas, partida, W.O., resultado, vagas e quadras) e 4 (0003, seção 21.6: tabela, adversário, divergência,
 * decisão e encerramento do campeonato). As fases seguintes acrescentam outros; o app mostra um texto genérico para os
 * desconhecidos.
 */
export type NotificationType =
  | 'convite_time'
  | 'convite_aceito'
  | 'pedido_entrada'
  | 'pedido_entrada_decidido'
  | 'removido_do_time'
  | 'time_encerrado'
  | 'pedido_organizador_decidido'
  | 'organizador_revogado'
  | 'evento_para_aprovar'
  | 'evento_decidido'
  | 'evento_cancelado'
  | 'evento_revogacao_decidida'
  | 'aviso_evento'
  | 'time_inscrito'
  | 'comprovante_recebido'
  | 'comprovante_decidido'
  | 'reserva_expirada'
  | 'devolucao_enviada'
  | 'devolucao_confirmada'
  | 'devolucao_contestada'
  | 'devolucao_decidida'
  | 'proposta_partida'
  | 'proposta_aceita'
  | 'proposta_encerrada'
  | 'vaga_encontrada'
  | 'oferta_retirada'
  | 'condicoes_propostas'
  | 'partida_agendada'
  | 'partida_cancelada'
  | 'wo_registrado'
  | 'wo_contestado'
  | 'wo_decidido'
  | 'resultado_partida'
  | 'resultado_divergente'
  | 'estatistica_contestada'
  | 'vaga_preenchida'
  | 'removido_da_partida'
  | 'quadra_decidida'
  | 'tabela_publicada'
  | 'adversario_definido'
  | 'divergencia_para_decidir'
  | 'decisao_registrada'
  | 'evento_encerrado'

/** Categoria derivada do tipo no servidor; `conta` só aparece em "Tudo". */
export type NotificationCategory = 'partidas' | 'times' | 'eventos' | 'conta'
/** Categorias que viram filtro (chips Partidas, Times e Eventos). */
export type NotificationFilterCategory = Exclude<NotificationCategory, 'conta'>

export interface ArenaNotification {
  id: number
  type: NotificationType | (string & {})
  category: NotificationCategory
  payload: Record<string, unknown>
  /** null: administração, sistema, conta inativa ou bloqueada. */
  actor: Person | null
  created_at: string
  read_at: string | null
  /** Ainda pede uma resposta (calculado pelo servidor): ler não resolve; só a ação ou o prazo vencido. */
  pending: boolean
  /** Prazo para responder; `null` quando a pendência não tem prazo. */
  action_until: string | null
}
export interface UnreadCount { unread_count: number }

/** `GET /me/notifications/summary`: o que o sino, a linha de resumo da tela e os chips mostram. */
export interface NotificationSummary {
  unread_count: number
  follow_requests_count: number
  pending_count: number
  unread_by_category: Record<NotificationFilterCategory, number>
}
export interface PendingNotifications { items: ArenaNotification[]; next_cursor?: string | null }

export const NOTIFICATIONS_PATH = '/me/notifications'

/** Filtros da lista: a de "Tudo" e a de cada categoria usam `pendente: false`, abaixo do bloco fixado. */
export interface NotificationsQuery { categoria?: NotificationFilterCategory; pendente?: boolean }
export function notificationsPath({ categoria, pendente }: NotificationsQuery = {}): string {
  const query = new URLSearchParams()
  if (categoria) query.set('categoria', categoria)
  if (pendente !== undefined) query.set('pendente', String(pendente))
  const text = query.toString()
  return text ? `${NOTIFICATIONS_PATH}?${text}` : NOTIFICATIONS_PATH
}

export const getUnreadCount = () => request<UnreadCount>('/me/notifications/unread-count', 'GET', undefined, { background: true })
export const getNotificationSummary = () => request<NotificationSummary>('/me/notifications/summary', 'GET', undefined, { background: true })
/** Pendências abertas por urgência, com cursor (`limit` de 1 a 50; o servidor usa 20 se omitido). */
export function listPendingNotifications({ categoria, limit, cursor }: { categoria?: NotificationFilterCategory; limit?: number; cursor?: string } = {}) {
  const query = new URLSearchParams()
  if (categoria) query.set('categoria', categoria)
  if (limit !== undefined) query.set('limit', String(limit))
  if (cursor !== undefined) query.set('cursor', cursor)
  const text = query.toString()
  return request<PendingNotifications>(`${NOTIFICATIONS_PATH}/pending${text ? `?${text}` : ''}`)
}
export const markNotificationRead = (id: number) => request<NotificationSummary>(`/me/notifications/${id}/read`, 'PUT', {})
export const markAllNotificationsRead = () => request<NotificationSummary>('/me/notifications/read-all', 'PUT', {})

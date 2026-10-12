import { request } from './client'
import type { Person } from './client'

/** Contrato: docs/decisoes/0003-times-campeonatos.md, seção 7. Os pedidos para seguir ficam em `/me/follow-requests`. */

/**
 * Tipos das etapas 1 (seção 7), 2 (seção 17: eventos, inscrições, comprovantes, devoluções e avisos) e 3 (0002-jogar,
 * seção 13: propostas, partida, W.O., resultado, vagas e quadras). As fases seguintes acrescentam outros; a web mostra
 * um texto genérico para os desconhecidos.
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

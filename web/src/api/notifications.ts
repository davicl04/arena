import { request } from './client'
import type { Person } from './client'

/** Contrato: docs/decisoes/0003-times-campeonatos.md, seção 7. Os pedidos para seguir ficam em `/me/follow-requests`. */

/**
 * Tipos das etapas 1 (seção 7), 2 (seção 17: eventos, inscrições, comprovantes, devoluções e avisos) e 3 (0002-jogar,
 * seção 13: propostas, partida, W.O., resultado, vagas e quadras) e 4 (0003, seção 21.6: tabela, adversário, divergência,
 * decisão e encerramento do campeonato). As fases seguintes acrescentam outros; a web mostra
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
  | 'tabela_publicada'
  | 'adversario_definido'
  | 'divergencia_para_decidir'
  | 'decisao_registrada'
  | 'evento_encerrado'

/** Categoria da notificação (derivada do tipo no servidor); `conta` só aparece em *Tudo*. */
export type NotificationCategory = 'partidas' | 'times' | 'eventos' | 'conta'
/** Categorias que têm chip e filtro próprios na tela de notificações. */
export type NotificationFilterCategory = Exclude<NotificationCategory, 'conta'>

export interface ArenaNotification {
  id: number
  type: NotificationType | (string & {})
  payload: Record<string, unknown>
  /** null: administração, sistema, conta inativa ou bloqueada. */
  actor: Person | null
  created_at: string
  read_at: string | null
  category: NotificationCategory
  /** Ainda pede uma resposta da pessoa (tipos com ação, não resolvidos e dentro do prazo); ler não resolve. */
  pending: boolean
  /** Prazo para responder; null quando a pendência não tem prazo (ou a notificação não é uma pendência). */
  action_until: string | null
}
export interface UnreadCount { unread_count: number }

/** Resumo para o sino, os chips e a placa do Início (`GET /me/notifications/summary`). */
export interface NotificationSummary {
  unread_count: number
  follow_requests_count: number
  pending_count: number
  unread_by_category: Record<NotificationFilterCategory, number>
}

export const NOTIFICATIONS_PATH = '/me/notifications'
export const getUnreadCount = () => request<UnreadCount>('/me/notifications/unread-count', 'GET', undefined, { background: true })
export const getNotificationSummary = () => request<NotificationSummary>('/me/notifications/summary', 'GET', undefined, { background: true })
export const markNotificationRead = (id: number) => request<NotificationSummary>(`/me/notifications/${id}/read`, 'PUT', {})
export const markAllNotificationsRead = () => request<NotificationSummary>('/me/notifications/read-all', 'PUT', {})

const query = (params: Record<string, string | number | boolean | undefined>) => {
  const parts = Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

/** Caminho da lista paginada, com os filtros do servidor; `usePagedList` acrescenta o cursor. */
export const notificationsPath = ({ categoria, pendente }: { categoria?: NotificationFilterCategory; pendente?: boolean } = {}) =>
  `${NOTIFICATIONS_PATH}${query({ categoria, pendente })}`

/** Pendências abertas, da mais urgente à menos urgente, sem cursor (`limit` de 1 a 50; padrão do servidor: 20). */
export const listPendingNotifications = ({ categoria, limit }: { categoria?: NotificationFilterCategory; limit?: number } = {}) =>
  request<{ items: ArenaNotification[] }>(`${NOTIFICATIONS_PATH}/pending${query({ categoria, limit })}`)

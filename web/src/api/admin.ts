import { request } from './client'
import type { Person } from './client'
import { ORGANIZER_LIMITS } from './organizer'
import type { AdminOrganizerRequest, OrganizerRefusalReason } from './organizer'
import type { EventPix, EventPoster, OrganizerEntry, PendingCounts } from './events'
import type { EntryState, EventRefusalReason } from '../data/arena'

/**
 * Filas da administração (contrato 0003, seções 6 e 15). Exigem `is_admin`; o servidor responde 403 aos demais.
 * `queue-counts` alimenta os contadores do Menu: pedidos de organizador, denúncias, eventos pagos, eventos de
 * organizador revogado e devoluções contestadas.
 */

export interface QueueCounts {
  organizer_requests: number
  reports: number
  paid_events: number
  revoked_events: number
  refund_disputes: number
}
export const getQueueCounts = () => request<QueueCounts>('/admin/queue-counts')

export type OrganizerQueue = 'em_analise' | 'decididos'
/** Caminho paginado da fila (para `usePagedList`). */
export const organizerRequestsPath = (queue: OrganizerQueue) => `/admin/organizer-requests?state=${queue}`
export const ADMIN_ORGANIZERS_PATH = '/admin/organizers'

export type OrganizerDecisionInput =
  | { decision: 'aprovar' }
  | { decision: 'recusar'; reason_code: OrganizerRefusalReason; reason_detail?: string }

export const decideOrganizerRequest = (id: number, input: OrganizerDecisionInput) =>
  request<AdminOrganizerRequest>(`/admin/organizer-requests/${id}/decision`, 'POST', input)
export const revokeOrganizer = (id: number, reason: string) =>
  request<void>(`/admin/organizers/${id}/revoke`, 'POST', { reason: reason.trim() })

/** Recusa: motivo obrigatório; em "Outro", o detalhe de 5 a `max` caracteres (500 no pedido e no evento). Mesmas mensagens do servidor. */
export function refusalError(code: string | null, detail: string, max: number = ORGANIZER_LIMITS.detailMax): string | null {
  const text = detail.trim()
  if (!code) return 'Escolha o motivo da recusa.'
  if (text.length > max) return `Use até ${max} caracteres no detalhe.`
  if (code === 'outro' && text.length < ORGANIZER_LIMITS.detailMin) return 'Descreva o motivo da recusa.'
  return null
}

/** Revogação: motivo de 5 a 500 caracteres. */
export function revokeError(reason: string): string | null {
  const text = reason.trim()
  if (text.length < ORGANIZER_LIMITS.detailMin || text.length > ORGANIZER_LIMITS.detailMax)
    return `Informe o motivo da revogação, de ${ORGANIZER_LIMITS.detailMin} a ${ORGANIZER_LIMITS.detailMax} caracteres.`
  return null
}

/** Corpo da recusa: o detalhe vazio é omitido. */
export function refusalInput(code: OrganizerRefusalReason, detail: string): OrganizerDecisionInput {
  const text = detail.trim()
  return text ? { decision: 'recusar', reason_code: code, reason_detail: text } : { decision: 'recusar', reason_code: code }
}

/* ===== Eventos pagos (AD1), eventos de organizador revogado e devoluções contestadas (seção 15) ===== */

/** Folha das filas de eventos: cartaz, organizador, Pix informado e o que está em jogo. */
export interface AdminEvent extends EventPoster {
  organizer: { organizer_id: number | null; display_name: string; user: Person; active: boolean }
  pix: EventPix | null
  contact: string | null
  course_notes: string | null
  submitted_at: string | null
  published_at: string | null
  revocation_decision: 'pendente' | 'seguir' | 'cancelado' | null
  pending: PendingCounts
  entries_by_state: Partial<Record<EntryState, number>>
}

export interface RefundDispute {
  /** `refund` é o comprovante contestado. */
  entry: OrganizerEntry
  event: EventPoster
  organizer: Person
  contested_at: string
}

export type AdminEventQueue = 'em_aprovacao' | 'revogacao'
/** Caminho paginado das filas de eventos (para `usePagedList`). */
export const adminEventsPath = (queue: AdminEventQueue) => `/admin/events?queue=${queue}`
export const REFUND_DISPUTES_PATH = '/admin/refund-disputes'

export type EventDecisionInput =
  | { decision: 'aprovar' }
  | { decision: 'recusar'; reason_code: EventRefusalReason; reason_detail?: string }
export const decideEvent = (id: number, input: EventDecisionInput) =>
  request<AdminEvent>(`/admin/events/${id}/decision`, 'POST', input)

/** Corpo da recusa do evento: o detalhe vazio é omitido. */
export function eventRefusalInput(code: EventRefusalReason, detail: string): EventDecisionInput {
  const text = detail.trim()
  return text ? { decision: 'recusar', reason_code: code, reason_detail: text } : { decision: 'recusar', reason_code: code }
}

export type RevocationDecisionInput = { decision: 'seguir' } | { decision: 'cancelar'; reason: string }
export const decideRevocation = (id: number, input: RevocationDecisionInput) =>
  request<AdminEvent>(`/admin/events/${id}/revocation-decision`, 'POST', input)

export type RefundDecision = 'devolvida' | 'pendente'
export const decideRefund = (entryId: number, decision: RefundDecision, reason: string) =>
  request<RefundDispute>(`/admin/entries/${entryId}/refund-decision`, 'POST', { decision, reason: reason.trim() })

/** Motivo de 5 a 500 caracteres (cancelar o evento revogado e decidir a devolução contestada). */
export function reasonError(reason: string, message: string): string | null {
  const text = reason.trim()
  return text.length < ORGANIZER_LIMITS.detailMin || text.length > ORGANIZER_LIMITS.detailMax ? message : null
}
export const CANCEL_REASON_MESSAGE = 'Descreva o motivo do cancelamento, de 5 a 500 caracteres.'
export const REFUND_REASON_MESSAGE = 'Descreva a decisão, de 5 a 500 caracteres.'

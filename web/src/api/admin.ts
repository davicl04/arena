import { request } from './client'
import { ORGANIZER_LIMITS } from './organizer'
import type { AdminOrganizerRequest, OrganizerRefusalReason } from './organizer'

/** Filas da administração (contrato 0003, seção 6). Exigem `is_admin`; o servidor responde 403 aos demais. */

export interface QueueCounts { organizer_requests: number }
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

/** Recusa: motivo obrigatório; em "Outro", o detalhe de 5 a 500 caracteres. Mesmas mensagens do servidor. */
export function refusalError(code: OrganizerRefusalReason | null, detail: string): string | null {
  const text = detail.trim()
  if (!code) return 'Escolha o motivo da recusa.'
  if (text.length > ORGANIZER_LIMITS.detailMax) return `Use até ${ORGANIZER_LIMITS.detailMax} caracteres no detalhe.`
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

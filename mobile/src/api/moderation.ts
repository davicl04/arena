import { request } from './client'
import { REPORT_REASONS } from './social'

/*
 * Fila de denúncias da administração (`/admin/reports`, mesmo contrato da web). Exige `is_admin`; o servidor responde
 * 403 aos demais. O alvo vem do `ContentReport`: publicação, comentário, conta e, quando a API trouxer, a mensagem do
 * chat da partida (`match_message`, contrato 0002).
 */

export type ReportStatus = 'pending' | 'resolved'
export type ReportedTarget = 'post' | 'comment' | 'user' | 'match_message'
/**
 * Prévia do alvo: conta (`name`, `social_public`), publicação (`caption`, `image_url`), comentário (`body`) e mensagem do
 * chat da partida (contrato 0002, seção 11.1): `body` (nulo se já removida), `removed`, `match_id` e `match` ("A × B").
 */
/** `image_url` é a rota da administração (`/api/v1/admin/reports/{id}/image`), que só serve a imagem enquanto a denúncia está pendente. */
export interface ReportPreview {
  name?: string
  social_public?: boolean
  caption?: string
  body?: string | null
  author?: string
  removed?: boolean
  match_id?: number
  match?: string
  image_url?: string | null
}
export interface AdminReport {
  id: number
  /** Alvos novos que a API passe a trazer chegam como texto e aparecem como "Conteúdo". */
  target_type: ReportedTarget | (string & {})
  target_id: number
  reason: string
  description: string | null
  status: ReportStatus
  created_at: string
  target_preview: ReportPreview | null
  target_user_id: number | null
  target_user_active: boolean | null
}
export type ModerationAction = 'dismiss' | 'remove' | 'suspend' | 'reactivate'
export interface ModerationResult { report_id: number; status: ReportStatus; action: ModerationAction }

/** Caminho paginado da fila (para `usePagedList`): pendentes ou resolvidas. */
export const adminReportsPath = (status: ReportStatus) => `/admin/reports?status=${status}`

/** Justificativa da decisão: de 5 a 1000 caracteres, como no servidor (o campo já limita o máximo). */
export const JUSTIFICATION_LIMITS = { min: 5, max: 1000 } as const
export const JUSTIFICATION_MESSAGE = 'Informe uma justificativa de pelo menos 5 caracteres.'
export const justificationError = (text: string): string | null => (text.trim().length < JUSTIFICATION_LIMITS.min ? JUSTIFICATION_MESSAGE : null)

export const decideReport = (reportId: number, action: ModerationAction, justification: string) =>
  request<ModerationResult>(`/admin/reports/${reportId}/decision`, 'POST', { action, justification: justification.trim() })
/** Reativa a conta suspensa (aba Resolvidas); a justificativa vai na query, como na web. */
export const reactivateAccount = (userId: number, justification: string) =>
  request<{ active: boolean }>(`/admin/users/${userId}/status?active=true&justification=${encodeURIComponent(justification.trim())}`, 'PUT', {})

/** Decisões possíveis: remover vale para conteúdo; reativar, só para a denúncia de uma conta. */
export function moderationActions(targetType: string): { value: ModerationAction; label: string; description: string }[] {
  const user = targetType === 'user'
  const message = targetType === 'match_message'
  const remove = message
    ? { value: 'remove' as const, label: 'Remover mensagem', description: 'O texto some para todos na partida; o registro fica guardado com a denúncia.' }
    : { value: 'remove' as const, label: 'Remover conteúdo', description: 'Apaga o conteúdo denunciado.' }
  return [
    { value: 'dismiss', label: 'Dispensar denúncia', description: 'Nada a fazer: a denúncia é encerrada.' },
    ...(user ? [] : [remove]),
    { value: 'suspend', label: 'Suspender conta responsável', description: 'A conta perde o acesso e as sessões abertas.' },
    ...(user ? [{ value: 'reactivate' as const, label: 'Reativar conta', description: 'Devolve o acesso à conta.' }] : []),
  ]
}

const targetLabels: Record<string, string> = { post: 'Publicação', comment: 'Comentário', user: 'Conta', match_message: 'Mensagem da partida' }
export const reportTargetLabel = (targetType: string): string => targetLabels[targetType] ?? 'Conteúdo'

/** Motivo da denúncia em português; motivo desconhecido aparece sem sublinhados. */
export function reportReasonLabel(reason: string): string {
  return REPORT_REASONS.find(option => option.value === reason)?.label ?? reason.replaceAll('_', ' ')
}

/** Texto da prévia: legenda ou corpo (ou o aviso de mensagem já removida); conta privada quando a prévia é de uma conta fechada. */
export function previewText(preview: ReportPreview): string {
  if (preview.removed) return 'Mensagem já removida'
  return preview.caption || preview.body || (preview.social_public === false ? 'Conta privada' : '')
}

/** Contexto da mensagem do chat: "Partida #7 · Ferrugem FC × Leões"; vazio fora do chat. */
export function previewContext(preview: ReportPreview): string {
  if (!preview.match_id && !preview.match) return ''
  return `Partida${preview.match_id ? ` #${preview.match_id}` : ''}${preview.match ? ` · ${preview.match}` : ''}`
}

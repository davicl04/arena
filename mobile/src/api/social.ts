import { request } from './client'
import type { Page, Post, SocialComment, SocialUser } from './client'

export type ReportTarget = 'post' | 'comment' | 'user' | 'match_message'
export type ReportReason = 'spam' | 'assedio' | 'conteudo_inadequado' | 'outro'
export interface ReportInput { target_type: ReportTarget; target_id: number; reason: ReportReason; description?: string }

export const CAPTION_MAX = 2200
export const COMMENT_MAX = 1000
export const REPORT_DETAILS_MAX = 1000
export const REPORT_REASONS: { value: ReportReason; label: string; description: string }[] = [
  { value: 'spam', label: 'Spam', description: 'Propaganda, golpe ou conteúdo repetido' },
  { value: 'assedio', label: 'Assédio', description: 'Ofensa, ameaça ou perseguição' },
  { value: 'conteudo_inadequado', label: 'Conteúdo inadequado', description: 'Violência, nudez ou algo impróprio' },
  { value: 'outro', label: 'Outro motivo', description: 'Conte nos detalhes o que aconteceu' },
]

export const setLike = (postId: number, liked: boolean) => request<void>(`/posts/${postId}/like`, liked ? 'PUT' : 'DELETE')
export const updateCaption = (postId: number, caption: string) => request<Post>(`/posts/${postId}`, 'PATCH', { caption })
export const deletePost = (postId: number) => request<void>(`/posts/${postId}`, 'DELETE')
export const createComment = (postId: number, body: string) => request<SocialComment>(`/posts/${postId}/comments`, 'POST', { body })
export const deleteComment = (commentId: number) => request<void>(`/comments/${commentId}`, 'DELETE')
export const blockUser = (userId: number) => request<void>(`/users/${userId}/block`, 'PUT')

export type FollowState = SocialUser['follow_state']

/**
 * Alterna o vínculo com `person`: aprovado ou pendente → DELETE (volta a "none"); sem vínculo → PUT, que diz se ficou
 * aprovado ou pendente (sem resposta, vale a visibilidade da conta). Devolve o novo estado.
 */
export async function toggleFollow(person: Pick<SocialUser, 'id' | 'follow_state' | 'social_public'>): Promise<FollowState> {
  if (person.follow_state === 'approved' || person.follow_state === 'pending') {
    await request<void>(`/users/${person.id}/follow`, 'DELETE')
    return 'none'
  }
  const result = await request<{ state: 'approved' | 'pending' } | undefined>(`/users/${person.id}/follow`, 'PUT')
  return result?.state ?? (person.social_public ? 'approved' : 'pending')
}
export function sendReport({ description, ...report }: ReportInput) {
  const details = description?.trim()
  return request<unknown>('/reports', 'POST', details ? { ...report, description: details } : report)
}

/**
 * Rodadas no máximo do "Aprovar todas". Cada rodada lê a primeira página da fila (20 pedidos) e aprova o que veio; 500
 * rodadas cobrem 10 mil pedidos e só existem para o laço nunca rodar sem fim, mesmo que a fila não pare de crescer.
 */
export const APPROVE_ALL_MAX_ROUNDS = 500

/**
 * Aprova as solicitações para seguir em rodadas: cada aprovação tira o pedido da fila, então a primeira página é lida de
 * novo até esvaziar. `onApproved` recebe cada pessoa aprovada. Devolve `true` com a fila vazia, e `false` quando o laço
 * parou antes: uma rodada trouxe os mesmos pedidos da anterior (a aprovação não os tirou da fila) ou o teto de rodadas
 * acabou. Falhas da API sobem para quem chamou, com o que já foi aprovado informado por `onApproved`.
 */
export async function approveAllFollowRequests(onApproved: (userId: number) => void): Promise<boolean> {
  let previous = ''
  for (let round = 0; round < APPROVE_ALL_MAX_ROUNDS; round += 1) {
    const page = await request<Page<{ user: SocialUser }>>('/me/follow-requests')
    if (page.items.length === 0) return true
    const ids = page.items.map(item => item.user.id).join(',')
    if (ids === previous) return false
    previous = ids
    for (const item of page.items) {
      await request(`/me/follow-requests/${item.user.id}?approve=true`, 'PUT')
      onApproved(item.user.id)
    }
  }
  return false
}

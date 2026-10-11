import { request } from './client'
import type { Post, SocialComment } from './client'

export type ReportTarget = 'post' | 'comment' | 'user'
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
export function sendReport({ description, ...report }: ReportInput) {
  const details = description?.trim()
  return request<unknown>('/reports', 'POST', details ? { ...report, description: details } : report)
}

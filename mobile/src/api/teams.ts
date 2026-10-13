import { fileForm, request } from './client'
import type { City, Page, Person, Position, UploadFile } from './client'
import type { FormatStanding } from './play'
import type { TeamRole } from '../data/arena'

/*
 * Cliente de Meus times, convites e link do time (docs/decisoes/0003-times-campeonatos.md, seções 3 a 5).
 * Ações enviam JSON (mesmo vazio, `{}`); `DELETE` não tem corpo; o brasão vai em multipart (`file`).
 */

// Pessoa resumida (client.ts) e célula da grade C5 (play.ts, contrato 0002), compartilhadas com o organizador e o Jogar.
export type { Person } from './client'
export type { FormatStanding } from './play'

export interface RosterPreviewItem {
  user_id: number
  first_name: string
  avatar_url: string | null
  position: Position | null
  is_representative: boolean
}

/** Carteirinha C5. `my_role` é nulo para quem não é do elenco (convidado, link). */
export interface TeamCard {
  id: number
  name: string
  initials: string
  city: City
  crest_url: string | null
  my_role: TeamRole | null
  member_count: number
  representative_count: number
  /** Até 11 atletas; o "+N" usa `member_count`. */
  roster_preview: RosterPreviewItem[]
  /** Sempre 3, na ordem futsal, society, campo. */
  formats: FormatStanding[]
  /** Só para representantes; nulo para os demais. */
  pending_join_requests: number | null
  pending_invites: number | null
  created_at: string
}

export interface TeamMember {
  user_id: number
  name: string
  first_name: string
  username: string
  avatar_url: string | null
  position: Position | null
  role: TeamRole
  joined_at: string
  is_me: boolean
}

/** Situação de uma pessoa em relação ao time: "No elenco", "Pendente" ou "Escolher" na web. */
export type TeamStatus = 'membro' | 'convite_pendente' | 'pedido_pendente' | 'disponivel'
export interface InviteCandidate { person: Person; team_status: TeamStatus }

export interface TeamInviteSent {
  id: number
  invitee: Person
  inviter: Person | null
  message: string | null
  state: 'pendente' | 'aceito' | 'recusado' | 'cancelado'
  created_at: string
}

/** Cartão K1 do convite recebido; `team` vem como o convidado vê (`my_role: null`). */
export interface TeamInviteReceived {
  id: number
  team: TeamCard
  inviter: Person | null
  message: string | null
  created_at: string
}
export interface InviteDecisionResult { state: 'aceito' | 'recusado'; team: TeamCard | null }

export interface TeamLink { url: string; token: string; generated_at: string }
export interface JoinPreview {
  team: TeamCard
  my_status: TeamStatus
  invite_id: number | null
  request_id: number | null
}
export interface JoinRequest {
  id: number
  team_id: number
  requester: Person
  state: 'pendente' | 'aprovado' | 'recusado' | 'cancelado'
  created_at: string
  decided_at: string | null
}

export interface TeamInput { name: string; city_id: number }
export interface MemberUpdate { role?: TeamRole; position?: Position | null }
interface Items<T> { items: T[] }

const team = (id: number) => `/teams/${id}`

export const createTeam = (input: TeamInput) => request<TeamCard>('/teams', 'POST', input)
export const myTeams = () => request<Items<TeamCard>>('/me/teams').then(page => page.items)
export const getTeam = (id: number) => request<TeamCard>(team(id))
/** Envia só os campos alterados (o servidor exige ao menos um). */
export const updateTeam = (id: number, input: Partial<TeamInput>) => request<TeamCard>(team(id), 'PATCH', input)
/** Brasão escolhido na galeria (`{ uri, name, type }`), em multipart. */
export const uploadCrest = (id: number, image: UploadFile) => request<TeamCard>(`${team(id)}/crest`, 'PUT', fileForm(image))
export const removeCrest = (id: number) => request<void>(`${team(id)}/crest`, 'DELETE')
export const closeTeam = (id: number) => request<void>(`${team(id)}/close`, 'POST', {})

export const teamMembers = (id: number) => request<Items<TeamMember>>(`${team(id)}/members`).then(page => page.items)
export const updateMember = (id: number, userId: number, input: MemberUpdate) =>
  request<TeamMember>(`${team(id)}/members/${userId}`, 'PATCH', input)
/** Remover outro atleta (representante) ou sair do time (o próprio titular). */
export const removeMember = (id: number, userId: number) => request<void>(`${team(id)}/members/${userId}`, 'DELETE')

/** Caminho paginado dos candidatos (para `usePagedList`): sem `q`, quem o representante segue. */
export function inviteCandidatesPath(id: number, query = '') {
  const q = query.trim()
  return `${team(id)}/invite-candidates${q ? `?q=${encodeURIComponent(q)}` : ''}`
}
export const inviteCandidates = (id: number, query = '') => request<Page<InviteCandidate>>(inviteCandidatesPath(id, query))
export const sendInvite = (id: number, userId: number, message: string | null) =>
  request<TeamInviteSent>(`${team(id)}/invites`, 'POST', { user_id: userId, message })
export const sentInvites = (id: number) => request<Items<TeamInviteSent>>(`${team(id)}/invites`).then(page => page.items)
export const cancelInvite = (inviteId: number) => request<void>(`/team-invites/${inviteId}`, 'DELETE')
export const myInvites = () => request<Items<TeamInviteReceived>>('/me/team-invites').then(page => page.items)
export const decideInvite = (inviteId: number, decision: 'aceitar' | 'recusar') =>
  request<InviteDecisionResult>(`/team-invites/${inviteId}`, 'PUT', { decision })

export const teamLink = (id: number) => request<TeamLink>(`${team(id)}/invite-link`)
export const regenerateLink = (id: number) => request<TeamLink>(`${team(id)}/invite-link`, 'POST', {})
const join = (token: string) => `/join/${encodeURIComponent(token)}`
export const joinPreview = (token: string) => request<JoinPreview>(join(token))
export const requestJoin = (token: string) => request<JoinRequest>(join(token), 'POST', {})
export const cancelJoinRequest = (requestId: number) => request<void>(`/team-join-requests/${requestId}`, 'DELETE')
export const joinRequests = (id: number) => request<Items<JoinRequest>>(`${team(id)}/join-requests`).then(page => page.items)
export const decideJoinRequest = (requestId: number, decision: 'aprovar' | 'recusar') =>
  request<JoinRequest>(`/team-join-requests/${requestId}`, 'PUT', { decision })

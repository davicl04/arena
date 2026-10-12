import { vi } from 'vitest'
import type { User } from '../../src/api/client'
import type { InviteCandidate, JoinPreview, JoinRequest, TeamCard, TeamInviteReceived, TeamInviteSent, TeamMember } from '../../src/api/teams'
import type { Navigation } from '../../src/navigation/useNavigation'

/* Dados e atalhos compartilhados pelos testes das telas de times (Meus times, Criar, Convidar e Entrar). */

export const TOKEN = 'test-only-token'
export const me: User = { id: 1, name: 'Maria Souza', username: 'maria.s', email: 'maria@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
export const city = { id: 1, name: 'Brasília', state: 'DF' }
export const person = (id: number, name = `Pessoa ${id}`) => ({ id, name, username: name.toLowerCase().replace(/\s+/g, '.'), avatar_url: null })

export function team(id: number, extra: Partial<TeamCard> = {}): TeamCard {
  return {
    id, name: `Time ${id}`, initials: 'TI', city, crest_url: null, my_role: 'representante', member_count: 3, representative_count: 2,
    roster_preview: [{ user_id: 1, first_name: 'Maria', avatar_url: null, position: 'goleiro', is_representative: true }],
    formats: [], pending_join_requests: 0, pending_invites: 0, created_at: '2026-10-01T10:00:00Z', ...extra,
  }
}

export function member(userId: number, extra: Partial<TeamMember> = {}): TeamMember {
  return { user_id: userId, name: `Atleta ${userId} Silva`, first_name: `Atleta${userId}`, username: `atleta.${userId}`, avatar_url: null, position: 'defesa', role: 'membro', joined_at: '2026-09-01T10:00:00Z', is_me: false, ...extra }
}

export const sentInvite = (id: number, name = `Convidado ${id}`): TeamInviteSent => ({ id, invitee: person(100 + id, name), inviter: person(1, 'Maria Souza'), message: null, state: 'pendente', created_at: '2026-10-11T10:00:00Z' })
export const joinRequest = (id: number, teamId: number, name = `Pedinte ${id}`): JoinRequest => ({ id, team_id: teamId, requester: person(200 + id, name), state: 'pendente', created_at: '2026-10-11T10:00:00Z', decided_at: null })
export const receivedInvite = (id: number, invited: TeamCard, message: string | null = null): TeamInviteReceived => ({ id, team: { ...invited, my_role: null }, inviter: person(7, 'Carlos Lima'), message, created_at: '2026-10-11T10:00:00Z' })
export const candidate = (id: number, name: string, status: InviteCandidate['team_status'] = 'disponivel'): InviteCandidate => ({ person: person(id, name), team_status: status })
export const preview = (invited: TeamCard, status: JoinPreview['my_status'] = 'disponivel', extra: Partial<JoinPreview> = {}): JoinPreview => ({ team: { ...invited, my_role: status === 'membro' ? 'membro' : null }, my_status: status, invite_id: null, request_id: null, ...extra })

export type FakeNavigation = { [K in keyof Navigation]: ReturnType<typeof vi.fn> } & Navigation
/** `Navigation` com funções espiãs; as telas só chamam `go`, `back`, `setParams` e `replace`. */
export function fakeNavigation(): FakeNavigation {
  return { go: vi.fn(), back: vi.fn(), setParams: vi.fn(), replace: vi.fn() } as unknown as FakeNavigation
}

export type Handler = (path: string, method?: string, body?: unknown) => unknown
/** Resposta de `request` para `handler`; `undefined` cai na resposta vazia padrão (`{ items: [] }`). */
export function answer(handler: Handler) {
  return async (path: string, method?: string, body?: unknown) => {
    const value = await handler(path, method, body)
    return (value === undefined ? { items: [], next_cursor: null } : value) as never
  }
}

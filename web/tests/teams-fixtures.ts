import { vi } from 'vitest'
import type { FormatStanding, Person, TeamCard, TeamInviteReceived, TeamMember } from '../src/api/teams'

/*
 * Dados e `fetch` simulado dos testes de Meus times. As rotas seguem docs/decisoes/0003-times-campeonatos.md; cada
 * chamada fica registrada (método, caminho e corpo) para conferir o contrato.
 */

export const brasilia = { id: 5300108, name: 'Brasília', state: 'DF' }
export const goiania = { id: 5208707, name: 'Goiânia', state: 'GO' }
export const person = (id: number, name: string): Person => ({ id, name, username: name.toLowerCase().replace(/\s+/g, '.'), avatar_url: null })
const empty = (format: FormatStanding['format']): FormatStanding => ({ format, state: 'sem_jogos', tier: null, played: 0, required: 3, rank_position: null, metric_value: null, faces: [], faces_any_level: false })
export const formats = (overrides: Partial<Record<FormatStanding['format'], Partial<FormatStanding>>> = {}): FormatStanding[] =>
  (['futsal', 'society', 'campo'] as const).map(format => ({ ...empty(format), ...overrides[format] }))

export function team(overrides: Partial<TeamCard> = {}): TeamCard {
  return {
    id: 10, name: 'Ferrugem FC', initials: 'FF', city: brasilia, crest_url: null, my_role: 'representante', member_count: 3, representative_count: 2,
    roster_preview: [
      { user_id: 1, first_name: 'Ricardo', avatar_url: null, position: 'atacante', is_representative: true },
      { user_id: 2, first_name: 'Rafa', avatar_url: null, position: 'meio_campo', is_representative: true },
      { user_id: 3, first_name: 'Tiago', avatar_url: null, position: 'defesa', is_representative: false },
    ],
    formats: formats({ society: { state: 'ranqueado', tier: 'prata', played: 5 }, futsal: { state: 'classificacao', played: 1 } }),
    pending_join_requests: 0, pending_invites: 0, created_at: '2026-09-01T12:00:00Z', ...overrides,
  }
}

export function member(userId: number, name: string, overrides: Partial<TeamMember> = {}): TeamMember {
  return { user_id: userId, name, first_name: name.split(' ')[0], username: name.toLowerCase().replace(/\s+/g, '.'), avatar_url: null,
    position: 'meio_campo', role: 'membro', joined_at: '2026-03-10T12:00:00Z', is_me: userId === 1, ...overrides }
}
export const roster = (): TeamMember[] => [
  member(1, 'Ricardo Moura', { role: 'representante', position: 'atacante' }),
  member(2, 'Rafa Nunes', { role: 'representante' }),
  member(3, 'Tiago Melo', { position: 'defesa' }),
]

export function receivedInvite(overrides: Partial<TeamInviteReceived> = {}): TeamInviteReceived {
  return { id: 501, team: team({ id: 20, name: 'Leões do Cerrado', initials: 'LC', my_role: null, pending_invites: null, pending_join_requests: null }),
    inviter: person(9, 'Caio Ramos'), message: 'Precisamos de um atacante para quinta.', created_at: new Date(Date.now() - 2 * 3600e3).toISOString(), ...overrides }
}

export interface Call { method: string; path: string; body: unknown }
type Reply = unknown | { status: number; body?: unknown }
type Handler = (call: Call) => Reply | Promise<Reply>

/** Resposta com status explícito; sem isso, 200 com o valor (ou 204 para `undefined`). */
export const reply = (status: number, body?: unknown) => ({ __reply: true, status, body })
export const apiError = (status: number, detail: string) => reply(status, { detail })

/**
 * Simula a API: `routes` mapeia "MÉTODO /caminho" (sem `/api/v1`, com a query) para o valor ou uma função.
 * Rota ausente responde 404. Devolve as chamadas feitas.
 */
export function mockApi(routes: Record<string, Reply | Handler>) {
  const calls: Call[] = []
  const fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input))
    const path = url.pathname.replace(/^\/api\/v1/, '') + url.search
    const method = (init.method ?? 'GET').toUpperCase()
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body
    const call = { method, path, body }
    calls.push(call)
    const key = `${method} ${path}`
    if (!(key in routes)) return new Response(JSON.stringify({ detail: `Rota não simulada: ${key}` }), { status: 404 })
    const route = routes[key]
    const value = typeof route === 'function' ? await (route as Handler)(call) : route
    if (value && typeof value === 'object' && '__reply' in value) {
      const { status, body: payload } = value as { status: number; body?: unknown }
      return new Response(status === 204 ? null : JSON.stringify(payload ?? {}), { status })
    }
    return value === undefined ? new Response(null, { status: 204 }) : new Response(JSON.stringify(value), { status: 200 })
  })
  vi.stubGlobal('fetch', fetch)
  return { calls, fetch, find: (method: string, path: string) => calls.filter(call => call.method === method && call.path === path) }
}

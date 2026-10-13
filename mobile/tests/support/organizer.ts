import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { vi } from 'vitest'
import { request } from '../../src/api/client'
import type { OrganizerEventCard, OrganizerEventDetail } from '../../src/api/events'
import type { OrganizerRequest, OrganizerStatus } from '../../src/api/organizer'

/*
 * Peças comuns dos testes do organizador (Expo): fixtures das respostas da API, um roteador para o `request` simulado e a
 * montagem de uma tela com a navegação e o encerramento de sessão simulados. O módulo `api/client` precisa estar
 * simulado no teste (`vi.mock('../src/api/client', …)` com `request: vi.fn()`).
 */

export const city = { id: 7, name: 'Brasília', state: 'DF' }
export const otherCity = { id: 9, name: 'Goiânia', state: 'GO' }
export const noPending = { receipts: 0, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 0 }

export const card = (over: Partial<OrganizerEventCard> = {}): OrganizerEventCard => ({
  id: 5, name: 'Copa Sudoeste', sport: 'futebol', format: 'society', distance_km: null, competition_type: 'todos_contra_todos', capacity: 8,
  entries_count: 3, confirmed_count: 2, starts_at: '2026-11-15T12:00:00.000Z', registration_closes_at: '2026-11-10T02:59:00.000Z', registration_deadline: '2026-11-10T02:59:00.000Z',
  city, venue: 'Arena Sudoeste', price_cents: 0, accepted_tiers: null, state: 'publicado', phase: 'inscricoes_abertas', revocation_pending: false,
  pending: noPending, next_action: { kind: 'acompanhar_inscricoes', count: null, deadline: '2026-11-10T02:59:00.000Z' }, ...over,
})

export const detail = (over: Partial<OrganizerEventDetail> = {}): OrganizerEventDetail => ({
  ...card(), course_notes: null, contact: 'copa@example.com', pix: null, checklist: [], can_submit: false, refusal: null, submitted_at: null,
  published_at: '2026-10-01T12:00:00.000Z', cancelled_at: null, cancel_reason: null, revocation_decision: null, entries_by_state: { confirmada: 2, reservada: 1 },
  editable_fields: ['venue', 'course_notes', 'pix_instructions', 'contact'], tennis_bonus: null, ...over,
})

export const checklistItems = (done: string[]) => [
  { key: 'nome_modalidade', label: 'Nome e modalidade', message: 'Informe o nome.' },
  { key: 'formato_tipo', label: 'Formato e tipo', message: 'Escolha o formato.' },
  { key: 'vagas_elos', label: 'Vagas e elos aceitos', message: 'Informe as vagas.' },
  { key: 'datas', label: 'Datas', message: 'Escolha as datas.' },
  { key: 'local', label: 'Local', message: 'Informe o local.' },
  { key: 'inscricao', label: 'Inscrição e Pix', message: 'Escolha gratuita ou paga.' },
].map(item => ({ ...item, key: item.key as OrganizerEventDetail['checklist'][number]['key'], done: done.includes(item.key), message: done.includes(item.key) ? null : item.message }))

export const draftDetail = (over: Partial<OrganizerEventDetail> = {}): OrganizerEventDetail => detail({
  state: 'rascunho', phase: 'rascunho', published_at: null, entries_count: 0, confirmed_count: 0, entries_by_state: {},
  checklist: checklistItems(['nome_modalidade', 'formato_tipo', 'vagas_elos']), can_submit: false,
  next_action: { kind: 'completar_rascunho', count: null, deadline: null }, editable_fields: ['name', 'sport', 'venue', 'price_cents'], ...over,
})

export const organizerRequest = (over: Partial<OrganizerRequest> = {}): OrganizerRequest => ({
  id: 3, display_name: 'Liga Candanga', city, sports: ['futebol'], experience: null, contact: 'liga@example.com', link: null, state: 'em_analise',
  reason_code: null, reason_detail: null, created_at: '2026-10-05T12:00:00.000Z', decided_at: null, ...over,
})

export const status = (over: Partial<OrganizerStatus> = {}): OrganizerStatus => ({ state: 'sem_pedido', request: null, organizer: null, revocation: null, ...over })
export const approved = (): OrganizerStatus => status({ state: 'aprovado', request: organizerRequest({ state: 'aprovado' }), organizer: { id: 1, display_name: 'Liga Candanga', approved_at: '2026-10-06T12:00:00.000Z' } })

export const page = <T,>(items: T[], next_cursor: string | null = null) => ({ items, next_cursor })

type Handler = unknown | ((body: unknown, method: string) => unknown)
/**
 * Roteador do `request` simulado: a chave é "MÉTODO caminho" (ou só o caminho, para GET). A resposta é o valor, ou o que a
 * função devolver; uma função pode lançar o `ApiError`. Caminho sem rota responde uma página vazia.
 */
export function routeRequest(routes: Record<string, Handler>) {
  vi.mocked(request).mockReset().mockImplementation(async (path: string, method = 'GET', body?: unknown) => {
    const handler = routes[`${method} ${path}`] ?? (method === 'GET' ? routes[path] : undefined)
    if (handler === undefined) return page([]) as never
    return (typeof handler === 'function' ? await (handler as (body: unknown, method: string) => unknown)(body, method) : handler) as never
  })
}

export const calls = (method: string, path: string) => vi.mocked(request).mock.calls.filter(call => (call[1] ?? 'GET') === method && call[0] === path)

export function navigationMock() {
  return { go: vi.fn(), back: vi.fn(), setParams: vi.fn(), replace: vi.fn() }
}

/** Monta um componente e espera as leituras iniciais. */
export async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(element) })
  return tree
}

export const flush = () => act(async () => { await Promise.resolve() })

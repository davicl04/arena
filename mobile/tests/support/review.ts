import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { expect, vi } from 'vitest'
import { ApiError, request } from '../../src/api/client'
import type { User } from '../../src/api/client'
import type { AdminEvent, RefundDispute } from '../../src/api/admin'
import type { EventPoster, OrganizerEntry, OrganizerEventDetail, Receipt, ReceiptReview } from '../../src/api/events'
import type { AdminOrganizer, AdminOrganizerRequest } from '../../src/api/organizer'
import type { AdminReport } from '../../src/api/moderation'
import type { Navigation } from '../../src/navigation/useNavigation'

/* Fixtures e auxiliares dos testes de comprovantes, devoluções, filas da administração e denúncias (frente X4). */

export const me: User = { id: 1, name: 'Carlos Lima', username: 'carlos', email: 'carlos@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
export const admin: User = { ...me, id: 9, name: 'Ana Admin', username: 'ana.admin', is_admin: true }
export const page = <T>(items: T[], next: string | null = null) => ({ items, next_cursor: next })
export const person = (id: number, name: string) => ({ id, name, username: name.toLowerCase().replace(/\s+/g, '.'), avatar_url: null })
export const ferrugem = { id: 3, name: 'Ferrugem FC', initials: 'FF', crest_url: null }

const HOUR = 3_600_000
/** Instante ISO a `hours` horas de agora (negativo: no passado). */
export const inHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString()
export const inDays = (days: number) => inHours(days * 24)

export function poster(id = 5, extra: Partial<EventPoster> = {}): EventPoster {
  return {
    id, name: 'Copa Sudoeste', sport: 'futebol', format: 'society', distance_km: null, competition_type: 'todos_contra_todos', capacity: 8, entries_count: 3, confirmed_count: 2,
    starts_at: inDays(10), registration_closes_at: inDays(8), registration_deadline: inDays(8), city: { id: 1, name: 'Brasília', state: 'DF' }, venue: 'Arena Guará',
    price_cents: 24000, accepted_tiers: null, state: 'publicado', phase: 'inscricoes_abertas', revocation_pending: false, ...extra,
  }
}

const pix = { beneficiary: 'Liga Sul', key_type: 'email' as const, key: 'pagamentos@ligasul.com.br', copy_paste: '00020126580014BR.GOV.BCB.PIX0136pagamentos@ligasul.com.br', instructions: 'Use o nome do time na descrição.' }

/** Gestão do evento (G3) que o A2 lê: cartaz, pendências, Pix e cancelamento. */
export function eventDetail(extra: Partial<OrganizerEventDetail> = {}): OrganizerEventDetail {
  return {
    ...poster(5), pending: { receipts: 2, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 2 }, next_action: { kind: 'analisar_comprovantes', count: 2, deadline: null },
    course_notes: null, contact: '(61) 99812-4407', pix, checklist: [], can_submit: false, refusal: null, submitted_at: null, published_at: inDays(-3), cancelled_at: null, cancel_reason: null,
    revocation_decision: null, entries_by_state: {}, editable_fields: [], tennis_bonus: null, ...extra,
  }
}

export function receipt(extra: Partial<Receipt> = {}): Receipt {
  return {
    id: 70, kind: 'pagamento', file_url: '/api/v1/receipts/70/file', file_type: 'imagem', size_bytes: 2048, uploaded_by: person(2, 'Léo Matos'), created_at: inHours(-3),
    decision: null, reason_code: null, reason_detail: null, decided_at: null, participant_response: null, responded_at: null, contest_reason: null,
    auto_confirm_at: null, resolution: null, resolution_reason: null, resolved_at: null, ...extra,
  }
}

export function entry(extra: Partial<OrganizerEntry> = {}): OrganizerEntry {
  return {
    id: 9, subject: { kind: 'time', team: ferrugem, athlete: null }, state: 'em_analise', price_cents: 24000, reserved_until: inHours(40), created_at: inHours(-30),
    confirmed_at: null, registered_by: null, latest_payment: null, refund: null, ...extra,
  }
}

export function review(extra: Partial<ReceiptReview> = {}): ReceiptReview {
  return { receipt: receipt(), entry: entry(), attempt: 1, previous: [], ...extra }
}

export function adminEvent(extra: Partial<AdminEvent> = {}): AdminEvent {
  return {
    ...poster(5, { state: 'em_aprovacao', phase: 'em_aprovacao' }), organizer: { organizer_id: 4, display_name: 'Liga Sul', user: person(2, 'Rafa Nunes'), active: true }, pix,
    contact: '(61) 99812-4407', course_notes: null, submitted_at: inHours(-5), published_at: null, revocation_decision: null,
    pending: { receipts: 0, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 0 }, entries_by_state: {}, ...extra,
  }
}

export function dispute(extra: Partial<RefundDispute> = {}): RefundDispute {
  const refund = receipt({ id: 81, kind: 'devolucao', file_url: '/api/v1/receipts/81/file', uploaded_by: person(2, 'Rafa Nunes'), participant_response: 'contestada', contest_reason: 'O valor que voltou é menor que o pago.', responded_at: inHours(-2) })
  return { entry: entry({ id: 14, state: 'devolucao_contestada', refund }), event: poster(5, { state: 'cancelado', phase: 'cancelado' }), organizer: person(2, 'Rafa Nunes'), contested_at: inHours(-2), ...extra }
}

export function organizerRequest(extra: Partial<AdminOrganizerRequest> = {}): AdminOrganizerRequest {
  return {
    id: 31, display_name: 'Liga Sudoeste', city: { id: 1, name: 'Brasília', state: 'DF' }, sports: ['futebol', 'corrida'], experience: 'Organizo a pelada de quinta há 3 anos.', contact: '(61) 99999-0000',
    link: 'https://instagram.com/ligasudoeste', state: 'em_analise', reason_code: null, reason_detail: null, created_at: inHours(-5), decided_at: null, requester: person(2, 'Rafa Nunes'), decided_by: null, ...extra,
  }
}

export const adminOrganizer = (extra: Partial<AdminOrganizer> = {}): AdminOrganizer => ({ id: 4, user: person(2, 'Rafa Nunes'), display_name: 'Liga Sudoeste', approved_at: '2026-09-01T12:00:00Z', approved_by: person(9, 'Ana Admin'), request_id: 31, ...extra })

export function report(extra: Partial<AdminReport> = {}): AdminReport {
  return {
    id: 11, target_type: 'comment', target_id: 55, reason: 'assedio', description: 'Ofensas repetidas.', status: 'pending', created_at: inHours(-4),
    target_preview: { body: 'Texto ofensivo do comentário.', author: 'Zeca Souza' }, target_user_id: 77, target_user_active: true, ...extra,
  }
}

/** Módulo de tela substituído por um elemento com o nome dado, que só expõe as props recebidas (testes do shell). */
export const hostScreen = (name: string) => ({ default: (props: Record<string, unknown>) => React.createElement(name, props) })

/** Navegação simulada: cada chamada fica registrada. */
export const navigationMock = () => ({ go: vi.fn(), back: vi.fn(), setParams: vi.fn(), replace: vi.fn() }) as unknown as Navigation

/** Chamada recebida pelo servidor simulado. */
export interface Call { path: string; method: string; body: unknown }
export type Route = unknown | ((call: Call) => unknown)
/**
 * Servidor simulado do `request`: cada chave é `"MÉTODO caminho"` (ou só o caminho, para GET). Rotas ausentes viram 404;
 * um `ApiError` devolvido é lançado. Os valores podem ser funções para respostas que mudam durante o teste.
 */
export function serve(routes: Record<string, Route>) {
  vi.mocked(request).mockImplementation(async (path: string, method = 'GET', body?: unknown) => {
    const key = `${method} ${path}`
    const found = key in routes ? key : method === 'GET' && path in routes ? path : null
    if (found === null) throw new ApiError(`Rota sem simulação: ${key}`, 404)
    const route = routes[found]
    const answer = typeof route === 'function' ? await (route as (call: Call) => unknown)({ path, method, body }) : route
    if (answer instanceof Error) throw answer
    return answer as never
  })
}
/** Chamadas ao `request` com o método e o caminho dados. */
export const callsTo = (method: string, path: string) => vi.mocked(request).mock.calls.filter(([p, m]) => p === path && (m ?? 'GET') === method)
/** Corpo da primeira chamada ao `request` com o método e o caminho. */
export const bodyOf = (method: string, path: string) => callsTo(method, path)[0]?.[2]
/** Corpo da última chamada (quando o teste tenta mais de uma vez). */
export const lastBodyOf = (method: string, path: string) => callsTo(method, path).at(-1)?.[2]

/** Texto visível de um nó: tudo o que está dentro dele, inclusive `<Text>` aninhados e fragmentos. */
const deepText = (node: ReactTestInstance | string): string => (typeof node === 'string' ? node : node.children.map(deepText).join(''))
const insideText = (node: ReactTestInstance): boolean => node.parent !== null && (String(node.parent.type) === 'Text' || insideText(node.parent))
export const textsIn = (node: ReactTestInstance) => node.findAllByType('Text' as never).filter(entry => !insideText(entry)).map(deepText)
export const allText = (tree: ReactTestRenderer) => textsIn(tree.root).join(' | ')
export const pressables = (tree: ReactTestRenderer) => tree.root.findAllByType('Pressable' as never)
export const byId = (tree: ReactTestRenderer, id: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === id)
export const labelled = (tree: ReactTestRenderer, label: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === label)

/** Deixa as promessas encadeadas (leituras em cascata) se resolverem dentro do `act`. */
export async function flush(times = 4) {
  for (let index = 0; index < times; index++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
}
export async function render(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(element) })
  await flush()
  return tree
}

/** Botão (`Pressable`) cujo rótulo é `text` ou cujo texto visível é `text`; o último que casar (o da folha aberta). */
export function findButton(tree: ReactTestRenderer, text: string): ReactTestInstance | undefined {
  return pressables(tree).filter(item => item.props.accessibilityLabel === text || textsIn(item).includes(text)).pop()
}
export async function pressButton(tree: ReactTestRenderer, text: string) {
  const target = findButton(tree, text)
  expect(target, `botão "${text}"`).toBeTruthy()
  await act(async () => { target!.props.onPress() })
  await flush()
}
export const isDisabled = (tree: ReactTestRenderer, text: string) => Boolean(findButton(tree, text)?.props.disabled)
/** Botão cujo rótulo começa com `prefix` (linhas com o nome e o resumo). */
export function findByPrefix(tree: ReactTestRenderer, prefix: string): ReactTestInstance | undefined {
  return pressables(tree).filter(item => typeof item.props.accessibilityLabel === 'string' && item.props.accessibilityLabel.startsWith(prefix)).pop()
}
export async function pressPrefix(tree: ReactTestRenderer, prefix: string) {
  const target = findByPrefix(tree, prefix)
  expect(target, `botão iniciado por "${prefix}"`).toBeTruthy()
  await act(async () => { target!.props.onPress() })
  await flush()
}
export async function typeInto(tree: ReactTestRenderer, label: string, value: string) {
  const input = tree.root.findAllByType('TextInput' as never).find(item => item.props.accessibilityLabel === label)
  expect(input, `campo "${label}"`).toBeTruthy()
  await act(async () => { input!.props.onChangeText(value) })
}
export const hasField = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('TextInput' as never).some(item => item.props.accessibilityLabel === label)

import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { expect, vi } from 'vitest'
import { ApiError, request } from '../../src/api/client'
import type { User } from '../../src/api/client'
import type { EventCard, EventDetail, MyEntry } from '../../src/api/entries'
import type { EventPoster, Receipt, TeamRef } from '../../src/api/events'
import type { Navigation } from '../../src/navigation/useNavigation'

/* Fixtures e auxiliares dos testes do atleta em campeonatos e provas e das notificações (frente X3). */

export const me: User = { id: 1, name: 'Maria Souza', username: 'maria.s', email: 'maria@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
export const team: TeamRef = { id: 3, name: 'Ferrugem FC', initials: 'FF', crest_url: null }
export const page = <T>(items: T[], next: string | null = null) => ({ items, next_cursor: next })

const DAY = 86_400_000
/** Instante ISO a `days` dias de agora. */
export const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString()
export const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString()

export function poster(id = 5, extra: Partial<EventPoster> = {}): EventPoster {
  return {
    id, name: 'Copa Sudoeste', sport: 'futebol', format: 'society', distance_km: null, competition_type: 'todos_contra_todos', capacity: 8, entries_count: 3, confirmed_count: 2,
    starts_at: inDays(10), registration_closes_at: inDays(8), registration_deadline: inDays(8), city: { id: 1, name: 'Brasília', state: 'DF' }, venue: 'Arena Guará',
    price_cents: 24000, accepted_tiers: null, state: 'publicado', phase: 'inscricoes_abertas', revocation_pending: false, ...extra,
  }
}

export function eventCard(id = 5, extra: Partial<EventCard> = {}): EventCard {
  return {
    ...poster(id), organizer_name: 'Liga Sul',
    eligibility: { eligible: true, reason: null, message: null, tier: null, teams: [{ team, tier: 'prata', eligible: true, reason: null, entry_id: null }] },
    my_entry: null, ...extra,
  }
}

export function eventDetail(extra: Partial<EventDetail> = {}): EventDetail {
  return {
    ...eventCard(extra.id ?? 5), course_notes: null, contact: '(61) 99812-4407', organizer: { display_name: 'Liga Sul', person: null },
    pix: { beneficiary: 'Liga Sul', key_type: 'email', key: 'pagamentos@ligasul.com.br', copy_paste: '00020126580014BR.GOV.BCB.PIX0136pagamentos@ligasul.com.br', instructions: 'Use o nome do time na descrição.' },
    registration_open: true, spots_left: 5, tennis_bonus: null, cancelled_at: null, cancel_reason: null, is_organizer: false, can_read_messages: false, ...extra,
  }
}

export function receipt(extra: Partial<Receipt> = {}): Receipt {
  return {
    id: 70, kind: 'pagamento', file_url: '/api/v1/receipts/70/file', file_type: 'imagem', size_bytes: 2048, uploaded_by: null, created_at: '2026-10-11T12:00:00Z',
    decision: null, reason_code: null, reason_detail: null, decided_at: null, participant_response: null, responded_at: null, contest_reason: null,
    auto_confirm_at: null, resolution: null, resolution_reason: null, resolved_at: null, ...extra,
  }
}

export function myEntry(extra: Partial<MyEntry> = {}): MyEntry {
  return {
    id: 9, event: poster(5), subject: { kind: 'time', team, athlete: null }, my_role: 'representante', state: 'reservada', price_cents: 24000, reserved_until: inHours(40),
    created_at: new Date(Date.now() - 3_600_000).toISOString(), confirmed_at: null, expired_at: null, cancelled_at: null, refunded_at: null, latest_payment: null, refund: null,
    can_send_receipt: true, can_cancel: true, can_respond_refund: false, ...extra,
  }
}

/** Navegação simulada: cada chamada fica registrada. */
export const navigationMock = () => ({ go: vi.fn(), back: vi.fn(), setParams: vi.fn(), replace: vi.fn() }) as unknown as Navigation

export type Route = unknown | ((request: { path: string; method: string; body: unknown }) => unknown)
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
    const answer = typeof route === 'function' ? await (route as (call: { path: string; method: string; body: unknown }) => unknown)({ path, method, body }) : route
    if (answer instanceof Error) throw answer
    return answer as never
  })
}
/** Chamadas ao `request` com o método e o caminho dados (corpo opcional). */
export const callsTo = (method: string, path: string) => vi.mocked(request).mock.calls.filter(([p, m]) => p === path && (m ?? 'GET') === method)

/** Texto visível de um nó: tudo o que está dentro dele, inclusive `<Text>` aninhados e fragmentos. */
const deepText = (node: ReactTestInstance | string): string => (typeof node === 'string' ? node : node.children.map(deepText).join(''))
const insideText = (node: ReactTestInstance): boolean => node.parent !== null && (String(node.parent.type) === 'Text' || insideText(node.parent))
/** Texto de cada `<Text>` de fora para dentro (um por bloco de texto, com os trechos em negrito já incluídos). */
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

/** Botão (`Pressable`) cujo texto visível é `text`, ou cujo rótulo é `text`. */
export function findButton(tree: ReactTestRenderer, text: string): ReactTestInstance | undefined {
  return pressables(tree).filter(entry => entry.props.accessibilityLabel === text || textsIn(entry).includes(text)).pop()
}
export async function pressButton(tree: ReactTestRenderer, text: string) {
  const target = findButton(tree, text)
  expect(target, `botão "${text}"`).toBeTruthy()
  await act(async () => { target!.props.onPress() })
  await flush()
}
export const isDisabled = (tree: ReactTestRenderer, text: string) => Boolean(findButton(tree, text)?.props.disabled)

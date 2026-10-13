import type { AdminEvent, RefundDispute } from '../src/api/admin'
import type { EventCard, EventDetail, MyEntry, PublicEntry } from '../src/api/entries'
import type {
  ChecklistItem, EventMessage, EventPoster, OrganizerEntry, OrganizerEventCard, OrganizerEventDetail, Receipt, ReceiptReview,
} from '../src/api/events'
import type { ReceiptsEvent } from '../src/api/receipts'
import { brasilia, person } from './teams-fixtures'

/*
 * Formas da API de eventos para os testes do organizador (0003, seções 13 e 14), do atleta (0002, seção 6.2; 0003, seção
 * 13), dos comprovantes e devoluções e das filas da administração (0003, seções 13 a 16). A cidade é a de `teams-fixtures`.
 * Três fábricas de inscrição, uma por visão: `entry` (comprovantes, A2), `organizerEntry` (lista da gestão, G3) e
 * `myEntry` (cartão do atleta). Dois comprovantes: `receipt` (do organizador e da administração) e `myReceipt` (do atleta).
 */

export { brasilia }

/** Instante ISO local a `days` dias de hoje, na hora indicada. */
export function inDays(days: number, hour = 9): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

export const fullChecklist: ChecklistItem[] = [
  { key: 'nome_modalidade', label: 'Nome e modalidade', done: true, message: null },
  { key: 'formato_tipo', label: 'Formato e tipo', done: true, message: null },
  { key: 'vagas_elos', label: 'Vagas e elos aceitos', done: true, message: null },
  { key: 'datas', label: 'Datas', done: true, message: null },
  { key: 'local', label: 'Local', done: true, message: null },
  { key: 'inscricao', label: 'Inscrição e Pix', done: true, message: null },
]
/** Checklist com datas, local e inscrição pendentes. */
export const partialChecklist: ChecklistItem[] = fullChecklist.map(item => ['datas', 'local', 'inscricao'].includes(item.key)
  ? { ...item, done: false, message: item.key === 'datas' ? 'Informe a data do evento e o fim das inscrições.' : item.key === 'local' ? 'Informe a cidade e o local.' : 'Escolha se a inscrição é gratuita ou paga.' }
  : item)

export function eventCard(overrides: Partial<OrganizerEventCard> = {}): OrganizerEventCard {
  return {
    id: 5, name: 'Copa Sudoeste Society', sport: 'futebol', format: 'society', distance_km: null, competition_type: 'eliminacao_simples',
    capacity: 8, entries_count: 3, confirmed_count: 2, starts_at: inDays(30, 16), registration_closes_at: inDays(25, 20),
    registration_deadline: inDays(25, 20), city: brasilia, venue: 'Arena Sudoeste', price_cents: 24000, accepted_tiers: ['prata', 'ouro'],
    state: 'publicado', phase: 'inscricoes_abertas', revocation_pending: false,
    pending: { receipts: 0, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 0 },
    next_action: { kind: 'acompanhar_inscricoes', count: null, deadline: inDays(25, 20) }, championship: null,
    ...overrides,
  }
}

export function eventDetail(overrides: Partial<OrganizerEventDetail> = {}): OrganizerEventDetail {
  return {
    ...eventCard(),
    course_notes: null, contact: 'copa@example.com',
    pix: { beneficiary: 'Rafa Nunes', key_type: 'email', key: 'copa@example.com', copy_paste: null, instructions: 'Envie em até 48 h.' },
    checklist: [], can_submit: false, refusal: null, submitted_at: null, published_at: inDays(-1), cancelled_at: null, cancel_reason: null,
    revocation_decision: null, entries_by_state: { confirmada: 2, em_analise: 1 },
    editable_fields: ['venue', 'course_notes', 'pix_instructions', 'contact'], tennis_bonus: null,
    ...overrides,
  }
}

/** Rascunho gratuito de tênis, ainda sem datas, local e inscrição. */
export function draftDetail(overrides: Partial<OrganizerEventDetail> = {}): OrganizerEventDetail {
  return eventDetail({
    id: 9, name: 'Desafio Saibro', sport: 'tenis', format: null, competition_type: 'todos_contra_todos', capacity: 8, accepted_tiers: null,
    starts_at: null, registration_closes_at: null, registration_deadline: null, city: null, venue: null, price_cents: null, pix: null, contact: null,
    entries_count: 0, confirmed_count: 0, state: 'rascunho', phase: 'rascunho', published_at: null, entries_by_state: {},
    checklist: partialChecklist, can_submit: false, next_action: { kind: 'completar_rascunho', count: null, deadline: null },
    editable_fields: ['name', 'sport', 'format', 'distance_km', 'competition_type', 'capacity', 'accepted_tiers', 'city_id', 'venue', 'course_notes',
      'starts_at', 'registration_closes_at', 'price_cents', 'pix_beneficiary', 'pix_key_type', 'pix_key', 'pix_copy_paste', 'pix_instructions', 'contact'],
    ...overrides,
  })
}

export function organizerEntry(overrides: Partial<OrganizerEntry> = {}): OrganizerEntry {
  return {
    id: 1, subject: { kind: 'time', team: { id: 3, name: 'Ferrugem FC', initials: 'FE', crest_url: null }, athlete: null },
    state: 'confirmada', price_cents: 24000, reserved_until: null, created_at: inDays(-2), confirmed_at: inDays(-1),
    registered_by: null, latest_payment: null, refund: null,
    ...overrides,
  }
}

export function message(overrides: Partial<EventMessage> = {}): EventMessage {
  return { id: 1, kind: 'aviso', body: 'Retirada do kit no sábado.', author: { id: 1, name: 'Rafa Nunes', username: 'rafa', avatar_url: null }, created_at: inDays(0), ...overrides }
}

/* Atleta: lista E2, detalhe D2 e a inscrição de quem vê. */

export const HOUR = 3_600_000
export const fromNow = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString()
export const ferrugem = { id: 10, name: 'Ferrugem FC', initials: 'FF', crest_url: null }
export const lions = { id: 12, name: 'Leões do Cerrado', initials: 'LC', crest_url: null }
export const pix = {
  beneficiary: 'Rafa Nunes', key_type: 'email' as const, key: 'copa.sudoeste@pix.com',
  copy_paste: '00020126580014BR.GOV.BCB.PIX0136copa.sudoeste@pix.com5204000053039865406240.00', instructions: 'Use o nome do time na descrição.',
}

export function poster(overrides: Partial<EventPoster> = {}): EventPoster {
  return {
    id: 1, name: 'Copa Sudoeste', sport: 'tenis', format: null, distance_km: null, competition_type: 'eliminacao_simples', capacity: 8,
    entries_count: 3, confirmed_count: 2, starts_at: fromNow(24 * 10), registration_closes_at: fromNow(24 * 8), registration_deadline: fromNow(24 * 8),
    city: brasilia, venue: 'Arena Guará', price_cents: 24000, accepted_tiers: null, state: 'publicado', phase: 'inscricoes_abertas',
    revocation_pending: false, ...overrides,
  }
}

export function card(overrides: Partial<EventCard> = {}): EventCard {
  return {
    ...poster(), organizer_name: 'Copa Sudoeste Eventos',
    eligibility: { eligible: true, reason: null, message: null, tier: null, teams: null }, my_entry: null, ...overrides,
  }
}

export function detail(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    ...card(), course_notes: null, contact: '(61) 99999-0000', organizer: { display_name: 'Copa Sudoeste Eventos', person: person(40, 'Rafa Nunes') },
    pix, registration_open: true, spots_left: 5, tennis_bonus: null, cancelled_at: null, cancel_reason: null, is_organizer: false,
    can_read_messages: false, ...overrides,
  }
}

export function myReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: 9, kind: 'pagamento', file_url: '/api/v1/receipts/9/file', file_type: 'pdf', size_bytes: 182_000, uploaded_by: person(1, 'Ricardo Moura'),
    created_at: fromNow(-2), decision: null, reason_code: null, reason_detail: null, decided_at: null, participant_response: null,
    responded_at: null, contest_reason: null, auto_confirm_at: null, resolution: null, resolution_reason: null, resolved_at: null, ...overrides,
  }
}

export function myEntry(overrides: Partial<MyEntry> = {}): MyEntry {
  return {
    id: 5, event: poster(), subject: { kind: 'atleta', team: null, athlete: person(1, 'Ricardo Moura') }, my_role: 'atleta', state: 'reservada',
    price_cents: 24000, reserved_until: fromNow(46), created_at: fromNow(-2), confirmed_at: null, expired_at: null, cancelled_at: null,
    refunded_at: null, latest_payment: null, refund: null, can_send_receipt: true, can_cancel: true, can_respond_refund: false, ...overrides,
  }
}

/** Detalhe com o resumo da inscrição de quem vê. */
export const withEntry = (base: EventDetail, mine: MyEntry): EventDetail =>
  ({ ...base, my_entry: { id: mine.id, state: mine.state, team: mine.subject.team, reserved_until: mine.reserved_until } })

export function confirmedEntry(id: number, name: string, team = false): PublicEntry {
  return {
    id, confirmed_at: fromNow(-24),
    subject: team ? { kind: 'time', team: { id: id + 100, name, initials: name.slice(0, 2).toUpperCase(), crest_url: null }, athlete: null }
      : { kind: 'atleta', team: null, athlete: person(id + 100, name) },
  }
}

/* Comprovantes (A2), devoluções e filas da administração. */

export const organizerPix = { beneficiary: 'Olga Organizadora', key_type: 'email' as const, key: 'copa@pix.com', copy_paste: null, instructions: 'Envie em até 48 h.' }

export function societyPoster(overrides: Partial<EventPoster> = {}): EventPoster {
  return {
    id: 1, name: 'Copa Sudoeste Society', sport: 'futebol', format: 'society', distance_km: null, competition_type: 'eliminacao_simples',
    capacity: 8, entries_count: 2, confirmed_count: 0, starts_at: fromNow(240), registration_closes_at: fromNow(170), registration_deadline: fromNow(170),
    city: brasilia, venue: 'Arena Sudoeste', price_cents: 24000, accepted_tiers: null, state: 'publicado', phase: 'inscricoes_abertas',
    revocation_pending: false, ...overrides,
  }
}

export function receiptsEvent(overrides: Partial<ReceiptsEvent> = {}): ReceiptsEvent {
  return {
    ...societyPoster(), pending: { receipts: 2, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 2 }, pix: organizerPix,
    cancelled_at: null, cancel_reason: null, revocation_decision: null, ...overrides,
  }
}

export function receipt(id: number, overrides: Partial<Receipt> = {}): Receipt {
  return {
    id, kind: 'pagamento', file_url: `/api/v1/receipts/${id}/file`, file_type: 'imagem', size_bytes: 14336, uploaded_by: person(2, 'Bruno Ferrugem'),
    created_at: fromNow(-3), decision: null, reason_code: null, reason_detail: null, decided_at: null, participant_response: null, responded_at: null,
    contest_reason: null, auto_confirm_at: null, resolution: null, resolution_reason: null, resolved_at: null, ...overrides,
  }
}

export function entry(id: number, team: string, overrides: Partial<OrganizerEntry> = {}): OrganizerEntry {
  return {
    id, subject: { kind: 'time', team: { id: 10 + id, name: team, initials: team.slice(0, 2).toUpperCase(), crest_url: null }, athlete: null },
    state: 'em_analise', price_cents: 24000, reserved_until: fromNow(40), created_at: fromNow(-8), confirmed_at: null, registered_by: person(2, 'Bruno Ferrugem'),
    latest_payment: null, refund: null, ...overrides,
  }
}

export const review = (item: Receipt, owner: OrganizerEntry, attempt = 1, previous: Receipt[] = []): ReceiptReview =>
  ({ receipt: item, entry: owner, attempt, previous })

export function adminEvent(overrides: Partial<AdminEvent> = {}): AdminEvent {
  return {
    ...societyPoster({ id: 5, name: 'Torneio Relâmpago Society', state: 'em_aprovacao', phase: 'em_aprovacao', price_cents: 6000 }),
    organizer: { organizer_id: 3, display_name: 'Liga Sudoeste', user: person(4, 'Olga Organizadora'), active: true },
    pix: { ...organizerPix, copy_paste: '000201BR.GOV.BCB.PIX' }, contact: '(61) 99999-0000', course_notes: null, submitted_at: fromNow(-30), published_at: null,
    revocation_decision: null, pending: { receipts: 0, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 0 }, entries_by_state: {},
    ...overrides,
  }
}

export function dispute(overrides: Partial<RefundDispute> = {}): RefundDispute {
  const refund = receipt(301, { kind: 'devolucao', uploaded_by: person(4, 'Olga Organizadora'), participant_response: 'contestada',
    responded_at: fromNow(-2), contest_reason: 'O Pix não chegou na conta do time.' })
  return {
    entry: entry(7, 'Ferrugem FC', { state: 'devolucao_contestada', refund }), event: societyPoster({ state: 'cancelado', phase: 'cancelado' }),
    organizer: person(4, 'Olga Organizadora'), contested_at: fromNow(-2), ...overrides,
  }
}

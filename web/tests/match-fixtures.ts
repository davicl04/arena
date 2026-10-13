import type {
  CourtOut,
  MatchDetail,
  MatchMessageOut,
  MatchPermissions,
  MatchSideOut,
  MatchSlotOut,
  MatchTermsOut,
  TeamRef,
  WalkoverOut,
} from '../src/api/matches'
import type { Person } from '../src/api/client'
import { brasilia, person } from './teams-fixtures'

/*
 * Dados da partida (P2 + C1) dos testes. A partida padrão é um amistoso de society em "combinando", visto pelo
 * representante do Ferrugem (lado A) sem nenhuma proposta; cada teste muda o que precisa. As rotas e os campos
 * seguem docs/decisoes/0002-jogar.md (seções 7.4, 10 e 11).
 */

export const HOUR = 3_600_000
export const fromNow = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString()

export const ferrugemRef: TeamRef = { id: 10, name: 'Ferrugem FC', initials: 'FF', crest_url: null }
export const leoesRef: TeamRef = { id: 20, name: 'Leões do Cerrado', initials: 'LC', crest_url: null }

export const ricardo: Person = person(1, 'Ricardo Moura')
export const caio: Person = person(2, 'Caio Ramos')
export const tiago: Person = person(3, 'Tiago Melo')
export const marcos: Person = person(5, 'Marcos Ribeiro')

export const noPermissions: MatchPermissions = {
  read_chat: false, write_chat: false, propose_terms: false, accept_terms: false, suggest_court: false, confirm_booking: false,
  cancel: false, report_result: false, register_walkover: false, withdraw_walkover: false, contest_walkover: false,
  attendance: false, send_stats: false, manage_slots: false, schedule_match: false, decide_result: false,
}
/** Permissões do representante em "combinando": conversa, propõe, sugere quadra, cancela e ajusta vagas. */
export const arranging: MatchPermissions = {
  ...noPermissions, read_chat: true, write_chat: true, propose_terms: true, suggest_court: true, cancel: true, manage_slots: true,
}
/** Membro do elenco: só conversa. */
export const memberPermissions: MatchPermissions = { ...noPermissions, read_chat: true, write_chat: true }

export const court = (overrides: Partial<CourtOut> = {}): CourtOut => ({
  id: 7, name: 'Arena Sudoeste', address: 'SQSW 304, Bloco B', kind: 'society', city: brasilia, state: 'publicada', provisional: false, ...overrides,
})

export function terms(overrides: Partial<MatchTermsOut> = {}): MatchTermsOut {
  return {
    id: 31, starts_at: fromNow(72), court: court(), booking_side: 'b', super_tiebreak: null, proposed_by: caio, proposed_by_side: 'b', state: 'pendente',
    accepted_a_at: null, accepted_b_at: fromNow(-1), created_at: fromNow(-1), ...overrides,
  }
}

export const sides = (a: Partial<MatchSideOut> = {}, b: Partial<MatchSideOut> = {}): MatchSideOut[] => [
  { side: 'a', kind: 'time', team: ferrugemRef, athlete: null, tier: null, accepted_at: fromNow(-3), is_mine: true, declared_slots: null, ...a },
  { side: 'b', kind: 'time', team: leoesRef, athlete: null, tier: null, accepted_at: fromNow(-2), is_mine: false, declared_slots: null, ...b },
]

export function slot(id: number, overrides: Partial<MatchSlotOut> = {}): MatchSlotOut {
  return { id, side: 'a', position: 'atacante', state: 'aberta', guest: null, filled_at: null, ...overrides }
}

export function walkover(overrides: Partial<WalkoverOut> = {}): WalkoverOut {
  return {
    absent_side: 'b', registered_by: ricardo, registered_at: fromNow(-1), contest_until: fromNow(46), contested_by: null, contested_at: null,
    contest_reason: null, decision: null, decision_reason: null, ...overrides,
  }
}

export function matchDetail(overrides: Partial<MatchDetail> = {}): MatchDetail {
  return {
    id: 1, sport: 'futebol', format: 'society', origin: 'amistoso', state: 'combinando', phase: 'combinando', sides: sides(), my_side: 'a',
    my_role: 'representante', starts_at: null, court: null, result_deadline: null, score: null, needs_my_action: false,
    city: brasilia, event: null, round_number: null, proposal_expires_at: null, terms: { current: null, pending: null }, booking: null,
    super_tiebreak: null, cancel_until: null, slots: [], result: null, walkover: null, cancellation: null, permissions: arranging, ...overrides,
  }
}

/** Partida agendada para daqui a `hours` horas, com condições combinadas e reserva a confirmar. */
export function scheduled(hours = 72, overrides: Partial<MatchDetail> = {}): MatchDetail {
  const startsAt = fromNow(hours)
  const current = terms({ state: 'aceita', starts_at: startsAt, accepted_a_at: fromNow(-2), accepted_b_at: fromNow(-2) })
  return matchDetail({
    state: 'agendada', phase: 'agendada', starts_at: startsAt, court: court(), result_deadline: fromNow(hours + 48), cancel_until: fromNow(hours - 24),
    terms: { current, pending: null }, booking: { side: 'b', state: 'a_confirmar', confirmed_at: null },
    permissions: { ...arranging, cancel: hours > 24 }, ...overrides,
  })
}

export function message(id: number, overrides: Partial<MatchMessageOut> = {}): MatchMessageOut {
  return {
    id, kind: 'texto', event_type: null, body: `Mensagem ${id}`, removed: false, author: caio, side: 'b', author_role: 'membro', is_mine: false,
    payload: null, created_at: fromNow(-0.1), ...overrides,
  }
}
export const mine = (id: number, body: string, overrides: Partial<MatchMessageOut> = {}) =>
  message(id, { body, author: ricardo, side: 'a', author_role: 'representante', is_mine: true, ...overrides })
export const event = (id: number, eventType: MatchMessageOut['event_type'], body: string, overrides: Partial<MatchMessageOut> = {}) =>
  message(id, { kind: 'evento', event_type: eventType, body, author: null, author_role: null, side: null, ...overrides })

export const page = (items: MatchMessageOut[], overrides: { has_more?: boolean; last_id?: number | null } = {}) => ({
  items, has_more: false, last_id: items.length ? items[items.length - 1].id : null, ...overrides,
})

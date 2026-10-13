import type { AdminCourtSuggestion, DisputeMatch, WalkoverDispute } from '../src/api/admin'
import type { CourtOut, MatchSideOut } from '../src/api/matches'
import { brasilia, person } from './teams-fixtures'

/* Dados das filas da administração da etapa 3 (0002-jogar, seções 10.4 e 10.7): quadras sugeridas e W.O. contestados. */

const HOUR = 3600e3
export const fromNow = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString()

export const ricardo = person(1, 'Ricardo Moura')
export const rafa = person(2, 'Rafa Nunes')
export const caio = person(9, 'Caio Ramos')

export function court(overrides: Partial<CourtOut> = {}): CourtOut {
  return { id: 41, name: 'Arena Sul', address: 'SGAS 910, Asa Sul', kind: 'society', city: brasilia, state: 'em_revisao', provisional: true, ...overrides }
}

export function suggestion(overrides: Partial<AdminCourtSuggestion> = {}): AdminCourtSuggestion {
  return {
    court: court(), suggested_by: rafa, origin_match: { id: 12, sport: 'futebol', format: 'society', state: 'combinando', starts_at: '2026-10-20T19:00:00Z' },
    possible_duplicates: [], created_at: fromNow(-3), reviewed_at: null, review_reason: null, duplicate_of: null, ...overrides,
  }
}

export const team = (side: 'a' | 'b', name: string, id: number): MatchSideOut => ({
  side, kind: 'time', team: { id, name, initials: name.slice(0, 2).toUpperCase(), crest_url: null }, athlete: null,
  tier: null, accepted_at: null, is_mine: false,
})
export const ferrugem = team('a', 'Ferrugem FC', 10)
export const tigres = team('b', 'Tigres do Lago', 20)

export function disputeMatch(overrides: Partial<DisputeMatch> = {}): DisputeMatch {
  return {
    id: 12, sport: 'futebol', format: 'society', state: 'agendada', phase: 'wo_contestado', sides: [ferrugem, tigres],
    starts_at: '2026-10-12T19:00:00Z', court: court({ id: 7, name: 'Quadra do Lago', state: 'publicada', provisional: false }), result_deadline: fromNow(30), ...overrides,
  }
}

/** W.O. registrado por Ferrugem FC (compareceu) e contestado por Tigres do Lago (lado ausente). */
export function dispute(overrides: Partial<WalkoverDispute> = {}): WalkoverDispute {
  return {
    match: disputeMatch(),
    walkover: {
      absent_side: 'b', registered_by: rafa, registered_at: fromNow(-5), contest_until: fromNow(30), contested_by: caio,
      contested_at: fromNow(-2), contest_reason: 'Chegamos às 19h, mas o portão estava fechado.', decision: null, decision_reason: null,
    },
    ...overrides,
  }
}

export const chatLine = (id: number, overrides: Record<string, unknown> = {}) => ({
  id, kind: 'texto', event_type: null, body: 'Estamos chegando.', removed: false, author: caio, side: 'b', created_at: fromNow(-6), ...overrides,
})

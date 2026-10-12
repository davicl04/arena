import { vi } from 'vitest'
import type { City, Person, Profile } from '../../src/api/client'
import type { TeamRef } from '../../src/api/events'
import type { MatchSearch, PlayBoard, Proposal, SlotOffer } from '../../src/api/matchmaking'
import type {
  CourtOut, MatchCard, MatchDetail, MatchMessageOut, MatchPermissions, MatchSideOut, MatchSlotOut, MatchTermsOut, WalkoverOut,
} from '../../src/api/matches'
import type { MeStandings } from '../../src/api/play'
import type { PlayBoardState } from '../../src/hooks/usePlayBoard'

/*
 * Dados do Jogar compartilhados pelos testes das frentes (busca, proposta, oferta, partida, chat e condições), no formato
 * do contrato docs/decisoes/0002-jogar.md (seções 7.4, 9, 10 e 11). Datas são relativas a agora, para os cronômetros e os
 * prazos baterem. Também o `playContext`, com os dois campos que o shell entrega a toda tela (`playBoard` e `refreshPlayBoard`).
 */

export const HOUR = 3_600_000
export const fromNow = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString()

export const person = (id: number, name = `Pessoa ${id}`): Person => ({ id, name, username: name.toLowerCase().replace(/\s+/g, '.'), avatar_url: null })
export const brasilia: City = { id: 5300108, name: 'Brasília', state: 'DF' }
export const ricardo = person(1, 'Ricardo Moura')
export const caio = person(2, 'Caio Ramos')
export const tiago = person(3, 'Tiago Melo')
export const marcos = person(5, 'Marcos Ribeiro')

export const ferrugemRef: TeamRef = { id: 10, name: 'Ferrugem FC', initials: 'FF', crest_url: null }
export const leoesRef: TeamRef = { id: 20, name: 'Leões do Cerrado', initials: 'LC', crest_url: null }

// ----- Placa do Jogar e contexto do shell ----------------------------------------------------------------------------

export const emptyBoard = (): PlayBoard => ({ attention: false, searches: [], proposals: [], offers: [], matches: [] })

/** Estado do `usePlayBoard` para as telas: a placa dada (ou ainda não lida) e as funções espiãs. */
export function playBoardState(board: PlayBoard | null = null, overrides: Partial<PlayBoardState> = {}): PlayBoardState {
  return { board, loading: board === null, error: '', reload: vi.fn(async () => board), deferred: [], defer: vi.fn(), ...overrides }
}

/** Os campos do `ScreenContext` que o shell acrescenta à navegação: espalhe nas props das telas testadas. */
export function playContext(board: PlayBoard | null = null) {
  const playBoard = playBoardState(board)
  return { playBoard, refreshPlayBoard: playBoard.reload }
}

export const football: Profile = { id: 1, sport: 'futebol', city_id: brasilia.id, position: 'atacante', looking_for: false, is_public: false, level: null }
export const tennis: Profile = { id: 2, sport: 'tenis', city_id: brasilia.id, position: null, looking_for: false, is_public: false, level: null }

const line = { state: 'sem_jogos' as const, tier: null, played: 0, required: 3, rank_position: null, metric_value: null, faces: [], faces_any_level: true }
const formatLines = (['futsal', 'society', 'campo'] as const).map(format => ({ ...line, format }))
/** `GET /me/standings` sem jogos, com os times dados (o titular representa ou é membro de cada um). */
export function standings(teams: { team: TeamRef; role: 'representante' | 'membro' }[] = [{ team: ferrugemRef, role: 'representante' }]): MeStandings {
  return {
    calc_version: 1,
    futebol: {
      teams: teams.map(({ team, role }) => ({ team, my_role: role, formats: formatLines })),
      individual: (['goleiro', 'defesa', 'meio_campo', 'atacante'] as const).flatMap(position => (['futsal', 'society', 'campo'] as const).map(format => ({ ...line, position, format }))),
    },
    tenis: line,
    corrida: ([3, 5, 10, 21, 42] as const).map(distance_km => ({ ...line, state: 'sem_marca' as const, required: 1, distance_km })),
  }
}

// ----- Lados, quadras e cartões ---------------------------------------------------------------------------------------

export function teamSide(side: 'a' | 'b', team: TeamRef, overrides: Partial<MatchSideOut> = {}): MatchSideOut {
  return { side, kind: 'time', team, athlete: null, tier: null, accepted_at: null, is_mine: false, declared_slots: null, ...overrides }
}
export function athleteSide(side: 'a' | 'b', athlete: Person, overrides: Partial<MatchSideOut> = {}): MatchSideOut {
  return { side, kind: 'atleta', team: null, athlete, tier: null, accepted_at: null, is_mine: false, declared_slots: null, ...overrides }
}
/** Ferrugem FC (lado A, o meu) contra Leões do Cerrado (lado B), com os dois aceites. */
export const sides = (a: Partial<MatchSideOut> = {}, b: Partial<MatchSideOut> = {}): MatchSideOut[] => [
  teamSide('a', ferrugemRef, { accepted_at: fromNow(-3), is_mine: true, ...a }),
  teamSide('b', leoesRef, { accepted_at: fromNow(-2), ...b }),
]

export const court = (overrides: Partial<CourtOut> = {}): CourtOut => ({
  id: 7, name: 'Arena Sudoeste', address: 'SQSW 304, Bloco B', kind: 'society', city: brasilia, state: 'publicada', provisional: false, ...overrides,
})

export function matchCard(overrides: Partial<MatchCard> = {}): MatchCard {
  return {
    id: 50, sport: 'futebol', format: 'society', origin: 'amistoso', state: 'combinando', phase: 'combinando', sides: sides(), my_side: 'a',
    my_role: 'representante', starts_at: null, court: null, result_deadline: null, score: null, needs_my_action: false, ...overrides,
  }
}

// ----- Busca, proposta e oferta ---------------------------------------------------------------------------------------

export function search(overrides: Partial<MatchSearch> = {}): MatchSearch {
  return {
    id: 55, kind: 'time', sport: 'futebol', city: brasilia, format: 'society', position: null, team: ferrugemRef, tier: null,
    open_slots: { goleiro: 1, defesa: 0, meio_campo: 0, atacante: 1 }, state: 'ativa', started_at: fromNow(-0.03),
    expires_at: fromNow(23), match_id: null, slot_id: null, offer_expires_at: null, can_cancel: true, ...overrides,
  }
}

export function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    match_id: 50, sport: 'futebol', format: 'society', city: brasilia, state: 'proposta', expires_at: fromNow(2),
    sides: [teamSide('a', ferrugemRef, { is_mine: true }), teamSide('b', leoesRef, { tier: 'prata' })], my_side: 'a', my_role: 'representante',
    can_respond: true, created_at: fromNow(-0.02), ...overrides,
  }
}

export function slotOffer(overrides: Partial<SlotOffer> = {}): SlotOffer {
  return {
    slot_id: 9, search_id: 70, position: 'atacante', side: 'b', expires_at: fromNow(2),
    match: matchCard({
      id: 60, state: 'agendada', phase: 'agendada', starts_at: fromNow(48), my_side: null, my_role: 'avulso',
      sides: [teamSide('a', ferrugemRef), teamSide('b', leoesRef, { tier: 'ouro' })], court: court({ id: 3 }),
    }),
    ...overrides,
  }
}

/** Placa do Jogar; `attention` padrão acompanha o contrato (busca, proposta, oferta ou partida combinando). */
export function playBoard(overrides: Partial<PlayBoard> = {}): PlayBoard {
  const board = { ...emptyBoard(), ...overrides }
  return { ...board, attention: overrides.attention ?? Boolean(board.searches.length || board.proposals.length || board.offers.length || board.matches.some(card => card.state === 'combinando')) }
}

// ----- Partida (P2 + C1) -------------------------------------------------------------------------------------------

export const noPermissions: MatchPermissions = {
  read_chat: false, write_chat: false, propose_terms: false, accept_terms: false, suggest_court: false, confirm_booking: false,
  cancel: false, report_result: false, register_walkover: false, withdraw_walkover: false, contest_walkover: false,
  attendance: false, send_stats: false, manage_slots: false,
}
/** Permissões do representante em "combinando": conversa, propõe, sugere quadra, cancela e ajusta vagas. */
export const arranging: MatchPermissions = {
  ...noPermissions, read_chat: true, write_chat: true, propose_terms: true, suggest_court: true, cancel: true, manage_slots: true,
}
/** Membro do elenco: só conversa. */
export const memberPermissions: MatchPermissions = { ...noPermissions, read_chat: true, write_chat: true }

export function terms(overrides: Partial<MatchTermsOut> = {}): MatchTermsOut {
  return {
    id: 31, starts_at: fromNow(72), court: court(), booking_side: 'b', super_tiebreak: null, proposed_by: caio, proposed_by_side: 'b', state: 'pendente',
    accepted_a_at: null, accepted_b_at: fromNow(-1), created_at: fromNow(-1), ...overrides,
  }
}

export function slot(id: number, overrides: Partial<MatchSlotOut> = {}): MatchSlotOut {
  return { id, side: 'a', position: 'atacante', state: 'aberta', guest: null, filled_at: null, ...overrides }
}

export function walkover(overrides: Partial<WalkoverOut> = {}): WalkoverOut {
  return {
    absent_side: 'b', registered_by: ricardo, registered_at: fromNow(-1), contest_until: fromNow(46), contested_by: null, contested_at: null,
    contest_reason: null, decision: null, decision_reason: null, ...overrides,
  }
}

/** Amistoso de society em "combinando", visto pelo representante do Ferrugem (lado A) sem nenhuma proposta. */
export function matchDetail(overrides: Partial<MatchDetail> = {}): MatchDetail {
  return {
    ...matchCard({ id: 1 }),
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
export const matchEvent = (id: number, eventType: MatchMessageOut['event_type'], body: string, overrides: Partial<MatchMessageOut> = {}) =>
  message(id, { kind: 'evento', event_type: eventType, body, author: null, author_role: null, side: null, ...overrides })
export const messagePage = (items: MatchMessageOut[], overrides: { has_more?: boolean; last_id?: number | null } = {}) => ({
  items, has_more: false, last_id: items.length ? items[items.length - 1].id : null, ...overrides,
})

import type { Profile, City } from '../src/api/client'
import type { MatchSearch, PlayBoard, Proposal, SlotOffer } from '../src/api/matchmaking'
import type { MatchCard, MatchSideOut } from '../src/api/matches'
import type { TeamRef } from '../src/api/events'
import type { MeStandings } from '../src/api/play'
import { person } from './teams-fixtures'

/*
 * Dados da placa do Jogar (etapa 3): busca, proposta, oferta de vaga e partidas, no formato do contrato
 * docs/decisoes/0002-jogar.md (seções 7.4, 9 e 11.2), e as respostas de `GET /me/standings` e dos perfis que a
 * placa lê junto. Datas são relativas a agora, para os cronômetros baterem.
 */

export const brasilia: City = { id: 5300108, name: 'Brasília', state: 'DF' }
export const leoes: TeamRef = { id: 10, name: 'Leões J1', initials: 'LJ', crest_url: null }
export const tigres: TeamRef = { id: 11, name: 'Tigres J1', initials: 'TJ', crest_url: null }
export const inFuture = (ms: number) => new Date(Date.now() + ms).toISOString()
export const HOUR = 3_600_000

export const football: Profile = { id: 1, sport: 'futebol', city_id: brasilia.id, position: 'atacante', looking_for: false, is_public: false, level: null }
export const tennis: Profile = { id: 2, sport: 'tenis', city_id: brasilia.id, position: null, looking_for: false, is_public: false, level: null }

const line = { state: 'sem_jogos' as const, tier: null, played: 0, required: 3, rank_position: null, metric_value: null, faces: [], faces_any_level: true }
const formatLines = (['futsal', 'society', 'campo'] as const).map(format => ({ ...line, format }))
/** Standings sem jogos, com os times dados (o titular representa ou é membro de cada um). */
export function standings(teams: { team: TeamRef; role: 'representante' | 'membro' }[] = [{ team: leoes, role: 'representante' }]): MeStandings {
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

export function teamSide(side: 'a' | 'b', team: TeamRef, overrides: Partial<MatchSideOut> = {}): MatchSideOut {
  return { side, kind: 'time', team, athlete: null, tier: null, accepted_at: null, is_mine: false, declared_slots: null, ...overrides }
}
export function athleteSide(side: 'a' | 'b', id: number, name: string, overrides: Partial<MatchSideOut> = {}): MatchSideOut {
  return { side, kind: 'atleta', team: null, athlete: person(id, name), tier: null, accepted_at: null, is_mine: false, declared_slots: null, ...overrides }
}

export function search(overrides: Partial<MatchSearch> = {}): MatchSearch {
  return {
    id: 55, kind: 'time', sport: 'futebol', city: brasilia, format: 'society', position: null, team: leoes, tier: null,
    open_slots: { goleiro: 1, defesa: 0, meio_campo: 0, atacante: 1 }, state: 'ativa', started_at: inFuture(-95_000),
    expires_at: inFuture(23 * HOUR), match_id: null, slot_id: null, offer_expires_at: null, can_cancel: true, ...overrides,
  }
}

export function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    match_id: 50, sport: 'futebol', format: 'society', city: brasilia, state: 'proposta', expires_at: inFuture(2 * HOUR - 30_000),
    sides: [teamSide('a', leoes, { is_mine: true }), teamSide('b', tigres, { tier: 'prata' })], my_side: 'a', my_role: 'representante',
    can_respond: true, created_at: inFuture(-60_000), ...overrides,
  }
}

export function matchCard(overrides: Partial<MatchCard> = {}): MatchCard {
  return {
    id: 50, sport: 'futebol', format: 'society', origin: 'amistoso', state: 'combinando', phase: 'combinando',
    sides: [teamSide('a', leoes, { is_mine: true }), teamSide('b', tigres)], my_side: 'a', my_role: 'representante',
    starts_at: null, court: null, result_deadline: null, score: null, needs_my_action: false, ...overrides,
  }
}

export function slotOffer(overrides: Partial<SlotOffer> = {}): SlotOffer {
  const starts = inFuture(48 * HOUR)
  return {
    slot_id: 9, search_id: 70, position: 'atacante', side: 'b', expires_at: inFuture(2 * HOUR - 30_000),
    match: matchCard({
      id: 60, state: 'agendada', phase: 'agendada', starts_at: starts, my_side: null, my_role: 'avulso',
      sides: [teamSide('a', leoes), teamSide('b', tigres, { tier: 'ouro' })],
      court: { id: 3, name: 'Arena Sudoeste', address: null, kind: 'society', city: brasilia, state: 'publicada', provisional: false },
    }),
    ...overrides,
  }
}

export function playBoard(overrides: Partial<PlayBoard> = {}): PlayBoard {
  const board = { attention: false, searches: [], proposals: [], offers: [], matches: [], ...overrides }
  return { ...board, attention: overrides.attention ?? Boolean(board.searches.length || board.proposals.length || board.offers.length || board.matches.some(card => card.state === 'combinando')) }
}

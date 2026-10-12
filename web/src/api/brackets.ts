import { ApiError, request } from './client'
import type { Person, Sport } from './client'
import type { Championship, CompetitionType, TeamRef } from './events'
import type { MatchCard, MatchPhase, MatchState, ScoreOut, Side } from './matches'
import type { TennisSetInput } from './results'
import type { EventState, FootballFormat } from '../data/arena'

/*
 * Cliente do chaveamento, da tabela, da agenda das partidas e da decisão do organizador (docs/decisoes/0003-times-
 * campeonatos.md, seção 21; código em backend/app/routers/brackets.py e schemas/brackets.py). As ações enviam JSON
 * (mesmo `{}`). O conflito de agenda responde `409 { detail, conflict }`: `scheduleConflict` lê o `conflict` do erro.
 */

/** Situação do chaveamento; a mesma do contador `championship.bracket` do cartaz (api/events.ts). */
export type BracketState = Championship['bracket']
export type SlotKind = 'competidor' | 'vencedor' | 'folga'

/** Quem disputa: um time (futebol) ou um atleta (tênis). */
export interface Competitor {
  entry_id: number
  kind: 'time' | 'atleta'
  team: TeamRef | null
  athlete: Person | null
  /** Lugar (0, 1, 2…) no plano do sorteio: o valor das trocas. */
  place: number | null
}

export interface BracketSlot {
  kind: SlotKind
  competitor: Competitor | null
  /** "Folga" ou "Vencedor J1". */
  placeholder: string | null
  /** Número (J) do jogo cujo vencedor chega aqui. */
  from_match: number | null
  /** O competidor está aqui porque o jogo da primeira fase foi folga. */
  advanced_by_bye: boolean
  /** Lugar da primeira fase da eliminação (também para "Folga"). */
  place: number | null
  /** Venceu este jogo. */
  winner: boolean
}

export interface BracketMatch {
  id: number
  state: MatchState
  phase: MatchPhase
  starts_at: string | null
  court_name: string | null
  score: ScoreOut | null
  /** Placar divergente, ou 48 h sem resultado: o organizador decide. */
  awaiting_decision: boolean
}

export interface BracketNode {
  /** 1 a n dentro da fase. */
  position: number
  /** J do jogo; nulo no jogo de folga. */
  number: number | null
  label: string | null
  bye: boolean
  /** [lado a, lado b]. */
  slots: [BracketSlot, BracketSlot]
  /** Nulo antes de confirmar e nas folgas. */
  match: BracketMatch | null
  next: { round: number; position: number; side: Side } | null
}

export interface BracketRound {
  number: number
  /** "Oitavas de final" | "Quartas de final" | "Semifinal" | "Final" | "Rodada 3". */
  name: string
  nodes: BracketNode[]
  /** Todos contra todos com número ímpar: quem folga na rodada. */
  rest: Competitor | null
}

export interface TableRow {
  position: number
  competitor: Competitor
  played: number
  wins: number
  draws: number
  losses: number
  /** Gols (futebol) ou sets (tênis). */
  goals_for: number
  goals_against: number
  goal_difference: number
  /** 3 / 1 / 0. */
  points: number
}

export interface Placement { placement: number; competitor: Competitor; bonus_points: number }

export interface BracketPermissions { can_draw: boolean; can_swap: boolean; can_confirm: boolean; draw_blocker: string | null }

export interface Bracket {
  event_id: number
  event_name: string
  event_state: EventState
  sport: Sport
  format: FootballFormat | null
  kind: CompetitionType
  state: BracketState
  is_organizer: boolean
  /** Lugares da chave (eliminação) ou número de competidores. */
  size: number | null
  /** Folgas da eliminação. */
  byes: number
  /** Só para o organizador e a administração. */
  seed: number | null
  draw_count: number | null
  drawn_at: string | null
  confirmed_at: string | null
  /** A árvore (eliminação) ou as rodadas (todos contra todos). */
  rounds: BracketRound[]
  /** Todos contra todos: a classificação. */
  table: TableRow[] | null
  /** Só com o evento `encerrado`. */
  placements: Placement[] | null
  champion: Competitor | null
  permissions: BracketPermissions
}

/** Linha da lista S1 e resposta do agendamento. */
export interface EventMatchRow {
  card: MatchCard
  /** "J1". */
  label: string
  /** "Quartas de final" | "Rodada 3". */
  stage: string
  round_number: number
  position: number
  /** "Vencedor J1" enquanto o lado não está definido. */
  placeholders: [string | null, string | null]
  /** Evento em andamento, dois lados, antes do início. */
  can_schedule: boolean
  awaiting_decision: boolean
}
export interface EventMatchCounts { total: number; to_schedule: number; waiting: number; scheduled: number; to_decide: number; finished: number }
export interface EventMatchList { items: EventMatchRow[]; counts: EventMatchCounts }

export interface ScheduleInput {
  /** ISO 8601 com fuso, ao minuto. */
  starts_at: string
  /** Uma quadra do catálogo da cidade do evento… */
  court_id?: number | null
  /** …ou uma sugestão (exatamente uma das duas). */
  court_suggestion?: { name: string; address?: string | null } | null
}

export interface ResultDecisionInput {
  /** O placar do jogo. */
  score?: { goals_a: number; goals_b: number } | { sets: TennisSetInput[] } | null
  /** W.O.: o lado que não compareceu (sem `score`). */
  walkover_absent_side?: Side | null
  /** 5 a 500 caracteres. */
  justification: string
}

/** Corpo do 409 de agenda: o jogo que conflita. */
export interface ScheduleConflict {
  kind: 'quadra' | 'time'
  match_id: number
  label: string
  stage: string
  starts_at: string
  court_name: string | null
}

export const JUSTIFICATION_MIN = 5
export const JUSTIFICATION_MAX = 500

// ----- Rotas ----------------------------------------------------------------------------------------------------

/** Árvore ou tabela: o organizador, a administração e os inscritos (antes de confirmar, `sem_chaveamento` aos inscritos). */
export const getBracket = (eventId: number) => request<Bracket>(`/events/${eventId}/bracket`)
export const drawBracket = (eventId: number) => request<Bracket>(`/organizer/events/${eventId}/bracket`, 'POST', {})
/** Troca dois lugares do sorteio (`BracketSlot.place` / `Competitor.place`, 0 a 63). */
export const swapBracket = (eventId: number, a: number, b: number) =>
  request<Bracket>(`/organizer/events/${eventId}/bracket`, 'PATCH', { a, b })
export const confirmBracket = (eventId: number) => request<Bracket>(`/organizer/events/${eventId}/bracket/confirm`, 'POST', {})
export const listEventMatches = (eventId: number) => request<EventMatchList>(`/organizer/events/${eventId}/matches`)
export const scheduleMatch = (matchId: number, input: ScheduleInput) =>
  request<EventMatchRow>(`/organizer/matches/${matchId}/schedule`, 'PUT', input)
/** `201` com o detalhe da partida já encerrada. */
export const decideResult = <T = unknown>(matchId: number, input: ResultDecisionInput) =>
  request<T>(`/organizer/matches/${matchId}/result-decision`, 'POST', input)

/** O jogo que conflita, quando o erro é o `409 { detail, conflict }` da agenda; `null` nos demais erros. */
export function scheduleConflict(error: unknown): ScheduleConflict | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  const value = error.body?.conflict
  if (!value || typeof value !== 'object') return null
  const conflict = value as Partial<ScheduleConflict>
  if ((conflict.kind !== 'quadra' && conflict.kind !== 'time') || typeof conflict.label !== 'string') return null
  return {
    kind: conflict.kind, match_id: Number(conflict.match_id), label: conflict.label,
    stage: typeof conflict.stage === 'string' ? conflict.stage : '', starts_at: typeof conflict.starts_at === 'string' ? conflict.starts_at : '',
    court_name: typeof conflict.court_name === 'string' ? conflict.court_name : null,
  }
}

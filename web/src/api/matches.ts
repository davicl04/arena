import { request } from './client'
import type { City, Person, Position } from './client'
import type { TeamRef } from './events'
import type { FootballFormat, TierKey } from '../data/arena'

/*
 * Cliente da partida e tipos comuns da etapa 3 (docs/decisoes/0002-jogar.md, seções 7.4, 8, 10, 11 e 12.1).
 * Os tipos abaixo são o espelho de `backend/app/schemas/matches.py` e servem às telas de busca e proposta, de
 * partida e de resultado. Ações enviam JSON (mesmo vazio, `{}`); `DELETE` não tem corpo.
 */

export type { TeamRef } from './events'
export type { FootballFormat, TierKey as Tier } from '../data/arena'

// ----- Tipos comuns (7.4) ---------------------------------------------------------------------------------------

export type MatchSport = 'futebol' | 'tenis'
export type Side = 'a' | 'b'
export type MatchState = 'proposta' | 'recusada' | 'expirada' | 'combinando' | 'agendada' | 'realizada' | 'encerrada'
  | 'sem_resultado' | 'cancelada'
export type MatchPhase = 'proposta' | 'recusada' | 'expirada' | 'combinando' | 'agendada' | 'informar_resultado'
  | 'divergente' | 'wo_registrado' | 'wo_contestado' | 'confirmado' | 'encerrada' | 'sem_resultado' | 'cancelada'
export type MatchOrigin = 'amistoso' | 'campeonato'
export type MatchRole = 'representante' | 'membro' | 'atleta' | 'avulso' | 'organizador' | 'administracao'
export type TermsState = 'pendente' | 'aceita' | 'substituida' | 'cancelada'
export type CourtKind = 'futsal' | 'society' | 'campo' | 'tenis'
export type CourtState = 'publicada' | 'em_revisao' | 'rejeitada'
export type SlotState = 'aberta' | 'oferecida' | 'preenchida'
export type ResultSource = 'confirmacao' | 'wo' | 'organizador' | 'administracao'
export type ResultState = 'aguardando' | 'divergente' | 'confirmado' | 'wo_registrado' | 'wo_contestado' | 'sem_resultado'
export type OpenSlots = Record<Position, number>

export interface MatchSideOut {
  side: Side
  kind: 'time' | 'atleta'
  team: TeamRef | null
  athlete: Person | null
  /** Elo do pareamento; nulo em classificação (nunca se atribui elo antes). */
  tier: TierKey | null
  /** Aceite da proposta. */
  accepted_at: string | null
  is_mine: boolean
  /** Vagas para avulsos que o lado declarou na busca, enquanto a partida é proposta ou está sendo combinada (nulo se não declarou). */
  declared_slots: OpenSlots | null
}

export interface TennisSetOut { a: number; b: number; tiebreak: { a: number; b: number } | null; super_tiebreak: boolean }
export interface ScoreOut {
  /** Gols (futebol) ou sets vencidos (tênis) do lado A. */
  a: number
  b: number
  sets: TennisSetOut[] | null
  /** Nulo: empate no futebol. */
  winner: Side | null
}

export interface CourtOut {
  id: number
  name: string
  address: string | null
  kind: CourtKind
  city: City
  state: CourtState
  /** Em revisão: vale só na partida que a sugeriu (selo "Sugestão em revisão"). */
  provisional: boolean
}

/** Linha de listas, placa e cabeçalho. */
export interface MatchCard {
  id: number
  sport: MatchSport
  format: FootballFormat | null
  origin: MatchOrigin
  /** Estado efetivo. */
  state: MatchState
  phase: MatchPhase
  /** [a, b]. */
  sides: MatchSideOut[]
  my_side: Side | null
  my_role: MatchRole
  starts_at: string | null
  court: CourtOut | null
  result_deadline: string | null
  /** Placar final, quando houver. */
  score: ScoreOut | null
  /** Aceitar proposta ou condições, informar placar, enviar estatísticas, contestar W.O. */
  needs_my_action: boolean
}

// ----- Partida (10.1) -------------------------------------------------------------------------------------------

export interface MatchTermsOut {
  id: number
  starts_at: string
  court: CourtOut
  /** "Quem reserva com o local". */
  booking_side: Side
  /** Tênis. */
  super_tiebreak: boolean | null
  proposed_by: Person | null
  /** Nulo: organizador (etapa 4). */
  proposed_by_side: Side | null
  state: TermsState
  /** Selos de aceite. */
  accepted_a_at: string | null
  accepted_b_at: string | null
  created_at: string
}

export interface TermsInput { starts_at: string; court_id: number; booking_side: Side; super_tiebreak?: boolean | null }

export interface WalkoverOut {
  absent_side: Side
  registered_by: Person | null
  registered_at: string
  /** `result_deadline`. */
  contest_until: string
  contested_by: Person | null
  contested_at: string | null
  contest_reason: string | null
  decision: 'mantido' | 'anulado' | null
  decision_reason: string | null
}

export interface MatchPermissions {
  read_chat: boolean
  write_chat: boolean
  propose_terms: boolean
  accept_terms: boolean
  suggest_court: boolean
  confirm_booking: boolean
  cancel: boolean
  report_result: boolean
  register_walkover: boolean
  withdraw_walkover: boolean
  contest_walkover: boolean
  attendance: boolean
  send_stats: boolean
  manage_slots: boolean
}

export interface MatchSlotOut {
  id: number
  side: Side
  position: Position
  /** `oferecida`: reservada para um avulso que ainda vai responder. */
  state: SlotState
  guest: Person | null
  filled_at: string | null
}

/** `score` é nulo no relato do outro lado enquanto o meu não informou o meu (relato cego, contrato 12.3). */
export interface ScoreReport { side: Side; score: ScoreOut | null; reported_by: Person | null; updated_at: string }
export interface MatchResultOut {
  state: ResultState
  deadline: string
  reports: { a: ScoreReport | null; b: ScoreReport | null }
  final: ScoreOut | null
  source: ResultSource | null
  confirmed_at: string | null
  decision_reason: string | null
  /** Do meu lado, confirmado: 3/1/0 (time) ou 10/0 (tênis). */
  points: number | null
}

/** Tela da partida (P2 + C1): cabeçalho, condições fixas e cartão de resultado. */
export interface MatchDetail extends MatchCard {
  city: City
  event: { id: number; name: string } | null
  round_number: number | null
  proposal_expires_at: string | null
  terms: { current: MatchTermsOut | null; pending: MatchTermsOut | null }
  booking: { side: Side; state: 'a_confirmar' | 'confirmada'; confirmed_at: string | null } | null
  super_tiebreak: boolean | null
  /** `starts_at` menos 24 h. */
  cancel_until: string | null
  slots: MatchSlotOut[]
  /** A partir do início. */
  result: MatchResultOut | null
  walkover: WalkoverOut | null
  cancellation: { at: string; by: Person | null; reason: string | null } | null
  permissions: MatchPermissions
}

// ----- Chat (11.1) ----------------------------------------------------------------------------------------------

export type MatchEventType = 'partida_combinando' | 'condicoes_propostas' | 'condicoes_aceitas' | 'partida_agendada'
  | 'reserva_atualizada' | 'vagas_atualizadas' | 'avulso_entrou' | 'avulso_removido' | 'quadra_sugerida'
  | 'partida_cancelada' | 'wo_registrado' | 'wo_retirado' | 'wo_contestado' | 'wo_decidido' | 'placar_enviado'
  | 'resultado_confirmado' | 'resultado_divergente' | 'sem_resultado' | 'presenca_registrada'
  | 'estatisticas_enviadas' | 'estatistica_revisada' | 'estatistica_contestada'

export type MessageAuthorRole = 'representante' | 'membro' | 'atleta' | 'avulso' | 'organizador'
export interface MatchMessageOut {
  id: number
  kind: 'texto' | 'evento'
  event_type: MatchEventType | null
  /** Nulo quando removida pela moderação ("Mensagem removida"). */
  body: string | null
  removed: boolean
  /** Nulo nos eventos; o avatar é nulo com bloqueio. */
  author: Person | null
  /** Lado do autor (lados do C1) ou do evento (brasão da faixa). */
  side: Side | null
  /** Papel atual de quem escreveu: a braçadeira "C" é `representante`. */
  author_role: MessageAuthorRole | null
  is_mine: boolean
  payload: Record<string, unknown> | null
  created_at: string
}
export interface MessagePage { items: MatchMessageOut[]; has_more: boolean; last_id: number | null }

export const MESSAGE_MAX = 1000
/** Intervalo da leitura periódica do chat, em ms (contrato 11.1). */
export const CHAT_POLL_MS = 4000

// ----- Quadras (10.4) -------------------------------------------------------------------------------------------

export interface CourtList { items: CourtOut[] }
export interface CourtSuggestionInput { match_id: number; name: string; address?: string | null; kind?: CourtKind }
export interface CourtSuggestionResult { court: CourtOut; existing: boolean }

// ----- Rotas ----------------------------------------------------------------------------------------------------


export const getMatch = (id: number) => request<MatchDetail>(`/matches/${id}`)
export const proposeTerms = (id: number, input: TermsInput) => request<MatchDetail>(`/matches/${id}/terms`, 'POST', input)
export const acceptTerms = (id: number, termsId: number) => request<MatchDetail>(`/matches/${id}/terms/${termsId}/accept`, 'PUT', {})
export const setBooking = (id: number, confirmed: boolean) => request<MatchDetail>(`/matches/${id}/booking`, 'PUT', { confirmed })
export const cancelMatch = (id: number, reason?: string | null) => {
  const text = reason?.trim()
  return request<MatchDetail>(`/matches/${id}/cancel`, 'POST', { reason: text || null })
}
export const registerWalkover = (id: number) => request<MatchDetail>(`/matches/${id}/walkover`, 'POST', {})
export const withdrawWalkover = (id: number) => request<void>(`/matches/${id}/walkover`, 'DELETE')
export const contestWalkover = (id: number, reason: string) => request<MatchDetail>(`/matches/${id}/walkover/contest`, 'POST', { reason: reason.trim() })

export interface CourtQuery { cityId: number; kind?: CourtKind; q?: string; matchId?: number }
export function listCourts({ cityId, kind, q, matchId }: CourtQuery) {
  const query = new URLSearchParams({ city_id: String(cityId) })
  if (kind) query.set('kind', kind)
  if (q?.trim()) query.set('q', q.trim())
  if (matchId !== undefined) query.set('match_id', String(matchId))
  return request<CourtList>(`/courts?${query}`)
}
export const suggestCourt = (input: CourtSuggestionInput) => request<CourtSuggestionResult>('/courts/suggestions', 'POST', input)

export interface MessageQuery { after?: number; before?: number; limit?: number }
export function getMessages(id: number, { after, before, limit }: MessageQuery = {}) {
  const query = new URLSearchParams()
  if (after !== undefined) query.set('after', String(after))
  if (before !== undefined) query.set('before', String(before))
  if (limit !== undefined) query.set('limit', String(limit))
  const text = query.toString()
  return request<MessagePage>(`/matches/${id}/messages${text ? `?${text}` : ''}`)
}
export const sendMessage = (id: number, body: string) => request<MatchMessageOut>(`/matches/${id}/messages`, 'POST', { body: body.trim() })

/** Vagas para avulsos do meu lado (11.2); a resposta é a partida inteira. */
export const updateSlots = (id: number, openSlots: Partial<OpenSlots>) => request<MatchDetail>(`/matches/${id}/slots`, 'PUT', { open_slots: openSlots })
export const removeGuest = (id: number, userId: number) => request<void>(`/matches/${id}/guests/${userId}`, 'DELETE')

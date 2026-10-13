import { request } from './client'
import type { City, Page, Position, RequestOptions } from './client'
import type { TeamRef } from './events'
import type { FootballFormat, TierKey } from '../data/arena'
import type { MatchCard, MatchRole, MatchSideOut, MatchSport, OpenSlots, Side } from './matches'

/*
 * Contrato: docs/decisoes/0002-jogar.md, seções 7.4 (tipos comuns), 9 (busca, proposta e placa) e 11.2 (ofertas de
 * vaga ao avulso). Espelho de `backend/app/schemas/matches.py`. Os tipos comuns da partida (`MatchCard`,
 * `MatchSideOut`, `ScoreOut`, `CourtOut`...) vêm de `src/api/matches.ts`, que é o dono deles.
 */

export type SearchKind = 'time' | 'tenis' | 'avulso'
export type SearchState = 'ativa' | 'pareada' | 'concluida' | 'cancelada' | 'expirada' | 'recusada' | 'sem_resposta'

export interface MatchSearch {
  id: number
  kind: SearchKind
  sport: MatchSport
  city: City
  /** Time; null no avulso (qualquer formato) e no tênis. */
  format: FootballFormat | null
  /** Avulso; null = qualquer posição. */
  position: Position | null
  team: TeamRef | null
  tier: TierKey | null
  open_slots: OpenSlots | null
  /** Efetivo: uma busca esperando há mais de 24 h aparece `expirada`. */
  state: SearchState
  started_at: string
  expires_at: string
  /** Proposta em curso (pareada) ou partida resultante (concluída). */
  match_id: number | null
  slot_id: number | null
  offer_expires_at: string | null
  /** `ativa` e titular (atleta ou representante). */
  can_cancel: boolean
}

export interface SearchInput {
  sport: MatchSport
  /** Futebol "Com meu time"; ausente = avulso. */
  team_id?: number | null
  /** Obrigatório com `team_id`. */
  format?: FootballFormat | null
  /** "O time está completo?" */
  team_complete?: boolean | null
  open_slots?: Partial<OpenSlots> | null
  /** Avulso; ausente = qualquer posição. */
  position?: Position | null
}

export interface Proposal {
  match_id: number
  sport: MatchSport
  format: FootballFormat | null
  city: City
  /** Efetivo. */
  state: 'proposta' | 'combinando' | 'recusada' | 'expirada'
  expires_at: string
  sides: MatchSideOut[]
  my_side: Side
  my_role: MatchRole
  /** Quem age pelo lado, sem aceite e dentro do prazo. */
  can_respond: boolean
  created_at: string
}

export interface SlotOffer {
  slot_id: number
  search_id: number
  position: Position
  /** Lado que abriu a vaga. */
  side: Side
  expires_at: string
  match: MatchCard
}

export interface SearchCreated { search: MatchSearch; proposal: Proposal | null; offer: SlotOffer | null }

/** Placa do Jogar e ponto menta da navegação. */
export interface PlayBoard {
  /** Busca aberta, proposta ou oferta pendente, ou partida `combinando`. */
  attention: boolean
  searches: MatchSearch[]
  proposals: Proposal[]
  offers: SlotOffer[]
  /** Combinando, agendada e realizada (prazo aberto) do titular; por `starts_at`, sem data primeiro. */
  matches: MatchCard[]
}

/** Detalhe da partida devolvido ao aceitar uma oferta; a tela da partida lê `GET /matches/{id}`. */
export interface AcceptedSlot { id: number }

export const createSearch = (input: SearchInput) => request<SearchCreated>('/matchmaking/searches', 'POST', input)
export const getMySearches = () => request<{ items: MatchSearch[] }>('/me/searches')
export const cancelSearch = (id: number) => request<void>(`/matchmaking/searches/${id}`, 'DELETE')
export const getMyProposals = () => request<{ items: Proposal[] }>('/me/proposals')
export const acceptProposal = (matchId: number) => request<Proposal>(`/matches/${matchId}/accept`, 'PUT', {})
export const declineProposal = (matchId: number) => request<Proposal>(`/matches/${matchId}/decline`, 'PUT', {})
export const getPlayBoard = (options?: RequestOptions) => options ? request<PlayBoard>('/me/play', 'GET', undefined, options) : request<PlayBoard>('/me/play')
export const getMySlotOffers = () => request<{ items: SlotOffer[] }>('/me/slot-offers')
export const acceptSlotOffer = (slotId: number) => request<AcceptedSlot>(`/match-slots/${slotId}/accept`, 'PUT', {})
export const declineSlotOffer = (slotId: number) => request<void>(`/match-slots/${slotId}/decline`, 'PUT', {})
export const MY_MATCHES_HISTORY_PATH = '/me/matches?scope=historico'
export type MatchHistoryPage = Page<MatchCard>

/** Placa com as listas sempre presentes (uma resposta incompleta não quebra a leitura). */
export function normalizeBoard(data: Partial<PlayBoard> | null | undefined): PlayBoard {
  return {
    attention: Boolean(data?.attention),
    searches: data?.searches ?? [],
    proposals: data?.proposals ?? [],
    offers: data?.offers ?? [],
    matches: data?.matches ?? [],
  }
}

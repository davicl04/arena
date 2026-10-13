import { request } from './client'
import type { Position, Sport } from './client'
import type { TierKey } from '../data/arena'

/**
 * Cliente da aba Partidas do perfil (linha do tempo) e das estatísticas do perfil. Contrato: docs/plano-perfil-partidas.md.
 * O titular das estatísticas vem da sessão; a linha do tempo de outra pessoa respeita a visibilidade do servidor (404 sem acesso).
 */

export type TimelineSide = 'a' | 'b'
export type TimelineOutcome = 'vitoria' | 'empate' | 'derrota'
export type TimelineMarkKind = 'primeira_marca' | 'novo_melhor' | 'sem_melhora'

export interface TimelineTeam { id: number; name: string; initials: string; crest_url: string | null }
export interface TimelineAthlete { id: number; name: string; username: string; avatar_url: string | null }
export interface TimelineMatchSide { side: TimelineSide; kind: 'time' | 'atleta'; team: TimelineTeam | null; athlete: TimelineAthlete | null; is_owner: boolean }
export interface TimelineSet { a: number; b: number; tiebreak: { a: number; b: number } | null; super_tiebreak: boolean }
export interface TimelineScore { a: number; b: number; sets: TimelineSet[] | null; winner: TimelineSide | null }
export interface TimelineStats { position: Position | null; goals: number | null; assists: number | null; position_stat: number | null }

export interface TimelineMatch {
  kind: 'partida'
  id: number
  sport: 'futebol' | 'tenis'
  format: 'futsal' | 'society' | 'campo' | null
  origin: 'amistoso' | 'campeonato'
  state: 'realizada' | 'encerrada' | 'sem_resultado' | 'cancelada'
  /** ISO datetime (início da partida). */
  occurred_at: string
  sides: TimelineMatchSide[]
  owner_side: TimelineSide | null
  score: TimelineScore | null
  outcome: TimelineOutcome | null
  walkover_absent_side: TimelineSide | null
  /** Futebol: 3/1/0 (pontos de time); tênis: 10/0; nulo sem resultado. */
  points: number | null
  stats: TimelineStats | null
  event: { id: number; name: string } | null
  round_label: string | null
  /** Sempre nulo quando quem vê não é o titular do perfil. */
  court: { name: string } | null
}

export interface TimelineRun {
  kind: 'corrida'
  id: number
  occurred_at: string
  /** Dia da corrida (AAAA-MM-DD), para exibição. */
  date: string
  distance_m: number
  standard_distance_km: number | null
  duration_s: number
  pace_s_per_km: number
  origin: { source: 'treino' | 'prova'; label: string; event_id: number | null }
  previous_best_s: number | null
  /** Nulo fora das faixas (sem comparação). */
  mark_kind: TimelineMarkKind | null
}

export type TimelineItem = TimelineMatch | TimelineRun
export interface TimelinePage { items: TimelineItem[]; next_cursor: string | null; total: number }

export interface ProfileStats {
  played: number
  wins: number
  draws: number
  losses: number
  /** Percentual de 0 a 100 com uma casa decimal; nulo sem partidas. */
  win_rate: number | null
  best_tier: TierKey | null
  in_placement: boolean
}

/** `GET /users/{id}/timeline`, com o filtro de modalidade opcional (o cursor é anexado por `usePagedList`). */
export const timelinePath = (userId: number, sport?: Sport | null) => `/users/${userId}/timeline${sport ? `?sport=${sport}` : ''}`

export const getProfileStats = () => request<ProfileStats>('/me/profile-stats')

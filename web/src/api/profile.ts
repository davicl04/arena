import { request } from './client'
import type { Position } from './client'
import type { Page } from './client'
import type { TierKey } from '../data/arena'
import type { RunSource } from './runs'
import type { FootballFormat, MatchOrigin, ScoreOut, Side } from './matches'

/*
 * Aba Partidas do perfil e estatísticas do perfil (docs/plano-perfil-partidas.md, partes A2 e A3).
 * `GET /users/{id}/timeline` mistura partidas de futebol e tênis com corridas, da mais recente para a mais antiga.
 */

export type TimelineOutcome = 'vitoria' | 'empate' | 'derrota'
export type TimelineSport = 'futebol' | 'tenis' | 'corrida'

export interface TimelineSide {
  side: Side
  kind: 'time' | 'atleta'
  team: { id: number; name: string; initials: string; crest_url: string | null } | null
  athlete: { id: number; name: string; username: string; avatar_url: string | null } | null
  /** Lado do titular do perfil. */
  is_owner: boolean
}

export interface TimelineMatch {
  kind: 'partida'
  id: number
  sport: 'futebol' | 'tenis'
  format: FootballFormat | null
  origin: MatchOrigin
  state: 'realizada' | 'encerrada' | 'sem_resultado' | 'cancelada'
  occurred_at: string
  sides: TimelineSide[]
  owner_side: Side | null
  score: ScoreOut | null
  outcome: TimelineOutcome | null
  walkover_absent_side: Side | null
  points: number | null
  stats: { position: Position | null; goals: number | null; assists: number | null; position_stat: number | null } | null
  event: { id: number; name: string } | null
  round_label: string | null
  /** Sempre nulo para quem não é o titular. */
  court: { name: string } | null
}

export interface TimelineRun {
  kind: 'corrida'
  id: number
  occurred_at: string
  date: string
  distance_m: number
  standard_distance_km: number | null
  duration_s: number
  pace_s_per_km: number
  origin: { source: RunSource; label: string; event_id: number | null }
  previous_best_s: number | null
  mark_kind: 'primeira_marca' | 'novo_melhor' | 'sem_melhora' | null
}

export type TimelineItem = TimelineMatch | TimelineRun
export type TimelinePage = Page<TimelineItem> & { total: number }

export interface ProfileStats {
  played: number
  wins: number
  draws: number
  losses: number
  /** Percentual de 0 a 100 com uma casa decimal; nulo sem partidas. */
  win_rate: number | null
  best_tier: TierKey | null
  /** Sem `best_tier` e com alguma linha em classificação. */
  in_placement: boolean
}

/** Caminho da linha do tempo (para `usePagedList`, que acrescenta o cursor). */
export const timelinePath = (userId: number, sport?: TimelineSport | null) =>
  `/users/${userId}/timeline${sport ? `?sport=${sport}` : ''}`

export const getProfileStats = () => request<ProfileStats>('/me/profile-stats')

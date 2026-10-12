import { request } from './client'
import type { Position } from './client'
import type { FootballFormat, RunDistance, TierKey } from '../data/arena'

/** Contrato: docs/decisoes/0002-jogar.md, seção 2 (`GET /me/standings`). */

export type StandingState = 'sem_jogos' | 'classificacao' | 'ranqueado' | 'sem_marca'
export interface StandingLine {
  state: StandingState
  /** Só em `ranqueado`. */
  tier: TierKey | null
  /** Partidas confirmadas (corrida: marcas); em classificação, no máximo `required`. */
  played: number
  /** 3 no futebol e no tênis; 1 na corrida. */
  required: number
  rank_position: number | null
  /** Pontos, média ou segundos; null sem jogos ou sem marca. */
  metric_value: number | null
  /** Elos enfrentados, calculados pelo servidor; todos quando `faces_any_level`. */
  faces: TierKey[]
  faces_any_level: boolean
}
/** Linha de time × formato e célula da grade Futsal | Society | Campo da carteirinha (C5); sem `sem_marca`. */
export interface FormatStanding extends Omit<StandingLine, 'state'> {
  state: Exclude<StandingState, 'sem_marca'>
  format: FootballFormat
}
export interface PositionStanding extends StandingLine { position: Position; format: FootballFormat }
export interface RunStanding extends StandingLine { distance_km: RunDistance }

export interface TeamStandings {
  team: { id: number; name: string; initials: string; crest_url: string | null }
  my_role: 'representante' | 'membro'
  formats: FormatStanding[]
}
export interface MeStandings {
  calc_version: number
  futebol: { teams: TeamStandings[]; individual: PositionStanding[] }
  tenis: StandingLine
  corrida: RunStanding[]
}

export const getMyStandings = () => request<MeStandings>('/me/standings')

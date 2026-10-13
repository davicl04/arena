import { request } from './client'
import type { Page } from './client'
import type { StandingState } from './play'
import type { RunDistance, TierKey } from '../data/arena'

/**
 * Cliente da corrida (Jogar, fase 6). Contrato: docs/decisoes/0002-jogar.md, seção 18. As marcas são do titular da
 * sessão: nenhum corpo leva o usuário. Datas (`date`) são `AAAA-MM-DD` (dia de Brasília); instantes, ISO 8601 em UTC.
 */

export type RunSource = 'treino' | 'prova'
export type RunKind = 'primeira_marca' | 'novo_melhor' | 'sem_melhora' | 'fora_do_ranking'
/** Filtro do histórico: uma distância padrão ou `outra` (fora das faixas de ±2%). */
export type RunFilter = `${RunDistance}` | 'outra'

export interface RunInput {
  /** Inteiro, de 1 000 a 100 000. */
  distance_m: number
  duration_s: number
  source: RunSource
  /** Treino: padrão hoje. Prova: o dia da prova (outra data é recusada), então a tela não envia. */
  date?: string | null
  /** Só em `prova`: a inscrição confirmada do titular. */
  entry_id?: number | null
}

/** O que o atleta vê como origem: "Treino" ou o nome da prova. */
export interface RunOrigin { source: RunSource; label: string; event_id: number | null }

/** Linha do histórico e marca salva. */
export interface Run {
  id: number
  distance_m: number
  /** `null`: fora das faixas, só histórico. */
  standard_distance_km: RunDistance | null
  duration_s: number
  pace_s_per_km: number
  date: string
  origin: RunOrigin
  counts_for_ranking: boolean
  created_at: string
}

/** O que a marca faz (prévia) ou fez (salva) com o ranking da distância. */
export interface RunImpact {
  kind: RunKind
  previous_best_s: number | null
  /** `duration_s − previous_best_s`; negativo é mais rápido. */
  delta_s: number | null
  tier_before: TierKey | null
  /** Na prévia é uma estimativa. */
  tier_after: TierKey | null
  tier_up: boolean
}

export interface RunPreview {
  distance_m: number
  duration_s: number
  pace_s_per_km: number
  date: string
  standard_distance_km: RunDistance | null
  origin: RunOrigin
  impact: RunImpact
}

/** Melhor marca da janela de 52 semanas de uma distância. */
export interface RunBestMark {
  id: number
  distance_m: number
  duration_s: number
  pace_s_per_km: number
  date: string
  origin: RunOrigin
}
export interface RunSeriesPoint { id: number; date: string; duration_s: number }

/** Cartão de "Suas marcas" (K4). */
export interface RunBest {
  distance_km: RunDistance
  state: Extract<StandingState, 'sem_marca' | 'ranqueado'>
  /** Nunca atribuído a quem está sem marca. */
  tier: TierKey | null
  rank_position: number | null
  best: RunBestMark | null
  /** Marcas da janela nesta distância. */
  marks: number
  /** Marcas da janela, da mais antiga à mais nova (até 60). */
  series: RunSeriesPoint[]
}

export interface RunCreated { run: Run; impact: RunImpact; best: RunBest | null }

/** Prova em que o atleta pode registrar a marca ("Prova do Arena"). */
export interface RunRace {
  entry_id: number
  event_id: number
  event_name: string
  distance_km: RunDistance
  starts_at: string
  date: string
}

export const previewRun = (input: RunInput) => request<RunPreview>('/me/runs/preview', 'POST', input)
export const createRun = (input: RunInput) => request<RunCreated>('/me/runs', 'POST', input)
export const deleteRun = (id: number) => request<void>(`/me/runs/${id}`, 'DELETE')
export const getRunBests = () => request<{ items: RunBest[] }>('/me/run-bests')
export const getRunRaces = () => request<{ items: RunRace[] }>('/me/run-races')
/** Caminho do histórico paginado; `usePagedList` acrescenta o cursor. */
export const runsPath = (filter: RunFilter, limit = 20) => `/me/runs?distance=${filter}&limit=${limit}`
export type RunsPage = Page<Run>

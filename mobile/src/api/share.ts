import { request } from './client'
import type { TimelineMatchSide, TimelineOutcome, TimelineScore, TimelineSide, TimelineStats } from './profile'
import type { RunSource } from './runs'
import type { RunDistance, TierKey } from '../data/arena'

/**
 * Cliente dos dados do adesivo de resultado (compartilhamento nos Stories). Contrato:
 * docs/decisoes/0007-compartilhamento-stories.md. O titular vem da sessão (Bearer): as rotas ficam sob `/me` e não levam
 * o usuário. Atividade de outra pessoa, inexistente ou não compartilhável responde `404` ("Atividade não encontrada.").
 */

export type ShareRanking = 'futebol_time' | 'futebol_individual' | 'tenis' | `corrida_${RunDistance}`
export type ShareGapUnit = 'rating' | 'media' | 'segundos' | 'posicoes' | 'pontos'

/** Barra do elo: o estado atual da categoria da atividade (seção 5 da decisão). Nunca traz o valor da métrica. */
export interface ShareCategory {
  ranking: ShareRanking
  state: 'classificacao' | 'ranqueado'
  /** Só em `ranqueado`. */
  tier: TierKey | null
  /** Posição no elo (3 em "3º na Prata"); só em `ranqueado`. */
  tier_position: number | null
  tier_size: number | null
  /** Partidas (corrida: marcas) na janela; em classificação, no máximo `required`. */
  played: number
  required: number
  /** De 0 a 1. */
  progress: number
  /** Nulo no Lendário e em classificação. */
  next_tier: TierKey | null
  /** Distância até o próximo elo (> 0); nula no Lendário, no Diamante sem vagas de Lendário e em classificação. */
  gap: { amount: number; unit: ShareGapUnit } | null
}

/** `GET /me/share/matches/{id}`: os números da placa de uma partida do titular, do ponto de vista dele. */
export interface ShareMatch {
  id: number
  sport: 'futebol' | 'tenis'
  format: 'futsal' | 'society' | 'campo' | null
  origin: 'amistoso' | 'campeonato'
  event: { id: number; name: string } | null
  round_label: string | null
  occurred_at: string
  sides: TimelineMatchSide[]
  owner_side: TimelineSide
  score: TimelineScore
  outcome: TimelineOutcome
  /** Só a derrota por W.O. aparece (igual a `owner_side`). */
  walkover_absent_side: TimelineSide | null
  /** 3/1/0 no futebol, 10/0 no tênis. */
  points: number
  /** Estatísticas contadas do titular; nulas no tênis, no W.O. e sem estatística. */
  stats: TimelineStats | null
  category: ShareCategory | null
}

/** `GET /me/share/runs/{id}`: os números da placa de uma corrida do titular. */
export interface ShareRun {
  id: number
  occurred_at: string
  date: string
  distance_m: number
  /** Nula fora das faixas (sem barra do elo). */
  standard_distance_km: RunDistance | null
  duration_s: number
  pace_s_per_km: number
  previous_best_s: number | null
  mark_kind: 'primeira_marca' | 'novo_melhor' | 'sem_melhora' | null
  origin: { source: RunSource; label: string; event_id: number | null }
  category: ShareCategory | null
}

/** A atividade escolhida na linha do tempo, com os dados do adesivo já lidos. */
export type ShareSubject = { kind: 'partida'; data: ShareMatch } | { kind: 'corrida'; data: ShareRun }
/** Qual atividade compartilhar (o item tocado na linha do tempo). */
export interface ShareTarget { kind: 'partida' | 'corrida'; id: number }

export const getShareMatch = (matchId: number) => request<ShareMatch>(`/me/share/matches/${matchId}`)
export const getShareRun = (runId: number) => request<ShareRun>(`/me/share/runs/${runId}`)

/** Uma requisição por abertura da tela: a rota da partida ou a da corrida, conforme o item tocado. */
export async function getShareSubject(target: ShareTarget): Promise<ShareSubject> {
  return target.kind === 'partida'
    ? { kind: 'partida', data: await getShareMatch(target.id) }
    : { kind: 'corrida', data: await getShareRun(target.id) }
}

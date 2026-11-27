import { request } from './client'
import type { FootballFormat, TierKey } from '../data/arena'
import type { MatchOrigin, ScoreOut, Side } from './matches'
import type { TimelineOutcome, TimelineRun, TimelineSide, TimelineMatch } from './profile'
import type { RankingKey } from './results'

/*
 * Dados do adesivo de resultado (Stories): os números da placa de uma atividade do titular e a barra do elo
 * (docs/decisoes/0007-compartilhamento-stories.md, seções 4 e 5). O titular vem da sessão; atividade alheia, inexistente
 * ou não compartilhável responde 404 ("Atividade não encontrada.").
 */

/** Unidade da distância até o próximo elo: a métrica do ranking ou, do Diamante ao Lendário, posições. */
export type ShareGapUnit = 'rating' | 'media' | 'segundos' | 'posicoes' | 'pontos'

/** Barra do elo: o estado atual da categoria da atividade. Nunca traz o valor da métrica. */
export interface ShareCategory {
  ranking: RankingKey
  state: 'classificacao' | 'ranqueado'
  /** Só em `ranqueado`. */
  tier: TierKey | null
  /** Posição no elo ("3º na Prata"); só em `ranqueado`. */
  tier_position: number | null
  tier_size: number | null
  /** Partidas (corrida: marcas) na janela; em classificação, no máximo `required`. */
  played: number
  required: number
  /** De 0 a 1. */
  progress: number
  next_tier: TierKey | null
  /** Nulo no Lendário, no Diamante sem vagas de Lendário e em classificação. */
  gap: { amount: number; unit: ShareGapUnit } | null
}

export interface ShareMatch {
  id: number
  sport: 'futebol' | 'tenis'
  format: FootballFormat | null
  origin: MatchOrigin
  event: { id: number; name: string } | null
  round_label: string | null
  occurred_at: string
  sides: TimelineSide[]
  owner_side: Side
  score: ScoreOut
  outcome: TimelineOutcome
  /** Só a derrota por W.O. (igual a `owner_side`). */
  walkover_absent_side: Side | null
  /** 3/1/0 no futebol, 10/0 no tênis. */
  points: number
  stats: TimelineMatch['stats']
  category: ShareCategory | null
}

export interface ShareRun {
  id: number
  occurred_at: string
  date: string
  distance_m: number
  standard_distance_km: 3 | 5 | 10 | 21 | 42 | null
  duration_s: number
  pace_s_per_km: number
  previous_best_s: number | null
  mark_kind: TimelineRun['mark_kind']
  origin: TimelineRun['origin']
  /** Nulo fora das distâncias padrão (sem barra). */
  category: ShareCategory | null
}

/** Atividade a compartilhar, a partir do item da linha do tempo. */
export interface ShareTarget { kind: 'partida' | 'corrida'; id: number }

/** Resposta da rota da atividade, marcada pelo tipo. */
export type ShareData = { kind: 'partida'; match: ShareMatch } | { kind: 'corrida'; run: ShareRun }

export const getShareMatch = (matchId: number) => request<ShareMatch>(`/me/share/matches/${matchId}`)
export const getShareRun = (runId: number) => request<ShareRun>(`/me/share/runs/${runId}`)

/** Uma requisição por abertura da tela de compartilhar. */
export async function getShareData(target: ShareTarget): Promise<ShareData> {
  return target.kind === 'partida'
    ? { kind: 'partida', match: await getShareMatch(target.id) }
    : { kind: 'corrida', run: await getShareRun(target.id) }
}

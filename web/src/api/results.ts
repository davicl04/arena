import { request } from './client'
import type { Person, Position, Sport } from './client'
import type { StandingLine } from './play'
import type { MatchDetail, Side, TeamRef } from './matches'
import type { FootballFormat, TierKey } from '../data/arena'

/*
 * Cliente de resultado, presença, estatísticas, contestação e Ranking (docs/decisoes/0002-jogar.md, seção 12;
 * tipos comuns da partida na 7.4 e na 10.1). Ações enviam JSON; as leituras seguem o `request` do app.
 *
 * Os tipos da partida (`MatchSideOut`, `ScoreOut`, `MatchResultOut`, `WalkoverOut`, `MatchPermissions`...) vêm de
 * `src/api/matches.ts`, que é o dono deles. `ResultMatch` é o recorte do `MatchDetail` que o cartão de resultado
 * lê: o detalhe completo é aceito como está.
 */

export type StatState = 'enviada' | 'revisada' | 'contestada'
export type StatField = 'gols' | 'assistencias' | 'estatistica_posicao'

/** O que o cartão de resultado lê do detalhe da partida (`MatchDetail`, seção 10.1). */
export type ResultMatch = Pick<MatchDetail, 'id' | 'sport' | 'format' | 'origin' | 'state' | 'phase' | 'sides' | 'my_side' | 'my_role'
  | 'starts_at' | 'result_deadline' | 'super_tiebreak' | 'result' | 'walkover' | 'permissions'>

// ----- Entradas ----------------------------------------------------------------------------------------------

export interface TennisSetInput { a: number; b: number; tiebreak?: { a: number; b: number } | null }
/** Futebol: gols de 0 a 99. Tênis: sets (com super tie-break, o 3º "set" são os pontos). Lados A e B da partida. */
export type ResultInput = { goals_a: number; goals_b: number } | { sets: TennisSetInput[] }
export interface AttendanceItem { user_id: number; present: boolean; position?: Position | null }
export interface MyStatsInput { position: Position; goals?: number | null; assists?: number | null; position_stat?: number | null }
export interface StatReviewInput { position?: Position; goals?: number | null; assists?: number | null; position_stat?: number | null }
export interface StatContestInput { fields: StatField[]; reason: string }

// ----- Estatísticas e elenco (seção 12.1) --------------------------------------------------------------------

export interface PointsPreview {
  presence: number
  result: number | null
  goals: number
  assists: number
  position_stat: number
  total: number
  /** Itens que já pontuam (revisados). */
  counted: StatField[]
  /** Placar confirmado e prazo encerrado. */
  final: boolean
}
export interface FootballStat {
  id: number
  goals: number | null
  assists: number | null
  position_stat: number | null
  state: StatState
  submitted_at: string
  reviewed_at: string | null
  reviewed_by: Person | null
  contested_at: string | null
  contested_by: Person | null
  contest_reason: string | null
  contested_fields: StatField[] | null
}
export interface Lineup {
  user: Person
  side: Side
  /** Selo "Avulso". */
  guest: boolean
  position: Position | null
  present: boolean | null
  stat: FootballStat | null
  points: PointsPreview | null
  /** Representante do lado do atleta. */
  can_review: boolean
  /** Representante do outro lado, uma vez e no prazo. */
  can_contest: boolean
}
export interface MyStatsResult { lineup: Lineup; preview: PointsPreview }

// ----- Rotas -------------------------------------------------------------------------------------------------

/** `T` é o detalhe completo da partida da tela que usa o cartão (`MatchDetail`); a resposta tem essa forma. */
export const reportResult = <T = ResultMatch>(matchId: number, input: ResultInput) =>
  request<T>(`/matches/${matchId}/result`, 'PUT', input)
export const putAttendance = (matchId: number, athletes: AttendanceItem[]) =>
  request<{ items: Lineup[] }>(`/matches/${matchId}/attendance`, 'PUT', { athletes })
export const getStats = (matchId: number) => request<{ items: Lineup[] }>(`/matches/${matchId}/stats`)
export const putMyStats = (matchId: number, input: MyStatsInput) =>
  request<MyStatsResult>(`/matches/${matchId}/my-stats`, 'PUT', input)
export const reviewStat = (matchId: number, statId: number, input: StatReviewInput) =>
  request<Lineup>(`/matches/${matchId}/stats/${statId}/review`, 'PUT', input)
export const contestStat = (matchId: number, statId: number, input: StatContestInput) =>
  request<Lineup>(`/matches/${matchId}/stats/${statId}/contest`, 'POST', input)

// ----- Ranking (seção 12.6) ----------------------------------------------------------------------------------

export type RankingKey = 'futebol_time' | 'futebol_individual' | 'tenis' | 'corrida_3' | 'corrida_5' | 'corrida_10'
  | 'corrida_21' | 'corrida_42'
/** Resultado de uma partida na forma recente: vitória, empate ou derrota (o tênis não tem empate). */
export type FormResult = 'V' | 'E' | 'D'
/** Classificados por elo na categoria (`tier_counts`). */
export type TierCounts = Record<TierKey, number>
export interface RankingRow {
  /** Posição geral: continua na API (paginação), mas a tela não a mostra. */
  rank_position: number
  /** Posição dentro do elo (1 = melhor do elo). */
  tier_position: number
  /** Só classificados aparecem na lista. */
  tier: TierKey
  /** Pontos (time, tênis) ou média por partida (individual). */
  metric_value: number
  matches_played: number
  wins: number
  draws: number
  losses: number
  /** Time: gols; tênis: sets; individual: nulo. */
  goals_for: number | null
  goals_against: number | null
  /** Últimos resultados, do mais antigo ao mais recente (até 5); nulo na corrida. */
  form: FormResult[] | null
  /** Corrida: dia (AAAA-MM-DD) da melhor marca; nulo nos demais rankings. */
  best_mark_on: string | null
  team: TeamRef | null
  athlete: Person | null
  is_mine: boolean
}
/** Linha do titular (ou de cada time ativo dele) no ranking, mesmo em classificação. */
export type MyRankingLine = StandingLine & {
  team: TeamRef | null
  /** Posição e tamanho do elo; nulos sem elo. */
  tier_position: number | null
  tier_size: number | null
  /** Distância até o 1º do elo (pontos, média ou segundos); nula quando lidera ou sem elo. */
  leader_gap: number | null
  /** Vantagem sobre o próximo do elo e a posição dele; nulas quando é o último ou sem elo. */
  next_gap: number | null
  next_tier_position: number | null
}
/** Time ou atleta mostrado sem métrica (prévia dos Lendários). */
export type RankingSubject = Pick<RankingRow, 'team' | 'athlete'>
export interface RankingPage {
  ranking: RankingKey
  format: FootballFormat | null
  position: Position | null
  distance_km: number | null
  calc_version: number
  classified_count: number
  /** ⌊classificados × 15%⌋ */
  legend_slots: number
  /** Partidas para classificar. */
  required: number
  tier_counts: TierCounts
  items: RankingRow[]
  next_cursor: string | null
  mine: MyRankingLine[]
}
/** `GET /rankings/overview`: a categoria, as linhas do titular, a janela no elo dele e a prévia do Salão. */
export interface RankingOverview {
  ranking: RankingKey
  format: FootballFormat | null
  position: Position | null
  distance_km: number | null
  calc_version: number
  required: number
  classified_count: number
  legend_slots: number
  tier_counts: TierCounts
  mine: MyRankingLine[]
  /** Time da linha selecionada (representante, depois o mais antigo, ou o pedido); nulo fora do ranking de times. */
  selected_team_id: number | null
  /** Linhas do elo da linha selecionada, de `tier_position − 3` a `tier_position + 3`; nulo sem elo. */
  window: RankingRow[] | null
  /** Até 4 Lendários, em ordem. */
  legends_preview: RankingSubject[]
}
/** Categoria do ranking (sem paginação nem elo). */
export interface RankingCategoryQuery {
  sport: Sport
  /** Obrigatório no futebol. */
  kind?: 'time' | 'individual'
  format?: FootballFormat
  position?: Position
  distance_km?: number
}
export interface RankingQuery extends RankingCategoryQuery {
  /** Só os classificados do elo (a posição e o cursor continuam sendo os gerais). */
  tier?: TierKey
  cursor?: string | null
  limit?: number
}

function categoryParams({ sport, kind, format, position, distance_km }: RankingCategoryQuery): URLSearchParams {
  const params = new URLSearchParams({ sport })
  if (kind) params.set('kind', kind)
  if (format) params.set('format', format)
  if (position) params.set('position', position)
  if (distance_km) params.set('distance_km', String(distance_km))
  return params
}

/** Caminho de `GET /rankings` com os parâmetros presentes (a ordem é fixa, para o cache e os testes). */
export function rankingPath({ tier, cursor, limit, ...category }: RankingQuery): string {
  const params = categoryParams(category)
  if (tier) params.set('tier', tier)
  if (limit) params.set('limit', String(limit))
  if (cursor) params.set('cursor', cursor)
  return `/rankings?${params.toString()}`
}
export const getRankings = (query: RankingQuery) => request<RankingPage>(rankingPath(query))

/** Caminho de `GET /rankings/overview`: a categoria e, no ranking de times, o time escolhido (`team_id`). */
export function rankingOverviewPath(category: RankingCategoryQuery, teamId?: number | null): string {
  const params = categoryParams(category)
  if (teamId) params.set('team_id', String(teamId))
  return `/rankings/overview?${params.toString()}`
}
export const getRankingOverview = (category: RankingCategoryQuery, teamId?: number | null) =>
  request<RankingOverview>(rankingOverviewPath(category, teamId))

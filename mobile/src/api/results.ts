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
/** Quantos classificados há em cada elo da categoria. */
export type TierCounts = Record<TierKey, number>
export interface RankingRow {
  /** Posição geral: continua na API (paginação), mas a tela não a mostra. */
  rank_position: number
  /** Só classificados aparecem na lista. */
  tier: TierKey
  /** Posição dentro do elo (1 é o primeiro de cada elo). */
  tier_position: number
  /** Pontos (time, tênis) ou média por partida (individual); na corrida, o melhor tempo em segundos. */
  metric_value: number
  matches_played: number
  wins: number
  draws: number
  losses: number
  /** Time: gols; tênis: sets; individual: nulo. */
  goals_for: number | null
  goals_against: number | null
  /** Até os 5 últimos resultados, do mais antigo ao mais recente; nulo na corrida e vazio antes do recálculo. */
  form: FormResult[] | null
  /** Corrida: dia (`YYYY-MM-DD`) do melhor tempo; nulo nas demais. */
  best_mark_on: string | null
  team: TeamRef | null
  athlete: Person | null
  is_mine: boolean
}
/** Time ou atleta de um ranking (a prévia do Salão dos Lendários). */
export interface RankingSubject { team: TeamRef | null; athlete: Person | null }
/** Linha do titular (ou de cada time ativo dele) no ranking, mesmo em classificação. */
export type MyRankingLine = StandingLine & { team: TeamRef | null }
/** Linha do titular no overview: a posição no elo e as diferenças (pontos, média ou segundos) para o 1º e para o próximo. */
export interface MyRankingOverviewLine extends MyRankingLine {
  tier_position: number | null
  tier_size: number | null
  /** Distância para o 1º do elo; nulo quando lidera. */
  leader_gap: number | null
  /** Vantagem sobre o próximo do elo; nulo quando é o último. */
  next_gap: number | null
  next_tier_position: number | null
}
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
/** `GET /rankings/overview`: a leitura da tela Ranking numa categoria (placa, janela do elo e prévia do Salão). */
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
  mine: MyRankingOverviewLine[]
  /** O time pedido ou, sem `team_id`, o primeiro de `mine`; nulo fora do ranking de times. */
  selected_team_id: number | null
  /** Linhas do elo da linha selecionada, de `tier_position − 3` a `tier_position + 3`; nulo sem elo. */
  window: RankingRow[] | null
  /** Até 4 Lendários, para a entrada do Salão. */
  legends_preview: RankingSubject[]
}
/** Categoria de um ranking, sem paginação nem elo. */
export interface RankingCategory {
  sport: Sport
  /** Obrigatório no futebol. */
  kind?: 'time' | 'individual'
  format?: FootballFormat
  position?: Position
  distance_km?: number
}
export interface RankingQuery extends RankingCategory {
  /** Só os classificados deste elo (as posições são do elo). */
  tier?: TierKey
  cursor?: string | null
  limit?: number
}

/** Parâmetros da categoria, na ordem fixa (para o cache e os testes). */
function categoryParams({ sport, kind, format, position, distance_km }: RankingCategory): URLSearchParams {
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

/** Caminho de `GET /rankings/overview`; `teamId` escolhe o time do titular (só no ranking de times). */
export function rankingOverviewPath(category: RankingCategory, teamId?: number | null): string {
  const params = categoryParams(category)
  if (teamId) params.set('team_id', String(teamId))
  return `/rankings/overview?${params.toString()}`
}
export const getRankingOverview = (category: RankingCategory, teamId?: number | null) =>
  request<RankingOverview>(rankingOverviewPath(category, teamId))

import type { FootballStat, Lineup, MyRankingLine, PointsPreview, RankingOverview, RankingPage, RankingRow, ResultMatch, TierCounts } from '../src/api/results'
import type { MatchPermissions, MatchResultOut, MatchSideOut, ScoreOut, ScoreReport, Side, TeamRef, WalkoverOut } from '../src/api/matches'
import { person } from './teams-fixtures'

/*
 * Dados do cartão de resultado e do Ranking (docs/decisoes/0002-jogar.md, seções 10.1 e 12). Uma partida de futebol do
 * Leões do Cerrado (lado A, quem vê é o representante Caio) contra o Ferrugem FC (lado B), depois do horário e dentro das
 * 48 h; `tennis` é a de Ana contra Beatriz. Os prazos são relativos a agora.
 */
export const leoes: TeamRef = { id: 1, name: 'Leões do Cerrado', initials: 'LC', crest_url: null }
export const ferrugem: TeamRef = { id: 2, name: 'Ferrugem FC', initials: 'FF', crest_url: null }
export const caio = person(11, 'Caio Ramos')
export const tiago = person(12, 'Tiago Melo')
export const rafa = person(21, 'Rafa Nunes')
export const ana = person(31, 'Ana Souza')
export const beatriz = person(32, 'Beatriz Lima')

export const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString()

export const permissions = (overrides: Partial<MatchPermissions> = {}): MatchPermissions => ({
  read_chat: true, write_chat: true, propose_terms: false, accept_terms: false, suggest_court: false, confirm_booking: false,
  cancel: false, report_result: false, register_walkover: false, withdraw_walkover: false, contest_walkover: false,
  attendance: false, send_stats: false, manage_slots: false, schedule_match: false, decide_result: false, ...overrides,
})
/** Quem age pelo lado (representante ou tenista): informa o placar, registra a presença e envia estatísticas. */
export const acting = (overrides: Partial<MatchPermissions> = {}) =>
  permissions({ report_result: true, attendance: true, send_stats: true, ...overrides })

const teamSide = (side: Side, team: TeamRef, mine: boolean): MatchSideOut =>
  ({ side, kind: 'time', team, athlete: null, tier: null, accepted_at: '2026-10-10T12:00:00Z', is_mine: mine, declared_slots: null })
const athleteSide = (side: Side, athlete: ReturnType<typeof person>, mine: boolean): MatchSideOut =>
  ({ side, kind: 'atleta', team: null, athlete, tier: null, accepted_at: '2026-10-10T12:00:00Z', is_mine: mine, declared_slots: null })

export const score = (a: number, b: number, extra: Partial<ScoreOut> = {}): ScoreOut =>
  ({ a, b, sets: null, winner: a === b ? null : a > b ? 'a' : 'b', ...extra })
export const report = (side: Side, a: number, b: number, extra: Partial<ScoreOut> = {}): ScoreReport =>
  ({ side, score: score(a, b, extra), reported_by: side === 'a' ? caio : rafa, updated_at: '2026-10-12T15:00:00Z' })

/** Relato cego (contrato 12.3): o outro lado já informou, mas o placar dele só aparece depois que o meu lado informa o meu. */
export const hiddenReport = (side: Side): ScoreReport => ({ ...report(side, 0, 0), score: null })

export const result = (overrides: Partial<MatchResultOut> = {}): MatchResultOut => ({
  state: 'aguardando', deadline: inHours(40), reports: { a: null, b: null }, final: null, source: null, confirmed_at: null,
  decision_reason: null, points: null, ...overrides,
})

export function football(overrides: Partial<ResultMatch> = {}): ResultMatch {
  return {
    id: 7, sport: 'futebol', format: 'society', origin: 'amistoso', state: 'agendada', phase: 'informar_resultado',
    sides: [teamSide('a', leoes, true), teamSide('b', ferrugem, false)], my_side: 'a', my_role: 'representante',
    starts_at: inHours(-2), result_deadline: inHours(46), super_tiebreak: null, result: result(), walkover: null,
    permissions: acting(), ...overrides,
  }
}

export function tennis(overrides: Partial<ResultMatch> = {}): ResultMatch {
  return {
    ...football(), id: 8, sport: 'tenis', format: null, sides: [athleteSide('a', ana, true), athleteSide('b', beatriz, false)],
    my_role: 'atleta', super_tiebreak: false, permissions: acting({ attendance: false, send_stats: false }), ...overrides,
  }
}

/** O mesmo jogo visto pelo outro lado (Ferrugem, lado B). */
export const asFerrugem = (overrides: Partial<ResultMatch> = {}): ResultMatch =>
  football({ my_side: 'b', sides: [teamSide('a', leoes, false), teamSide('b', ferrugem, true)], ...overrides })

export const confirmed = (a: number, b: number, points: number | null = 3, extra: Partial<MatchResultOut> = {}) =>
  result({ state: 'confirmado', final: score(a, b), source: 'confirmacao', confirmed_at: '2026-10-12T16:00:00Z', points, ...extra })

export const walkover = (overrides: Partial<WalkoverOut> = {}): WalkoverOut => ({
  absent_side: 'b', registered_by: caio, registered_at: '2026-10-12T15:00:00Z', contest_until: inHours(40), contested_by: null,
  contested_at: null, contest_reason: null, decision: null, decision_reason: null, ...overrides,
})

export const preview = (overrides: Partial<PointsPreview> = {}): PointsPreview => ({
  presence: 1, result: 3, goals: 2, assists: 1, position_stat: 2, total: 9, counted: [], final: false, ...overrides,
})
export const stat = (overrides: Partial<FootballStat> = {}): FootballStat => ({
  id: 70, goals: 2, assists: 1, position_stat: 4, state: 'enviada', submitted_at: '2026-10-12T15:30:00Z', reviewed_at: null,
  reviewed_by: null, contested_at: null, contested_by: null, contest_reason: null, contested_fields: null, ...overrides,
})
export const lineup = (user: ReturnType<typeof person>, overrides: Partial<Lineup> = {}): Lineup => ({
  user, side: 'a', guest: false, position: 'atacante', present: null, stat: null, points: null, can_review: false, can_contest: false,
  ...overrides,
})

// ----- Ranking -----------------------------------------------------------------------------------------------

export const tierCounts = (overrides: Partial<TierCounts> = {}): TierCounts =>
  ({ bronze: 0, prata: 0, ouro: 0, diamante: 0, lendario: 0, ...overrides })

/** Linha do ranking; a posição no elo (`tier_position`) acompanha a posição geral, salvo se informada. */
export const rankingRow = (position: number, name: string, overrides: Partial<RankingRow> = {}): RankingRow => ({
  rank_position: position, tier_position: position, tier: 'ouro', metric_value: 40 - position, matches_played: 8, wins: 5, draws: 1, losses: 2,
  goals_for: 20, goals_against: 12, form: ['V', 'V', 'E', 'D', 'V'], best_mark_on: null,
  team: { id: 100 + position, name, initials: name.slice(0, 2).toUpperCase(), crest_url: null },
  athlete: null, is_mine: false, ...overrides,
})
export const athleteRow = (position: number, id: number, name: string, overrides: Partial<RankingRow> = {}): RankingRow =>
  rankingRow(position, name, { team: null, athlete: person(id, name), goals_for: null, goals_against: null, ...overrides })

export const rankingPage = (overrides: Partial<RankingPage> = {}): RankingPage => ({
  ranking: 'futebol_time', format: 'society', position: null, distance_km: null, calc_version: 1, classified_count: 3, legend_slots: 0,
  required: 3, tier_counts: tierCounts({ ouro: 3 }), items: [], next_cursor: null, mine: [], ...overrides,
})

/** Linha do titular no ranking: Leões do Cerrado, 6º de 12 no Diamante (7 atrás do 1º, 1 à frente do 7º). */
export const myLine = (overrides: Partial<MyRankingLine> = {}): MyRankingLine => ({
  state: 'ranqueado', tier: 'diamante', played: 8, required: 3, rank_position: 6, metric_value: 94, faces: ['ouro', 'diamante'], faces_any_level: false,
  team: leoes, tier_position: 6, tier_size: 12, leader_gap: 7, next_gap: 1, next_tier_position: 7, ...overrides,
})
/** Titular sem elo (classificação, sem jogos ou sem marca). */
export const unrankedLine = (overrides: Partial<MyRankingLine> = {}): MyRankingLine => myLine({
  state: 'classificacao', tier: null, played: 2, rank_position: null, metric_value: 6, faces: [], tier_position: null, tier_size: null,
  leader_gap: null, next_gap: null, next_tier_position: null, ...overrides,
})

export const rankingOverview = (overrides: Partial<RankingOverview> = {}): RankingOverview => ({
  ranking: 'futebol_time', format: 'society', position: null, distance_km: null, calc_version: 1, required: 3, classified_count: 18,
  legend_slots: 2, tier_counts: tierCounts({ bronze: 3, ouro: 2, diamante: 12, lendario: 1 }), mine: [myLine()], selected_team_id: leoes.id,
  window: [], legends_preview: [], ...overrides,
})

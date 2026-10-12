import type { Position } from '../../api/client'
import type { Lineup, ResultMatch, StatField } from '../../api/results'
import type { ScoreOut, Side } from '../../api/matches'
import { sideName, sideOf } from '../../data/match'
/*
 * Nomes, placares e rótulos do cartão de resultado. Os placares da API são sempre do ponto de vista da partida
 * (lado A × lado B); quem vê com lado próprio os lê "meu lado × adversário", como nos protótipos (R4 e S1).
 */

export const otherSide = (side: Side): Side => (side === 'a' ? 'b' : 'a')

/** Lado do ponto de vista de quem vê: o próprio lado, ou o lado A quando a pessoa não joga a partida. */
export const viewSide = (match: Pick<ResultMatch, 'my_side'>): Side => match.my_side ?? 'a'

/** Texto de leitor de tela de um placar: "Ferrugem FC 3, Leões 1" (futebol) ou os sets (tênis). */
export function scoreSpoken(match: Pick<ResultMatch, 'sides' | 'my_side' | 'sport'>, score: ScoreOut): string {
  const mine = viewSide(match)
  const names = [sideName(sideOf(match, mine), 'Seu lado'), sideName(sideOf(match, otherSide(mine)))]
  const [first, second] = mine === 'a' ? [score.a, score.b] : [score.b, score.a]
  return match.sport === 'futebol' ? `${names[0]} ${first}, ${names[1]} ${second}` : `${names[0]} ${first} sets, ${names[1]} ${second}`
}

/** "3 × 1" (futebol) ou "6-4 3-6 7-6(5)" (tênis), do ponto de vista de `side`. */
export function scoreText(sport: ResultMatch['sport'], score: ScoreOut, side: Side): string {
  const mine = side === 'a'
  if (sport === 'futebol') return mine ? `${score.a} × ${score.b}` : `${score.b} × ${score.a}`
  if (!score.sets?.length) return mine ? `${score.a}-${score.b}` : `${score.b}-${score.a}`
  return score.sets.map(set => {
    const [own, other] = mine ? [set.a, set.b] : [set.b, set.a]
    if (set.super_tiebreak || !set.tiebreak) return `${own}-${other}`
    return `${own}-${other}(${Math.min(set.tiebreak.a, set.tiebreak.b)})`
  }).join(' ')
}

/** Placar do W.O. que vale para o lado presente: 3×0 no futebol e 6-0 6-0 no tênis. */
export const walkoverScoreText = (sport: ResultMatch['sport']) => (sport === 'futebol' ? '3 × 0' : '6-0 6-0')

/** "+3 pts" para quem pontuou e "0 pts" para quem não somou. */
export const pointsPill = (points: number) => (points > 0 ? `+${points} pts` : `${points} pts`)

/** Número com vírgula decimal ("1,5"), sem zeros desnecessários. */
export const formatNumber = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export const positionAbbreviation: Record<Position, string> = { goleiro: 'GOL', defesa: 'DEF', meio_campo: 'MEI', atacante: 'ATA' }

/** Estatística própria de cada posição (RN13), com singular e plural para os textos de prévia e de elenco. */
export const positionStat: Record<Position, { label: string; one: string; many: string }> = {
  goleiro: { label: 'Defesas', one: 'defesa', many: 'defesas' },
  defesa: { label: 'Desarmes', one: 'desarme', many: 'desarmes' },
  meio_campo: { label: 'Passes decisivos', one: 'passe decisivo', many: 'passes decisivos' },
  atacante: { label: 'Finalizações no alvo', one: 'finalização no alvo', many: 'finalizações no alvo' },
}

export const statFields: StatField[] = ['gols', 'assistencias', 'estatistica_posicao']

/** Rótulo do item da estatística; o da posição depende da posição em que a pessoa jogou. */
export function statFieldLabel(field: StatField, position: Position | null): string {
  if (field === 'gols') return 'Gols'
  if (field === 'assistencias') return 'Assistências'
  return position ? positionStat[position].label : 'Estatística da posição'
}

/** Pontos do jogador em uma partida (RN12), espelho de `scoring.individual_points`, só para a prévia ao digitar. */
export interface LocalPreview { presence: number; result: number | null; goals: number; assists: number; positionStat: number; total: number }
export type Outcome = 'vitoria' | 'empate' | 'derrota'

/** Presença 1; vitória 3, empate 1, derrota 0; gol 1; assistência 1; estatística da posição 0,5 até 4. */
export function localPreview(outcome: Outcome | null, goals: number, assists: number, stat: number): LocalPreview {
  const result = outcome === null ? null : outcome === 'vitoria' ? 3 : outcome === 'empate' ? 1 : 0
  const positionPoints = Math.min(0.5 * stat, 4)
  return { presence: 1, result, goals, assists, positionStat: positionPoints, total: 1 + (result ?? 0) + goals + assists + positionPoints }
}

/** Resultado para o lado `side` segundo o placar: vitória, empate ou derrota. */
export function outcomeFor(score: Pick<ScoreOut, 'winner'>, side: Side): Outcome {
  return score.winner === null ? 'empate' : score.winner === side ? 'vitoria' : 'derrota'
}

/** "2 gols · 1 assistência · 4 finalizações no alvo" ou "Sem números". */
export function statSummary(lineup: Lineup): string {
  const stat = lineup.stat
  if (!stat) return 'Estatísticas não enviadas'
  const pos = lineup.position ? positionStat[lineup.position] : null
  const parts = [
    stat.goals ? `${stat.goals} ${stat.goals === 1 ? 'gol' : 'gols'}` : null,
    stat.assists ? `${stat.assists} ${stat.assists === 1 ? 'assistência' : 'assistências'}` : null,
    stat.position_stat ? `${stat.position_stat} ${stat.position_stat === 1 ? (pos?.one ?? 'ocorrência') : (pos?.many ?? 'ocorrências')}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Sem números'
}

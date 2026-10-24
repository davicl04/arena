import type { FormResult, RankingKey } from '../../api/results'
import { formatDuration } from '../play/tierLines'

const number1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const number2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

/** Ranking da corrida: a métrica é o melhor tempo (em segundos) e quem tem o menor tempo vence. */
export const isRunRanking = (ranking: RankingKey) => ranking.startsWith('corrida_')

/**
 * Pontos (time e tênis), média por partida (individual, com duas casas: os cortes são 2,5, 4,0 e 5,5) ou, na corrida, o
 * melhor tempo ("24:12", "1:02:30") a partir dos segundos.
 */
export function formatMetric(value: number, ranking: RankingKey): string {
  if (isRunRanking(ranking)) return formatDuration(value)
  return (ranking === 'futebol_individual' ? number2 : number1).format(value)
}

/** Nome da métrica sob o número: "pontos" (time e tênis), "média" (individual) ou "tempo" (corrida). */
export const metricUnit = (ranking: RankingKey) => (isRunRanking(ranking) ? 'tempo' : ranking === 'futebol_individual' ? 'média' : 'pontos')

/** Métrica no meio da frase: "38 pontos", "4,26 média" ou só o tempo ("24:12"). */
export const metricText = (value: number, ranking: RankingKey) =>
  isRunRanking(ranking) ? formatMetric(value, ranking) : `${formatMetric(value, ranking)} ${metricUnit(ranking)}`

/**
 * Diferença entre duas pessoas do ranking, sem sinal: "7 pts" e "1 pt" (time e tênis), "0,28" (média, duas casas) e, na
 * corrida, a diferença de tempo ("0:42", "1:05:30").
 */
export function gapText(value: number, ranking: RankingKey): string {
  const gap = Math.abs(value)
  if (isRunRanking(ranking)) return formatDuration(gap)
  if (ranking === 'futebol_individual') return number2.format(gap)
  const text = number1.format(gap)
  return `${text} ${text === '1' ? 'pt' : 'pts'}`
}

/** "2026-09-03" → "03/09" (sem passar por `Date`, para o fuso não mudar o dia). */
export function markDay(iso: string | null | undefined): string | null {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(iso ?? '')
  return match ? `${match[2]}/${match[1]}` : null
}

const resultNames: Record<FormResult, string> = { V: 'vitória', E: 'empate', D: 'derrota' }
/** Frase lida pelo leitor de tela: "Últimos resultados: vitória, vitória, empate, derrota, vitória". */
export const formSpoken = (form: readonly FormResult[]) => `Últimos resultados: ${form.map(item => resultNames[item]).join(', ')}`

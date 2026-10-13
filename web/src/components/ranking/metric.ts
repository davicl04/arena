import type { RankingKey } from '@/api/results'
import { formatDuration } from '@/components/play/tierLines'

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
 * Diferença entre dois colocados no mesmo ranking, sem sinal: "7 pts" (time e tênis), "0,28" (média, sem unidade) ou
 * "0:42" (corrida, em tempo).
 */
export function gapText(value: number, ranking: RankingKey): string {
  const amount = Math.abs(value)
  if (isRunRanking(ranking)) return formatDuration(amount)
  if (ranking === 'futebol_individual') return number2.format(amount)
  return `${number1.format(amount)} ${amount === 1 ? 'pt' : 'pts'}`
}

/** Dia da melhor marca (AAAA-MM-DD) como "03/09", sem passar por fuso horário. */
export function dayMonth(date: string): string {
  const [, month, day] = date.split('-')
  return month && day ? `${day}/${month}` : date
}

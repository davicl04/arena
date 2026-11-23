import type { RankingKey } from '@/api/results'
import { formatDuration } from '@/components/play/tierLines'

/*
 * Mapeamento único do rótulo e do formato da métrica de cada ranking (decisão 0006): rating inteiro (futebol · time e
 * tênis), média por partida (individual) ou melhor tempo (corrida). Ranking, Início e qualquer outro ponto que formate
 * `metric_value`, `leader_gap` ou `next_gap` passam por aqui; o rótulo sai da chave do ranking, sem campo na API.
 */

const number2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

/** Ranking da corrida: a métrica é o melhor tempo (em segundos) e quem tem o menor tempo vence. */
export const isRunRanking = (ranking: RankingKey) => ranking.startsWith('corrida_')

/** Ranking por rating (futebol · time e tênis): o número vem com casas decimais da API e a tela mostra o inteiro. */
export const isRatingRanking = (ranking: RankingKey) => ranking === 'futebol_time' || ranking === 'tenis'

/** Rating exibido: inteiro arredondado e sem separador de milhar ("1087"). */
const ratingText = (value: number) => String(Math.round(value))

/**
 * Rating inteiro (time e tênis: "1087"), média por partida (individual, com duas casas: "4,26") ou, na corrida, o
 * melhor tempo ("24:12", "1:02:30") a partir dos segundos.
 */
export function formatMetric(value: number, ranking: RankingKey): string {
  if (isRunRanking(ranking)) return formatDuration(value)
  return isRatingRanking(ranking) ? ratingText(value) : number2.format(value)
}

/** Nome da métrica sob o número: "rating" (time e tênis), "média" (individual) ou "tempo" (corrida). */
export const metricUnit = (ranking: RankingKey) => (isRunRanking(ranking) ? 'tempo' : isRatingRanking(ranking) ? 'rating' : 'média')

/** Métrica no meio da frase: "1087 rating", "4,26 média" ou só o tempo ("24:12"). */
export const metricText = (value: number, ranking: RankingKey) =>
  isRunRanking(ranking) ? formatMetric(value, ranking) : `${formatMetric(value, ranking)} ${metricUnit(ranking)}`

/** Métrica por extenso para leitores de tela: "1087 rating", "4,26 de média" ou só o tempo ("24:12"). */
export const metricSpoken = (value: number, ranking: RankingKey) =>
  ranking === 'futebol_individual' ? `${formatMetric(value, ranking)} de média` : metricText(value, ranking)

/**
 * Diferença entre dois colocados no mesmo ranking, sem sinal, em número e unidade: "37" e "rating" (time e tênis,
 * inteiro), "0,28" sem unidade (média) ou "0:42" sem unidade (corrida, em tempo).
 */
export function gapParts(value: number, ranking: RankingKey): { amount: string; unit: string | null } {
  const amount = Math.abs(value)
  if (isRunRanking(ranking)) return { amount: formatDuration(amount), unit: null }
  if (isRatingRanking(ranking)) return { amount: ratingText(amount), unit: 'rating' }
  return { amount: number2.format(amount), unit: null }
}

/** A diferença no meio da frase: "37 rating", "0,28" ou "0:42". */
export function gapText(value: number, ranking: RankingKey): string {
  const { amount, unit } = gapParts(value, ranking)
  return unit ? `${amount} ${unit}` : amount
}

/** Dia da melhor marca (AAAA-MM-DD) como "03/09", sem passar por fuso horário. */
export function dayMonth(date: string): string {
  const [, month, day] = date.split('-')
  return month && day ? `${day}/${month}` : date
}

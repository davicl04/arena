import type { RankingKey } from '@/api/results'

const number1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const number2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

/** Pontos (time e tênis) ou média por partida (individual, com duas casas: os cortes são 2,5, 4,0 e 5,5). */
export const formatMetric = (value: number, ranking: RankingKey) => (ranking === 'futebol_individual' ? number2 : number1).format(value)

/** Nome da métrica sob o número: "pontos" (time e tênis) ou "média" (individual). */
export const metricUnit = (ranking: RankingKey) => (ranking === 'futebol_individual' ? 'média' : 'pontos')

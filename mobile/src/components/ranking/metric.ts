import type { FormResult, RankingKey } from '../../api/results'
import { formatDuration } from '../play/tierLines'

const number2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

/*
 * Mapeamento único da métrica de cada ranking no Expo (a chave do ranking decide o rótulo e o formato, sem campo da API):
 * - `futebol_time` e `tenis`: rating, exibido como inteiro (`Math.round`, sem separador de milhar) com o rótulo "rating"
 *   ("1087 rating"); nunca "pts" nem "pontos". Em classificação o servidor não manda o rating (`metric_value` nulo);
 * - `futebol_individual`: média por partida, com até duas casas ("4,26 média");
 * - `corrida_<km>`: o melhor tempo ("24:12", "1:02:30") a partir dos segundos.
 * Os pontos da campanha (pílula "+3 pts" do resultado e linha do tempo) não passam por aqui.
 */

/** Ranking da corrida: a métrica é o melhor tempo (em segundos) e quem tem o menor tempo vence. */
export const isRunRanking = (ranking: RankingKey) => ranking.startsWith('corrida_')

/** Ranking por rating (futebol · time e tênis, `calc_version = 2`). */
export const isRatingRanking = (ranking: RankingKey) => ranking === 'futebol_time' || ranking === 'tenis'

/** Rating inteiro: 1087,494 → "1087" (sem separador de milhar, para não ser lido como decimal). */
const ratingNumber = (value: number) => String(Math.round(value) || 0)

/**
 * Rating inteiro (time e tênis), média por partida (individual, com duas casas: os cortes são 2,5, 4,0 e 5,5) ou, na corrida,
 * o melhor tempo ("24:12", "1:02:30") a partir dos segundos.
 */
export function formatMetric(value: number, ranking: RankingKey): string {
  if (isRunRanking(ranking)) return formatDuration(value)
  return isRatingRanking(ranking) ? ratingNumber(value) : number2.format(value)
}

/** Nome da métrica sob o número: "rating" (time e tênis), "média" (individual) ou "tempo" (corrida). */
export const metricUnit = (ranking: RankingKey) => (isRunRanking(ranking) ? 'tempo' : ranking === 'futebol_individual' ? 'média' : 'rating')

/** Métrica no meio da frase: "1087 rating", "4,26 média" ou só o tempo ("24:12"). */
export const metricText = (value: number, ranking: RankingKey) =>
  isRunRanking(ranking) ? formatMetric(value, ranking) : `${formatMetric(value, ranking)} ${metricUnit(ranking)}`

/**
 * Diferença entre duas pessoas do ranking, sem sinal: "7 rating" (time e tênis, inteiro), "0,28" (média, duas casas) e, na
 * corrida, a diferença de tempo ("0:42", "1:05:30").
 */
export function gapText(value: number, ranking: RankingKey): string {
  const gap = Math.abs(value)
  if (isRunRanking(ranking)) return formatDuration(gap)
  if (ranking === 'futebol_individual') return number2.format(gap)
  return `${ratingNumber(gap)} rating`
}

/** "2026-09-03" → "03/09" (sem passar por `Date`, para o fuso não mudar o dia). */
export function markDay(iso: string | null | undefined): string | null {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(iso ?? '')
  return match ? `${match[2]}/${match[1]}` : null
}

const resultNames: Record<FormResult, string> = { V: 'vitória', E: 'empate', D: 'derrota' }
/** Frase lida pelo leitor de tela: "Últimos resultados: vitória, vitória, empate, derrota, vitória". */
export const formSpoken = (form: readonly FormResult[]) => `Últimos resultados: ${form.map(item => resultNames[item]).join(', ')}`

import type { RunDistance, TierKey } from '@/data/arena'
import { runDistances, tiers } from '@/data/arena'
import type { RunImpact, RunOrigin } from '@/api/runs'
import { formatDuration } from './tierLines'

/*
 * Peças puras da corrida (K2 e K4): metros das distâncias da régua, ritmo, tempo em h:min:s e os textos da prévia e
 * da marca salva. Os números vêm sempre do servidor (`impact`, `pace_s_per_km`); aqui só se monta o texto.
 */

/** Metros enviados ao escolher a distância na régua: as distâncias oficiais (21 km é a meia maratona; 42 km, a maratona). */
export const standardMeters: Record<RunDistance, number> = { 3: 3000, 5: 5000, 10: 10_000, 21: 21_097, 42: 42_195 }

/** Limites do servidor (18.1): a tela só os usa para indicar o formato do campo. */
export const MIN_DISTANCE_M = 1000
export const MAX_DISTANCE_M = 100_000
/** Janela de 52 semanas: de hoje − 364 dias até hoje. */
export const WINDOW_DAYS = 364
/** Maior duração aceita (24 h). */
export const MAX_DURATION_S = 86_400

export const distanceLabel = (distance: RunDistance) => runDistances.find(item => item.value === distance)?.label ?? `${distance} km`

/** "5 km", "7,5 km" ou "10,15 km" para os metros informados. */
export function formatKm(meters: number): string {
  return `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km`
}

/** Segundos por km, arredondado para cima na metade (o mesmo cálculo do servidor). Sem medida, `null`. */
export function paceOf(durationS: number, distanceM: number): number | null {
  if (!(durationS > 0) || !(distanceM > 0)) return null
  return Math.floor((durationS * 2000 + distanceM) / (2 * distanceM))
}

/** "5:02/km" a partir de segundos por km. */
export const formatPace = (secondsPerKm: number) => `${Math.floor(secondsPerKm / 60)}:${String(secondsPerKm % 60).padStart(2, '0')}/km`

export interface HmsParts { h: number; m: number; s: number }
export const toSeconds = ({ h, m, s }: HmsParts) => h * 3600 + m * 60 + s
export function fromSeconds(total: number): HmsParts {
  const safe = Math.max(0, Math.min(MAX_DURATION_S, Math.round(total)))
  return { h: Math.floor(safe / 3600), m: Math.floor((safe % 3600) / 60), s: safe % 60 }
}

/** Marca na janela: `date` ("2026-10-12") em "12 out", com o ano fora do ano corrente. */
export function formatRunDate(date: string, now: Date = new Date()): string {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return date
  const moment = new Date(year, month - 1, day)
  const text = moment.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace(/\.$/, '').replace(' de ', ' ')
  return year === now.getFullYear() ? text : `${text} ${year}`
}

/** Origem sob o tempo: "Treino" ou o nome da prova. */
export const originLabel = (origin: RunOrigin) => origin.label

/** Origem no meio da frase ("treino", mas o nome da prova como está). */
export const originInline = (origin: RunOrigin) => (origin.source === 'treino' ? origin.label.toLocaleLowerCase('pt-BR') : origin.label)

const MINUS = '−'

/** Texto da prévia (K2) e da confirmação: título, apoio e o elo a mostrar ao lado, se houver. */
export interface ImpactView {
  tone: 'best' | 'plain'
  title: string
  detail: string
  tier: TierKey | null
}

/**
 * `impact` de `POST /me/runs/preview` (ou de `POST /me/runs`) → texto. "Novo melhor tempo · −0:24" com "Sobe para Ouro nos
 * 5 km"; "Primeira marca nos 5 km"; "Seu melhor continua 24:12"; "Fica só no histórico" fora das cinco distâncias.
 * `label` é a distância ("5 km").
 */
export function impactView(impact: RunImpact, label: string, { saved = false }: { saved?: boolean } = {}): ImpactView {
  const after = impact.tier_after
  const name = after ? tiers[after].name : ''
  switch (impact.kind) {
    case 'primeira_marca':
      return {
        tone: 'best', tier: after,
        title: `Primeira marca nos ${label}`,
        detail: name ? `Você ${saved ? 'entrou' : 'entra'} no ranking dos ${label} como ${name}.` : `Você ${saved ? 'entrou' : 'entra'} no ranking dos ${label}.`,
      }
    case 'novo_melhor': {
      const gain = impact.delta_s != null ? ` · ${MINUS}${formatDuration(Math.abs(impact.delta_s))}` : ''
      const before = impact.previous_best_s != null ? ` Antes: ${formatDuration(impact.previous_best_s)}.` : ''
      const where = impact.tier_up && name ? `Sobe para ${name} nos ${label}.` : name ? `Continua ${name} nos ${label}.` : ''
      return { tone: 'best', tier: after, title: `Novo melhor tempo${gain}`, detail: `${where}${before}`.trim() }
    }
    case 'sem_melhora':
      return {
        tone: 'plain', tier: null,
        title: impact.previous_best_s != null ? `Seu melhor continua ${formatDuration(impact.previous_best_s)}` : 'Sem melhora nesta distância',
        detail: `Esta marca fica no histórico dos ${label}.`,
      }
    default:
      return {
        tone: 'plain', tier: null,
        title: 'Fica só no histórico',
        detail: 'A distância não é de 3, 5, 10, 21 ou 42 km (com 2% de tolerância): não entra em ranking.',
      }
  }
}

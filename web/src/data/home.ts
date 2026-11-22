import type { Sport } from '@/api/client'
import type { MatchCard, MatchSideOut } from '@/api/matches'
import type { ModalityStanding } from '@/components/arena/modalityStanding'
import { formatDuration } from '@/components/play/tierLines'
import { tiers } from '@/data/arena'
import type { RunDistance, TierKey } from '@/data/arena'
import { orderedSides, sideName } from '@/data/match'

/*
 * Regras puras do Início (Placar, botão principal, Destaque e Pílulas de "Seu elo"). O Início do Expo segue as mesmas regras e textos, com funções de
 * mesmos nomes: mudar uma regra aqui exige mudar lá também.
 */

const MINUTE = 60_000

/** Um número da Contagem com a unidade ao lado: `{ value: 3, unit: 'dias' }`. */
export interface CountdownPart {
  value: number
  unit: string
}

/**
 * Partes da Contagem até a partida, por faixa: a partir de 24 h, dias e horas ("1 dia 0 h"); de 1 h a 24 h, horas e
 * minutos; abaixo de 1 h, só os minutos, no mínimo 1. Minutos arredondados para baixo; zero, negativo ou inválido: "1 min".
 */
export function countdownParts(ms: number): CountdownPart[] {
  const minutes = Number.isFinite(ms) ? Math.max(1, Math.floor(ms / MINUTE)) : 1
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days >= 1) return [{ value: days, unit: days === 1 ? 'dia' : 'dias' }, { value: hours, unit: 'h' }]
  if (hours >= 1) return [{ value: hours, unit: 'h' }, { value: minutes % 60, unit: 'min' }]
  return [{ value: minutes, unit: 'min' }]
}

/** Contagem em texto: "3 dias 4 h", "5 h 12 min" ou "8 min". */
export function countdownText(ms: number): string {
  return countdownParts(ms).map(part => `${part.value} ${part.unit}`).join(' ')
}

const spokenUnits: Record<string, [string, string]> = { dia: ['dia', 'dias'], dias: ['dia', 'dias'], h: ['hora', 'horas'], min: ['minuto', 'minutos'] }

/** Contagem para leitores de tela, com as unidades por extenso e sem as partes zeradas: "3 dias e 4 horas", "1 dia". */
export function spokenMatchCountdown(ms: number): string {
  const [first, ...rest] = countdownParts(ms)
  const words = (part: CountdownPart) => `${part.value} ${spokenUnits[part.unit][part.value === 1 ? 0 : 1]}`
  return [words(first), ...rest.filter(part => part.value > 0).map(words)].join(' e ')
}

/** Nome do lado no Placar: em partida individual, o lado do titular (`my_side`) é "Você"; os demais, o time ou o atleta. */
export function sideLabel(card: Pick<MatchCard, 'my_side'>, side: MatchSideOut | undefined): string {
  if (side && side.kind === 'atleta' && side.side === card.my_side) return 'Você'
  return sideName(side)
}

/** Linha do confronto, com o lado do titular primeiro: "Leões do Cerrado × Tigres do Lago" ou, no tênis, "Você × Rafael Lima". */
export function matchupLabel(card: Pick<MatchCard, 'sides' | 'my_side'>): string {
  const [first, second] = orderedSides(card)
  return `${sideLabel(card, first)} × ${second ? sideLabel(card, second) : 'adversário a definir'}`
}

/** Texto do Placar sem partida: convida a preparar os perfis ou a marcar a próxima. */
export function emptyPlacarText(hasProfiles: boolean): string {
  return hasProfiles ? 'Que tal marcar a próxima?' : 'Prepare seus perfis esportivos e encontre a primeira.'
}

/** Rótulo do botão principal (sempre leva ao Jogar); sem perfis, "Preparar perfis" vence a próxima partida. */
export function primaryButtonLabel({ hasProfiles, hasNextMatch }: { hasProfiles: boolean; hasNextMatch: boolean }): string {
  if (!hasProfiles) return 'Preparar perfis'
  return hasNextMatch ? 'Encontrar outra partida' : 'Encontrar partida'
}

/** Etiqueta do Destaque: "Mais urgente" quando o prazo está no fim (o critério `warn` de `pendingDeadline`), senão "Aguardando você". */
export const urgencyLabel = (warn: boolean): string => (warn ? 'Mais urgente' : 'Aguardando você')

/**
 * Link abaixo do Destaque, a partir do total de pendências (`pending_count`): "+ 1 pendência · ver todas" ou
 * "+ {n−1} pendências · ver todas". Com 1 pendência (ou nenhuma), não há link: `null`.
 */
export function morePendingLabel(total: number): string | null {
  const rest = total - 1
  if (!(rest >= 1)) return null
  return `+ ${rest} ${rest === 1 ? 'pendência' : 'pendências'} · ver todas`
}

/** Situação da pílula de uma modalidade em "Seu elo". */
export type PillStatus =
  | { kind: 'no-profile' }
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'tier'; tier: TierKey; metric: ModalityStanding['metric']; distanceKm: RunDistance | null }
  | { kind: 'no-mark' }
  | { kind: 'placement'; played: number; required: number }

/**
 * Situação da pílula da modalidade. `standing` é o resultado de `modalityStanding` (ou `null` sem a classificação lida);
 * `hasProfile` é `false` só quando a lista de perfis foi lida e não tem a modalidade (`null` enquanto carrega ou se falhou:
 * a pílula segue a classificação). `loading` cobre a leitura da classificação e a dos perfis.
 */
export function pillStatus(sport: Sport, { standing, loading, hasProfile }: { standing: ModalityStanding | null; loading: boolean; hasProfile: boolean | null }): PillStatus {
  if (hasProfile === false) return { kind: 'no-profile' }
  if (loading) return { kind: 'loading' }
  if (!standing) return { kind: 'unavailable' }
  if (standing.tier) return { kind: 'tier', tier: standing.tier, metric: standing.metric, distanceKm: standing.distanceKm }
  if (sport === 'corrida') return { kind: 'no-mark' }
  return { kind: 'placement', played: standing.played, required: standing.required }
}

const decimal = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

/**
 * Métrica da pílula com elo: "{n} pts" (pontos de time e tênis), "{n} média" (média por partida do individual) ou, na corrida,
 * "{tempo} · {distância} km" na distância de maior elo. Sem o valor da métrica, a corrida mostra só a distância; as demais, nada.
 */
export function pillMetric(metric: ModalityStanding['metric'], distanceKm: RunDistance | null = null): string | null {
  if (metric?.unit === 'tempo') return distanceKm ? `${formatDuration(metric.value)} · ${distanceKm} km` : formatDuration(metric.value)
  if (metric) return `${decimal(metric.value)} ${metric.unit === 'média' ? 'média' : 'pts'}`
  return distanceKm ? `${distanceKm} km` : null
}

/**
 * Textos da pílula sem elo: a situação e a linha de baixo ("2 de 3" e "Sem classificação", "Sem marca" e "Sem classificação",
 * "Sem perfil" e "Configurar", "Classificação indisponível"). Com elo ou carregando, `null`: a pílula mostra o emblema ou o
 * carregamento.
 */
export function pillTexts(status: PillStatus): { status: string; detail: string | null } | null {
  switch (status.kind) {
    case 'no-profile': return { status: 'Sem perfil', detail: 'Configurar' }
    case 'unavailable': return { status: 'Classificação indisponível', detail: null }
    case 'no-mark': return { status: 'Sem marca', detail: 'Sem classificação' }
    case 'placement': return { status: `${status.played} de ${status.required}`, detail: 'Sem classificação' }
    default: return null
  }
}

/**
 * Nome acessível da pílula: a modalidade e o elo com a métrica por extenso ("Futebol: elo Ouro, 38 pontos", "Corrida: elo
 * Diamante, 1:45:30 nos 21 km") ou a situação ("Tênis: sem classificação, 2 de 3 partidas", "Futebol: sem perfil, configurar").
 */
export function pillAccessibilityLabel(sportLabel: string, status: PillStatus): string {
  switch (status.kind) {
    case 'tier': {
      const { metric, distanceKm } = status
      const spoken = metric?.unit === 'tempo' ? `${formatDuration(metric.value)}${distanceKm ? ` nos ${distanceKm} km` : ''}`
        : metric ? `${decimal(metric.value)} ${metric.unit === 'média' ? 'de média' : 'pontos'}`
          : distanceKm ? `nos ${distanceKm} km` : ''
      return `${sportLabel}: elo ${tiers[status.tier]?.name ?? status.tier}${spoken ? `, ${spoken}` : ''}`
    }
    case 'placement': return `${sportLabel}: sem classificação, ${status.played} de ${status.required} ${status.required === 1 ? 'partida' : 'partidas'}`
    case 'no-mark': return `${sportLabel}: sem marca, sem classificação`
    case 'no-profile': return `${sportLabel}: sem perfil, configurar`
    case 'loading': return `${sportLabel}: carregando classificação`
    case 'unavailable': return `${sportLabel}: classificação indisponível`
  }
}

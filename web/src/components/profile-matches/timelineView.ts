import type { MatchSideOut, Side } from '@/api/matches'
import type { TimelineItem, TimelineMatch, TimelineRun, TimelineSide, TimelineSport } from '@/api/profile'
import type { StateTone } from '@/data/arena'
import { positionStat } from '@/components/results/format'
import { footballFormat } from '@/data/arena'
import { sideName } from '@/data/match'
import { formatClock, formatShortDate, parseIso } from '@/utils/format'

/*
 * Textos e mapeamentos da aba Partidas do perfil. Os rótulos de fase da partida continuam em `matchPhases`
 * (`data/match.ts`); aqui ficam só os do resultado do titular, da corrida e da linha do tempo.
 */

export const sportLabels: Record<TimelineSport, string> = { futebol: 'Futebol', tenis: 'Tênis', corrida: 'Corrida' }

export type SportFilter = 'todas' | TimelineSport
export const filterOptions: { value: SportFilter; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'futebol', label: 'Futebol' },
  { value: 'tenis', label: 'Tênis' },
  { value: 'corrida', label: 'Corrida' },
]
export const filterSummary = (filter: SportFilter) => (filter === 'todas' ? 'Todas as modalidades' : sportLabels[filter])

/** Modalidade do registro (para o ícone do nó). */
export const itemSport = (item: TimelineItem): TimelineSport => (item.kind === 'corrida' ? 'corrida' : item.sport)

/** O lado da API sem os campos do pareamento, no formato que `SideMark` e `sideName` esperam. */
export function asSideOut(side: TimelineSide): MatchSideOut {
  return { ...side, tier: null, accepted_at: null, is_mine: side.is_owner, declared_slots: null }
}

export const orderedTimelineSides = (match: Pick<TimelineMatch, 'sides'>): TimelineSide[] =>
  [...match.sides].sort((a, b) => a.side.localeCompare(b.side))

/** "Ferrugem FC × Leões do Cerrado", na ordem dos lados (A antes de B). */
export function timelineTitle(match: Pick<TimelineMatch, 'sides'>): string {
  const [first, second] = orderedTimelineSides(match).map(side => sideName(asSideOut(side)))
  return `${first ?? 'Adversário'} × ${second ?? 'Adversário'}`
}

const outcomeLabels = { vitoria: 'Vitória', empate: 'Empate', derrota: 'Derrota' } as const
const outcomeTones: Record<keyof typeof outcomeLabels, StateTone> = { vitoria: 'open', empate: 'draft', derrota: 'danger' }

export interface ResultBadge { label: string; tone: StateTone; dashed: boolean }

/** Selo do canto do Duelo: o resultado do titular, "Cancelada" ou "Sem resultado" (tracejado). */
export function resultBadge(match: Pick<TimelineMatch, 'state' | 'outcome' | 'walkover_absent_side'>): ResultBadge {
  if (match.state === 'cancelada') return { label: 'Cancelada', tone: 'closed', dashed: true }
  if (match.state === 'sem_resultado' || !match.outcome) return { label: 'Sem resultado', tone: 'closed', dashed: true }
  const walkover = match.walkover_absent_side ? ' · W.O.' : ''
  return { label: `${outcomeLabels[match.outcome]}${walkover}`, tone: outcomeTones[match.outcome], dashed: false }
}

/** Partida sem resultado final, que o cartão mostra esmaecida. */
export const isFaded = (match: Pick<TimelineMatch, 'state'>) => match.state === 'sem_resultado' || match.state === 'cancelada'

/** "Society", "Futsal" ou "Campo"; no tênis, "Tênis". */
export const formatLabel = (match: Pick<TimelineMatch, 'sport' | 'format'>) =>
  match.sport === 'tenis' ? 'Tênis' : match.format ? footballFormat[match.format].label : 'Futebol'

/** "sáb, 18 out · 16:00". */
export function itemWhen(iso: string, now: Date = new Date()): string {
  const date = parseIso(iso)
  return date ? `${formatShortDate(date, now)} · ${formatClock(date)}` : ''
}

/** Pílula de pontos: "+3", "+1", "0", "+10". Sem resultado, nada. */
export const pointsLabel = (points: number | null): string | null => (points === null ? null : points > 0 ? `+${points}` : '0')

const count = (value: number | null, one: string, many: string) => (value ? `${value} ${value === 1 ? one : many}` : null)

/** "1 gol · 1 assistência"; zeros e campos não contados ficam de fora. */
export function statsText(stats: TimelineMatch['stats']): string | null {
  if (!stats) return null
  const parts = [
    count(stats.goals, 'gol', 'gols'),
    count(stats.assists, 'assistência', 'assistências'),
    count(stats.position_stat, stats.position ? positionStat[stats.position].one : 'ocorrência', stats.position ? positionStat[stats.position].many : 'ocorrências'),
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/** Valor de um lado no mini placar: uma célula no futebol, uma por set no tênis. "–" sem placar. O tie-break aparece
 * só no lado que perdeu o set, como em `results/format.ts` (convenção do tênis: 7-6⁵). */
export interface ScoreCell { value: string; tiebreak: string | null }
export function scoreCells(match: Pick<TimelineMatch, 'sport' | 'score'>, side: Side): ScoreCell[] {
  const score = match.score
  if (!score) return [{ value: '–', tiebreak: null }]
  if (match.sport === 'futebol' || !score.sets?.length) return [{ value: String(side === 'a' ? score.a : score.b), tiebreak: null }]
  return score.sets.map(set => ({
    value: String(side === 'a' ? set.a : set.b),
    tiebreak: set.tiebreak && !set.super_tiebreak && (side === 'a' ? set.a < set.b : set.b < set.a)
      ? String(side === 'a' ? set.tiebreak.a : set.tiebreak.b) : null,
  }))
}

/** O lado ganhou: pelo placar ou, no W.O., por o outro ter faltado. */
export function isWinner(match: Pick<TimelineMatch, 'score' | 'walkover_absent_side'>, side: Side): boolean {
  if (match.walkover_absent_side) return match.walkover_absent_side !== side
  return match.score?.winner === side
}

/** Texto de leitor de tela do placar. */
export function scoreSpoken(match: Pick<TimelineMatch, 'sport' | 'score' | 'sides' | 'walkover_absent_side'>): string {
  if (!match.score) return 'sem placar'
  if (match.walkover_absent_side) return 'W.O.'
  const names = orderedTimelineSides(match).map(side => sideName(asSideOut(side)))
  if (match.sport === 'futebol') return `${names[0] ?? 'Lado A'} ${match.score.a}, ${names[1] ?? 'Lado B'} ${match.score.b}`
  const sets = match.score.sets?.map(set => `${set.a}-${set.b}`).join(', ')
  return sets ? `sets ${sets}` : `${match.score.a} sets a ${match.score.b}`
}

const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** "outubro 2026" no fuso do aparelho; data inválida → "". */
export function monthLabel(iso: string): string {
  const date = parseIso(iso)
  return date ? `${months[date.getMonth()]} ${date.getFullYear()}` : ''
}

/** "outubro 2026" a partir de "2026-10-05", sem conversão de fuso (data da corrida). */
export function dateMonthLabel(date: string): string {
  const [year, month] = date.split('-').map(Number)
  return year && month && months[month - 1] ? `${months[month - 1]} ${year}` : ''
}

/** Registros em sequência agrupados pelo mês (a lista já vem do mais recente ao mais antigo). */
export function groupByMonth(items: readonly TimelineItem[]): { month: string; items: TimelineItem[] }[] {
  const groups: { month: string; items: TimelineItem[] }[] = []
  for (const item of items) {
    const month = item.kind === 'corrida' ? dateMonthLabel(item.date) : monthLabel(item.occurred_at)
    const last = groups[groups.length - 1]
    if (last && last.month === month) last.items.push(item)
    else groups.push({ month, items: [item] })
  }
  return groups
}

/** "Hoje", "Amanhã" ou "Em N dias", pelos dias do calendário entre `now` e a partida. */
export function daysUntil(iso: string, now: Date = new Date()): string {
  const date = parseIso(iso)
  if (!date) return ''
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round((start(date) - start(now)) / 86_400_000)
  return days <= 0 ? 'Hoje' : days === 1 ? 'Amanhã' : `Em ${days} dias`
}

// ----- Corrida ------------------------------------------------------------------------------------------------

/** "Treino" ou "Prova · Corrida do Cerrado". */
export const runOriginText = (run: Pick<TimelineRun, 'origin'>) =>
  run.origin.source === 'prova' ? `Prova · ${run.origin.label}` : run.origin.label

/** Selo da marca: "Novo melhor", "Primeira marca" ou nada. */
export function markBadge(kind: TimelineRun['mark_kind']): { label: string; tone: StateTone } | null {
  if (kind === 'novo_melhor') return { label: 'Novo melhor', tone: 'open' }
  if (kind === 'primeira_marca') return { label: 'Primeira marca', tone: 'live' }
  return null
}

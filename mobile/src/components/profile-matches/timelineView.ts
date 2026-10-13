import type { Sport } from '../../api/client'
import type { TimelineItem, TimelineMatch, TimelineOutcome, TimelineRun } from '../../api/profile'
import { footballFormat } from '../../data/arena'
import type { StateTone } from '../../data/arena'
import { positionStat } from '../results/format'
import { formatClock, formatShortDate, parseIso } from '../../utils/format'
import { formatRunDate } from '../play/runView'

/* Textos e formatações da aba Partidas do perfil (linha do tempo). Os números e as regras vêm do servidor. */

export type SportFilter = Sport | null

export const filterOptions: { value: SportFilter; label: string }[] = [
  { value: null, label: 'Todas' },
  { value: 'futebol', label: 'Futebol' },
  { value: 'tenis', label: 'Tênis' },
  { value: 'corrida', label: 'Corrida' },
]

/** "Todas as modalidades" ou o nome da modalidade filtrada. */
export const filterLabel = (filter: SportFilter) => filter ? (filterOptions.find(option => option.value === filter)?.label ?? filter) : 'Todas as modalidades'

/** "1 registro" / "12 registros · Futebol". */
export function countLine(total: number, filter: SportFilter): string {
  return `${total} ${total === 1 ? 'registro' : 'registros'} · ${filterLabel(filter)}`
}

export const outcomeLabel: Record<TimelineOutcome, string> = { vitoria: 'Vitória', empate: 'Empate', derrota: 'Derrota' }
export const outcomeTone: Record<TimelineOutcome, StateTone> = { vitoria: 'open', empate: 'draft', derrota: 'danger' }

/** Selo do canto do duelo: "Vitória", "Derrota · W.O."; cancelada e sem resultado têm selo tracejado próprio. */
export interface MatchBadge { label: string; tone: StateTone; dashed: boolean }
export function matchBadge(match: Pick<TimelineMatch, 'state' | 'outcome' | 'walkover_absent_side'>): MatchBadge | null {
  if (match.state === 'cancelada') return { label: 'Cancelada', tone: 'closed', dashed: true }
  if (match.state === 'sem_resultado') return { label: 'Sem resultado', tone: 'closed', dashed: true }
  if (!match.outcome) return null
  const walkover = match.walkover_absent_side ? ' · W.O.' : ''
  return { label: `${outcomeLabel[match.outcome]}${walkover}`, tone: outcomeTone[match.outcome], dashed: false }
}

/** Partida sem placar (cancelada ou sem resultado): o duelo aparece esmaecido. */
export const isFaded = (match: Pick<TimelineMatch, 'state'>) => match.state === 'sem_resultado' || match.state === 'cancelada'

/** O tie-break aparece só no lado que perdeu o set (convenção do tênis: 7-6⁵) e nunca no super tie-break. */
export function showsTiebreak(set: NonNullable<NonNullable<TimelineMatch['score']>['sets']>[number], side: 'a' | 'b'): boolean {
  return Boolean(set.tiebreak) && !set.super_tiebreak && (side === 'a' ? set.a < set.b : set.b < set.a)
}

/** Pílula de pontos: "+3", "+10" ou "0". */
export const pointsText = (points: number) => points > 0 ? `+${points}` : '0'
export const pointsLabel = (points: number) => `${points} ${points === 1 ? 'ponto' : 'pontos'}`

/** "1 gol · 1 assistência"; sem nenhum campo contado, `null`. */
export function statsText(stats: TimelineMatch['stats']): string | null {
  if (!stats) return null
  const pos = stats.position ? positionStat[stats.position] : null
  const parts = [
    stats.goals ? `${stats.goals} ${stats.goals === 1 ? 'gol' : 'gols'}` : null,
    stats.assists ? `${stats.assists} ${stats.assists === 1 ? 'assistência' : 'assistências'}` : null,
    stats.position_stat ? `${stats.position_stat} ${stats.position_stat === 1 ? (pos?.one ?? 'ação da posição') : (pos?.many ?? 'ações da posição')}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/** "sáb, 18 out · Society" (formato só no futebol). */
export function matchHeading(match: TimelineMatch, now: Date = new Date()): string {
  const date = parseIso(match.occurred_at)
  const when = date ? formatShortDate(date, now) : 'Data a definir'
  const format = match.format ? footballFormat[match.format].label : match.sport === 'tenis' ? 'Tênis' : ''
  return format ? `${when} · ${format}` : when
}

/** Faixa do campeonato: "Copa Sudoeste · SEMIFINAL" (sem a fase, só o nome). */
export const eventBand = (match: Pick<TimelineMatch, 'event' | 'round_label'>) => match.event ? { name: match.event.name, round: match.round_label ? match.round_label.toLocaleUpperCase('pt-BR') : null } : null

/** "Treino" ou "Prova · Corrida do Cerrado". */
export const runOrigin = (run: TimelineRun) => run.origin.source === 'prova' ? `Prova · ${run.origin.label}` : 'Treino'

/** "12 out · Treino" para o alto do cartão da corrida. */
export const runHeading = (run: TimelineRun, now: Date = new Date()) => `${formatRunDate(run.date, now)} · ${runOrigin(run)}`

export const markLabel: Record<NonNullable<TimelineRun['mark_kind']>, string | null> = { primeira_marca: 'Primeira marca', novo_melhor: 'Novo melhor', sem_melhora: null }

/** Modalidade de um registro (ícone do nó). */
export const itemSport = (item: TimelineItem): Sport => item.kind === 'corrida' ? 'corrida' : item.sport

/** Mês do registro, ex.: "outubro 2026". Corrida usa o dia da marca (`date`), sem o deslocamento de fuso. */
export function monthLabel(item: TimelineItem): string {
  const date = item.kind === 'corrida' ? parseIso(`${item.date}T12:00:00`) : parseIso(item.occurred_at)
  return date ? date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', ' ') : ''
}

/** Entradas do trilho: separadores de mês entre os registros. */
export type RailEntry = { type: 'month'; key: string; label: string } | { type: 'item'; key: string; item: TimelineItem }
export function railEntries(items: readonly TimelineItem[]): RailEntry[] {
  const entries: RailEntry[] = []
  let month = ''
  for (const item of items) {
    const label = monthLabel(item)
    if (label !== month) { month = label; entries.push({ type: 'month', key: `m-${item.kind}-${item.id}`, label }) }
    entries.push({ type: 'item', key: `${item.kind}-${item.id}`, item })
  }
  return entries
}

/** "Em 3 dias", "Amanhã" ou "Hoje", pela diferença de dias do calendário local. */
export function daysUntil(iso: string, now: Date = new Date()): string {
  const target = parseIso(iso)
  if (!target) return ''
  const days = Math.round((new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000)
  return days <= 0 ? 'Hoje' : days === 1 ? 'Amanhã' : `Em ${days} dias`
}

/** "Em 3 dias · sáb, 18 out, 16:00". */
export function nextMatchWhen(iso: string, now: Date = new Date()): string {
  const target = parseIso(iso)
  return target ? `${daysUntil(iso, now)} · ${formatShortDate(target, now)}, ${formatClock(target)}` : 'Data a definir'
}

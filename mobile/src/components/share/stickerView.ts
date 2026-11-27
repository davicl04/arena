import type { Sport } from '../../api/client'
import type { TimelineItem, TimelineSet } from '../../api/profile'
import type { ShareCategory, ShareMatch, ShareRun, ShareSubject } from '../../api/share'
import { footballFormat, tiers } from '../../data/arena'
import type { TierKey } from '../../data/arena'
import { distanceLabel, formatKm } from '../play/runView'
import { formatDuration } from '../play/tierLines'
import { outcomeLabel } from '../profile-matches/timelineView'

/*
 * Camada de texto do adesivo de resultado (docs/decisoes/0007-compartilhamento-stories.md e a especificação da
 * funcionalidade): o que a placa, a barra do elo e a folha de ações dizem, sem desenho. Os números vêm do servidor;
 * campo ausente some ou usa a alternativa definida (o formato no lugar das estatísticas). Nada é inventado.
 */

/** Uma coluna da placa: rótulo em menta e o número (com a unidade menor, quando há). */
export interface PlateCell { label: string; value: string; unit?: string }

/** Pontos da partida ou diferença da corrida, ao lado do elo. `down` é a corrida mais lenta que a melhor anterior. */
export interface BarMeta { text: string; tone: 'up' | 'flat' | 'down' }

export type EloBar =
  | {
    state: 'ranqueado'
    tier: TierKey
    tierName: string
    meta: BarMeta | null
    /** De 0 a 1. */
    progress: number
    /** "3º na Prata · faltam 71 para Ouro"; vazio quando não há posição nem "faltam". */
    foot: string
  }
  | {
    state: 'classificacao'
    /** Modalidade do aro (sem elo atribuído, sem Coliseu de elo). */
    sport: Sport
    /** "2 de 3 partidas" ou "0 de 1 marca". */
    meta: string
    progress: number
  }

export interface StickerModel {
  sport: Sport
  plate: PlateCell[]
  /** Nula sem categoria (corrida fora das distâncias do ranking). */
  bar: EloBar | null
}

const superscript = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const toSuperscript = (value: number) => String(value).split('').map(digit => superscript[Number(digit)] ?? digit).join('')
const clamp01 = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))

/** Preposição de cada elo: "na Prata", "no Ouro". */
const tierPreposition: Record<TierKey, 'no' | 'na'> = { bronze: 'no', prata: 'na', ouro: 'no', diamante: 'no', lendario: 'no' }

/** "3º na Prata". */
export const tierPositionText = (position: number, tier: TierKey) => `${position}º ${tierPreposition[tier]} ${tiers[tier].name}`

/**
 * Distância até o próximo elo na unidade da métrica: o rating (e os pontos) e a média são arredondados para cima, para
 * nunca mostrar "faltam 0"; os segundos viram m:ss; as posições até o Lendário levam o substantivo.
 */
export function gapText(gap: NonNullable<ShareCategory['gap']>): string {
  switch (gap.unit) {
    case 'media': return (Math.ceil(gap.amount * 100 - 1e-9) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
    case 'segundos': return formatDuration(Math.ceil(gap.amount))
    case 'posicoes': {
      const count = Math.ceil(gap.amount)
      return `${count} ${count === 1 ? 'posição' : 'posições'}`
    }
    default: return String(Math.ceil(gap.amount - 1e-9))
  }
}

/** Pontos da partida: "+3 pts", "+10 pts" ou "0 pts". */
export function matchPointsMeta(points: number): BarMeta {
  return points > 0 ? { text: `+${points} pts`, tone: 'up' } : { text: `${points} pts`, tone: 'flat' }
}

/** Corrida na distância padrão: "1ª marca nos 5 km" ou a diferença para a melhor anterior ("−0:49 nos 5 km"). */
export function runMeta(run: Pick<ShareRun, 'standard_distance_km' | 'mark_kind' | 'previous_best_s' | 'duration_s'>): BarMeta | null {
  if (run.standard_distance_km === null) return null
  const where = `nos ${distanceLabel(run.standard_distance_km)}`
  if (run.mark_kind === 'primeira_marca') return { text: `1ª marca ${where}`, tone: 'flat' }
  if (run.previous_best_s === null) return null
  const delta = Math.round(run.duration_s - run.previous_best_s)
  if (delta < 0) return { text: `−${formatDuration(-delta)} ${where}`, tone: 'up' }
  return { text: `+${formatDuration(delta)} ${where}`, tone: delta > 0 ? 'down' : 'flat' }
}

/** Barra do elo pelo bloco `category`; `meta` é o que vai ao lado do elo quando a pessoa está classificada. */
export function eloBar(category: ShareCategory | null, sport: Sport, meta: BarMeta | null): EloBar | null {
  if (!category) return null
  if (category.state === 'ranqueado' && category.tier && category.tier in tiers) {
    const position = category.tier_position ? tierPositionText(category.tier_position, category.tier) : null
    const remaining = category.gap && category.next_tier && category.next_tier in tiers
      ? `faltam ${gapText(category.gap)} para ${tiers[category.next_tier].name}`
      : null
    return {
      state: 'ranqueado', tier: category.tier, tierName: tiers[category.tier].name, meta,
      // Sem "faltam" (Lendário e Diamante sem vagas de Lendário), a barra fica cheia como o servidor manda.
      progress: clamp01(category.progress),
      foot: [position, remaining].filter(Boolean).join(' · '),
    }
  }
  const noun = sport === 'corrida' ? (category.required === 1 ? 'marca' : 'marcas') : (category.required === 1 ? 'partida' : 'partidas')
  return { state: 'classificacao', sport, meta: `${category.played} de ${category.required} ${noun}`, progress: clamp01(category.progress) }
}

/** Um set do ponto de vista do titular, com o tie-break de quem perdeu o set em sobrescrito ("7-6⁵"). */
export function setText(set: TimelineSet, owner: 'a' | 'b'): string {
  const other = owner === 'a' ? 'b' : 'a'
  const base = `${set[owner]}-${set[other]}`
  if (!set.tiebreak || set.super_tiebreak || set.a === set.b) return base
  const loser = set.a < set.b ? 'a' : 'b'
  return `${base}${toSuperscript(set.tiebreak[loser])}`
}

/** "1 G · 1 A" com o que foi contado; sem gols nem assistências contados, `null` (a placa usa o formato). */
export function goalsAssistsText(stats: ShareMatch['stats']): string | null {
  if (!stats) return null
  const parts = [stats.goals !== null ? `${stats.goals} G` : null, stats.assists !== null ? `${stats.assists} A` : null].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/** Placa da partida, do ponto de vista do titular (o placar dele primeiro). No W.O., o placar diz "W.O.". */
export function matchPlate(match: ShareMatch): PlateCell[] {
  const owner = match.owner_side
  const other = owner === 'a' ? 'b' : 'a'
  const walkover = match.walkover_absent_side !== null
  const result: PlateCell = { label: 'Resultado', value: outcomeLabel[match.outcome] }
  if (match.sport === 'tenis') {
    const sets = match.score.sets ?? []
    if (walkover || !sets.length) return [result, { label: 'Placar', value: walkover ? 'W.O.' : `${match.score[owner]}-${match.score[other]}` }]
    return [result, { label: 'Placar', value: sets.map(set => setText(set, owner)).join(' · ') }, { label: 'Sets', value: `${match.score[owner]}-${match.score[other]}` }]
  }
  const cells: PlateCell[] = [result, { label: 'Placar', value: walkover ? 'W.O.' : `${match.score[owner]} × ${match.score[other]}` }]
  const mine = goalsAssistsText(match.stats)
  if (mine) cells.push({ label: 'Você', value: mine })
  else if (match.format) cells.push({ label: 'Formato', value: footballFormat[match.format].label })
  return cells
}

/** Placa da corrida: distância, tempo e ritmo. */
export function runPlate(run: ShareRun): PlateCell[] {
  const km = formatKm(run.distance_m).replace(/ km$/, '')
  const pace = formatDuration(run.pace_s_per_km)
  return [{ label: 'Distância', value: km, unit: 'km' }, { label: 'Tempo', value: formatDuration(run.duration_s) }, { label: 'Ritmo', value: pace, unit: '/km' }]
}

/** O adesivo inteiro de uma atividade: placa e barra do elo (a assinatura é fixa). */
export function stickerModel(subject: ShareSubject): StickerModel {
  if (subject.kind === 'corrida') {
    const run = subject.data
    return { sport: 'corrida', plate: runPlate(run), bar: eloBar(run.category, 'corrida', runMeta(run)) }
  }
  const match = subject.data
  return { sport: match.sport, plate: matchPlate(match), bar: eloBar(match.category, match.sport, matchPointsMeta(match.points)) }
}

/** Descrição falada da prévia: a placa e a barra do elo, na ordem do desenho. */
export function stickerDescription(model: StickerModel): string {
  const plate = model.plate.map(cell => `${cell.label}: ${cell.value}${cell.unit ? ` ${cell.unit}` : ''}`).join('; ')
  const bar = !model.bar ? '' : model.bar.state === 'ranqueado'
    ? ['Elo ' + model.bar.tierName, model.bar.meta?.text, model.bar.foot].filter(Boolean).join(', ')
    : `Em classificação, ${model.bar.meta}`
  return `Adesivo de resultado. ${plate}.${bar ? ` ${bar}.` : ''} Assinatura arena.`
}

/** Linha de cima da folha de ações: "Vitória · 3 × 1 · Society" ou "5 km · 25:12 · Treino". */
export function activityCaption(item: TimelineItem): string {
  if (item.kind === 'corrida') return [formatKm(item.distance_m), formatDuration(item.duration_s), item.origin.source === 'prova' ? item.origin.label : 'Treino'].join(' · ')
  const owner = item.owner_side
  const other = owner === 'a' ? 'b' : 'a'
  const score = item.score && owner
    ? item.walkover_absent_side ? 'W.O.' : item.score.sets?.length ? `${item.score[owner]}-${item.score[other]} em sets` : `${item.score[owner]} × ${item.score[other]}`
    : null
  const format = item.format ? footballFormat[item.format].label : item.sport === 'tenis' ? 'Tênis' : null
  return [item.outcome ? outcomeLabel[item.outcome] : null, score, format].filter(Boolean).join(' · ')
}

import type { Sport } from '@/api/client'
import type { ScoreOut, Side } from '@/api/matches'
import type { ShareCategory, ShareData, ShareMatch, ShareRun } from '@/api/share'
import { footballFormat, tiers } from '@/data/arena'
import type { TierKey } from '@/data/arena'
import { formatDuration } from '@/components/play/tierLines'

/*
 * Conteúdo do adesivo de resultado (spec "Compartilhamento de resultado nos Stories"): os textos da placa e da barra do
 * elo, a partir da resposta de `/me/share/...`. Só o que a API envia aparece; campo ausente some ou usa a alternativa
 * definida (o formato no lugar das estatísticas do futebol). A geometria fica em `stickerLayout.ts` e o Canvas em
 * `stickerCanvas.ts`.
 */

/** Uma coluna da placa: rótulo em menta, número em Sora e a unidade menor ao lado ("km", "/km"). */
export interface StickerColumn { label: string; value: string; unit?: string }

/** Texto ao lado do elo: os pontos da partida ou, na corrida, a diferença para a melhor marca anterior. */
export interface StickerMeta { text: string; tone: 'up' | 'flat' | 'down' }

export type StickerBar =
  /** Classificado: elo, pontos (ou diferença da marca), progresso até o próximo elo e o rodapé "3º na Prata · faltam…". */
  | { kind: 'ranqueado'; tier: TierKey; tierName: string; meta: StickerMeta | null; progress: number; foot: string }
  /** Em classificação: sem elo atribuído, com "N de M partidas" (corrida: marcas). */
  | { kind: 'classificacao'; sport: Sport; meta: string; progress: number }

export interface StickerContent {
  sport: Sport
  columns: StickerColumn[]
  /** Nulo: corrida fora das distâncias do ranking (sem barra). */
  bar: StickerBar | null
  /** O adesivo por extenso, para leitores de tela. */
  spoken: string
}

const outcomeLabels = { vitoria: 'Vitória', empate: 'Empate', derrota: 'Derrota' } as const

const number2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

/** "5,02" (km, sem a unidade). */
const kmText = (meters: number) => number2.format(meters / 1000)

/** Ritmo sem a unidade: "5:14". */
const paceText = (secondsPerKm: number) => `${Math.floor(secondsPerKm / 60)}:${String(secondsPerKm % 60).padStart(2, '0')}`

/** Valores do lado do titular primeiro. */
const ownFirst = (side: Side, a: number, b: number): [number, number] => (side === 'a' ? [a, b] : [b, a])

/** Sets do ponto de vista do titular, com o tie-break do set entre parênteses: "6-4 · 7-6(5)". */
export function setsText(score: ScoreOut, side: Side): string | null {
  if (!score.sets?.length) return null
  return score.sets.map(set => {
    const [own, other] = ownFirst(side, set.a, set.b)
    return set.tiebreak && !set.super_tiebreak ? `${own}-${other}(${Math.min(set.tiebreak.a, set.tiebreak.b)})` : `${own}-${other}`
  }).join(' · ')
}

/** "1 G · 1 A" com o que foi contado; sem gols nem assistências contados, nulo (a placa usa o formato). */
export function youText(stats: ShareMatch['stats']): string | null {
  if (!stats) return null
  const parts = [stats.goals === null ? null : `${stats.goals} G`, stats.assists === null ? null : `${stats.assists} A`].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

function matchColumns(match: ShareMatch): StickerColumn[] {
  const columns: StickerColumn[] = [{ label: 'Resultado', value: outcomeLabels[match.outcome] }]
  const walkover = match.walkover_absent_side !== null
  const [own, other] = ownFirst(match.owner_side, match.score.a, match.score.b)
  if (match.sport === 'futebol') {
    columns.push({ label: 'Placar', value: walkover ? 'W.O.' : `${own} × ${other}` })
    const you = youText(match.stats)
    if (you) columns.push({ label: 'Você', value: you })
    else if (match.format) columns.push({ label: 'Formato', value: footballFormat[match.format].label })
    return columns
  }
  const sets = walkover ? 'W.O.' : setsText(match.score, match.owner_side)
  if (sets) columns.push({ label: 'Placar', value: sets })
  columns.push({ label: 'Sets', value: `${own}-${other}` })
  return columns
}

function runColumns(run: ShareRun): StickerColumn[] {
  return [
    { label: 'Distância', value: kmText(run.distance_m), unit: 'km' },
    { label: 'Tempo', value: formatDuration(run.duration_s) },
    { label: 'Ritmo', value: paceText(run.pace_s_per_km), unit: '/km' },
  ]
}

/** Artigo do elo em "3º na Prata", "1º no Diamante". */
const tierArticle = (tier: TierKey) => (tier === 'prata' ? 'na' : 'no')

/** A distância até o próximo elo no meio da frase, sem nunca mostrar "faltam 0". */
export function gapText(gap: NonNullable<ShareCategory['gap']>): string {
  const { amount, unit } = gap
  if (unit === 'posicoes') {
    const places = Math.max(1, Math.ceil(amount))
    return `${places} ${places === 1 ? 'posição' : 'posições'}`
  }
  if (unit === 'segundos') return formatDuration(Math.max(1, Math.ceil(amount)))
  if (unit === 'media') return number2.format(Math.max(0.01, Math.ceil(amount * 100 - 1e-9) / 100))
  const whole = Math.max(1, Math.ceil(amount - 1e-9))
  return unit === 'pontos' ? `${whole} pts` : String(whole)
}

/** Pontos da partida: "+3 pts" ou "0 pts". */
const pointsMeta = (points: number): StickerMeta => (points > 0 ? { text: `+${points} pts`, tone: 'up' } : { text: `${points} pts`, tone: 'flat' })

/** Marca da corrida: "−0:49 nos 5 km", "+0:16 nos 5 km", "1ª marca nos 5 km"; sem marca anterior conhecida, nada. */
export function runMeta(run: ShareRun): StickerMeta | null {
  const km = run.standard_distance_km
  if (km === null) return null
  if (run.mark_kind === 'primeira_marca') return { text: `1ª marca nos ${km} km`, tone: 'up' }
  if (run.previous_best_s === null) return null
  const diff = run.duration_s - run.previous_best_s
  if (diff === 0) return { text: `Igual à melhor nos ${km} km`, tone: 'flat' }
  return diff < 0
    ? { text: `−${formatDuration(-diff)} nos ${km} km`, tone: 'up' }
    : { text: `+${formatDuration(diff)} nos ${km} km`, tone: 'down' }
}

/** Barra do elo a partir do bloco `category`; um elo desconhecido ou a falta do bloco não mostram barra. */
export function stickerBar(category: ShareCategory | null, sport: Sport, meta: StickerMeta | null): StickerBar | null {
  if (!category) return null
  const progress = Math.min(1, Math.max(0, category.progress))
  if (category.state === 'classificacao' || !category.tier || !(category.tier in tiers)) {
    const noun = sport === 'corrida' ? (category.required === 1 ? 'marca' : 'marcas') : (category.required === 1 ? 'partida' : 'partidas')
    return { kind: 'classificacao', sport, meta: `${category.played} de ${category.required} ${noun}`, progress }
  }
  const tier = category.tier
  const tierName = tiers[tier].name
  const parts: string[] = []
  if (category.tier_position !== null) parts.push(`${category.tier_position}º ${tierArticle(tier)} ${tierName}`)
  if (category.gap && category.next_tier && category.next_tier in tiers) parts.push(`faltam ${gapText(category.gap)} para ${tiers[category.next_tier].name}`)
  // Lendário e Diamante sem vagas de Lendário: barra cheia, sem "faltam".
  const full = tier === 'lendario' || (tier === 'diamante' && !category.gap)
  return { kind: 'ranqueado', tier, tierName, meta, progress: full ? 1 : progress, foot: parts.join(' · ') }
}

function spokenBar(bar: StickerBar | null): string {
  if (!bar) return ''
  if (bar.kind === 'classificacao') return ` Em classificação, ${bar.meta}.`
  return ` Elo ${bar.tierName}${bar.meta ? `, ${bar.meta.text}` : ''}${bar.foot ? `, ${bar.foot}` : ''}.`
}

/** Conteúdo do adesivo de uma atividade. */
export function stickerContent(data: ShareData): StickerContent {
  const sport: Sport = data.kind === 'corrida' ? 'corrida' : data.match.sport
  const columns = data.kind === 'corrida' ? runColumns(data.run) : matchColumns(data.match)
  const bar = data.kind === 'corrida'
    ? stickerBar(data.run.category, sport, runMeta(data.run))
    : stickerBar(data.match.category, sport, pointsMeta(data.match.points))
  const plate = columns.map(column => `${column.label} ${column.value}${column.unit ? ` ${column.unit}` : ''}`).join(', ')
  return { sport, columns, bar, spoken: `Adesivo de resultado: ${plate}.${spokenBar(bar)}` }
}

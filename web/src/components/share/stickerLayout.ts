import type { Sport } from '@/api/client'
import type { TierKey } from '@/data/arena'
import type { StickerContent } from './stickerContent'

/*
 * Geometria do adesivo de resultado, sem Canvas: a partir do conteúdo (`stickerContent`), devolve caixas, textos e cores
 * num quadro de 360×640 (o design aprovado; a exportação multiplica por 3, 1080×1920). `drawSticker` (stickerCanvas.ts)
 * só percorre este resultado, então prévia e arquivo saem da mesma conta. A medida do texto é injetada (`measure`):
 * no navegador vem do Canvas; nos testes, uma aproximação.
 *
 * Composição (protótipo aprovado, rodadas 5 e 6): placa Floresta de três colunas com a barra do elo logo abaixo e a
 * assinatura (Coliseu + `arena.`) solta embaixo. A posição "topo" é a do design; "centro" e "base" deslocam só a placa
 * e a barra (o editor de foto, ticket 04, escolhe a posição).
 */

export const STICKER_WIDTH = 360
export const STICKER_HEIGHT = 640
/** Escala da exportação: 1080×1920. */
export const EXPORT_SCALE = 3

export type PlatePosition = 'topo' | 'centro' | 'base'

export const SANS = 'Inter, system-ui, sans-serif'
export const DISPLAY = 'Sora, system-ui, sans-serif'

/** Fonte de um texto, em pixels do quadro de 360×640. */
export interface FontSpec { weight: number; size: number; family: string; letterSpacing?: number }
/** Largura de `text` na fonte dada, em pixels do quadro. */
export type Measure = (text: string, font: FontSpec) => number

export interface Box { x: number; y: number; w: number; h: number }
/** Texto posicionado: `y` é o centro vertical da linha (`textBaseline = 'middle'`). */
export interface TextItem { text: string; x: number; y: number; font: FontSpec; color: string; align: 'left' | 'center' | 'right' }

export const STICKER_COLORS = {
  panel: 'rgba(16, 36, 27, 0.84)',
  panelEdge: 'rgba(255, 255, 255, 0.12)',
  divider: 'rgba(255, 255, 255, 0.14)',
  mint: '#8fe0b4',
  value: '#ffffff',
  down: '#ff8a9a',
  foot: '#9fb2a7',
  track: 'rgba(255, 255, 255, 0.12)',
  placement: 'rgba(255, 255, 255, 0.6)',
  shadow: 'rgba(0, 0, 0, 0.45)',
} as const

/** Cor de cada elo (a mesma dos brasões em `public/images/brand/`). */
export const TIER_COLORS: Record<TierKey, string> = {
  bronze: '#C98A4B', prata: '#C3CAD1', ouro: '#E0A82E', diamante: '#BFE9F2', lendario: '#F4DE9A',
}

export interface PlateColumnLayout { label: TextItem; value: TextItem; unit: TextItem | null }

export interface PlateLayout { box: Box; radius: number; dividers: Box[]; columns: PlateColumnLayout[] }

export interface BarLayout {
  box: Box
  radius: number
  /** Brasão do elo (classificado) ou selo da modalidade com aro (em classificação). */
  icon: { kind: 'tier'; tier: TierKey; box: Box } | { kind: 'aro'; sport: Sport; box: Box; color: string }
  title: TextItem
  meta: TextItem | null
  track: Box
  fill: Box & { color: string }
  foot: TextItem[]
}

export interface SignatureLayout { mark: Box; word: TextItem; dot: { cx: number; cy: number; r: number; color: string } }

export interface StickerLayout { width: number; height: number; plate: PlateLayout; bar: BarLayout | null; signature: SignatureLayout }

/** Aproximação da largura do texto (média das letras), usada quando não há Canvas. */
export const approximateMeasure: Measure = (text, font) =>
  text.length * font.size * (font.family === DISPLAY ? 0.6 : 0.54) + Math.max(0, text.length - 1) * (font.letterSpacing ?? 0)

const SIDE = 20
const PLATE_TOP = 118
const PLATE_PAD_X = 4
const PLATE_PAD_TOP = 16
const PLATE_PAD_BOTTOM = 15
const COLUMN_PAD = 6
const LABEL_LINE = 11
const LABEL_GAP = 5
const VALUE_LINE = 26
const VALUE_SIZE = 21
const MIN_VALUE_SIZE = 11
const GAP = 14
const BAR_WIDTH_SHARE = 0.82
const BAR_PAD_X = 14
const BAR_PAD_TOP = 10
const BAR_PAD_BOTTOM = 9
const BAR_ROW = 17
const BAR_ROW_GAP = 7
const TRACK_HEIGHT = 6
const FOOT_LINE = 11.5
const SIGNATURE_BOTTOM = 96
const SIGNATURE_LINE = 20
const BASE_CLEARANCE = 32

const labelFont: FontSpec = { weight: 600, size: 9, family: SANS, letterSpacing: 9 * 0.16 }
const valueFont = (size: number): FontSpec => ({ weight: 700, size, family: DISPLAY, letterSpacing: size * -0.03 })
const unitFont = (size: number): FontSpec => ({ weight: 600, size: Math.round(size * (12 / 21) * 10) / 10, family: DISPLAY })
const titleFont: FontSpec = { weight: 700, size: 13, family: DISPLAY, letterSpacing: 13 * 0.04 }
const metaFont: FontSpec = { weight: 700, size: 12, family: SANS }
const footFont: FontSpec = { weight: 600, size: 9.5, family: SANS }
const wordFont: FontSpec = { weight: 800, size: 20, family: DISPLAY, letterSpacing: 20 * -0.06 }

/** Coliseu da marca: caixa de visão 260×146. */
export const COLISEUM_RATIO = 146 / 260

/** Larguras das colunas: iguais quando tudo cabe; senão, cada uma pelo que precisa, e os números diminuem se faltar espaço. */
function columnWidths(needs: number[], inner: number): { widths: number[]; shrink: number } {
  const equal = inner / needs.length
  if (needs.every(need => need <= equal)) return { widths: needs.map(() => equal), shrink: 1 }
  const total = needs.reduce((sum, need) => sum + need, 0)
  if (total <= inner) return { widths: needs.map(need => need + (inner - total) / needs.length), shrink: 1 }
  const fixed = needs.length * COLUMN_PAD * 2
  const shrink = (inner - fixed) / (total - fixed)
  return { widths: needs.map(need => COLUMN_PAD * 2 + (need - COLUMN_PAD * 2) * shrink), shrink }
}

function plateLayout(content: StickerContent, top: number, measure: Measure): PlateLayout {
  const box: Box = { x: SIDE, y: top, w: STICKER_WIDTH - SIDE * 2, h: PLATE_PAD_TOP + LABEL_LINE + LABEL_GAP + VALUE_LINE + PLATE_PAD_BOTTOM }
  const inner = box.w - PLATE_PAD_X * 2
  const labels = content.columns.map(column => column.label.toUpperCase())
  const valueWidth = (index: number, size: number) => {
    const column = content.columns[index]
    return measure(column.value, valueFont(size)) + (column.unit ? 2 + measure(column.unit, unitFont(size)) : 0)
  }
  const needs = content.columns.map((_, index) => Math.max(measure(labels[index], labelFont), valueWidth(index, VALUE_SIZE)) + COLUMN_PAD * 2)
  const { widths, shrink } = columnWidths(needs, inner)
  const labelY = top + PLATE_PAD_TOP + LABEL_LINE / 2
  const valueY = top + PLATE_PAD_TOP + LABEL_LINE + LABEL_GAP + VALUE_LINE / 2
  const columns: PlateColumnLayout[] = []
  const dividers: Box[] = []
  let x = box.x + PLATE_PAD_X
  content.columns.forEach((column, index) => {
    const width = widths[index]
    if (index > 0) dividers.push({ x, y: top + PLATE_PAD_TOP, w: 1, h: box.h - PLATE_PAD_TOP - PLATE_PAD_BOTTOM })
    const center = x + width / 2
    // Só a coluna que não cabe diminui o número; as demais seguem no tamanho do design.
    const fits = valueWidth(index, VALUE_SIZE) <= width - COLUMN_PAD * 2
    const size = fits ? VALUE_SIZE : Math.max(MIN_VALUE_SIZE, Math.floor(VALUE_SIZE * Math.min(shrink, (width - COLUMN_PAD * 2) / valueWidth(index, VALUE_SIZE)) * 10) / 10)
    const total = valueWidth(index, size)
    const valueText = measure(column.value, valueFont(size))
    const start = center - total / 2
    columns.push({
      label: { text: labels[index], x: center, y: labelY, font: labelFont, color: STICKER_COLORS.mint, align: 'center' },
      value: { text: column.value, x: column.unit ? start : center, y: valueY, font: valueFont(size), color: STICKER_COLORS.value, align: column.unit ? 'left' : 'center' },
      unit: column.unit ? { text: column.unit, x: start + valueText + 2, y: valueY + size * 0.12, font: unitFont(size), color: STICKER_COLORS.value, align: 'left' } : null,
    })
    x += width
  })
  return { box, radius: 18, dividers, columns }
}

/** Quebra o rodapé em duas linhas, nos " · ", quando ele não cabe numa só. */
function footLines(text: string, width: number, measure: Measure): string[] {
  if (!text) return []
  if (measure(text, footFont) <= width) return [text]
  const parts = text.split(' · ')
  if (parts.length < 2) return [text]
  return [parts.slice(0, -1).join(' · '), parts[parts.length - 1]]
}

function barHeight(footCount: number): number {
  return BAR_PAD_TOP + BAR_ROW + BAR_ROW_GAP + TRACK_HEIGHT + (footCount ? BAR_ROW_GAP + footCount * FOOT_LINE : 0) + BAR_PAD_BOTTOM
}

/** Textos da barra antes do posicionamento, para calcular a altura. */
function barParts(content: StickerContent, measure: Measure) {
  const bar = content.bar
  if (!bar) return null
  const width = STICKER_WIDTH - SIDE * 2
  const barWidth = width * BAR_WIDTH_SHARE
  const inner = barWidth - BAR_PAD_X * 2
  const ranked = bar.kind === 'ranqueado'
  const title = ranked ? bar.tierName.toUpperCase() : 'EM CLASSIFICAÇÃO'
  const iconWidth = ranked ? 22 : 15
  const meta = ranked ? bar.meta : { text: bar.meta, tone: 'flat' as const }
  const titleWidth = iconWidth + 7 + measure(title, titleFont)
  // Sem espaço ao lado do elo, o texto da direita desce para o rodapé.
  const metaFits = !meta || titleWidth + 8 + measure(meta.text, metaFont) <= inner
  const footText = [!metaFits && meta ? meta.text : '', ranked ? bar.foot : ''].filter(Boolean).join(' · ')
  return { bar, barWidth, inner, title, iconWidth, meta: metaFits ? meta : null, foot: footLines(footText, inner, measure) }
}

function barLayout(parts: NonNullable<ReturnType<typeof barParts>>, top: number): BarLayout {
  const { bar, barWidth, title, iconWidth, meta, foot } = parts
  const box: Box = { x: (STICKER_WIDTH - barWidth) / 2, y: top, w: barWidth, h: barHeight(foot.length) }
  const left = box.x + BAR_PAD_X
  const right = box.x + box.w - BAR_PAD_X
  const rowY = top + BAR_PAD_TOP + BAR_ROW / 2
  const trackY = top + BAR_PAD_TOP + BAR_ROW + BAR_ROW_GAP
  const track: Box = { x: left, y: trackY, w: right - left, h: TRACK_HEIGHT }
  const ranked = bar.kind === 'ranqueado'
  const iconHeight = ranked ? iconWidth * COLISEUM_RATIO : iconWidth
  const iconBox: Box = { x: left, y: rowY - iconHeight / 2, w: iconWidth, h: iconHeight }
  const footTop = trackY + TRACK_HEIGHT + BAR_ROW_GAP
  return {
    box,
    radius: 16,
    icon: ranked ? { kind: 'tier', tier: bar.tier, box: iconBox } : { kind: 'aro', sport: bar.sport, box: iconBox, color: STICKER_COLORS.value },
    title: { text: title, x: left + iconWidth + 7, y: rowY, font: titleFont, color: STICKER_COLORS.value, align: 'left' },
    meta: meta ? { text: meta.text, x: right, y: rowY, font: metaFont, color: meta.tone === 'down' ? STICKER_COLORS.down : STICKER_COLORS.mint, align: 'right' } : null,
    track,
    fill: { ...track, w: track.w * bar.progress, color: ranked ? TIER_COLORS[bar.tier] : STICKER_COLORS.placement },
    foot: foot.map((text, index) => ({ text, x: left, y: footTop + FOOT_LINE * index + FOOT_LINE / 2, font: footFont, color: STICKER_COLORS.foot, align: 'left' })),
  }
}

function signatureLayout(measure: Measure): SignatureLayout {
  const markWidth = 30
  const markHeight = markWidth * COLISEUM_RATIO
  const wordWidth = measure('arena', wordFont)
  const total = markWidth + 8 + wordWidth + 2 + 5
  const left = (STICKER_WIDTH - total) / 2
  const top = STICKER_HEIGHT - SIGNATURE_BOTTOM - SIGNATURE_LINE
  const center = top + SIGNATURE_LINE / 2
  const wordX = left + markWidth + 8
  return {
    mark: { x: left, y: center - markHeight / 2, w: markWidth, h: markHeight },
    word: { text: 'arena', x: wordX, y: center, font: wordFont, color: STICKER_COLORS.value, align: 'left' },
    // O ponto verde fica na base das letras (a linha de base de Sora fica ~0,3 em abaixo do centro).
    dot: { cx: wordX + wordWidth + 2 + 2.5, cy: center + wordFont.size * 0.3 - 3.5, r: 2.5, color: STICKER_COLORS.mint },
  }
}

/** Topo da placa em cada posição: o design ("topo"), o conjunto centrado no quadro ou logo acima da assinatura. */
function plateTop(position: PlatePosition, blockHeight: number): number {
  if (position === 'centro') return (STICKER_HEIGHT - blockHeight) / 2
  if (position === 'base') return STICKER_HEIGHT - SIGNATURE_BOTTOM - SIGNATURE_LINE - BASE_CLEARANCE - blockHeight
  return PLATE_TOP
}

/** Geometria completa do adesivo no quadro de 360×640. */
export function stickerLayout(content: StickerContent, { position = 'topo', measure = approximateMeasure }: { position?: PlatePosition; measure?: Measure } = {}): StickerLayout {
  const plateHeight = PLATE_PAD_TOP + LABEL_LINE + LABEL_GAP + VALUE_LINE + PLATE_PAD_BOTTOM
  const parts = barParts(content, measure)
  const blockHeight = plateHeight + (parts ? GAP + barHeight(parts.foot.length) : 0)
  const top = plateTop(position, blockHeight)
  const plate = plateLayout(content, top, measure)
  return {
    width: STICKER_WIDTH,
    height: STICKER_HEIGHT,
    plate,
    bar: parts ? barLayout(parts, top + plateHeight + GAP) : null,
    signature: signatureLayout(measure),
  }
}

/**
 * Centro vertical, em fração do quadro, da maior faixa livre acima ou abaixo da placa e da barra (até a assinatura): onde
 * o editor põe o "Escolher foto" sem cobrir o adesivo, em qualquer posição da placa.
 */
export function emptySpot({ plate, bar, signature }: StickerLayout): number {
  const top = plate.box.y
  const bottom = bar ? bar.box.y + bar.box.h : plate.box.y + plate.box.h
  const signatureTop = Math.min(signature.mark.y, signature.word.y - signature.word.font.size / 2)
  const center = top >= signatureTop - bottom ? top / 2 : (bottom + signatureTop) / 2
  return center / STICKER_HEIGHT
}

/** Todos os textos do adesivo, na ordem de leitura (testes e conferência). */
export function layoutTexts(layout: StickerLayout): string[] {
  const plate = layout.plate.columns.flatMap(column => [column.label.text, column.value.text, ...(column.unit ? [column.unit.text] : [])])
  const bar = layout.bar ? [layout.bar.title.text, ...(layout.bar.meta ? [layout.bar.meta.text] : []), ...layout.bar.foot.map(item => item.text)] : []
  return [...plate, ...bar, layout.signature.word.text]
}

/** Fontes usadas pelo adesivo, para carregar antes de desenhar. */
export const STICKER_FONTS: readonly FontSpec[] = [labelFont, valueFont(VALUE_SIZE), unitFont(VALUE_SIZE), titleFont, metaFont, footFont, wordFont]

import { SELO_RAIO_DISCO, SELOS_GEOMETRIA } from '@/data/selos'
import type { StickerContent } from './stickerContent'
import {
  EXPORT_SCALE, STICKER_COLORS, STICKER_FONTS, STICKER_HEIGHT, STICKER_WIDTH, TIER_COLORS, stickerLayout,
} from './stickerLayout'
import type { Box, FontSpec, Measure, PlatePosition, StickerLayout, TextItem } from './stickerLayout'

/*
 * Desenho do adesivo em Canvas 2D: uma única função (`drawSticker`) pinta a prévia (escalada ao tamanho da tela) e a
 * exportação (1080×1920), a partir da geometria de `stickerLayout`. O Coliseu da assinatura e o do elo saem do SVG da
 * marca (`public/images/brand/coliseum.svg`) por `Path2D`; o selo com aro da classificação, da geometria de `selos.ts`.
 * Inter e Sora são carregadas (e `document.fonts.ready` aguardado) antes de medir e desenhar.
 *
 * O fundo é uma opção: `transparent` (o PNG do adesivo), `checker` (o xadrez escuro da prévia sem foto) ou uma função
 * que pinta o quadro inteiro antes do adesivo — por onde o editor de foto (ticket 04) entra com a foto enquadrada.
 */

export const COLISEUM_URL = '/images/brand/coliseum.svg'

/** Um trecho do Coliseu: o caminho e a regra de preenchimento do SVG. */
export interface ShapePath { path: Path2D; rule: CanvasFillRule }
export interface StickerAssets { coliseum: ShapePath[] }

/** Fundo do quadro, pintado antes do adesivo no tamanho já escalado (`width`×`height` em pixels do Canvas). */
export type StickerBackground = 'transparent' | 'checker' | ((ctx: CanvasRenderingContext2D, width: number, height: number) => void)

export interface DrawOptions {
  /** Pixels do Canvas por pixel do quadro de 360×640 (3 na exportação). */
  scale: number
  background?: StickerBackground
}

/** Fonte CSS de um texto no tamanho escalado. */
export const fontString = (font: FontSpec, scale = 1) => `${font.weight} ${font.size * scale}px ${font.family}`

/** Caminhos de um SVG de uma cor: cada `d` com a sua `fill-rule`. */
export function parseSvgPaths(svg: string): { d: string; rule: CanvasFillRule }[] {
  const paths: { d: string; rule: CanvasFillRule }[] = []
  for (const match of svg.matchAll(/<path\b([^>]*)\/?>/g)) {
    const attributes = match[1]
    const d = /\sd="([^"]+)"/.exec(attributes)?.[1]
    if (!d) continue
    paths.push({ d, rule: /fill-rule="evenodd"/.test(attributes) ? 'evenodd' : 'nonzero' })
  }
  return paths
}

let coliseumLoad: Promise<ShapePath[]> | null = null

/** Coliseu da marca, lido uma vez por sessão. Sem o arquivo, o adesivo sai sem o símbolo (o texto continua). */
export function loadColiseum(): Promise<ShapePath[]> {
  coliseumLoad ??= fetch(COLISEUM_URL)
    .then(response => (response.ok ? response.text() : ''))
    .then(svg => parseSvgPaths(svg).map(({ d, rule }) => ({ path: new Path2D(d), rule })))
    .catch(() => {
      coliseumLoad = null
      return []
    })
  return coliseumLoad
}

/** Inter e Sora nos pesos do adesivo; sem a API de fontes (testes), segue com a fonte que houver. */
export async function ensureStickerFonts(): Promise<void> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  if (!fonts) return
  await Promise.all(STICKER_FONTS.map(font => fonts.load(fontString(font)).catch(() => []))).catch(() => undefined)
  await fonts.ready
}

/** Fontes e símbolos prontos para desenhar. */
export async function prepareSticker(): Promise<StickerAssets> {
  const [coliseum] = await Promise.all([loadColiseum(), ensureStickerFonts()])
  return { coliseum }
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: number) {
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${value}px`
}

/** Medida do texto pelo próprio Canvas, em pixels do quadro. */
export function canvasMeasure(ctx: CanvasRenderingContext2D): Measure {
  return (text, font) => {
    ctx.font = fontString(font)
    setLetterSpacing(ctx, font.letterSpacing ?? 0)
    return ctx.measureText(text).width
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, box: Box, radius: number, scale: number) {
  const x = box.x * scale
  const y = box.y * scale
  const w = box.w * scale
  const h = box.h * scale
  const r = Math.min(radius * scale, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Painel Floresta: verde-floresta quase opaco com o contorno claro de 1 px por dentro. */
function panel(ctx: CanvasRenderingContext2D, box: Box, radius: number, scale: number) {
  roundedRect(ctx, box, radius, scale)
  ctx.fillStyle = STICKER_COLORS.panel
  ctx.fill()
  roundedRect(ctx, { x: box.x + 0.5, y: box.y + 0.5, w: box.w - 1, h: box.h - 1 }, radius - 0.5, scale)
  ctx.lineWidth = scale
  ctx.strokeStyle = STICKER_COLORS.panelEdge
  ctx.stroke()
}

function text(ctx: CanvasRenderingContext2D, item: TextItem, scale: number) {
  ctx.font = fontString(item.font, scale)
  setLetterSpacing(ctx, (item.font.letterSpacing ?? 0) * scale)
  ctx.fillStyle = item.color
  ctx.textAlign = item.align
  ctx.textBaseline = 'middle'
  ctx.fillText(item.text, item.x * scale, item.y * scale)
}

/** Coliseu (caixa de visão 260×146) dentro de `box`, numa cor só. */
function coliseum(ctx: CanvasRenderingContext2D, assets: StickerAssets, box: Box, color: string, scale: number) {
  if (!assets.coliseum.length) return
  ctx.save()
  ctx.translate(box.x * scale, box.y * scale)
  ctx.scale((box.w * scale) / 260, (box.h * scale) / 146)
  ctx.fillStyle = color
  for (const shape of assets.coliseum) ctx.fill(shape.path, shape.rule)
  ctx.restore()
}

/** Selo da modalidade com aro (o símbolo ocupa 85% da caixa), como o `SportIcon forma="aro"`. */
function aro(ctx: CanvasRenderingContext2D, d: string, box: Box, color: string, scale: number) {
  const side = (2 * SELO_RAIO_DISCO) / 0.85
  ctx.save()
  ctx.translate((box.x + box.w / 2) * scale, (box.y + box.h / 2) * scale)
  ctx.scale((box.w * scale) / side, (box.h * scale) / side)
  ctx.fillStyle = color
  ctx.fill(new Path2D(d))
  ctx.restore()
}

/** Xadrez escuro do fundo transparente (24 px no quadro de 360×640). */
function checker(ctx: CanvasRenderingContext2D, width: number, height: number, scale: number) {
  const cell = 12 * scale
  ctx.fillStyle = '#5d6661'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#6d7671'
  for (let y = 0, row = 0; y < height; y += cell, row++)
    for (let x = (row % 2) * cell; x < width; x += cell * 2) ctx.fillRect(x, y, cell, cell)
}

/**
 * Desenha o adesivo inteiro (fundo, placa, barra do elo e assinatura) no Canvas, na escala dada. Prévia e exportação
 * chamam esta mesma função com escalas diferentes.
 */
export function drawSticker(ctx: CanvasRenderingContext2D, layout: StickerLayout, assets: StickerAssets, { scale, background = 'transparent' }: DrawOptions) {
  const width = layout.width * scale
  const height = layout.height * scale
  ctx.save()
  ctx.clearRect(0, 0, width, height)
  if (background === 'checker') checker(ctx, width, height, scale)
  else if (typeof background === 'function') background(ctx, width, height)

  const { plate, bar, signature } = layout
  panel(ctx, plate.box, plate.radius, scale)
  ctx.fillStyle = STICKER_COLORS.divider
  for (const divider of plate.dividers) ctx.fillRect(divider.x * scale, divider.y * scale, divider.w * scale, divider.h * scale)
  for (const column of plate.columns) {
    text(ctx, column.label, scale)
    text(ctx, column.value, scale)
    if (column.unit) text(ctx, column.unit, scale)
  }

  if (bar) {
    panel(ctx, bar.box, bar.radius, scale)
    if (bar.icon.kind === 'tier') coliseum(ctx, assets, bar.icon.box, TIER_COLORS[bar.icon.tier], scale)
    else aro(ctx, SELOS_GEOMETRIA[bar.icon.sport].simboloComAro, bar.icon.box, bar.icon.color, scale)
    text(ctx, bar.title, scale)
    if (bar.meta) text(ctx, bar.meta, scale)
    roundedRect(ctx, bar.track, bar.track.h / 2, scale)
    ctx.fillStyle = STICKER_COLORS.track
    ctx.fill()
    if (bar.fill.w > 0) {
      roundedRect(ctx, bar.fill, bar.fill.h / 2, scale)
      ctx.fillStyle = bar.fill.color
      ctx.fill()
    }
    for (const line of bar.foot) text(ctx, line, scale)
  }

  // Assinatura sem caixa: Coliseu e `arena.` em branco, com sombra para ler sobre qualquer foto.
  ctx.shadowColor = STICKER_COLORS.shadow
  ctx.shadowBlur = 8 * scale
  ctx.shadowOffsetY = 2 * scale
  coliseum(ctx, assets, signature.mark, STICKER_COLORS.value, scale)
  text(ctx, signature.word, scale)
  ctx.beginPath()
  ctx.arc(signature.dot.cx * scale, signature.dot.cy * scale, signature.dot.r * scale, 0, Math.PI * 2)
  ctx.fillStyle = signature.dot.color
  ctx.fill()
  ctx.restore()
}

/** Geometria medida pelo Canvas (no navegador) para o conteúdo e a posição da placa. */
export function measuredLayout(ctx: CanvasRenderingContext2D, content: StickerContent, position: PlatePosition = 'topo'): StickerLayout {
  ctx.save()
  const layout = stickerLayout(content, { position, measure: canvasMeasure(ctx) })
  ctx.restore()
  return layout
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem.'))), type, quality)
  })
}

/** PNG 1080×1920 só com o adesivo, de fundo transparente. */
export async function stickerPng(content: StickerContent, position: PlatePosition = 'topo'): Promise<Blob> {
  const assets = await prepareSticker()
  const canvas = document.createElement('canvas')
  canvas.width = STICKER_WIDTH * EXPORT_SCALE
  canvas.height = STICKER_HEIGHT * EXPORT_SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível gerar a imagem.')
  drawSticker(ctx, measuredLayout(ctx, content, position), assets, { scale: EXPORT_SCALE, background: 'transparent' })
  return toBlob(canvas, 'image/png')
}

/** Baixa o arquivo por `<a download>` com uma URL de Blob, liberada logo depois. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

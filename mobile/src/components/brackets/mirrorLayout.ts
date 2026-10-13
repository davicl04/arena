import type { BracketNode, BracketRound, BracketSlot } from '../../api/brackets'

/*
 * Geometria da árvore espelhada (T2 do protótipo de Times; porta de `web/src/components/brackets/mirrorLayout.ts`): as
 * fases de fora para dentro de cada lado, as semifinais junto da final e a final no centro. Função pura: recebe as rodadas
 * da API (da primeira fase à final) e devolve a posição e o tamanho de cada coluna e de cada confronto, mais o caminho dos
 * conectores.
 *
 * Duas medidas de coluna: a `ROOMY` (a da web, 354 pt com 8 lugares) e a `COMPACT`, que cabe em 320 pt com 8 lugares
 * (300 pt). `chooseMetrics` escolhe a que cabe na largura disponível; com 16 lugares nenhuma cabe e a árvore rola na
 * horizontal dentro do quadro.
 */

export interface MirrorMetrics {
  /** Larguras: primeira fase, fases intermediárias, final e espaço entre colunas. */
  firstW: number
  midW: number
  finalW: number
  gap: number
}

export const ROOMY: MirrorMetrics = { firstW: 58, midW: 54, finalW: 74, gap: 14 }
export const COMPACT: MirrorMetrics = { firstW: 52, midW: 50, finalW: 64, gap: 8 }

export const HEAD_H = 30
export const NODE_H = 126
export const NODE_GAP = 14
export const FINAL_H = 176
/** Altura de cada lado do confronto (escudo, sigla e respiro), espaço entre os dois lados e escudo (largura × altura). */
export const SLOT_H = 46
export const SLOT_GAP = 12
export const CREST_W = 26
export const CREST_H = 29
const BOTTOM = 14

/** Distância do topo do confronto ao primeiro escudo: a final tem o troféu e o título acima. */
export const slotOffset = (final: boolean) => (final ? 64 : 20)

export type MirrorSide = 'left' | 'right' | 'center'
export interface PlacedNode {
  node: BracketNode
  /** Índice da fase (0 = primeira) e posição dentro dela (0 a n-1). */
  round: number
  index: number
  side: MirrorSide
  x: number
  y: number
  w: number
  h: number
}
export interface PlacedColumn { round: number; side: MirrorSide; x: number; w: number }
export interface MirrorLayout { width: number; height: number; nodes: PlacedNode[]; columns: PlacedColumn[]; connectors: string[]; metrics: MirrorMetrics }

/** Largura da árvore para `total` fases (a final conta como uma). Sem fases, 0. */
export function layoutWidth(total: number, metrics: MirrorMetrics = ROOMY): number {
  if (total <= 0) return 0
  const sideRounds = total - 1
  if (sideRounds === 0) return metrics.finalW
  return metrics.finalW + 2 * (metrics.firstW + (sideRounds - 1) * metrics.midW) + 2 * sideRounds * metrics.gap
}

/** A medida mais folgada que cabe em `available` pontos; se nenhuma cabe, a folgada (a árvore rola na horizontal). */
export function chooseMetrics(total: number, available: number): MirrorMetrics {
  if (layoutWidth(total, ROOMY) <= available) return ROOMY
  return layoutWidth(total, COMPACT) <= available ? COMPACT : ROOMY
}

/** Cotovelo horizontal com cantos arredondados, entre a saída de um confronto e a entrada do seguinte. */
function elbow(x1: number, y1: number, x2: number, y2: number, radius = 8): string {
  if (Math.abs(y1 - y2) < 1) return `M${x1} ${y1}H${x2}`
  const xm = (x1 + x2) / 2
  const down = y2 > y1 ? 1 : -1
  const dir = x2 > x1 ? 1 : -1
  const r = Math.min(radius, Math.abs(y2 - y1) / 2, Math.abs(xm - x1))
  return `M${x1} ${y1}H${xm - dir * r}Q${xm} ${y1} ${xm} ${y1 + down * r}V${y2 - down * r}Q${xm} ${y2} ${xm + dir * r} ${y2}H${x2}`
}

export function mirrorLayout(rounds: BracketRound[], metrics: MirrorMetrics = ROOMY): MirrorLayout {
  const total = rounds.length
  if (total === 0) return { width: 0, height: 0, nodes: [], columns: [], connectors: [], metrics }
  const sideRounds = total - 1
  const widthOf = (round: number) => (round === 0 ? metrics.firstW : metrics.midW)

  // Colunas da esquerda (primeira fase para dentro), a final e a direita (de dentro para fora).
  const columns: PlacedColumn[] = []
  let x = 0
  for (let round = 0; round < sideRounds; round++) {
    columns.push({ round, side: 'left', x, w: widthOf(round) })
    x += widthOf(round) + metrics.gap
  }
  columns.push({ round: total - 1, side: 'center', x, w: metrics.finalW })
  x += metrics.finalW + metrics.gap
  for (let round = sideRounds - 1; round >= 0; round--) {
    columns.push({ round, side: 'right', x, w: widthOf(round) })
    x += widthOf(round) + metrics.gap
  }
  const width = x - metrics.gap

  // Alturas: a primeira fase de cada metade empilhada; as seguintes ao centro dos dois confrontos que as alimentam.
  const centerY = new Map<string, number>()
  const key = (round: number, index: number) => `${round}:${index}`
  const nodes: PlacedNode[] = []
  const place = (round: number, index: number, side: MirrorSide, cy: number): PlacedNode => {
    const column = columns.find(item => item.round === round && item.side === side)!
    const h = side === 'center' ? FINAL_H : NODE_H
    centerY.set(key(round, index), cy)
    const placed = { node: rounds[round].nodes[index], round, index, side, x: column.x, y: cy - h / 2, w: column.w, h }
    nodes.push(placed)
    return placed
  }
  const firstCount = rounds[0].nodes.length
  if (total === 1) {
    place(0, 0, 'center', FINAL_H / 2)
  } else {
    const half = firstCount / 2
    for (let index = 0; index < firstCount; index++) {
      const side = index < half ? 'left' : 'right'
      const row = index < half ? index : index - half
      place(0, index, side, NODE_H / 2 + row * (NODE_H + NODE_GAP))
    }
    for (let round = 1; round < total; round++) {
      const count = rounds[round].nodes.length
      for (let index = 0; index < count; index++) {
        const feeders = [centerY.get(key(round - 1, 2 * index)), centerY.get(key(round - 1, 2 * index + 1))]
        const known = feeders.filter((value): value is number => value !== undefined)
        const cy = known.reduce((sum, value) => sum + value, 0) / (known.length || 1)
        const side = round === total - 1 ? 'center' : index < count / 2 ? 'left' : 'right'
        place(round, index, side, cy)
      }
    }
  }

  // A final pode ser mais alta que a metade da chave (4 lugares): desloca tudo para que nada fique acima da faixa de títulos.
  const top = Math.min(...nodes.map(item => item.y))
  const shift = HEAD_H - top + 8
  for (const item of nodes) item.y += shift
  const height = Math.max(...nodes.map(item => item.y + item.h)) + BOTTOM

  const find = (round: number, index: number) => nodes.find(item => item.round === round && item.index === index)!
  const connectors: string[] = []
  for (const item of nodes) {
    const target = item.node.next
    if (!target) continue
    const next = find(target.round - 1, target.position - 1)
    if (!next) continue
    const fromY = item.y + item.h / 2
    const toY = next.y + next.h / 2
    if (item.side === 'left') connectors.push(elbow(item.x + item.w, fromY, next.x, toY))
    else if (item.side === 'right') connectors.push(elbow(item.x, fromY, next.x + next.w, toY))
  }
  return { width, height, nodes, columns, connectors, metrics }
}

/** Retângulo de um dos dois lados do confronto: onde ficam o escudo, a sigla e o toque da troca. */
export interface SlotBox { slot: BracketSlot; index: 0 | 1; x: number; y: number; w: number; h: number }
export function slotBoxes(placed: PlacedNode): [SlotBox, SlotBox] {
  const first = placed.y + slotOffset(placed.side === 'center')
  const make = (index: 0 | 1): SlotBox => ({ slot: placed.node.slots[index], index, x: placed.x, y: first + index * (SLOT_H + SLOT_GAP), w: placed.w, h: SLOT_H })
  return [make(0), make(1)]
}

const round1 = (value: number) => Math.round(value * 10) / 10

/** Contorno do escudo (viewBox 40×44 dos protótipos) já na posição `x`, `y` e no tamanho do escudo da árvore (26×29). */
export function shieldPath(x: number, y: number, width = CREST_W, height = CREST_H): string {
  const px = (value: number) => round1(x + (value * width) / 40)
  const py = (value: number) => round1(y + (value * height) / 44)
  return `M${px(20)} ${py(2)}L${px(37)} ${py(8)}V${py(21)}C${px(37)} ${py(31)} ${px(29)} ${py(38)} ${px(20)} ${py(42)}C${px(11)} ${py(38)} ${px(3)} ${py(31)} ${px(3)} ${py(21)}V${py(8)}Z`
}

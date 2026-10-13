import type { BracketNode, BracketRound } from '@/api/brackets'

/*
 * Geometria da árvore espelhada (T2 do protótipo de Times): as fases de fora para dentro de cada lado, as semifinais
 * junto da final e a final no centro. Função pura: recebe as rodadas da API (da primeira fase à final) e devolve a
 * posição e o tamanho de cada coluna e de cada confronto, mais o caminho dos conectores. Com 8 lugares a árvore mede
 * 354 px de largura (cabe em 390 px); com 16, passa de 480 px e rola na horizontal.
 */

export const FIRST_W = 58
export const MID_W = 54
export const FINAL_W = 74
export const GAP = 14
export const HEAD_H = 30
export const NODE_H = 126
export const NODE_GAP = 14
export const FINAL_H = 176
const BOTTOM = 14

export interface PlacedNode {
  node: BracketNode
  /** Índice da fase (0 = primeira) e posição dentro dela (0 a n-1). */
  round: number
  index: number
  side: 'left' | 'right' | 'center'
  x: number
  y: number
  w: number
  h: number
}
export interface PlacedColumn { round: number; side: 'left' | 'right' | 'center'; x: number; w: number }
export interface MirrorLayout { width: number; height: number; nodes: PlacedNode[]; columns: PlacedColumn[]; connectors: string[] }

/** Cotovelo horizontal com cantos arredondados, entre a saída de um confronto e a entrada do seguinte. */
function elbow(x1: number, y1: number, x2: number, y2: number, radius = 8): string {
  if (Math.abs(y1 - y2) < 1) return `M${x1} ${y1}H${x2}`
  const xm = (x1 + x2) / 2
  const down = y2 > y1 ? 1 : -1
  const dir = x2 > x1 ? 1 : -1
  const r = Math.min(radius, Math.abs(y2 - y1) / 2, Math.abs(xm - x1))
  return `M${x1} ${y1}H${xm - dir * r}Q${xm} ${y1} ${xm} ${y1 + down * r}V${y2 - down * r}Q${xm} ${y2} ${xm + dir * r} ${y2}H${x2}`
}

export function mirrorLayout(rounds: BracketRound[]): MirrorLayout {
  const total = rounds.length
  if (total === 0) return { width: 0, height: 0, nodes: [], columns: [], connectors: [] }
  const sideRounds = total - 1
  const widthOf = (round: number) => (round === 0 ? FIRST_W : MID_W)

  // Colunas da esquerda (primeira fase para dentro), a final e a direita (de dentro para fora).
  const columns: PlacedColumn[] = []
  let x = 0
  for (let round = 0; round < sideRounds; round++) {
    columns.push({ round, side: 'left', x, w: widthOf(round) })
    x += widthOf(round) + GAP
  }
  columns.push({ round: total - 1, side: 'center', x, w: FINAL_W })
  x += FINAL_W + GAP
  for (let round = sideRounds - 1; round >= 0; round--) {
    columns.push({ round, side: 'right', x, w: widthOf(round) })
    x += widthOf(round) + GAP
  }
  const width = x - GAP

  // Alturas: a primeira fase de cada metade empilhada; as seguintes ao centro dos dois confrontos que as alimentam.
  const centerY = new Map<string, number>()
  const key = (round: number, index: number) => `${round}:${index}`
  const nodes: PlacedNode[] = []
  const place = (round: number, index: number, side: PlacedNode['side'], cy: number): PlacedNode => {
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
  return { width, height, nodes, columns, connectors }
}

import { describe, expect, it } from 'vitest'
import {
  COMPACT, FINAL_H, HEAD_H, NODE_H, ROOMY, SLOT_GAP, SLOT_H, chooseMetrics, layoutWidth, mirrorLayout, shieldPath, slotBoxes, slotOffset,
} from '../src/components/brackets/mirrorLayout'
import { eliminationBracket, eightTeams, sixTeams } from './support/brackets'

/*
 * Geometria da árvore espelhada (T2): função pura sobre as rodadas da API. Com 8 lugares a árvore cabe em 320 pt na medida
 * compacta (300 pt) e mede 354 pt na folgada; com 16 passa de 320 pt e rola na horizontal.
 */

const sixteen = Array.from({ length: 16 }, (_, index) => `Time ${index + 1}`)
const four = ['Novo Horizonte', 'Bola Murcha FC', 'Atlético Guará', 'Unidos do Lago']

describe('larguras da árvore', () => {
  it('8 lugares: 354 pt na medida folgada e 300 pt na compacta, que cabe em 320 pt com a margem', () => {
    const rounds = eliminationBracket(eightTeams).rounds
    expect(layoutWidth(rounds.length, ROOMY)).toBe(354)
    expect(layoutWidth(rounds.length, COMPACT)).toBe(300)
    expect(mirrorLayout(rounds, ROOMY).width).toBe(354)
    expect(mirrorLayout(rounds, COMPACT).width).toBe(300)
    expect(mirrorLayout(rounds, COMPACT).width).toBeLessThanOrEqual(320 - 16)
  })

  it('16 lugares passam de 390 pt, nenhuma medida cabe em 320 pt e a árvore rola; 4 e 2 lugares têm menos colunas', () => {
    const rounds = eliminationBracket(sixteen).rounds
    expect(rounds).toHaveLength(4)
    expect(layoutWidth(4, ROOMY)).toBe(490)
    expect(layoutWidth(4, COMPACT)).toBe(416)
    expect(mirrorLayout(rounds).width).toBeGreaterThan(390)
    expect(layoutWidth(2, ROOMY)).toBe(218)
    expect(layoutWidth(1, ROOMY)).toBe(ROOMY.finalW)
    expect(layoutWidth(0)).toBe(0)
    expect(mirrorLayout(eliminationBracket(four).rounds).columns).toHaveLength(3)
    expect(mirrorLayout(eliminationBracket(['Novo Horizonte', 'Bola Murcha FC']).rounds).columns).toHaveLength(1)
  })

  it('escolhe a medida mais folgada que cabe e cai na folgada (com rolagem) quando nenhuma cabe', () => {
    expect(chooseMetrics(3, 390 - 16)).toBe(ROOMY)
    expect(chooseMetrics(3, 320 - 16)).toBe(COMPACT)
    expect(chooseMetrics(3, 290)).toBe(ROOMY)
    expect(chooseMetrics(4, 320 - 16)).toBe(ROOMY)
    expect(chooseMetrics(4, 430)).toBe(COMPACT)
    expect(chooseMetrics(4, 500)).toBe(ROOMY)
    expect(chooseMetrics(2, 230)).toBe(ROOMY)
    expect(chooseMetrics(2, 200)).toBe(COMPACT)
    expect(chooseMetrics(2, 150)).toBe(ROOMY)
  })
})

describe('posição dos confrontos', () => {
  const layout = mirrorLayout(eliminationBracket(eightTeams).rounds)

  it('quartas dos dois lados, semifinais ao centro dos lados e a final no meio', () => {
    expect(layout.nodes).toHaveLength(7)
    const bySide = (side: string) => layout.nodes.filter(item => item.side === side)
    expect(bySide('left').map(item => item.round)).toEqual([0, 0, 1])
    expect(bySide('right').map(item => item.round)).toEqual([0, 0, 1])
    const [final] = bySide('center')
    expect(final.round).toBe(2)
    expect(final.h).toBe(FINAL_H)
    expect(layout.columns.map(column => `${column.side}${column.round}`)).toEqual(['left0', 'left1', 'center2', 'right1', 'right0'])
    // A esquerda fica antes da final e a direita depois; nenhuma coluna passa da largura.
    for (const item of bySide('left')) expect(item.x + item.w).toBeLessThanOrEqual(final.x)
    for (const item of bySide('right')) expect(item.x).toBeGreaterThanOrEqual(final.x + final.w)
    for (const item of layout.nodes) expect(item.x + item.w).toBeLessThanOrEqual(layout.width)
  })

  it('as quartas se empilham e cada fase seguinte fica no meio dos dois confrontos que a alimentam', () => {
    const left = layout.nodes.filter(item => item.side === 'left')
    const [first, second, semi] = left
    expect(second.y - first.y).toBe(NODE_H + 14)
    expect(semi.y + semi.h / 2).toBeCloseTo((first.y + first.h / 2 + second.y + second.h / 2) / 2)
    const [final] = layout.nodes.filter(item => item.side === 'center')
    const semis = layout.nodes.filter(item => item.round === 1)
    expect(final.y + final.h / 2).toBeCloseTo((semis[0].y + semis[0].h / 2 + semis[1].y + semis[1].h / 2) / 2)
  })

  it('nada fica acima da faixa de títulos, nem a final mais alta da chave de 4 lugares, e a altura cobre tudo', () => {
    for (const places of [eightTeams, four, sixteen]) {
      const placed = mirrorLayout(eliminationBracket(places).rounds)
      expect(Math.min(...placed.nodes.map(item => item.y))).toBeGreaterThanOrEqual(HEAD_H)
      expect(placed.height).toBeGreaterThan(Math.max(...placed.nodes.map(item => item.y + item.h)))
    }
  })

  it('um conector para cada confronto que tem para onde mandar o vencedor (todos menos a final)', () => {
    expect(layout.connectors).toHaveLength(6)
    for (const path of layout.connectors) expect(path).toMatch(/^M[\d.]+ [\d.]+H/)
    expect(mirrorLayout(eliminationBracket(sixteen).rounds).connectors).toHaveLength(14)
    // Dois lugares: só a final, sem conectores.
    expect(mirrorLayout(eliminationBracket(['Novo Horizonte', 'Bola Murcha FC']).rounds).connectors).toEqual([])
  })

  it('6 confirmados: as duas folgas continuam na primeira fase, como confrontos de folga', () => {
    const six = mirrorLayout(eliminationBracket(sixTeams).rounds)
    const firstRound = six.nodes.filter(item => item.round === 0)
    expect(firstRound).toHaveLength(4)
    expect(firstRound.filter(item => item.node.bye).map(item => item.index)).toEqual([0, 2])
    // As fases seguintes têm o "Vencedor J1" onde a folga não passou ninguém, e o competidor onde passou.
    expect(six.nodes.find(item => item.round === 1 && item.index === 0)!.node.slots[0].advanced_by_bye).toBe(true)
  })

  it('sem rodadas devolve uma árvore vazia', () => {
    expect(mirrorLayout([])).toMatchObject({ width: 0, height: 0, nodes: [], columns: [], connectors: [] })
  })
})

describe('retângulos e escudos', () => {
  it('cada lado do confronto tem 46 pt de altura (alvo de toque de 44 pt) e a final começa mais abaixo, por causa do troféu', () => {
    const layout = mirrorLayout(eliminationBracket(eightTeams).rounds)
    const normal = layout.nodes[0]
    const [a, b] = slotBoxes(normal)
    expect(a.y).toBe(normal.y + slotOffset(false))
    expect(b.y - a.y).toBe(SLOT_H + SLOT_GAP)
    expect(a.h).toBeGreaterThanOrEqual(44)
    expect(a.w).toBe(ROOMY.firstW)
    const final = layout.nodes.find(item => item.side === 'center')!
    expect(slotBoxes(final)[0].y).toBe(final.y + slotOffset(true))
    expect(slotOffset(true)).toBeGreaterThan(slotOffset(false))
    // O segundo lado cabe dentro do confronto.
    expect(b.y + b.h).toBeLessThanOrEqual(normal.y + normal.h + 4)
  })

  it('o contorno do escudo é um caminho fechado na posição e no tamanho pedidos', () => {
    const path = shieldPath(10, 20)
    expect(path.startsWith('M')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
    expect(path).toBe(shieldPath(10, 20, 26, 29))
    expect(shieldPath(0, 0, 40, 44)).toContain('M20 2')
  })
})

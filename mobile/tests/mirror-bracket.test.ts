import React from 'react'
import * as SecureStore from 'expo-secure-store'
import { act } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import { MirrorBracket } from '../src/components/brackets/MirrorBracket'
import { enableAct } from './support/native'
import { competitor, eightTeams, eliminationBracket, score, sixTeams } from './support/brackets'
import { findByPrefix, pressables, render } from './support/review'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

/*
 * Árvore espelhada em react-native-svg: a medida se ajusta à largura (8 lugares cabem em 320 pt; 16 rolam), o desenho tem a
 * final escura com o troféu e o contorno dourado, e a troca de lugares usa botões de 44 pt sobre a primeira fase.
 */

const h = React.createElement
const trees: ReactTestRenderer[] = []
afterEach(async () => { for (const tree of trees.splice(0)) await act(async () => { tree.unmount() }) })
beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})

async function mount(props: React.ComponentProps<typeof MirrorBracket>) {
  const tree = await render(h(MirrorBracket, props))
  trees.push(tree)
  return tree
}
const svgTexts = (tree: ReactTestRenderer) => tree.root.findAllByType('SvgText' as never).map(node => String(node.props.children))
const canvas = (tree: ReactTestRenderer) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'mirror-canvas')[0]
const scroll = (tree: ReactTestRenderer) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'mirror-scroll')[0]
const image = (tree: ReactTestRenderer) => tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'image')[0]
const sixteen = Array.from({ length: 16 }, (_, index) => `Time ${index + 1}`)

describe('largura', () => {
  it('8 lugares em 320 pt: a medida compacta cabe (300 pt), sem rolagem', async () => {
    const tree = await mount({ bracket: eliminationBracket(eightTeams), width: 320 })
    expect(canvas(tree).props.style.width).toBe(300)
    expect(scroll(tree).props.showsHorizontalScrollIndicator).toBe(false)
    expect(scroll(tree).props.accessibilityLabel).toBeUndefined()
  })

  it('8 lugares em 390 pt usam a medida folgada (354 pt)', async () => {
    const tree = await mount({ bracket: eliminationBracket(eightTeams), width: 390 })
    expect(canvas(tree).props.style.width).toBe(354)
  })

  it('16 lugares rolam na horizontal dentro do quadro, e o quadro avisa', async () => {
    const tree = await mount({ bracket: eliminationBracket(sixteen), width: 320 })
    expect(canvas(tree).props.style.width).toBe(490)
    expect(scroll(tree).props.horizontal).toBe(true)
    expect(scroll(tree).props.showsHorizontalScrollIndicator).toBe(true)
    expect(scroll(tree).props.accessibilityLabel).toContain('role para os lados')
  })

  it('sem rodadas não desenha nada', async () => {
    const tree = await mount({ bracket: eliminationBracket(eightTeams, { rounds: [] }) })
    expect(tree.toJSON()).toBeNull()
  })
})

describe('desenho', () => {
  it('imagem rotulada com os lugares e as folgas; colunas, rótulos J, final, siglas e "Venc. J"', async () => {
    const tree = await mount({ bracket: eliminationBracket(sixTeams, { size: 8, byes: 2 }) })
    expect(image(tree).props.accessibilityLabel).toBe('Árvore do chaveamento: 8 lugares, 2 folgas. Os confrontos estão na lista por rodada logo abaixo.')
    const texts = svgTexts(tree)
    expect(texts).toContain('FINAL')
    for (const label of ['J1', 'J2', 'J3', 'J4', 'J5']) expect(texts).toContain(label)
    expect(texts).toEqual(expect.arrayContaining(['QUARTAS', 'SEMI', 'FINAL']))
    expect(texts.filter(text => text === 'Folga')).toHaveLength(2)
    expect(texts).toContain('Venc. J1')
    expect(texts).toContain('NH')
    // O jogo de folga não ganha rótulo J: seis lugares e duas folgas têm 5 jogos reais.
    expect(texts.filter(text => /^J\d+$/.test(text))).toHaveLength(5)
  })

  it('a final tem o fundo escuro e o contorno dourado; os demais confrontos são brancos', async () => {
    const tree = await mount({ bracket: eliminationBracket(eightTeams) })
    const rects = tree.root.findAllByType('Rect' as never).map(node => node.props)
    expect(rects.filter(rect => rect.fill === '#0b2218' && rect.rx === 16)).toHaveLength(1)
    expect(rects.filter(rect => rect.stroke === '#d9a937')).toHaveLength(1)
    expect(rects.filter(rect => rect.fill === '#ffffff' && rect.rx === 16)).toHaveLength(6)
    // Um conector para cada confronto menos a final.
    expect(tree.root.findAllByType('Path' as never).filter(node => String(node.props.d).startsWith('M') && node.props.strokeLinecap === 'round')).toHaveLength(6)
  })

  it('mostra os placares e a lista de confrontos tem o resultado; o desenho destaca o vencedor', async () => {
    const bracket = eliminationBracket(eightTeams, {}, true)
    const first = bracket.rounds[0].nodes[0]
    first.match = { ...first.match!, state: 'encerrada', phase: 'encerrada', score: score(3, 1) }
    first.slots[0].winner = true
    const tree = await mount({ bracket })
    const texts = svgTexts(tree)
    expect(texts).toContain('3')
    expect(texts).toContain('1')
    const winner = tree.root.findAllByType('SvgText' as never).find(node => String(node.props.children) === '3')!
    const loser = tree.root.findAllByType('SvgText' as never).find(node => String(node.props.children) === '1')!
    expect(winner.props.fill).toBe('#005a36')
    expect(loser.props.fill).not.toBe(winner.props.fill)
  })

  it('tênis: os atletas aparecem com as iniciais do nome', async () => {
    const bracket = eliminationBracket(['Ana Souza', 'Beatriz Lima'], { sport: 'tenis', format: null, size: 2 })
    bracket.rounds[0].nodes[0].slots[0].competitor = competitor(1, 'Ana Souza', 0, 'atleta')
    bracket.rounds[0].nodes[0].slots[1].competitor = competitor(2, 'Beatriz Lima', 1, 'atleta')
    const tree = await mount({ bracket })
    expect(svgTexts(tree)).toEqual(expect.arrayContaining(['AS', 'BL']))
  })
})

describe('troca de lugares', () => {
  it('sem onPick não há botões; com onPick, um botão de 44 pt ou mais para cada lugar da primeira fase', async () => {
    const readOnly = await mount({ bracket: eliminationBracket(eightTeams) })
    expect(pressables(readOnly)).toHaveLength(0)
    const onPick = vi.fn()
    const tree = await mount({ bracket: eliminationBracket(eightTeams), onPick })
    expect(pressables(tree)).toHaveLength(8)
    for (const button of pressables(tree)) {
      expect(button.props.accessibilityRole).toBe('button')
      expect(button.props.style.height).toBeGreaterThanOrEqual(44)
      expect(button.props.style.width).toBeGreaterThanOrEqual(44)
    }
    await act(async () => { findByPrefix(tree, 'Atlético Guará, lugar 3 da chave')!.props.onPress() })
    expect(onPick).toHaveBeenCalledWith(2)
  })

  it('o lugar escolhido fica marcado e dizem o que o próximo toque faz; ocupado, os botões ficam desabilitados', async () => {
    const tree = await mount({ bracket: eliminationBracket(eightTeams), picked: 1, onPick: vi.fn() })
    const chosen = findByPrefix(tree, 'Bola Murcha FC, lugar 2 da chave, escolhido')!
    expect(chosen.props.accessibilityLabel).toContain('Toque de novo para cancelar.')
    expect(chosen.props.accessibilityState).toMatchObject({ selected: true })
    expect(findByPrefix(tree, 'Novo Horizonte, lugar 1 da chave')!.props.accessibilityLabel).toContain('Toque para trocar com o escolhido.')
    // O lugar escolhido ganha o realce menta no desenho.
    expect(tree.root.findAllByType('Rect' as never).filter(node => node.props.stroke === '#005a36' && node.props.fillOpacity === 0.25)).toHaveLength(1)
    const busy = await mount({ bracket: eliminationBracket(eightTeams), onPick: vi.fn(), busy: true })
    expect(pressables(busy).every(button => button.props.disabled)).toBe(true)
  })

  it('a folga também é um lugar que se pode escolher; o lugar sem número (fases seguintes) não tem botão', async () => {
    const tree = await mount({ bracket: eliminationBracket(sixTeams), onPick: vi.fn() })
    expect(findByPrefix(tree, 'Folga, lugar 2 da chave')).toBeTruthy()
    expect(pressables(tree)).toHaveLength(8)
  })
})

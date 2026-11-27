import React from 'react'
import { act } from 'react-test-renderer'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sport } from '../src/api/client'
import { RoundTile, SeloTile } from '../src/components/arena/RoundTile'
import { SportIcon } from '../src/components/arena/SportIcon'
import { Campeonatos } from '../src/components/home/Campeonatos'
import { TimelineHeader } from '../src/components/profile-matches/TimelineHeader'
import { CategoryCard } from '../src/components/ranking/CategoryCard'
import { CategorySheet } from '../src/components/ranking/CategorySheet'
import type { CategoryChoice } from '../src/components/ranking/category'
import { SELO_COROA, SELO_RAIO_DISCO, SELO_VIEWBOX, SELOS_GEOMETRIA, SIMBOLO_VIEWBOX } from '../src/data/selos'
import { darkColors, lightColors } from '../src/theme'
import { eventCard } from './support/events'
import { appearance, byLabel, enableAct, press } from './support/native'
import { byId, render } from './support/review'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

const h = React.createElement
const SPORTS: Sport[] = ['futebol', 'tenis', 'corrida']
const of = (root: ReactTestInstance, type: string) => root.findAllByType(type as never)
const icon = (tree: ReactTestRenderer, sport: Sport) => byId(tree, `sport-icon-${sport}`)[0]
/** Cores pintadas no selo: o disco e os detalhes (coroa e símbolo). */
const seloPaint = (root: ReactTestInstance) => ({ disc: of(root, 'Circle')[0].props.fill, details: of(root, 'Path').map(path => path.props.fill) })
/** O ícone continua decorativo: fora da árvore de acessibilidade, com os descendentes ocultos. */
const expectHidden = (node: ReactTestInstance) => {
  expect(node.props.accessible).toBe(false)
  expect(node.props.importantForAccessibility).toBe('no-hide-descendants')
  expect(node.props.accessibilityElementsHidden).toBe(true)
}

beforeEach(() => {
  enableAct()
  appearance.reset()
})

describe('SportIcon: as três formas vetoriais', () => {
  it.each(SPORTS)('selo de %s: disco, coroa e símbolo da geometria gerada, sem PNG', async sport => {
    const tree = await render(h(SportIcon, { sport, shape: 'selo', size: 30 }))
    const root = icon(tree, sport)
    const svg = of(root, 'Svg')[0]
    expect(svg.props).toMatchObject({ width: 30, height: 30, viewBox: SELO_VIEWBOX })
    expect(of(root, 'Circle')[0].props).toMatchObject({ cx: 0, cy: 0, r: SELO_RAIO_DISCO })
    expect(of(root, 'Path').map(path => path.props.d)).toEqual([SELO_COROA, SELOS_GEOMETRIA[sport].simbolo])
    expect(of(tree.root, 'Image')).toHaveLength(0)
    expectHidden(root)
  })

  it.each(SPORTS)('símbolo com aro de %s: um caminho na cor pedida, a 0,85 da caixa', async sport => {
    const tree = await render(h(SportIcon, { sport, shape: 'aro', size: 20, color: '#04100a' }))
    const root = icon(tree, sport)
    expect(root.props.style).toMatchObject({ width: 20, height: 20 })
    expect(of(root, 'Svg')[0].props).toMatchObject({ width: 17, height: 17, viewBox: SELO_VIEWBOX })
    expect(of(root, 'Circle')).toHaveLength(0)
    expect(of(root, 'Path').map(path => [path.props.d, path.props.fill])).toEqual([[SELOS_GEOMETRIA[sport].simboloComAro, '#04100a']])
    expect(of(tree.root, 'Image')).toHaveLength(0)
    expectHidden(root)
  })

  it.each(SPORTS)('marca d\'água de %s: só o símbolo, na cor pedida, na caixa do símbolo', async sport => {
    const tree = await render(h(SportIcon, { sport, shape: 'marca', size: 150, color: '#ffffff' }))
    const root = icon(tree, sport)
    expect(of(root, 'Svg')[0].props).toMatchObject({ width: 150, height: 150, viewBox: SIMBOLO_VIEWBOX })
    expect(of(root, 'Circle')).toHaveLength(0)
    expect(of(root, 'Path').map(path => [path.props.d, path.props.fill])).toEqual([[SELOS_GEOMETRIA[sport].simbolo, '#ffffff']])
    expect(of(tree.root, 'Image')).toHaveLength(0)
    expectHidden(root)
  })

  it('a forma vem só de `shape`: a medida não troca o desenho', async () => {
    const small = await render(h(SportIcon, { sport: 'tenis', shape: 'selo', size: 14 }))
    expect(of(small.root, 'Circle')).toHaveLength(1)
    const big = await render(h(SportIcon, { sport: 'tenis', shape: 'aro', size: 150, color: '#ffffff' }))
    expect(of(big.root, 'Circle')).toHaveLength(0)
    expect(of(big.root, 'Path')[0].props.d).toBe(SELOS_GEOMETRIA.tenis.simboloComAro)
  })
})

describe('SportIcon: cores do selo por tema', () => {
  it('claro: disco #153a2b e detalhes brancos; escuro: disco #16201b e detalhes dourados, trocando ao vivo', async () => {
    expect([lightColors['selo-disco'], lightColors['selo-detalhe']]).toEqual(['#153a2b', '#ffffff'])
    expect([darkColors['selo-disco'], darkColors['selo-detalhe']]).toEqual(['#16201b', '#F4DE9A'])
    const tree = await render(h(SportIcon, { sport: 'futebol', shape: 'selo', size: 30 }))
    expect(seloPaint(tree.root)).toEqual({ disc: '#153a2b', details: ['#ffffff', '#ffffff'] })
    await act(async () => { appearance.setSystem('dark') })
    expect(seloPaint(tree.root)).toEqual({ disc: '#16201b', details: ['#F4DE9A', '#F4DE9A'] })
    await act(async () => { appearance.setSystem('light') })
    expect(seloPaint(tree.root)).toEqual({ disc: '#153a2b', details: ['#ffffff', '#ffffff'] })
  })

  it('o símbolo com aro e a marca d\'água ficam na cor do contexto nos dois temas', async () => {
    appearance.setSystem('dark')
    const tree = await render(h(SportIcon, { sport: 'corrida', shape: 'aro', size: 20, color: 'rgba(255,255,255,0.82)' }))
    expect(of(tree.root, 'Path')[0].props.fill).toBe('rgba(255,255,255,0.82)')
  })
})

describe('Ladrilho redondo', () => {
  it('é circular, no tingido icon-tile do tema, com o selo a 75% do diâmetro', async () => {
    const tree = await render(h(SeloTile, { sport: 'tenis', size: 40 }))
    const tile = byId(tree, 'selo-tile-tenis')[0]
    expect(tile.props.style).toMatchObject({ width: 40, height: 40, borderRadius: 20, backgroundColor: lightColors['icon-tile'] })
    expectHidden(tile)
    expect(icon(tree, 'tenis').props.style).toMatchObject({ width: 30, height: 30 })
    await act(async () => { appearance.setSystem('dark') })
    expect(byId(tree, 'selo-tile-tenis')[0].props.style.backgroundColor).toBe(darkColors['icon-tile'])
    const odd = await render(h(SeloTile, { sport: 'corrida', size: 26 }))
    expect(icon(odd, 'corrida').props.style).toMatchObject({ width: 20, height: 20 })
  })

  it('aceita outro conteúdo (o troféu do campeonato sem modalidade)', async () => {
    const tree = await render(h(RoundTile, { size: 40, testID: 'tile', children: h('Trophy') }))
    expect(byId(tree, 'tile')[0].props.style.borderRadius).toBe(20)
    expect(of(tree.root, 'Trophy')).toHaveLength(1)
  })
})

describe('usos do selo em ladrilho redondo', () => {
  const choice: CategoryChoice = { sport: 'futebol', kind: 'time', format: 'society', position: 'atacante', distance: 5 }
  const seloIn = (root: ReactTestInstance, sport: Sport) => {
    const tile = root.findAll(node => typeof node.type === 'string' && node.props.testID === `selo-tile-${sport}`)
    expect(tile, `ladrilho de ${sport}`).toHaveLength(1)
    expect(tile[0].props.style.borderRadius).toBe(tile[0].props.style.width / 2)
    expect(of(tile[0], 'Circle')).toHaveLength(1)
    return tile[0]
  }

  it('linhas de campeonato: selo no ladrilho de 40 e troféu no mesmo ladrilho redondo; o nome acessível não muda', async () => {
    const shown = [eventCard(1, { sport: 'tenis', name: 'Copa Tênis' }), eventCard(2, { sport: null as never, name: 'Copa Aberta' })]
    const tree = await render(h(Campeonatos, { state: { kind: 'ready', shown }, profiles: [], allSport: null, onOpenEvent: vi.fn(), onOpenEvents: vi.fn(), onOpenModalities: vi.fn() }))
    const row = byId(tree, 'campeonato-1')[0]
    expect(seloIn(row, 'tenis').props.style.width).toBe(40)
    expect(row.props.accessibilityLabel.startsWith('Copa Tênis, ')).toBe(true)
    const trophy = byId(tree, 'campeonato-sem-modalidade')[0]
    expect(trophy.props.style).toMatchObject({ width: 40, height: 40, borderRadius: 20, backgroundColor: lightColors['icon-tile'] })
    expectHidden(trophy)
    expect(of(tree.root, 'Image')).toHaveLength(0)
  })

  it('cartão de categoria do ranking: selo no ladrilho redondo de 40', async () => {
    const tree = await render(h(CategoryCard, { sport: 'corrida', text: 'Corrida · 5 km', onOpen: vi.fn() }))
    expect(seloIn(byId(tree, 'category-card')[0], 'corrida').props.style.width).toBe(40)
    expect(byLabel(tree, 'Categoria: Corrida · 5 km. Alterar')).toHaveLength(1)
    expect(of(tree.root, 'Image')).toHaveLength(0)
  })

  it('opções de modalidade da folha de categoria: selo no ladrilho de 30, sem inversão no selecionado', async () => {
    const tree = await render(h(CategorySheet, { available: ['futebol', 'tenis', 'corrida'], value: choice, onChange: vi.fn(), onClose: vi.fn() }))
    for (const sport of SPORTS) expect(seloIn(byId(tree, `sport-tile-${sport}`)[0], sport).props.style.width).toBe(30)
    expect(byId(tree, 'sport-tile-futebol')[0].props.accessibilityLabel).toBe('Futebol')
    expect(of(tree.root, 'Image')).toHaveLength(0)
  })

  it('opções do filtro da linha do tempo: selo no ladrilho de 26 em cada modalidade', async () => {
    const tree = await render(h(TimelineHeader, { total: 3, filter: null, onFilter: vi.fn() }))
    await press(tree, 'Filtrar por modalidade')
    const radios = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'radio')
    expect(radios.map(radio => radio.props.accessibilityLabel)).toEqual(['Todas', 'Futebol', 'Tênis', 'Corrida'])
    SPORTS.forEach((sport, index) => expect(seloIn(radios[index + 1], sport).props.style.width).toBe(26))
    expect(of(tree.root, 'Image')).toHaveLength(0)
  })
})

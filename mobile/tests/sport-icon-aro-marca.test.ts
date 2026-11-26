import React, { useState } from 'react'
import { act } from 'react-test-renderer'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sport } from '../src/api/client'
import { EventPoster } from '../src/components/arena/EventPoster'
import { ChoicePills, MultiPills, sportChoices } from '../src/components/arena/controls'
import { Pilulas } from '../src/components/home/Pilulas'
import { Placar } from '../src/components/home/Placar'
import { SportTabs } from '../src/components/play/PlateChips'
import { CategorySheet } from '../src/components/ranking/CategorySheet'
import type { CategoryChoice } from '../src/components/ranking/category'
import { SportBand } from '../src/components/sports-profile/SportBand'
import { SELO_VIEWBOX, SELOS_GEOMETRIA, SIMBOLO_VIEWBOX } from '../src/data/selos'
import { colors, darkColors, lightColors } from '../src/theme'
import { appearance, byLabel, enableAct, press } from './support/native'
import { football, matchCard } from './support/play'
import { byId, render } from './support/review'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({
  sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' },
  sportIconsAlpha: { futebol: 'futebol-alfa.png', tenis: 'tenis-alfa.png', corrida: 'corrida-alfa.png' },
}))

const h = React.createElement
const SPORTS: Sport[] = ['futebol', 'tenis', 'corrida']
const of = (root: ReactTestInstance, type: string) => root.findAllByType(type as never)
/** Ícones de modalidade (host com o testID `sport-icon-*`) dentro de `root`. */
const icons = (root: ReactTestInstance) => root.findAll(node => typeof node.type === 'string' && String(node.props.testID ?? '').startsWith('sport-icon-'))
const pressable = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('Pressable' as never).filter(node => node.props.accessibilityLabel === label)[0]
/** Desenho do ícone: a caixa do SVG, o caminho e a cor pintada. */
const drawing = (node: ReactTestInstance) => {
  const svg = of(node, 'Svg')[0]
  const paths = of(node, 'Path')
  expect(paths).toHaveLength(1)
  return { viewBox: svg.props.viewBox, width: svg.props.width, d: paths[0].props.d, fill: paths[0].props.fill }
}
/** Símbolo com aro de `sport` na cor `fill`, a 85% da caixa `size`, sem disco (não é o selo). */
const expectAro = (node: ReactTestInstance, sport: Sport, fill: string, size: number) => {
  expect(node.props.testID).toBe(`sport-icon-${sport}`)
  expect(node.props.style).toMatchObject({ width: size, height: size })
  expect(drawing(node)).toEqual({ viewBox: SELO_VIEWBOX, width: size * 0.85, d: SELOS_GEOMETRIA[sport].simboloComAro, fill })
  expect(of(node, 'Circle')).toHaveLength(0)
}
/** Caixa posicionada que envolve a marca d'água (o primeiro ancestral nativo do ícone). */
const holder = (node: ReactTestInstance) => {
  let current = node.parent
  while (current && typeof current.type !== 'string') current = current.parent
  return current!
}
/** O ícone continua decorativo: fora da árvore de acessibilidade, com os descendentes ocultos. */
const expectHidden = (node: ReactTestInstance) => {
  expect(node.props.accessible).toBe(false)
  expect(node.props.importantForAccessibility).toBe('no-hide-descendants')
  expect(node.props.accessibilityElementsHidden).toBe(true)
}

beforeEach(() => {
  enableAct()
  appearance.reset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
})

describe('símbolo com aro só no item ativo', () => {
  function SingleChoice({ tone }: { tone: 'light' | 'dark' }) {
    const [value, setValue] = useState<Sport>('futebol')
    return h(ChoicePills<Sport>, { label: 'Modalidade', options: sportChoices(), value, onChange: setValue, tone })
  }
  function MultiChoice() {
    const [values, setValues] = useState<Sport[]>([])
    return h(MultiPills<Sport>, { label: 'O que você quer organizar', options: sportChoices(), values, onChange: setValues })
  }

  it('chips de modalidade (filtro de campeonatos): só a pílula marcada tem o aro, na cor do texto dela, e ele troca de pílula', async () => {
    const tree = await render(h(SingleChoice, { tone: 'light' }))
    expect(icons(tree.root)).toHaveLength(1)
    expectAro(icons(pressable(tree, 'Futebol'))[0], 'futebol', '#ffffff', 22)
    expect(icons(pressable(tree, 'Tênis'))).toHaveLength(0)
    expect(icons(pressable(tree, 'Corrida'))).toHaveLength(0)
    await press(tree, 'Corrida')
    expect(icons(pressable(tree, 'Futebol'))).toHaveLength(0)
    expectAro(icons(pressable(tree, 'Corrida'))[0], 'corrida', '#ffffff', 22)
    expect(pressable(tree, 'Corrida').props.accessibilityState).toMatchObject({ checked: true, selected: true })
    expect(pressable(tree, 'Futebol').props.accessibilityState).toMatchObject({ checked: false, selected: false })
    expectHidden(icons(tree.root)[0])
    expect(of(tree.root, 'Image')).toHaveLength(0)
  })

  it('a pílula desmarcada mostra só o nome, sem espaço reservado para o ícone', async () => {
    const tree = await render(h(SingleChoice, { tone: 'light' }))
    const idle = pressable(tree, 'Tênis')
    expect(idle.children).toHaveLength(1)
    expect(of(idle, 'Text').map(text => text.props.children)).toEqual(['Tênis'])
  })

  it('seletor escuro do assistente de evento: o aro da marcada fica em night, a cor do texto sobre a menta, nos dois temas', async () => {
    const tree = await render(h(SingleChoice, { tone: 'dark' }))
    expectAro(icons(tree.root)[0], 'futebol', colors.night, 22)
    await act(async () => { appearance.setSystem('dark') })
    expectAro(icons(tree.root)[0], 'futebol', colors.night, 22)
  })

  it('modalidades do pedido de organizador: o aro surge ao marcar e sai ao desmarcar', async () => {
    const tree = await render(h(MultiChoice))
    expect(icons(tree.root)).toHaveLength(0)
    await press(tree, 'Tênis')
    await press(tree, 'Corrida')
    expect(icons(tree.root).map(node => node.props.testID)).toEqual(['sport-icon-tenis', 'sport-icon-corrida'])
    await press(tree, 'Tênis')
    expect(icons(tree.root).map(node => node.props.testID)).toEqual(['sport-icon-corrida'])
    expect(pressable(tree, 'Tênis').props.accessibilityState).toMatchObject({ checked: false })
    expect(pressable(tree, 'Corrida').props.accessibilityRole).toBe('checkbox')
  })

  it('abas de modalidade do Jogar: aro branco só na aba escolhida, sem ícone nem espaço nas demais', async () => {
    function Tabs() {
      const [value, setValue] = useState<Sport>('tenis')
      return h(SportTabs, { value, onChange: setValue })
    }
    const tree = await render(h(Tabs))
    expect(byLabel(tree, 'Modalidade')[0].props.accessibilityRole).toBe('tablist')
    expectAro(icons(pressable(tree, 'Tênis'))[0], 'tenis', '#ffffff', 18)
    expect(icons(tree.root)).toHaveLength(1)
    expect(pressable(tree, 'Futebol').children).toHaveLength(1)
    await press(tree, 'Futebol')
    expect(icons(pressable(tree, 'Tênis'))).toHaveLength(0)
    expectAro(icons(pressable(tree, 'Futebol'))[0], 'futebol', '#ffffff', 18)
    expect(pressable(tree, 'Futebol').props.accessibilityState).toEqual({ selected: true })
    expect(pressable(tree, 'Tênis').props.accessibilityState).toEqual({ selected: false })
    expectHidden(icons(tree.root)[0])
  })
})

describe('símbolo com aro sempre', () => {
  it('pílulas "Seu elo": aro em branco a 82% nas três modalidades, igual nos dois temas, sem mudar o nome acessível', async () => {
    const props = { standings: null, standingsLoading: false, profiles: [], profilesLoading: false, onOpenRanking: vi.fn(), onOpenModalities: vi.fn() }
    const tree = await render(h(Pilulas, props))
    for (const sport of SPORTS) expectAro(icons(byId(tree, `pilula-${sport}`)[0])[0], sport, 'rgba(255,255,255,0.82)', 20)
    expect(byId(tree, 'pilula-tenis')[0].props.accessibilityLabel).toBe('Tênis: sem perfil, configurar')
    await act(async () => { appearance.setSystem('dark') })
    for (const sport of SPORTS) expectAro(icons(byId(tree, `pilula-${sport}`)[0])[0], sport, 'rgba(255,255,255,0.82)', 20)
    expect(of(tree.root, 'Image')).toHaveLength(0)
  })

  it('placar: o selo de modalidade tem o aro branco ao lado do nome', async () => {
    const now = Date.parse('2026-11-26T12:00:00Z')
    const match = matchCard({ id: 7, sport: 'tenis', state: 'agendada', phase: 'agendada', starts_at: '2026-11-27T12:00:00Z' })
    const tree = await render(h(Placar, { match, now, hasProfiles: true, onOpen: vi.fn() }))
    const found = icons(tree.root)
    expect(found).toHaveLength(1)
    expectAro(found[0], 'tenis', '#ffffff', 14)
    expectHidden(found[0])
    expect(of(tree.root, 'Image')).toHaveLength(0)
  })

  it('rodapé do cartaz: aro branco no bloco escuro, nos dois temas', async () => {
    const poster = { name: 'Copa Sudoeste', sport: 'corrida' as const, startsAt: '2026-12-10T12:00:00Z', distanceKm: 5, priceCents: 0, showSport: true }
    const tree = await render(h(EventPoster, poster))
    expectAro(icons(tree.root)[0], 'corrida', '#ffffff', 22)
    await act(async () => { appearance.setSystem('dark') })
    expectAro(icons(tree.root)[0], 'corrida', '#ffffff', 22)
    expect(of(tree.root, 'Image')).toHaveLength(0)
  })

  it('linha de modalidade única da folha de categoria: aro em icon-tile-ink, acompanhando o tema', async () => {
    const choice: CategoryChoice = { sport: 'futebol', kind: 'time', format: 'society', position: 'atacante', distance: 5 }
    const tree = await render(h(CategorySheet, { available: ['corrida'], value: { ...choice, sport: 'corrida' }, onChange: vi.fn(), onClose: vi.fn() }))
    expectAro(icons(tree.root)[0], 'corrida', lightColors['icon-tile-ink'], 26)
    await act(async () => { appearance.setSystem('dark') })
    expectAro(icons(tree.root)[0], 'corrida', darkColors['icon-tile-ink'], 26)
    expect(of(tree.root, 'Image')).toHaveLength(0)
  })
})

describe('marca d\'água nas faixas de "Suas modalidades"', () => {
  const mark = (tree: ReactTestRenderer, sport: Sport) => {
    const node = icons(byId(tree, `sport-band-${sport}`)[0])
    expect(node).toHaveLength(1)
    return node[0]
  }

  it('faixa ativa: só o símbolo, em branco, a 16% e no mesmo canto, nos dois temas', async () => {
    const tree = await render(h(SportBand, { sport: 'futebol', profile: football, onPress: vi.fn() }))
    const node = mark(tree, 'futebol')
    expect(drawing(node)).toEqual({ viewBox: SIMBOLO_VIEWBOX, width: 150, d: SELOS_GEOMETRIA.futebol.simbolo, fill: '#ffffff' })
    expect(holder(node).props.style).toMatchObject({ position: 'absolute', right: -14, bottom: -18, opacity: 0.16 })
    expectHidden(node)
    await act(async () => { appearance.setSystem('dark') })
    expect(drawing(mark(tree, 'futebol')).fill).toBe('#ffffff')
    expect(byId(tree, 'sport-band-futebol')[0].props.accessibilityLabel).toBe('Futebol, ativa, editar')
  })

  it('faixa inativa: o símbolo em icon-tile-ink do tema, a 8%', async () => {
    const tree = await render(h(SportBand, { sport: 'tenis', onPress: vi.fn() }))
    expect(drawing(mark(tree, 'tenis'))).toEqual({ viewBox: SIMBOLO_VIEWBOX, width: 150, d: SELOS_GEOMETRIA.tenis.simbolo, fill: lightColors['icon-tile-ink'] })
    expect(holder(mark(tree, 'tenis')).props.style).toMatchObject({ opacity: 0.08 })
    await act(async () => { appearance.setSystem('dark') })
    expect(drawing(mark(tree, 'tenis')).fill).toBe(darkColors['icon-tile-ink'])
    expect(byId(tree, 'sport-band-tenis')[0].props.accessibilityLabel).toBe('Tênis, ativar')
    expect(of(tree.root, 'Image')).toHaveLength(0)
  })
})

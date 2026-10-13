import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { brandSvgs } from '../src/assets/brand-svgs'
import { Icon } from '../src/components/Icon'
import type { IconName } from '../src/components/Icon'
import { COUNTDOWN_OVER, Countdown } from '../src/components/play/Countdown'
import { SideBadge, SideMark } from '../src/components/play/SideBadge'
import { TierLine } from '../src/components/play/TierLine'
import { TeamMark } from '../src/components/match/TeamMark'
import { Stepper, stepperActions } from '../src/components/results/Stepper'
import { accessibility, byLabel, enableAct, textOf } from './support/native'
import { athleteSide, person, teamSide, ferrugemRef } from './support/play'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

const h = React.createElement

async function render(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(element) })
  return tree
}
const byId = (tree: ReactTestRenderer, id: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === id)
const svgXml = (tree: ReactTestRenderer) => tree.root.findAllByType('SvgXml' as never)

beforeEach(() => {
  enableAct()
  accessibility.announcements.length = 0
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-only-token')
})
afterEach(() => { vi.useRealTimers() })

describe('TierLine: a linha do elo sobre a placa', () => {
  it('ranqueado: brasão do elo, nome e "Enfrenta…", com um nome acessível só', async () => {
    const tree = await render(h(TierLine, { view: { kind: 'ranked', tier: 'ouro', title: 'Ouro', detail: 'Enfrenta Prata ou Ouro', levels: 'Prata ou Ouro' } }))
    expect(svgXml(tree)[0].props.xml).toBe(brandSvgs.ouro)
    expect(svgXml(tree)[0].props.width).toBe(44)
    expect(textOf(tree)).toBe('Ouro | Enfrenta Prata ou Ouro')
    expect(byLabel(tree, 'Elo Ouro. Enfrenta Prata ou Ouro')).toHaveLength(1)
    expect(byLabel(tree, 'Elo Ouro')).toHaveLength(0)
  })

  it('classificação: o medidor "n de 3", nunca o brasão de um elo', async () => {
    const tree = await render(h(TierLine, { view: { kind: 'placement', title: 'Em classificação', played: 2, required: 3 } }))
    expect(textOf(tree)).toContain('2 de 3 partidas · enfrenta qualquer nível')
    expect(Object.values(brandSvgs).filter(xml => svgXml(tree).some(node => node.props.xml === xml && xml !== brandSvgs.coliseum))).toEqual([])
    expect(byId(tree, 'placement-bar-on')).toHaveLength(2)
  })

  it('sem marca na corrida: o Coliseu tracejado, sem elo', async () => {
    const tree = await render(h(TierLine, { view: { kind: 'no-mark', title: 'Sem marca nos 10 km', detail: 'Registre um treino ou prova para entrar no ranking' } }))
    expect(svgXml(tree).map(node => node.props.xml)).toEqual([brandSvgs.coliseum])
    expect(textOf(tree)).toBe('Sem marca nos 10 km | Registre um treino ou prova para entrar no ranking')
    expect(byLabel(tree, 'Sem marca nos 10 km. Registre um treino ou prova para entrar no ranking')).toHaveLength(1)
  })
})

describe('SideBadge, SideMark e TeamMark: os lados da partida', () => {
  it('time com elo: brasão, nome e o elo do pareamento, num nome acessível só', async () => {
    const tree = await render(h(SideBadge, { side: teamSide('b', ferrugemRef, { tier: 'prata' }), size: 'xl' }))
    expect(byLabel(tree, 'Ferrugem FC, elo Prata')).toHaveLength(1)
    expect(textOf(tree)).toBe('Ferrugem FC | Prata')
    expect(svgXml(tree).some(node => node.props.xml === brandSvgs.prata)).toBe(true)
  })

  it('sem elo: "Em classificação" e nenhum brasão de elo', async () => {
    const tree = await render(h(SideBadge, { side: teamSide('a', ferrugemRef) }))
    expect(byLabel(tree, 'Ferrugem FC, em classificação')).toHaveLength(1)
    expect(textOf(tree)).toBe('Ferrugem FC | Em classificação')
    expect(svgXml(tree).some(node => Object.entries(brandSvgs).some(([key, xml]) => key !== 'coliseum' && key !== 'arenaWall' && node.props.xml === xml))).toBe(false)
  })

  it('atleta do tênis: a foto (iniciais sem imagem) e o nome; lado ausente vira "Adversário"', async () => {
    const tree = await render(h(SideBadge, { side: athleteSide('a', person(31, 'Ana Souza'), { tier: 'ouro' }), size: 'sm' }))
    expect(byLabel(tree, 'Ana Souza, elo Ouro')).toHaveLength(1)
    expect(byLabel(tree, 'Iniciais de Ana Souza')).toHaveLength(1)
    const missing = await render(h(SideBadge, { side: undefined, size: 'md', token: 'tok' }))
    expect(textOf(missing)).toBe('A | Adversário | Em classificação')
  })

  it('marca pequena das listas: brasão do time ou foto do atleta, ambas decorativas', async () => {
    const team = await render(h(SideMark, { side: teamSide('a', ferrugemRef) }))
    expect(textOf(team)).toBe('')
    expect(byLabel(team, 'Brasão de Ferrugem FC')).toHaveLength(0)
    const athlete = await render(h(SideMark, { side: athleteSide('b', person(32, 'Beatriz Lima')), token: null }))
    expect(athlete.root.findAll(node => typeof node.type === 'string' && node.props.importantForAccessibility === 'no-hide-descendants').length).toBeGreaterThan(0)
    const none = await render(h(SideMark, { side: undefined }))
    expect(byLabel(none, 'Iniciais de Adversário')).toHaveLength(1)
  })

  it('marca do lado com o elo no canto só quando o pareamento o guardou', async () => {
    const withTier = await render(h(TeamMark, { side: teamSide('a', ferrugemRef, { tier: 'ouro' }), size: 'lg' }))
    expect(svgXml(withTier).some(node => node.props.xml === brandSvgs.ouro && node.props.width === 22)).toBe(true)
    const small = await render(h(TeamMark, { side: teamSide('a', ferrugemRef, { tier: 'bronze' }) }))
    expect(svgXml(small).some(node => node.props.xml === brandSvgs.bronze && node.props.width === 16)).toBe(true)
    const noTier = await render(h(TeamMark, { side: teamSide('a', ferrugemRef) }))
    expect(svgXml(noTier).some(node => node.props.xml === brandSvgs.bronze)).toBe(false)
    const unknown = await render(h(TeamMark, { side: teamSide('a', ferrugemRef, { tier: 'ferro' as never }) }))
    expect(unknown.root.findAll(node => node.props.xml === brandSvgs.bronze)).toHaveLength(0)
    const athlete = await render(h(TeamMark, { side: athleteSide('b', person(32, 'Beatriz Lima'), { tier: 'prata' }), size: 'lg', token: 'tok' }))
    expect(byLabel(athlete, 'Iniciais de Beatriz Lima')).toHaveLength(1)
    expect(svgXml(athlete).some(node => node.props.xml === brandSvgs.prata)).toBe(true)
    expect(byId(athlete, 'team-mark')[0].props.accessible).toBe(false)
  })
})

describe('Countdown: a contagem regressiva da proposta e da oferta', () => {
  const until = (ms: number) => new Date(Date.now() + ms).toISOString()

  it('mostra h:mm:ss e fala minutos, sem anunciar cada segundo', async () => {
    vi.useFakeTimers()
    const tree = await render(h(Countdown, { until: until(7_182_000) }))
    const timer = () => byId(tree, 'countdown')[0]
    expect(textOf(tree)).toBe('1:59:42')
    expect(timer().props.accessibilityRole).toBe('timer')
    expect(timer().props.accessibilityLabel).toBe('1 hora e 59 minutos restantes')
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(textOf(tree)).toBe('1:59:41')
    expect(timer().props.accessibilityLabel).toBe('1 hora e 59 minutos restantes')
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(timer().props.accessibilityLabel).toBe('1 hora e 58 minutos restantes')
    expect(accessibility.announcements).toEqual([])
    await act(async () => { tree.unmount() })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('quando o prazo passa durante o uso, chama onElapsed uma vez e anuncia "Prazo encerrado"', async () => {
    vi.useFakeTimers()
    const onElapsed = vi.fn()
    const tree = await render(h(Countdown, { until: until(2500), onElapsed }))
    expect(onElapsed).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(textOf(tree)).toBe('0:00:00')
    expect(byId(tree, 'countdown')[0].props.accessibilityLabel).toBe(COUNTDOWN_OVER)
    expect(onElapsed).toHaveBeenCalledTimes(1)
    expect(accessibility.announcements).toEqual([COUNTDOWN_OVER])
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(onElapsed).toHaveBeenCalledTimes(1)
    expect(accessibility.announcements).toEqual([COUNTDOWN_OVER])
    await act(async () => { tree.unmount() })
  })

  it('um prazo que já abre vencido avisa quem chamou, mas não interrompe o leitor de tela', async () => {
    const onElapsed = vi.fn()
    const tree = await render(h(Countdown, { until: until(-1000), onElapsed }))
    expect(textOf(tree)).toBe('0:00:00')
    expect(onElapsed).toHaveBeenCalledTimes(1)
    expect(accessibility.announcements).toEqual([])
    const invalid = await render(h(Countdown, { until: 'nada' }))
    expect(byId(invalid, 'countdown')[0].props.accessibilityLabel).toBe(COUNTDOWN_OVER)
    await act(async () => { tree.unmount(); invalid.unmount() })
  })

  it('usa o onElapsed mais novo', async () => {
    vi.useFakeTimers()
    const first = vi.fn()
    const second = vi.fn()
    const tree = await render(h(Countdown, { until: until(1500), onElapsed: first }))
    await act(async () => { tree.update(h(Countdown, { until: until(1500), onElapsed: second })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    await act(async () => { tree.unmount() })
  })
})

describe('Stepper: o contador acessível do placar e do tempo', () => {
  const stepper = (tree: ReactTestRenderer) => byId(tree, 'stepper')[0]
  const press = async (tree: ReactTestRenderer, kind: 'minus' | 'plus') => { await act(async () => { byId(tree, `stepper-${kind}`)[0].props.onPress() }) }
  const act1 = async (tree: ReactTestRenderer, actionName: string) => { await act(async () => { stepper(tree).props.onAccessibilityAction({ nativeEvent: { actionName } }) }) }

  it('é um elemento ajustável com nome, valor e as ações aumentar e diminuir', async () => {
    const tree = await render(h(Stepper, { value: 2, onChange: vi.fn(), label: 'Gols do Ferrugem FC', max: 20 }))
    expect(stepper(tree).props).toMatchObject({
      accessible: true, accessibilityRole: 'adjustable', accessibilityLabel: 'Gols do Ferrugem FC',
      accessibilityValue: { min: 0, max: 20, now: 2, text: '2' }, accessibilityState: { disabled: false },
    })
    expect(stepper(tree).props.accessibilityActions).toEqual([{ name: 'increment', label: 'Aumentar' }, { name: 'decrement', label: 'Diminuir' }])
    expect(stepperActions.map(item => item.name)).toEqual(['increment', 'decrement'])
    expect(textOf(tree)).toBe('2')
    // Os botões são só do toque: o leitor de tela ajusta pelas ações do elemento.
    expect(byId(tree, 'stepper-plus')[0].props).toMatchObject({ accessible: false, importantForAccessibility: 'no' })
  })

  it('os botões e as ações de acessibilidade mudam o valor de um em um', async () => {
    const onChange = vi.fn()
    const tree = await render(h(Stepper, { value: 3, onChange, label: 'Gols' }))
    await press(tree, 'plus')
    await press(tree, 'minus')
    await act1(tree, 'increment')
    await act1(tree, 'decrement')
    await act1(tree, 'longpress')
    expect(onChange.mock.calls).toEqual([[4], [2], [4], [2]])
  })

  it('respeita o mínimo e o máximo: o botão fica desabilitado e a ação não passa do limite', async () => {
    const onChange = vi.fn()
    const atMin = await render(h(Stepper, { value: 0, onChange, label: 'Sets', max: 7, size: 'lg' }))
    expect(byId(atMin, 'stepper-minus')[0].props.disabled).toBe(true)
    expect(byId(atMin, 'stepper-plus')[0].props.disabled).toBe(false)
    await act1(atMin, 'decrement')
    const atMax = await render(h(Stepper, { value: 7, onChange, label: 'Sets', max: 7, tone: 'dark' }))
    expect(byId(atMax, 'stepper-plus')[0].props.disabled).toBe(true)
    await act1(atMax, 'increment')
    expect(onChange).not.toHaveBeenCalled()
    const clamp = await render(h(Stepper, { value: 5, onChange, label: 'Pontos', min: 2, max: 6 }))
    await press(clamp, 'minus')
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('desabilitado não muda nada', async () => {
    const onChange = vi.fn()
    const tree = await render(h(Stepper, { value: 3, onChange, label: 'Gols', disabled: true }))
    expect(stepper(tree).props.accessibilityState).toEqual({ disabled: true })
    expect(byId(tree, 'stepper-plus')[0].props.disabled).toBe(true)
    await act1(tree, 'increment')
    await press(tree, 'plus')
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('ícones do Jogar', () => {
  it('cada ícone acrescentado para o Jogar desenha ao menos uma forma', async () => {
    const names: IconName[] = [
      'swords', 'timer', 'shuffle', 'hand', 'triangle-alert', 'history', 'calendar-check', 'calendar-plus', 'calendar-clock', 'arrow-down', 'eye-off',
      'messages-square', 'wifi-off', 'key-round', 'octagon-x', 'pin', 'shield-question', 'git-compare-arrows', 'user-round', 'chevron-up', 'zap', 'clipboard-check',
    ]
    for (const name of names) {
      const tree = await render(h(Icon, { name, size: 18, color: '#005a36' }))
      const shapes = tree.root.findAll(node => ['Path', 'Circle', 'Rect'].includes(String(node.type)))
      expect(shapes.length, name).toBeGreaterThan(0)
    }
  })
})

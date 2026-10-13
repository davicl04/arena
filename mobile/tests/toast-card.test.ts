import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { Platform } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connection } from '../src/api/connection'
import Sheet from '../src/components/Sheet'
import { toast, toastStore, TOAST_EXIT_MS } from '../src/components/toast/toastStore'
import { ToastViewport } from '../src/components/toast/ToastViewport'
import { accessibility, appState, enableAct, panResponder } from './support/native'
import { motion } from './support/reanimated'
import { findToast, renderWithToasts, textWithin, toastCards, toasts, track, unmountToastTrees } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())

const h = React.createElement
beforeEach(() => {
  enableAct()
  appState.reset()
  panResponder.reset()
  accessibility.announcements.length = 0
  motion.reduced = false
  Platform.OS = 'android'
})
afterEach(async () => { vi.useRealTimers(); await unmountToastTrees() })

const pressByLabel = async (card: ReturnType<typeof findToast>, label: string) => {
  const target = card!.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === label)[0]
  expect(target, label).toBeTruthy()
  await act(async () => { target.props.onPress() })
}

describe('ToastCard: tons, texto, ação e fechar', () => {
  it.each([['success', 'polite'], ['info', 'polite'], ['warning', 'polite'], ['error', 'assertive']] as const)('o toast de %s mostra o título e a descrição na região viva %s', async (tone, live) => {
    const tree = await renderWithToasts(h('View'))
    await act(async () => { toast[tone]('Título do aviso', { description: 'Descrição do aviso' }) })
    const card = findToast(tree, 'Título do aviso')!
    expect(card.props.testID).toBe(`toast-${tone}`)
    expect(card.props.accessibilityLiveRegion).toBe(live)
    expect(textWithin(card)).toContain('Descrição do aviso')
  })

  it('sem descrição nem ação, o cartão mostra só o título e o X; o X tem o rótulo "Fechar aviso" e dispensa o toast', async () => {
    const tree = await renderWithToasts(h('View'))
    await act(async () => { toast.error('Algo falhou') })
    const card = findToast(tree, 'Algo falhou')!
    expect(textWithin(card)).toBe('Algo falhou')
    expect(card.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button').map(node => node.props.accessibilityLabel)).toEqual(['Fechar aviso'])
    await pressByLabel(card, 'Fechar aviso')
    expect(toasts()[0].ending).toBe(true)
    await act(async () => { toastStore.dismiss() })
  })

  it('a ação aparece como pílula na cor do tom e chama o clique; no máximo uma', async () => {
    const onClick = vi.fn()
    const tree = await renderWithToasts(h('View'))
    await act(async () => { toast.warning('Vaga reservada.', { description: 'Envie o comprovante.', action: { label: 'Enviar comprovante', onClick } }) })
    const card = findToast(tree, 'Vaga reservada.')!
    await pressByLabel(card, 'Enviar comprovante')
    expect(onClick).toHaveBeenCalledOnce()
    expect(card.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button').map(node => node.props.accessibilityLabel)).toEqual(['Enviar comprovante', 'Fechar aviso'])
  })

  it('no iOS cada toast novo é anunciado ao leitor de tela (título e descrição); no Android a região viva anuncia', async () => {
    Platform.OS = 'ios'
    await renderWithToasts(h('View'))
    await act(async () => { toast.success('Perfil salvo.'); toast.info('Dica', { description: 'Toque para ver.' }) })
    expect(accessibility.announcements).toEqual(['Perfil salvo.', 'Dica. Toque para ver.'])
    Platform.OS = 'android'
    await act(async () => { toast.success('Outro') })
    expect(accessibility.announcements).toHaveLength(2)
  })

  it('atualizar o toast pelo id anuncia o texto novo; o tempo do anel acompanha a loja', async () => {
    vi.useFakeTimers()
    Platform.OS = 'ios'
    const tree = await renderWithToasts(h('View'))
    await act(async () => { toast.success('Salvando…', { id: 'perfil' }) })
    await act(async () => { toast.success('Perfil salvo.', { id: 'perfil' }) })
    expect(accessibility.announcements).toEqual(['Salvando…', 'Perfil salvo.'])
    expect(toastCards(tree)).toHaveLength(1)
    const before = motion.cancelled
    await act(async () => { toastStore.setPaused('touch', true) })
    expect(motion.cancelled).toBeGreaterThan(before)
    await act(async () => { toastStore.setPaused('touch', false); toast.error('Sem prazo') })
    await act(async () => { vi.advanceTimersByTime(10_000) })
  })

  it('com "reduzir movimento" o cartão aparece do mesmo jeito (só a opacidade anima)', async () => {
    motion.reduced = true
    const tree = await renderWithToasts(h('View'))
    await act(async () => { toast.success('Sem movimento'); toast.info('Segundo') })
    expect(findToast(tree, 'Sem movimento')).toBeTruthy()
    expect(toastCards(tree)).toHaveLength(2)
  })
})

describe('ToastViewport: baralho, pausa e arrasto', () => {
  it('mostra até quatro toasts, o mais novo na frente: os de trás ficam escondidos do leitor de tela e sem toque', async () => {
    vi.useFakeTimers()
    const tree = await renderWithToasts(h('View'))
    await act(async () => { for (const title of ['1', '2', '3', '4', '5']) toast.error(title) })
    const cards = toastCards(tree)
    expect(cards.map(card => textWithin(card))).toEqual(['2', '3', '4', '5'])
    const behind = cards.slice(0, 3)
    expect(behind.map(card => card.props.pointerEvents)).toEqual(['none', 'none', 'none'])
    expect(cards[3].props.pointerEvents).toBe('auto')
    expect(behind.every(card => card.findAll(node => node.props.importantForAccessibility === 'no-hide-descendants').length > 0)).toBe(true)
    // Dispensar o da frente: ele sai (animação, por cima) e o de trás passa à frente; o quinto, que esperava, volta ao baralho.
    await pressByLabel(cards[3], 'Fechar aviso')
    expect(toastCards(tree).map(card => textWithin(card))).toEqual(['1', '2', '3', '4', '5'])
    expect(toastCards(tree).map(card => card.props.pointerEvents)).toEqual(['none', 'none', 'none', 'auto', 'none'])
    await act(async () => { toastStore.dismiss() })
    await act(async () => { vi.advanceTimersByTime(TOAST_EXIT_MS) })
    expect(toastCards(tree)).toHaveLength(0)
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'toast-viewport')).toHaveLength(0)
  })

  it('o app em segundo plano pausa o tempo e voltar ao primeiro plano o retoma; desmontar solta a pausa', async () => {
    vi.useFakeTimers()
    const tree = await renderWithToasts(h('View'))
    await act(async () => { toast.success('Pausável') })
    await act(async () => { appState.set('background') })
    expect(toastStore.getState().paused).toBe(true)
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(toasts()[0].ending).toBe(false)
    await act(async () => { appState.set('active') })
    expect(toastStore.getState().paused).toBe(false)
    await act(async () => { appState.set('inactive') })
    expect(toastStore.getState().paused).toBe(true)
    await act(async () => { tree.unmount() })
    expect(toastStore.getState().paused).toBe(false)
  })

  it('montar com o app já em segundo plano começa pausado', async () => {
    appState.current = 'background'
    await renderWithToasts(h('View'))
    expect(toastStore.getState().paused).toBe(true)
  })

  it('tocar no cartão pausa o tempo enquanto o dedo está nele', async () => {
    const tree = await renderWithToasts(h('View'))
    await act(async () => { toast.info('Toque') })
    const card = findToast(tree, 'Toque')!
    await act(async () => { card.props.onTouchStart() })
    expect(toastStore.getState().paused).toBe(true)
    await act(async () => { card.props.onTouchEnd() })
    expect(toastStore.getState().paused).toBe(false)
    await act(async () => { card.props.onTouchStart(); card.props.onTouchCancel() })
    expect(toastStore.getState().paused).toBe(false)
  })

  it('arrastar para baixo além do limite dispensa; um arrasto curto volta ao lugar; o cartão de trás não arrasta', async () => {
    const tree = await renderWithToasts(h('View'))
    await act(async () => { toast.error('Arraste') })
    findToast(tree, 'Arraste')
    const pan = panResponder.last()
    expect(pan.onMoveShouldSetPanResponder({}, { dy: 20, dx: 2 })).toBe(true)
    expect(pan.onMoveShouldSetPanResponder({}, { dy: 3, dx: 0 })).toBe(false)
    expect(pan.onMoveShouldSetPanResponder({}, { dy: 20, dx: 40 })).toBe(false)
    await act(async () => { pan.onPanResponderGrant() })
    expect(toastStore.getState().paused).toBe(true)
    await act(async () => { pan.onPanResponderMove({}, { dy: 12 }); pan.onPanResponderMove({}, { dy: -30 }) })
    await act(async () => { pan.onPanResponderRelease({}, { dy: 12, vy: 0.1 }) })
    expect(toastStore.getState().paused).toBe(false)
    expect(toasts()[0].ending).toBe(false)
    await act(async () => { pan.onPanResponderGrant(); pan.onPanResponderTerminate() })
    expect(toastStore.getState().paused).toBe(false)
    expect(toasts()[0].ending).toBe(false)
    await act(async () => { pan.onPanResponderRelease({}, { dy: 80, vy: 0.1 }) })
    expect(toasts()[0].ending).toBe(true)
    await act(async () => { toastStore.reset(); toast.error('Rápido') })
    await act(async () => { panResponder.last().onPanResponderRelease({}, { dy: 10, vy: 1.2 }) })
    expect(toasts()[0].ending).toBe(true)
    await act(async () => { toastStore.reset(); toast.error('De trás'); toast.error('Da frente') })
    const behindPan = panResponder.configs[panResponder.configs.length - 2]
    expect(behindPan.onMoveShouldSetPanResponder({}, { dy: 40, dx: 0 })).toBe(false)
  })

  it.each([['nav', 86], ['screen', 16], ['modal', 16]] as const)('a posição "%s" fica a %i pt da base', async (placement, bottom) => {
    const tree = await renderWithToasts(h('View'), placement)
    await act(async () => { toast.success('Posição') })
    expect(tree.root.findByProps({ testID: 'toast-viewport' }).props.style).toMatchObject({ position: 'absolute', bottom })
  })

  it('acima da navegação, o toast sobe 52 pt junto com a faixa de conexão e desce quando ela some', async () => {
    const tree = await renderWithToasts(h('View'), 'nav')
    await act(async () => { toast.success('Sobe') })
    const bottom = () => tree.root.findByProps({ testID: 'toast-viewport' }).props.style.bottom
    expect(bottom()).toBe(86)
    await act(async () => { connection.lost({ mutating: false }) })
    expect(bottom()).toBe(138)
    await act(async () => { connection.reached() })
    expect(bottom()).toBe(138)
    await act(async () => { connection.reset() })
    expect(bottom()).toBe(86)
  })
})

describe('ToastViewport dentro de um Modal: só o mais interno mostra', () => {
  /** `Sheet` exige `children` nas props (o `createElement` tipado não aceita o filho só como argumento). */
  const folha = (title: string, children: React.ReactNode) => h(Sheet, { title, onClose: vi.fn(), children })
  const root = (child?: React.ReactElement) => h(React.Fragment, null, h('View', { testID: 'tela' }, child), h(ToastViewport, { placement: 'nav' }))
  const isViewport = (node: ReactTestInstance) => typeof node.type === 'string' && node.props.testID === 'toast-viewport'
  const viewports = (tree: ReactTestRenderer) => tree.root.findAll(isViewport)

  it('com uma folha aberta o toast aparece dentro da folha, não na raiz; fechada a folha, ele volta à raiz', async () => {
    let tree!: ReactTestRenderer
    await act(async () => { tree = track(create(root())) })
    await act(async () => { tree.update(root(folha('Folha', h('Text', null, 'Conteúdo')))) })
    await act(async () => { toast.error('Erro na folha') })
    const sheet = tree.root.findByType('Modal' as never)
    expect(viewports(tree)).toHaveLength(1)
    expect(sheet.findAll(isViewport)).toHaveLength(1)
    expect(textWithin(sheet)).toContain('Erro na folha')
    await act(async () => { tree.update(root()) })
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    expect(viewports(tree)).toHaveLength(1)
    expect(textWithin(tree.root)).toContain('Erro na folha')
    expect(toastCards(tree)).toHaveLength(1)
  })

  it('folha sobre folha: só a de cima desenha o toast; ao fechá-la, a de baixo assume', async () => {
    const inner = folha('De cima', h('Text', null, 'Dentro'))
    const outer = folha('De baixo', inner)
    let tree!: ReactTestRenderer
    await act(async () => { tree = track(create(root())) })
    // A ordem de montagem manda: a folha de baixo abre primeiro e a de cima, depois (como o usuário faria).
    await act(async () => { tree.update(root(folha('De baixo', h('Text', null, 'Fora')))) })
    await act(async () => { tree.update(root(outer)) })
    await act(async () => { toast.warning('Aviso') })
    const modals = tree.root.findAllByType('Modal' as never)
    expect(modals).toHaveLength(2)
    expect(viewports(tree)).toHaveLength(1)
    const [lower, upper] = modals
    expect(upper.findAll(isViewport)).toHaveLength(1)
    expect(lower.findAll(isViewport).filter(node => !upper.findAll(isViewport).includes(node))).toHaveLength(0)
    await act(async () => { tree.update(root(folha('De baixo', h('Text', null, 'Fora')))) })
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(1)
    expect(viewports(tree)).toHaveLength(1)
    expect(textWithin(tree.root.findByType('Modal' as never))).toContain('Aviso')
  })

  it('sem nenhuma folha e sem toasts, o viewport não desenha nada', async () => {
    let tree!: ReactTestRenderer
    await act(async () => { tree = track(create(root())) })
    expect(viewports(tree)).toHaveLength(0)
    expect(toastCards(tree)).toHaveLength(0)
  })
})

import React from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { enableAct } from './support/native'
import { KeyboardScrollView } from '../src/components/KeyboardScrollView'

const listeners = new Map<string, () => void>()
/** Posição (y, altura) do campo em foco dentro do conteúdo da rolagem; `null` quando ele não está nesta rolagem. */
const focused: { at: [number, number] | null } = { at: null }
const scrollTo = vi.fn()
const inner = {}
vi.mock('react-native', async () => {
  const base = (await import('./support/native')).reactNativeMock()
  const input = {
    measureLayout: (_base: unknown, ok: (x: number, y: number, w: number, h: number) => void, fail: () => void) =>
      focused.at ? ok(0, focused.at[0], 300, focused.at[1]) : fail(),
  }
  return {
    ...base,
    Keyboard: { addListener: (event: string, handler: () => void) => { listeners.set(event, handler); return { remove: () => listeners.delete(event) } } },
    TextInput: Object.assign(base.TextInput, { State: { currentlyFocusedInput: () => input } }),
  }
})

const layout = (height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } })
const scrolled = (y: number) => ({ nativeEvent: { contentOffset: { x: 0, y } } })

async function mount() {
  enableAct()
  const onScroll = vi.fn()
  let tree!: ReturnType<typeof create>
  await act(async () => {
    tree = create(React.createElement(KeyboardScrollView, { onScroll }, null), { createNodeMock: () => ({ getInnerViewRef: () => inner, scrollTo }) })
  })
  const scroll = tree.root.findByType('ScrollView' as never)
  await act(async () => { scroll.props.onLayout(layout(300)) })
  return { tree, scroll, onScroll }
}

describe('KeyboardScrollView: campo em foco à vista quando o teclado abre', () => {
  it('rola até o campo que ficou abaixo da área visível, com folga', async () => {
    scrollTo.mockClear()
    const { tree } = await mount()
    focused.at = [500, 80]
    await act(async () => { listeners.get('keyboardDidShow')?.() })
    // Base do campo (580) mais a folga de 16, menos a altura visível (300).
    expect(scrollTo).toHaveBeenCalledWith({ y: 296, animated: true })
    await act(async () => { tree.unmount() })
    expect(listeners.size).toBe(0)
  })

  it('não rola quando o campo já está inteiro à vista; o onScroll de quem usa continua sendo chamado', async () => {
    scrollTo.mockClear()
    const { tree, scroll, onScroll } = await mount()
    await act(async () => { scroll.props.onScroll(scrolled(400)) })
    expect(onScroll).toHaveBeenCalled()
    focused.at = [500, 80]
    await act(async () => { listeners.get('keyboardDidShow')?.() })
    expect(scrollTo).not.toHaveBeenCalled()
    await act(async () => { tree.unmount() })
  })

  it('campo acima da área visível volta ao topo dele; fora desta rolagem, nada acontece', async () => {
    scrollTo.mockClear()
    const { tree, scroll } = await mount()
    await act(async () => { scroll.props.onScroll(scrolled(400)) })
    focused.at = [100, 40]
    await act(async () => { listeners.get('keyboardDidShow')?.() })
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 84, animated: true })
    scrollTo.mockClear()
    focused.at = null
    await act(async () => { listeners.get('keyboardDidShow')?.() })
    expect(scrollTo).not.toHaveBeenCalled()
    await act(async () => { tree.unmount() })
  })
})

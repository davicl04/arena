import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/api/client'
import { CONNECTION_LOAD_TEXT, LoadError } from '../src/components/arena/LoadError'
import { enableAct, textOf } from './support/native'
import { textWithin } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

beforeEach(() => { enableAct() })

type Props = React.ComponentProps<typeof LoadError>
async function mount(props: Partial<Props> = {}): Promise<{ tree: ReactTestRenderer; onRetry: ReturnType<typeof vi.fn> }> {
  const onRetry = vi.fn()
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(React.createElement(LoadError, { text: 'O servidor recusou.', onRetry, size: 'screen', ...props })) })
  return { tree, onRetry }
}
const retryButton = (tree: ReactTestRenderer) => tree.root.findAllByType('Pressable' as never).find(node => textWithin(node) === 'Tentar novamente')!
const byId = (tree: ReactTestRenderer, id: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === id)

describe('LoadError: erro de carregamento da tela ou da seção', () => {
  it('de tela: Coliseu grande, título, texto e o botão primário "Tentar novamente", como alerta', async () => {
    const { tree, onRetry } = await mount({ title: 'Não foi possível carregar o evento' })
    const root = byId(tree, 'load-error-screen')[0]
    expect(root.props.accessibilityRole).toBe('alert')
    expect(byId(tree, 'load-error-mark')).toHaveLength(1)
    expect(byId(tree, 'load-error-mark')[0].props.style.opacity).toBe(0.15)
    expect(textOf(tree)).toContain('Não foi possível carregar o evento')
    expect(textOf(tree)).toContain('O servidor recusou.')
    await act(async () => { retryButton(tree).props.onPress() })
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('de seção: compacta, sem o Coliseu, com o botão de texto "Tentar novamente"', async () => {
    const { tree, onRetry } = await mount({ size: 'section' })
    expect(byId(tree, 'load-error-section')).toHaveLength(1)
    expect(byId(tree, 'load-error-mark')).toHaveLength(0)
    expect(textOf(tree)).toContain('Não foi possível carregar')
    await act(async () => { retryButton(tree).props.onPress() })
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('o tom escuro usa o Coliseu a 12% e o botão menta; na seção, o botão de texto escuro', async () => {
    const screen = await mount({ tone: 'dark' })
    expect(byId(screen.tree, 'load-error-mark')[0].props.style.opacity).toBe(0.12)
    await act(async () => { retryButton(screen.tree).props.onPress() })
    expect(screen.onRetry).toHaveBeenCalledOnce()
    const section = await mount({ tone: 'dark', size: 'section' })
    await act(async () => { retryButton(section.tree).props.onPress() })
    expect(section.onRetry).toHaveBeenCalledOnce()
  })

  it('quando a falha foi de conexão, o texto vira "Sem conexão com a ARENA…"; as outras falhas mantêm o texto do chamador', async () => {
    expect(CONNECTION_LOAD_TEXT).toBe('Sem conexão com a ARENA. Vamos tentar de novo assim que voltar.')
    for (const status of [0, 502, 503, 504]) {
      const { tree } = await mount({ cause: new ApiError('Falhou.', status) })
      expect(textOf(tree)).toContain(CONNECTION_LOAD_TEXT)
      expect(textOf(tree)).not.toContain('O servidor recusou.')
    }
    for (const cause of [new ApiError('Falhou.', 500), new Error('x'), undefined]) {
      const { tree } = await mount({ cause })
      expect(textOf(tree)).toContain('O servidor recusou.')
      expect(textOf(tree)).not.toContain(CONNECTION_LOAD_TEXT)
    }
  })
})

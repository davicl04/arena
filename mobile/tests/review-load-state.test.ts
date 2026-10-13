import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/api/client'
import { CONNECTION_LOAD_TEXT } from '../src/components/arena/LoadError'
import { ListMessage, ListMessageInline, LoadMore, LoadState } from '../src/components/review/ui'
import { enableAct, textOf } from './support/native'
import { textWithin } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

const h = React.createElement
beforeEach(() => { enableAct() })

async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(element) })
  return tree
}
const retry = (tree: ReactTestRenderer) => tree.root.findAllByType('Pressable' as never).find(node => textWithin(node) === 'Tentar novamente')
const byId = (tree: ReactTestRenderer, id: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === id)

describe('LoadState, ListMessage e ListMessageInline: erro de carregamento no LoadError', () => {
  it('erro de carregamento vira o LoadError de seção, com o texto do servidor e a nova tentativa', async () => {
    const onRetry = vi.fn()
    const tree = await mount(h(LoadState, { loading: false, error: 'Fila indisponível.', onRetry, loadingText: 'Carregando…' }))
    expect(byId(tree, 'load-error-section')[0].props.accessibilityRole).toBe('alert')
    expect(textOf(tree)).toContain('Não foi possível carregar')
    expect(textOf(tree)).toContain('Fila indisponível.')
    await act(async () => { retry(tree)!.props.onPress() })
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('size="screen" usa a variante de tela e o título próprio; sem erro nem carregamento, não desenha nada', async () => {
    const screen = await mount(h(LoadState, { loading: false, error: 'Falhou.', onRetry: vi.fn(), loadingText: 'Carregando…', size: 'screen', title: 'Não foi possível carregar o evento' }))
    expect(byId(screen, 'load-error-screen')).toHaveLength(1)
    expect(textOf(screen)).toContain('Não foi possível carregar o evento')
    const loading = await mount(h(LoadState, { loading: true, error: null, onRetry: vi.fn(), loadingText: 'Carregando o evento…' }))
    expect(textOf(loading)).toContain('Carregando o evento…')
    expect(byId(loading, 'load-error-section')).toHaveLength(0)
    const idle = await mount(h(LoadState, { loading: false, error: null, onRetry: vi.fn(), loadingText: 'x' }))
    expect(idle.toJSON()).toBeNull()
  })

  it('a falha de conexão troca o texto pelo aviso de conexão (a causa vem do erro da lista)', async () => {
    const list = { loading: false, error: new ApiError('Sem rede.', 0), items: [], reload: vi.fn() }
    const message = await mount(h(ListMessage, { list, loadingText: 'Carregando…', emptyTitle: 'Nada', emptyText: 'Vazio' }))
    expect(textOf(message)).toContain(CONNECTION_LOAD_TEXT)
    expect(textOf(message)).not.toContain('Sem rede.')
    const inline = await mount(h(ListMessageInline, { list, loadingText: 'Carregando…', emptyText: 'Vazio' }))
    expect(textOf(inline)).toContain(CONNECTION_LOAD_TEXT)
    await act(async () => { retry(inline)!.props.onPress() })
    expect(list.reload).toHaveBeenCalledOnce()
    const plain = await mount(h(ListMessage, { list: { ...list, error: new ApiError('Servidor com problema.', 500) }, loadingText: 'Carregando…', emptyTitle: 'Nada', emptyText: 'Vazio' }))
    expect(textOf(plain)).toContain('Servidor com problema.')
  })

  it('o erro de "carregar mais" continua no rodapé da lista, junto do botão', async () => {
    const tree = await mount(h(LoadMore, { list: { moreError: 'Não foi possível carregar mais.', hasMore: true, busy: false, loadMore: vi.fn() }, label: 'Carregar mais denúncias' }))
    expect(textOf(tree)).toContain('Não foi possível carregar mais.')
    expect(textOf(tree)).toContain('Carregar mais denúncias')
    expect(byId(tree, 'load-error-section')).toHaveLength(0)
  })
})

import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary, ErrorPlate } from '../src/components/ErrorBoundary'
import { colors } from '../src/theme'
import { byLabel, enableAct, press, textOf } from './support/native'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }))

const h = React.createElement
const SECRET = 'TypeError: detalhe técnico que não pode aparecer na tela'
let broken = true
let mounts = 0
/** Tela que falha ao desenhar enquanto `broken` estiver ligado; conta quantas vezes foi montada. */
function Screen() {
  React.useEffect(() => { mounts += 1 }, [])
  if (broken) throw new Error(SECRET)
  return h('Text', null, 'Tela funcionando')
}

beforeEach(() => {
  enableAct()
  broken = true
  mounts = 0
  // O React registra o erro capturado no console; o teste só confere o que a pessoa vê.
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => { vi.restoreAllMocks() })

async function render(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(element) })
  return tree
}

describe('ErrorBoundary: rede de segurança do app', () => {
  it('um erro ao desenhar mostra a placa em português, sem detalhes técnicos, com "Tentar de novo"', async () => {
    const tree = await render(h(ErrorBoundary, null, h(Screen)))
    const text = textOf(tree)
    expect(text).toContain('Algo deu errado')
    expect(text).toContain('Não foi possível mostrar esta tela.')
    expect(text).not.toContain('TypeError')
    expect(text).not.toContain(SECRET)
    expect(byLabel(tree, 'Tentar de novo')).toHaveLength(1)
    expect(byLabel(tree, 'Tentar de novo')[0].props.accessibilityRole).toBe('button')
    // Visual da placa `forest` com o cartão branco.
    const plate = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'error-plate')[0]
    expect(plate.props.style).toMatchObject({ flex: 1, backgroundColor: colors.forest })
    await act(async () => { tree.unmount() })
  })

  it('"Tentar de novo" remonta a árvore do zero e mostra a tela quando o erro passou', async () => {
    const tree = await render(h(ErrorBoundary, null, h(Screen)))
    expect(mounts).toBe(0)
    broken = false
    await press(tree, 'Tentar de novo')
    expect(textOf(tree)).toContain('Tela funcionando')
    expect(textOf(tree)).not.toContain('Algo deu errado')
    expect(mounts).toBe(1)
    await act(async () => { tree.unmount() })
  })

  it('se o erro persiste, a placa volta e dá para tentar mais uma vez', async () => {
    const tree = await render(h(ErrorBoundary, null, h(Screen)))
    await press(tree, 'Tentar de novo')
    expect(textOf(tree)).toContain('Algo deu errado')
    broken = false
    await press(tree, 'Tentar de novo')
    expect(textOf(tree)).toContain('Tela funcionando')
    await act(async () => { tree.unmount() })
  })

  it('sem erro, só entrega os filhos', async () => {
    broken = false
    const tree = await render(h(ErrorBoundary, null, h(Screen)))
    expect(textOf(tree)).toContain('Tela funcionando')
    expect(byLabel(tree, 'Tentar de novo')).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('ErrorPlate chama onRetry ao tocar no botão', async () => {
    const onRetry = vi.fn()
    const tree = await render(h(ErrorPlate, { onRetry }))
    await press(tree, 'Tentar de novo')
    expect(onRetry).toHaveBeenCalledTimes(1)
    await act(async () => { tree.unmount() })
  })
})

import React from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { enableAct } from './support/native'
import { useBottomInset, useNavInset } from '../src/hooks/useBottomInset'

const listeners = new Map<string, () => void>()
const keyboard = { visible: false }
vi.mock('react-native', async () => {
  const base = (await import('./support/native')).reactNativeMock()
  return { ...base, Platform: { OS: 'ios' }, Keyboard: { isVisible: () => keyboard.visible, addListener: (event: string, handler: () => void) => { listeners.set(event, handler); return { remove: () => listeners.delete(event) } } } }
})
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }) }))

const seen: number[] = []
const Probe = () => { seen.push(useBottomInset()); return null }

describe('recuo de baixo da área logada', () => {
  it('usa a área segura e zera com o teclado aberto, para a barra encostar no teclado', async () => {
    enableAct()
    let tree!: ReturnType<typeof create>
    await act(async () => { tree = create(React.createElement(Probe)) })
    expect(seen.at(-1)).toBe(34)
    await act(async () => { listeners.get('keyboardWillShow')?.() })
    expect(seen.at(-1)).toBe(0)
    await act(async () => { listeners.get('keyboardWillHide')?.() })
    expect(seen.at(-1)).toBe(34)
    await act(async () => { tree.unmount() })
    expect(listeners.size).toBe(0)
  })

  it('quem monta com o teclado já aberto começa sem o recuo', async () => {
    enableAct()
    keyboard.visible = true
    let tree!: ReturnType<typeof create>
    await act(async () => { tree = create(React.createElement(Probe)) })
    expect(seen.at(-1)).toBe(0)
    await act(async () => { tree.unmount() })
    keyboard.visible = false
  })

  it('a navegação cresce só o que a folga de 11 de baixo não cobre da área segura, e nada com o teclado aberto', async () => {
    enableAct()
    const grown: number[] = []
    const Nav = () => { grown.push(useNavInset()); return null }
    let tree!: ReturnType<typeof create>
    await act(async () => { tree = create(React.createElement(Nav)) })
    expect(grown.at(-1)).toBe(23)
    await act(async () => { listeners.get('keyboardWillShow')?.() })
    expect(grown.at(-1)).toBe(0)
    await act(async () => { listeners.get('keyboardWillHide')?.() })
    expect(grown.at(-1)).toBe(23)
    await act(async () => { tree.unmount() })
  })
})

import React from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as SecureStore from 'expo-secure-store'
import { appearance, enableAct, textOf } from './support/native'
import { THEME_STORAGE_KEY, themeStore, useThemeColors } from '../src/hooks/useTheme'
import { AppearanceCard } from '../src/components/menu/AppearanceCard'
import { appearanceTitle } from '../src/components/menu/appearance'
import { darkColors, lightColors } from '../src/theme'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

beforeEach(() => {
  enableAct()
  appearance.reset()
  themeStore.reset()
  vi.mocked(SecureStore.getItemAsync).mockReset().mockResolvedValue(null)
  vi.mocked(SecureStore.setItemAsync).mockReset().mockResolvedValue(undefined)
})

const toggle = (tree: ReturnType<typeof create>, label: string) =>
  tree.root.findAllByType('Pressable' as never).find(entry => entry.props.accessibilityLabel === label)!

describe('tema do Expo', () => {
  it('segue o sistema enquanto não há preferência salva', async () => {
    appearance.setSystem('dark')
    await themeStore.load()
    expect(themeStore.getPreference()).toBe('system')
    expect(appearance.override).toBeNull()
    expect(appearance.scheme).toBe('dark')
  })

  it('lê a preferência de arena.tema e a aplica pelo Appearance', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue('dark')
    await themeStore.load()
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(THEME_STORAGE_KEY)
    expect(themeStore.getPreference()).toBe('dark')
    expect(appearance.scheme).toBe('dark')
  })

  it('ignora valor inválido e falha de leitura ou gravação', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue('roxo')
    await themeStore.load()
    expect(themeStore.getPreference()).toBe('system')
    vi.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('indisponível'))
    await expect(themeStore.load()).resolves.toBeUndefined()
    vi.mocked(SecureStore.setItemAsync).mockRejectedValue(new Error('indisponível'))
    expect(() => themeStore.setPreference('light')).not.toThrow()
    expect(appearance.scheme).toBe('light')
  })

  it('devolve as cores do tema resolvido', async () => {
    let seen: typeof lightColors | undefined
    const Probe = () => { seen = useThemeColors() as typeof lightColors; return null }
    await act(async () => { create(React.createElement(Probe)) })
    expect(seen).toBe(lightColors)
    await act(async () => { appearance.setSystem('dark') })
    expect(seen).toBe(darkColors)
    expect(darkColors.forest).toBe(lightColors.forest)
  })

  it('mostra o título certo nos três casos', () => {
    expect(appearanceTitle('light', 'light')).toBe('Jogo de dia')
    expect(appearanceTitle('dark', 'dark')).toBe('Jogo à noite')
    expect(appearanceTitle('system', 'dark')).toBe('Automático · noite agora')
    expect(appearanceTitle('system', 'light')).toBe('Automático · dia agora')
  })

  it('o cartão Aparência marca a opção, troca o tema e grava a escolha', async () => {
    let tree!: ReturnType<typeof create>
    await act(async () => { tree = create(React.createElement(AppearanceCard)) })
    expect(textOf(tree)).toContain('Automático · dia agora')
    expect(toggle(tree, 'Automático').props.accessibilityState).toEqual({ checked: true })

    await act(async () => { toggle(tree, 'Noite').props.onPress() })
    expect(toggle(tree, 'Noite').props.accessibilityState).toEqual({ checked: true })
    expect(toggle(tree, 'Automático').props.accessibilityState).toEqual({ checked: false })
    expect(appearance.scheme).toBe('dark')
    expect(textOf(tree)).toContain('Jogo à noite')
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'dark')

    await act(async () => { toggle(tree, 'Automático').props.onPress() })
    expect(textOf(tree)).toContain('Automático · dia agora')
    await act(async () => { appearance.setSystem('dark') })
    expect(textOf(tree)).toContain('Automático · noite agora')
    const group = tree.root.findAll(node => node.props.role === 'group' && node.props['aria-label'] === 'Tema')
    expect(group.length).toBeGreaterThan(0)
  })
})

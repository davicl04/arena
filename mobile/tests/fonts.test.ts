import React from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAct } from './support/native'
import { fontFamilyFor, weightOf } from '../src/fonts'
import { Text, TextInput, resolveFont, setFontsAvailable } from '../src/components/Text'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())

afterEach(() => setFontsAvailable(false))

describe('fontes da web: peso → família', () => {
  it('lê o peso do React Native', () => {
    expect(weightOf(undefined)).toBe(400)
    expect(weightOf('normal')).toBe(400)
    expect(weightOf('bold')).toBe(700)
    expect(weightOf('600')).toBe(600)
    expect(weightOf(800)).toBe(800)
  })

  it('escolhe a família carregada mais próxima, com Inter até 700 e Sora de 600 a 800', () => {
    expect(fontFamilyFor('sans', 400)).toBe('Inter_400Regular')
    expect(fontFamilyFor('sans', 500)).toBe('Inter_500Medium')
    expect(fontFamilyFor('sans', 800)).toBe('Inter_700Bold')
    expect(fontFamilyFor('sans', 300)).toBe('Inter_400Regular')
    expect(fontFamilyFor('display', 400)).toBe('Sora_600SemiBold')
    expect(fontFamilyFor('display', 700)).toBe('Sora_700Bold')
    expect(fontFamilyFor('display', 900)).toBe('Sora_800ExtraBold')
  })
})

describe('Text do app', () => {
  it('sem as fontes, o estilo segue intacto', () => {
    expect(resolveFont({ fontWeight: '700' })?.style).toBeNull()
  })

  it('troca o peso pela família e tira o fontWeight do estilo final', () => {
    setFontsAvailable(true)
    expect(resolveFont([{ fontSize: 14 }, { fontWeight: '600' }])?.style).toEqual({ fontSize: 14, fontFamily: 'Inter_600SemiBold' })
  })

  it('título, display e font-display usam Sora; título sem peso fica em 700', () => {
    setFontsAvailable(true)
    expect(resolveFont({}, { header: true })?.style?.fontFamily).toBe('Sora_700Bold')
    expect(resolveFont({ fontWeight: '800' }, { display: true })?.style?.fontFamily).toBe('Sora_800ExtraBold')
    expect(resolveFont({ fontFamily: 'Sora', fontWeight: '600' })?.style?.fontFamily).toBe('Sora_600SemiBold')
  })

  it('mantém outra família explícita (monospace)', () => {
    setFontsAvailable(true)
    expect(resolveFont({ fontFamily: 'monospace', fontWeight: '700' })).toBeNull()
  })

  it('o Text aninhado herda o papel e o peso do pai', async () => {
    enableAct()
    setFontsAvailable(true)
    let tree!: ReturnType<typeof create>
    await act(async () => {
      tree = create(React.createElement(Text, { accessibilityRole: 'header', style: { fontWeight: '800' } }, 'A ', React.createElement(Text, { style: { color: 'red' } }, 'arena')))
    })
    const [outer, inner] = tree.root.findAllByType('Text' as never)
    expect(outer.props.style.fontFamily).toBe('Sora_800ExtraBold')
    expect(inner.props.style).toEqual({ color: 'red', fontFamily: 'Sora_800ExtraBold' })
  })

  it('o TextInput usa Inter no peso pedido', async () => {
    enableAct()
    setFontsAvailable(true)
    let tree!: ReturnType<typeof create>
    await act(async () => { tree = create(React.createElement(TextInput, { accessibilityLabel: 'Campo', style: { fontSize: 16 } })) })
    expect(tree.root.findByType('TextInput' as never).props.style).toEqual({ fontSize: 16, fontFamily: 'Inter_400Regular' })
  })
})

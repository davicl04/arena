import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationBell, bellCount, bellLabel } from '../src/components/notifications/NotificationBell'
import { enableAct, textOf } from './support/native'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())

const h = React.createElement
beforeEach(() => { enableAct() })

async function mount(props: Partial<React.ComponentProps<typeof NotificationBell>> = {}) {
  const onOpen = props.onOpen ?? vi.fn()
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(h(NotificationBell, { count: 0, tone: 'light', onOpen, ...props })) })
  const button = tree.root.findAll(node => String(node.type) === 'Pressable')[0]
  const badge = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'unread-indicator')[0]
  return { tree, button, badge, onOpen }
}

describe('NotificationBell', () => {
  it('é um botão "Notificações" sem contador quando não há novidades', async () => {
    const { button, badge, tree } = await mount({ count: 0 })
    expect(button.props.accessibilityRole).toBe('button')
    expect(button.props.accessibilityLabel).toBe('Notificações')
    expect(badge).toBeUndefined()
    expect(textOf(tree)).toBe('')
  })

  it('mostra o número, "1 nova" no singular e "N novas" nos demais, com o contador fora da acessibilidade', async () => {
    const one = await mount({ count: 1 })
    expect(one.button.props.accessibilityLabel).toBe('Notificações, 1 nova')
    expect(textOf(one.tree)).toBe('1')
    const five = await mount({ count: 5 })
    expect(five.button.props.accessibilityLabel).toBe('Notificações, 5 novas')
    expect(textOf(five.tree)).toBe('5')
    expect(five.badge.props.accessibilityElementsHidden).toBe(true)
    expect(five.badge.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('limita o número a "9+" acima de 9, mas o rótulo falado diz o total', async () => {
    const nine = await mount({ count: 9 })
    expect(textOf(nine.tree)).toBe('9')
    const many = await mount({ count: 12 })
    expect(textOf(many.tree)).toBe('9+')
    expect(many.button.props.accessibilityLabel).toBe('Notificações, 12 novas')
    expect([bellCount(10), bellLabel(0), bellLabel(2)]).toEqual(['9+', 'Notificações', 'Notificações, 2 novas'])
  })

  it('tem alvo de 44 pt em todos os tons e chama onOpen ao tocar', async () => {
    for (const tone of ['light', 'dark', 'cover'] as const) {
      const { button, onOpen } = await mount({ count: 3, tone })
      expect(button.props.style).toMatchObject({ width: 44, height: 44 })
      await act(async () => { button.props.onPress() })
      expect(onOpen).toHaveBeenCalledTimes(1)
    }
  })

  it('claro: contador verde com anel do fundo; escuro: vidro com contador menta e anel forest; capa: vidro claro, sem vidro quando condensada', async () => {
    const light = await mount({ count: 3, tone: 'light' })
    expect(light.badge.props.style).toMatchObject({ backgroundColor: '#005a36', borderColor: '#e2e4e9' })
    expect(light.button.props.style.backgroundColor).toBe('transparent')
    const dark = await mount({ count: 3, tone: 'dark' })
    expect(dark.badge.props.style).toMatchObject({ backgroundColor: '#8fe0b4', borderColor: '#0b2218' })
    expect(dark.button.props.style.backgroundColor).toBe('rgba(255,255,255,0.1)')
    const cover = await mount({ count: 3, tone: 'cover' })
    expect(cover.button.props.style.backgroundColor).toBe('#ffffffd9')
    expect(cover.badge.props.style.backgroundColor).toBe('#005a36')
    const condensed = await mount({ count: 3, tone: 'cover', condensed: true })
    expect(condensed.button.props.style.backgroundColor).toBe('transparent')
  })
})

import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connection } from '../src/api/connection'
import BottomNav from '../src/components/BottomNav'
import { ConnectionNotice } from '../src/components/ConnectionNotice'
import { toast, toastStore } from '../src/components/toast/toastStore'
import { ToastViewport } from '../src/components/toast/ToastViewport'
import { enableAct } from './support/native'
import { track, unmountToastTrees } from './support/toast'

const inset = { bottom: 0 }
vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('react-native-safe-area-context', async () => ({ ...(await import('./support/native')).safeAreaMock(), useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: inset.bottom, left: 0 }) }))

beforeEach(() => {
  enableAct()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
})
afterEach(async () => { await unmountToastTrees(); connection.reset(); toastStore.reset(); vi.unstubAllGlobals() })

async function mount(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => {
    tree = track(create(React.createElement(React.Fragment, null,
      React.createElement(BottomNav, { active: 'home', onGo: () => {} }),
      React.createElement(ToastViewport, { placement: 'nav' }),
      React.createElement(ConnectionNotice))))
  })
  await act(async () => { connection.lost({ mutating: false }); toast.success('Posição') })
  return tree
}
const host = (tree: ReactTestRenderer, match: (props: Record<string, unknown>) => boolean) => tree.root.find(node => typeof node.type === 'string' && match(node.props))

describe('navegação inferior, faixa de conexão e toast com a área segura de baixo', () => {
  it.each([
    // iPhone com indicador de início: a folga de 11 da barra fica dentro dos 34, e a barra cresce só 23.
    [34, { nav: 105, padding: 34, strip: 105, toast: 161 }],
    // Área segura menor que a folga de 11: a barra fica com as medidas da web.
    [6, { nav: 82, padding: 11, strip: 82, toast: 138 }],
  ] as const)('com %i pt de área segura, os três ficam na mesma altura', async (bottom, expected) => {
    inset.bottom = bottom
    const tree = await mount()
    expect(host(tree, props => props.accessibilityRole === 'tablist').props.style).toMatchObject({ height: expected.nav, paddingBottom: expected.padding })
    expect(host(tree, props => props.testID === 'connection-strip').props.style[0]).toMatchObject({ bottom: expected.strip })
    expect(host(tree, props => props.testID === 'toast-viewport').props.style).toMatchObject({ bottom: expected.toast })
  })
})

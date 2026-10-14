import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { expect, it, vi } from 'vitest'
import App from '../App'
import { request } from '../src/api/client'
import { toast, toastStore } from '../src/components/toast/toastStore'
import { enableAct } from './support/native'
import { findToast } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }))
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../global.css', () => ({}))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn(), clearToken: vi.fn() }))
vi.mock('../src/screens/AuthScreen', () => ({ default: (props: Record<string, unknown>) => React.createElement('AuthProbe', props) }))
vi.mock('../src/screens/ArenaShell', async () => {
  const { ToastViewport } = await import('../src/components/toast/ToastViewport')
  return { default: (props: Record<string, unknown>) => React.createElement('ShellProbe', props, React.createElement(ToastViewport, { placement: 'nav' })) }
})

it.each(['onExpired', 'onLogout'])('descarta mensagens e ações da conta anterior ao chamar %s', async callback => {
  enableAct()
  const first = { id: 1, name: 'Conta A', username: 'conta.a', email: 'a@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
  vi.mocked(request).mockResolvedValue(first)
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(React.createElement(App)) })
  await act(async () => { toast.error('Mensagem privada da conta A', { action: { label: 'Abrir', onClick: vi.fn() } }) })
  expect(findToast(tree, 'Mensagem privada da conta A')).toBeTruthy()
  await act(async () => { tree.root.findByType('ShellProbe' as never).props[callback]() })
  expect(toastStore.getState().toasts).toEqual([])
  expect(findToast(tree, 'Mensagem privada da conta A')).toBeUndefined()
  await act(async () => { tree.root.findByType('AuthProbe' as never).props.onLogin({ ...first, id: 2, name: 'Conta B' }) })
  expect(tree.root.findByType('ShellProbe' as never).props.user.id).toBe(2)
  expect(findToast(tree, 'Mensagem privada da conta A')).toBeUndefined()
  await act(async () => { tree.unmount() })
})

import React from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import ProfileScreen from '../src/screens/ProfileScreen'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn(), ImagePickerResult: undefined }))
vi.mock('../src/components/SportCard', () => ({ default: () => null }))
vi.mock('../src/api/client', () => ({
  ApiError: class ApiError extends Error { constructor(message: string, public status: number) { super(message) } },
  apiUrl: (path: string) => path,
  getToken: vi.fn().mockResolvedValue('test-token'),
  clearToken: vi.fn(), sports: [],
  request: vi.fn(),
}))

const me = { id: 1, name: 'Maria Souza', username: 'maria.s', email: 'maria@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
type Tree = ReturnType<typeof create>
const texts = (tree: Tree) => tree.root.findAllByType('Text' as never).map(entry => JSON.stringify(entry.props.children)).join(' ')
const pressables = (tree: Tree, label: string) => tree.root.findAllByType('Pressable' as never).filter(entry => entry.props.accessibilityLabel === label)
async function press(tree: Tree, label: string) {
  const targets = pressables(tree, label)
  expect(targets.length, `Pressable "${label}"`).toBeGreaterThan(0)
  await act(async () => { targets[targets.length - 1].props.onPress() })
}

describe('Menu do perfil: seções de outras áreas (organizador e administração)', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.mocked(request).mockReset().mockImplementation(async path => (path === '/cities' || path === '/me/sports-profiles' ? [] : { items: [], next_cursor: null }) as never)
  })

  it('mostra as seções entre Conta e App e entrega a função que fecha o Menu', async () => {
    const sections = vi.fn((close: () => void) => React.createElement('Pressable', { accessibilityLabel: 'Seção de teste', onPress: close }, React.createElement('Text', null, 'ORGANIZADOR')))
    let tree!: Tree
    await act(async () => { tree = create(React.createElement(ProfileScreen, { user: me, onExpired: vi.fn(), onLogout: vi.fn(), onUser: vi.fn(), menuSections: sections })) })
    expect(sections).not.toHaveBeenCalled()
    await press(tree, 'Menu')
    const text = texts(tree)
    expect(sections).toHaveBeenCalled()
    expect(text.indexOf('"CONTA"')).toBeLessThan(text.indexOf('"ORGANIZADOR"'))
    expect(text.indexOf('"ORGANIZADOR"')).toBeLessThan(text.indexOf('"APP"'))
    // Fechar o Menu pela função recebida: a folha some (a seção sai junto).
    await press(tree, 'Seção de teste')
    expect(texts(tree)).not.toContain('"ORGANIZADOR"')
    expect(texts(tree)).not.toContain('"CONTA"')
    await act(async () => { tree.unmount() })
  })
})

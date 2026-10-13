import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import AuthScreen from '../src/screens/AuthScreen'
import { enableAct, textOf } from './support/native'
import { toastText, toasts } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/components/ui', async () => (await import('./support/native')).uiMock())
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn(), saveToken: vi.fn() }))

const onLogin = vi.fn()

async function mount(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(React.createElement(AuthScreen, { onLogin })) })
  return tree
}
const field = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('TextInput' as never).find(node => node.props.accessibilityLabel === label)!
const typeInto = async (tree: ReactTestRenderer, label: string, value: string) => { await act(async () => { field(tree, label).props.onChangeText(value) }) }
const click = async (tree: ReactTestRenderer, title: string) => {
  const target = tree.root.findAllByType('Button' as never).find(node => node.props.title === title)
  expect(target, `Button "${title}"`).toBeTruthy()
  await act(async () => { target!.props.onPress() })
}

beforeEach(() => {
  enableAct()
  onLogin.mockReset()
  vi.mocked(request).mockReset()
})

describe('Entrada: cadastro e login', () => {
  it('conta criada confirma com um toast de sucesso e volta ao login; os erros continuam no formulário', async () => {
    vi.mocked(request).mockResolvedValue({} as never)
    const tree = await mount()
    await click(tree, 'Criar conta')
    await typeInto(tree, 'Nome completo', 'Maria Souza')
    await typeInto(tree, 'Data de nascimento (DD/MM/AAAA)', '01/02/1990')
    await typeInto(tree, 'E-mail', 'maria@example.com')
    await typeInto(tree, 'Senha (10 a 128 caracteres)', 'senha-bem-longa')
    await click(tree, 'Criar minha conta')
    expect(vi.mocked(request).mock.calls[0]).toEqual(['/auth/register', 'POST', { name: 'Maria Souza', email: 'maria@example.com', password: 'senha-bem-longa', birth_date: '1990-02-01' }])
    expect(toasts().map(item => item.tone)).toEqual(['success'])
    expect(toastText()).toContain('Conta criada. Entre com seu e-mail e senha.')
    // A confirmação não fica como texto na tela, e o formulário voltou ao login.
    expect(textOf(tree)).not.toContain('Conta criada.')
    expect(textOf(tree)).toContain('Bom ter você aqui')
  })

  it('erro do servidor no cadastro ou no login fica no formulário, sem toast', async () => {
    vi.mocked(request).mockRejectedValue(new ApiError('E-mail ou senha inválidos.', 401))
    const tree = await mount()
    await typeInto(tree, 'E-mail', 'maria@example.com')
    await typeInto(tree, 'Senha', 'errada')
    await click(tree, 'Entrar no Arena')
    expect(textOf(tree)).toContain('E-mail ou senha inválidos.')
    expect(toasts()).toEqual([])
    expect(onLogin).not.toHaveBeenCalled()
  })
})

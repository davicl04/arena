import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request, saveToken } from '../src/api/client'
import AuthScreen from '../src/screens/AuthScreen'
import { enableAct, press, textOf } from './support/native'
import { toastText, toasts } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn(), saveToken: vi.fn() }))

const onLogin = vi.fn()
const onConnectionFailure = vi.fn()

async function mount(notice?: React.ReactNode): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(React.createElement(AuthScreen, { onLogin, onConnectionFailure, notice })) })
  return tree
}
const field = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('TextInput' as never).find(node => node.props.accessibilityLabel === label)
const typeInto = async (tree: ReactTestRenderer, label: string, value: string) => {
  const target = field(tree, label)
  expect(target, `Campo "${label}"`).toBeTruthy()
  await act(async () => { target!.props.onChangeText(value) })
}
const control = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('Pressable' as never).find(node => node.props.accessibilityLabel === label)
/** Estado exposto do seletor Entrar | Criar conta: qual modo está marcado. */
const selectedMode = (tree: ReactTestRenderer) => ['Entrar', 'Criar conta'].filter(label => control(tree, label)?.props.accessibilityState?.selected)

beforeEach(() => {
  enableAct()
  onLogin.mockReset()
  onConnectionFailure.mockReset()
  vi.mocked(request).mockReset()
  vi.mocked(saveToken).mockReset()
})

describe('Entrada: cadastro e login', () => {
  it('abre no modo Entrar e o seletor expõe o modo marcado; trocar de modo troca o formulário e os títulos', async () => {
    const tree = await mount()
    expect(selectedMode(tree)).toEqual(['Entrar'])
    expect(field(tree, 'Nome completo')).toBeUndefined()
    expect(textOf(tree)).toContain('Bom ter você aqui')
    await press(tree, 'Criar conta')
    expect(selectedMode(tree)).toEqual(['Criar conta'])
    expect(textOf(tree)).toContain('Comece sua jornada')
    expect(field(tree, 'Nome completo')).toBeTruthy()
    // A ajuda dos 18 anos fica associada ao campo da data (lida com ele).
    expect(field(tree, 'Data de nascimento (DD/MM/AAAA)')!.props.accessibilityHint).toBe('A Arena é para pessoas com 18 anos completos ou mais.')
    expect(control(tree, 'Criar minha conta')).toBeTruthy()
    await press(tree, 'Entrar')
    expect(selectedMode(tree)).toEqual(['Entrar'])
    expect(control(tree, 'Entrar na Arena')).toBeTruthy()
  })

  it('conta criada confirma com um toast de sucesso e volta ao login sem autenticar; os erros continuam no formulário', async () => {
    vi.mocked(request).mockResolvedValue({} as never)
    const tree = await mount()
    await press(tree, 'Criar conta')
    await typeInto(tree, 'Nome completo', 'Maria Souza')
    await typeInto(tree, 'Data de nascimento (DD/MM/AAAA)', '01/02/1990')
    await typeInto(tree, 'E-mail', 'maria@example.com')
    await typeInto(tree, 'Senha (10 a 128 caracteres)', 'senha-bem-longa')
    await press(tree, 'Criar minha conta')
    expect(vi.mocked(request).mock.calls).toEqual([['/auth/register', 'POST', { name: 'Maria Souza', email: 'maria@example.com', password: 'senha-bem-longa', birth_date: '1990-02-01' }]])
    expect(toasts().map(item => item.tone)).toEqual(['success'])
    expect(toastText()).toContain('Conta criada. Entre com seu e-mail e senha.')
    // A confirmação não fica como texto na tela, o formulário voltou ao modo Entrar e ninguém foi autenticado.
    expect(textOf(tree)).not.toContain('Conta criada.')
    expect(textOf(tree)).toContain('Bom ter você aqui')
    expect(selectedMode(tree)).toEqual(['Entrar'])
    expect(onLogin).not.toHaveBeenCalled()
    expect(saveToken).not.toHaveBeenCalled()
  })

  it('cadastro com a data fora de DD/MM/AAAA não envia e avisa no formulário', async () => {
    const tree = await mount()
    await press(tree, 'Criar conta')
    await typeInto(tree, 'Nome completo', 'Maria Souza')
    await typeInto(tree, 'Data de nascimento (DD/MM/AAAA)', '1990-02-01')
    await typeInto(tree, 'E-mail', 'maria@example.com')
    await typeInto(tree, 'Senha (10 a 128 caracteres)', 'senha-bem-longa')
    await press(tree, 'Criar minha conta')
    expect(request).not.toHaveBeenCalled()
    expect(textOf(tree)).toContain('Preencha os campos. Use DD/MM/AAAA para a data de nascimento.')
  })

  it('login guarda o token e entrega a conta ao aplicativo; durante o envio o botão mostra "Aguarde…" e o seletor trava', async () => {
    const user = { id: 1, name: 'Maria Souza' }
    let answer!: (value: unknown) => void
    vi.mocked(request).mockReturnValue(new Promise(resolve => { answer = resolve }) as never)
    const tree = await mount()
    await typeInto(tree, 'E-mail', ' maria@example.com ')
    await typeInto(tree, 'Senha', 'segredo-longo')
    await act(async () => { control(tree, 'Entrar na Arena')!.props.onPress() })
    const waiting = control(tree, 'Aguarde…')
    expect(waiting?.props.accessibilityState).toMatchObject({ disabled: true, busy: true })
    expect(control(tree, 'Criar conta')!.props.disabled).toBe(true)
    await act(async () => { answer({ user, token: 'token-de-teste' }) })
    expect(request).toHaveBeenCalledWith('/auth/login', 'POST', { email: 'maria@example.com', password: 'segredo-longo' })
    expect(saveToken).toHaveBeenCalledWith('token-de-teste')
    expect(onLogin).toHaveBeenCalledWith(user)
  })

  it('erro do servidor no login fica no formulário como alerta, sem toast', async () => {
    vi.mocked(request).mockRejectedValue(new ApiError('E-mail ou senha inválidos.', 401))
    const tree = await mount()
    await typeInto(tree, 'E-mail', 'maria@example.com')
    await typeInto(tree, 'Senha', 'errada')
    await press(tree, 'Entrar na Arena')
    const alert = tree.root.findAll(node => node.type === ('View' as never) && node.props.accessibilityRole === 'alert')
    expect(alert).toHaveLength(1)
    expect(textOf(tree)).toContain('E-mail ou senha inválidos.')
    expect(toasts()).toEqual([])
    expect(onLogin).not.toHaveBeenCalled()
    expect(onConnectionFailure).not.toHaveBeenCalled()
  })

  it('falha de conexão ao entrar sobe para o aplicativo e o formulário não repete a mensagem', async () => {
    const down = new ApiError('Não foi possível conectar à ARENA.', 503)
    vi.mocked(request).mockRejectedValue(down)
    const tree = await mount()
    await typeInto(tree, 'E-mail', 'maria@example.com')
    await typeInto(tree, 'Senha', 'qualquer')
    await press(tree, 'Entrar na Arena')
    expect(onConnectionFailure).toHaveBeenCalledWith(down)
    expect(textOf(tree)).not.toContain('Não foi possível conectar à ARENA.')
    expect(toasts()).toEqual([])
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('os avisos do aplicativo aparecem no formulário, antes do seletor de modo', async () => {
    const tree = await mount(React.createElement('Text', { accessibilityRole: 'alert' }, 'Sua sessão expirou. Entre novamente.'))
    const text = textOf(tree)
    expect(text).toContain('Sua sessão expirou. Entre novamente.')
    expect(text.indexOf('Sua sessão expirou.')).toBeLessThan(text.indexOf('Criar conta'))
  })
})

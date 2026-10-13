import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { City, User } from '../src/api/client'
import { connection } from '../src/api/connection'
import AccountActions from '../src/components/AccountActions'
import SportCard from '../src/components/SportCard'
import UsernameForm from '../src/components/UsernameForm'
import { button, click, enableAct, press, textOf, type } from './support/native'
import { toasts } from './support/toast'

vi.mock('react-native', async () => {
  const native = await import('./support/native')
  return { ...native.reactNativeMock(), Switch: (props: Record<string, unknown>) => React.createElement('Switch', props) }
})
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn() }))
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/components/ui', async () => (await import('./support/native')).uiMock())
vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  getToken: vi.fn().mockResolvedValue('test-token'), request: vi.fn(),
}))

/*
 * Salvar modalidade, bloquear conta e trocar o @: a confirmação e as falhas de ação saem em toast (ou no aviso de conexão),
 * e só o que pertence ao campo (cidade faltando, 422 do formulário, @ em uso) fica dentro do componente.
 */

const cities: City[] = [{ id: 7, name: 'Natal', state: 'RN' }]
const person = { id: 5, name: 'Ana Lima', username: 'ana.lima', avatar_url: null, cover_url: null, social_public: true, post_count: 0, follower_count: 0, following_count: 0, follows_you: false, follow_state: 'none' as const }
const trees: ReactTestRenderer[] = []
async function mount(element: React.ReactElement) {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(element) })
  trees.push(tree)
  return tree
}
const fail = (status: number, message = 'Falhou no servidor.', fields: { field: string; message: string }[] = []) => new ApiError(message, status, fields, { detail: message })
const summary = () => toasts().map(item => [item.tone, item.title])

beforeEach(() => { enableAct(); vi.mocked(request).mockReset() })
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); for (const tree of trees.splice(0)) await act(async () => { tree.unmount() }) })

describe('SportCard', () => {
  const card = (onSave: () => Promise<void>, onExpired = vi.fn()) => mount(React.createElement(SportCard, { sport: 'tenis', label: 'Tênis', cities, onSave, onExpired }))
  async function openAndPickCity(tree: ReactTestRenderer) {
    await click(tree, 'Adicionar tênis')
    const radio = tree.root.findAllByType('Pressable' as never).find(entry => entry.props.accessibilityRole === 'radio')!
    await act(async () => { radio.props.onPress() })
  }

  it('salvar com sucesso avisa em toast e fecha a edição', async () => {
    const tree = await card(vi.fn().mockResolvedValue(undefined))
    await openAndPickCity(tree)
    await click(tree, 'Salvar perfil')
    expect(summary()).toEqual([['success', 'Perfil salvo.']])
    expect(textOf(tree)).not.toContain('Perfil salvo.')
    expect(textOf(tree)).not.toContain('Salvar perfil')
  })

  it('a cidade faltando fica junto ao formulário, sem toast', async () => {
    const onSave = vi.fn()
    const tree = await card(onSave)
    await click(tree, 'Adicionar tênis')
    await click(tree, 'Salvar perfil')
    expect(textOf(tree)).toContain('Selecione uma cidade.')
    expect(onSave).not.toHaveBeenCalled()
    expect(toasts()).toEqual([])
  })

  it('falha comum vira toast de erro e mantém a edição aberta', async () => {
    const tree = await card(vi.fn().mockRejectedValue(fail(500)))
    await openAndPickCity(tree)
    await click(tree, 'Salvar perfil')
    expect(summary()).toEqual([['error', 'Falhou no servidor.']])
    expect(textOf(tree)).not.toContain('Falhou no servidor.')
    expect(button(tree, 'Salvar perfil')).toBeTruthy()
  })

  it('422 com campos fica junto ao formulário', async () => {
    const tree = await card(vi.fn().mockRejectedValue(fail(422, 'Cidade inválida.', [{ field: 'city_id', message: 'Cidade inválida.' }])))
    await openAndPickCity(tree)
    await click(tree, 'Salvar perfil')
    expect(textOf(tree)).toContain('Cidade inválida.')
    expect(toasts()).toEqual([])
  })

  it('401 chama onExpired uma vez, sem toast', async () => {
    const onExpired = vi.fn()
    const tree = await card(vi.fn().mockRejectedValue(fail(401, 'Sessão expirada.')), onExpired)
    await openAndPickCity(tree)
    await click(tree, 'Salvar perfil')
    expect(onExpired).toHaveBeenCalledOnce()
    expect(toasts()).toEqual([])
  })

  it('sem conexão aciona o aviso de conexão, sem mensagem local', async () => {
    const attempted = vi.spyOn(connection, 'attempted')
    const tree = await card(vi.fn().mockRejectedValue(fail(503, 'Servidor fora do ar.')))
    await openAndPickCity(tree)
    await click(tree, 'Salvar perfil')
    expect(attempted).toHaveBeenCalledOnce()
    expect(textOf(tree)).not.toContain('Servidor fora do ar.')
    expect(toasts()).toEqual([])
  })
})

describe('AccountActions: bloquear', () => {
  async function confirmBlock(onBlocked = vi.fn(), onExpired = vi.fn()) {
    const tree = await mount(React.createElement(AccountActions, { person, token: 't', onClose: vi.fn(), onBlocked, onExpired }))
    await press(tree, 'Bloquear')
    await click(tree, 'Confirmar bloqueio')
    return { tree, onBlocked, onExpired }
  }

  it('falha comum vira toast de erro e a confirmação continua aberta', async () => {
    vi.mocked(request).mockRejectedValue(fail(500, 'Não foi possível bloquear agora.'))
    const { tree, onBlocked } = await confirmBlock()
    expect(summary()).toEqual([['error', 'Não foi possível bloquear agora.']])
    expect(textOf(tree)).toContain('Bloquear @ana.lima?')
    expect(textOf(tree)).not.toContain('Não foi possível bloquear agora.')
    expect(onBlocked).not.toHaveBeenCalled()
    expect(button(tree, 'Confirmar bloqueio')!.props.disabled).toBe(false)
  })

  it('401 chama onExpired, sem toast', async () => {
    vi.mocked(request).mockRejectedValue(fail(401, 'Sessão expirada.'))
    const { onExpired } = await confirmBlock()
    expect(onExpired).toHaveBeenCalledOnce()
    expect(toasts()).toEqual([])
  })

  it('sucesso chama onBlocked', async () => {
    vi.mocked(request).mockResolvedValue(undefined as never)
    const { onBlocked } = await confirmBlock()
    expect(onBlocked).toHaveBeenCalledOnce()
    expect(toasts()).toEqual([])
  })
})

describe('UsernameForm: salvar', () => {
  const me = { id: 1, name: 'Eu', username: 'eu.atleta' } as User
  async function fill(onSaved = vi.fn(), onExpired = vi.fn()) {
    const tree = await mount(React.createElement(UsernameForm, { current: me.username, onSaved, onExpired }))
    vi.mocked(request).mockResolvedValueOnce({ available: true, reason: null, suggestions: [] } as never)
    vi.useFakeTimers()
    await type(tree, 'Nome de usuário', 'novo.nome')
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    vi.useRealTimers()
    return { tree, onSaved, onExpired }
  }
  const save = (tree: ReactTestRenderer) => click(tree, 'Salvar nome de usuário')

  it('409 de nome em uso fica junto ao campo, sem toast', async () => {
    const { tree } = await fill()
    vi.mocked(request).mockRejectedValueOnce(fail(409, 'Este nome de usuário já está em uso.'))
    await save(tree)
    expect(textOf(tree)).toContain('Este nome de usuário já está em uso.')
    expect(toasts()).toEqual([])
  })

  it('422 de nome inválido fica junto ao campo, sem toast', async () => {
    const { tree } = await fill()
    vi.mocked(request).mockRejectedValueOnce(fail(422, 'Nome de usuário inválido.'))
    await save(tree)
    expect(textOf(tree)).toContain('Nome de usuário inválido.')
    expect(toasts()).toEqual([])
  })

  it('falha comum vira toast de erro', async () => {
    const { tree } = await fill()
    vi.mocked(request).mockRejectedValueOnce(fail(500, 'Erro interno.'))
    await save(tree)
    expect(summary()).toEqual([['error', 'Erro interno.']])
    expect(textOf(tree)).not.toContain('Erro interno.')
  })

  it('401 chama onExpired, sem toast', async () => {
    const { tree, onExpired } = await fill()
    vi.mocked(request).mockRejectedValueOnce(fail(401, 'Sessão expirada.'))
    await save(tree)
    expect(onExpired).toHaveBeenCalledOnce()
    expect(toasts()).toEqual([])
  })

  it('sucesso devolve o usuário a quem chamou (o toast de confirmação é do chamador)', async () => {
    const { tree, onSaved } = await fill()
    vi.mocked(request).mockResolvedValueOnce({ ...me, username: 'novo.nome' } as never)
    await save(tree)
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ username: 'novo.nome' }))
    expect(toasts()).toEqual([])
  })
})

import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { Entry } from '../src/navigation/routes'
import JoinScreen from '../src/screens/JoinScreen'
import { byLabel, enableAct, press, textOf } from './support/native'
import { toastText } from './support/toast'
import { answer, fakeNavigation, joinRequest, me, preview, team, TOKEN } from './support/teams'
import type { FakeNavigation, Handler } from './support/teams'
import { playContext } from './support/play'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
const link = 'tok-A_1'
const target = team(10, { name: 'Ferrugem FC', member_count: 8 })

let navigation: FakeNavigation
const onExpired = vi.fn()
function serve(extra: Handler = () => undefined, state: Parameters<typeof preview>[1] = 'disponivel') {
  vi.mocked(request).mockImplementation(answer(async (path, method, body) => {
    const custom = await extra(path, method, body)
    if (custom !== undefined) return custom
    if (path === `/join/${link}` && !method) return preview(target, state)
    if (path === `/join/${link}` && method === 'POST') return joinRequest(77, 10, 'Maria Souza')
    return undefined
  }))
}
const calls = () => vi.mocked(request).mock.calls
async function mount(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(h(JoinScreen, { user: me, navigation, onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), onExpired, params: { token: link }, title: 'Entrar no time' })) })
  return tree
}
const replaced = () => {
  const [entry, same] = navigation.replace.mock.calls.at(-1) as [Entry, (below: Entry) => boolean]
  return { entry, replacesTeams: same({ screen: 'teams' } as Entry) }
}

beforeEach(() => {
  enableAct()
  navigation = fakeNavigation()
  onExpired.mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue(TOKEN)
  vi.mocked(request).mockReset()
})

describe('Entrar no time pelo link ou QR', () => {
  it('mostra a carteirinha do link, pede para entrar e depois mostra "Pedido enviado"', async () => {
    serve()
    const tree = await mount()
    expect(calls()[0]).toEqual([`/join/${link}`])
    expect(textOf(tree)).toContain('Convite por link')
    expect(textOf(tree)).toContain('Entrar no time')
    await press(tree, 'Fechar')
    expect(navigation.back).toHaveBeenCalledOnce()
    expect(textOf(tree)).toContain('Ferrugem FC')
    expect(textOf(tree)).toContain('Link do time')
    expect(textOf(tree)).toContain('Brasília · 8 atletas')
    expect(textOf(tree)).toContain('Um representante do Ferrugem FC aprova seu pedido')
    await press(tree, 'Pedir para entrar')
    expect(calls()).toContainEqual([`/join/${link}`, 'POST', {}])
    expect(textOf(tree)).toContain('Pedido enviado · aguardando um representante')
    expect(byLabel(tree, 'Pedir para entrar')).toHaveLength(0)
    expect(navigation.replace).not.toHaveBeenCalled()
  })

  it('Cancelar pedido desfaz o pedido e volta a oferecer Pedir para entrar', async () => {
    vi.mocked(request).mockImplementation(answer(async (path, method) => {
      if (path === `/join/${link}` && !method) return preview(target, 'pedido_pendente', { request_id: 77 })
      if (path === '/team-join-requests/77' && method === 'DELETE') return null
      return undefined
    }))
    const tree = await mount()
    expect(textOf(tree)).toContain('Pedido enviado · aguardando um representante')
    await press(tree, 'Cancelar pedido')
    expect(calls()).toContainEqual(['/team-join-requests/77', 'DELETE'])
    expect(byLabel(tree, 'Pedir para entrar')).toHaveLength(1)
    expect(textOf(tree)).not.toContain('Cancelar pedido')
  })

  it('link trocado ou de time encerrado diz "Este link não vale mais"', async () => {
    serve(path => { if (path === `/join/${link}`) throw new ApiError('Este link não vale mais.', 404); return undefined })
    const tree = await mount()
    expect(textOf(tree)).toContain('Link sem validade')
    expect(textOf(tree)).toContain('Este link não vale mais')
    expect(textOf(tree)).toContain('Peça o link novo a um representante do time.')
    expect(byLabel(tree, 'Pedir para entrar')).toHaveLength(0)
  })

  it('quem já é membro vai direto para Meus times, com o time no carrossel', async () => {
    serve(() => undefined, 'membro')
    const tree = await mount()
    expect(navigation.replace).toHaveBeenCalledOnce()
    expect(replaced()).toMatchObject({ entry: { screen: 'teams', params: { teamId: 10, invites: false } }, replacesTeams: true })
    expect(textOf(tree)).toContain('Você já está no elenco do Ferrugem FC. Abrindo Meus times…')
    expect(byLabel(tree, 'Pedir para entrar')).toHaveLength(0)
  })

  it('quem tem convite do time segue para a folha de convites em Meus times', async () => {
    serve(() => undefined, 'convite_pendente')
    const tree = await mount()
    expect(navigation.replace).not.toHaveBeenCalled()
    expect(textOf(tree)).toContain('Você já tem um convite do Ferrugem FC. Responda em Meus times.')
    await press(tree, 'Ver o convite em Meus times')
    expect(replaced()).toMatchObject({ entry: { screen: 'teams', params: { teamId: 10, invites: true } }, replacesTeams: true })
  })

  it('erro de rede oferece tentar de novo; 401 expira a sessão (o App guarda o link)', async () => {
    serve(path => { if (path === `/join/${link}`) throw new ApiError('Sem conexão.', 0); return undefined })
    const tree = await mount()
    expect(textOf(tree)).toContain('Sem conexão.')
    serve()
    await press(tree, 'Tentar novamente')
    expect(textOf(tree)).toContain('Ferrugem FC')
    await act(async () => { tree.unmount() })
    serve(path => { if (path === `/join/${link}`) throw new ApiError('Sessão expirada.', 401); return undefined })
    await mount()
    expect(onExpired).toHaveBeenCalled()
  })

  it('409 ao pedir confere o estado do link de novo e mostra o motivo', async () => {
    let reads = 0
    serve((path, method) => {
      if (path === `/join/${link}` && !method) { reads += 1; return preview(target, reads > 1 ? 'convite_pendente' : 'disponivel') }
      if (path === `/join/${link}` && method === 'POST') throw new ApiError('Você já tem um convite deste time. Responda em Meus times.', 409)
      return undefined
    })
    const tree = await mount()
    await press(tree, 'Pedir para entrar')
    expect(reads).toBe(2)
    expect(toastText()).toContain('Você já tem um convite deste time. Responda em Meus times.')
    expect(byLabel(tree, 'Ver o convite em Meus times')).toHaveLength(1)
  })

  it('o token do link vai codificado no caminho', async () => {
    vi.mocked(request).mockImplementation(answer(async () => preview(target, 'disponivel')))
    await act(async () => { create(h(JoinScreen, { user: me, navigation, onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), onExpired, params: { token: 'a b/c' }, title: 'Entrar no time' })) })
    expect(calls()[0]).toEqual(['/join/a%20b%2Fc'])
  })
})

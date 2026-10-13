import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request as apiRequest } from '../src/api/client'
import FollowRequestsScreen from '../src/screens/FollowRequestsScreen'
import { enableAct } from './support/native'
import { allText, byId, callsTo, me, navigationMock, page, pressButton, render, serve } from './support/events'
import { notificationSummaryState, playContext } from './support/play'
import { summaryOf } from './support/notifications'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn().mockResolvedValue('test-token'), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
const asker = (id: number, name: string) => ({ user: { id, name, username: name.toLowerCase().replace(/\s+/g, '.'), avatar_url: null, cover_url: null, social_public: false, post_count: 0, follower_count: 0, following_count: 0, follows_you: false, follow_state: 'none' as const }, state: 'pendente' })
const request = (id: number, approve: boolean) => `PUT /me/follow-requests/${id}?approve=${approve}`

async function mountRequests(onExpired = vi.fn()) {
  const notificationSummary = notificationSummaryState(summaryOf({ follow_requests_count: 2 }))
  const tree = await render(h(FollowRequestsScreen, { user: me, navigation: navigationMock(), onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), notificationSummary, onExpired, params: undefined, title: 'Pedidos para seguir' }))
  return { tree, notificationSummary, onExpired }
}

beforeEach(() => { enableAct(); vi.mocked(apiRequest).mockReset() })

describe('Pedidos para seguir (subtela das Notificações)', () => {
  it('lista, aprova e recusa pedidos, relendo o resumo depois de cada ação', async () => {
    serve({ '/me/follow-requests': page([asker(10, 'Ana Prado'), asker(11, 'Beto Dias')]), [request(10, true)]: undefined, [request(11, false)]: undefined })
    const { tree, notificationSummary } = await mountRequests()
    expect(byId(tree, 'follow-requests-screen')).toHaveLength(1)
    expect(allText(tree)).toContain('@ana.prado')
    expect(allText(tree)).toContain('2')
    await pressButton(tree, 'Aprovar solicitação de Ana Prado')
    expect(callsTo('PUT', '/me/follow-requests/10?approve=true')).toHaveLength(1)
    expect(allText(tree)).not.toContain('@ana.prado')
    expect(allText(tree)).toContain('Solicitação de Ana Prado aprovada.')
    expect(notificationSummary.reload).toHaveBeenCalledTimes(1)
    await pressButton(tree, 'Recusar solicitação de Beto Dias')
    expect(callsTo('PUT', '/me/follow-requests/11?approve=false')).toHaveLength(1)
    expect(allText(tree)).toContain('Solicitação de Beto Dias recusada.')
    expect(notificationSummary.reload).toHaveBeenCalledTimes(2)
    expect(byId(tree, 'follow-requests-empty')).toHaveLength(1)
  })

  it('"Aprovar todas" esvazia a fila em lotes e relê o resumo', async () => {
    let queue = [asker(10, 'Ana Prado'), asker(11, 'Beto Dias')]
    serve({
      '/me/follow-requests': () => page(queue),
      [request(10, true)]: () => { queue = queue.filter(entry => entry.user.id !== 10) },
      [request(11, true)]: () => { queue = queue.filter(entry => entry.user.id !== 11) },
    })
    const { tree, notificationSummary } = await mountRequests()
    await pressButton(tree, 'Aprovar todas as solicitações')
    expect(callsTo('PUT', '/me/follow-requests/10?approve=true')).toHaveLength(1)
    expect(callsTo('PUT', '/me/follow-requests/11?approve=true')).toHaveLength(1)
    expect(byId(tree, 'follow-requests-empty')).toHaveLength(1)
    expect(notificationSummary.reload).toHaveBeenCalled()
  })

  it('"Aprovar todas" para quando a fila não anda (os mesmos pedidos de novo) e avisa, sem rodar sem fim', async () => {
    const queue = [asker(10, 'Ana Prado'), asker(11, 'Beto Dias')]
    serve({ '/me/follow-requests': () => page(queue), [request(10, true)]: undefined, [request(11, true)]: undefined })
    const { tree } = await mountRequests()
    await pressButton(tree, 'Aprovar todas as solicitações')
    expect(callsTo('PUT', '/me/follow-requests/10?approve=true')).toHaveLength(1)
    expect(allText(tree)).toContain('Nem todas as solicitações foram aprovadas.')
    expect(allText(tree)).not.toContain('Solicitações aprovadas.')
  })

  it('erros: a ação mostra a mensagem e mantém a lista; 401 expira; a fila fora do ar tem "Tentar novamente"; vazio honesto', async () => {
    serve({ '/me/follow-requests': page([asker(10, 'Ana Prado')]), [request(10, true)]: new ApiError('Pedido não encontrado.', 404), [request(10, false)]: new ApiError('Sessão expirada', 401) })
    const { tree, onExpired, notificationSummary } = await mountRequests()
    await pressButton(tree, 'Aprovar solicitação de Ana Prado')
    expect(allText(tree)).toContain('Pedido não encontrado.')
    expect(allText(tree)).toContain('@ana.prado')
    expect(notificationSummary.reload).not.toHaveBeenCalled()
    await pressButton(tree, 'Recusar solicitação de Ana Prado')
    expect(onExpired).toHaveBeenCalled()

    let fail = true
    serve({ '/me/follow-requests': () => (fail ? new ApiError('Fila fora do ar', 500) : page([])) })
    const offline = await mountRequests()
    expect(allText(offline.tree)).toContain('Fila fora do ar')
    fail = false
    await pressButton(offline.tree, 'Tentar novamente')
    expect(allText(offline.tree)).toContain('Nenhum pedido para seguir por enquanto.')
  })

  it('"Aprovar todas" com falha mostra a mensagem da API; "Carregar mais" traz a próxima página', async () => {
    serve({ '/me/follow-requests': page([asker(10, 'Ana Prado')], 'c2'), '/me/follow-requests?cursor=c2': page([asker(11, 'Beto Dias')]), [request(10, true)]: new ApiError('Sem rede', 500) })
    const { tree } = await mountRequests()
    expect(allText(tree)).toContain('1+')
    await pressButton(tree, 'Carregar mais solicitações')
    expect(allText(tree)).toContain('@beto.dias')
    await pressButton(tree, 'Aprovar todas as solicitações')
    expect(allText(tree)).toContain('Sem rede')
  })
})

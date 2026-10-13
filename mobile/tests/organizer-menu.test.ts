import React from 'react'
import { act } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import OrganizerMenu from '../src/components/organizer/OrganizerMenu'
import { byLabel, enableAct, press, textOf } from './support/native'
import { toastText, toasts } from './support/toast'
import { approved, calls, card, mount, navigationMock, organizerRequest, page, routeRequest, status } from './support/organizer'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
const OPEN = '/organizer/events?scope=abertos'
const COUNTS = { organizer_requests: 3, reports: 0, paid_events: 1, revoked_events: 120, refund_disputes: 2, court_suggestions: 4, walkover_disputes: 1 }

let navigation = navigationMock()
const onLeave = vi.fn()
const onExpired = vi.fn()
const menu = (isAdmin = false) => mount(h(OrganizerMenu, { isAdmin, navigation: navigation as never, onLeave, onExpired }))
const pressable = (tree: ReactTestRenderer, prefix: string) => tree.root.findAllByType('Pressable' as never).find(entry => String(entry.props.accessibilityLabel ?? '').startsWith(prefix))

beforeEach(() => {
  enableAct()
  navigation = navigationMock()
  onLeave.mockClear()
  onExpired.mockClear()
})

describe('Menu do Perfil: cartão "Organizar no Arena" (P3)', () => {
  it('sem pedido: etapas, texto e "Quero organizar" leva ao pedido, fechando o Menu antes', async () => {
    routeRequest({ '/me/organizer-request': status(), [OPEN]: page([]) })
    const tree = await menu()
    expect(textOf(tree)).toContain('ORGANIZADOR')
    expect(textOf(tree)).toContain('Organizar no Arena')
    expect(textOf(tree)).toContain('Peça a permissão de organizador.')
    expect(byLabel(tree, 'Pedir: etapa atual')).toHaveLength(1)
    expect(byLabel(tree, 'Análise: a seguir')).toHaveLength(1)
    expect(byLabel(tree, 'Organizar: a seguir')).toHaveLength(1)
    expect(textOf(tree)).not.toContain('Meus eventos')
    expect(textOf(tree)).not.toContain('ADMINISTRAÇÃO')
    await press(tree, 'Quero organizar')
    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(navigation.go).toHaveBeenCalledWith('organizer-request')
  })

  it('em análise: mostra a data do envio e cancela o pedido depois de confirmar', async () => {
    routeRequest({
      '/me/organizer-request': status({ state: 'em_analise', request: organizerRequest() }),
      'DELETE /me/organizer-request': undefined,
    })
    const tree = await menu()
    expect(textOf(tree)).toContain('Pedido em análise')
    expect(textOf(tree)).toMatch(/Enviado em .*2026\. Você recebe a resposta nas notificações\./)
    expect(byLabel(tree, 'Análise: etapa atual')).toHaveLength(1)
    await press(tree, 'Cancelar pedido')
    expect(textOf(tree)).toContain('Cancelar o pedido em análise?')
    expect(calls('DELETE', '/me/organizer-request')).toHaveLength(0)
    await press(tree, 'Manter pedido')
    expect(textOf(tree)).not.toContain('Cancelar o pedido em análise?')
    await press(tree, 'Cancelar pedido')
    await press(tree, 'Cancelar pedido')
    expect(calls('DELETE', '/me/organizer-request')).toHaveLength(1)
    expect(textOf(tree)).toContain('Pedido cancelado. Você pode enviar um novo quando quiser.')
    expect(textOf(tree)).toContain('Quero organizar')
    expect(byLabel(tree, 'Pedir: etapa atual')).toHaveLength(1)
  })

  it('pedido já decidido em outro lugar: o cartão confere o estado atual em vez de manter o antigo', async () => {
    let current = status({ state: 'em_analise', request: organizerRequest() })
    routeRequest({
      '/me/organizer-request': () => current,
      'DELETE /me/organizer-request': () => {
        current = status({ state: 'recusado', request: organizerRequest({ state: 'recusado', reason_code: 'pouca_informacao', reason_detail: 'Falta o link' }) })
        throw new ApiError('Nenhum pedido em análise.', 404)
      },
    })
    const tree = await menu()
    await press(tree, 'Cancelar pedido')
    await press(tree, 'Cancelar pedido')
    expect(textOf(tree)).toContain('Pedido recusado')
    // 404 de algo que outra pessoa já decidiu: aviso, e o cartão relê o estado atual.
    expect(toastText()).toContain('Nenhum pedido em análise.')
    expect(toasts().map(item => item.tone)).toEqual(['warning'])
  })

  it('erro ao cancelar mostra a mensagem e mantém o pedido; 401 expira a sessão', async () => {
    routeRequest({
      '/me/organizer-request': status({ state: 'em_analise', request: organizerRequest() }),
      'DELETE /me/organizer-request': () => { throw new ApiError('Fora do ar', 500) },
    })
    const tree = await menu()
    await press(tree, 'Cancelar pedido')
    await press(tree, 'Cancelar pedido')
    expect(toastText()).toContain('Fora do ar')
    expect(textOf(tree)).toContain('Cancelar o pedido em análise?')
    expect(onExpired).not.toHaveBeenCalled()
    routeRequest({
      '/me/organizer-request': status({ state: 'em_analise', request: organizerRequest() }),
      'DELETE /me/organizer-request': () => { throw new ApiError('Sessão expirada', 401) },
    })
    const expired = await menu()
    await press(expired, 'Cancelar pedido')
    await press(expired, 'Cancelar pedido')
    expect(onExpired).toHaveBeenCalledTimes(1)
  })

  it('recusado: motivo com o rótulo e o detalhe, e "Enviar novo pedido"', async () => {
    routeRequest({ '/me/organizer-request': status({ state: 'recusado', request: organizerRequest({ state: 'recusado', reason_code: 'pouca_informacao', reason_detail: 'Falta o link' }) }) })
    const tree = await menu()
    expect(textOf(tree)).toContain('Pedido recusado')
    expect(textOf(tree)).toContain('Motivo: Pouca informação · Falta o link. Você pode enviar um novo pedido.')
    expect(byLabel(tree, 'Análise: não concluída')).toHaveLength(1)
    await press(tree, 'Enviar novo pedido')
    expect(navigation.go).toHaveBeenCalledWith('organizer-request')
  })

  it('revogado: motivo da revogação e novo pedido', async () => {
    routeRequest({ '/me/organizer-request': status({ state: 'revogado', revocation: { revoked_at: '2026-10-08T12:00:00.000Z', reason: 'Conduta inadequada' } }) })
    const tree = await menu()
    expect(textOf(tree)).toContain('Permissão revogada')
    expect(textOf(tree)).toContain('Motivo: Conduta inadequada. Você pode enviar um novo pedido.')
    expect(byLabel(tree, 'Organizar: não concluída')).toHaveLength(1)
    await press(tree, 'Enviar novo pedido')
    expect(navigation.go).toHaveBeenCalledWith('organizer-request')
    routeRequest({ '/me/organizer-request': status({ state: 'revogado', revocation: { revoked_at: '2026-10-08T12:00:00.000Z', reason: '' } }) })
    expect(textOf(await menu())).toContain('Motivo: não informado.')
  })

  it('erro ao ler o pedido mostra a mensagem e tenta de novo', async () => {
    routeRequest({ '/me/organizer-request': () => { throw new ApiError('Sem conexão', 0) } })
    const tree = await menu()
    expect(textOf(tree)).toContain('Sem conexão')
    routeRequest({ '/me/organizer-request': status() })
    await press(tree, 'Tentar novamente')
    expect(textOf(tree)).toContain('Quero organizar')
  })
})

describe('Menu do Perfil: seção Organizador · Meus eventos', () => {
  const events = [
    card({ id: 1, name: 'Copa Sudoeste', pending: { receipts: 2, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 2 } }),
    card({ id: 2, name: 'Liga Noturna', pending: { receipts: 0, refunds_to_send: 1, refunds_awaiting: 0, refund_disputes: 0, total: 1 } }),
    card({ id: 3, name: 'Torneio de Tênis', sport: 'tenis', format: null }),
  ]

  it('aprovado: sem o cartão, com a prévia de dois cartazes e a linha com o resumo e as pendências', async () => {
    routeRequest({ '/me/organizer-request': approved(), [OPEN]: page(events) })
    const tree = await menu()
    expect(textOf(tree)).not.toContain('Quero organizar')
    expect(byLabel(tree, 'Próximos eventos')).toHaveLength(1)
    expect(pressable(tree, 'Copa Sudoeste')).toBeTruthy()
    expect(pressable(tree, 'Liga Noturna')).toBeTruthy()
    expect(pressable(tree, 'Torneio de Tênis')).toBeUndefined()
    expect(pressable(tree, 'Meus eventos')!.props.accessibilityLabel).toBe('Meus eventos, Liga Candanga · 3 eventos em aberto · 3 pendências')
    expect(byLabel(tree, 'Criar evento')).toHaveLength(0)
    await press(tree, 'Meus eventos, Liga Candanga · 3 eventos em aberto · 3 pendências')
    expect(onLeave).toHaveBeenCalled()
    expect(navigation.go).toHaveBeenLastCalledWith('organizer-events')
    await act(async () => { pressable(tree, 'Liga Noturna')!.props.onPress() })
    expect(navigation.go).toHaveBeenLastCalledWith('event-manage', { eventId: 2 })
  })

  it('aprovado sem eventos: resumo vazio e atalho para criar o primeiro', async () => {
    routeRequest({ '/me/organizer-request': approved(), [OPEN]: page([]) })
    const tree = await menu()
    expect(byLabel(tree, 'Próximos eventos')).toHaveLength(0)
    expect(pressable(tree, 'Meus eventos')!.props.accessibilityLabel).toBe('Meus eventos, Liga Candanga · Nenhum evento em aberto.')
    await press(tree, 'Criar evento')
    expect(navigation.go).toHaveBeenCalledWith('event-wizard')
  })

  it('um evento só e sem pendências usa o singular', async () => {
    routeRequest({ '/me/organizer-request': approved(), [OPEN]: page([card({ id: 9 })]) })
    const tree = await menu()
    expect(pressable(tree, 'Meus eventos')!.props.accessibilityLabel).toBe('Meus eventos, Liga Candanga · 1 evento em aberto')
    routeRequest({ '/me/organizer-request': approved(), [OPEN]: page([card({ id: 9, pending: { receipts: 1, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 1 } })]) })
    expect(pressable(await menu(), 'Meus eventos')!.props.accessibilityLabel).toBe('Meus eventos, Liga Candanga · 1 evento em aberto · 1 pendência')
  })

  it('revogado com eventos mantidos: o cartão continua e os eventos aparecem, sem "Criar evento"', async () => {
    routeRequest({ '/me/organizer-request': status({ state: 'revogado', revocation: { revoked_at: '2026-10-08T12:00:00.000Z', reason: 'Conduta' } }), [OPEN]: page([events[0]]) })
    const tree = await menu()
    expect(textOf(tree)).toContain('Permissão revogada')
    expect(pressable(tree, 'Copa Sudoeste')).toBeTruthy()
    expect(byLabel(tree, 'Criar evento')).toHaveLength(0)
  })

  it('falha ao ler os eventos só aparece para quem é organizador, com a opção de tentar de novo', async () => {
    routeRequest({ '/me/organizer-request': approved(), [OPEN]: () => { throw new ApiError('Eventos indisponíveis', 500) } })
    const tree = await menu()
    expect(textOf(tree)).toContain('Eventos indisponíveis')
    routeRequest({ '/me/organizer-request': approved(), [OPEN]: page([events[0]]) })
    await press(tree, 'Tentar novamente')
    expect(textOf(tree)).not.toContain('Eventos indisponíveis')
    expect(pressable(tree, 'Copa Sudoeste')).toBeTruthy()
    routeRequest({ '/me/organizer-request': status(), [OPEN]: () => { throw new ApiError('Eventos indisponíveis', 500) } })
    expect(textOf(await menu())).not.toContain('Eventos indisponíveis')
  })
})

describe('Menu do Perfil: administração', () => {
  it('só para administradores: filas com contador de queue-counts, cada uma abrindo a própria tela', async () => {
    routeRequest({ '/me/organizer-request': status(), [OPEN]: page([]), '/admin/queue-counts': COUNTS })
    const plain = await menu(false)
    expect(textOf(plain)).not.toContain('ADMINISTRAÇÃO')
    expect(calls('GET', '/admin/queue-counts')).toHaveLength(0)

    const tree = await menu(true)
    expect(textOf(tree)).toContain('ADMINISTRAÇÃO')
    expect(byLabel(tree, 'Pedidos de organizador, 3 pendentes')).toHaveLength(1)
    expect(byLabel(tree, 'Eventos pagos, 1 pendente')).toHaveLength(1)
    expect(byLabel(tree, 'Eventos de organizador revogado, 120 pendentes')).toHaveLength(1)
    expect(textOf(tree)).toContain('99+')
    expect(byLabel(tree, 'Devoluções contestadas, 2 pendentes')).toHaveLength(1)
    // Etapa 3: as filas de quadras e de W.O., entre as devoluções e as denúncias, com os contadores de `queue-counts`.
    expect(byLabel(tree, 'Sugestões de quadra, 4 pendentes')).toHaveLength(1)
    expect(byLabel(tree, 'W.O. contestados, 1 pendente')).toHaveLength(1)
    expect(byLabel(tree, 'Denúncias')).toHaveLength(1)
    const rows: [string, string][] = [
      ['Pedidos de organizador, 3 pendentes', 'admin-organizer-requests'], ['Eventos pagos, 1 pendente', 'admin-paid-events'],
      ['Eventos de organizador revogado, 120 pendentes', 'admin-revoked-events'], ['Devoluções contestadas, 2 pendentes', 'admin-refund-disputes'],
      ['Sugestões de quadra, 4 pendentes', 'admin-court-suggestions'], ['W.O. contestados, 1 pendente', 'admin-walkover-disputes'], ['Denúncias', 'moderation'],
    ]
    for (const [label, screen] of rows) {
      await press(tree, label)
      expect(navigation.go).toHaveBeenLastCalledWith(screen)
    }
    expect(onLeave).toHaveBeenCalledTimes(rows.length)
  })

  it('sem os contadores (falha ou carregando) as linhas continuam, sem número', async () => {
    routeRequest({ '/me/organizer-request': status(), [OPEN]: page([]), '/admin/queue-counts': () => { throw new ApiError('Fila indisponível', 500) } })
    const tree = await menu(true)
    expect(byLabel(tree, 'Pedidos de organizador')).toHaveLength(1)
    expect(byLabel(tree, 'Sugestões de quadra')).toHaveLength(1)
    expect(byLabel(tree, 'W.O. contestados')).toHaveLength(1)
    expect(byLabel(tree, 'Denúncias')).toHaveLength(1)
    expect(vi.mocked(request)).toHaveBeenCalledWith('/admin/queue-counts')
  })
})

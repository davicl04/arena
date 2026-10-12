import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request as apiRequest } from '../src/api/client'
import type { Person } from '../src/api/client'
import type { ArenaNotification } from '../src/api/notifications'
import { notificationView } from '../src/data/notifications'
import NotificationsScreen, { openTarget } from '../src/screens/NotificationsScreen'
import { formatDeadline } from '../src/utils/format'
import { enableAct } from './support/native'
import { allText, byId, callsTo, findButton, labelled, me, navigationMock, page, pressButton, render, serve } from './support/events'
import { playContext } from './support/play'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn().mockResolvedValue('test-token'), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
const person = (name: string): Person => ({ id: 2, name, username: name.toLowerCase().replace(/\s+/g, '.'), avatar_url: null })
let nextId = 1
const note = (type: string, payload: Record<string, unknown> = {}, actor: string | null = null, extra: Partial<ArenaNotification> = {}): ArenaNotification => ({
  id: nextId++, type, payload, actor: actor ? person(actor) : null, created_at: new Date(Date.now() - 5 * 60_000).toISOString(), read_at: null, ...extra,
})
const view = (type: string, payload: Record<string, unknown> = {}, actor: string | null = null, viewer = {}) => notificationView(note(type, payload, actor), viewer)

const event = { event_id: 5, event_name: 'Copa Sudoeste' }

describe('notificationView: texto e destino de cada tipo', () => {
  it('times: convites, pedidos e decisões levam a Meus times', () => {
    const team = { team_id: 3, team_name: 'Ferrugem FC' }
    expect(view('convite_time', team, 'Carlos Lima')).toEqual({ text: 'Carlos Lima convidou você para o Ferrugem FC', kind: 'team', teamName: 'Ferrugem FC', target: { screen: 'teams', teamId: 3, invites: true } })
    expect(view('convite_time').text).toBe('Um representante convidou você para o time')
    expect(view('convite_aceito', team, 'Ana Prado')).toMatchObject({ text: 'Ana Prado aceitou o convite e entrou no Ferrugem FC', target: { screen: 'teams', teamId: 3 } })
    expect(view('convite_aceito').target).toEqual({ screen: 'teams' })
    expect(view('pedido_entrada', team, 'Ana Prado')).toMatchObject({ text: 'Ana Prado pediu para entrar no Ferrugem FC', target: { screen: 'teams', teamId: 3, requests: true } })
    expect(view('pedido_entrada').text).toBe('Um atleta pediu para entrar no time')
    expect(view('pedido_entrada_decidido', { ...team, decision: 'aprovado' })).toMatchObject({ text: 'Seu pedido para entrar no Ferrugem FC foi aprovado', target: { screen: 'teams', teamId: 3 } })
    expect(view('pedido_entrada_decidido', { ...team, decision: 'recusado' })).toMatchObject({ text: 'Seu pedido para entrar no Ferrugem FC foi recusado', target: null })
    expect(view('removido_do_time', team)).toMatchObject({ text: 'Você foi removido do Ferrugem FC', target: null })
    expect(view('time_encerrado', team)).toMatchObject({ text: 'O Ferrugem FC foi encerrado', target: null })
  })

  it('organizador: a decisão e a revogação levam ao cartão do organizador', () => {
    expect(view('pedido_organizador_decidido', { decision: 'aprovado' })).toEqual({ text: 'Seu pedido de organizador foi aprovado', kind: 'organizer', teamName: null, target: { screen: 'organizer-request' } })
    expect(view('pedido_organizador_decidido', { decision: 'recusado', reason_code: 'pouca_informacao', reason_detail: 'Conte mais.' }).text)
      .toBe('Seu pedido de organizador foi recusado: Pouca informação · Conte mais.')
    expect(view('pedido_organizador_decidido', { decision: 'recusado' }).text).toBe('Seu pedido de organizador foi recusado: Motivo não informado')
    expect(view('organizador_revogado', { reason: 'Evento sem resposta' })).toMatchObject({ text: 'Sua permissão de organizador foi revogada: Evento sem resposta', target: { screen: 'organizer-request' } })
    expect(view('organizador_revogado').text).toBe('Sua permissão de organizador foi revogada: motivo não informado')
  })

  it('atleta: inscrição, comprovante, reserva, cancelamento, avisos e devolução levam ao detalhe do evento', () => {
    const to = { screen: 'event', eventId: 5 }
    expect(view('time_inscrito', { ...event, team_name: 'Ferrugem FC' }, 'Carlos Lima')).toMatchObject({ text: 'Carlos Lima inscreveu o Ferrugem FC em Copa Sudoeste', kind: 'event', target: to })
    expect(view('time_inscrito', event).text).toBe('Um representante inscreveu o time em Copa Sudoeste')
    expect(view('comprovante_decidido', { ...event, decision: 'aprovado' })).toMatchObject({ text: 'Inscrição confirmada em Copa Sudoeste', target: to })
    const until = new Date(Date.now() + 86_400_000).toISOString()
    expect(view('comprovante_decidido', { ...event, decision: 'recusado', reason_code: 'valor_diferente', reason_detail: 'faltaram R$ 40.', reserved_until: until }).text)
      .toBe(`Comprovante recusado em Copa Sudoeste: Valor diferente: faltaram R$ 40. Envie outro até ${formatDeadline(until)}`)
    expect(view('comprovante_decidido', { ...event, decision: 'recusado', reason_code: 'outro', reason_detail: 'Imagem cortada' }).text).toBe('Comprovante recusado em Copa Sudoeste: Imagem cortada. Envie outro')
    expect(view('reserva_expirada', event)).toMatchObject({ text: 'Sua reserva em Copa Sudoeste expirou e a vaga foi liberada', target: to })
    expect(view('evento_cancelado', { ...event, reason: 'Chuva forte.', refund: true }).text).toBe('Copa Sudoeste foi cancelado: Chuva forte. O organizador vai devolver o valor por Pix')
    expect(view('evento_cancelado', { event_id: 5, reason: 'Sem quadra', refund: false }).text).toBe('Um evento foi cancelado: Sem quadra')
    expect(view('evento_cancelado', { event_id: 5 }).text).toBe('Um evento foi cancelado: motivo não informado')
    expect(view('aviso_evento', event)).toMatchObject({ text: 'Novo aviso em Copa Sudoeste', target: to })
    expect(view('devolucao_enviada', event, 'Liga Sul').text).toBe('Liga Sul enviou a devolução de Copa Sudoeste. Confirme o recebimento')
    expect(view('devolucao_enviada', event).text).toBe('O organizador enviou a devolução de Copa Sudoeste. Confirme o recebimento')
    expect(view('devolucao_decidida', { ...event, decision: 'devolvida' })).toMatchObject({ text: 'A administração considerou feita a devolução de Copa Sudoeste', target: to })
    expect(view('devolucao_decidida', { ...event, decision: 'pendente' }).text).toBe('A administração pediu outro comprovante da devolução de Copa Sudoeste')
    expect(view('devolucao_confirmada', { ...event, automatic: true })).toMatchObject({ text: 'Devolução de Copa Sudoeste considerada recebida após 7 dias', target: to })
  })

  it('organizador: comprovantes, decisões da administração e devoluções levam à gestão', () => {
    expect(view('comprovante_recebido', event, 'Maria Souza')).toMatchObject({ text: 'Novo comprovante em Copa Sudoeste', target: { screen: 'event-receipts', eventId: 5 } })
    expect(view('evento_decidido', { ...event, decision: 'aprovado' })).toMatchObject({ text: 'Copa Sudoeste foi aprovado e publicado', target: { screen: 'event-manage', eventId: 5 } })
    expect(view('evento_decidido', { ...event, decision: 'recusado', reason_code: 'pix_incompleto' }).text).toBe('Copa Sudoeste foi recusado: Dados do Pix incompletos')
    expect(view('evento_decidido', { ...event, decision: 'recusado', reason_code: 'preco_ou_datas', reason_detail: 'Revise o valor' }).text).toBe('Copa Sudoeste foi recusado: Preço ou datas inconsistentes: Revise o valor')
    expect(view('evento_decidido', { ...event, decision: 'recusado', reason_code: 'outro', reason_detail: 'Fora do padrão' }).text).toBe('Copa Sudoeste foi recusado: Fora do padrão')
    expect(view('evento_decidido', { event_id: 5, decision: 'recusado' }).text).toBe('Um evento foi recusado: motivo não informado')
    expect(view('evento_revogacao_decidida', { ...event, decision: 'seguir' })).toMatchObject({ text: 'A administração manteve Copa Sudoeste', target: { screen: 'event-manage', eventId: 5 } })
    expect(view('evento_revogacao_decidida', { ...event, decision: 'cancelado' }).text).toBe('A administração cancelou Copa Sudoeste')
    expect(view('devolucao_confirmada', { ...event, automatic: false }, 'Maria Souza')).toMatchObject({ text: 'Maria Souza confirmou a devolução de Copa Sudoeste', target: { screen: 'event-manage', eventId: 5 } })
    expect(view('devolucao_confirmada', event).text).toBe('O participante confirmou a devolução de Copa Sudoeste')
  })

  it('devolução contestada vai à gestão do organizador e à fila "Devoluções contestadas" da administração', () => {
    expect(view('devolucao_contestada', event, 'Maria Souza')).toMatchObject({ text: 'Maria Souza contestou a devolução de Copa Sudoeste', target: { screen: 'event-manage', eventId: 5 } })
    expect(view('devolucao_contestada', event, null, { isAdmin: true })).toMatchObject({ text: 'Um participante contestou a devolução de Copa Sudoeste', target: { screen: 'admin-refund-disputes' } })
  })

  it('administração: evento pago enviado para aprovação leva à fila "Eventos pagos"', () => {
    expect(view('evento_para_aprovar', event, 'Liga Sul', { isAdmin: true })).toEqual({ text: 'Liga Sul enviou Copa Sudoeste para aprovação', kind: 'event', teamName: null, target: { screen: 'admin-paid-events' } })
    expect(view('evento_para_aprovar', {}).text).toBe('Um organizador enviou um evento para aprovação')
  })

  it('sem identificador do evento não há destino; tipos ainda sem tela (Jogar) ganham texto genérico', () => {
    expect(view('aviso_evento', { event_name: 'Copa Sudoeste' }).target).toBeNull()
    expect(view('aviso_evento', { event_id: 0, event_name: 'Copa' }).target).toBeNull()
    expect(view('partida_proposta', { match_id: 1 })).toEqual({ text: 'Nova atividade na sua conta', kind: 'other', teamName: null, target: null })
    expect(notificationView({ ...note('aviso_evento', event), payload: null as never }).text).toBe('Novo aviso em um evento')
  })
})

describe('openTarget: abre a tela certa com os parâmetros do aviso', () => {
  it('cada destino vira uma chamada tipada de navegação, sem chaves vazias', () => {
    const navigation = navigationMock()
    openTarget(navigation, { screen: 'teams' })
    openTarget(navigation, { screen: 'teams', teamId: 3, invites: true })
    openTarget(navigation, { screen: 'teams', teamId: 3, requests: true })
    openTarget(navigation, { screen: 'organizer-request' })
    openTarget(navigation, { screen: 'event', eventId: 5 })
    openTarget(navigation, { screen: 'event-manage', eventId: 5 })
    openTarget(navigation, { screen: 'event-receipts', eventId: 5 })
    openTarget(navigation, { screen: 'admin-paid-events' })
    openTarget(navigation, { screen: 'admin-refund-disputes' })
    expect(vi.mocked(navigation.go).mock.calls).toEqual([
      ['teams', {}], ['teams', { teamId: 3, invites: true }], ['teams', { teamId: 3, requests: true }], ['organizer-request'],
      ['event', { eventId: 5 }], ['event-manage', { eventId: 5 }], ['event-receipts', { eventId: 5 }], ['admin-paid-events'], ['admin-refund-disputes'],
    ])
  })
})

function mountNotifications(navigation = navigationMock(), onExpired = vi.fn(), user = me) {
  return render(h(NotificationsScreen, { user, navigation, onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), onExpired, params: undefined, title: 'Notificações' }))
}
const unreadBadge = (count: number) => ({ unread_count: count })
const item = (tree: Awaited<ReturnType<typeof mountNotifications>>, startsWith: string) => tree.root.findAll(node => String(node.type) === 'Pressable' && String(node.props.accessibilityLabel).startsWith(startsWith))[0]
const request = (id: number, approve: boolean) => `PUT /me/follow-requests/${id}?approve=${approve}`

describe('Notificações: lista, leitura e navegação', () => {
  beforeEach(() => {
    enableAct()
    vi.mocked(apiRequest).mockReset()
    nextId = 1
  })

  it('mostra as atividades com texto, tempo e o ponto de não lida, e o contador de não lidas', async () => {
    serve({
      '/me/follow-requests': page([]), '/me/notifications/unread-count': unreadBadge(2),
      '/me/notifications': page([note('aviso_evento', event), note('convite_time', { team_id: 3, team_name: 'Ferrugem FC' }, 'Carlos Lima'), note('time_encerrado', { team_name: 'Velho FC' }, null, { read_at: '2026-10-10T10:00:00Z' })]),
    })
    const tree = await mountNotifications()
    expect(allText(tree)).toContain('Novo aviso em Copa Sudoeste')
    expect(allText(tree)).toContain('Carlos Lima convidou você para o Ferrugem FC')
    expect(allText(tree)).toContain('O Velho FC foi encerrado')
    expect(allText(tree)).toContain('há 5 min')
    expect(byId(tree, 'unread-dot')).toHaveLength(2)
    expect(labelled(tree, '2 não lidas')).toHaveLength(1)
    expect(findButton(tree, 'Marcar todas como lidas')).toBeTruthy()
    expect(item(tree, 'Novo aviso em Copa Sudoeste').props.accessibilityLabel).toBe('Novo aviso em Copa Sudoeste. há 5 min. Não lida')
    // A lida e sem destino não é um botão.
    expect(item(tree, 'O Velho FC foi encerrado')).toBeUndefined()
  })

  it('tocar numa não lida marca como lida e abre a tela do aviso', async () => {
    const first = note('comprovante_decidido', { ...event, decision: 'aprovado' })
    serve({
      '/me/follow-requests': page([]), '/me/notifications/unread-count': unreadBadge(1), '/me/notifications': page([first]),
      [`PUT /me/notifications/${first.id}/read`]: unreadBadge(0),
    })
    const navigation = navigationMock()
    const tree = await mountNotifications(navigation)
    await pressButton(tree, 'Inscrição confirmada em Copa Sudoeste. há 5 min. Não lida')
    expect(callsTo('PUT', `/me/notifications/${first.id}/read`)[0][2]).toEqual({})
    expect(navigation.go).toHaveBeenCalledWith('event', { eventId: 5 })
    expect(byId(tree, 'unread-dot')).toHaveLength(0)
    expect(findButton(tree, 'Marcar todas como lidas')).toBeUndefined()
    // Lida e com destino continua sendo um botão, que só navega.
    await pressButton(tree, 'Inscrição confirmada em Copa Sudoeste. há 5 min')
    expect(callsTo('PUT', `/me/notifications/${first.id}/read`)).toHaveLength(1)
    expect(navigation.go).toHaveBeenCalledTimes(2)
  })

  it('cada tipo abre a tela do seu papel (gestão, comprovantes, filas da administração, times e organizador)', async () => {
    const list = [
      note('comprovante_recebido', event), note('evento_decidido', { ...event, decision: 'aprovado' }), note('devolucao_contestada', event, 'Maria'),
      note('evento_para_aprovar', event, 'Liga Sul'), note('pedido_entrada', { team_id: 3, team_name: 'Ferrugem FC' }, 'Ana'), note('organizador_revogado', { reason: 'x' }),
    ]
    serve({
      '/me/follow-requests': page([]), '/me/notifications/unread-count': unreadBadge(6), '/me/notifications': page(list),
      ...Object.fromEntries(list.map(entry => [`PUT /me/notifications/${entry.id}/read`, unreadBadge(0)])),
    })
    const navigation = navigationMock()
    const tree = await mountNotifications(navigation, vi.fn(), { ...me, is_admin: true })
    for (const [start] of [['Novo comprovante'], ['Copa Sudoeste foi aprovado'], ['Maria contestou'], ['Liga Sul enviou'], ['Ana pediu'], ['Sua permissão']]) await pressButton(tree, item(tree, start).props.accessibilityLabel)
    expect(vi.mocked(navigation.go).mock.calls).toEqual([
      ['event-receipts', { eventId: 5 }], ['event-manage', { eventId: 5 }], ['admin-refund-disputes'], ['admin-paid-events'], ['teams', { teamId: 3, requests: true }], ['organizer-request'],
    ])
  })

  it('o tipo do Jogar (sem tela ainda) só marca como lida, com texto genérico', async () => {
    const future = note('partida_proposta', { match_id: 1 })
    serve({ '/me/follow-requests': page([]), '/me/notifications/unread-count': unreadBadge(1), '/me/notifications': page([future]), [`PUT /me/notifications/${future.id}/read`]: unreadBadge(0) })
    const navigation = navigationMock()
    const tree = await mountNotifications(navigation)
    expect(allText(tree)).toContain('Nova atividade na sua conta')
    await pressButton(tree, 'Nova atividade na sua conta. há 5 min. Não lida')
    expect(callsTo('PUT', `/me/notifications/${future.id}/read`)).toHaveLength(1)
    expect(navigation.go).not.toHaveBeenCalled()
    expect(item(tree, 'Nova atividade na sua conta')).toBeUndefined()
  })

  it('falha ao marcar como lida: com destino segue para a tela; sem destino mostra o erro', async () => {
    const withTarget = note('aviso_evento', event)
    const without = note('partida_proposta')
    serve({
      '/me/follow-requests': page([]), '/me/notifications/unread-count': unreadBadge(2), '/me/notifications': page([withTarget, without]),
      [`PUT /me/notifications/${withTarget.id}/read`]: new ApiError('Fora do ar', 500), [`PUT /me/notifications/${without.id}/read`]: new ApiError('Fora do ar', 500),
    })
    const navigation = navigationMock()
    const tree = await mountNotifications(navigation)
    await pressButton(tree, 'Novo aviso em Copa Sudoeste. há 5 min. Não lida')
    expect(navigation.go).toHaveBeenCalledWith('event', { eventId: 5 })
    expect(allText(tree)).not.toContain('Fora do ar')
    await pressButton(tree, 'Nova atividade na sua conta. há 5 min. Não lida')
    expect(allText(tree)).toContain('Fora do ar')
  })

  it('401 ao marcar como lida expira a sessão e não navega', async () => {
    const entry = note('aviso_evento', event)
    serve({ '/me/follow-requests': page([]), '/me/notifications/unread-count': unreadBadge(1), '/me/notifications': page([entry]), [`PUT /me/notifications/${entry.id}/read`]: new ApiError('Sessão expirada', 401) })
    const navigation = navigationMock()
    const onExpired = vi.fn()
    const tree = await mountNotifications(navigation, onExpired)
    await pressButton(tree, 'Novo aviso em Copa Sudoeste. há 5 min. Não lida')
    expect(onExpired).toHaveBeenCalled()
    expect(navigation.go).not.toHaveBeenCalled()
  })

  it('"Marcar todas como lidas" zera o contador e anuncia o resultado', async () => {
    serve({
      '/me/follow-requests': page([]), '/me/notifications/unread-count': unreadBadge(2), '/me/notifications': page([note('aviso_evento', event), note('reserva_expirada', event)]),
      'PUT /me/notifications/read-all': unreadBadge(0),
    })
    const tree = await mountNotifications()
    await pressButton(tree, 'Marcar todas como lidas')
    expect(callsTo('PUT', '/me/notifications/read-all')[0][2]).toEqual({})
    expect(byId(tree, 'unread-dot')).toHaveLength(0)
    expect(allText(tree)).toContain('Todas as notificações foram marcadas como lidas.')
    expect(findButton(tree, 'Marcar todas como lidas')).toBeUndefined()
    serve({ '/me/follow-requests': page([]), '/me/notifications/unread-count': unreadBadge(1), '/me/notifications': page([note('aviso_evento', event)]), 'PUT /me/notifications/read-all': new ApiError('Sem rede', 500) })
    const failed = await mountNotifications()
    await pressButton(failed, 'Marcar todas como lidas')
    expect(allText(failed)).toContain('Sem rede')
  })

  it('estado vazio honesto e paginação', async () => {
    serve({ '/me/follow-requests': page([]), '/me/notifications/unread-count': unreadBadge(0), '/me/notifications': page([]) })
    const empty = await mountNotifications()
    expect(byId(empty, 'notifications-empty')).toHaveLength(1)
    expect(allText(empty)).toContain('Tudo em dia')
    serve({
      '/me/follow-requests': page([]), '/me/notifications/unread-count': unreadBadge(0),
      '/me/notifications': page([note('aviso_evento', event, null, { read_at: 'x' })], 'c2'),
      '/me/notifications?cursor=c2': page([note('reserva_expirada', event, null, { read_at: 'x' })]),
    })
    const paged = await mountNotifications()
    expect(allText(paged)).not.toContain('Sua reserva em')
    await pressButton(paged, 'Carregar mais notificações')
    expect(allText(paged)).toContain('Sua reserva em Copa Sudoeste expirou')
    expect(findButton(paged, 'Carregar mais notificações')).toBeUndefined()
  })

  it('erro na lista mostra a mensagem e "Tentar novamente"', async () => {
    let fail = true
    serve({
      '/me/follow-requests': page([]), '/me/notifications/unread-count': unreadBadge(0),
      '/me/notifications': () => (fail ? new ApiError('Notificações fora do ar', 500) : page([note('aviso_evento', event, null, { read_at: 'x' })])),
    })
    const tree = await mountNotifications()
    expect(allText(tree)).toContain('Notificações fora do ar')
    fail = false
    await pressButton(tree, 'Tentar novamente')
    expect(allText(tree)).toContain('Novo aviso em Copa Sudoeste')
  })
})

describe('Notificações: solicitações para seguir', () => {
  beforeEach(() => { enableAct(); vi.mocked(apiRequest).mockReset(); nextId = 1 })
  const asker = (id: number, name: string) => ({ user: { id, name, username: name.toLowerCase().replace(/\s+/g, '.'), avatar_url: null, cover_url: null, social_public: false, post_count: 0, follower_count: 0, following_count: 0, follows_you: false, follow_state: 'none' as const }, state: 'pendente' })

  it('lista, aprova e recusa pedidos', async () => {
    serve({
      '/me/follow-requests': page([asker(10, 'Ana Prado'), asker(11, 'Beto Dias')]), '/me/notifications/unread-count': unreadBadge(0), '/me/notifications': page([]),
      [request(10, true)]: undefined, [request(11, false)]: undefined,
    })
    const tree = await mountNotifications()
    expect(allText(tree)).toContain('Solicitações para seguir')
    expect(allText(tree)).toContain('@ana.prado')
    await pressButton(tree, 'Aprovar solicitação de Ana Prado')
    expect(callsTo('PUT', '/me/follow-requests/10?approve=true')).toHaveLength(1)
    expect(allText(tree)).not.toContain('@ana.prado')
    expect(allText(tree)).toContain('Solicitação de Ana Prado aprovada.')
    await pressButton(tree, 'Recusar solicitação de Beto Dias')
    expect(callsTo('PUT', '/me/follow-requests/11?approve=false')).toHaveLength(1)
    expect(allText(tree)).toContain('Solicitação de Beto Dias recusada.')
  })

  it('"Aprovar todas" esvazia a fila em lotes', async () => {
    let queue = [asker(10, 'Ana Prado'), asker(11, 'Beto Dias')]
    serve({
      '/me/follow-requests': () => page(queue), '/me/notifications/unread-count': unreadBadge(0), '/me/notifications': page([]),
      [request(10, true)]: () => { queue = queue.filter(entry => entry.user.id !== 10) },
      [request(11, true)]: () => { queue = queue.filter(entry => entry.user.id !== 11) },
    })
    const tree = await mountNotifications()
    await pressButton(tree, 'Aprovar todas as solicitações')
    expect(callsTo('PUT', '/me/follow-requests/10?approve=true')).toHaveLength(1)
    expect(callsTo('PUT', '/me/follow-requests/11?approve=true')).toHaveLength(1)
    expect(allText(tree)).not.toContain('Solicitações para seguir')
    expect(byId(tree, 'notifications-empty')).toHaveLength(1)
  })

  it('"Aprovar todas" para quando a fila não anda (os mesmos pedidos de novo) e avisa, sem rodar sem fim', async () => {
    const queue = [asker(10, 'Ana Prado'), asker(11, 'Beto Dias')]
    serve({
      '/me/follow-requests': () => page(queue), '/me/notifications/unread-count': unreadBadge(0), '/me/notifications': page([]),
      [request(10, true)]: undefined, [request(11, true)]: undefined,
    })
    const tree = await mountNotifications()
    await pressButton(tree, 'Aprovar todas as solicitações')
    expect(callsTo('PUT', '/me/follow-requests/10?approve=true')).toHaveLength(1)
    expect(callsTo('PUT', '/me/follow-requests/11?approve=true')).toHaveLength(1)
    expect(allText(tree)).toContain('Nem todas as solicitações foram aprovadas.')
    expect(allText(tree)).not.toContain('Solicitações aprovadas.')
  })

  it('erros: a resposta falha com mensagem; a seção com erro não esconde as atividades', async () => {
    serve({
      '/me/follow-requests': page([asker(10, 'Ana Prado')]), '/me/notifications/unread-count': unreadBadge(0), '/me/notifications': page([note('aviso_evento', event, null, { read_at: 'x' })]),
      [request(10, true)]: new ApiError('Pedido não encontrado.', 404),
    })
    const tree = await mountNotifications()
    await pressButton(tree, 'Aprovar solicitação de Ana Prado')
    expect(allText(tree)).toContain('Pedido não encontrado.')
    serve({ '/me/follow-requests': new ApiError('Fila fora do ar', 500), '/me/notifications/unread-count': unreadBadge(0), '/me/notifications': page([note('aviso_evento', event, null, { read_at: 'x' })]) })
    const section = await mountNotifications()
    expect(allText(section)).toContain('Fila fora do ar')
    expect(allText(section)).toContain('Novo aviso em Copa Sudoeste')
  })
})

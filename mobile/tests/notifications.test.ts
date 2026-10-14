import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request as apiRequest } from '../src/api/client'
import { notificationView } from '../src/data/notifications'
import { openTarget } from '../src/navigation/openNotification'
import type { ScreenProps } from '../src/navigation/screens'
import NotificationsScreen from '../src/screens/NotificationsScreen'
import { formatDeadline } from '../src/utils/format'
import { enableAct } from './support/native'
import { allText, byId, callsTo, findButton, labelled, me, navigationMock, page, pressButton, render } from './support/events'
import { FEED_ALL, PENDING_ALL, feedOf, note, pendingNote, pendingOf, resetNotificationIds, serveNotifications, summaryOf } from './support/notifications'
import { notificationSummaryState, playContext } from './support/play'
import { toasts, toastText } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn().mockResolvedValue('test-token'), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
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

/* ===== Tela de notificações ===== */

type Mounted = Pick<Awaited<ReturnType<typeof mountNotifications>>, 'tree'>
async function mountNotifications({ navigation = navigationMock(), onExpired = vi.fn(), user = me, summary = summaryOf(), params }: {
  navigation?: ReturnType<typeof navigationMock>; onExpired?: () => void; user?: typeof me; summary?: ReturnType<typeof summaryOf> | null; params?: ScreenProps<'notifications'>['params']
} = {}) {
  const notificationSummary = notificationSummaryState(summary)
  const tree = await render(h(NotificationsScreen, { user, navigation, onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), notificationSummary, onExpired, params, title: 'Notificações' }))
  return { tree, navigation, onExpired, notificationSummary }
}
/** Linha da lista (ou botão do cartão) cujo rótulo começa com `startsWith`. */
const item = ({ tree }: Mounted, startsWith: string) => tree.root.findAll(node => String(node.type) === 'Pressable' && String(node.props.accessibilityLabel).startsWith(startsWith))[0]
const proposal = (extra: Record<string, unknown> = {}) => pendingNote('proposta_partida', { match_id: 12, opponent_name: 'Leões da Vila', ...extra }, null, { agoH: 1, leftH: 1.5 })
const PROPOSAL_TEXT = 'Partida encontrada contra Leões da Vila. Responda em até 2 h'

beforeEach(() => {
  enableAct()
  vi.mocked(apiRequest).mockReset()
  resetNotificationIds()
  // Só o relógio é falso: as leituras simuladas seguem com os temporizadores reais.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 13, 15, 0, 0))
})
afterEach(() => { vi.useRealTimers() })

describe('Notificações: placa, resumo e chips', () => {
  it('mostra a placa com voltar, título, "Ler todas" e a linha de resumo "4 não lidas · 3 pedem sua resposta"', async () => {
    serveNotifications()
    const { tree, navigation } = await mountNotifications({ summary: summaryOf({ unread_count: 4, pending_count: 3 }) })
    expect(byId(tree, 'notifications-plate')).toHaveLength(1)
    expect(allText(tree)).toContain('Notificações')
    expect(allText(tree)).toContain('4 não lidas · 3 pedem sua resposta')
    expect(findButton(tree, 'Ler todas')).toBeTruthy()
    await pressButton(tree, 'Voltar')
    expect(navigation.back).toHaveBeenCalled()
  })

  it('a linha de resumo muda: tudo lido com pendências, uma só, e "Tudo em dia"; sem não lidas não há "Ler todas"', async () => {
    serveNotifications()
    const read = await mountNotifications({ summary: summaryOf({ pending_count: 3 }) })
    expect(allText(read.tree)).toContain('Tudo lido · 3 ainda pedem sua resposta')
    expect(findButton(read.tree, 'Ler todas')).toBeUndefined()
    const one = await mountNotifications({ summary: summaryOf({ unread_count: 1, pending_count: 1 }) })
    expect(allText(one.tree)).toContain('1 não lida · 1 pede sua resposta')
    const done = await mountNotifications({ summary: summaryOf() })
    expect(allText(done.tree)).toContain('Tudo em dia')
    // Sem o resumo (ainda lendo ou com erro) a placa fica sem a linha, sem números e sem "Ler todas".
    const none = await mountNotifications({ summary: null })
    expect(allText(none.tree)).not.toMatch(/não lidas?|Tudo lido/)
    expect(findButton(none.tree, 'Ler todas')).toBeUndefined()
    expect(findButton(none.tree, 'Para responder')).toBeTruthy()
  })

  it('os chips são um grupo de escolha única: Para responder mostra o total de pendências; as categorias, as não lidas só quando há; Tudo, nenhum número', async () => {
    serveNotifications()
    const { tree } = await mountNotifications({ summary: summaryOf({ pending_count: 3, by: { partidas: 2, times: 0, eventos: 1 } }) })
    const group = tree.root.findAll(node => node.props.accessibilityRole === 'radiogroup')[0]
    expect(group.props.accessibilityLabel).toBe('Filtrar notificações')
    const radios = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'radio')
    expect(radios.map(node => node.props.accessibilityLabel)).toEqual(['Tudo', 'Para responder, 3 pendências', 'Partidas, 2 não lidas', 'Times', 'Eventos, 1 não lida'])
    expect(radios.map(node => node.props.accessibilityState.selected)).toEqual([true, false, false, false, false])
    expect(radios.map(node => node.props.accessibilityState.checked)).toEqual([true, false, false, false, false])
  })

  it('abre já no chip pedido pelo parâmetro (a placa do Início usa "responder") e não lê a lista nesse chip', async () => {
    serveNotifications({ pending: [proposal()] })
    const { tree } = await mountNotifications({ params: { filter: 'responder' }, summary: summaryOf({ pending_count: 1 }) })
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'radio').map(node => node.props.accessibilityState.selected)).toEqual([false, true, false, false, false])
    expect(allText(tree)).toContain(PROPOSAL_TEXT)
    expect(callsTo('GET', FEED_ALL)).toHaveLength(0)
    expect(callsTo('GET', '/me/follow-requests')).toHaveLength(0)
  })
})

describe('Notificações: consulta de cada chip', () => {
  it('Tudo lê o bloco fixado (limit 50) e a lista sem pendências; trocar de chip não relê o resumo', async () => {
    serveNotifications({
      pending: [proposal()], feed: [note('aviso_evento', event, null, { category: 'eventos' })],
      extra: {
        [pendingOf('partidas')]: { items: [] }, [feedOf('partidas')]: page([note('partida_agendada', { match_id: 14 }, null, { category: 'partidas' })]),
        [pendingOf('times')]: { items: [] }, [feedOf('times')]: page([]),
      },
    })
    const { tree, notificationSummary } = await mountNotifications({ summary: summaryOf({ unread_count: 2, pending_count: 1, by: { partidas: 1, eventos: 1 } }) })
    expect(callsTo('GET', PENDING_ALL)).toHaveLength(1)
    expect(callsTo('GET', FEED_ALL)).toHaveLength(1)
    expect(allText(tree)).toContain('Novo aviso em Copa Sudoeste')

    // Para responder: só o bloco, que já estava lido; a lista some e nada é pedido de novo.
    await pressButton(tree, 'Para responder, 1 pendência')
    expect(callsTo('GET', PENDING_ALL)).toHaveLength(1)
    expect(callsTo('GET', FEED_ALL)).toHaveLength(1)
    expect(allText(tree)).toContain(PROPOSAL_TEXT)
    expect(allText(tree)).not.toContain('Novo aviso em Copa Sudoeste')

    // Categoria: as pendências e a lista da categoria, ambas no servidor.
    await pressButton(tree, 'Partidas, 1 não lida')
    expect(callsTo('GET', pendingOf('partidas'))).toHaveLength(1)
    expect(callsTo('GET', feedOf('partidas'))).toHaveLength(1)
    expect(allText(tree)).toContain('Partida agendada')
    expect(allText(tree)).not.toContain('Novo aviso em Copa Sudoeste')
    await pressButton(tree, 'Times')
    expect(callsTo('GET', pendingOf('times'))).toHaveLength(1)
    expect(callsTo('GET', feedOf('times'))).toHaveLength(1)

    // Volta a Tudo e só o resumo da abertura foi pedido (uma vez).
    await pressButton(tree, 'Tudo')
    expect(allText(tree)).toContain('Novo aviso em Copa Sudoeste')
    expect(notificationSummary.reload).toHaveBeenCalledTimes(1)
  })

  it('chip sem nada mostra "Nada neste filtro."; Tudo sem nada mostra o estado vazio honesto', async () => {
    serveNotifications({ extra: { [pendingOf('eventos')]: { items: [] }, [feedOf('eventos')]: page([]) } })
    const { tree } = await mountNotifications()
    expect(byId(tree, 'notifications-empty')).toHaveLength(1)
    expect(allText(tree)).toContain('Convites e pedidos dos seus times, propostas e partidas, inscrições em campeonatos e provas e as respostas da administração aparecem aqui.')
    expect(byId(tree, 'notifications-filter-empty')).toHaveLength(0)
    await pressButton(tree, 'Eventos')
    expect(allText(tree)).toContain('Nada neste filtro.')
    expect(byId(tree, 'notifications-empty')).toHaveLength(0)
    const asking = await mountNotifications({ params: { filter: 'responder' } })
    expect(allText(asking.tree)).toContain('Nada neste filtro.')
  })

  it('erro com "Tentar novamente" em cada seção e "Carregar mais"', async () => {
    let failPending = true
    let failFeed = true
    serveNotifications({
      extra: {
        [PENDING_ALL]: () => (failPending ? new ApiError('Pendências fora do ar', 500) : { items: [proposal()] }),
        [FEED_ALL]: () => (failFeed ? new ApiError('Lista fora do ar', 500) : page([note('aviso_evento', event, null, { read_at: 'x' })], 'c2')),
        [`${FEED_ALL}&cursor=c2`]: page([note('reserva_expirada', event, null, { read_at: 'x' })]),
      },
    })
    const { tree } = await mountNotifications()
    expect(allText(tree)).toContain('Pendências fora do ar')
    expect(allText(tree)).toContain('Lista fora do ar')
    expect(allText(tree)).not.toContain('Nada neste filtro.')
    // O botão da lista é o último da tela; o das pendências, o primeiro.
    failFeed = false
    await pressButton(tree, 'Tentar novamente')
    expect(allText(tree)).toContain('Novo aviso em Copa Sudoeste')
    expect(allText(tree)).not.toContain('Lista fora do ar')
    expect(allText(tree)).toContain('Pendências fora do ar')
    failPending = false
    await pressButton(tree, 'Tentar novamente')
    expect(allText(tree)).toContain(PROPOSAL_TEXT)
    expect(allText(tree)).not.toContain('Sua reserva em')
    await pressButton(tree, 'Carregar mais notificações')
    expect(allText(tree)).toContain('Sua reserva em Copa Sudoeste expirou')
    expect(findButton(tree, 'Carregar mais notificações')).toBeUndefined()
  })

  it('401 em qualquer leitura expira a sessão', async () => {
    serveNotifications({ extra: { [PENDING_ALL]: new ApiError('Sessão expirada', 401) } })
    const { onExpired } = await mountNotifications()
    expect(onExpired).toHaveBeenCalled()
  })
})

describe('Notificações: lista agrupada por dia e bloco "Para responder"', () => {
  it('carrega a 51ª pendência e mantém os cartões anteriores', async () => {
    const items = Array.from({ length: 51 }, (_, index) => pendingNote('convite_time', { team_id: index + 1, team_name: `Time ${index + 1}`, invite_id: index + 1 }))
    serveNotifications({ extra: {
      [PENDING_ALL]: { items: items.slice(0, 50), next_cursor: 'page-2' },
      [`${PENDING_ALL}&cursor=page-2`]: { items: items.slice(50), next_cursor: null },
    } })
    const { tree } = await mountNotifications({ params: { filter: 'responder' }, summary: summaryOf({ pending_count: 51 }) })
    expect(byId(tree, 'pending-card')).toHaveLength(50)
    await pressButton(tree, 'Carregar mais pendências')
    expect(byId(tree, 'pending-card')).toHaveLength(51)
    expect(findButton(tree, 'Carregar mais pendências')).toBeUndefined()
    expect(callsTo('GET', `${PENDING_ALL}&cursor=page-2`)).toHaveLength(1)
  })
  it('o bloco fixado vem primeiro; depois Hoje, Ontem, Esta semana e Anteriores, com as linhas de sempre', async () => {
    const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()
    serveNotifications({
      pending: [proposal()],
      feed: [
        note('aviso_evento', event, null, { created_at: ago(1) }), note('reserva_expirada', event, null, { created_at: ago(26), read_at: 'x' }),
        note('time_encerrado', { team_name: 'Velho FC' }, null, { created_at: ago(72), read_at: 'x' }), note('convite_aceito', { team_name: 'Ferrugem FC' }, 'Ana Prado', { created_at: ago(24 * 10), read_at: 'x' }),
      ],
    })
    const mounted = await mountNotifications({ summary: summaryOf({ unread_count: 2, pending_count: 1 }) })
    const text = allText(mounted.tree)
    const order = ['PARTIDA ENCONTRADA', 'HOJE', 'Novo aviso em Copa Sudoeste', 'ONTEM', 'Sua reserva em', 'ESTA SEMANA', 'O Velho FC foi encerrado', 'ANTERIORES', 'Ana Prado aceitou o convite']
    const positions = order.map(part => text.toUpperCase().indexOf(part.toUpperCase()))
    expect(positions.every(position => position > -1)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    for (const label of ['Hoje', 'Ontem', 'Esta semana', 'Anteriores']) expect(labelled(mounted.tree, label)).toHaveLength(1)
    expect(item(mounted, 'Novo aviso em Copa Sudoeste').props.accessibilityLabel).toBe('Novo aviso em Copa Sudoeste. há 1 hora. Não lida')
  })

  it('o cartão mostra rótulo, texto, tempo, prazo e a barra: verde enquanto restar 25% do tempo ou mais, âmbar com menos disso; sem prazo, sem barra', async () => {
    const roomy = pendingNote('convite_time', { team_id: 3, team_name: 'Várzea Unida' }, 'Marina Costa', { agoH: 1, leftH: 30 })
    const urgent = pendingNote('proposta_partida', { match_id: 13, opponent_name: 'Tigres' }, null, { agoH: 4, leftH: 1 })
    serveNotifications({ pending: [proposal(), roomy, pendingNote('comprovante_recebido', event, null, { agoH: 2, leftH: null }), urgent] })
    const { tree } = await mountNotifications({ summary: summaryOf({ pending_count: 4 }) })
    const cards = byId(tree, 'pending-card')
    expect(cards).toHaveLength(4)
    const [first, second, third] = cards.map(card => allText({ root: card } as never))
    expect(first).toContain('PARTIDA ENCONTRADA')
    expect(first).toContain(PROPOSAL_TEXT)
    expect(first).toContain('há 1 hora')
    expect(first).toContain('faltam 1 h 30')
    expect(first).toContain('Responder proposta')
    expect(second).toContain('CONVITE DE TIME')
    expect(second).toContain('Marina Costa convidou você para o Várzea Unida')
    expect(second).toContain('faltam 1 dia 6 h')
    expect(second).toContain('Ver convite')
    expect(third).toContain('COMPROVANTE RECEBIDO')
    expect(third).toContain('sem prazo')
    const fill = (card: (typeof cards)[number]) => byId({ root: card } as never, 'deadline-bar')[0]?.children[0] as unknown as { props: { style: { width: string; backgroundColor: string } } } | undefined
    expect(fill(cards[0])?.props.style).toMatchObject({ width: '60%', backgroundColor: '#1f9d57' })
    expect(fill(cards[1])?.props.style).toMatchObject({ width: '97%', backgroundColor: '#1f9d57' })
    expect(fill(cards[2])).toBeUndefined()
    expect(fill(cards[3])?.props.style).toMatchObject({ width: '20%', backgroundColor: '#d99400' })
  })

  it('o botão do cartão marca como lida, leva à tela do aviso e a pendência lida continua no bloco', async () => {
    const entry = proposal()
    serveNotifications({ pending: [entry], extra: { [`PUT /me/notifications/${entry.id}/read`]: summaryOf({ pending_count: 1 }) } })
    const { tree, navigation, notificationSummary } = await mountNotifications({ summary: summaryOf({ unread_count: 1, pending_count: 1 }) })
    expect(byId(tree, 'unread-dot')).toHaveLength(1)
    await pressButton(tree, `Responder proposta: ${PROPOSAL_TEXT}`)
    expect(callsTo('PUT', `/me/notifications/${entry.id}/read`)[0][2]).toEqual({})
    expect(navigation.go).toHaveBeenCalledWith('play', { matchId: 12 })
    expect(notificationSummary.setData).toHaveBeenCalledWith(summaryOf({ pending_count: 1 }))
    expect(byId(tree, 'unread-dot')).toHaveLength(0)
    expect(byId(tree, 'pending-card')).toHaveLength(1)
    await pressButton(tree, `Responder proposta: ${PROPOSAL_TEXT}`)
    expect(callsTo('PUT', `/me/notifications/${entry.id}/read`)).toHaveLength(1)
    expect(navigation.go).toHaveBeenCalledTimes(2)
  })

  it('a administração decide na fila: o cartão de W.O. contestado abre a fila de W.O.', async () => {
    const contested = pendingNote('wo_contestado', { match_id: 12 }, 'Caio Ramos', { agoH: 3, leftH: null })
    serveNotifications({ pending: [contested], extra: { [`PUT /me/notifications/${contested.id}/read`]: summaryOf() } })
    const { tree, navigation } = await mountNotifications({ user: { ...me, is_admin: true } })
    await pressButton(tree, 'Decidir W.O.: Caio Ramos contestou o W.O.')
    expect(navigation.go).toHaveBeenCalledWith('admin-walkover-disputes')
  })
})

describe('Notificações: leitura e navegação das linhas', () => {
  it('tocar numa não lida marca como lida, atualiza o resumo e abre a tela do aviso; lida e com destino só navega', async () => {
    const first = note('comprovante_decidido', { ...event, decision: 'aprovado' }, null, { category: 'eventos' })
    serveNotifications({ feed: [first], extra: { [`PUT /me/notifications/${first.id}/read`]: summaryOf() } })
    const { tree, navigation, notificationSummary } = await mountNotifications({ summary: summaryOf({ unread_count: 1 }) })
    await pressButton(tree, 'Inscrição confirmada em Copa Sudoeste. há 5 min. Não lida')
    expect(callsTo('PUT', `/me/notifications/${first.id}/read`)[0][2]).toEqual({})
    expect(navigation.go).toHaveBeenCalledWith('event', { eventId: 5 })
    expect(notificationSummary.setData).toHaveBeenCalledWith(summaryOf())
    expect(byId(tree, 'unread-dot')).toHaveLength(0)
    await pressButton(tree, 'Inscrição confirmada em Copa Sudoeste. há 5 min')
    expect(callsTo('PUT', `/me/notifications/${first.id}/read`)).toHaveLength(1)
    expect(navigation.go).toHaveBeenCalledTimes(2)
  })

  it('cada tipo abre a tela do seu papel (gestão, comprovantes, filas da administração, times e organizador)', async () => {
    const list = [
      note('comprovante_recebido', event), note('evento_decidido', { ...event, decision: 'aprovado' }), note('devolucao_contestada', event, 'Maria'),
      note('evento_para_aprovar', event, 'Liga Sul'), note('pedido_entrada', { team_id: 3, team_name: 'Ferrugem FC' }, 'Ana'), note('organizador_revogado', { reason: 'x' }),
    ]
    serveNotifications({ feed: list, extra: Object.fromEntries(list.map(entry => [`PUT /me/notifications/${entry.id}/read`, summaryOf()])) })
    const mounted = await mountNotifications({ user: { ...me, is_admin: true } })
    for (const start of ['Novo comprovante', 'Copa Sudoeste foi aprovado', 'Maria contestou', 'Liga Sul enviou', 'Ana pediu', 'Sua permissão']) await pressButton(mounted.tree, item(mounted, start).props.accessibilityLabel)
    expect(vi.mocked(mounted.navigation.go).mock.calls).toEqual([
      ['event-receipts', { eventId: 5 }], ['event-manage', { eventId: 5 }], ['admin-refund-disputes'], ['admin-paid-events'], ['teams', { teamId: 3, requests: true }], ['organizer-request'],
    ])
  })

  it('o tipo do Jogar sem tela só marca como lida, com texto genérico', async () => {
    const future = note('partida_proposta', { match_id: 1 })
    serveNotifications({ feed: [future], extra: { [`PUT /me/notifications/${future.id}/read`]: summaryOf() } })
    const mounted = await mountNotifications()
    expect(allText(mounted.tree)).toContain('Nova atividade na sua conta')
    await pressButton(mounted.tree, 'Nova atividade na sua conta. há 5 min. Não lida')
    expect(callsTo('PUT', `/me/notifications/${future.id}/read`)).toHaveLength(1)
    expect(mounted.navigation.go).not.toHaveBeenCalled()
    expect(item(mounted, 'Nova atividade na sua conta')).toBeUndefined()
  })

  it('falha ao marcar como lida: com destino segue para a tela; sem destino mostra o erro; 401 expira e não navega', async () => {
    const withTarget = note('aviso_evento', event)
    const without = note('partida_proposta')
    serveNotifications({
      feed: [withTarget, without],
      extra: { [`PUT /me/notifications/${withTarget.id}/read`]: new ApiError('Fora do ar', 500), [`PUT /me/notifications/${without.id}/read`]: new ApiError('Fora do ar', 500) },
    })
    const { tree, navigation } = await mountNotifications()
    await pressButton(tree, 'Novo aviso em Copa Sudoeste. há 5 min. Não lida')
    expect(navigation.go).toHaveBeenCalledWith('event', { eventId: 5 })
    expect(toastText()).not.toContain('Fora do ar')
    await pressButton(tree, 'Nova atividade na sua conta. há 5 min. Não lida')
    expect(toasts().map(item => item.tone)).toEqual(['error'])
    expect(toastText()).toContain('Fora do ar')

    const expiring = note('aviso_evento', event)
    serveNotifications({ feed: [expiring], extra: { [`PUT /me/notifications/${expiring.id}/read`]: new ApiError('Sessão expirada', 401) } })
    const expired = await mountNotifications()
    await pressButton(expired.tree, 'Novo aviso em Copa Sudoeste. há 5 min. Não lida')
    expect(expired.onExpired).toHaveBeenCalled()
    expect(expired.navigation.go).not.toHaveBeenCalled()
  })
})

describe('Notificações: Ler todas', () => {
  it('marca tudo como lido (lista e bloco), entrega o resumo novo ao shell e anuncia o resultado; falha mostra a mensagem', async () => {
    serveNotifications({
      pending: [proposal()], feed: [note('aviso_evento', event), note('reserva_expirada', event)],
      extra: { 'PUT /me/notifications/read-all': summaryOf({ pending_count: 1 }) },
    })
    const { tree, notificationSummary } = await mountNotifications({ summary: summaryOf({ unread_count: 3, pending_count: 1 }) })
    expect(byId(tree, 'unread-dot')).toHaveLength(3)
    await pressButton(tree, 'Ler todas')
    expect(callsTo('PUT', '/me/notifications/read-all')[0][2]).toEqual({})
    expect(notificationSummary.setData).toHaveBeenCalledWith(summaryOf({ pending_count: 1 }))
    expect(byId(tree, 'unread-dot')).toHaveLength(0)
    expect(byId(tree, 'pending-card')).toHaveLength(1)
    expect(toasts().map(item => item.tone)).toEqual(['success'])
    expect(toastText()).toContain('Todas as notificações foram marcadas como lidas.')

    serveNotifications({ feed: [note('aviso_evento', event)], extra: { 'PUT /me/notifications/read-all': new ApiError('Sem rede', 500) } })
    const failed = await mountNotifications({ summary: summaryOf({ unread_count: 1 }) })
    await pressButton(failed.tree, 'Ler todas')
    expect(toasts().map(item => item.tone)).toEqual(['success', 'error'])
    expect(toastText()).toContain('Sem rede')
    expect(failed.notificationSummary.setData).not.toHaveBeenCalled()
  })

  it('o 401 de Ler todas expira a sessão', async () => {
    serveNotifications({ feed: [note('aviso_evento', event)], extra: { 'PUT /me/notifications/read-all': new ApiError('Sessão expirada', 401) } })
    const { tree, onExpired } = await mountNotifications({ summary: summaryOf({ unread_count: 1 }) })
    await pressButton(tree, 'Ler todas')
    expect(onExpired).toHaveBeenCalled()
  })
})

describe('Notificações: pedidos para seguir', () => {
  const asker = (id: number, name: string) => ({ user: { id, name, username: name.toLowerCase().replace(/\s+/g, '.'), avatar_url: null, cover_url: null, social_public: false, post_count: 0, follower_count: 0, following_count: 0, follows_you: false, follow_state: 'none' as const }, state: 'pendente' })

  it('a linha-resumo no topo de Tudo mostra o total do resumo e os nomes, e abre a subtela; nos outros chips não aparece', async () => {
    serveNotifications({ requests: [asker(10, 'Bruna Alves'), asker(11, 'Diego Souza')], extra: { [pendingOf('times')]: { items: [] }, [feedOf('times')]: page([]) } })
    const { tree, navigation } = await mountNotifications({ summary: summaryOf({ follow_requests_count: 2 }) })
    expect(byId(tree, 'follow-requests-line')).toHaveLength(1)
    expect(allText(tree)).toContain('2 pedidos para seguir')
    expect(allText(tree)).toContain('Bruna Alves e Diego Souza')
    await pressButton(tree, '2 pedidos para seguir: Bruna Alves e Diego Souza')
    expect(navigation.go).toHaveBeenCalledWith('follow-requests')
    await pressButton(tree, 'Times')
    expect(byId(tree, 'follow-requests-line')).toHaveLength(0)
  })

  it('com mais de dois pedidos, os nomes dizem "e mais N"; com um só, o singular; sem pedidos, sem linha', async () => {
    serveNotifications({ requests: [asker(10, 'Bruna Alves'), asker(11, 'Diego Souza'), asker(12, 'Eva Lima')] })
    const many = await mountNotifications({ summary: summaryOf({ follow_requests_count: 5 }) })
    expect(allText(many.tree)).toContain('5 pedidos para seguir')
    expect(allText(many.tree)).toContain('Bruna Alves, Diego Souza e mais 3')
    serveNotifications({ requests: [asker(10, 'Bruna Alves')] })
    const one = await mountNotifications({ summary: summaryOf({ follow_requests_count: 1 }) })
    expect(allText(one.tree)).toContain('1 pedido para seguir')
    expect(byId(one.tree, 'notifications-empty')).toHaveLength(0)
    serveNotifications()
    const none = await mountNotifications()
    expect(byId(none.tree, 'follow-requests-line')).toHaveLength(0)
  })

  it('mesmo se a fila falhar, o total do resumo continua levando à subtela', async () => {
    serveNotifications({ extra: { '/me/follow-requests': new ApiError('Fila fora do ar', 500) } })
    const { tree, navigation } = await mountNotifications({ summary: summaryOf({ follow_requests_count: 2 }) })
    await pressButton(tree, '2 pedidos para seguir')
    expect(navigation.go).toHaveBeenCalledWith('follow-requests')
  })
})

import React from 'react'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { AdminEvent } from '../src/api/admin'
import AdminOrganizerRequestsScreen from '../src/screens/AdminOrganizerRequestsScreen'
import AdminPaidEventsScreen from '../src/screens/AdminPaidEventsScreen'
import AdminRefundDisputesScreen from '../src/screens/AdminRefundDisputesScreen'
import AdminRevokedEventsScreen from '../src/screens/AdminRevokedEventsScreen'
import { formatPrice } from '../src/utils/format'
import { enableAct } from './support/native'
import type { Call } from './support/review'
import { toastText, toasts } from './support/toast'
import {
  admin, adminEvent, adminOrganizer, allText, bodyOf, byId, callsTo, dispute, entry, findButton, hasField, inHours, lastBodyOf, me, organizerRequest, page, person, pressButton, pressPrefix, receipt, render, serve,
  typeInto,
} from './support/review'

const openURL = vi.hoisted(() => vi.fn())
vi.mock('react-native', async () => {
  const base = (await import('./support/native')).reactNativeMock()
  return { ...base, Linking: { ...base.Linking, openURL } }
})
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

const h = React.createElement
const brl = (cents: number) => formatPrice(cents)
const OPEN = '/admin/organizer-requests?state=em_analise'
const DECIDED = '/admin/organizer-requests?state=decididos'
const ORGANIZERS = '/admin/organizers'

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  openURL.mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})

describe('Telas da administração: acesso', () => {
  it.each([
    ['Pedidos de organizador', AdminOrganizerRequestsScreen],
    ['Eventos pagos', AdminPaidEventsScreen],
    ['Organizador revogado', AdminRevokedEventsScreen],
    ['Devoluções contestadas', AdminRefundDisputesScreen],
  ] as const)('%s: quem não é administrador vê o aviso e nenhuma requisição é feita', async (_name, Screen) => {
    serve({})
    const tree = await render(h(Screen as React.ComponentType<{ user: typeof me; onExpired: () => void }>, { user: me, onExpired: vi.fn() }))
    expect(byId(tree, 'admin-denied')).toHaveLength(1)
    expect(allText(tree)).toContain('Esta área é só para a administração do Arena.')
    expect(vi.mocked(request)).not.toHaveBeenCalled()
  })
})

describe('Pedidos de organizador (AD1)', () => {
  const pace = organizerRequest({ id: 32, display_name: 'Pace Lago Assessoria', sports: ['corrida'], experience: null, link: null, requester: person(5, 'Bia Rocha'), created_at: inHours(-30) })
  const mount = (onExpired = vi.fn(), onOpenProfile?: (userId: number) => void) =>
    render(h(AdminOrganizerRequestsScreen, { user: admin, onExpired, onOpenProfile }))
  function world(extra: Record<string, unknown> = {}) {
    const state = { open: [organizerRequest(), pace], decided: [] as ReturnType<typeof organizerRequest>[] }
    serve({
      [OPEN]: () => page(state.open), [DECIDED]: () => page(state.decided), [ORGANIZERS]: () => page([adminOrganizer()]),
      'POST /admin/organizer-requests/31/decision': ({ body }: Call) => {
        state.open = state.open.filter(item => item.id !== 31)
        return organizerRequest({ state: (body as { decision: string }).decision === 'aprovar' ? 'aprovado' : 'recusado' })
      },
      ...extra,
    })
    return state
  }

  it('lista os pedidos em análise e mostra os dados completos na folha', async () => {
    world()
    const tree = await mount()
    const text = allText(tree)
    expect(text).toContain('Para analisar')
    expect(text).toContain('Liga Sudoeste')
    expect(text).toContain('Rafa Nunes · Futebol, Corrida · há 5 horas')
    expect(text).toContain('Pace Lago Assessoria')
    await pressPrefix(tree, 'Liga Sudoeste.')
    const sheet = allText(tree)
    expect(sheet).toContain('Pedido de organizador')
    expect(sheet).toContain('Pedido de Rafa Nunes · há 5 horas')
    expect(sheet).toContain('Brasília · DF')
    expect(sheet).toContain('Futebol, Corrida')
    expect(sheet).toContain('(61) 99999-0000')
    expect(sheet).toContain('Organizo a pelada de quinta há 3 anos.')
    expect(sheet).toContain('https://instagram.com/ligasudoeste')
    // Sem rota de perfil, a folha só mostra os dados.
    expect(findButton(tree, 'Ver perfil de Rafa')).toBeUndefined()
  })

  it('aprova o pedido: o corpo leva a decisão, a fila perde a linha e o aviso é mostrado', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Liga Sudoeste.')
    await pressButton(tree, 'Aprovar organizador')
    expect(bodyOf('POST', '/admin/organizer-requests/31/decision')).toEqual({ decision: 'aprovar' })
    expect(toastText()).toContain('Liga Sudoeste agora é organizador.')
    expect(toasts().map(item => item.tone)).toEqual(['success'])
    expect(findButton(tree, 'Aprovar organizador')).toBeUndefined()
    expect(findByRow(tree, 'Liga Sudoeste.')).toBeUndefined()
    expect(findByRow(tree, 'Pace Lago Assessoria.')).toBeTruthy()
  })

  it('recusa exige o motivo; em "Outro", o detalhe; o corpo leva o motivo e o detalhe aparado', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Liga Sudoeste.')
    await pressButton(tree, 'Recusar')
    await pressButton(tree, 'Recusar pedido')
    expect(allText(tree)).toContain('Escolha o motivo da recusa.')
    expect(callsTo('POST', '/admin/organizer-requests/31/decision')).toHaveLength(0)
    await pressButton(tree, 'Outro')
    expect(hasField(tree, 'Detalhe para quem pediu (obrigatório)')).toBe(true)
    await pressButton(tree, 'Recusar pedido')
    expect(allText(tree)).toContain('Descreva o motivo da recusa.')
    await typeInto(tree, 'Detalhe para quem pediu (obrigatório)', '  Perfil sem atividade  ')
    await pressButton(tree, 'Recusar pedido')
    expect(bodyOf('POST', '/admin/organizer-requests/31/decision')).toEqual({ decision: 'recusar', reason_code: 'outro', reason_detail: 'Perfil sem atividade' })
    expect(toastText()).toContain('Pedido de Liga Sudoeste recusado.')
  })

  it('recusa com motivo da lista omite o detalhe', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Liga Sudoeste.')
    await pressButton(tree, 'Recusar')
    await pressButton(tree, 'Pouca informação')
    await pressButton(tree, 'Recusar pedido')
    expect(bodyOf('POST', '/admin/organizer-requests/31/decision')).toEqual({ decision: 'recusar', reason_code: 'pouca_informacao' })
  })

  it('pedido já decidido em outro lugar (409): a folha fecha, avisa e a fila é relida', async () => {
    const expired = vi.fn()
    world({ 'POST /admin/organizer-requests/31/decision': new ApiError('Este pedido já foi decidido.', 409) })
    const tree = await mount(expired)
    await pressPrefix(tree, 'Liga Sudoeste.')
    await pressButton(tree, 'Aprovar organizador')
    expect(toastText()).toContain('Este pedido já foi decidido.')
    expect(findButton(tree, 'Aprovar organizador')).toBeUndefined()
    expect(callsTo('GET', OPEN)).toHaveLength(2)
    expect(expired).not.toHaveBeenCalled()
  })

  it('outros erros ficam na folha, e o 401 volta ao login', async () => {
    const expired = vi.fn()
    world({ 'POST /admin/organizer-requests/31/decision': new ApiError('Este atleta já é organizador.', 422) })
    const tree = await mount(expired)
    await pressPrefix(tree, 'Liga Sudoeste.')
    await pressButton(tree, 'Aprovar organizador')
    expect(toastText()).toContain('Este atleta já é organizador.')
    expect(findButton(tree, 'Aprovar organizador')).toBeTruthy()
    world({ 'POST /admin/organizer-requests/31/decision': new ApiError('Sessão expirada.', 401) })
    await pressButton(tree, 'Aprovar organizador')
    expect(expired).toHaveBeenCalled()
  })

  it('"Ver perfil" aparece quando a tela sabe abrir o perfil: fecha a folha e entrega o id', async () => {
    world()
    const onOpenProfile = vi.fn()
    const tree = await mount(vi.fn(), onOpenProfile)
    await pressPrefix(tree, 'Liga Sudoeste.')
    await pressButton(tree, 'Ver perfil de Rafa')
    expect(onOpenProfile).toHaveBeenCalledWith(2)
    expect(allText(tree)).not.toContain('Pedido de organizador')
  })

  it('o link do pedido abre no navegador, só com http(s), e avisa se falhar', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Liga Sudoeste.')
    openURL.mockRejectedValueOnce(new Error('sem navegador'))
    await pressButton(tree, 'Abrir o link do pedido: https://instagram.com/ligasudoeste')
    expect(openURL).toHaveBeenCalledWith('https://instagram.com/ligasudoeste')
    expect(toastText()).toContain('Não foi possível abrir o link.')
    openURL.mockResolvedValueOnce(undefined)
    await pressButton(tree, 'Abrir o link do pedido: https://instagram.com/ligasudoeste')
    // Abrir de novo com sucesso não acrescenta aviso: o único toast é o do primeiro erro.
    expect(toasts().map(item => item.tone)).toEqual(['error'])

    world({ [OPEN]: () => page([organizerRequest({ link: 'javascript:alert(1)' })]) })
    const unsafe = await mount()
    await pressPrefix(unsafe, 'Liga Sudoeste.')
    expect(findButton(unsafe, 'Abrir o link do pedido: javascript:alert(1)')).toBeUndefined()
    expect(allText(unsafe)).toContain('javascript:alert(1)')
  })

  it('a aba Decididos mostra o selo e a decisão, sem ações', async () => {
    const state = world()
    state.decided = [
      organizerRequest({ id: 40, display_name: 'Liga Norte', state: 'recusado', reason_code: 'pouca_informacao', reason_detail: 'Falta o contato', decided_at: inHours(-2), decided_by: person(9, 'Ana Admin') }),
      organizerRequest({ id: 41, display_name: 'Liga Leste', state: 'aprovado', decided_at: inHours(-3), decided_by: person(9, 'Ana Admin') }),
      organizerRequest({ id: 42, display_name: 'Liga Oeste', state: 'cancelado', decided_at: inHours(-4) }),
    ]
    const tree = await mount()
    await pressButton(tree, 'Decididos')
    const text = allText(tree)
    for (const badge of ['Recusado', 'Aprovado', 'Cancelado']) expect(text).toContain(badge)
    expect(text).toContain('há 2 horas')
    await pressPrefix(tree, 'Liga Norte.')
    const sheet = allText(tree)
    expect(sheet).toContain('Recusado')
    expect(sheet).toContain('por Ana Admin')
    expect(sheet).toContain('Motivo: Pouca informação · Falta o contato')
    expect(findButton(tree, 'Aprovar organizador')).toBeUndefined()
    expect(findButton(tree, 'Recusar')).toBeUndefined()
  })

  it('filas vazias e erro de leitura', async () => {
    world({ [OPEN]: () => page([]), [DECIDED]: () => page([]), [ORGANIZERS]: () => page([]) })
    const tree = await mount()
    expect(allText(tree)).toContain('Nada para analisar')
    await pressButton(tree, 'Decididos')
    expect(allText(tree)).toContain('Nenhum pedido decidido')
    await pressButton(tree, 'Organizadores')
    expect(allText(tree)).toContain('Nenhum organizador ativo')
    world({ [OPEN]: new ApiError('Acesso administrativo necessário.', 403) })
    await pressButton(tree, 'Para analisar')
    expect(allText(tree)).toContain('Acesso administrativo necessário.')
    expect(findButton(tree, 'Tentar novamente')).toBeTruthy()
  })

  it('revoga a permissão de um organizador com motivo obrigatório', async () => {
    world({ 'POST /admin/organizers/4/revoke': undefined })
    const tree = await mount()
    await pressButton(tree, 'Organizadores')
    expect(callsTo('GET', ORGANIZERS)).toHaveLength(1)
    expect(allText(tree)).toContain('Rafa Nunes · desde')
    await pressPrefix(tree, 'Liga Sudoeste.')
    const sheet = allText(tree)
    expect(sheet).toContain('Organizador desde')
    expect(sheet).toContain('Ana Admin')
    await pressButton(tree, 'Revogar permissão')
    // Motivo curto demais.
    await typeInto(tree, 'Motivo da revogação', 'abc')
    await pressButton(tree, 'Revogar')
    expect(allText(tree)).toContain('Informe o motivo da revogação, de 5 a 500 caracteres.')
    expect(callsTo('POST', '/admin/organizers/4/revoke')).toHaveLength(0)
    await typeInto(tree, 'Motivo da revogação', '  Descumpriu as regras  ')
    await pressButton(tree, 'Revogar')
    expect(bodyOf('POST', '/admin/organizers/4/revoke')).toEqual({ reason: 'Descumpriu as regras' })
    expect(toastText()).toContain('Permissão de Liga Sudoeste revogada.')
    expect(findByRow(tree, 'Liga Sudoeste.')).toBeUndefined()
  })

  it('voltar da revogação não envia nada e erro do servidor fica na folha', async () => {
    world({ 'POST /admin/organizers/4/revoke': new ApiError('Organizador não encontrado.', 404) })
    const onOpenProfile = vi.fn()
    const tree = await mount(vi.fn(), onOpenProfile)
    await pressButton(tree, 'Organizadores')
    await pressPrefix(tree, 'Liga Sudoeste.')
    await pressButton(tree, 'Revogar permissão')
    await pressButton(tree, 'Voltar')
    expect(findButton(tree, 'Revogar permissão')).toBeTruthy()
    await pressButton(tree, 'Revogar permissão')
    await typeInto(tree, 'Motivo da revogação', 'Descumpriu as regras')
    await pressButton(tree, 'Revogar')
    expect(toastText()).toContain('Organizador não encontrado.')
    await pressButton(tree, 'Voltar')
    await pressButton(tree, 'Ver perfil de Rafa')
    expect(onOpenProfile).toHaveBeenCalledWith(2)
  })
})

/** Linha da fila (botão) cujo rótulo começa com o texto. */
function findByRow(tree: Awaited<ReturnType<typeof render>>, prefix: string) {
  return tree.root.findAllByType('Pressable' as never).filter(item => typeof item.props.accessibilityLabel === 'string' && item.props.accessibilityLabel.startsWith(prefix)).pop()
}

describe('Eventos pagos (AD1)', () => {
  const mount = (onExpired = vi.fn()) => render(h(AdminPaidEventsScreen, { user: admin, onExpired }))
  function world(extra: Record<string, unknown> = {}) {
    const state = { events: [adminEvent()] as AdminEvent[] }
    serve({
      '/admin/events?queue=em_aprovacao': () => page(state.events),
      'POST /admin/events/5/decision': () => { state.events = []; return adminEvent() },
      ...extra,
    })
    return state
  }

  it('mostra o cartaz, os dados e o Pix informado, e aprova e publica', async () => {
    world()
    const tree = await mount()
    expect(allText(tree)).toContain('Liga Sul · ')
    expect(allText(tree)).toContain(brl(24000))
    await pressPrefix(tree, 'Copa Sudoeste.')
    const sheet = allText(tree)
    expect(sheet).toContain('Evento pago')
    expect(sheet).toContain('Enviado por Liga Sul há 5 horas')
    for (const term of ['Organizador', 'Inscrição', 'Inscrições até', 'Local', 'Vagas', 'Formato', 'Contato']) expect(sheet).toContain(term)
    expect(sheet).toContain('Arena Guará — Brasília · DF')
    expect(sheet).toContain('8 times')
    expect(sheet).toContain('Society 7×7 · Todos contra todos')
    expect(sheet).toContain('Pix informado')
    expect(sheet).toContain('Chave (E-mail)')
    expect(sheet).toContain('pagamentos@ligasul.com.br')
    expect(sheet).toContain('Informado')
    // O Copia e Cola abre sob demanda.
    expect(byId(tree, 'pix-code')).toHaveLength(0)
    await pressButton(tree, 'Ver o código Copia e Cola')
    expect(byId(tree, 'pix-code')).toHaveLength(1)
    await pressButton(tree, 'Ocultar o código Copia e Cola')
    expect(byId(tree, 'pix-code')).toHaveLength(0)
    await pressButton(tree, 'Aprovar e publicar')
    expect(bodyOf('POST', '/admin/events/5/decision')).toEqual({ decision: 'aprovar' })
    expect(toastText()).toContain('Copa Sudoeste foi aprovado e publicado.')
    expect(allText(tree)).toContain('Nada para aprovar')
  })

  it('recusa com motivo do contrato; "Outro" exige o detalhe', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Copa Sudoeste.')
    await pressButton(tree, 'Recusar')
    await pressButton(tree, 'Recusar evento')
    expect(allText(tree)).toContain('Escolha o motivo da recusa.')
    await pressButton(tree, 'Outro')
    await pressButton(tree, 'Recusar evento')
    expect(allText(tree)).toContain('Descreva o motivo da recusa.')
    expect(callsTo('POST', '/admin/events/5/decision')).toHaveLength(0)
    await pressButton(tree, 'Preço ou datas inconsistentes')
    await pressButton(tree, 'Recusar evento')
    expect(bodyOf('POST', '/admin/events/5/decision')).toEqual({ decision: 'recusar', reason_code: 'preco_ou_datas' })
    expect(toastText()).toContain('Copa Sudoeste voltou para rascunho com o motivo.')
  })

  it('recusa com detalhe e erro do servidor (data passada) na folha', async () => {
    world({ 'POST /admin/events/5/decision': new ApiError('As datas deste evento já passaram. Recuse para o organizador corrigir.', 409) })
    const tree = await mount()
    await pressPrefix(tree, 'Copa Sudoeste.')
    await pressButton(tree, 'Aprovar e publicar')
    expect(toastText()).toContain('As datas deste evento já passaram. Recuse para o organizador corrigir.')
    await pressButton(tree, 'Recusar')
    await pressButton(tree, 'Dados do Pix incompletos')
    await typeInto(tree, 'Detalhe para o organizador (opcional)', 'Falta o Copia e Cola')
    await pressButton(tree, 'Recusar evento')
    expect(lastBodyOf('POST', '/admin/events/5/decision')).toEqual({ decision: 'recusar', reason_code: 'pix_incompleto', reason_detail: 'Falta o Copia e Cola' })
  })

  it('fila vazia mostra a orientação', async () => {
    world({ '/admin/events?queue=em_aprovacao': () => page([]) })
    expect(allText(await mount())).toContain('Quando um organizador enviar um evento pago, ele aparece aqui e nas notificações.')
  })
})

describe('Organizador revogado (eventos)', () => {
  const revoked = adminEvent({
    state: 'publicado', phase: 'inscricoes_abertas', revocation_pending: true, revocation_decision: 'pendente', organizer: { organizer_id: null, display_name: 'Liga Sul', user: person(2, 'Rafa Nunes'), active: false },
    pending: { receipts: 1, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 1 }, entries_by_state: { confirmada: 2, em_analise: 1 },
  })
  const mount = () => render(h(AdminRevokedEventsScreen, { user: admin, onExpired: vi.fn() }))
  function world(event: AdminEvent = revoked, extra: Record<string, unknown> = {}) {
    serve({ '/admin/events?queue=revogacao': () => page([event]), 'POST /admin/events/5/revocation-decision': () => event, ...extra })
  }

  it('mostra o que está em jogo e segue com o evento', async () => {
    world()
    const tree = await mount()
    expect(allText(tree)).toContain('Liga Sul · 3 inscrições')
    expect(allText(tree)).toContain('1 pendência')
    await pressPrefix(tree, 'Copa Sudoeste.')
    const sheet = allText(tree)
    expect(sheet).toContain('Permissão revogada')
    expect(sheet).toContain('Inscrições suspensas até a decisão.')
    expect(sheet).toContain('2 · Confirmada')
    expect(sheet).toContain('1 · Comprovante em análise')
    expect(sheet).toContain('Pendências: 1 comprovante para analisar.')
    await pressButton(tree, 'Seguir evento')
    expect(allText(tree)).toContain('Seguir com o evento?')
    await pressButton(tree, 'Confirmar')
    expect(bodyOf('POST', '/admin/events/5/revocation-decision')).toEqual({ decision: 'seguir' })
    expect(toastText()).toContain('Copa Sudoeste segue com o organizador.')
  })

  it('cancela com motivo obrigatório e explica a devolução do evento pago', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Copa Sudoeste.')
    await pressButton(tree, 'Cancelar evento')
    expect(allText(tree)).toContain('3 inscrições pagas viram devolução pendente')
    await pressButton(tree, 'Cancelar evento')
    expect(allText(tree)).toContain('Descreva o motivo do cancelamento, de 5 a 500 caracteres.')
    expect(callsTo('POST', '/admin/events/5/revocation-decision')).toHaveLength(0)
    await typeInto(tree, 'Motivo do cancelamento (aparece aos inscritos)', '  Organizador revogado  ')
    await pressButton(tree, 'Cancelar evento')
    expect(bodyOf('POST', '/admin/events/5/revocation-decision')).toEqual({ decision: 'cancelar', reason: 'Organizador revogado' })
    expect(toastText()).toContain('Copa Sudoeste foi cancelado. O organizador envia as devoluções.')
  })

  it('evento gratuito: o aviso diz que os inscritos foram avisados; voltar e erros', async () => {
    world({ ...revoked, price_cents: 0, entries_by_state: {}, pending: { receipts: 0, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 0 } },
      { 'POST /admin/events/5/revocation-decision': new ApiError('Este evento não aguarda decisão da administração.', 409) })
    const tree = await mount()
    await pressPrefix(tree, 'Copa Sudoeste.')
    expect(allText(tree)).toContain('Nenhuma inscrição ainda.')
    await pressButton(tree, 'Seguir evento')
    await pressButton(tree, 'Voltar')
    expect(findButton(tree, 'Seguir evento')).toBeTruthy()
    await pressButton(tree, 'Cancelar evento')
    expect(allText(tree)).toContain('Os inscritos recebem o aviso de cancelamento com o motivo.')
    await typeInto(tree, 'Motivo do cancelamento (aparece aos inscritos)', 'Sem organizador')
    await pressButton(tree, 'Cancelar evento')
    expect(toastText()).toContain('Este evento não aguarda decisão da administração.')
  })

  it('fila vazia mostra a orientação', async () => {
    serve({ '/admin/events?queue=revogacao': () => page([]) })
    expect(allText(await mount())).toContain('Quando um organizador com eventos abertos for revogado, os eventos aparecem aqui.')
  })
})

describe('Devoluções contestadas (administração)', () => {
  const mount = (onExpired = vi.fn()) => render(h(AdminRefundDisputesScreen, { user: admin, onExpired }))
  const paymentBefore = receipt({ id: 70, decision: 'aprovado', decided_at: inHours(-30), created_at: inHours(-40) })
  function world(extra: Record<string, unknown> = {}) {
    const state = { items: [dispute()] }
    serve({
      '/admin/refund-disputes': () => page(state.items),
      '/entries/14/receipts': () => ({ items: [paymentBefore, dispute().entry.refund!] }),
      'POST /admin/entries/14/refund-decision': () => { state.items = []; return dispute() },
      ...extra,
    })
    return state
  }

  it('mostra os dois lados e o histórico, e considera a devolução feita com motivo', async () => {
    world()
    const tree = await mount()
    expect(allText(tree)).toContain(`Copa Sudoeste · ${brl(24000)} · contestada há 2 horas`)
    await pressPrefix(tree, 'Ferrugem FC.')
    const sheet = allText(tree)
    expect(sheet).toContain('Devolução contestada')
    expect(sheet).toContain('Participante')
    expect(sheet).toContain('Organizador')
    expect(sheet).toContain('Rafa Nunes')
    expect(sheet).toContain('Comprovante da devolução')
    expect(sheet).toContain('Motivo do participante')
    expect(sheet).toContain('O valor que voltou é menor que o pago.')
    expect(sheet).toContain('Pagamento aprovado')
    // O comprovante contestado já aparece acima: não se repete no histórico.
    expect(sheet.match(/Devolução contestada/g)).toHaveLength(1)
    expect(callsTo('GET', '/entries/14/receipts')).toHaveLength(1)
    expect(byId(tree, 'receipt-image').length).toBeGreaterThan(0)
    await pressButton(tree, 'Devolução feita')
    // Motivo curto demais.
    await typeInto(tree, 'Motivo da decisão (o organizador e o participante veem)', 'ok')
    await pressButton(tree, 'Registrar decisão')
    expect(allText(tree)).toContain('Descreva a decisão, de 5 a 500 caracteres.')
    expect(callsTo('POST', '/admin/entries/14/refund-decision')).toHaveLength(0)
    await typeInto(tree, 'Motivo da decisão (o organizador e o participante veem)', '  Comprovante confere  ')
    await pressButton(tree, 'Registrar decisão')
    expect(bodyOf('POST', '/admin/entries/14/refund-decision')).toEqual({ decision: 'devolvida', reason: 'Comprovante confere' })
    expect(toastText()).toContain('Devolução de Ferrugem FC considerada feita.')
    expect(allText(tree)).toContain('Nenhuma devolução contestada')
  })

  it('pede outro comprovante: a decisão é "pendente"', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Ferrugem FC.')
    await pressButton(tree, 'Pedir outro')
    expect(allText(tree)).toContain('A inscrição volta para "Devolução pendente" e o organizador envia outro comprovante.')
    await typeInto(tree, 'Motivo da decisão (o organizador e o participante veem)', 'O valor não confere com o pago')
    await pressButton(tree, 'Registrar decisão')
    expect(bodyOf('POST', '/admin/entries/14/refund-decision')).toEqual({ decision: 'pendente', reason: 'O valor não confere com o pago' })
    expect(toastText()).toContain('Rafa Nunes vai enviar outro comprovante para Ferrugem FC.')
  })

  it('erros: decisão recusada pelo servidor, histórico indisponível e comprovante ausente', async () => {
    const expired = vi.fn()
    const noRefund = dispute({ entry: entry({ id: 14, state: 'devolucao_contestada', refund: null }) })
    world({
      '/admin/refund-disputes': () => page([noRefund]),
      '/entries/14/receipts': new ApiError('Histórico indisponível.', 500),
      'POST /admin/entries/14/refund-decision': new ApiError('Esta devolução não está contestada.', 409),
    })
    const tree = await mount(expired)
    await pressPrefix(tree, 'Ferrugem FC.')
    const sheet = allText(tree)
    expect(sheet).toContain('Comprovante indisponível.')
    expect(sheet).toContain('Sem motivo informado.')
    expect(sheet).toContain('Histórico indisponível.')
    await pressButton(tree, 'Devolução feita')
    await typeInto(tree, 'Motivo da decisão (o organizador e o participante veem)', 'Comprovante confere')
    await pressButton(tree, 'Registrar decisão')
    expect(allText(tree)).toContain('Esta devolução não está contestada.')
    await pressButton(tree, 'Voltar')
    expect(findButton(tree, 'Devolução feita')).toBeTruthy()
    expect(expired).not.toHaveBeenCalled()
  })

  it('histórico sem outros envios', async () => {
    world({ '/entries/14/receipts': () => ({ items: [dispute().entry.refund!] }) })
    const tree = await mount()
    await pressPrefix(tree, 'Ferrugem FC.')
    expect(allText(tree)).toContain('Nenhum outro envio.')
  })
})

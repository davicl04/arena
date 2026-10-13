import React from 'react'
import type { ReactTestRenderer } from 'react-test-renderer'
import { act } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/api/client'
import type { OrganizerEntry } from '../src/api/events'
import { entryInfo } from '../src/components/organizer/EventEntries'
import EventManageScreen from '../src/screens/EventManageScreen'
import { byLabel, enableAct, press, textOf, type } from './support/native'
import { calls, card, checklistItems, detail, draftDetail, mount, navigationMock, noPending, page, routeRequest } from './support/organizer'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
const EVENT = '/organizer/events/5'
const MESSAGES = '/events/5/messages'
const ENTRIES = '/organizer/events/5/entries'
const onExpired = vi.fn()
let navigation = navigationMock()

const screen = () => mount(h(EventManageScreen, { navigation: navigation as never, onExpired, params: { eventId: 5 }, title: 'Gestão do evento' } as never))
const pressable = (tree: ReactTestRenderer, prefix: string) => tree.root.findAllByType('Pressable' as never).find(entry => String(entry.props.accessibilityLabel ?? '').startsWith(prefix))
const pressPrefix = async (tree: ReactTestRenderer, prefix: string) => {
  const target = pressable(tree, prefix)
  expect(target, `Pressable "${prefix}…"`).toBeTruthy()
  await act(async () => { target!.props.onPress() })
}
const state = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('Pressable' as never).filter(entry => entry.props.accessibilityLabel === label).pop()!.props.accessibilityState
const paid = { price_cents: 5000, pix: { beneficiary: 'Liga Candanga', key_type: 'email' as const, key: 'pix@liga.com', copy_paste: '000201', instructions: 'Envie o comprovante' } }
const receipt = { id: 1, created_at: new Date(Date.now() - 3 * 3_600_000).toISOString() }
const entry = (over: Record<string, unknown> = {}) => ({
  id: 1, subject: { kind: 'time', team: { id: 1, name: 'Leões FC', initials: 'LF', crest_url: null }, athlete: null }, state: 'em_analise', price_cents: 5000, reserved_until: null,
  created_at: new Date(Date.now() - 5 * 3_600_000).toISOString(), confirmed_at: null, registered_by: null, latest_payment: receipt, refund: null, ...over,
})
const message = (over: Record<string, unknown> = {}) => ({ id: 1, kind: 'aviso', body: 'Primeira rodada às 9h.', author: { id: 1, name: 'Rafa Nunes', username: 'rafa', avatar_url: null }, created_at: new Date(Date.now() - 2 * 3_600_000).toISOString(), ...over })

beforeEach(() => {
  enableAct()
  onExpired.mockClear()
  navigation = navigationMock()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('token')
})

describe('Gestão do evento (G3): cartaz, "Agora" e seções', () => {
  it('evento publicado: cartaz hero, "Agora" com Ver inscritos e as seções, com tabela e partidas apagadas até o sorteio', async () => {
    routeRequest({ [EVENT]: detail(), [MESSAGES]: page([]), [ENTRIES]: page([entry({ state: 'confirmada', confirmed_at: new Date().toISOString() }), entry({ id: 2, subject: { kind: 'time', team: { id: 2, name: 'Tigres', initials: 'TG', crest_url: null }, athlete: null }, state: 'reservada', reserved_until: new Date(Date.now() + 86_400_000).toISOString() })]) })
    const tree = await screen()
    const text = textOf(tree)
    // A placa traz a própria barra (o shell não desenha o cabeçalho): "Gestão do evento" e o Voltar.
    expect(text).toContain('Gestão do evento')
    await press(tree, 'Voltar')
    expect(navigation.back).toHaveBeenCalledOnce()
    expect(text).toContain('Copa Sudoeste')
    expect(text).toContain('AGORA')
    expect(text).toContain('Inscrições abertas até')
    expect(text).toContain('3 de 8 times.')
    expect(byLabel(tree, 'Agora: Inscrições abertas até seg, 9 nov · 23:59').length + tree.root.findAll(node => node.props.testID === 'next-action').length).toBeGreaterThan(0)
    expect(pressable(tree, 'Times inscritos, 3 de 8 times · 2 confirmados')).toBeTruthy()
    expect(pressable(tree, 'Comprovantes')).toBeUndefined()
    // Sem o contador do campeonato (o fixture não o traz), as seções do campeonato aparecem apagadas, sem ação, com o aviso honesto.
    for (const title of ['Tabela', 'Partidas']) {
      const later = tree.root.findAll(node => typeof node.type === 'string' && String(node.props.accessibilityLabel ?? '').startsWith(`${title}, `))[0]
      expect(later.props.accessibilityLabel).toContain('Depois das inscrições')
      expect(later.props.accessibilityState).toMatchObject({ disabled: true })
      expect(pressable(tree, `${title}, `)).toBeUndefined()
    }
    expect(text).not.toContain('Chaveamento')
    await press(tree, 'Ver inscritos')
    expect(textOf(tree)).toContain('Leões FC')
    expect(textOf(tree)).toContain('Tigres')
    expect(textOf(tree)).toContain('Confirmada')
    expect(textOf(tree)).toContain('Vaga reservada')
    expect(pressable(tree, 'Times inscritos')!.props.accessibilityState).toMatchObject({ expanded: true })
    await pressPrefix(tree, 'Times inscritos')
    expect(textOf(tree)).not.toContain('Leões FC')
  })

  it('eliminação simples chama a seção de Chaveamento; corrida, de Resultados', async () => {
    routeRequest({ [EVENT]: detail({ competition_type: 'eliminacao_simples', capacity: 8 }), [MESSAGES]: page([]) })
    expect(textOf(await screen())).toContain('Chaveamento')
    routeRequest({ [EVENT]: detail({ sport: 'corrida', format: null, competition_type: null, distance_km: 10, capacity: 100 }), [MESSAGES]: page([]) })
    const run = await screen()
    expect(textOf(run)).toContain('Resultados')
    expect(textOf(run)).not.toContain('Partidas')
  })

  it('entra com inscritos de atletas e lista vazia quando ninguém se inscreveu', async () => {
    routeRequest({ [EVENT]: detail({ sport: 'tenis', format: null, entries_count: 0, confirmed_count: 0 }), [MESSAGES]: page([]), [ENTRIES]: page([]) })
    const tree = await screen()
    await pressPrefix(tree, 'Inscritos')
    expect(textOf(tree)).toContain('Nenhuma inscrição ainda.')
    routeRequest({
      [EVENT]: detail({ sport: 'tenis', format: null }), [MESSAGES]: page([]),
      [ENTRIES]: page([entry({ subject: { kind: 'atleta', team: null, athlete: { id: 9, name: 'Ana Souza', username: 'ana', avatar_url: null } }, state: 'rejeitada', reserved_until: new Date(Date.now() + 3_600_000).toISOString() })]),
    })
    const withAthlete = await screen()
    await pressPrefix(withAthlete, 'Inscritos')
    expect(textOf(withAthlete)).toContain('Ana Souza')
    expect(textOf(withAthlete)).toContain('Comprovante recusado')
    expect(textOf(withAthlete)).toContain('Pode enviar outro até')
  })

  it('rascunho incompleto: checklist com o que falta, "Publicar" bloqueado e "Preencher" no passo certo', async () => {
    routeRequest({ [EVENT]: draftDetail() })
    const tree = await screen()
    const text = textOf(tree)
    expect(text).toContain('Complete o rascunho')
    expect(text).toContain('Faltam 3 itens para publicar.')
    expect(byLabel(tree, 'Checklist do rascunho')).toHaveLength(1)
    expect(byLabel(tree, 'Nome e modalidade: completo').length).toBeGreaterThan(0)
    expect(byLabel(tree, 'Datas: falta').length).toBeGreaterThan(0)
    expect(text).toContain('Escolha as datas.')
    expect(state(tree, 'Publicar')).toMatchObject({ disabled: true })
    expect(tree.root.findAllByType('Pressable' as never).find(entry => entry.props.accessibilityLabel === 'Publicar')!.props.disabled).toBe(true)
    expect(text).toContain('Complete os itens que faltam para liberar.')
    expect(calls('POST', `${EVENT}/submit`)).toHaveLength(0)
    expect(byLabel(tree, 'Preencher nome e modalidade')).toHaveLength(0)
    await press(tree, 'Preencher datas')
    expect(navigation.go).toHaveBeenLastCalledWith('event-wizard', { eventId: 5, step: 3 })
    await press(tree, 'Preencher inscrição e pix')
    expect(navigation.go).toHaveBeenLastCalledWith('event-wizard', { eventId: 5, step: 4 })
    // Antes de publicar não há lista de inscritos nem canal de avisos.
    expect(textOf(tree)).toContain('depois de publicar')
    expect(pressable(tree, 'Times inscritos')).toBeUndefined()
    expect(textOf(tree)).not.toContain('Avisos do evento')
    expect(textOf(tree)).toContain('Faltam 3 itens do checklist')
  })

  it('falta um item só: usa o singular', async () => {
    routeRequest({ [EVENT]: draftDetail({ checklist: checklistItems(['nome_modalidade', 'formato_tipo', 'vagas_elos', 'datas', 'local']) }) })
    expect(textOf(await screen())).toContain('Falta 1 item para publicar.')
  })

  it('rascunho completo: "Pronto para publicar" libera o botão e a publicação abre as inscrições', async () => {
    const ready = draftDetail({ checklist: checklistItems(['nome_modalidade', 'formato_tipo', 'vagas_elos', 'datas', 'local', 'inscricao']), can_submit: true, price_cents: 0, next_action: { kind: 'publicar', count: null, deadline: null } })
    routeRequest({ [EVENT]: ready, [`POST ${EVENT}/submit`]: detail(), [MESSAGES]: page([]) })
    const tree = await screen()
    expect(textOf(tree)).toContain('Pronto para publicar')
    expect(textOf(tree)).toContain('Todos os itens do checklist estão completos.')
    expect(state(tree, 'Publicar')).toMatchObject({ disabled: false })
    await press(tree, 'Revisar dados')
    expect(navigation.go).toHaveBeenLastCalledWith('event-wizard', { eventId: 5 })
    await press(tree, 'Publicar')
    expect(calls('POST', `${EVENT}/submit`)[0][2]).toEqual({})
    expect(textOf(tree)).toContain('Evento publicado: as inscrições estão abertas.')
    expect(textOf(tree)).toContain('Inscrições abertas até')
    expect(textOf(tree)).toContain('Avisos do evento')
  })

  it('evento pago vai para a aprovação e pode ser retirado dela para editar', async () => {
    const ready = draftDetail({ ...paid, checklist: checklistItems(['nome_modalidade', 'formato_tipo', 'vagas_elos', 'datas', 'local', 'inscricao']), can_submit: true, next_action: { kind: 'publicar', count: null, deadline: null } })
    const waiting = detail({ ...paid, state: 'em_aprovacao', phase: 'em_aprovacao', submitted_at: '2026-10-12T12:00:00.000Z', next_action: { kind: 'aguardar_aprovacao', count: null, deadline: null }, editable_fields: [] })
    routeRequest({ [EVENT]: ready, [`POST ${EVENT}/submit`]: waiting, [`POST ${EVENT}/withdraw`]: ready })
    const tree = await screen()
    expect(textOf(tree)).toContain('Pronto para enviar à aprovação')
    await press(tree, 'Enviar para aprovação')
    expect(textOf(tree)).toContain('Enviado para aprovação. Você recebe a resposta nas notificações.')
    expect(textOf(tree)).toContain('Em aprovação pela administração')
    expect(textOf(tree)).toContain('Para editar, retire da aprovação.')
    await pressPrefix(tree, 'Dados do evento')
    expect(textOf(tree)).toContain('Para editar, retire o evento da aprovação.')
    await press(tree, 'Retirar da aprovação')
    expect(calls('POST', `${EVENT}/withdraw`)[0][2]).toEqual({})
    expect(textOf(tree)).toContain('Evento retirado da aprovação. Edite e envie de novo quando quiser.')
    expect(textOf(tree)).toContain('Pronto para enviar à aprovação')
  })

  it('erro ao publicar mostra a mensagem do servidor e relê o evento', async () => {
    const ready = draftDetail({ can_submit: true, next_action: { kind: 'publicar', count: null, deadline: null } })
    routeRequest({ [EVENT]: ready, [`POST ${EVENT}/submit`]: () => { throw new ApiError('Complete o rascunho para publicar.', 422, [{ field: 'datas', message: 'Escolha as datas.' }]) } })
    const tree = await screen()
    await press(tree, 'Publicar')
    expect(textOf(tree)).toContain('Complete o rascunho para publicar.')
    expect(calls('GET', EVENT).length).toBeGreaterThanOrEqual(2)
    routeRequest({ [EVENT]: ready, [`POST ${EVENT}/submit`]: () => { throw new ApiError('Sessão expirada', 401) } })
    const expired = await screen()
    await press(expired, 'Publicar')
    expect(onExpired).toHaveBeenCalled()
  })

  it('recusado pela administração: mostra o motivo e leva a corrigir no assistente', async () => {
    const refused = draftDetail({ ...paid, next_action: { kind: 'corrigir_recusa', count: null, deadline: null }, refusal: { reason_code: 'pix_incompleto', reason_detail: 'Falta o favorecido', reviewed_at: '2026-10-11T12:00:00.000Z' } })
    routeRequest({ [EVENT]: refused })
    const tree = await screen()
    expect(textOf(tree)).toContain('Recusado pela administração')
    expect(textOf(tree)).toContain('Motivo: Dados do Pix incompletos · Falta o favorecido.')
    await press(tree, 'Corrigir e reenviar')
    expect(navigation.go).toHaveBeenLastCalledWith('event-wizard', { eventId: 5 })
  })

  it('revogação pendente: a administração decide, a gestão é só leitura e o canal não aceita avisos', async () => {
    routeRequest({ [EVENT]: detail({ revocation_pending: true, revocation_decision: 'pendente', editable_fields: [], next_action: { kind: 'aguardar_revogacao', count: null, deadline: null } }), [MESSAGES]: page([]) })
    const tree = await screen()
    expect(textOf(tree)).toContain('A administração decide se o evento segue')
    expect(textOf(tree)).toContain('Inscrições suspensas')
    expect(byLabel(tree, 'Novo aviso')).toHaveLength(0)
    expect(byLabel(tree, 'Cancelar evento')).toHaveLength(0)
  })
})

describe('Gestão do evento (G3): comprovantes, devoluções, dados e Pix', () => {
  const pending = { receipts: 2, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 2 }

  it('evento pago com comprovantes: "Agora" e a seção levam à tela de comprovantes', async () => {
    routeRequest({ [EVENT]: detail({ ...paid, pending, next_action: { kind: 'analisar_comprovantes', count: 2, deadline: null } }), [MESSAGES]: page([]) })
    const tree = await screen()
    expect(textOf(tree)).toContain('2 comprovantes para analisar')
    await press(tree, 'Analisar comprovantes')
    expect(navigation.go).toHaveBeenLastCalledWith('event-receipts', { eventId: 5 })
    await pressPrefix(tree, 'Comprovantes, 2 comprovantes para analisar')
    expect(navigation.go).toHaveBeenCalledTimes(2)
    expect(textOf(tree)).toContain('Inscrições fecham')
  })

  it('devoluções (evento cancelado): linha com os números e a ação de enviar ou acompanhar', async () => {
    const refunds = { receipts: 0, refunds_to_send: 2, refunds_awaiting: 1, refund_disputes: 1, total: 2 }
    routeRequest({
      [EVENT]: detail({ ...paid, state: 'cancelado', phase: 'cancelado', cancelled_at: '2026-10-12T12:00:00.000Z', cancel_reason: 'Quadra interditada', pending: refunds, editable_fields: [], next_action: { kind: 'enviar_devolucoes', count: 2, deadline: null } }),
      [MESSAGES]: page([message({ id: 7, kind: 'evento_cancelado', author: null, body: 'Evento cancelado: Quadra interditada' })]),
    })
    const tree = await screen()
    expect(textOf(tree)).toContain('2 devoluções para enviar')
    await pressPrefix(tree, 'Devoluções, 2 para enviar · 1 aguardando · 1 contestadas')
    expect(navigation.go).toHaveBeenLastCalledWith('event-receipts', { eventId: 5 })
    await press(tree, 'Enviar devoluções')
    expect(navigation.go).toHaveBeenCalledTimes(2)
    // O canal mostra o aviso automático do cancelamento em destaque.
    const cancelled = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'notice-evento_cancelado')
    expect(cancelled).toHaveLength(1)
    expect(textOf(tree)).toContain('Evento cancelado: Quadra interditada')
    expect(cancelled[0].props.accessibilityLabel).toContain('Aviso automático')
    expect(byLabel(tree, 'Cancelar evento')).toHaveLength(0)
  })

  it('aguardar devoluções e evento cancelado sem pendências', async () => {
    const awaiting = { receipts: 0, refunds_to_send: 0, refunds_awaiting: 3, refund_disputes: 0, total: 0 }
    routeRequest({ [EVENT]: detail({ state: 'cancelado', phase: 'cancelado', pending: awaiting, editable_fields: [], next_action: { kind: 'aguardar_devolucoes', count: 3, deadline: null } }), [MESSAGES]: page([]) })
    const tree = await screen()
    expect(textOf(tree)).toContain('3 devoluções aguardando os participantes')
    await press(tree, 'Ver devoluções')
    expect(navigation.go).toHaveBeenLastCalledWith('event-receipts', { eventId: 5 })
    routeRequest({ [EVENT]: detail({ state: 'cancelado', phase: 'cancelado', cancel_reason: 'Chuva forte', editable_fields: [], next_action: { kind: 'nenhuma', count: null, deadline: null } }), [MESSAGES]: page([]) })
    const done = await screen()
    expect(textOf(done)).toContain('Evento cancelado')
    expect(textOf(done)).toContain('Motivo: Chuva forte')
    await pressPrefix(done, 'Dados do evento')
    expect(textOf(done)).toContain('Este evento não pode mais ser editado.')
  })

  it('outros estados de "Agora": inscrições encerradas, em andamento, encerrado e nada pendente', async () => {
    routeRequest({ [EVENT]: detail({ phase: 'inscricoes_encerradas', next_action: { kind: 'aguardar_inicio', count: null, deadline: '2026-11-15T12:00:00.000Z' } }), [MESSAGES]: page([]) })
    const closed = await screen()
    expect(textOf(closed)).toContain('Inscrições encerradas · começa')
    expect(textOf(closed)).toContain('Com pelo menos 2 inscrições confirmadas, você pode sortear o chaveamento.')
    routeRequest({ [EVENT]: detail({ state: 'em_andamento', phase: 'em_andamento', next_action: { kind: 'nenhuma', count: null, deadline: null } }), [MESSAGES]: page([]) })
    expect(textOf(await screen())).toContain('Evento em andamento')
    routeRequest({ [EVENT]: detail({ state: 'encerrado', phase: 'encerrado', editable_fields: [], next_action: { kind: 'nenhuma', count: null, deadline: null } }), [MESSAGES]: page([]) })
    expect(textOf(await screen())).toContain('Evento encerrado')
    routeRequest({ [EVENT]: detail({ state: 'cancelado', phase: 'cancelado', cancel_reason: null, editable_fields: [], next_action: { kind: 'nenhuma', count: null, deadline: null } }), [MESSAGES]: page([]) })
    expect(textOf(await screen())).toContain('Os inscritos foram avisados.')
    routeRequest({ [EVENT]: detail({ state: 'publicado', next_action: { kind: 'nenhuma', count: null, deadline: null } }), [MESSAGES]: page([]) })
    expect(textOf(await screen())).toContain('Nada pendente')
  })

  it('Dados do evento e Pagamento e Pix abrem na própria gestão, com a chave selecionável', async () => {
    routeRequest({ [EVENT]: detail({ ...paid, contact: 'copa@example.com', accepted_tiers: ['ouro', 'diamante'], registration_deadline: '2026-11-14T23:59:00.000Z', tennis_bonus: { champion: 30, runner_up: 20, semifinalist: 10, min_entries: 4, applies: true } }), [MESSAGES]: page([]) })
    const tree = await screen()
    await pressPrefix(tree, 'Dados do evento')
    const text = textOf(tree)
    for (const expected of ['Futebol · Society 7×7 · Todos contra todos', '8 times', 'Ouro, Diamante', 'Arena Sudoeste', 'Brasília · DF', 'R$ 50,00', 'copa@example.com', 'Fecham de fato', '(12 h antes, por ser pago)'])
      expect(text).toContain(expected)
    expect(text).toContain('Bônus do ranking do tênis (RN16): campeão +30, vice +20 e semifinalistas +10, com pelo menos 4 inscritos (já vale).')
    await pressPrefix(tree, 'Pagamento e Pix')
    expect(textOf(tree)).toContain('Liga Candanga')
    expect(textOf(tree)).toContain('E-mail')
    expect(textOf(tree)).toContain('pix@liga.com')
    expect(textOf(tree)).toContain('Cadastrado')
    expect(textOf(tree)).toContain('Envie o comprovante')
    const key = tree.root.findAllByType('Text' as never).find(entry => entry.props.children === 'pix@liga.com')!
    expect(key.props.selectable).toBe(true)
  })

  it('evento gratuito e rascunho sem preço explicam o Pix; rascunho edita no assistente', async () => {
    routeRequest({ [EVENT]: detail({ price_cents: 0 }), [MESSAGES]: page([]) })
    const free = await screen()
    await pressPrefix(free, 'Pagamento e Pix')
    expect(textOf(free)).toContain('Evento gratuito: sem Pix e sem comprovantes.')
    routeRequest({ [EVENT]: draftDetail({ price_cents: null, checklist: checklistItems([]), venue: null, city: null, capacity: null, starts_at: null, registration_closes_at: null }) })
    const draft = await screen()
    await pressPrefix(draft, 'Pagamento e Pix')
    expect(textOf(draft)).toContain('Escolha no assistente se a inscrição é gratuita ou paga.')
    await press(draft, 'Editar inscrição e Pix')
    expect(navigation.go).toHaveBeenLastCalledWith('event-wizard', { eventId: 5, step: 4 })
    await pressPrefix(draft, 'Dados do evento')
    expect(textOf(draft)).toContain('—')
    await press(draft, 'Editar no assistente')
    expect(navigation.go).toHaveBeenLastCalledWith('event-wizard', { eventId: 5 })
  })

  it('falha ao carregar o evento mostra o erro e tenta de novo; 401 expira a sessão', async () => {
    routeRequest({ [EVENT]: () => { throw new ApiError('Evento não encontrado.', 404) } })
    const tree = await screen()
    expect(textOf(tree)).toContain('Evento não encontrado.')
    routeRequest({ [EVENT]: detail(), [MESSAGES]: page([]) })
    await press(tree, 'Tentar novamente')
    expect(textOf(tree)).toContain('Copa Sudoeste')
    routeRequest({ [EVENT]: () => { throw new ApiError('Sessão expirada', 401) } })
    await screen()
    expect(onExpired).toHaveBeenCalled()
  })
})

describe('Gestão do evento (G3): cancelar, excluir e editar', () => {
  const fullPaid = detail({ ...paid, entries_by_state: { confirmada: 2, em_analise: 1, reservada: 3 } })
  const cancelledDetail = detail({ ...paid, state: 'cancelado', phase: 'cancelado', cancelled_at: '2026-10-12T12:00:00.000Z', cancel_reason: 'Quadra interditada', editable_fields: [], next_action: { kind: 'enviar_devolucoes', count: 3, deadline: null }, pending: { receipts: 0, refunds_to_send: 3, refunds_awaiting: 0, refund_disputes: 0, total: 3 } })

  it('cancelar evento pago: avisa da devolução, pede o motivo, confirma e atualiza a gestão', async () => {
    routeRequest({ [EVENT]: fullPaid, [MESSAGES]: page([]), [`POST ${EVENT}/cancel`]: cancelledDetail })
    const tree = await screen()
    expect(textOf(tree)).toContain('As inscrições pagas viram “Devolução pendente”')
    await press(tree, 'Cancelar evento')
    const sheet = textOf(tree)
    expect(sheet).toContain('viram Devolução pendente')
    expect(sheet).toContain('3 inscrições vão para Devolução pendente.')
    expect(sheet).toContain('3 inscrições são canceladas.')
    expect(sheet).toContain('Todos os inscritos recebem o aviso no canal do evento e nas notificações.')
    await press(tree, 'Continuar')
    expect(textOf(tree)).toContain('Descreva o motivo do cancelamento.')
    await type(tree, 'Motivo do cancelamento', 'Chuva')
    await type(tree, 'Motivo do cancelamento', 'x')
    await press(tree, 'Continuar')
    expect(textOf(tree)).toContain('Descreva o motivo do cancelamento.')
    await type(tree, 'Motivo do cancelamento', '  Quadra interditada pela prefeitura  ')
    await press(tree, 'Continuar')
    expect(textOf(tree)).toContain('Cancelar Copa Sudoeste?')
    expect(textOf(tree)).toContain('Motivo: “Quadra interditada pela prefeitura”')
    expect(calls('POST', `${EVENT}/cancel`)).toHaveLength(0)
    await press(tree, 'Voltar')
    expect(byLabel(tree, 'Motivo do cancelamento').length).toBeGreaterThan(0)
    await press(tree, 'Continuar')
    await press(tree, 'Cancelar evento')
    expect(calls('POST', `${EVENT}/cancel`)[0][2]).toEqual({ reason: 'Quadra interditada pela prefeitura' })
    expect(textOf(tree)).toContain('Evento cancelado. Os inscritos foram avisados no canal e nas notificações.')
    expect(textOf(tree)).toContain('3 devoluções para enviar')
    expect(byLabel(tree, 'Motivo do cancelamento')).toHaveLength(0)
  })

  it('cancelar evento gratuito: sem devolução; erro do servidor fica na folha', async () => {
    routeRequest({
      [EVENT]: detail({ entries_by_state: { confirmada: 2, reservada: 1 } }), [MESSAGES]: page([]),
      [`POST ${EVENT}/cancel`]: () => { throw new ApiError('Só eventos publicados ou em andamento podem ser cancelados.', 409) },
    })
    const tree = await screen()
    expect(textOf(tree)).toContain('As inscrições são canceladas e os inscritos, avisados.')
    await press(tree, 'Cancelar evento')
    expect(textOf(tree)).toContain('Evento gratuito não tem devolução.')
    expect(textOf(tree)).not.toContain('viram Devolução pendente')
    await type(tree, 'Motivo do cancelamento', 'Chuva forte na região')
    await press(tree, 'Continuar')
    await press(tree, 'Cancelar evento')
    expect(textOf(tree)).toContain('Só eventos publicados ou em andamento podem ser cancelados.')
    expect(textOf(tree)).toContain('Cancelar Copa Sudoeste?')
  })

  it('excluir rascunho confirma e volta; erro mantém a folha', async () => {
    routeRequest({ [EVENT]: draftDetail(), [`DELETE ${EVENT}`]: undefined })
    const tree = await screen()
    await press(tree, 'Excluir rascunho')
    expect(textOf(tree)).toContain('Excluir o rascunho “Copa Sudoeste”?')
    await press(tree, 'Manter rascunho')
    expect(textOf(tree)).not.toContain('Excluir o rascunho “Copa Sudoeste”?')
    await press(tree, 'Excluir rascunho')
    await press(tree, 'Excluir rascunho')
    expect(calls('DELETE', EVENT)).toHaveLength(1)
    expect(navigation.back).toHaveBeenCalledTimes(1)
    routeRequest({ [EVENT]: draftDetail(), [`DELETE ${EVENT}`]: () => { throw new ApiError('Só rascunhos podem ser excluídos.', 409) } })
    const failing = await screen()
    await press(failing, 'Excluir rascunho')
    await press(failing, 'Excluir rascunho')
    expect(textOf(failing)).toContain('Só rascunhos podem ser excluídos.')
    expect(navigation.back).toHaveBeenCalledTimes(1)
  })

  it('evento publicado: edita só local e contato, com validação e erro do servidor no campo', async () => {
    const updated = detail({ venue: 'Nova Arena', contact: null })
    routeRequest({ [EVENT]: detail(), [MESSAGES]: page([]), [`PATCH ${EVENT}`]: updated })
    const tree = await screen()
    await press(tree, 'Dados do evento, Modalidade, datas, local e elos')
    await press(tree, 'Editar local e contato')
    expect(byLabel(tree, 'Local').length).toBeGreaterThan(0)
    expect(byLabel(tree, 'Contato para dúvidas (opcional)').length).toBeGreaterThan(0)
    expect(byLabel(tree, 'Instruções do Pix (opcional)')).toHaveLength(0)
    await type(tree, 'Local', 'A')
    await press(tree, 'Salvar')
    expect(textOf(tree)).toContain('Informe o local com 2 a 120 caracteres.')
    await type(tree, 'Local', 'Nova Arena')
    await type(tree, 'Contato para dúvidas (opcional)', '')
    await press(tree, 'Salvar')
    expect(calls('PATCH', EVENT)[0][2]).toEqual({ venue: 'Nova Arena', contact: null })
    expect(textOf(tree)).toContain('Dados do evento salvos.')
    expect(byLabel(tree, 'Local')).toHaveLength(0)
  })

  it('edição publicada: erro 422 por campo, erro geral e instruções do Pix nos pagos', async () => {
    routeRequest({
      [EVENT]: detail(paid), [MESSAGES]: page([]),
      [`PATCH ${EVENT}`]: () => { throw new ApiError('Revise os campos informados.', 422, [{ field: 'pix_instructions', message: 'Value error, Use até 500 caracteres.' }, { field: 'outro', message: 'Ignorado.' }]) },
    })
    const tree = await screen()
    await press(tree, 'Dados do evento, Modalidade, datas, local e elos')
    await press(tree, 'Editar local e contato')
    expect(byLabel(tree, 'Instruções do Pix (opcional)').length).toBeGreaterThan(0)
    await type(tree, 'Instruções do Pix (opcional)', 'Envie até as 18h')
    await press(tree, 'Salvar')
    expect(textOf(tree)).toContain('Use até 500 caracteres.')
    expect(textOf(tree)).toContain('Revise os campos informados.')
    expect(textOf(tree)).not.toContain('Ignorado.')
    expect(calls('PATCH', EVENT)[0][2]).toEqual({ pix_instructions: 'Envie até as 18h' })
  })

  it('só a corrida tem o campo de percurso na edição publicada; sem mudanças a folha só fecha', async () => {
    routeRequest({ [EVENT]: detail({ sport: 'corrida', format: null, competition_type: null, distance_km: 10, course_notes: 'Largada na praça' }), [MESSAGES]: page([]) })
    const tree = await screen()
    await press(tree, 'Dados do evento, Modalidade, datas, local e elos')
    await press(tree, 'Editar local e contato')
    expect(byLabel(tree, 'Percurso (opcional)').length).toBeGreaterThan(0)
    await press(tree, 'Salvar')
    expect(calls('PATCH', EVENT)).toHaveLength(0)
    expect(byLabel(tree, 'Percurso (opcional)')).toHaveLength(0)
  })
})

describe('Gestão do evento (G3): canal de avisos', () => {
  const published = () => detail({ ...card() })

  it('lê os avisos do mais recente ao mais antigo, com o cancelamento em destaque', async () => {
    routeRequest({
      [EVENT]: published(),
      [MESSAGES]: page([message({ id: 3, kind: 'evento_cancelado', author: null, body: 'Evento cancelado: chuva.' }), message({ id: 2, body: 'Trazer documento.' })], 'm2'),
      [`${MESSAGES}?cursor=m2`]: page([message({ id: 1, body: 'Bem-vindos!' })]),
    })
    const tree = await screen()
    const text = textOf(tree)
    expect(text).toContain('Avisos do evento')
    expect(text.indexOf('Evento cancelado: chuva.')).toBeLessThan(text.indexOf('Trazer documento.'))
    expect(text).toContain('Rafa Nunes')
    expect(text).toContain('Só você escreve.')
    expect(tree.root.findAll(node => node.props.testID === 'notice-evento_cancelado').length).toBeGreaterThan(0)
    expect(text).not.toContain('Bem-vindos!')
    await press(tree, 'Carregar avisos anteriores')
    expect(textOf(tree)).toContain('Bem-vindos!')
  })

  it('publica um aviso: sem texto não envia; enviado aparece no topo, com a confirmação', async () => {
    routeRequest({
      [EVENT]: published(), [MESSAGES]: page([message({ id: 2, body: 'Trazer documento.' })]),
      [`POST ${MESSAGES}`]: message({ id: 9, body: 'Mudamos para as 9h.' }),
    })
    const tree = await screen()
    expect(state(tree, 'Publicar aviso')).toMatchObject({ disabled: true })
    await type(tree, 'Novo aviso', '   ')
    await press(tree, 'Publicar aviso')
    expect(calls('POST', MESSAGES)).toHaveLength(0)
    await type(tree, 'Novo aviso', '  Mudamos para as 9h.  ')
    expect(textOf(tree)).toContain('/1000')
    await press(tree, 'Publicar aviso')
    expect(calls('POST', MESSAGES)[0][2]).toEqual({ body: 'Mudamos para as 9h.' })
    const text = textOf(tree)
    expect(text.indexOf('Mudamos para as 9h.')).toBeLessThan(text.indexOf('Trazer documento.'))
    expect(text).toContain('Aviso publicado. Os inscritos recebem uma notificação.')
    const field = tree.root.findAllByType('TextInput' as never).find(input => input.props.accessibilityLabel === 'Novo aviso')!
    expect(field.props.value).toBe('')
  })

  it('erro ao publicar mostra a mensagem; sem avisos, o canal diz que está vazio', async () => {
    routeRequest({ [EVENT]: published(), [MESSAGES]: page([]), [`POST ${MESSAGES}`]: () => { throw new ApiError('Publique o evento antes de enviar avisos.', 409) } })
    const tree = await screen()
    expect(textOf(tree)).toContain('Nenhum aviso ainda.')
    await type(tree, 'Novo aviso', 'Olá')
    await press(tree, 'Publicar aviso')
    expect(textOf(tree)).toContain('Publique o evento antes de enviar avisos.')
    expect(textOf(tree)).not.toContain('Aviso publicado.')
  })

  it('falha ao ler os avisos mostra o erro e tenta de novo', async () => {
    routeRequest({ [EVENT]: published(), [MESSAGES]: () => { throw new ApiError('Canal indisponível', 500) } })
    const tree = await screen()
    expect(textOf(tree)).toContain('Canal indisponível')
    routeRequest({ [EVENT]: published(), [MESSAGES]: page([message()]) })
    const retry = tree.root.findAllByType('Pressable' as never).filter(entry => entry.props.accessibilityLabel === 'Tentar novamente')
    await act(async () => { retry[retry.length - 1].props.onPress() })
    expect(textOf(tree)).toContain('Primeira rodada às 9h.')
  })

  it('o canal aparece nos estados publicados e não nos rascunhos nem em aprovação', async () => {
    routeRequest({ [EVENT]: detail({ state: 'em_aprovacao', phase: 'em_aprovacao', next_action: { kind: 'aguardar_aprovacao', count: null, deadline: null } }) })
    expect(textOf(await screen())).not.toContain('Avisos do evento')
    routeRequest({ [EVENT]: detail({ state: 'encerrado', phase: 'encerrado', editable_fields: [], next_action: { kind: 'nenhuma', count: null, deadline: null }, pending: noPending }), [MESSAGES]: page([]) })
    expect(textOf(await screen())).toContain('Avisos do evento')
  })
})

describe('Inscritos: linha secundária de cada estado', () => {
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()
  const later = new Date(Date.now() + 86_400_000).toISOString()
  const info = (over: Record<string, unknown>) => entryInfo({ ...entry(), ...over } as unknown as OrganizerEntry)

  it('reserva, comprovante, recusa, confirmação, devolução e os demais', () => {
    expect(info({ state: 'reservada', reserved_until: later })).toMatch(/^Reserva até /)
    expect(info({ state: 'reservada', reserved_until: null })).toBe('Vaga reservada')
    expect(info({ state: 'em_analise', latest_payment: { created_at: hoursAgo(3) } })).toBe('Comprovante enviado há 3 horas')
    expect(info({ state: 'em_analise', latest_payment: null })).toBe('Comprovante em análise')
    expect(info({ state: 'rejeitada', reserved_until: later })).toMatch(/^Pode enviar outro até /)
    expect(info({ state: 'rejeitada', reserved_until: null })).toBe('Comprovante recusado')
    expect(info({ state: 'confirmada', confirmed_at: hoursAgo(2) })).toBe('Confirmada há 2 horas')
    expect(info({ state: 'confirmada', confirmed_at: null, created_at: hoursAgo(1) })).toBe('Confirmada há 1 hora')
    expect(info({ state: 'devolucao_pendente', refund: { created_at: hoursAgo(5), participant_response: null, resolution: null } })).toBe('Devolução enviada há 5 horas · aguardando o participante')
    expect(info({ state: 'devolucao_pendente', refund: null })).toBe('Envie o comprovante da devolução')
    expect(info({ state: 'devolucao_pendente', refund: { created_at: hoursAgo(5), participant_response: 'contestada', resolution: null } })).toBe('Envie o comprovante da devolução')
    expect(info({ state: 'devolucao_contestada' })).toBe('A administração decide a devolução')
    expect(info({ state: 'expirada', created_at: hoursAgo(30) })).toBe('Inscrição ontem')
  })
})

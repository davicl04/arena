import React from 'react'
import { act } from 'react-test-renderer'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { EventDetail, MyEntry, PublicEntry } from '../src/api/entries'
import type { EventMessage } from '../src/api/events'
import EventScreen from '../src/screens/EventScreen'
import { formatDeadline, formatPrice } from '../src/utils/format'
import { enableAct } from './support/native'
import { playContext } from './support/play'
import { toasts } from './support/toast'
import {
  allText, byId, callsTo, eventDetail, findButton, flush, inDays, inHours, isDisabled, labelled, me, myEntry, navigationMock, page, pressButton, receipt, render, serve, team,
} from './support/events'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn().mockResolvedValue('test-token'), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('expo-document-picker', () => ({ getDocumentAsync: vi.fn() }))
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

const h = React.createElement
const brl = (cents: number) => formatPrice(cents, { compact: true })
const MIB = 1024 * 1024

interface World { detail: EventDetail; entry: MyEntry | null; messages: EventMessage[]; entrants: PublicEntry[] }
type Tree = Awaited<ReturnType<typeof mountEvent>>

/** Servidor simulado de um evento: o resumo `my_entry` acompanha a inscrição, como na API. */
function world(detail: EventDetail, entry: MyEntry | null = null, extra: Record<string, unknown> = {}): World {
  const state: World = { detail, entry, messages: [], entrants: [] }
  const holding = () => (state.entry && ['reservada', 'em_analise', 'confirmada', 'rejeitada'].includes(state.entry.state) ? state.entry : null)
  const summary = () => state.entry ? { id: state.entry.id, state: state.entry.state, team: state.entry.subject.team, reserved_until: state.entry.reserved_until } : null
  // O servidor marca o time inscrito em `eligibility.teams[].entry_id`.
  const eligibility = () => ({ ...state.detail.eligibility, teams: state.detail.eligibility.teams?.map(item => ({ ...item, entry_id: holding()?.subject.team?.id === item.team.id ? holding()!.id : item.entry_id })) ?? null })
  serve({
    [`/events/${detail.id}`]: () => ({ ...state.detail, eligibility: eligibility(), my_entry: summary() }),
    [`/events/${detail.id}/messages`]: () => page(state.messages),
    [`/events/${detail.id}/entries`]: () => page(state.entrants),
    '/entries/9': () => state.entry,
    ...extra,
  })
  return state
}

function mountEvent(params: { eventId: number; sport?: 'futebol' | 'tenis' | 'corrida' } = { eventId: 5 }, navigation = navigationMock(), onExpired = vi.fn()) {
  return render(h(EventScreen, { user: me, navigation, onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), onExpired, params, title: 'Campeonato' }))
}
const pickDocument = (asset: { name: string; mimeType?: string; size?: number; uri?: string }) =>
  vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///cache/' + asset.name, lastModified: 0, ...asset }] } as DocumentPicker.DocumentPickerResult)
const text = (tree: Tree) => allText(tree)

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(DocumentPicker.getDocumentAsync).mockReset()
  vi.mocked(ImagePicker.launchImageLibraryAsync).mockReset()
})

describe('Detalhe (D2): cartaz, abas e canal de avisos', () => {
  it('mostra o cartaz hero e as abas Informações | Tabela | Inscritos com a Tabela honesta', async () => {
    world(eventDetail({ price_cents: 0, state: 'publicado' }))
    const navigation = navigationMock()
    const tree = await mountEvent({ eventId: 5 }, navigation)
    expect(text(tree)).toContain('Copa Sudoeste')
    expect(text(tree)).toContain('Liga Sul')
    expect(labelled(tree, 'Informações').map(node => node.props.accessibilityState)).toEqual([{ selected: true }])
    expect(labelled(tree, 'Tabela')).toHaveLength(1)
    expect(labelled(tree, 'Percurso')).toHaveLength(0)
    expect(labelled(tree, 'Inscritos')).toHaveLength(1)
    // Informações: data, local, formato, vagas, preço e elos.
    expect(text(tree)).toContain('Arena Guará · Brasília/DF')
    expect(text(tree)).toContain('Society 7×7 · Todos contra todos')
    expect(text(tree)).toContain('3 de 8 times')
    expect(text(tree)).toContain('Gratuito')
    expect(text(tree)).toContain('Aberto a todos')
    await pressButton(tree, 'Tabela')
    // Sem inscrição, a Tabela é um texto honesto (a leitura da árvore é dos inscritos; veja event-bracket-tab).
    expect(text(tree)).toContain('A tabela é dos inscritos')
    expect(text(tree)).toContain('depois que o organizador confirmar o chaveamento.')
    expect(text(tree)).not.toContain('Arena Guará')
    // O título da barra acompanha a modalidade do evento.
    expect(navigation.setParams).toHaveBeenCalledWith('event', { sport: 'futebol' })
  })

  it('a aba Inscritos lista só as confirmadas, com o selo "Você" na de quem vê', async () => {
    const state = world(eventDetail({ price_cents: 0 }), myEntry({ id: 9, state: 'confirmada', can_cancel: false, can_send_receipt: false }))
    state.entrants = [
      { id: 9, subject: { kind: 'time', team, athlete: null }, confirmed_at: '2026-10-11T12:00:00Z' },
      { id: 12, subject: { kind: 'time', team: { id: 4, name: 'Real Guará', initials: 'RG', crest_url: null }, athlete: null }, confirmed_at: '2026-10-11T13:00:00Z' },
    ]
    const tree = await mountEvent()
    await pressButton(tree, 'Inscritos')
    expect(callsTo('GET', '/events/5/entries')).toHaveLength(1)
    expect(text(tree)).toContain('Ferrugem FC')
    expect(text(tree)).toContain('Real Guará')
    expect(text(tree).match(/Você/g)).toHaveLength(1)
    expect(text(tree)).toMatch(/confirmado em/)
  })

  it('sem inscrições confirmadas, a aba Inscritos mostra o estado vazio', async () => {
    world(eventDetail({ price_cents: 0 }))
    const tree = await mountEvent()
    await pressButton(tree, 'Inscritos')
    expect(text(tree)).toContain('Nenhuma inscrição confirmada')
    expect(text(tree)).toContain('Os times aparecem aqui quando a inscrição é confirmada.')
  })

  it('na corrida a aba é Percurso, com o local e as notas do organizador, e os inscritos são atletas', async () => {
    const state = world(eventDetail({ id: 8, sport: 'corrida', format: null, competition_type: null, distance_km: 10, venue: 'Parque da Cidade', course_notes: 'Largada às 6h30, junto ao lago.', price_cents: 0 }))
    state.entrants = [{ id: 31, subject: { kind: 'atleta', team: null, athlete: { id: 77, name: 'Marina Costa', username: 'marina.c', avatar_url: null } }, confirmed_at: '2026-10-11T12:00:00Z' }]
    const tree = await mountEvent({ eventId: 8 })
    expect(labelled(tree, 'Tabela')).toHaveLength(0)
    await pressButton(tree, 'Percurso')
    expect(text(tree)).toContain('10 km · Prova')
    expect(text(tree)).toContain('Parque da Cidade · Brasília/DF')
    expect(text(tree)).toContain('Largada às 6h30, junto ao lago.')
    await pressButton(tree, 'Inscritos')
    expect(text(tree)).toContain('Marina Costa')
    expect(text(tree)).toContain('@marina.c')
    state.detail = { ...state.detail, course_notes: null }
  })

  it('mostra os avisos do organizador (só leitura), com o cancelamento em destaque', async () => {
    const state = world(eventDetail({ can_read_messages: true, price_cents: 0 }))
    state.messages = [
      { id: 2, kind: 'evento_cancelado', body: 'Evento cancelado: chuva forte.', author: null, created_at: inHours(-1) },
      { id: 1, kind: 'aviso', body: 'Portões abrem às 8 h.', author: { id: 2, name: 'Carlos Lima', username: 'carlos', avatar_url: null }, created_at: inHours(-30) },
    ]
    const tree = await mountEvent()
    expect(text(tree)).toContain('Avisos do organizador')
    expect(text(tree)).toContain('Portões abrem às 8 h.')
    expect(text(tree)).toContain('Carlos Lima · ontem')
    expect(byId(tree, 'notice-evento_cancelado')).toHaveLength(1)
    expect(text(tree)).toContain('Evento cancelado')
    expect(findButton(tree, 'Publicar aviso')).toBeUndefined()

    state.messages = []
    const empty = await mountEvent()
    expect(text(empty)).toContain('Nenhum aviso do organizador por enquanto.')
  })

  it('não lê o canal de avisos sem permissão', async () => {
    world(eventDetail({ can_read_messages: false }))
    const tree = await mountEvent()
    expect(text(tree)).not.toContain('Avisos do organizador')
    expect(callsTo('GET', '/events/5/messages')).toHaveLength(0)
  })

  it('evento cancelado e inscrições suspensas ganham faixas', async () => {
    world(eventDetail({ state: 'cancelado', cancel_reason: 'Chuva forte', phase: 'cancelado' }))
    expect(text(await mountEvent())).toContain('Motivo: Chuva forte')
    world(eventDetail({ state: 'cancelado', cancel_reason: null }))
    expect(text(await mountEvent())).toContain('O organizador cancelou o evento.')
    world(eventDetail({ revocation_pending: true }))
    const tree = await mountEvent()
    expect(text(tree)).toContain('A administração está decidindo se o evento segue.')
    expect(findButton(tree, 'Inscrições suspensas')).toBeTruthy()
    expect(isDisabled(tree, 'Inscrições suspensas')).toBe(true)
  })

  it('o organizador vê o atalho para a gestão e nenhum botão de inscrição', async () => {
    world(eventDetail({ is_organizer: true }))
    const navigation = navigationMock()
    const tree = await mountEvent({ eventId: 5 }, navigation)
    expect(text(tree)).toContain('Você organiza este campeonato.')
    expect(byId(tree, 'entry-bar')).toHaveLength(0)
    await pressButton(tree, 'Abrir gestão')
    expect(navigation.go).toHaveBeenCalledWith('event-manage', { eventId: 5 })
  })

  it('o contato do organizador abre numa folha com o texto selecionável', async () => {
    world(eventDetail({ contact: '(61) 99812-4407' }))
    const tree = await mountEvent()
    await pressButton(tree, 'Contato de Liga Sul')
    expect(byId(tree, 'contact-text')[0].props.selectable).toBe(true)
    expect(byId(tree, 'contact-text')[0].props.children).toBe('(61) 99812-4407')
  })

  it('falha ao carregar mostra o erro com "Tentar novamente"; 401 expira a sessão', async () => {
    let fail = true
    serve({ '/events/5': () => (fail ? new ApiError('Evento fora do ar', 500) : eventDetail({ price_cents: 0 })) })
    const tree = await mountEvent()
    expect(text(tree)).toContain('Evento fora do ar')
    fail = false
    await pressButton(tree, 'Tentar novamente')
    expect(text(tree)).toContain('Copa Sudoeste')

    const onExpired = vi.fn()
    serve({ '/events/5': new ApiError('Sessão expirada', 401) })
    await mountEvent({ eventId: 5 }, navigationMock(), onExpired)
    expect(onExpired).toHaveBeenCalled()
  })

  it('puxar para atualizar relê o evento e a inscrição', async () => {
    world(eventDetail({ price_cents: 0 }))
    const tree = await mountEvent()
    expect(callsTo('GET', '/events/5')).toHaveLength(1)
    const scroll = tree.root.findAllByType('ScrollView' as never)[0]
    await act(async () => { scroll.props.refreshControl.props.onRefresh() })
    await flush()
    expect(callsTo('GET', '/events/5')).toHaveLength(2)
  })
})

describe('Inscrição gratuita e escolha do time', () => {
  it('no futebol com um time elegível o botão traz o nome do time e a inscrição é confirmada na hora', async () => {
    const state = world(eventDetail({ price_cents: 0 }), null, {
      'POST /events/5/entries': ({ body }: { body: unknown }) => {
        state.entry = myEntry({ id: 9, state: 'confirmada', price_cents: 0, can_cancel: true, can_send_receipt: false, confirmed_at: inDays(0), reserved_until: null })
        return { ...state.entry, _body: body }
      },
    })
    const tree = await mountEvent()
    expect(byId(tree, 'entry-bar')).toHaveLength(1)
    await pressButton(tree, 'Inscrever Ferrugem FC · Grátis')
    expect(text(tree)).toContain('Inscrição gratuita')
    expect(text(tree)).toContain('confirmada na hora')
    await pressButton(tree, 'Confirmar inscrição')
    expect(callsTo('POST', '/events/5/entries')[0][2]).toEqual({ team_id: 3 })
    expect(toasts()[0]?.title).toBe('Inscrição confirmada em Copa Sudoeste.')
    expect(byId(tree, 'entry-confirmada')).toHaveLength(1)
    expect(text(tree)).toContain('Inscrição confirmada')
    expect(byId(tree, 'entry-bar')).toHaveLength(0)
    expect(text(tree)).toContain('Desistir da inscrição')
  })

  it('tênis e corrida: o corpo da inscrição é vazio (o titular vem da sessão)', async () => {
    const state = world(eventDetail({ id: 8, sport: 'tenis', price_cents: 0, eligibility: { eligible: true, reason: null, message: null, tier: 'prata', teams: null } }), null, {
      'POST /events/8/entries': () => { state.entry = myEntry({ id: 9, event: { ...eventDetail({ id: 8 }) }, state: 'confirmada', price_cents: 0, subject: { kind: 'atleta', team: null, athlete: { id: 1, name: 'Maria', username: 'maria.s', avatar_url: null } }, my_role: 'atleta' }); return state.entry },
    })
    const tree = await mountEvent({ eventId: 8 })
    await pressButton(tree, 'Inscrever-se · Grátis')
    expect(text(tree)).toContain('Confirmar inscrição')
    await pressButton(tree, 'Confirmar inscrição')
    expect(callsTo('POST', '/events/8/entries')[0][2]).toEqual({})
    expect(text(tree)).toContain('Você')
  })

  it('com mais de um time elegível o botão pede a escolha e a folha inscreve o time marcado', async () => {
    const second = { team: { id: 4, name: 'Real Guará', initials: 'RG', crest_url: null }, tier: 'ouro' as const, eligible: true, reason: null, entry_id: null }
    const state = world(eventDetail({ price_cents: 12000, eligibility: { eligible: true, reason: null, message: null, tier: null, teams: [{ team, tier: 'prata', eligible: true, reason: null, entry_id: null }, second] } }), null, {
      'POST /events/5/entries': () => { state.entry = myEntry({ id: 9, state: 'reservada', price_cents: 12000, subject: { kind: 'time', team: second.team, athlete: null } }); return state.entry },
    })
    const tree = await mountEvent()
    await pressButton(tree, `Inscrever time · ${brl(12000)}`)
    expect(text(tree)).toContain('Time que vai se inscrever')
    expect(labelled(tree, 'Ferrugem FC').find(node => node.props.accessibilityRole === 'radio')?.props.accessibilityState.selected).toBe(true)
    await pressButton(tree, 'Real Guará')
    // Abrir "Pagamento e informações" e voltar não perde o time marcado.
    await pressButton(tree, 'Informações de pagamento')
    await pressButton(tree, 'Voltar')
    expect(labelled(tree, 'Real Guará').find(node => node.props.accessibilityRole === 'radio')?.props.accessibilityState.selected).toBe(true)
    await pressButton(tree, 'Reservar vaga')
    expect(callsTo('POST', '/events/5/entries')[0][2]).toEqual({ team_id: 4 })
    expect(text(tree)).toContain('Vaga reservada')
  })

  it('futebol sem time representado leva a Meus times', async () => {
    world(eventDetail({ eligibility: { eligible: false, reason: 'sem_time', message: 'Só times se inscrevem.', tier: null, teams: [] } }))
    const navigation = navigationMock()
    const tree = await mountEvent({ eventId: 5 }, navigation)
    expect(text(tree)).toContain('Inscrição por time')
    await pressButton(tree, 'Crie ou represente um time')
    expect(navigation.go).toHaveBeenCalledWith('teams')
  })

  it('erros da API ficam na folha e a inscrição segue possível; 401 expira a sessão', async () => {
    const onExpired = vi.fn()
    world(eventDetail({ price_cents: 0 }), null, { 'POST /events/5/entries': new ApiError('Servidor sobrecarregado. Tente de novo.', 500) })
    const tree = await mountEvent({ eventId: 5 }, navigationMock(), onExpired)
    await pressButton(tree, 'Inscrever Ferrugem FC · Grátis')
    await pressButton(tree, 'Confirmar inscrição')
    expect(text(tree)).toContain('Servidor sobrecarregado. Tente de novo.')
    expect(isDisabled(tree, 'Confirmar inscrição')).toBe(false)
    // Erro que não é de estado (nem 404 nem 409): a folha segue aberta e a tela não relê o evento.
    expect(callsTo('GET', '/events/5')).toHaveLength(1)
    world(eventDetail({ price_cents: 0 }), null, { 'POST /events/5/entries': new ApiError('Sessão expirada', 401) })
    const expired = await mountEvent({ eventId: 5 }, navigationMock(), onExpired)
    await pressButton(expired, 'Inscrever Ferrugem FC · Grátis')
    await pressButton(expired, 'Confirmar inscrição')
    expect(onExpired).toHaveBeenCalled()
  })
})

describe('Botão fixo bloqueado', () => {
  it('fora da faixa: desabilitado, com cadeado e o motivo do servidor', async () => {
    world(eventDetail({ accepted_tiers: ['ouro'], eligibility: { eligible: false, reason: 'fora_da_faixa', message: 'Este evento aceita só Ouro.', tier: null, teams: [] } }))
    const tree = await mountEvent()
    expect(isDisabled(tree, 'Fora da faixa do evento')).toBe(true)
    expect(text(tree)).toContain('Este evento aceita só Ouro. Eventos abertos aceitam qualquer nível.')
    expect(labelled(tree, 'Aberto a todos')).toHaveLength(0)
  })

  it('vagas esgotadas e inscrições encerradas', async () => {
    world(eventDetail({ spots_left: 0 }))
    expect(isDisabled(await mountEvent(), 'Vagas esgotadas')).toBe(true)
    world(eventDetail({ registration_open: false, phase: 'inscricoes_encerradas' }))
    const tree = await mountEvent()
    expect(isDisabled(tree, 'Inscrições encerradas')).toBe(true)
    expect(text(tree)).toContain('Inscrições encerradas')
  })
})

describe('Inscrição paga: reservar, Pix, comprovante', () => {
  const paid = () => eventDetail({ id: 5, price_cents: 12000, sport: 'tenis', eligibility: { eligible: true, reason: null, message: null, tier: 'prata', teams: null } })
  const athlete = { kind: 'atleta' as const, team: null, athlete: { id: 1, name: 'Maria', username: 'maria.s', avatar_url: null } }

  it('reserva a vaga mostrando o Pix do organizador e o cartão com o anel das horas', async () => {
    const state = world(paid(), null, {
      'POST /events/5/entries': () => { state.entry = myEntry({ id: 9, state: 'reservada', price_cents: 12000, subject: athlete, my_role: 'atleta' }); return state.entry },
    })
    const tree = await mountEvent()
    await pressButton(tree, `Inscrever-se · ${brl(12000)}`)
    // Folha da reserva: valor, prazo do comprovante e o bloco Pix (texto selecionável, sem área de transferência).
    expect(text(tree)).toContain('Reservar vaga')
    expect(text(tree)).toContain('pago direto ao organizador')
    expect(byId(tree, 'pix-block')).toHaveLength(1)
    expect(byId(tree, 'pix-key')[0].props.selectable).toBe(true)
    expect(byId(tree, 'pix-key')[0].props.children).toBe('pagamentos@ligasul.com.br')
    expect(findButton(tree, 'Compartilhar chave Pix')).toBeTruthy()
    await pressButton(tree, 'Reservar vaga')
    expect(callsTo('POST', '/events/5/entries')[0][2]).toEqual({})
    // Reserva sem pagamento ainda: exige o próximo passo (comprovante), então é aviso, com o prazo na descrição.
    expect(toasts()).toMatchObject([{ tone: 'warning', title: 'Vaga reservada.', description: `Envie o comprovante até ${formatDeadline(state.entry?.reserved_until)}.` }])
    expect(byId(tree, 'entry-reservada')).toHaveLength(1)
    expect(byId(tree, 'deadline-ring')).toHaveLength(1)
    expect(text(tree)).toContain('Vaga reservada')
    expect(text(tree)).toContain('direto ao organizador e envie o comprovante até')
    // O botão fixo passa a ser o envio do comprovante.
    expect(findButton(tree, 'Enviar comprovante')).toBeTruthy()
    expect(findButton(tree, 'Pix e pagamento')).toBeTruthy()
    expect(text(tree)).toContain('Desistir da inscrição')
  })

  it('a reserva sem Pix cadastrado avisa que o organizador ainda não informou', async () => {
    world({ ...paid(), pix: null })
    const tree = await mountEvent()
    await pressButton(tree, `Inscrever-se · ${brl(12000)}`)
    expect(text(tree)).toContain('O organizador ainda não informou o Pix deste evento.')
    expect(byId(tree, 'pix-block')).toHaveLength(0)
  })

  it('o ⓘ abre "Pagamento e informações" e, vindo da reserva, volta para ela', async () => {
    world(paid())
    const tree = await mountEvent()
    await pressButton(tree, `Inscrever-se · ${brl(12000)}`)
    await pressButton(tree, 'Informações de pagamento')
    expect(text(tree)).toContain('Pagamento e informações')
    expect(text(tree)).toContain('COMO FUNCIONA')
    expect(text(tree)).toContain('Use o nome do time na descrição.')
    expect(text(tree)).toContain('O Arena não recebe nem guarda pagamentos.')
    expect(text(tree)).toContain('(61) 99812-4407')
    expect(byId(tree, 'pix-code')).toHaveLength(1)
    await pressButton(tree, 'Voltar')
    expect(text(tree)).toContain('Reservar vaga')
    expect(text(tree)).not.toContain('COMO FUNCIONA')
  })

  it('o ⓘ do botão fixo e da aba Informações abre a folha direto', async () => {
    world(paid(), myEntry({ id: 9, state: 'em_analise', can_send_receipt: false, subject: athlete, my_role: 'atleta', latest_payment: receipt() }))
    const tree = await mountEvent()
    await pressButton(tree, 'Informações de pagamento')
    expect(text(tree)).toContain('Pagamento e informações')
    await pressButton(tree, 'Fechar')
    expect(text(tree)).not.toContain('COMO FUNCIONA')
  })

  it('envia o comprovante: confere tamanho e tipo no cliente e aceita PDF', async () => {
    const parts: unknown[][] = []
    vi.stubGlobal('FormData', class { append(...args: unknown[]) { parts.push(args) } })
    const state = world(paid(), myEntry({ id: 9, state: 'reservada', price_cents: 12000, subject: athlete, my_role: 'atleta' }), {
      'PUT /entries/9/receipt': () => { state.entry = myEntry({ id: 9, state: 'em_analise', price_cents: 12000, subject: athlete, my_role: 'atleta', can_send_receipt: false, can_cancel: false, latest_payment: receipt({ file_type: 'pdf' }) }); return state.entry },
    })
    const tree = await mountEvent()
    await pressButton(tree, 'Enviar comprovante')
    expect(text(tree)).toContain('Imagem (JPEG, PNG ou WebP) ou PDF, até 5 MiB.')
    expect(isDisabled(tree, 'Enviar para análise')).toBe(true)

    // Grande demais: a mensagem do servidor, e nada para enviar.
    pickDocument({ name: 'print.png', mimeType: 'image/png', size: 6 * MIB })
    await pressButton(tree, 'Escolher arquivo (imagem ou PDF)')
    expect(text(tree)).toContain('O arquivo excede o limite de 5 MiB.')
    expect(isDisabled(tree, 'Enviar para análise')).toBe(true)
    // Tipo que o servidor recusaria.
    pickDocument({ name: 'planilha.xlsx', mimeType: 'application/vnd.ms-excel', size: 2048 })
    await pressButton(tree, 'Escolher arquivo (imagem ou PDF)')
    expect(text(tree)).toContain('Envie o comprovante como imagem (JPEG, PNG ou WebP) ou PDF.')
    // Vazio.
    pickDocument({ name: 'vazio.pdf', mimeType: 'application/pdf', size: 0 })
    await pressButton(tree, 'Escolher arquivo (imagem ou PDF)')
    expect(text(tree)).toContain('O arquivo enviado está vazio.')
    // Cancelar o seletor não muda nada.
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({ canceled: true, assets: null } as DocumentPicker.DocumentPickerResult)
    await pressButton(tree, 'Escolher arquivo (imagem ou PDF)')
    expect(isDisabled(tree, 'Enviar para análise')).toBe(true)
    // PDF de 200 KB, sem tipo informado: vale a extensão.
    pickDocument({ name: 'pix-12-10.PDF', size: 200 * 1024 })
    await pressButton(tree, 'Escolher arquivo (imagem ou PDF)')
    expect(text(tree)).not.toContain('Envie o comprovante como')
    expect(byId(tree, 'receipt-picked')[0].props.accessibilityLabel).toBe('Arquivo escolhido: pix-12-10.PDF')
    expect(text(tree)).toContain('200 KB · PDF')
    expect(isDisabled(tree, 'Enviar para análise')).toBe(false)
    expect(findButton(tree, 'Trocar arquivo (imagem ou PDF)')).toBeTruthy()

    await pressButton(tree, 'Enviar para análise')
    expect(callsTo('PUT', '/entries/9/receipt')).toHaveLength(1)
    expect(parts).toEqual([['file', { uri: 'file:///cache/pix-12-10.PDF', name: 'pix-12-10.PDF', type: 'application/pdf' }]])
    expect(toasts()[0]?.title).toBe('Comprovante enviado. Liga Sul vai analisar o pagamento.')
    expect(byId(tree, 'entry-em_analise')).toHaveLength(1)
    expect(text(tree)).toContain('Comprovante em análise')
    expect(byId(tree, 'entry-bar')).toHaveLength(0)
    // O PDF não abre no app: o aviso manda para a web.
    await pressButton(tree, 'Ver comprovante')
    expect(text(tree)).toContain('Abra este comprovante pela web.')
    await pressButton(tree, 'Ocultar comprovante')
    expect(byId(tree, 'receipt-pdf-notice')).toHaveLength(0)
  })

  it('escolhe da galeria e mostra a imagem (comprovante em análise abre a imagem autorizada)', async () => {
    const state = world(paid(), myEntry({ id: 9, state: 'reservada', price_cents: 12000, subject: athlete, my_role: 'atleta' }), {
      'PUT /entries/9/receipt': () => { state.entry = myEntry({ id: 9, state: 'em_analise', price_cents: 12000, subject: athlete, my_role: 'atleta', can_send_receipt: false, latest_payment: receipt({ file_type: 'imagem' }) }); return state.entry },
    })
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///galeria/print.jpg', width: 800, height: 1600, fileName: 'print.jpg', mimeType: 'image/jpeg', fileSize: 300 * 1024 }] } as ImagePicker.ImagePickerResult)
    const tree = await mountEvent()
    await pressButton(tree, 'Enviar comprovante')
    await pressButton(tree, 'Escolher da galeria')
    expect(vi.mocked(ImagePicker.launchImageLibraryAsync)).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'], allowsEditing: false }))
    expect(text(tree)).toContain('print.jpg')
    expect(text(tree)).toContain('300 KB · Imagem')
    await pressButton(tree, 'Enviar para análise')
    await pressButton(tree, 'Ver comprovante')
    const image = byId(tree, 'receipt-image')
    expect(image).toHaveLength(1)
    const source = tree.root.findAllByType('Image' as never).map(node => node.props.source).find(value => value?.headers)
    expect(source).toEqual({ uri: 'http://10.0.2.2:8000/api/v1/receipts/70/file', headers: { Authorization: 'Bearer test-token' } })
  })

  it('falha do seletor e erro do servidor ficam na folha', async () => {
    world(paid(), myEntry({ id: 9, state: 'reservada', price_cents: 12000, subject: athlete, my_role: 'atleta' }), { 'PUT /entries/9/receipt': new ApiError('O servidor não recebeu o arquivo.', 500) })
    const tree = await mountEvent()
    await pressButton(tree, 'Enviar comprovante')
    vi.mocked(DocumentPicker.getDocumentAsync).mockRejectedValueOnce(new Error('indisponível'))
    await pressButton(tree, 'Escolher arquivo (imagem ou PDF)')
    expect(text(tree)).toContain('Não foi possível abrir o seletor de arquivos. Tente de novo.')
    pickDocument({ name: 'ok.jpg', mimeType: 'image/jpeg', size: 1000 })
    await pressButton(tree, 'Escolher arquivo (imagem ou PDF)')
    await pressButton(tree, 'Enviar para análise')
    expect(text(tree)).toContain('O servidor não recebeu o arquivo.')
    expect(isDisabled(tree, 'Enviar para análise')).toBe(false)
    expect(callsTo('GET', '/events/5')).toHaveLength(1)
  })

  it('comprovante recusado: mostra o motivo e "Enviar outro" reabre o envio', async () => {
    const state = world(paid(), myEntry({
      id: 9, state: 'rejeitada', price_cents: 12000, subject: athlete, my_role: 'atleta',
      latest_payment: receipt({ decision: 'recusado', reason_code: 'valor_diferente', reason_detail: 'faltaram R$ 40.' }),
    }), {
      'PUT /entries/9/receipt': () => { state.entry = myEntry({ id: 9, state: 'em_analise', can_send_receipt: false, subject: athlete, my_role: 'atleta' }); return state.entry },
    })
    const tree = await mountEvent()
    expect(byId(tree, 'entry-rejeitada')).toHaveLength(1)
    expect(text(tree)).toContain('Comprovante recusado')
    expect(text(tree)).toContain('Valor diferente: faltaram R$ 40')
    expect(findButton(tree, 'Enviar comprovante')).toBeUndefined()
    await pressButton(tree, 'Enviar outro')
    expect(text(tree)).toContain('Recusado: Valor diferente: faltaram R$ 40.')
    pickDocument({ name: 'novo.png', mimeType: 'image/png', size: 4000 })
    await pressButton(tree, 'Escolher arquivo (imagem ou PDF)')
    await pressButton(tree, 'Enviar para análise')
    expect(byId(tree, 'entry-em_analise')).toHaveLength(1)
  })

  it('quem é só membro do time vê o estado, sem o botão de comprovante nem de desistir', async () => {
    world(eventDetail({ price_cents: 24000 }), myEntry({ id: 9, state: 'reservada', my_role: 'membro', can_send_receipt: false, can_cancel: false, latest_payment: null }))
    const tree = await mountEvent()
    expect(text(tree)).toContain('O representante do Ferrugem FC paga')
    expect(findButton(tree, 'Enviar comprovante')).toBeUndefined()
    expect(findButton(tree, 'Desistir da inscrição')).toBeUndefined()
    expect(findButton(tree, 'Pix e pagamento')).toBeUndefined()
  })

  it('reserva expirada: "A vaga foi liberada" e o botão de inscrição volta se houver vaga', async () => {
    world(eventDetail({ price_cents: 12000, sport: 'tenis', eligibility: { eligible: true, reason: null, message: null, tier: 'prata', teams: null } }),
      myEntry({ id: 9, state: 'expirada', can_send_receipt: false, can_cancel: false, subject: athlete, my_role: 'atleta' }))
    const tree = await mountEvent()
    expect(byId(tree, 'entry-expirada')).toHaveLength(1)
    expect(text(tree)).toContain('A vaga foi liberada')
    expect(text(tree)).toContain('A reserva expirou sem comprovante aprovado no prazo.')
    expect(text(tree)).toContain('Se quiser, inscreva-se de novo enquanto houver vaga.')
    expect(findButton(tree, `Inscrever-se · ${brl(12000)}`)).toBeTruthy()
  })

  it('relê o evento quando a reserva vence com a tela aberta', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    try {
      const state = world(paid(), myEntry({ id: 9, state: 'reservada', price_cents: 12000, subject: athlete, my_role: 'atleta', reserved_until: new Date(Date.now() + 60_000).toISOString() }))
      const tree = await mountEvent()
      expect(byId(tree, 'entry-reservada')).toHaveLength(1)
      state.entry = myEntry({ id: 9, state: 'expirada', can_send_receipt: false, subject: athlete, my_role: 'atleta' })
      await act(async () => { vi.advanceTimersByTime(90_000) })
      await flush()
      expect(byId(tree, 'entry-expirada')).toHaveLength(1)
      expect(callsTo('GET', '/events/5').length).toBeGreaterThanOrEqual(2)
    } finally { vi.useRealTimers() }
  })

  it('desistir cancela a reserva e libera a vaga', async () => {
    const state = world(paid(), myEntry({ id: 9, state: 'reservada', price_cents: 12000, subject: athlete, my_role: 'atleta' }), {
      'DELETE /entries/9': () => { state.entry = null; return undefined },
    })
    const tree = await mountEvent()
    await pressButton(tree, 'Desistir da inscrição')
    expect(text(tree)).toContain('A reserva é cancelada e a vaga fica livre.')
    await pressButton(tree, 'Desistir')
    expect(callsTo('DELETE', '/entries/9')).toHaveLength(1)
    expect(toasts()[0]?.title).toBe('Inscrição cancelada. A vaga ficou livre.')
    expect(byId(tree, 'entry-reservada')).toHaveLength(0)
    expect(findButton(tree, `Inscrever-se · ${brl(12000)}`)).toBeTruthy()
  })
})

describe('Devolução do evento cancelado', () => {
  const cancelled = () => eventDetail({ state: 'cancelado', phase: 'cancelado', cancel_reason: 'Chuva forte', price_cents: 24000 })
  const sent = (extra: Partial<MyEntry> = {}) => myEntry({
    id: 9, state: 'devolucao_pendente', price_cents: 24000, can_send_receipt: false, can_cancel: false, can_respond_refund: true,
    refund: receipt({ id: 80, kind: 'devolucao', created_at: inHours(-24), auto_confirm_at: inDays(6) }), ...extra,
  })

  it('mostra a devolução enviada com o prazo de 7 dias e o comprovante (imagem autorizada)', async () => {
    world(cancelled(), sent())
    const tree = await mountEvent()
    expect(byId(tree, 'entry-devolucao_pendente')).toHaveLength(1)
    expect(text(tree)).toContain('Devolução enviada pelo organizador')
    expect(text(tree)).toContain('Sem resposta em 7 dias, a devolução conta como recebida.')
    expect(byId(tree, 'deadline-ring')).toHaveLength(1)
    expect(findButton(tree, 'Confirmar recebimento')).toBeTruthy()
    expect(findButton(tree, 'Contestar')).toBeTruthy()
    await pressButton(tree, 'Ver comprovante')
    expect(text(tree)).toContain('Comprovante da devolução')
    expect(byId(tree, 'receipt-image')).toHaveLength(1)
  })

  it('devolução em PDF mostra o aviso para abrir pela web', async () => {
    world(cancelled(), sent({ refund: receipt({ id: 80, kind: 'devolucao', file_type: 'pdf', auto_confirm_at: inDays(6) }) }))
    const tree = await mountEvent()
    await pressButton(tree, 'Ver comprovante')
    expect(text(tree)).toContain('Abra este comprovante pela web.')
    expect(byId(tree, 'receipt-image')).toHaveLength(0)
  })

  it('confirma o recebimento só depois da folha de confirmação', async () => {
    const state = world(cancelled(), sent(), {
      'POST /entries/9/refund-response': () => { state.entry = myEntry({ id: 9, state: 'devolvida', price_cents: 24000, can_send_receipt: false, can_cancel: false, refund: receipt({ kind: 'devolucao', participant_response: 'confirmada' }) }); return state.entry },
    })
    const tree = await mountEvent()
    await pressButton(tree, 'Confirmar recebimento')
    expect(text(tree)).toContain('já voltou para a sua conta')
    expect(callsTo('POST', '/entries/9/refund-response')).toHaveLength(0)
    await pressButton(tree, 'Confirmar recebimento')
    expect(callsTo('POST', '/entries/9/refund-response')[0][2]).toEqual({ response: 'confirmar' })
    expect(toasts()[0]?.title).toBe('Recebimento da devolução confirmado.')
    expect(byId(tree, 'entry-devolvida')).toHaveLength(1)
    expect(text(tree)).toContain('O recebimento da devolução foi confirmado.')
  })

  it('contesta com o motivo (5 a 500 caracteres) e a inscrição vai à administração', async () => {
    const state = world(cancelled(), sent(), {
      'POST /entries/9/refund-response': ({ body }: { body: { reason?: string } }) => {
        state.entry = myEntry({ id: 9, state: 'devolucao_contestada', price_cents: 24000, can_send_receipt: false, can_cancel: false, can_respond_refund: false, refund: receipt({ kind: 'devolucao', participant_response: 'contestada', contest_reason: body.reason ?? null }) })
        return state.entry
      },
    })
    const tree = await mountEvent()
    await pressButton(tree, 'Contestar')
    expect(text(tree)).toContain('A administração analisa o comprovante e decide.')
    // Curto demais: o servidor exige ao menos 5 caracteres.
    const field = () => tree.root.findAllByType('TextInput' as never).find(node => node.props.accessibilityLabel === 'O que aconteceu com a devolução?')!
    await act(async () => { field().props.onChangeText('  oi ') })
    await pressButton(tree, 'Contestar devolução')
    expect(text(tree)).toContain('Conte o que aconteceu com a devolução (ao menos 5 caracteres).')
    expect(callsTo('POST', '/entries/9/refund-response')).toHaveLength(0)
    expect(field().props.maxLength).toBe(500)
    await act(async () => { field().props.onChangeText('  O valor que voltou é menor que o pago.  ') })
    await pressButton(tree, 'Contestar devolução')
    expect(callsTo('POST', '/entries/9/refund-response')[0][2]).toEqual({ response: 'contestar', reason: 'O valor que voltou é menor que o pago.' })
    expect(toasts()[0]?.title).toBe('Contestação enviada à administração.')
    expect(text(tree)).toContain('Contestação em análise pela administração')
    expect(text(tree)).toContain('“O valor que voltou é menor que o pago.”')
  })

  it('sem comprovante de devolução ainda, explica a espera; devolvida pela administração e automática têm textos próprios', async () => {
    world(cancelled(), sent({ refund: null, can_respond_refund: false }))
    const waiting = await mountEvent()
    expect(text(waiting)).toContain('Evento cancelado · devolução por Pix')
    expect(text(waiting)).toContain('Quando ele anexar o comprovante, você confirma o recebimento aqui.')
    world(cancelled(), sent({ refund: receipt({ kind: 'devolucao', resolution: 'pendente' }), can_respond_refund: false, state: 'devolucao_pendente' }))
    expect(text(await mountEvent())).toContain('A administração pediu a ele outro comprovante da devolução.')
    world(cancelled(), sent({ state: 'devolvida', refund: receipt({ kind: 'devolucao', participant_response: 'automatica' }), can_respond_refund: false }))
    expect(text(await mountEvent())).toContain('Sem resposta em 7 dias, a devolução foi considerada recebida.')
    world(cancelled(), sent({ state: 'devolvida', refund: receipt({ kind: 'devolucao', participant_response: 'confirmada', resolution: 'devolvida' }), can_respond_refund: false }))
    expect(text(await mountEvent())).toContain('A administração considerou a devolução feita.')
    world(cancelled(), sent({ state: 'cancelada', refund: null, can_respond_refund: false }))
    expect(text(await mountEvent())).toContain('Esta inscrição não ocupa mais vaga no evento.')
  })

  it('erro ao responder fica na folha', async () => {
    world(cancelled(), sent(), { 'POST /entries/9/refund-response': new ApiError('Não foi possível registrar a resposta.', 500) })
    const tree = await mountEvent()
    await pressButton(tree, 'Confirmar recebimento')
    await pressButton(tree, 'Confirmar recebimento')
    expect(text(tree)).toContain('Não foi possível registrar a resposta.')
    expect(callsTo('GET', '/events/5')).toHaveLength(1)
  })

  it('a leitura da inscrição falha: mostra o erro e permite tentar de novo', async () => {
    let fail = true
    world(eventDetail({ price_cents: 0 }), myEntry({ id: 9, state: 'confirmada', price_cents: 0 }), { '/entries/9': () => (fail ? new ApiError('Inscrição fora do ar', 500) : myEntry({ id: 9, state: 'confirmada', price_cents: 0 })) })
    const tree = await mountEvent()
    expect(text(tree)).toContain('Inscrição fora do ar')
    fail = false
    await pressButton(tree, 'Tentar novamente')
    expect(byId(tree, 'entry-confirmada')).toHaveLength(1)
    expect(vi.mocked(request)).toHaveBeenCalledWith('/entries/9')
  })
})

describe('Situação que mudou no servidor (404 ou 409) e sessão que expira na releitura', () => {
  const paid = () => eventDetail({ id: 5, price_cents: 12000, sport: 'tenis', eligibility: { eligible: true, reason: null, message: null, tier: 'prata', teams: null } })
  const athlete = { kind: 'atleta' as const, team: null, athlete: { id: 1, name: 'Maria', username: 'maria.s', avatar_url: null } }
  const reserved = () => myEntry({ id: 9, state: 'reservada', price_cents: 12000, subject: athlete, my_role: 'atleta' })
  const expired = () => myEntry({ id: 9, state: 'expirada', price_cents: 12000, can_send_receipt: false, can_cancel: false, subject: athlete, my_role: 'atleta' })
  /** Título do primeiro toast; a situação que mudou no servidor (404/409) sai como aviso, e a árvore já não guarda o toast. */
  const toast = (_tree: Tree) => toasts()[0]?.title

  it('inscrição: 409 fecha a folha, mostra a mensagem do servidor e relê o evento (o botão vira "Vagas esgotadas")', async () => {
    const state = world(eventDetail({ price_cents: 0 }), null, {
      'POST /events/5/entries': () => { state.detail = { ...state.detail, spots_left: 0 }; return new ApiError('As vagas deste evento acabaram.', 409) },
    })
    const tree = await mountEvent()
    await pressButton(tree, 'Inscrever Ferrugem FC · Grátis')
    await pressButton(tree, 'Confirmar inscrição')
    expect(toast(tree)).toBe('As vagas deste evento acabaram.')
    expect(findButton(tree, 'Confirmar inscrição')).toBeUndefined()
    expect(callsTo('GET', '/events/5')).toHaveLength(2)
    expect(isDisabled(tree, 'Vagas esgotadas')).toBe(true)
  })

  it('comprovante: 409 (prazo da reserva) fecha a folha, mostra a mensagem e relê o evento e a inscrição', async () => {
    const state = world(paid(), reserved(), {
      'PUT /entries/9/receipt': () => { state.entry = expired(); return new ApiError('O prazo da reserva acabou.', 409) },
    })
    const tree = await mountEvent()
    await pressButton(tree, 'Enviar comprovante')
    pickDocument({ name: 'ok.jpg', mimeType: 'image/jpeg', size: 1000 })
    await pressButton(tree, 'Escolher arquivo (imagem ou PDF)')
    await pressButton(tree, 'Enviar para análise')
    expect(toast(tree)).toBe('O prazo da reserva acabou.')
    expect(findButton(tree, 'Enviar para análise')).toBeUndefined()
    expect(callsTo('GET', '/events/5')).toHaveLength(2)
    expect(callsTo('GET', '/entries/9')).toHaveLength(2)
    expect(byId(tree, 'entry-expirada')).toHaveLength(1)
    expect(text(tree)).toContain('A vaga foi liberada')
  })

  it('devolução: 409 ao confirmar o recebimento fecha a folha, mostra a mensagem e relê a inscrição', async () => {
    const detail = eventDetail({ state: 'cancelado', phase: 'cancelado', cancel_reason: 'Chuva forte', price_cents: 24000 })
    const sent = myEntry({ id: 9, state: 'devolucao_pendente', price_cents: 24000, can_send_receipt: false, can_cancel: false, can_respond_refund: true, refund: receipt({ id: 80, kind: 'devolucao', auto_confirm_at: inDays(6) }) })
    const state = world(detail, sent, {
      'POST /entries/9/refund-response': () => {
        state.entry = myEntry({ id: 9, state: 'devolvida', price_cents: 24000, can_send_receipt: false, can_cancel: false, refund: receipt({ kind: 'devolucao', participant_response: 'automatica' }) })
        return new ApiError('Nenhuma devolução aguarda a sua resposta.', 409)
      },
    })
    const tree = await mountEvent()
    await pressButton(tree, 'Confirmar recebimento')
    await pressButton(tree, 'Confirmar recebimento')
    expect(toast(tree)).toBe('Nenhuma devolução aguarda a sua resposta.')
    expect(callsTo('GET', '/entries/9')).toHaveLength(2)
    expect(byId(tree, 'entry-devolvida')).toHaveLength(1)
    expect(text(tree)).toContain('Sem resposta em 7 dias, a devolução foi considerada recebida.')
  })

  it('desistir: 404 fecha a folha, mostra a mensagem e relê a tela (a inscrição já não existe)', async () => {
    const state = world(paid(), reserved(), {
      'DELETE /entries/9': () => { state.entry = null; return new ApiError('Inscrição não encontrada.', 404) },
    })
    const tree = await mountEvent()
    await pressButton(tree, 'Desistir da inscrição')
    await pressButton(tree, 'Desistir')
    expect(toast(tree)).toBe('Inscrição não encontrada.')
    expect(callsTo('GET', '/events/5')).toHaveLength(2)
    expect(byId(tree, 'entry-reservada')).toHaveLength(0)
    expect(findButton(tree, `Inscrever-se · ${brl(12000)}`)).toBeTruthy()
  })

  it('sessão expirada (401) na releitura depois de uma ação volta ao login', async () => {
    const onExpired = vi.fn()
    let reading = false
    const state = world(eventDetail({ price_cents: 0 }), null, {
      '/events/5': () => { if (reading) return new ApiError('Sessão expirada', 401); return state.detail },
      'POST /events/5/entries': () => {
        reading = true
        return myEntry({ id: 9, state: 'confirmada', price_cents: 0, can_cancel: true, can_send_receipt: false, confirmed_at: inDays(0), reserved_until: null })
      },
    })
    const tree = await mountEvent({ eventId: 5 }, navigationMock(), onExpired)
    await pressButton(tree, 'Inscrever Ferrugem FC · Grátis')
    await pressButton(tree, 'Confirmar inscrição')
    expect(toast(tree)).toBe('Inscrição confirmada em Copa Sudoeste.')
    expect(onExpired).toHaveBeenCalledTimes(1)
  })

  it('outro erro na releitura (queda de rede) segue como antes: a tela mantém os dados e não expira a sessão', async () => {
    const onExpired = vi.fn()
    let reading = false
    const state = world(eventDetail({ price_cents: 0 }), null, {
      '/events/5': () => { if (reading) return new ApiError('Servidor fora do ar', 500); return state.detail },
    })
    const tree = await mountEvent({ eventId: 5 }, navigationMock(), onExpired)
    reading = true
    const scroll = tree.root.findAllByType('ScrollView' as never)[0]
    await act(async () => { scroll.props.refreshControl.props.onRefresh() })
    await flush()
    expect(callsTo('GET', '/events/5')).toHaveLength(2)
    expect(text(tree)).toContain('Copa Sudoeste')
    expect(onExpired).not.toHaveBeenCalled()
  })
})

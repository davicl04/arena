import React from 'react'
import * as SecureStore from 'expo-secure-store'
import { act } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { EventMatchList, EventMatchRow } from '../src/api/brackets'
import { rowBadge, rowNames, rowSubtitle } from '../src/components/organizer/scheduleRows'
import { scheduleError, scheduleInput } from '../src/components/organizer/scheduleRules'
import { DEFERRED_COURT_ID } from '../src/components/match/CourtPicker'
import EventMatchesScreen, { counters } from '../src/screens/EventMatchesScreen'
import { dayLabel } from '../src/utils/calendar'
import { combineDateTime } from '../src/utils/dateKey'
import { enableAct } from './support/native'
import { matchList, row, score } from './support/brackets'
import { detail as organizerDetail } from './support/organizer'
import { court, fromNow } from './support/play'
import {
  allText, bodyOf, byId, callsTo, findButton, findByPrefix, flush, hasField, isDisabled, labelled, navigationMock, pressButton, pressPrefix, render, serve, typeInto,
} from './support/review'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

/*
 * Partidas do campeonato (S1), do lado do organizador: a lista com os contadores, a folha de agenda (data, horário livre e
 * quadra do catálogo ou adiada), o conflito de 2 h (`409`) que mantém a folha aberta e bloqueia o reenvio, e o `matchId`
 * que abre a folha de um jogo.
 */

const h = React.createElement
const EVENT = '/organizer/events/5'
const MATCHES = '/organizer/events/5/matches'
const scheduleOf = (id: number) => `/organizer/matches/${id}/schedule`
const courtsOf = (id: number) => `/courts?city_id=7&kind=society&match_id=${id}`
const trees: ReactTestRenderer[] = []
const onExpired = vi.fn()
let navigation = navigationMock()

afterEach(async () => {
  for (const tree of trees.splice(0)) await act(async () => { tree.unmount() })
  vi.useRealTimers()
})
beforeEach(() => {
  enableAct()
  onExpired.mockClear()
  navigation = navigationMock()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
  // Só a data é simulada (12/10/2026, 10:00); os temporizadores e as promessas seguem reais.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
})

async function mount(params: { eventId: number; matchId?: number } = { eventId: 5 }) {
  const tree = await render(h(EventMatchesScreen, { params, navigation, onExpired, title: 'Partidas' } as never))
  trees.push(tree)
  return tree
}

const toSchedule = () => row('J1', 1, ['Novo Horizonte', 'Bola Murcha FC'])
const rescheduable = () => row('J2', 2, ['Atlético Guará', 'Unidos do Lago'], {}, { state: 'agendada', phase: 'agendada', starts_at: fromNow(48), court: court() })
const waiting = () => row('J3', 3, [null, null], { can_schedule: false, round_number: 2, stage: 'Semifinal' })
const toDecide = () => row('J4', 4, ['Leões do Cerrado', 'Dragões FC'], { awaiting_decision: true, can_schedule: false }, { state: 'agendada', phase: 'divergente', starts_at: fromNow(-3) })
const finished = () => row('J5', 5, ['Ferrugem FC', 'Tigres do Lago'], { can_schedule: false }, { state: 'encerrada', phase: 'encerrada', starts_at: fromNow(-30), score: score(2, 1) })
const world = (items: EventMatchRow[] = [toSchedule(), rescheduable(), waiting(), toDecide(), finished()], extra: Record<string, unknown> = {}) =>
  serve({ [EVENT]: organizerDetail(), [MATCHES]: matchList(items), [courtsOf(1)]: { items: [court()] }, [courtsOf(2)]: { items: [court()] }, ...extra })

/** Preenche a folha: dia 20 de outubro (o calendário abre em outubro) e o horário. */
async function fill(tree: ReactTestRenderer, time = '1907') {
  await pressButton(tree, 'Data da partida: não escolhida')
  await pressButton(tree, dayLabel(new Date(2026, 9, 20)))
  await typeInto(tree, 'Horário de início', time)
}

describe('lista dos jogos', () => {
  it('mostra o evento, os contadores e cada jogo com quem joga, a data e o selo do que fazer', async () => {
    world()
    const tree = await mount()
    const text = allText(tree)
    expect(text).toContain('Partidas')
    expect(text).toContain('Copa Sudoeste')
    expect(allText(tree)).toContain('3 de 5 jogos com data')
    // Contadores na ordem do que o organizador faz primeiro.
    expect(labelled(tree, '1 para agendar')).toHaveLength(1)
    expect(labelled(tree, '1 para decidir')).toHaveLength(1)
    expect(labelled(tree, '1 agendadas')).toHaveLength(1)
    expect(labelled(tree, '1 esperando jogo anterior')).toHaveLength(1)
    expect(labelled(tree, '1 encerradas')).toHaveLength(1)
    expect(text).toContain('Novo Horizonte × Bola Murcha FC')
    expect(text).toContain('Vencedor J1 × Vencedor J2')
    expect(text).toContain('Sem data · Quartas de final')
    expect(text).toContain('Espera o resultado de J1 e J2 · Semifinal')
    expect(text).toContain('2 × 1 · Quartas de final')
    for (const badge of ['Agendar', 'Agendada', 'Aguardando', 'Decidir', 'Encerrada']) expect(text).toContain(badge)
    expect(findByPrefix(tree, 'J1, Novo Horizonte contra Bola Murcha FC. Sem data · Quartas de final. Agendar.')).toBeTruthy()
  })

  it('cada linha leva ao que o organizador faz: agenda, decide ou abre a partida; o jogo que espera não é botão', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'J4, ')
    expect(navigation.go).toHaveBeenCalledWith('result-decision', { matchId: 4 })
    await pressPrefix(tree, 'J5, ')
    expect(navigation.go).toHaveBeenCalledWith('match', { matchId: 5 })
    expect(findByPrefix(tree, 'J3, ')).toBeUndefined()
    expect(byId(tree, 'match-3')).toHaveLength(1)
    expect(byId(tree, 'match-3')[0].props.accessibilityLabel).toContain('Vencedor J1 contra Vencedor J2')
    await pressPrefix(tree, 'J1, ')
    expect(allText(tree)).toContain('Agendar J1')
  })

  it('sem partidas, explica que elas nascem da confirmação do chaveamento', async () => {
    world([])
    const tree = await mount()
    expect(allText(tree)).toContain('Nenhuma partida ainda')
    expect(allText(tree)).toContain('As partidas aparecem quando você confirma o chaveamento do campeonato.')
    expect(byId(tree, 'schedule-progress')).toHaveLength(0)
  })

  it('tudo agendado mostra o aviso de que os elencos foram avisados', async () => {
    world([rescheduable()])
    const tree = await mount()
    expect(allText(tree)).toContain('Tudo agendado')
    expect(allText(tree)).toContain('Os dois elencos de cada jogo foram avisados nas notificações.')
  })

  it('erro de carregamento tem "Tentar novamente"; 401 chama onExpired; voltar volta', async () => {
    serve({ [EVENT]: organizerDetail(), [MATCHES]: new ApiError('Fora do ar', 500) })
    const tree = await mount()
    expect(allText(tree)).toContain('Fora do ar')
    serve({ [EVENT]: organizerDetail(), [MATCHES]: matchList([toSchedule()]) })
    await pressButton(tree, 'Tentar novamente')
    expect(allText(tree)).toContain('Novo Horizonte × Bola Murcha FC')
    await pressButton(tree, 'Voltar')
    expect(navigation.back).toHaveBeenCalledOnce()
    serve({ [EVENT]: organizerDetail(), [MATCHES]: new ApiError('Sessão expirada', 401) })
    await mount()
    expect(onExpired).toHaveBeenCalled()
  })

  it('os contadores só mostram o que tem jogo', () => {
    const counts = matchList([toSchedule()]).counts
    expect(counters(counts).map(item => item.label)).toEqual(['para agendar'])
    expect(counters({ total: 0, to_schedule: 0, waiting: 0, scheduled: 0, to_decide: 0, finished: 0 })).toEqual([])
  })
})

describe('agendar', () => {
  it('data, horário livre (ao minuto) e quadra do catálogo: salva, avisa e relê a lista', async () => {
    let list: EventMatchList = matchList([toSchedule(), waiting()])
    const startsAt = combineDateTime('2026-10-20', '19:07')!
    const saved = row('J1', 1, ['Novo Horizonte', 'Bola Murcha FC'], {}, { state: 'agendada', phase: 'agendada', starts_at: startsAt, court: court() })
    serve({
      [EVENT]: organizerDetail(), [MATCHES]: () => list, [courtsOf(1)]: { items: [court()] },
      [`PUT ${scheduleOf(1)}`]: () => { list = matchList([saved, waiting()]); return saved },
    })
    const tree = await mount()
    await pressPrefix(tree, 'J1, ')
    expect(allText(tree)).toContain('Novo Horizonte × Bola Murcha FC · Quartas de final')
    expect(allText(tree)).toContain('Digite o horário de início, ao minuto.')
    await fill(tree)
    await pressPrefix(tree, 'Arena Sudoeste')
    await pressButton(tree, 'Agendar')
    expect(bodyOf('PUT', scheduleOf(1))).toEqual({ starts_at: startsAt, court_id: 7 })
    // A folha fecha, o aviso diz o que aconteceu e a lista foi relida com o jogo agendado.
    expect(allText(tree)).not.toContain('Agendar J1')
    expect(allText(tree)).toContain('J1 agendado para')
    expect(allText(tree)).toContain('em Arena Sudoeste. Os dois elencos foram avisados.')
    expect(callsTo('GET', MATCHES)).toHaveLength(2)
    expect(labelled(tree, '1 agendadas')).toHaveLength(1)
    expect(findByPrefix(tree, 'J1, Novo Horizonte contra Bola Murcha FC')!.props.accessibilityLabel).toContain('Agendada.')
  })

  it('409 de conflito de quadra: mostra o jogo que conflita, mantém a folha aberta, bloqueia o mesmo envio e aceita outro horário', async () => {
    const message = 'A quadra Arena Sudoeste já tem o J3 a menos de 2 h desse horário. Escolha outro horário ou outra quadra.'
    const conflict = { kind: 'quadra', match_id: 3, label: 'J3', stage: 'Quartas de final', starts_at: combineDateTime('2026-10-20', '18:30'), court_name: 'Arena Sudoeste' }
    let attempt = 0
    const saved = row('J1', 1, ['Novo Horizonte', 'Bola Murcha FC'], {}, { state: 'agendada', phase: 'agendada', starts_at: combineDateTime('2026-10-20', '21:00')!, court: court() })
    world([toSchedule(), waiting()], {
      [`PUT ${scheduleOf(1)}`]: () => (++attempt === 1 ? new ApiError(message, 409, [], { detail: message, conflict }) : saved),
    })
    const tree = await mount()
    await pressPrefix(tree, 'J1, ')
    await fill(tree)
    await pressPrefix(tree, 'Arena Sudoeste')
    await pressButton(tree, 'Agendar')
    expect(byId(tree, 'schedule-conflict')).toHaveLength(1)
    expect(allText(tree)).toContain('Conflito de quadra')
    expect(allText(tree)).toContain(message)
    expect(allText(tree)).toContain('Em conflito: J3 · Quartas de final · ')
    expect(allText(tree)).toContain(' · Arena Sudoeste')
    expect(allText(tree)).toContain('Agendar J1')
    // O mesmo dia, horário e quadra não se enviam de novo.
    expect(isDisabled(tree, 'Agendar')).toBe(true)
    expect(callsTo('PUT', scheduleOf(1))).toHaveLength(1)
    // Outro horário libera o envio, e o aviso do conflito some quando o envio dá certo.
    await typeInto(tree, 'Horário de início', '2100')
    expect(isDisabled(tree, 'Agendar')).toBe(false)
    await pressButton(tree, 'Agendar')
    expect(bodyOf('PUT', scheduleOf(1))).toEqual({ starts_at: combineDateTime('2026-10-20', '19:07'), court_id: 7 })
    expect(callsTo('PUT', scheduleOf(1))).toHaveLength(2)
    expect(lastBody()).toEqual({ starts_at: combineDateTime('2026-10-20', '21:00'), court_id: 7 })
    expect(allText(tree)).not.toContain('Agendar J1')
    expect(byId(tree, 'schedule-conflict')).toHaveLength(0)
  })

  it('conflito de time: o aviso explica que é o mesmo time a menos de 2 h', async () => {
    const message = 'Novo Horizonte já joga o J2 a menos de 2 h desse horário. Escolha outro horário.'
    const conflict = { kind: 'time', match_id: 2, label: 'J2', stage: 'Quartas de final', starts_at: combineDateTime('2026-10-20', '19:00'), court_name: null }
    world([toSchedule()], { [`PUT ${scheduleOf(1)}`]: new ApiError(message, 409, [], { detail: message, conflict }) })
    const tree = await mount()
    await pressPrefix(tree, 'J1, ')
    await fill(tree)
    await pressPrefix(tree, 'Arena Sudoeste')
    await pressButton(tree, 'Agendar')
    expect(allText(tree)).toContain('Conflito de horário do time')
    expect(allText(tree)).toContain(message)
    expect(allText(tree)).toContain('Em conflito: J2 · Quartas de final · ')
  })

  it('outros erros do servidor (a partida já começou) aparecem na folha, que continua aberta, sem bloquear o reenvio', async () => {
    world([toSchedule()], { [`PUT ${scheduleOf(1)}`]: new ApiError('A partida já começou: depois do início só o resultado pode mudar.', 409) })
    const tree = await mount()
    await pressPrefix(tree, 'J1, ')
    await fill(tree)
    await pressPrefix(tree, 'Arena Sudoeste')
    await pressButton(tree, 'Agendar')
    expect(allText(tree)).toContain('A partida já começou: depois do início só o resultado pode mudar.')
    expect(byId(tree, 'schedule-conflict')).toHaveLength(0)
    expect(allText(tree)).toContain('Agendar J1')
    expect(isDisabled(tree, 'Agendar')).toBe(false)
  })

  it('409 porque o resultado já foi definido: relê a lista, fecha a folha e mostra o jogo como está agora', async () => {
    const message = 'O resultado desta partida já foi definido: ela não pode mais ser reagendada.'
    let reads = 0
    const decided = () => row('J1', 1, ['Novo Horizonte', 'Bola Murcha FC'], { can_schedule: false }, { state: 'encerrada', phase: 'encerrada', starts_at: fromNow(-3), score: score(2, 1) })
    serve({
      [EVENT]: organizerDetail(), [MATCHES]: () => matchList([++reads === 1 ? toSchedule() : decided(), waiting()]),
      [courtsOf(1)]: { items: [court()] }, [`PUT ${scheduleOf(1)}`]: new ApiError(message, 409),
    })
    const tree = await mount()
    await pressPrefix(tree, 'J1, ')
    await fill(tree)
    await pressPrefix(tree, 'Arena Sudoeste')
    await pressButton(tree, 'Agendar')
    expect(callsTo('GET', MATCHES)).toHaveLength(2)
    // A folha fecha (o jogo não é mais agendável), a mensagem do servidor fica na tela e a linha mostra o jogo encerrado.
    expect(allText(tree)).not.toContain('Agendar J1')
    expect(allText(tree)).toContain(message)
    expect(byId(tree, 'schedule-conflict')).toHaveLength(0)
    expect(String(byId(tree, 'match-1')[0].props.accessibilityLabel)).toContain('Encerrada')
  })

  it('"Sugerir outra quadra": a quadra fica adiada e a sugestão segue no corpo do agendamento, sem chamar as sugestões de quadra', async () => {
    const startsAt = combineDateTime('2026-10-20', '19:07')!
    const saved = row('J1', 1, ['Novo Horizonte', 'Bola Murcha FC'], {}, { state: 'agendada', phase: 'agendada', starts_at: startsAt, court: court({ id: 99, name: 'Quadra Nova', state: 'em_revisao', provisional: true }) })
    world([toSchedule()], { [`PUT ${scheduleOf(1)}`]: saved })
    const tree = await mount()
    await pressPrefix(tree, 'J1, ')
    await fill(tree)
    await pressButton(tree, 'Sugerir outra quadra')
    await typeInto(tree, 'Nome da quadra', 'Quadra Nova')
    await typeInto(tree, 'Endereço (opcional)', 'SQN 100')
    await pressButton(tree, 'Sugerir quadra')
    expect(allText(tree)).toContain('Quadra Nova será sugerida ao agendar: fica em revisão e vale só nesta partida.')
    expect(callsTo('POST', '/courts/suggestions')).toHaveLength(0)
    await pressButton(tree, 'Agendar')
    expect(bodyOf('PUT', scheduleOf(1))).toEqual({ starts_at: startsAt, court_suggestion: { name: 'Quadra Nova', address: 'SQN 100' } })
    expect(callsTo('POST', '/courts/suggestions')).toHaveLength(0)
    expect(allText(tree)).toContain('em Quadra Nova')
  })

  it('campos vazios são recusados antes de enviar, um por vez, na ordem do servidor', async () => {
    world([toSchedule()])
    const tree = await mount()
    await pressPrefix(tree, 'J1, ')
    await pressButton(tree, 'Agendar')
    expect(allText(tree)).toContain('Escolha a data da partida.')
    await pressButton(tree, 'Data da partida: não escolhida')
    await pressButton(tree, dayLabel(new Date(2026, 9, 12)))
    await pressButton(tree, 'Agendar')
    expect(allText(tree)).toContain('Digite o horário de início.')
    await typeInto(tree, 'Horário de início', '0900')
    await pressButton(tree, 'Agendar')
    expect(allText(tree)).toContain('Escolha um horário que ainda não passou.')
    await typeInto(tree, 'Horário de início', '1100')
    await pressButton(tree, 'Agendar')
    expect(allText(tree)).toContain('Escolha a quadra do catálogo ou sugira uma.')
    expect(callsTo('PUT', scheduleOf(1))).toHaveLength(0)
  })

  it('reagendar parte da data, do horário e da quadra atuais e o botão diz "Salvar alteração"', async () => {
    world([rescheduable()])
    const tree = await mount()
    await pressPrefix(tree, 'J2, ')
    expect(allText(tree)).toContain('Reagendar J2')
    expect(findButton(tree, 'Salvar alteração')).toBeTruthy()
    expect(findButton(tree, 'Agendar')).toBeUndefined()
    expect(findByPrefix(tree, 'Arena Sudoeste')!.props.accessibilityState.checked).toBe(true)
    expect(hasField(tree, 'Horário de início')).toBe(true)
  })

  it('"Abrir partida e chat" na folha leva à partida', async () => {
    world([toSchedule()])
    const tree = await mount()
    await pressPrefix(tree, 'J1, ')
    await pressButton(tree, 'Abrir partida e chat')
    expect(navigation.go).toHaveBeenCalledWith('match', { matchId: 1 })
  })

  it('o matchId dos parâmetros abre a folha daquele jogo uma vez e é consumido', async () => {
    world()
    const tree = await mount({ eventId: 5, matchId: 1 })
    expect(allText(tree)).toContain('Agendar J1')
    expect(navigation.setParams).toHaveBeenCalledWith('event-matches', { matchId: undefined })
    expect(navigation.setParams).toHaveBeenCalledTimes(1)
    // Um jogo que não pode ser agendado (já encerrado) não abre folha.
    const other = await mount({ eventId: 5, matchId: 5 })
    expect(allText(other)).not.toContain('Agendar J5')
    expect(allText(other)).not.toContain('Reagendar J5')
    await flush()
  })
})

describe('regras do agendamento', () => {
  const now = new Date(2026, 9, 12, 10, 0)
  const catalog = court()

  it('confere data, horário, passado e quadra, nessa ordem, como o servidor', () => {
    expect(scheduleError('', '', null, now)).toBe('Escolha a data da partida.')
    expect(scheduleError('2026-10-20', '', null, now)).toBe('Digite o horário de início.')
    expect(scheduleError('2026-10-12', '09:00', catalog, now)).toBe('Escolha um horário que ainda não passou.')
    expect(scheduleError('2026-10-20', '19:07', null, now)).toBe('Escolha a quadra do catálogo ou sugira uma.')
    expect(scheduleError('2026-10-20', '19:07', catalog, now)).toBeNull()
    expect(scheduleError('2026-02-31', '19:07', catalog, now)).toBe('Escolha uma data e um horário válidos.')
  })

  it('o corpo leva court_id da quadra do catálogo ou court_suggestion da sugerida', () => {
    expect(scheduleInput('2026-10-20T22:07:00.000Z', catalog)).toEqual({ starts_at: '2026-10-20T22:07:00.000Z', court_id: 7 })
    const deferred = court({ id: DEFERRED_COURT_ID, name: 'Quadra Nova', address: null, provisional: true, state: 'em_revisao' })
    expect(scheduleInput('2026-10-20T22:07:00.000Z', deferred)).toEqual({ starts_at: '2026-10-20T22:07:00.000Z', court_suggestion: { name: 'Quadra Nova', address: null } })
  })

  it('os textos da linha: quem joga, a linha de apoio e o selo', () => {
    expect(rowNames(waiting())).toEqual(['Vencedor J1', 'Vencedor J2'])
    expect(rowSubtitle(toSchedule())).toBe('Sem data · Quartas de final')
    expect(rowSubtitle(finished())).toBe('2 × 1 · Quartas de final')
    expect(rowBadge(toDecide())).toEqual({ label: 'Decidir', tone: 'danger' })
    expect(rowBadge(row('J6', 6, ['A', 'B'], { can_schedule: false }, { state: 'cancelada' }))).toEqual({ label: 'Cancelada', tone: 'danger' })
    expect(rowBadge(row('J7', 7, ['A', 'B'], {}, { state: 'agendada', phase: 'informar_resultado', starts_at: fromNow(-1) }))).toEqual({ label: 'Aguardando placar', tone: 'live' })
  })
})

/** Corpo da última chamada de agenda (a segunda tentativa). */
function lastBody() {
  return vi.mocked(request).mock.calls.filter(([path, method]) => path === scheduleOf(1) && method === 'PUT').at(-1)?.[2]
}

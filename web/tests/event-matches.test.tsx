import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventMatchesPage from '../src/pages/EventMatchesPage'
import { DEFERRED_COURT_ID } from '../src/components/match/CourtPicker'
import { scheduleError, scheduleInput } from '../src/components/organizer/scheduleRules'
import { combineDateTime } from '../src/utils/dateKey'
import { apiError, mockApi, reply } from './teams-fixtures'
import { eventDetail } from './events-fixtures'
import { court, fromNow } from './match-fixtures'
import { matchList, row, score } from './brackets-fixtures'

/*
 * Partidas do campeonato (S1): a lista dos jogos (os sem data primeiro), a folha de agendamento com o Date Picker, o horário
 * livre e a quadra (catálogo ou sugestão), o `409` de conflito com o jogo que conflita e os caminhos de cada linha.
 */

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

type Routes = Parameters<typeof mockApi>[0]
const COURTS = 'GET /courts?city_id=5300108&kind=society&match_id=11'
const catalog = { items: [court({ id: 7, name: 'Quadra Central' }), court({ id: 8, name: 'Quadra Lateral' })] }

const j1 = () => row('J1', 11, ['Bola Murcha FC', 'Atlético Guará'])
const j2 = () => row('J2', 12, ['Unidos do Lago', 'Novo Horizonte'], {}, { state: 'agendada', phase: 'agendada', starts_at: fromNow(30), court: court({ id: 7, name: 'Quadra Central' }) })
const j3 = () => row('J3', 13, ['Leões do Cerrado', null], { stage: 'Semifinal', round_number: 2 })
const j4 = () => row('J4', 14, ['Ferrugem FC', 'Dragões FC'], { awaiting_decision: true, can_schedule: false }, { state: 'agendada', phase: 'divergente', starts_at: fromNow(-3) })
const j5 = () => row('J5', 15, ['Tigres do Lago', 'Grêmio do Lago'], { can_schedule: false }, { state: 'encerrada', phase: 'encerrada', score: score(2, 1), starts_at: fromNow(-60) })

function renderPage(routes: Routes = {}, props: Partial<Parameters<typeof EventMatchesPage>[0]> = {}) {
  const items = [j1(), j2(), j3(), j4(), j5()]
  const api = mockApi({ 'GET /organizer/events/5': eventDetail(), 'GET /organizer/events/5/matches': matchList(items), ...routes })
  const handlers = { onBack: vi.fn(), onOpenMatch: vi.fn(), onDecide: vi.fn(), onExpired: vi.fn(), onInitialShown: vi.fn() }
  render(<EventMatchesPage eventId={5} {...handlers} {...props} />)
  return { ...api, ...handlers, user: userEvent.setup() }
}
const matchRow = (label: string) => screen.getAllByRole('listitem').find(item => item.textContent?.startsWith(label)) as HTMLElement

/** Escolhe um dia no Date Picker aberto (relógio de teste em 12/10/2026). */
async function pickDay(user: ReturnType<typeof userEvent.setup>, day: string) {
  await user.click(screen.getByRole('button', { name: /^Data:/ }))
  const calendar = await screen.findByRole('dialog', { name: 'Escolher data' })
  const target = Array.from(calendar.querySelectorAll<HTMLButtonElement>('[data-slot="calendar-day"]'))
    .find(item => item.textContent === day && !item.hasAttribute('data-outside'))!
  await user.click(target)
}

describe('lista dos jogos', () => {
  it('mostra o evento, os contadores e cada jogo com quem joga, a data e o selo do que fazer', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Partidas' })).not.toBeNull()
    expect(screen.getByText('Copa Sudoeste Society')).not.toBeNull()
    const summary = screen.getByRole('list', { name: 'Resumo das partidas' })
    expect(within(summary).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      '1 para agendar', '1 para decidir', '1 agendadas', '1 esperando jogo anterior', '1 encerradas',
    ])
    expect(screen.getByText('3 de 5 jogos com data')).not.toBeNull()
    const list = screen.getByRole('list', { name: 'Jogos do campeonato' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(5)
    expect(rows[0].textContent).toContain('Bola Murcha FC × Atlético Guará')
    expect(rows[0].textContent).toContain('Sem data · Quartas de final')
    expect(rows[0].textContent).toContain('Agendar')
    expect(rows[1].textContent).toContain('Quadra Central')
    expect(rows[1].textContent).toContain('Agendada')
    // Um lado ainda espera o vencedor: "Vencedor J2", sem botão de agendar.
    expect(rows[2].textContent).toContain('Leões do Cerrado × Vencedor J2')
    expect(rows[2].textContent).toContain('Espera o resultado de J2')
    expect(within(rows[2]).queryByRole('button')).toBeNull()
    expect(rows[3].textContent).toContain('Decidir')
    expect(rows[4].textContent).toContain('2 × 1 · Quartas de final')
  })

  it('cada linha leva ao que o organizador faz: agenda, decide ou abre a partida', async () => {
    const { user, onDecide, onOpenMatch } = renderPage({ [COURTS]: catalog })
    await screen.findByRole('list', { name: 'Jogos do campeonato' })
    await user.click(within(matchRow('J4')).getByRole('button'))
    expect(onDecide).toHaveBeenCalledWith(14)
    await user.click(within(matchRow('J5')).getByRole('button'))
    expect(onOpenMatch).toHaveBeenCalledWith(15)
    await user.click(within(matchRow('J1')).getByRole('button'))
    expect(await screen.findByRole('dialog', { name: 'Agendar J1' })).not.toBeNull()
  })

  it('sem partidas, explica que elas nascem da confirmação do chaveamento', async () => {
    renderPage({ 'GET /organizer/events/5/matches': matchList([]) })
    expect(await screen.findByText('Nenhuma partida ainda')).not.toBeNull()
    expect(screen.getByText(/quando você confirma o chaveamento/)).not.toBeNull()
  })

  it('tudo agendado mostra o aviso de que os elencos foram avisados', async () => {
    renderPage({ 'GET /organizer/events/5/matches': matchList([j2()]) })
    expect(await screen.findByText('Tudo agendado')).not.toBeNull()
  })

  it('erro de carregamento tem "Tentar novamente"; 401 chama onExpired; voltar chama onBack', async () => {
    const first = renderPage({ 'GET /organizer/events/5/matches': apiError(500, 'Falha ao listar.') })
    expect((await screen.findByRole('alert')).textContent).toContain('Falha ao listar.')
    await first.user.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(first.onBack).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).not.toBeNull()
    cleanup()
    const expired = renderPage({ 'GET /organizer/events/5/matches': apiError(401, 'Sessão expirada.') })
    await waitFor(() => expect(expired.onExpired).toHaveBeenCalled())
  })
})

describe('agendar', () => {
  /** Preenche a folha com dia 20, horário e a quadra e salva. */
  async function fill(user: ReturnType<typeof userEvent.setup>, time: string, courtName = 'Quadra Central') {
    const sheet = await screen.findByRole('dialog', { name: 'Agendar J1' })
    await pickDay(user, '20')
    fireEvent.change(within(sheet).getByLabelText('Horário'), { target: { value: time } })
    await user.click(await within(sheet).findByRole('button', { name: new RegExp(courtName) }))
    return sheet
  }
  const saved = () => ({
    ...j1(), card: { ...j1().card, state: 'agendada' as const, phase: 'agendada' as const, starts_at: combineDateTime('2026-10-20', '16:30')!, court: court({ id: 7, name: 'Quadra Central' }) },
  })

  it('data, horário livre (ao minuto) e quadra do catálogo: salva, avisa e relê a lista', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
    let reads = 0
    const { user, find } = renderPage({
      [COURTS]: catalog,
      'PUT /organizer/matches/11/schedule': saved(),
      'GET /organizer/events/5/matches': () => matchList(++reads === 1 ? [j1(), j2()] : [j2(), saved()]),
    })
    await user.click(await screen.findByRole('button', { name: /^J1,/ }))
    const sheet = await fill(user, '16:37')
    expect(within(sheet).getByLabelText('Horário').getAttribute('step')).toBe('60')
    await user.click(within(sheet).getByRole('button', { name: 'Agendar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Agendar J1' })).toBeNull())
    expect(find('PUT', '/organizer/matches/11/schedule')[0].body).toEqual({ starts_at: combineDateTime('2026-10-20', '16:37'), court_id: 7 })
    expect(screen.getByRole('status').textContent).toMatch(/^J1 agendado para .* em Quadra Central\. Os dois elencos foram avisados\.$/)
    await waitFor(() => expect(reads).toBe(2))
    // O agendado desce para depois dos sem data e a lista foi relida.
    expect(find('GET', '/organizer/events/5/matches')).toHaveLength(2)
  })

  it('409 de conflito: mostra o jogo que conflita, mantém a folha aberta e aceita outro horário', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
    const conflict = { kind: 'quadra', match_id: 12, label: 'J2', stage: 'Quartas de final', starts_at: combineDateTime('2026-10-20', '16:00'), court_name: 'Quadra Central' }
    let puts = 0
    const { user, find } = renderPage({
      [COURTS]: catalog,
      'PUT /organizer/matches/11/schedule': () => (++puts === 1
        ? reply(409, { detail: 'A quadra Quadra Central já tem o J2 a menos de 2 h desse horário. Escolha outro horário ou outra quadra.', conflict })
        : saved()),
    })
    await user.click(await screen.findByRole('button', { name: /^J1,/ }))
    const sheet = await fill(user, '16:30')
    await user.click(within(sheet).getByRole('button', { name: 'Agendar' }))
    const alert = await within(sheet).findByRole('alert')
    expect(alert.getAttribute('data-slot')).toBe('schedule-conflict')
    expect(alert.textContent).toContain('Conflito de quadra')
    expect(alert.textContent).toContain('A quadra Quadra Central já tem o J2 a menos de 2 h desse horário.')
    expect(alert.textContent).toContain('Em conflito: J2 · Quartas de final')
    expect(alert.textContent).toContain('Quadra Central')
    // A folha continua aberta, com o que foi preenchido.
    expect(screen.getByRole('dialog', { name: 'Agendar J1' })).not.toBeNull()
    expect(within(sheet).getByLabelText('Horário')).toHaveProperty('value', '16:30')
    // O mesmo dia, horário e quadra não se enviam de novo: o botão espera uma mudança.
    expect((within(sheet).getByRole('button', { name: 'Agendar' }) as HTMLButtonElement).disabled).toBe(true)
    expect(find('PUT', '/organizer/matches/11/schedule')).toHaveLength(1)
    fireEvent.change(within(sheet).getByLabelText('Horário'), { target: { value: '19:00' } })
    expect((within(sheet).getByRole('button', { name: 'Agendar' }) as HTMLButtonElement).disabled).toBe(false)
    await user.click(within(sheet).getByRole('button', { name: 'Agendar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Agendar J1' })).toBeNull())
    expect(find('PUT', '/organizer/matches/11/schedule')).toHaveLength(2)
  })

  it('conflito de time: o aviso explica que é o mesmo time a menos de 2 h', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
    const conflict = { kind: 'time', match_id: 13, label: 'J3', stage: 'Semifinal', starts_at: combineDateTime('2026-10-20', '15:00'), court_name: null }
    const { user } = renderPage({
      [COURTS]: catalog,
      'PUT /organizer/matches/11/schedule': reply(409, { detail: 'Atlético Guará já joga o J3 a menos de 2 h desse horário. Escolha outro horário.', conflict }),
    })
    await user.click(await screen.findByRole('button', { name: /^J1,/ }))
    const sheet = await fill(user, '16:00')
    await user.click(within(sheet).getByRole('button', { name: 'Agendar' }))
    const alert = await within(sheet).findByRole('alert')
    expect(alert.textContent).toContain('Conflito de horário do time')
    expect(alert.textContent).toContain('Atlético Guará já joga o J3')
  })

  it('outros erros do servidor (partida já começou) aparecem na folha, que continua aberta', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
    const { user } = renderPage({
      [COURTS]: catalog,
      'PUT /organizer/matches/11/schedule': apiError(409, 'A partida já começou: depois do início só o resultado pode mudar.'),
    })
    await user.click(await screen.findByRole('button', { name: /^J1,/ }))
    const sheet = await fill(user, '16:00')
    await user.click(within(sheet).getByRole('button', { name: 'Agendar' }))
    expect((await within(sheet).findByRole('alert')).textContent).toBe('A partida já começou: depois do início só o resultado pode mudar.')
    expect(within(sheet).queryByText(/Conflito/)).toBeNull()
  })

  it('"Sugerir outra quadra": a sugestão segue no corpo do agendamento, sem chamar as sugestões de quadra', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
    const { user, find } = renderPage({ [COURTS]: catalog, 'PUT /organizer/matches/11/schedule': saved() })
    await user.click(await screen.findByRole('button', { name: /^J1,/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Agendar J1' })
    await pickDay(user, '20')
    fireEvent.change(within(sheet).getByLabelText('Horário'), { target: { value: '18:00' } })
    await user.click(await within(sheet).findByRole('button', { name: /Sugerir outra quadra/ }))
    await user.type(within(sheet).getByLabelText('Nome da quadra'), 'Ginásio do Guará')
    await user.type(within(sheet).getByLabelText(/Endereço/), 'QE 25')
    await user.click(within(sheet).getByRole('button', { name: 'Sugerir quadra' }))
    expect(await within(sheet).findByText(/será sugerida ao agendar: fica em revisão e vale só nesta partida/)).not.toBeNull()
    expect(within(sheet).getByRole('button', { name: /Ginásio do Guará/ }).getAttribute('aria-pressed')).toBe('true')
    await user.click(within(sheet).getByRole('button', { name: 'Agendar' }))
    await waitFor(() => expect(find('PUT', '/organizer/matches/11/schedule')).toHaveLength(1))
    expect(find('PUT', '/organizer/matches/11/schedule')[0].body).toEqual({
      starts_at: combineDateTime('2026-10-20', '18:00'), court_suggestion: { name: 'Ginásio do Guará', address: 'QE 25' },
    })
    expect(find('POST', '/courts/suggestions')).toHaveLength(0)
  })

  it('campos vazios são recusados antes de enviar, um por vez', async () => {
    const { user, find } = renderPage({ [COURTS]: catalog })
    await user.click(await screen.findByRole('button', { name: /^J1,/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Agendar J1' })
    await user.click(within(sheet).getByRole('button', { name: 'Agendar' }))
    expect((await within(sheet).findByRole('alert')).textContent).toBe('Escolha a data da partida.')
    expect(find('PUT', '/organizer/matches/11/schedule')).toHaveLength(0)
  })

  it('reagendar parte da data, do horário e da quadra atuais e o botão diz "Salvar alteração"', async () => {
    const { user } = renderPage({ 'GET /courts?city_id=5300108&kind=society&match_id=12': catalog })
    await user.click(await screen.findByRole('button', { name: /^J2,/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Reagendar J2' })
    expect(within(sheet).getByLabelText('Horário')).toHaveProperty('value', expect.stringMatching(/^\d\d:\d\d$/))
    expect(within(sheet).getByRole('button', { name: 'Salvar alteração' })).not.toBeNull()
    expect(within(sheet).getByRole('button', { name: /Quadra Central/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('"Abrir partida e chat" na folha leva à partida', async () => {
    const { user, onOpenMatch } = renderPage({ [COURTS]: catalog })
    await user.click(await screen.findByRole('button', { name: /^J1,/ }))
    await user.click(await screen.findByRole('button', { name: 'Abrir partida e chat' }))
    expect(onOpenMatch).toHaveBeenCalledWith(11)
  })

  it('a folha pedida pela partida (initialMatchId) abre uma vez e avisa que foi mostrada', async () => {
    const { onInitialShown } = renderPage({ [COURTS]: catalog }, { initialMatchId: 11 })
    expect(await screen.findByRole('dialog', { name: 'Agendar J1' })).not.toBeNull()
    expect(onInitialShown).toHaveBeenCalledTimes(1)
  })
})

describe('regras do agendamento', () => {
  const now = new Date(2026, 9, 12, 10, 0)
  const central = court({ id: 7, name: 'Quadra Central' })

  it('confere data, horário, passado e quadra, nessa ordem, como o servidor', () => {
    expect(scheduleError('', '16:00', central, now)).toBe('Escolha a data da partida.')
    expect(scheduleError('2026-10-20', '', central, now)).toBe('Digite o horário de início.')
    expect(scheduleError('2026-10-20', '25:99', central, now)).toBe('Escolha uma data e um horário válidos.')
    expect(scheduleError('2026-10-12', '09:59', central, now)).toBe('Escolha um horário que ainda não passou.')
    expect(scheduleError('2026-10-20', '16:37', null, now)).toBe('Escolha a quadra do catálogo ou sugira uma.')
    // Horário livre: 16:37 vale (sem passos de 15 minutos).
    expect(scheduleError('2026-10-20', '16:37', central, now)).toBeNull()
  })

  it('o corpo leva court_id da quadra do catálogo ou court_suggestion da sugerida', () => {
    expect(scheduleInput('2026-10-20T19:37:00.000Z', central)).toEqual({ starts_at: '2026-10-20T19:37:00.000Z', court_id: 7 })
    const suggested = court({ id: DEFERRED_COURT_ID, name: 'Ginásio do Guará', address: null, state: 'em_revisao', provisional: true })
    expect(scheduleInput('2026-10-20T19:37:00.000Z', suggested)).toEqual({ starts_at: '2026-10-20T19:37:00.000Z', court_suggestion: { name: 'Ginásio do Guará', address: null } })
  })
})

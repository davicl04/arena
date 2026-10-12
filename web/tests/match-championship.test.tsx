import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MatchPage from '../src/pages/MatchPage'
import { mockApi } from './teams-fixtures'
import { caio, court, event, fromNow, matchDetail, message, noPermissions, page, ricardo, sides } from './match-fixtures'
import { report, result as resultOf } from './results-fixtures'

/*
 * Partida de campeonato (0002, seção 17): o cartão de condições mostra data e quadra do organizador (sem "Propor outra", sem
 * aceite e sem reserva: `terms` e `booking` vêm nulos), o organizador aparece no chat com a etiqueta "Organizador" e, para ele,
 * "Agendar", "Reagendar" e "Decidir resultado" seguem `permissions`.
 */

afterEach(cleanup)

const eventRef = { id: 5, name: 'Copa Sudoeste Society' }
const organizerPermissions = { ...noPermissions, read_chat: true, write_chat: true }

/** Partida de campeonato combinando, vista por um representante (lado A): sem data, sem condições e sem propostas. */
const championship = (overrides: Parameters<typeof matchDetail>[0] = {}) => matchDetail({
  origin: 'campeonato', event: eventRef, round_number: 1, permissions: { ...noPermissions, read_chat: true, write_chat: true, report_result: false }, ...overrides,
})
/** A mesma partida vista pelo organizador (sem lado). */
const asOrganizer = (overrides: Parameters<typeof matchDetail>[0] = {}) => championship({
  my_side: null, my_role: 'organizador', sides: sides({ is_mine: false }, { is_mine: false }), permissions: organizerPermissions, ...overrides,
})

type Routes = Parameters<typeof mockApi>[0]
function renderMatch(detail: ReturnType<typeof matchDetail>, routes: Routes = {}) {
  const api = mockApi({ 'GET /matches/1': detail, 'GET /matches/1/messages': page([]), 'GET /matches/1/stats': { items: [] }, ...routes })
  const props = { onBack: vi.fn(), onSchedule: vi.fn(), onDecide: vi.fn(), onExpired: vi.fn() }
  render(<MatchPage matchId={1} viewerId={1} {...props} />)
  return { ...api, ...props, user: userEvent.setup() }
}
const card = () => document.querySelector<HTMLElement>('[data-slot="conditions-card"]') as HTMLElement
const names = ['Propor outra', 'Propor condições', 'Alterar', 'Aceitar condições', 'Cancelar partida', 'Registrar W.O.', 'Ajustar']

describe('cartão de condições do campeonato', () => {
  it('sem data: o organizador ainda vai definir; nada de propor, aceitar, reserva ou cancelar', async () => {
    renderMatch(championship())
    const trigger = await screen.findByRole('button', { name: /Data e quadra/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(card().getAttribute('data-origin')).toBe('campeonato')
    expect(within(card()).getByText('O organizador ainda vai definir data, horário e quadra. Você é avisado quando estiver agendada.')).not.toBeNull()
    expect(within(card()).getByText('Copa Sudoeste Society · fase 1')).not.toBeNull()
    expect(within(card()).getByText('Data, horário e quadra são do organizador. A reserva é com o local; o Arena só registra.')).not.toBeNull()
    for (const name of names) expect(screen.queryByRole('button', { name })).toBeNull()
    expect(within(card()).queryByText(/Reserva/)).toBeNull()
  })

  it('agendada pelo organizador: mostra a data e a quadra do cartão, sem reserva nem aceite', async () => {
    const startsAt = fromNow(72)
    renderMatch(championship({ state: 'agendada', phase: 'agendada', starts_at: startsAt, court: court({ name: 'Quadra Central', address: 'SQSW 304' }), result_deadline: fromNow(120), terms: { current: null, pending: null }, booking: null }))
    const trigger = await screen.findByRole('button', { name: /Partida agendada/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.textContent).toContain('Quadra Central')
    await userEvent.setup().click(trigger)
    expect(within(card()).getByText('Quadra Central')).not.toBeNull()
    expect(within(card()).getByText('SQSW 304')).not.toBeNull()
    for (const name of names) expect(screen.queryByRole('button', { name })).toBeNull()
    expect(within(card()).queryByText(/Reserva/)).toBeNull()
  })

  it('quadra sugerida pelo organizador fica "em revisão" e vale só nesta partida', async () => {
    renderMatch(championship({ state: 'agendada', phase: 'agendada', starts_at: fromNow(48), result_deadline: fromNow(96), court: court({ name: 'Ginásio do Guará', state: 'em_revisao', provisional: true }) }))
    await userEvent.setup().click(await screen.findByRole('button', { name: /Partida agendada/ }))
    expect(within(card()).getByText('Sugestão em revisão')).not.toBeNull()
    expect(within(card()).getByText('vale só para esta partida')).not.toBeNull()
  })

  it('partida cancelada pelo evento mostra o motivo e esconde o texto do organizador', async () => {
    renderMatch(championship({ state: 'cancelada', phase: 'cancelada', cancellation: { at: fromNow(-1), by: null, reason: 'Evento cancelado: quadra interditada.' } }))
    expect(await screen.findByText('Partida cancelada')).not.toBeNull()
    expect(screen.getByText('Motivo: Evento cancelado: quadra interditada.')).not.toBeNull()
    expect(within(card()).queryByText(/ainda vai definir/)).toBeNull()
  })

  it('o placar divergente avisa que o organizador decide, e não que a partida fica sem resultado', async () => {
    renderMatch(championship({
      state: 'agendada', phase: 'divergente', starts_at: fromNow(-3), result_deadline: fromNow(45), court: court(),
      permissions: { ...noPermissions, read_chat: true, write_chat: true, report_result: true },
      result: resultOf({ state: 'divergente', deadline: fromNow(45), reports: { a: report('a', 2, 0), b: report('b', 1, 1) } }),
    }))
    const status = await screen.findByText(/o organizador decide se os placares seguirem diferentes/)
    expect(status.textContent).not.toContain('não pontua')
  })
})

describe('organizador na partida', () => {
  it('"Agendar" (os dois lados, combinando) leva à lista de partidas do evento', async () => {
    const { user, onSchedule } = renderMatch(asOrganizer({ permissions: { ...organizerPermissions, schedule_match: true } }))
    await user.click(await screen.findByRole('button', { name: 'Agendar' }))
    expect(onSchedule).toHaveBeenCalledWith(5)
    expect(screen.queryByRole('button', { name: 'Decidir resultado' })).toBeNull()
  })

  it('agendada antes do início: "Reagendar"; depois do início: "Decidir resultado" leva à decisão', async () => {
    const started = asOrganizer({
      state: 'agendada', phase: 'informar_resultado', starts_at: fromNow(-2), court: court(), result_deadline: fromNow(46),
      result: resultOf({ deadline: fromNow(46) }), permissions: { ...organizerPermissions, decide_result: true },
    })
    const { user, onDecide } = renderMatch(started)
    await user.click(await screen.findByRole('button', { name: 'Decidir resultado' }))
    expect(onDecide).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Agendar' })).toBeNull()
    cleanup()
    const before = renderMatch(asOrganizer({ state: 'agendada', phase: 'agendada', starts_at: fromNow(30), court: court(), result_deadline: fromNow(78), permissions: { ...organizerPermissions, schedule_match: true } }))
    await before.user.click(await screen.findByRole('button', { name: /Partida agendada/ }))
    await before.user.click(screen.getByRole('button', { name: 'Reagendar' }))
    expect(before.onSchedule).toHaveBeenCalledWith(5)
  })

  it('sem permissão de agendar nem de decidir, não há botões do organizador', async () => {
    renderMatch(asOrganizer())
    await screen.findByRole('button', { name: /Data e quadra/ })
    expect(screen.queryByRole('button', { name: 'Agendar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Decidir resultado' })).toBeNull()
  })

  it('o organizador não vê o cartão de elenco e estatísticas (os times registram a presença)', async () => {
    renderMatch(asOrganizer({
      state: 'agendada', phase: 'informar_resultado', starts_at: fromNow(-2), court: court(), result_deadline: fromNow(46),
      result: resultOf({ deadline: fromNow(46) }), permissions: { ...organizerPermissions, decide_result: true },
    }), { 'GET /matches/1/stats': { items: [{ user: ricardo, side: 'a', guest: false, position: 'atacante', present: true, stat: null, points: null, can_review: false, can_contest: false }] } })
    await screen.findByRole('button', { name: 'Decidir resultado' })
    expect(screen.queryByRole('button', { name: /Elenco e estatísticas/ })).toBeNull()
  })

  it('cabeçalho com um lado só: "A definir" no lugar do adversário', async () => {
    renderMatch(asOrganizer({ sides: sides({ is_mine: false }).slice(0, 1) }))
    const title = await screen.findByRole('heading', { level: 1, name: /Ferrugem FC contra A definir/ })
    expect(Array.from(title.querySelectorAll('b')).map(item => item.textContent)).toEqual(['Ferrugem', 'A definir'])
  })
})

describe('organizador no chat', () => {
  const organizerMessage = (id: number, overrides: Parameters<typeof message>[1] = {}) => message(id, {
    body: 'Os dois times: o jogo é às 16h.', author: { id: 9, name: 'Rafa Nunes', username: 'rafa', avatar_url: null }, side: null, author_role: 'organizador', ...overrides,
  })

  it('o time vê a mensagem do organizador com a etiqueta "Organizador", sem o nome de um time', async () => {
    renderMatch(championship({ my_role: 'representante' }), {
      'GET /matches/1/messages': page([message(1, { body: 'Bom jogo!', author: caio, side: 'b', author_role: 'representante' }), organizerMessage(2)]),
    })
    expect(await screen.findByText('Os dois times: o jogo é às 16h.')).not.toBeNull()
    const group = screen.getByText('Os dois times: o jogo é às 16h.').closest('[data-slot="chat-group"]') as HTMLElement
    expect(within(group).getByText('Organizador')).not.toBeNull()
    expect(group.querySelector('[data-slot="organizer-tag"]')).not.toBeNull()
    expect(within(group).getByText('Rafa Nunes')).not.toBeNull()
    expect(group.getAttribute('data-side')).toBeNull()
    // A mensagem de um time continua com o nome do time, sem a etiqueta.
    const other = screen.getByText('Bom jogo!').closest('[data-slot="chat-group"]') as HTMLElement
    expect(other.querySelector('[data-slot="organizer-tag"]')).toBeNull()
  })

  it('o organizador escreve no chat e vê a própria mensagem à direita, como "Você"', async () => {
    renderMatch(asOrganizer(), {
      'GET /matches/1/messages': page([organizerMessage(2, { is_mine: true }), event(3, 'resultado_decidido', 'O organizador decidiu o resultado.')]),
    })
    const bubble = await screen.findByText('Os dois times: o jogo é às 16h.')
    const group = bubble.closest('[data-slot="chat-group"]') as HTMLElement
    expect(within(group).getByText('Você')).not.toBeNull()
    expect(within(group).getByText('Organizador')).not.toBeNull()
    expect(group.className).toContain('self-end')
    expect(screen.getByPlaceholderText('Mensagem para os dois times')).not.toBeNull()
    expect(screen.getByText('O organizador decidiu o resultado.')).not.toBeNull()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import type { ArenaNotification, NotificationSummary } from '../src/api/notifications'
import { PendingPlate } from '../src/components/notifications/PendingPlate'
import HomePage from '../src/pages/HomePage'
import { noteOf, summaryOf } from './notifications-fixtures'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

const NOON = new Date(2026, 9, 13, 12, 0, 0)
const minutesAgo = (minutes: number) => new Date(NOON.getTime() - minutes * 60_000).toISOString()
const minutesAhead = (minutes: number) => new Date(NOON.getTime() + minutes * 60_000).toISOString()
const proposal = noteOf(2, 'proposta_partida', { match_id: 12, opponent_name: 'Tigres do Lago', format: 'society' },
  { category: 'partidas', pending: true, created_at: minutesAgo(8), action_until: minutesAhead(112) })
const invite = noteOf(1, 'convite_time', { team_id: 9, team_name: 'Leões do Cerrado' },
  { actor: { id: 30, name: 'Caio Ramos', username: 'caio', avatar_url: null }, category: 'times', pending: true, created_at: minutesAgo(30) })
const warOff = noteOf(3, 'wo_registrado', { match_id: 13, opponent_name: 'Atlético Norte' },
  { category: 'partidas', pending: true, created_at: minutesAgo(10 * 60), action_until: minutesAhead(120) })

let calls: string[]
function serve({ pending = [proposal, invite], summary = summaryOf({ unread_count: 2, follow_requests_count: 1, pending_count: pending.length }), failPending = false, failRead = false }:
  { pending?: ArenaNotification[]; summary?: NotificationSummary; failPending?: boolean; failRead?: boolean } = {}) {
  calls = []
  vi.mocked(request).mockImplementation(async (path, method) => {
    calls.push(`${method ?? 'GET'} ${path}`)
    if (path.startsWith('/me/notifications/pending')) {
      if (failPending) throw new ApiError('Serviço indisponível.', 503)
      return { items: pending.slice(0, Number(new URL(path, 'http://arena.test').searchParams.get('limit') ?? 20)) } as never
    }
    if (method === 'PUT' && /^\/me\/notifications\/\d+\/read$/.test(path)) {
      if (failRead) throw new ApiError('Notificação não encontrada.', 404)
      return summaryOf({ ...summary, unread_count: summary.unread_count - 1 }) as never
    }
    throw new Error(`rota inesperada ${path}`)
  })
}
const summaryState = (data: NotificationSummary | null) => ({
  data, count: (data?.unread_count ?? 0) + (data?.follow_requests_count ?? 0), error: '', reload: vi.fn(async () => {}), setData: vi.fn(),
})
const renderHome = (state: ReturnType<typeof summaryState>, go = vi.fn(), isAdmin = false) => {
  render(<HomePage firstName="Eu" profiles={[]} loading={false} summary={state} isAdmin={isAdmin} go={go} onExpired={vi.fn()} />)
  return go
}

beforeEach(() => {
  vi.mocked(request).mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOON)
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Início: sino', () => {
  it('mostra o total (não lidas e pedidos para seguir) e abre as notificações', async () => {
    serve()
    const go = renderHome(summaryState(summaryOf({ unread_count: 11, follow_requests_count: 1 })))
    const bell = screen.getByRole('button', { name: 'Notificações, 12 novas' })
    expect(bell.textContent).toBe('9+')
    await userEvent.setup().click(bell)
    expect(go).toHaveBeenCalledWith('notifications')
  })

  it('sem novidades, o sino fica sem contador e o Início não lê a contagem sozinho', async () => {
    serve({ pending: [] })
    renderHome(summaryState(summaryOf()))
    expect(screen.getByRole('button', { name: 'Notificações' })).not.toBeNull()
    expect(screen.queryByTestId('unread-indicator')).toBeNull()
    await screen.findByRole('heading', { name: 'Seu elo' })
    expect(calls.some(call => call.includes('unread-count') || call.includes('/summary'))).toBe(false)
  })
})

describe('Início: placa "Para responder"', () => {
  it('lê as 2 pendências mais urgentes e mostra o total e o link para a tela', async () => {
    serve({ pending: [proposal, invite, warOff] })
    const go = renderHome(summaryState(summaryOf({ unread_count: 2, pending_count: 3 })))
    const plate = await screen.findByRole('region', { name: /Para responder/ })
    expect(calls).toContain('GET /me/notifications/pending?limit=2')
    expect(within(plate).getAllByRole('listitem')).toHaveLength(2)
    expect(within(plate).getByLabelText('3 pendências').textContent).toBe('3')
    expect(plate.textContent).toContain('Partida encontrada')
    expect(plate.textContent).toContain('Tigres do Lago · society 7')
    expect(plate.textContent).toContain('faltam 1 h 52')
    expect(plate.textContent).toContain('Convite de time')
    expect(plate.textContent).toContain('sem prazo')
    await userEvent.setup().click(within(plate).getByRole('button', { name: 'Ver as 3 pendências' }))
    expect(go).toHaveBeenCalledWith('notifications', { filter: 'responder' })
    // Vem abaixo do cumprimento e antes de "Seu elo".
    const greeting = screen.getByRole('heading', { name: /Bora jogar/ })
    const elo = screen.getByRole('heading', { name: 'Seu elo' })
    expect(greeting.compareDocumentPosition(plate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(plate.compareDocumentPosition(elo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('com 2 pendências ou menos, o link vira "Ver notificações"', async () => {
    serve({ pending: [proposal, invite] })
    renderHome(summaryState(summaryOf({ pending_count: 2 })))
    const plate = await screen.findByRole('region', { name: /Para responder/ })
    expect(within(plate).getByRole('button', { name: 'Ver notificações' })).not.toBeNull()
    expect(within(plate).getByLabelText('2 pendências')).not.toBeNull()
  })

  it('tocar numa linha marca como lida, atualiza o resumo e leva ao destino', async () => {
    serve({ pending: [proposal, invite] })
    const state = summaryState(summaryOf({ unread_count: 2, pending_count: 2 }))
    const go = renderHome(state)
    const plate = await screen.findByRole('region', { name: /Para responder/ })
    await userEvent.setup().click(within(plate).getByRole('button', { name: /Partida encontrada/ }))
    expect(calls).toContain('PUT /me/notifications/2/read')
    await waitFor(() => expect(go).toHaveBeenCalledWith('play', { matchId: 12 }))
    expect(state.setData).toHaveBeenCalledWith(expect.objectContaining({ unread_count: 1 }))
  })

  it('a navegação segue mesmo se marcar como lida falhar', async () => {
    serve({ pending: [invite], failRead: true })
    const go = renderHome(summaryState(summaryOf({ pending_count: 1 })))
    const plate = await screen.findByRole('region', { name: /Para responder/ })
    await userEvent.setup().click(within(plate).getByRole('button', { name: /Convite de time/ }))
    await waitFor(() => expect(go).toHaveBeenCalledWith('teams', { teamId: 9, invites: true }))
  })

  it('uma pendência já lida só navega', async () => {
    serve({ pending: [{ ...invite, read_at: minutesAgo(1) }] })
    const go = renderHome(summaryState(summaryOf({ pending_count: 1 })))
    const plate = await screen.findByRole('region', { name: /Para responder/ })
    await userEvent.setup().click(within(plate).getByRole('button', { name: /Convite de time/ }))
    expect(go).toHaveBeenCalledWith('teams', { teamId: 9, invites: true })
    expect(calls.some(call => call.startsWith('PUT'))).toBe(false)
  })

  it('sem pendências, a placa não aparece e nem lê a lista', async () => {
    serve({ pending: [] })
    renderHome(summaryState(summaryOf({ unread_count: 3, pending_count: 0 })))
    await screen.findByRole('heading', { name: 'Seu elo' })
    expect(screen.queryByRole('region', { name: /Para responder/ })).toBeNull()
    expect(calls.some(call => call.includes('/pending'))).toBe(false)
  })

  it('sem o resumo ainda, a placa não aparece', async () => {
    serve()
    renderHome(summaryState(null))
    await screen.findByRole('heading', { name: 'Seu elo' })
    expect(screen.queryByRole('region', { name: /Para responder/ })).toBeNull()
  })

  it('se a leitura falhar, a placa não aparece e o Início segue inteiro', async () => {
    serve({ failPending: true })
    renderHome(summaryState(summaryOf({ pending_count: 3 })))
    await waitFor(() => expect(calls).toContain('GET /me/notifications/pending?limit=2'))
    expect(screen.getByRole('heading', { name: /Bora jogar/ })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Seu elo' })).not.toBeNull()
    expect(screen.queryByRole('region', { name: /Para responder/ })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('lê as pendências de novo quando o resumo muda', async () => {
    serve({ pending: [proposal, invite] })
    const first = summaryState(summaryOf({ unread_count: 2, pending_count: 2 }))
    const { rerender } = render(<HomePage firstName="Eu" profiles={[]} loading={false} summary={first} go={vi.fn()} onExpired={vi.fn()} />)
    await screen.findByRole('region', { name: /Para responder/ })
    const reads = () => calls.filter(call => call.includes('/pending')).length
    expect(reads()).toBe(1)
    rerender(<HomePage firstName="Eu" profiles={[]} loading={false} summary={summaryState(summaryOf({ unread_count: 3, pending_count: 2 }))} go={vi.fn()} onExpired={vi.fn()} />)
    await waitFor(() => expect(reads()).toBe(2))
    expect(screen.getByRole('region', { name: /Para responder/ })).not.toBeNull()
  })
})

describe('PendingPlate', () => {
  it('mostra no máximo 2 linhas, a etiqueta âmbar com pouco prazo e o destino da administração', async () => {
    const adminItem = noteOf(5, 'evento_para_aprovar', { event_id: 5, event_name: 'Copa Sudoeste' }, { category: 'eventos', pending: true, created_at: minutesAgo(5) })
    const onOpenItem = vi.fn()
    render(<PendingPlate items={[warOff, adminItem, proposal]} total={3} now={NOON.getTime()} isAdmin onOpenItem={onOpenItem} onOpenAll={vi.fn()} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('W.O. registrado')
    expect(rows[0].textContent).toContain('faltam 2 h')
    expect(rows[0].querySelector('span.text-\\[\\#ffcf6b\\]')).not.toBeNull()
    expect(rows[1].textContent).toContain('Evento para aprovar')
    await userEvent.setup().click(within(rows[1]).getByRole('button'))
    expect(onOpenItem).toHaveBeenCalledWith(adminItem)
  })
})

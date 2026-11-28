import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import type { ArenaNotification, NotificationSummary } from '../src/api/notifications'
import { morePendingLabel, urgencyLabel } from '../src/data/home'
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
/** Pendência sem tela própria: o comprovante recusado sem `event_id` no aviso. */
const orphan = noteOf(4, 'comprovante_decidido', { decision: 'recusado', event_name: 'Copa Sudoeste' },
  { category: 'eventos', pending: true, created_at: minutesAgo(60) })

let calls: string[]
function serve({ pending = [proposal, invite], summary = summaryOf({ unread_count: 2, follow_requests_count: 1, pending_count: pending.length }), failPending = 0, failRead = 0 }:
  { pending?: ArenaNotification[]; summary?: NotificationSummary; failPending?: number; failRead?: number } = {}) {
  calls = []
  vi.mocked(request).mockImplementation(async (path, method) => {
    calls.push(`${method ?? 'GET'} ${path}`)
    if (path.startsWith('/me/notifications/pending')) {
      if (failPending) throw new ApiError('Serviço indisponível.', failPending)
      return { items: pending.slice(0, Number(new URL(path, 'http://arena.test').searchParams.get('limit') ?? 20)) } as never
    }
    if (method === 'PUT' && /^\/me\/notifications\/\d+\/read$/.test(path)) {
      if (failRead) throw new ApiError('Não foi possível marcar como lida.', failRead)
      return summaryOf({ ...summary, unread_count: summary.unread_count - 1 }) as never
    }
    throw new Error(`rota inesperada ${path}`)
  })
}
const summaryState = (data: NotificationSummary | null) => ({
  data, count: (data?.unread_count ?? 0) + (data?.follow_requests_count ?? 0), error: '', reload: vi.fn(async () => {}), setData: vi.fn(),
})
const renderHome = (state: ReturnType<typeof summaryState>, go = vi.fn(), isAdmin = false, onExpired = vi.fn()) => {
  render(<HomePage firstName="Eu" profiles={[]} loading={false} summary={state} isAdmin={isAdmin} go={go} onExpired={onExpired} />)
  return go
}

beforeEach(() => {
  vi.mocked(request).mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOON)
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Início: sino', () => {
  it('mostra o total (não lidas e pedidos de aliança) e abre as notificações', async () => {
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

describe('Textos do Destaque', () => {
  it('"Mais urgente" com o prazo no fim; "Aguardando você" nos demais casos', () => {
    expect(urgencyLabel(true)).toBe('Mais urgente')
    expect(urgencyLabel(false)).toBe('Aguardando você')
  })

  it('link "+ n" só com mais de 1 pendência, no singular com 1 restante', () => {
    expect(morePendingLabel(0)).toBeNull()
    expect(morePendingLabel(1)).toBeNull()
    expect(morePendingLabel(2)).toBe('+ 1 pendência · ver todas')
    expect(morePendingLabel(3)).toBe('+ 2 pendências · ver todas')
    expect(morePendingLabel(Number.NaN)).toBeNull()
  })
})

describe('Início: Destaque "Para responder"', () => {
  const destaque = () => screen.findByRole('region', { name: 'Para responder' })
  const cardOf = (region: HTMLElement) => region.querySelector<HTMLButtonElement>('[data-slot="destaque-card"]')!

  it('abaixo do botão principal e antes de "Seu elo": o total no selo e só a primeira pendência da lista, pedindo 1 item', async () => {
    serve({ pending: [proposal, invite, warOff] })
    renderHome(summaryState(summaryOf({ unread_count: 2, pending_count: 3 })))
    const region = await destaque()
    expect(calls).toContain('GET /me/notifications/pending?limit=1')
    expect(calls.some(call => call.includes('limit=2'))).toBe(false)
    expect(within(region).getByLabelText('3 pendências').textContent).toBe('3')
    const card = within(region).getByRole('button', { name: 'Aguardando você: partida encontrada. Tigres do Lago · society 7. faltam 1 h 52' })
    expect(card).toBe(cardOf(region))
    expect(card.textContent).toContain('Aguardando você')
    expect(card.textContent).toContain('PARTIDA ENCONTRADA')
    expect(card.textContent).toContain('Tigres do Lago · society 7')
    expect(card.textContent).toContain('faltam 1 h 52')
    expect(card.textContent).toContain('Responder')
    expect(region.textContent).not.toContain('CONVITE DE TIME')
    // Uma única ação no cartão: o "Responder" é só visual, sem controle aninhado.
    expect(card.querySelectorAll('button, a, input, [role="button"]')).toHaveLength(0)
    expect(card.hasAttribute('data-warn')).toBe(false)
    expect(card.className).not.toContain('border-l-[#d99400]')
    // A placa escura saiu do Início.
    expect(document.querySelector('[data-slot="pending-plate"]')).toBeNull()
    const button = screen.getByRole('button', { name: /Preparar perfis/ })
    const elo = screen.getByRole('heading', { name: 'Seu elo' })
    expect(button.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(region.compareDocumentPosition(elo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('com o prazo no fim: "Mais urgente", prazo em âmbar e borda âmbar à esquerda', async () => {
    serve({ pending: [warOff] })
    renderHome(summaryState(summaryOf({ pending_count: 1 })))
    const card = cardOf(await destaque())
    expect(card.getAttribute('aria-label')).toBe('Mais urgente: w.o. registrado. Atlético Norte. faltam 2 h')
    expect(card.querySelector('[data-slot="destaque-urgency"]')?.textContent).toBe('Mais urgente')
    expect(card.querySelector('[data-slot="destaque-urgency"]')?.className).toContain('text-warning')
    expect(card.querySelector('[data-slot="destaque-deadline"]')?.textContent).toBe('faltam 2 h')
    expect(card.querySelector('[data-slot="destaque-deadline"]')?.className).toContain('text-warning')
    expect(card.hasAttribute('data-warn')).toBe(true)
    expect(card.className).toContain('border-l-[#d99400]')
  })

  it('sem prazo: "Aguardando você" e "sem prazo"', async () => {
    serve({ pending: [invite] })
    renderHome(summaryState(summaryOf({ pending_count: 1 })))
    const card = cardOf(await destaque())
    expect(card.querySelector('[data-slot="destaque-urgency"]')?.textContent).toBe('Aguardando você')
    expect(card.textContent).toContain('CONVITE DE TIME')
    expect(card.textContent).toContain('Caio Ramos · Leões do Cerrado')
    expect(card.querySelector('[data-slot="destaque-deadline"]')?.textContent).toBe('sem prazo')
    expect(card.getAttribute('aria-label')).toBe('Aguardando você: convite de time. Caio Ramos · Leões do Cerrado. sem prazo')
  })

  it('tocar no cartão marca como lida, atualiza o resumo e leva ao destino', async () => {
    serve({ pending: [proposal, invite] })
    const state = summaryState(summaryOf({ unread_count: 2, pending_count: 2 }))
    const go = renderHome(state)
    await userEvent.setup().click(cardOf(await destaque()))
    expect(calls).toContain('PUT /me/notifications/2/read')
    await waitFor(() => expect(go).toHaveBeenCalledWith('play', { matchId: 12 }))
    expect(state.setData).toHaveBeenCalledWith(expect.objectContaining({ unread_count: 1 }))
  })

  it('pelo teclado: o cartão recebe foco e abre com Enter', async () => {
    serve({ pending: [{ ...invite, read_at: minutesAgo(1) }] })
    const go = renderHome(summaryState(summaryOf({ pending_count: 1 })))
    const card = cardOf(await destaque())
    const user = userEvent.setup()
    card.focus()
    expect(document.activeElement).toBe(card)
    await user.keyboard('{Enter}')
    expect(go).toHaveBeenCalledWith('teams', { teamId: 9, invites: true })
  })

  it('uma pendência já lida só navega', async () => {
    serve({ pending: [{ ...invite, read_at: minutesAgo(1) }] })
    const go = renderHome(summaryState(summaryOf({ pending_count: 1 })))
    await userEvent.setup().click(cardOf(await destaque()))
    expect(go).toHaveBeenCalledWith('teams', { teamId: 9, invites: true })
    expect(calls.some(call => call.startsWith('PUT'))).toBe(false)
  })

  it('a navegação segue mesmo se marcar como lida falhar', async () => {
    serve({ pending: [invite], failRead: 404 })
    const go = renderHome(summaryState(summaryOf({ pending_count: 1 })))
    await userEvent.setup().click(cardOf(await destaque()))
    await waitFor(() => expect(go).toHaveBeenCalledWith('teams', { teamId: 9, invites: true }))
  })

  it('sem destino no aviso, marca como lida e abre as notificações no filtro Para responder (mesmo se marcar falhar)', async () => {
    serve({ pending: [orphan] })
    const go = renderHome(summaryState(summaryOf({ pending_count: 1 })))
    await userEvent.setup().click(cardOf(await destaque()))
    expect(calls).toContain('PUT /me/notifications/4/read')
    await waitFor(() => expect(go).toHaveBeenCalledWith('notifications', { filter: 'responder' }))
    cleanup()
    serve({ pending: [orphan], failRead: 500 })
    const again = renderHome(summaryState(summaryOf({ pending_count: 1 })))
    await userEvent.setup().click(cardOf(await destaque()))
    await waitFor(() => expect(again).toHaveBeenCalledWith('notifications', { filter: 'responder' }))
  })

  it('sessão expirada ao marcar como lida encerra a sessão e não navega', async () => {
    serve({ pending: [proposal], failRead: 401 })
    const onExpired = vi.fn()
    const go = renderHome(summaryState(summaryOf({ pending_count: 1 })), vi.fn(), false, onExpired)
    await userEvent.setup().click(cardOf(await destaque()))
    await waitFor(() => expect(onExpired).toHaveBeenCalled())
    expect(go).not.toHaveBeenCalled()
  })

  it('sessão expirada na leitura das pendências encerra a sessão pelo fluxo existente', async () => {
    serve({ failPending: 401 })
    const onExpired = vi.fn()
    renderHome(summaryState(summaryOf({ pending_count: 1 })), vi.fn(), false, onExpired)
    await waitFor(() => expect(onExpired).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: 'Para responder' })).toBeNull()
  })

  it('link "+ n pendências · ver todas" só com mais de 1, no singular com 2, abrindo o filtro Para responder', async () => {
    serve({ pending: [proposal] })
    const go = renderHome(summaryState(summaryOf({ pending_count: 3 })))
    const link = within(await destaque()).getByRole('button', { name: 'Ver todas as 3 pendências' })
    expect(link.textContent).toBe('+ 2 pendências · ver todas')
    await userEvent.setup().click(link)
    expect(go).toHaveBeenCalledWith('notifications', { filter: 'responder' })
    cleanup()
    serve({ pending: [proposal] })
    renderHome(summaryState(summaryOf({ pending_count: 2 })))
    expect(within(await destaque()).getByRole('button', { name: 'Ver todas as 2 pendências' }).textContent).toBe('+ 1 pendência · ver todas')
    cleanup()
    serve({ pending: [proposal] })
    renderHome(summaryState(summaryOf({ pending_count: 1 })))
    const single = await destaque()
    expect(single.textContent).not.toContain('ver todas')
    expect(within(single).getAllByRole('button')).toHaveLength(1)
  })

  it('sem pendências, o Destaque não aparece e nem lê a lista', async () => {
    serve({ pending: [] })
    renderHome(summaryState(summaryOf({ unread_count: 3, pending_count: 0 })))
    await screen.findByRole('heading', { name: 'Seu elo' })
    expect(screen.queryByRole('region', { name: 'Para responder' })).toBeNull()
    expect(calls.some(call => call.includes('/pending'))).toBe(false)
  })

  it('com o total positivo mas a lista vazia, o Destaque não aparece', async () => {
    serve({ pending: [], summary: summaryOf({ pending_count: 2 }) })
    renderHome(summaryState(summaryOf({ pending_count: 2 })))
    await waitFor(() => expect(calls).toContain('GET /me/notifications/pending?limit=1'))
    expect(screen.queryByRole('region', { name: 'Para responder' })).toBeNull()
  })

  it('sem o resumo ainda, o Destaque não aparece', async () => {
    serve()
    renderHome(summaryState(null))
    await screen.findByRole('heading', { name: 'Seu elo' })
    expect(screen.queryByRole('region', { name: 'Para responder' })).toBeNull()
  })

  it('se a leitura falhar, o Destaque não aparece e o Início segue inteiro', async () => {
    serve({ failPending: 503 })
    const onExpired = vi.fn()
    renderHome(summaryState(summaryOf({ pending_count: 3 })), vi.fn(), false, onExpired)
    await waitFor(() => expect(calls).toContain('GET /me/notifications/pending?limit=1'))
    expect(screen.getByRole('heading', { name: /A arena te chama/ })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Seu elo' })).not.toBeNull()
    expect(screen.queryByRole('region', { name: 'Para responder' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('lê a pendência de novo quando o resumo muda', async () => {
    serve({ pending: [proposal, invite] })
    const first = summaryState(summaryOf({ unread_count: 2, pending_count: 2 }))
    const { rerender } = render(<HomePage firstName="Eu" profiles={[]} loading={false} summary={first} go={vi.fn()} onExpired={vi.fn()} />)
    await destaque()
    const reads = () => calls.filter(call => call.includes('/pending')).length
    expect(reads()).toBe(1)
    rerender(<HomePage firstName="Eu" profiles={[]} loading={false} summary={summaryState(summaryOf({ unread_count: 3, pending_count: 2 }))} go={vi.fn()} onExpired={vi.fn()} />)
    await waitFor(() => expect(reads()).toBe(2))
    expect(screen.getByRole('region', { name: 'Para responder' })).not.toBeNull()
  })
})

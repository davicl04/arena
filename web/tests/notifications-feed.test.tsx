import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import type { ArenaNotification } from '../src/api/notifications'
import { notificationView } from '../src/data/notifications'
import HomePage from '../src/pages/HomePage'
import NotificationsPage from '../src/pages/NotificationsPage'
import { relativeTime } from '../src/utils/relativeTime'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

const caio = { id: 30, name: 'Caio Ramos', username: 'caio', avatar_url: null }
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString()
const note = (id: number, type: string, payload: Record<string, unknown>, extra: Partial<ArenaNotification> = {}): ArenaNotification =>
  ({ id, type, payload, actor: null, created_at: hoursAgo(id), read_at: null, ...extra })
const invite = note(1, 'convite_time', { team_id: 9, team_name: 'Leões do Cerrado', invite_id: 3 }, { actor: caio })
const refused = note(2, 'pedido_organizador_decidido', { request_id: 4, decision: 'recusado', reason_code: 'pouca_informacao', reason_detail: null })
const removed = note(3, 'removido_do_time', { team_id: 9, team_name: 'Leões do Cerrado' })
const accepted = note(4, 'convite_aceito', { team_id: 9, team_name: 'Leões do Cerrado', invite_id: 3 }, { actor: caio, read_at: hoursAgo(1) })

let calls: { path: string; method?: string; body?: unknown }[]
function mockApi(items: ArenaNotification[], { unread = items.filter(item => !item.read_at).length, failRead = false, next = null as string | null } = {}) {
  calls = []
  let count = unread
  vi.mocked(request).mockImplementation(async (path, method, body) => {
    calls.push({ path, method, body })
    if (path === '/me/follow-requests') return { items: [], next_cursor: null } as never
    if (path === '/me/notifications') return { items, next_cursor: next } as never
    if (path.startsWith('/me/notifications?cursor=')) return { items: [note(40, 'time_encerrado', { team_id: 8, team_name: 'Ferrugem FC' }, { read_at: hoursAgo(1) })], next_cursor: null } as never
    if (path === '/me/notifications/unread-count') return { unread_count: count } as never
    if (path === '/me/notifications/read-all') { count = 0; return { unread_count: 0 } as never }
    const read = path.match(/^\/me\/notifications\/(\d+)\/read$/)
    if (read) {
      if (failRead) throw new ApiError('Notificação não encontrada.', 404)
      count = Math.max(0, count - 1)
      return { unread_count: count } as never
    }
    throw new Error(`rota inesperada ${path}`)
  })
}
function renderPage() {
  const onNavigate = vi.fn()
  render(<NotificationsPage onOpenUser={vi.fn()} onNavigate={onNavigate} onExpired={vi.fn()} />)
  return onNavigate
}

beforeEach(() => { vi.mocked(request).mockReset() })
afterEach(cleanup)

describe('Notificações da conta', () => {
  it('lista as atividades com texto, tempo relativo e estado de leitura', async () => {
    mockApi([invite, refused, removed, accepted])
    renderPage()
    const list = await screen.findByRole('list', { name: 'Notificações da conta' })
    const items = within(list).getAllByRole('listitem')
    // O escudo neutro (decorativo) traz as iniciais do time citado no aviso.
    expect(items.map(item => item.textContent)).toEqual([
      'LCCaio Ramos convidou você para o Leões do Cerradohá 1 hora · não lida',
      'Seu pedido de organizador foi recusado: Pouca informaçãohá 2 horas · não lida',
      'LCVocê foi removido do Leões do Cerradohá 3 horas · não lida',
      'LCCaio Ramos aceitou o convite e entrou no Leões do Cerradohá 4 horas',
    ])
    expect(items.filter(item => item.hasAttribute('data-unread'))).toHaveLength(3)
    expect(screen.getByRole('heading', { name: /^Atividades\s*3\s*não lidas$/ })).not.toBeNull()
    expect(items[0].querySelector('[data-slot="team-crest"]')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('ao tocar, marca como lida e abre a folha de convites, com o time do convite', async () => {
    mockApi([invite, accepted])
    const onNavigate = renderPage()
    await userEvent.setup().click(await screen.findByRole('button', { name: /convidou você/ }))
    expect(calls).toContainEqual({ path: '/me/notifications/1/read', method: 'PUT', body: {} })
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'teams', teamId: 9, invites: true })
  })

  it('leva o aceite ao time no carrossel, sem a folha de convites', async () => {
    mockApi([accepted])
    const onNavigate = renderPage()
    await userEvent.setup().click(await screen.findByRole('button', { name: /aceitou o convite/ }))
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'teams', teamId: 9 })
  })

  it('leva as decisões do organizador ao Menu, mesmo se marcar como lida falhar', async () => {
    mockApi([refused], { failRead: true })
    const onNavigate = renderPage()
    await userEvent.setup().click(await screen.findByRole('button', { name: /pedido de organizador/ }))
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'menu' })
  })

  it('sem destino, só marca como lida e fica na tela', async () => {
    mockApi([removed])
    const onNavigate = renderPage()
    const ui = userEvent.setup()
    await ui.click(await screen.findByRole('button', { name: /removido do/ }))
    await waitFor(() => expect(screen.getByText(/removido do/).closest('li')?.hasAttribute('data-unread')).toBe(false))
    expect(onNavigate).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /removido do/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Marcar todas como lidas' })).toBeNull()
  })

  it('mostra o erro ao marcar como lida sem destino', async () => {
    mockApi([removed], { failRead: true })
    const onNavigate = renderPage()
    await userEvent.setup().click(await screen.findByRole('button', { name: /removido do/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('Notificação não encontrada.')
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('marca todas como lidas', async () => {
    mockApi([invite, refused, accepted])
    renderPage()
    const ui = userEvent.setup()
    await ui.click(await screen.findByRole('button', { name: 'Marcar todas como lidas' }))
    expect(calls).toContainEqual({ path: '/me/notifications/read-all', method: 'PUT', body: {} })
    expect((await screen.findByRole('status')).textContent).toBe('Todas as notificações foram marcadas como lidas.')
    expect(document.querySelectorAll('[data-unread]')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Marcar todas como lidas' })).toBeNull()
  })

  it('carrega mais páginas com o cursor', async () => {
    mockApi([accepted], { next: 'n2' })
    renderPage()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Carregar mais notificações' }))
    expect(await screen.findByText('O Ferrugem FC foi encerrado')).not.toBeNull()
    expect(calls.map(call => call.path)).toContain('/me/notifications?cursor=n2')
  })

  it('mostra o estado vazio e o erro com nova tentativa', async () => {
    mockApi([])
    renderPage()
    expect(await screen.findByText('Tudo em dia')).not.toBeNull()
    cleanup()

    let fail = true
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/me/notifications' && fail) throw new ApiError('Serviço indisponível.', 503)
      if (path === '/me/notifications/unread-count') return { unread_count: 0 } as never
      return { items: path === '/me/notifications' ? [accepted] : [], next_cursor: null } as never
    })
    renderPage()
    expect((await screen.findByRole('alert')).textContent).toContain('Serviço indisponível.')
    fail = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText(/aceitou o convite/)).not.toBeNull()
  })
})

describe('indicador de não lidas no Início', () => {
  it('mostra o número de não lidas no sino', async () => {
    vi.mocked(request).mockResolvedValue({ unread_count: 12 } as never)
    const go = vi.fn()
    render(<HomePage firstName="Eu" profiles={[]} loading={false} go={go} onExpired={vi.fn()} />)
    const bell = await screen.findByRole('button', { name: 'Notificações, 12 não lidas' })
    expect(within(bell).getByTestId('unread-indicator').textContent).toBe('9+')
    await userEvent.setup().click(bell)
    expect(go).toHaveBeenCalledWith('notifications')
  })

  it('sem não lidas, o sino fica como antes', async () => {
    vi.mocked(request).mockResolvedValue({ unread_count: 0 } as never)
    render(<HomePage firstName="Eu" profiles={[]} loading={false} go={vi.fn()} onExpired={vi.fn()} />)
    await waitFor(() => expect(request).toHaveBeenCalledWith('/me/notifications/unread-count'))
    expect(screen.getByRole('button', { name: 'Notificações' })).not.toBeNull()
    expect(screen.queryByTestId('unread-indicator')).toBeNull()
  })
})

describe('textos e destinos das notificações', () => {
  it.each([
    [note(1, 'convite_time', { team_id: 9, team_name: 'Leões' }), 'Um representante convidou você para o Leões', { screen: 'teams', teamId: 9, invites: true }],
    [note(1, 'convite_aceito', { team_id: 9, team_name: 'Leões' }), 'Um atleta aceitou o convite e entrou no Leões', { screen: 'teams', teamId: 9 }],
    [note(1, 'pedido_entrada', { team_id: 9, team_name: 'Leões' }, { actor: caio }), 'Caio Ramos pediu para entrar no Leões', { screen: 'teams', teamId: 9, requests: true }],
    [note(1, 'pedido_entrada_decidido', { team_id: 9, team_name: 'Leões', decision: 'aprovado' }), 'Seu pedido para entrar no Leões foi aprovado', { screen: 'teams', teamId: 9 }],
    [note(1, 'pedido_entrada_decidido', { team_id: 9, team_name: 'Leões', decision: 'recusado' }), 'Seu pedido para entrar no Leões foi recusado', null],
    [note(1, 'time_encerrado', { team_name: 'Leões' }), 'O Leões foi encerrado', null],
    [note(1, 'pedido_organizador_decidido', { decision: 'aprovado' }), 'Seu pedido de organizador foi aprovado', { screen: 'menu' }],
    [note(1, 'pedido_organizador_decidido', { decision: 'recusado', reason_code: 'outro', reason_detail: 'Sem eventos' }), 'Seu pedido de organizador foi recusado: Sem eventos', { screen: 'menu' }],
    [note(1, 'organizador_revogado', { reason: 'Eventos sem resposta' }), 'Sua permissão de organizador foi revogada: Eventos sem resposta', { screen: 'menu' }],
    [note(1, 'proposta_partida', {}), 'Nova atividade na sua conta', null],
    [note(1, 'convite_time', {}), 'Um representante convidou você para o time', { screen: 'teams', invites: true }],
  ])('%#: monta o texto e o destino', (item, text, target) => {
    const view = notificationView(item)
    expect(view.text).toBe(text)
    expect(view.target).toEqual(target)
  })

  it('formata o tempo relativo', () => {
    const now = Date.parse('2026-10-12T12:00:00Z')
    expect(relativeTime('2026-10-12T11:59:40Z', now)).toBe('agora')
    expect(relativeTime('2026-10-12T11:15:00Z', now)).toBe('há 45 min')
    expect(relativeTime('2026-10-11T10:00:00Z', now)).toBe('ontem')
    expect(relativeTime('2026-10-08T12:00:00Z', now)).toBe('há 4 dias')
    expect(relativeTime('2026-09-01T12:00:00Z', now)).toMatch(/1.*set/)
    expect(relativeTime('2025-09-01T12:00:00Z', now)).toMatch(/2025/)
    expect(relativeTime('inválida', now)).toBe('')
  })
})

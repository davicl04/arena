import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile, User } from '../src/api/client'
import type { OrganizerStatus } from '../src/api/organizer'
import AdminReports from '../src/components/AdminReports'
import ArenaPage from '../src/pages/ArenaPage'
import { apiError, brasilia, mockApi } from './teams-fixtures'
import { dispute, suggestion } from './admin-match-fixtures'

/*
 * Ligações da administração na etapa 3: o Menu mostra as filas de quadras e de W.O. com os contadores de
 * `queue-counts`, e a Moderação de denúncias trata a mensagem do chat da partida (0002-jogar, seção 11.1).
 */

const me: User = { id: 1, name: 'Ricardo Moura', username: 'ricardo.moura', email: 'r@example.com', birth_date: '1990-01-01', social_public: false, is_admin: true, avatar: null, cover: null }
const football: Profile = { id: 1, sport: 'futebol', city_id: brasilia.id, position: 'atacante', looking_for: false, is_public: false, level: null }
const none: OrganizerStatus = { state: 'nenhum', request: null, organizer: null, revocation: null }
const page = <T,>(items: T[]) => ({ items, next_cursor: null })
const nav = () => within(screen.getByRole('navigation', { name: 'Navegação principal' }))
const counts = { organizer_requests: 0, reports: 1, paid_events: 0, revoked_events: 0, refund_disputes: 0, court_suggestions: 4, walkover_disputes: 1 }

function renderMenu(extra: Record<string, unknown> = {}) {
  const calls = mockApi({
    'GET /me/sports-profiles': [football],
    'GET /cities': [brasilia],
    'GET /me/notifications/unread-count': { unread_count: 0 },
    'GET /me/follow-requests': page([]),
    'GET /me/organizer-request': none,
    'GET /organizer/events?scope=abertos': page([]),
    'GET /admin/queue-counts': counts,
    ...extra,
  })
  const ui = userEvent.setup()
  render(<ArenaPage user={me} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} />)
  return { calls, ui }
}
async function openMenu(ui: ReturnType<typeof userEvent.setup>) {
  await ui.click(nav().getByRole('button', { name: 'Perfil' }))
  await ui.click(await screen.findByRole('button', { name: 'Menu' }))
}

beforeEach(() => { Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Menu → Administração: quadras e W.O.', () => {
  it('mostra as linhas novas e as Denúncias com os contadores de queue-counts, ao lado das existentes', async () => {
    const { ui } = renderMenu()
    await openMenu(ui)
    const admin = (await screen.findByRole('heading', { name: 'Administração' })).nextElementSibling as HTMLElement
    const rows = () => within(admin).getAllByRole('button').map(row => row.textContent)
    await waitFor(() => expect(rows()).toContain('Sugestões de quadra4 pendentes'))
    // Pedidos de organizador, Eventos pagos, revogados e Devoluções sem pendência: sem contador; quadras, W.O. e Denúncias, com.
    expect(rows()).toEqual([
      'Pedidos de organizador', 'Eventos pagos', 'Eventos de organizador revogado', 'Devoluções contestadas',
      'Sugestões de quadra4 pendentes', 'W.O. contestados1 pendente', 'Denúncias1 pendente',
    ])
  })

  it('sem pendências, as linhas aparecem sem contador', async () => {
    const { ui } = renderMenu({ 'GET /admin/queue-counts': { ...counts, court_suggestions: 0, walkover_disputes: 0 } })
    await openMenu(ui)
    const row = await screen.findByRole('button', { name: 'Sugestões de quadra' })
    expect(row.textContent).toBe('Sugestões de quadra')
    expect(screen.getByRole('button', { name: 'W.O. contestados' }).textContent).toBe('W.O. contestados')
  })

  it('abre a fila de quadras com o Perfil aceso, e Voltar devolve ao Menu', async () => {
    const { ui, calls } = renderMenu({
      'GET /admin/court-suggestions?state=em_revisao': page([suggestion()]),
      'GET /matches/12': { sides: [] },
    })
    await openMenu(ui)
    await ui.click(await screen.findByRole('button', { name: /Sugestões de quadra/ }))
    expect(screen.getByRole('heading', { level: 1, name: 'Sugestões de quadra' })).not.toBeNull()
    expect(nav().getByRole('button', { current: 'page' }).textContent).toBe('Perfil')
    expect(await screen.findByRole('button', { name: /Arena Sul/ })).not.toBeNull()
    expect(calls.find('GET', '/admin/court-suggestions?state=em_revisao')).toHaveLength(1)
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('heading', { name: 'Menu' })).not.toBeNull()
  })

  it('abre a fila de W.O. contestados com o Perfil aceso', async () => {
    const { ui, calls } = renderMenu({ 'GET /admin/walkover-disputes': page([dispute()]) })
    await openMenu(ui)
    await ui.click(await screen.findByRole('button', { name: /W\.O\. contestados/ }))
    expect(screen.getByRole('heading', { level: 1, name: 'W.O. contestados' })).not.toBeNull()
    expect(nav().getByRole('button', { current: 'page' }).textContent).toBe('Perfil')
    expect(await screen.findByRole('button', { name: /Ferrugem FC × Tigres do Lago/ })).not.toBeNull()
    expect(calls.find('GET', '/admin/walkover-disputes')).toHaveLength(1)
  })

  it('quem não é da administração não vê as filas novas', async () => {
    const calls = mockApi({
      'GET /me/sports-profiles': [football], 'GET /cities': [brasilia], 'GET /me/notifications/unread-count': { unread_count: 0 },
      'GET /me/follow-requests': page([]), 'GET /me/organizer-request': none, 'GET /organizer/events?scope=abertos': page([]),
    })
    const ui = userEvent.setup()
    render(<ArenaPage user={{ ...me, is_admin: false }} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} />)
    await openMenu(ui)
    await screen.findByRole('heading', { name: 'Conta' })
    expect(screen.queryByRole('button', { name: /Sugestões de quadra/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /W\.O\. contestados/ })).toBeNull()
    expect(calls.find('GET', '/admin/queue-counts')).toHaveLength(0)
  })
})

describe('Moderação: denúncia de mensagem do chat', () => {
  const message = {
    id: 9, target_type: 'match_message', target_id: 44, reason: 'assedio', description: 'Ofensa ao adversário.', status: 'pending', created_at: '2026-10-12T20:00:00Z',
    target_preview: { body: 'Vocês são ridículos.', removed: false, author: 'Caio Ramos', match_id: 12, match: 'Ferrugem FC × Tigres do Lago' },
    target_user_id: 9, target_user_active: true,
  }
  const comment = {
    id: 10, target_type: 'comment', target_id: 5, reason: 'spam', description: null, status: 'pending', created_at: '2026-10-12T21:00:00Z',
    target_preview: { body: 'Compre agora', author: 'Bot' }, target_user_id: 7, target_user_active: true,
  }
  const routes = (extra: Record<string, unknown> = {}) => ({ 'GET /admin/reports?status=pending': page([message, comment]), ...extra })

  it('mostra a prévia com o texto, a partida e o autor, e mantém os outros alvos', async () => {
    mockApi(routes())
    render(<AdminReports onExpired={vi.fn()} />)
    const preview = await screen.findByRole('group', { name: 'Mensagem denunciada' })
    expect(preview.textContent).toContain('Partida #12 · Ferrugem FC × Tigres do Lago')
    expect(preview.textContent).toContain('Caio Ramos')
    expect(preview.textContent).toContain('Vocês são ridículos.')
    expect(screen.getByText('Mensagem da partida · #44')).not.toBeNull()
    expect(screen.getByText('Comentário · #5')).not.toBeNull()
    expect(screen.getByText('Compre agora')).not.toBeNull()
    expect(screen.getByText('Ofensa ao adversário.')).not.toBeNull()
  })

  it('remover avisa que o texto some para todos e confirma depois da decisão', async () => {
    const api = mockApi(routes({ 'POST /admin/reports/9/decision': { report_id: 9, status: 'resolved', action: 'remove' } }))
    const ui = userEvent.setup()
    render(<AdminReports onExpired={vi.fn()} />)
    const preview = await screen.findByRole('group', { name: 'Mensagem denunciada' })
    const article = preview.closest('article') as HTMLElement
    const select = within(article).getByLabelText('Decisão')
    expect(within(select).getByRole('option', { name: 'Remover mensagem' })).not.toBeNull()
    expect(within(article).queryByText(/O texto some para todos/)).toBeNull()
    await ui.selectOptions(select, 'remove')
    expect(within(article).getByRole('status').textContent).toBe('O texto some para todos na partida; o registro fica guardado com a denúncia.')
    await ui.click(within(article).getByRole('button', { name: 'Registrar decisão' }))
    expect(screen.getByRole('alert').textContent).toBe('Informe uma justificativa de pelo menos 5 caracteres.')
    await ui.type(within(article).getByLabelText('Justificativa obrigatória'), 'Ofensa direta ao adversário.')
    await ui.click(within(article).getByRole('button', { name: 'Registrar decisão' }))
    expect((await screen.findByText('Mensagem removida: o texto some para todos na partida e o registro fica guardado.')).getAttribute('role')).toBe('status')
    expect(api.find('POST', '/admin/reports/9/decision')[0].body).toEqual({ action: 'remove', justification: 'Ofensa direta ao adversário.' })
    expect(screen.queryByRole('group', { name: 'Mensagem denunciada' })).toBeNull()
    expect(screen.getByText('Comentário · #5')).not.toBeNull()
  })

  it('dispensar a denúncia da mensagem não mostra o aviso de remoção', async () => {
    const api = mockApi(routes({ 'POST /admin/reports/9/decision': { report_id: 9, status: 'resolved', action: 'dismiss' } }))
    const ui = userEvent.setup()
    render(<AdminReports onExpired={vi.fn()} />)
    const article = (await screen.findByRole('group', { name: 'Mensagem denunciada' })).closest('article') as HTMLElement
    await ui.type(within(article).getByLabelText('Justificativa obrigatória'), 'Sem ofensa.')
    await ui.click(within(article).getByRole('button', { name: 'Registrar decisão' }))
    await screen.findByText('Comentário · #5')
    expect(api.find('POST', '/admin/reports/9/decision')[0].body).toEqual({ action: 'dismiss', justification: 'Sem ofensa.' })
    expect(screen.queryByText(/Mensagem removida/)).toBeNull()
  })

  it('mensagem que já foi removida mostra o aviso no lugar do texto; o erro do servidor aparece', async () => {
    const removed = { ...message, target_preview: { ...message.target_preview, body: null, removed: true } }
    mockApi({ 'GET /admin/reports?status=pending': page([removed]), 'POST /admin/reports/9/decision': apiError(404, 'Denúncia pendente não encontrada.') })
    const ui = userEvent.setup()
    render(<AdminReports onExpired={vi.fn()} />)
    const preview = await screen.findByRole('group', { name: 'Mensagem denunciada' })
    expect(preview.textContent).toContain('Mensagem já removida')
    expect(preview.textContent).not.toContain('Vocês são ridículos.')
    await ui.type(within(preview.closest('article') as HTMLElement).getByLabelText('Justificativa obrigatória'), 'Já tratada.')
    await ui.click(screen.getByRole('button', { name: 'Registrar decisão' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Denúncia pendente não encontrada.')
  })

  it('nas resolvidas, a prévia da mensagem (privada) não é devolvida e a denúncia segue legível', async () => {
    mockApi({ 'GET /admin/reports?status=pending': page([]), 'GET /admin/reports?status=resolved': page([{ ...message, status: 'resolved', target_preview: null }]) })
    const ui = userEvent.setup()
    render(<AdminReports onExpired={vi.fn()} />)
    await ui.selectOptions(await screen.findByLabelText('Estado das denúncias'), 'resolved')
    expect(await screen.findByText('Mensagem da partida · #44')).not.toBeNull()
    expect(screen.queryByRole('group', { name: 'Mensagem denunciada' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Registrar decisão' })).toBeNull()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import type { OrganizerEventCard } from '../src/api/events'
import type { OrganizerStatus } from '../src/api/organizer'
import { EventNotices } from '../src/components/organizer/EventNotices'
import OrganizerEventsPage from '../src/pages/OrganizerEventsPage'
import { eventCard, message } from './events-fixtures'
import { findToast, renderWithToaster } from './toast-utils'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

const approved: OrganizerStatus = { state: 'aprovado', request: null, organizer: { id: 1, display_name: 'Liga Sudoeste', approved_at: '2026-10-12T10:00:00Z' }, revocation: null }
const revoked: OrganizerStatus = { state: 'revogado', request: null, organizer: null, revocation: { revoked_at: '2026-10-12T10:00:00Z', reason: 'Sem resposta' } }

function mockList({ open = [], closed = [], cursor = null, status = approved }: { open?: OrganizerEventCard[]; closed?: OrganizerEventCard[]; cursor?: string | null; status?: OrganizerStatus }) {
  vi.mocked(request).mockImplementation(async path => {
    if (path === '/organizer/events?scope=abertos') return { items: open, next_cursor: null } as never
    if (path === '/organizer/events?scope=encerrados') return { items: closed, next_cursor: cursor } as never
    if (path.startsWith('/organizer/events?scope=encerrados&cursor=')) return { items: [eventCard({ id: 30, name: 'Copa de Inverno', state: 'encerrado', phase: 'encerrado' })], next_cursor: null } as never
    if (path === '/me/organizer-request') return status as never
    throw new Error(`rota inesperada ${path}`)
  })
}
function renderPage() {
  const props = { onBack: vi.fn(), onOpen: vi.fn(), onCreate: vi.fn(), onExpired: vi.fn() }
  renderWithToaster(<OrganizerEventsPage {...props} />)
  return props
}

beforeEach(() => { vi.mocked(request).mockReset() })
afterEach(cleanup)

describe('Meus eventos (O3)', () => {
  it('mostra os cartazes com o estado, a barra de inscrições, o alerta de pendências e "Novo evento" por último', async () => {
    const user = userEvent.setup()
    mockList({ open: [
      eventCard({ pending: { receipts: 3, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 3 } }),
      eventCard({ id: 6, name: 'Liga Noturna', state: 'rascunho', phase: 'rascunho', sport: null, price_cents: null, starts_at: null }),
      eventCard({ id: 7, name: 'Desafio Saibro', sport: 'tenis', state: 'publicado', phase: 'inscricoes_encerradas' }),
    ] })
    const props = renderPage()
    const list = await screen.findByRole('list')
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0].textContent).toContain('Inscrições abertas')
    expect(items[0].textContent).toContain('3 de 8 times')
    expect(items[0].textContent).toContain('3 pendências')
    expect(items[1].textContent).toContain('Rascunho')
    expect(items[1].textContent).toContain('A definir')
    expect(items[1].textContent).not.toContain('de 8')
    expect(items[2].textContent).toContain('Inscrições encerradas')
    expect(items[3].textContent).toBe('Novo evento')
    await user.click(within(items[0]).getByRole('button'))
    expect(props.onOpen).toHaveBeenCalledWith(5)
    await user.click(within(items[3]).getByRole('button', { name: 'Novo evento' }))
    await user.click(screen.getByRole('button', { name: 'Criar evento' }))
    expect(props.onCreate).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('button', { name: 'Voltar para o Menu' }))
    expect(props.onBack).toHaveBeenCalled()
  })

  it('sem eventos: estado vazio honesto com "Criar evento"', async () => {
    const user = userEvent.setup()
    mockList({})
    const props = renderPage()
    expect(await screen.findByRole('heading', { name: 'Seu primeiro evento' })).toBeTruthy()
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Criar evento' })).toHaveLength(2))
    await user.click(screen.getAllByRole('button', { name: 'Criar evento' })[1])
    expect(props.onCreate).toHaveBeenCalled()
  })

  it('revogado: os eventos mantidos continuam, sem criar novos', async () => {
    mockList({ open: [eventCard({ revocation_pending: true })], status: revoked })
    renderPage()
    expect(await screen.findByText(/Sua permissão de organizador foi revogada/)).toBeTruthy()
    expect(screen.getByText('Inscrições suspensas')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Novo evento|Criar evento/ })).toBeNull()
  })

  it('lista os encerrados e cancelados em páginas', async () => {
    const user = userEvent.setup()
    mockList({ open: [eventCard()], closed: [eventCard({ id: 20, name: 'Corrida do Lago', state: 'cancelado', phase: 'cancelado', sport: 'corrida', format: null, distance_km: 10 })], cursor: 'abc' })
    renderPage()
    const section = await screen.findByRole('region', { name: 'Encerrados e cancelados' })
    expect(section.textContent).toContain('Cancelado')
    expect(section.textContent).not.toContain('de 8')
    await user.click(within(section).getByRole('button', { name: 'Carregar mais' }))
    expect(await within(section).findByText('Copa de Inverno')).toBeTruthy()
  })

  it('mostra o erro e tenta de novo', async () => {
    const user = userEvent.setup()
    let fail = true
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/me/organizer-request') return approved as never
      if (fail && path === '/organizer/events?scope=abertos') throw new ApiError('Não foi possível acessar os dados. Tente novamente.', 500)
      return { items: path.includes('abertos') ? [eventCard()] : [], next_cursor: null } as never
    })
    renderPage()
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível acessar os dados.')
    fail = false
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Copa Sudoeste Society')).toBeTruthy()
  })
})

describe('canal de avisos do evento', () => {
  it('lê os avisos (o do cancelamento em destaque) e publica um novo no topo', async () => {
    const user = userEvent.setup()
    vi.mocked(request).mockImplementation(async (path, method, body) => {
      if (path === '/events/5/messages' && method === 'POST') return message({ id: 9, body: (body as { body: string }).body }) as never
      if (path === '/events/5/messages') return { items: [message({ id: 2, kind: 'evento_cancelado', author: null, body: 'Chuva forte.' }), message()], next_cursor: null } as never
      throw new Error(`rota inesperada ${path}`)
    })
    renderWithToaster(<EventNotices eventId={5} canWrite onExpired={vi.fn()} />)
    const list = await screen.findByRole('list', { name: 'Avisos publicados' })
    const [automatic, notice] = within(list).getAllByRole('listitem')
    expect(automatic.getAttribute('data-kind')).toBe('evento_cancelado')
    expect(automatic.textContent).toContain('Evento cancelado')
    expect(automatic.textContent).toContain('Aviso automático')
    expect(notice.textContent).toContain('Rafa Nunes')

    const send = screen.getByRole('button', { name: 'Publicar aviso' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    await user.type(screen.getByLabelText('Novo aviso'), '  Mudamos o horário para 9h.  ')
    expect(screen.getByText('30/1000')).toBeTruthy()
    await user.click(send)
    expect((await findToast('Aviso publicado.')).closest('[data-tone]')?.getAttribute('data-tone')).toBe('success')
    expect(await findToast('Os inscritos recebem uma notificação.')).toBeTruthy()
    expect(request).toHaveBeenCalledWith('/events/5/messages', 'POST', { body: 'Mudamos o horário para 9h.' })
    expect(within(list).getAllByRole('listitem')[0].textContent).toContain('Mudamos o horário para 9h.')
    expect((screen.getByLabelText('Novo aviso') as HTMLTextAreaElement).value).toBe('')
  })

  it('mostra o erro do envio e, sem permissão de escrita, só a leitura', async () => {
    const user = userEvent.setup()
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (method === 'POST') throw new ApiError('A administração está decidindo sobre este evento.', 409)
      return { items: [], next_cursor: null } as never
    })
    renderWithToaster(<EventNotices eventId={5} canWrite onExpired={vi.fn()} />)
    expect(await screen.findByText('Nenhum aviso ainda.')).toBeTruthy()
    await user.type(screen.getByLabelText('Novo aviso'), 'Aviso')
    await user.click(screen.getByRole('button', { name: 'Publicar aviso' }))
    expect(await findToast('A administração está decidindo sobre este evento.')).toBeTruthy()
    cleanup()
    renderWithToaster(<EventNotices eventId={5} canWrite={false} onExpired={vi.fn()} />)
    expect(await screen.findByText('Nenhum aviso ainda.')).toBeTruthy()
    expect(screen.queryByLabelText('Novo aviso')).toBeNull()
  })
})

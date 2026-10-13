import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import type { AdminOrganizer, AdminOrganizerRequest } from '../src/api/organizer'
import { refusalError, refusalInput, revokeError } from '../src/api/admin'
import AdminOrganizerRequests from '../src/components/admin/AdminOrganizerRequests'
import { queryToast, renderWithToaster } from './toast-utils'
import { connection } from '../src/api/connection'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

const rafa = { id: 21, name: 'Rafa Nunes', username: 'rafa', avatar_url: null }
const bia = { id: 22, name: 'Bia Rocha', username: 'bia', avatar_url: null }
const base: AdminOrganizerRequest = {
  id: 1, display_name: 'Liga do Bairro', city: { id: 7, name: 'Brasília', state: 'DF' }, sports: ['futebol'],
  experience: 'Organizo a pelada de quinta.', contact: '(61) 99999-0000', link: 'https://liga.example.com', state: 'em_analise',
  reason_code: null, reason_detail: null, created_at: new Date(Date.now() - 3 * 3600_000).toISOString(), decided_at: null,
  requester: rafa, decided_by: null,
}
const second: AdminOrganizerRequest = { ...base, id: 2, display_name: 'Assessoria Ritmo', sports: ['corrida'], experience: null, link: null, requester: bia }
const decided: AdminOrganizerRequest = { ...base, id: 3, display_name: 'Copa Antiga', state: 'recusado', reason_code: 'pedido_repetido',
  decided_at: '2026-10-11T10:00:00Z', decided_by: { id: 1, name: 'Admin Arena', username: 'admin', avatar_url: null } }
const organizer: AdminOrganizer = { id: 9, user: rafa, display_name: 'Liga do Bairro', approved_at: '2026-10-10T10:00:00Z', approved_by: null, request_id: 1 }

let calls: { path: string; method?: string; body?: unknown }[]
/** Pedidos que saem da fila "Para analisar" (decididos por outra pessoa durante o teste). */
let gone: number[]
function mockApi({ decision }: { decision?: (id: number, body: Record<string, unknown>) => unknown } = {}) {
  calls = []
  gone = []
  vi.mocked(request).mockImplementation(async (path, method, body) => {
    calls.push({ path, method, body })
    const decide = path.match(/^\/admin\/organizer-requests\/(\d+)\/decision$/)
    if (decide) {
      const id = Number(decide[1])
      const input = body as Record<string, unknown>
      if (decision) return decision(id, input) as never
      return { ...[base, second].find(item => item.id === id)!, state: input.decision === 'aprovar' ? 'aprovado' : 'recusado' } as never
    }
    if (path === '/admin/organizer-requests?state=em_analise') return { items: [base, second].filter(item => !gone.includes(item.id)), next_cursor: 'p2' } as never
    if (path === '/admin/organizer-requests?state=em_analise&cursor=p2') return { items: [], next_cursor: null } as never
    if (path === '/admin/organizer-requests?state=decididos') return { items: [decided], next_cursor: null } as never
    if (path === '/admin/organizers') return { items: [organizer], next_cursor: null } as never
    if (path === '/admin/organizers/9/revoke') return undefined as never
    throw new Error(`rota inesperada ${path}`)
  })
}
const renderQueue = () => {
  const onOpenUser = vi.fn()
  renderWithToaster(<AdminOrganizerRequests onOpenUser={onOpenUser} onExpired={vi.fn()} />)
  return onOpenUser
}

beforeEach(() => { vi.mocked(request).mockReset() })
afterEach(cleanup)

describe('fila de pedidos de organizador (AD1)', () => {
  it('lista os pedidos, abre a folha com os dados e "Ver perfil"', async () => {
    mockApi()
    const ui = userEvent.setup()
    const onOpenUser = renderQueue()
    const list = await screen.findByRole('list', { name: 'Pedidos para analisar' })
    expect(within(list).getByText('Liga do Bairro')).not.toBeNull()
    expect(within(list).getByText(/Rafa Nunes · Futebol · há 3 horas/)).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Carregar mais pedidos' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/organizer-requests?state=em_analise&cursor=p2'))

    await ui.click(within(list).getByRole('button', { name: /Liga do Bairro/ }))
    const sheet = screen.getByRole('dialog', { name: 'Pedido de organizador' })
    expect(within(sheet).getByText('Brasília · DF')).not.toBeNull()
    expect(within(sheet).getByText('Organizo a pelada de quinta.')).not.toBeNull()
    expect(within(sheet).getByRole('link', { name: 'https://liga.example.com' }).getAttribute('rel')).toContain('noopener')
    await ui.click(within(sheet).getByRole('button', { name: 'Ver perfil de Rafa' }))
    expect(onOpenUser).toHaveBeenCalledWith(21)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('aprova o pedido e o tira da fila', async () => {
    mockApi()
    const ui = userEvent.setup()
    renderQueue()
    await ui.click(await screen.findByRole('button', { name: /Liga do Bairro/ }))
    await ui.click(screen.getByRole('button', { name: 'Aprovar organizador' }))
    expect(calls).toContainEqual({ path: '/admin/organizer-requests/1/decision', method: 'POST', body: { decision: 'aprovar' } })
    expect((await screen.findByRole('status')).textContent).toBe('Liga do Bairro agora é organizador.')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: /Liga do Bairro/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Assessoria Ritmo/ })).not.toBeNull()
  })

  it('recusa exigindo o motivo e, em "Outro", o detalhe', async () => {
    mockApi()
    const ui = userEvent.setup()
    renderQueue()
    await ui.click(await screen.findByRole('button', { name: /Assessoria Ritmo/ }))
    const sheet = screen.getByRole('dialog', { name: 'Pedido de organizador' })
    expect(within(sheet).getByText('Não informada')).not.toBeNull()
    await ui.click(within(sheet).getByRole('button', { name: 'Recusar' }))
    await ui.click(within(sheet).getByRole('button', { name: 'Recusar pedido' }))
    expect(within(sheet).getByRole('alert').textContent).toBe('Escolha o motivo da recusa.')

    await ui.click(within(sheet).getByRole('button', { name: 'Outro' }))
    expect(within(sheet).getByRole('button', { name: 'Outro' }).getAttribute('aria-pressed')).toBe('true')
    await ui.click(within(sheet).getByRole('button', { name: 'Recusar pedido' }))
    expect(within(sheet).getByRole('alert').textContent).toBe('Descreva o motivo da recusa.')
    expect(calls.some(call => call.method === 'POST')).toBe(false)

    await ui.type(within(sheet).getByLabelText(/Detalhe para quem pediu/), 'Sem eventos na cidade')
    await ui.click(within(sheet).getByRole('button', { name: 'Recusar pedido' }))
    expect(calls).toContainEqual({ path: '/admin/organizer-requests/2/decision', method: 'POST',
      body: { decision: 'recusar', reason_code: 'outro', reason_detail: 'Sem eventos na cidade' } })
    expect((await screen.findByRole('status')).textContent).toBe('Pedido de Assessoria Ritmo recusado.')
  })

  it('pedido já decidido por outra pessoa: fecha a folha, avisa e recarrega a fila sem o item', async () => {
    mockApi({ decision: () => { gone.push(1); throw new ApiError('Este pedido já foi decidido.', 409) } })
    const ui = userEvent.setup()
    renderQueue()
    await ui.click(await screen.findByRole('button', { name: /Liga do Bairro/ }))
    await ui.click(screen.getByRole('button', { name: 'Recusar' }))
    await ui.click(screen.getByRole('button', { name: 'Pouca informação' }))
    await ui.click(screen.getByRole('button', { name: 'Recusar pedido' }))
    expect(calls).toContainEqual({ path: '/admin/organizer-requests/1/decision', method: 'POST', body: { decision: 'recusar', reason_code: 'pouca_informacao' } })
    expect((await screen.findByRole('status')).textContent).toBe('Este pedido já foi decidido.')
    expect(screen.queryByRole('dialog', { name: 'Pedido de organizador' })).toBeNull()
    const list = await screen.findByRole('list', { name: 'Pedidos para analisar' })
    await waitFor(() => expect(within(list).queryByText('Liga do Bairro')).toBeNull())
    expect(within(list).getByText('Assessoria Ritmo')).not.toBeNull()
    expect(calls.filter(call => call.path === '/admin/organizer-requests?state=em_analise')).toHaveLength(2)
  })

  it('erro de rede na decisão mantém a folha aberta e acende o aviso de conexão, sem toast', async () => {
    mockApi({ decision: () => { throw new ApiError('Serviço indisponível.', 503) } })
    const ui = userEvent.setup()
    renderQueue()
    await ui.click(await screen.findByRole('button', { name: /Liga do Bairro/ }))
    await ui.click(screen.getByRole('button', { name: 'Aprovar organizador' }))
    await waitFor(() => expect(connection.getState()).toMatchObject({ status: 'offline', sheetOpen: true }))
    expect(queryToast('Serviço indisponível.')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Pedido de organizador' })).not.toBeNull()
  })

  it('mostra os decididos com a decisão e sem ações', async () => {
    mockApi()
    const ui = userEvent.setup()
    renderQueue()
    await screen.findByRole('list', { name: 'Pedidos para analisar' })
    await ui.click(screen.getByRole('tab', { name: 'Decididos' }))
    const list = await screen.findByRole('list', { name: 'Pedidos decididos' })
    expect(within(list).getByText('Recusado')).not.toBeNull()
    await ui.click(within(list).getByRole('button', { name: /Copa Antiga/ }))
    const sheet = screen.getByRole('dialog', { name: 'Pedido de organizador' })
    expect(within(sheet).getByText(/Motivo: Pedido repetido/)).not.toBeNull()
    expect(within(sheet).getByText(/por Admin Arena/)).not.toBeNull()
    expect(within(sheet).queryByRole('button', { name: 'Aprovar organizador' })).toBeNull()
  })

  it('revoga um organizador ativo exigindo o motivo', async () => {
    mockApi()
    const ui = userEvent.setup()
    renderQueue()
    await screen.findByRole('list', { name: 'Pedidos para analisar' })
    await ui.click(screen.getByRole('tab', { name: 'Organizadores' }))
    await ui.click(await screen.findByRole('button', { name: /Liga do Bairro/ }))
    const sheet = screen.getByRole('dialog', { name: 'Organizador' })
    await ui.click(within(sheet).getByRole('button', { name: 'Revogar permissão' }))
    await ui.click(within(sheet).getByRole('button', { name: 'Revogar' }))
    expect(within(sheet).getByRole('alert').textContent).toContain('Informe o motivo da revogação')
    await ui.type(within(sheet).getByLabelText('Motivo da revogação'), '  Eventos sem resposta aos inscritos ')
    await ui.click(within(sheet).getByRole('button', { name: 'Revogar' }))
    expect(calls).toContainEqual({ path: '/admin/organizers/9/revoke', method: 'POST', body: { reason: 'Eventos sem resposta aos inscritos' } })
    expect((await screen.findByRole('status')).textContent).toBe('Permissão de Liga do Bairro revogada.')
    expect(await screen.findByText('Nenhum organizador ativo')).not.toBeNull()
  })

  it('mostra o estado vazio e o erro da fila', async () => {
    vi.mocked(request).mockResolvedValueOnce({ items: [], next_cursor: null } as never)
    renderQueue()
    expect(await screen.findByText('Nada para analisar')).not.toBeNull()
    cleanup()
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Acesso administrativo necessário.', 403))
    renderQueue()
    expect((await screen.findByRole('alert')).textContent).toContain('Acesso administrativo necessário.')
  })
})

describe('regras das decisões da administração', () => {
  it('valida o motivo da recusa e da revogação como o servidor', () => {
    expect(refusalError(null, '')).toBe('Escolha o motivo da recusa.')
    expect(refusalError('outro', 'abc')).toBe('Descreva o motivo da recusa.')
    expect(refusalError('pouca_informacao', '')).toBeNull()
    expect(refusalError('pouca_informacao', 'x'.repeat(501))).toContain('500')
    expect(revokeError('abcd')).not.toBeNull()
    expect(revokeError('Motivo válido')).toBeNull()
    expect(refusalInput('outro', '  detalhe ')).toEqual({ decision: 'recusar', reason_code: 'outro', reason_detail: 'detalhe' })
  })
})

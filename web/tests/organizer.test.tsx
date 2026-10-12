import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import type { City, Profile } from '../src/api/client'
import type { OrganizerRequest, OrganizerStatus } from '../src/api/organizer'
import { organizerRequestInput, refusalText, sportNames, validateOrganizerRequest } from '../src/api/organizer'
import MenuPage from '../src/pages/MenuPage'
import OrganizerRequestPage from '../src/pages/OrganizerRequestPage'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

const brasilia: City = { id: 7, name: 'Brasília', state: 'DF' }
const goiania: City = { id: 8, name: 'Goiânia', state: 'GO' }
const pedido: OrganizerRequest = {
  id: 4, display_name: 'Liga do Bairro', city: brasilia, sports: ['futebol'], experience: null, contact: 'liga@example.com', link: null,
  state: 'em_analise', reason_code: null, reason_detail: null, created_at: '2026-10-12T10:00:00Z', decided_at: null,
}
const status = (state: OrganizerStatus['state'], extra: Partial<OrganizerStatus> = {}): OrganizerStatus =>
  ({ state, request: null, organizer: null, revocation: null, ...extra })

function mockStatus(value: OrganizerStatus, counts = { organizer_requests: 0 }) {
  vi.mocked(request).mockImplementation(async (path, method) => {
    if (path === '/me/organizer-request' && method === 'DELETE') return undefined as never
    if (path === '/me/organizer-request') return value as never
    if (path === '/admin/queue-counts') return counts as never
    throw new Error(`rota inesperada ${method ?? 'GET'} ${path}`)
  })
}
function renderMenu({ isAdmin = false } = {}) {
  const props = {
    onEditProfile: vi.fn(), onSports: vi.fn(), onModeration: vi.fn(), onOrganizerRequest: vi.fn(), onOrganizerRequests: vi.fn(),
    onNotifications: vi.fn(), onLogout: vi.fn(), onExpired: vi.fn(),
  }
  render(<MenuPage isAdmin={isAdmin} busy={false} {...props} />)
  return props
}

beforeEach(() => { vi.mocked(request).mockReset() })
afterEach(cleanup)

describe('cartão "Organizar no Arena" no Menu', () => {
  it('sem pedido: mostra as etapas e "Quero organizar" abre o pedido', async () => {
    mockStatus(status('sem_pedido'))
    const props = renderMenu()
    const card = await screen.findByRole('region', { name: 'Organizar no Arena' })
    expect(within(card).getByRole('list', { name: 'Etapas do pedido' }).textContent).toContain('Pedir: etapa atual')
    await userEvent.setup().click(within(card).getByRole('button', { name: 'Quero organizar' }))
    expect(props.onOrganizerRequest).toHaveBeenCalled()
    expect(screen.queryByText('Meus eventos')).toBeNull()
  })

  it('em análise: cancela o pedido só depois de confirmar', async () => {
    mockStatus(status('em_analise', { request: pedido }))
    const ui = userEvent.setup()
    renderMenu()
    const card = await screen.findByRole('region', { name: 'Organizar no Arena' })
    expect(within(card).getByText('Pedido em análise')).not.toBeNull()
    expect(within(card).getByRole('list', { name: 'Etapas do pedido' }).textContent).toContain('Análise: etapa atual')
    await ui.click(within(card).getByRole('button', { name: 'Cancelar pedido' }))
    expect(document.activeElement?.textContent).toBe('Cancelar o pedido em análise?')
    expect(request).not.toHaveBeenCalledWith('/me/organizer-request', 'DELETE')

    await ui.click(within(card).getByRole('button', { name: 'Manter pedido' }))
    expect(within(card).queryByText('Cancelar o pedido em análise?')).toBeNull()
    await ui.click(within(card).getByRole('button', { name: 'Cancelar pedido' }))
    await ui.click(within(card).getAllByRole('button', { name: 'Cancelar pedido' }).at(-1)!)
    await waitFor(() => expect(request).toHaveBeenCalledWith('/me/organizer-request', 'DELETE'))
    expect((await screen.findByRole('status')).textContent).toContain('Pedido cancelado')
    expect(screen.getByRole('button', { name: 'Quero organizar' })).not.toBeNull()
  })

  it('em análise: mostra o erro da API ao cancelar', async () => {
    mockStatus(status('em_analise', { request: pedido }))
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (method === 'DELETE') throw new ApiError('Nenhum pedido em análise.', 404)
      return status('em_analise', { request: pedido }) as never
    })
    const ui = userEvent.setup()
    renderMenu()
    await ui.click(await screen.findByRole('button', { name: 'Cancelar pedido' }))
    await ui.click(screen.getAllByRole('button', { name: 'Cancelar pedido' }).at(-1)!)
    expect((await screen.findByRole('alert')).textContent).toBe('Nenhum pedido em análise.')
    expect(screen.getByText('Pedido em análise')).not.toBeNull()
  })

  it('recusado: mostra o motivo e "Enviar novo pedido"', async () => {
    mockStatus(status('recusado', { request: { ...pedido, state: 'recusado', reason_code: 'pouca_informacao', reason_detail: 'Conte os eventos que já fez' } }))
    const props = renderMenu()
    const card = await screen.findByRole('region', { name: 'Organizar no Arena' })
    expect(within(card).getByText(/Motivo: Pouca informação · Conte os eventos que já fez/)).not.toBeNull()
    expect(within(card).getByRole('list', { name: 'Etapas do pedido' }).textContent).toContain('Análise: não concluída')
    await userEvent.setup().click(within(card).getByRole('button', { name: 'Enviar novo pedido' }))
    expect(props.onOrganizerRequest).toHaveBeenCalled()
  })

  it('revogado: mostra o motivo da administração e permite pedir de novo', async () => {
    mockStatus(status('revogado', { revocation: { revoked_at: '2026-10-12T12:00:00Z', reason: 'Eventos sem resposta aos inscritos' } }))
    renderMenu()
    expect(await screen.findByText(/Motivo: Eventos sem resposta aos inscritos/)).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Enviar novo pedido' })).not.toBeNull()
  })

  it('aprovado: o cartão some e aparece "Organizador · Meus eventos" vazio, sem botão de criar', async () => {
    mockStatus(status('aprovado', { request: { ...pedido, state: 'aprovado' }, organizer: { id: 1, display_name: 'Liga do Bairro', approved_at: '2026-10-12T12:00:00Z' } }))
    renderMenu()
    expect(await screen.findByRole('heading', { name: 'Organizador' })).not.toBeNull()
    expect(screen.getByText(/Nenhum evento ainda/)).not.toBeNull()
    expect(screen.queryByRole('region', { name: 'Organizar no Arena' })).toBeNull()
    expect(screen.queryByRole('button', { name: /evento/i })).toBeNull()
  })

  it('mostra a fila "Pedidos de organizador" com o contador só para a administração', async () => {
    mockStatus(status('sem_pedido'), { organizer_requests: 3 })
    const props = renderMenu({ isAdmin: true })
    const row = await screen.findByRole('button', { name: /Pedidos de organizador/ })
    await waitFor(() => expect(row.textContent).toContain('3 pendentes'))
    expect(screen.getByRole('heading', { name: 'Administração' })).not.toBeNull()
    expect(screen.queryByText(/Eventos pagos/)).toBeNull()
    await userEvent.setup().click(row)
    expect(props.onOrganizerRequests).toHaveBeenCalled()
    cleanup()

    vi.mocked(request).mockClear()
    renderMenu()
    await screen.findByRole('region', { name: 'Organizar no Arena' })
    expect(screen.queryByText('Pedidos de organizador')).toBeNull()
    expect(request).not.toHaveBeenCalledWith('/admin/queue-counts')
  })

  it('mostra o erro ao carregar o estado do pedido e tenta de novo', async () => {
    let fail = true
    vi.mocked(request).mockImplementation(async () => {
      if (fail) throw new ApiError('Serviço indisponível.', 503)
      return status('sem_pedido') as never
    })
    renderMenu()
    expect((await screen.findByRole('alert')).textContent).toContain('Serviço indisponível.')
    fail = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('button', { name: 'Quero organizar' })).not.toBeNull()
  })
})

describe('pedido de organizador (P5)', () => {
  const profiles: Profile[] = [{ id: 1, sport: 'futebol', city_id: 7, position: null, looking_for: false, is_public: false, level: null }]
  function renderPage(state: OrganizerStatus = status('sem_pedido'), post?: (body: unknown) => unknown) {
    vi.mocked(request).mockImplementation(async (path, method, body) => {
      if (path === '/me/organizer-request' && method === 'POST') return (post ? post(body) : { ...pedido, ...(body as object) }) as never
      if (path === '/me/organizer-request') return state as never
      throw new Error(`rota inesperada ${path}`)
    })
    const onBack = vi.fn()
    render(<OrganizerRequestPage cities={[brasilia, goiania]} profiles={profiles} onBack={onBack} onExpired={vi.fn()} />)
    return onBack
  }

  it('mostra as regras do papel antes do formulário', async () => {
    renderPage()
    const rules = await screen.findByRole('list', { name: 'Regras do organizador' })
    expect(rules.textContent).toContain('Pagamento fora do Arena')
    expect(rules.textContent).toContain('Você analisa os comprovantes')
    expect(rules.textContent).toContain('Eventos pagos passam pela administração')
    expect((screen.getByLabelText('Cidade') as HTMLSelectElement).value).toBe('7')
  })

  it('valida no cliente como o servidor e não envia com erros', async () => {
    const ui = userEvent.setup()
    renderPage()
    await ui.click(await screen.findByRole('button', { name: 'Enviar pedido' }))
    expect(screen.getByRole('alert').textContent).toBe('Revise os campos destacados.')
    expect(document.activeElement).toBe(screen.getByLabelText('Nome do organizador'))
    expect(screen.getByLabelText('Nome do organizador').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Escolha ao menos uma modalidade.')).not.toBeNull()
    expect(screen.getByText(/Informe um contato/)).not.toBeNull()
    expect(screen.getByText('Aceite as responsabilidades do organizador para enviar o pedido.')).not.toBeNull()

    await ui.type(screen.getByLabelText('Nome do organizador'), 'Liga do Bairro')
    await ui.type(screen.getByLabelText('Contato'), 'liga@example.com')
    await ui.type(screen.getByLabelText('Link (opcional)'), 'instagram.com/liga')
    await ui.click(screen.getByRole('button', { name: 'Enviar pedido' }))
    expect(document.activeElement?.textContent).toContain('Futebol')
    expect(screen.getByText(/comece com http:\/\/ ou https:\/\//)).not.toBeNull()
    expect(request).not.toHaveBeenCalledWith('/me/organizer-request', 'POST', expect.anything())
  })

  it('envia o pedido com o corpo do contrato e mostra a situação', async () => {
    const ui = userEvent.setup()
    const sent: unknown[] = []
    const onBack = renderPage(status('sem_pedido'), body => { sent.push(body); return { ...pedido, display_name: 'Liga do Bairro' } })
    await ui.type(await screen.findByLabelText('Nome do organizador'), '  Liga do Bairro ')
    await ui.selectOptions(screen.getByLabelText('Cidade'), '8')
    await ui.click(screen.getByRole('button', { name: 'Corrida' }))
    await ui.click(screen.getByRole('button', { name: 'Futebol' }))
    await ui.type(screen.getByLabelText('Contato'), '(61) 99999-0000')
    await ui.type(screen.getByLabelText('Link (opcional)'), 'https://liga.example.com')
    await ui.click(screen.getByRole('checkbox'))
    await ui.click(screen.getByRole('button', { name: 'Enviar pedido' }))

    expect(await screen.findByText('Pedido enviado')).not.toBeNull()
    expect(sent).toEqual([{ display_name: 'Liga do Bairro', city_id: 8, sports: ['futebol', 'corrida'], experience: null,
      contact: '(61) 99999-0000', link: 'https://liga.example.com', accept_terms: true }])
    await ui.click(screen.getByRole('button', { name: 'Voltar ao Menu' }))
    expect(onBack).toHaveBeenCalled()
  })

  it('mostra o erro da API no envio', async () => {
    const ui = userEvent.setup()
    renderPage(status('sem_pedido'), () => { throw new ApiError('Você já tem um pedido em análise.', 409) })
    await ui.type(await screen.findByLabelText('Nome do organizador'), 'Liga do Bairro')
    await ui.click(screen.getByRole('button', { name: 'Tênis' }))
    await ui.type(screen.getByLabelText('Contato'), 'liga@example.com')
    await ui.click(screen.getByRole('checkbox'))
    await ui.click(screen.getByRole('button', { name: 'Enviar pedido' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Você já tem um pedido em análise.')
    expect(screen.queryByText('Pedido enviado')).toBeNull()
  })

  it('mostra a situação no lugar do formulário com pedido em análise ou permissão ativa', async () => {
    renderPage(status('em_analise', { request: pedido }))
    expect(await screen.findByText('Pedido em análise')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Enviar pedido' })).toBeNull()
    cleanup()
    renderPage(status('aprovado'))
    expect(await screen.findByText('Você é organizador')).not.toBeNull()
  })

  it('lembra o motivo da recusa anterior acima do formulário', async () => {
    renderPage(status('recusado', { request: { ...pedido, state: 'recusado', reason_code: 'contato_nao_funciona', reason_detail: null } }))
    expect(await screen.findByText(/Seu pedido anterior foi recusado. Motivo: Contato não funciona/)).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Enviar pedido' })).not.toBeNull()
  })
})

describe('regras do pedido de organizador', () => {
  const draft = { display_name: 'Liga', city_id: 7, sports: ['tenis' as const], experience: '', contact: 'liga@x.com', link: '', accept_terms: true }
  it('espelha os limites do servidor', () => {
    expect(validateOrganizerRequest(draft, new Set([7]))).toEqual({})
    expect(Object.keys(validateOrganizerRequest({ ...draft, display_name: 'Li', city_id: 9, contact: 'a@b', link: 'ftp://x', experience: 'x'.repeat(1001), accept_terms: false, sports: [] }, new Set([7]))).sort())
      .toEqual(['accept_terms', 'city_id', 'contact', 'display_name', 'experience', 'link', 'sports'])
    expect(validateOrganizerRequest({ ...draft, link: `https://${'a'.repeat(300)}.com` }).link).toBeDefined()
  })
  it('apara os textos e manda os opcionais vazios como null', () => {
    expect(organizerRequestInput({ ...draft, experience: '  ', link: ' ', contact: ' liga@x.com ' }))
      .toEqual({ display_name: 'Liga', city_id: 7, sports: ['tenis'], experience: null, contact: 'liga@x.com', link: null, accept_terms: true })
  })
  it('monta o motivo da recusa e os nomes das modalidades', () => {
    expect(refusalText('pedido_repetido', null)).toBe('Pedido repetido')
    expect(refusalText('outro', 'Sem eventos na cidade')).toBe('Sem eventos na cidade')
    expect(refusalText(null, null)).toBe('Motivo não informado')
    expect(sportNames(['corrida', 'futebol'])).toBe('Futebol, Corrida')
  })
})

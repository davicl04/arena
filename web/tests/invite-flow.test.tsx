import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InviteFlow } from '../src/components/teams/InviteFlow'
import { apiError, mockApi, person, team } from './teams-fixtures'
import { findToast, renderWithToaster } from './toast-utils'

afterEach(() => {
  cleanup(); vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'share')
})

const rafael = person(14, 'Rafael Gomes')
const julia = person(15, 'Júlia Andrade')
const candidates = { items: [
  { person: person(12, 'Marcos Lima'), team_status: 'convite_pendente' },
  { person: rafael, team_status: 'disponivel' },
  { person: person(3, 'Tiago Melo'), team_status: 'membro' },
  { person: person(18, 'Lia Moraes'), team_status: 'pedido_pendente' },
], next_cursor: null }
const sent = (invitee = rafael, message: string | null = null) => ({ id: 900, invitee, inviter: person(1, 'Ricardo Moura'), message, state: 'pendente', created_at: '2026-10-12T10:00:00Z' })
const link = { url: 'http://localhost:5173/entrar/tokenAtual', token: 'tokenAtual', generated_at: '2026-10-01T10:00:00Z' }

describe('Convidar atleta (I5 + Q2)', () => {
  it('escolhe quem você segue, revisa a carteirinha e envia o convite com mensagem', async () => {
    const api = mockApi({
      'GET /teams/10': team(),
      'GET /teams/10/invite-candidates': candidates,
      'GET /teams/10/invite-candidates?q=J%C3%BAlia': { items: [{ person: julia, team_status: 'disponivel' }], next_cursor: null },
      'POST /teams/10/invites': ({ body }) => sent((body as { user_id: number }).user_id === julia.id ? julia : rafael, (body as { message: string | null }).message),
    })
    const onClose = vi.fn()
    const ui = userEvent.setup()
    renderWithToaster(<InviteFlow teamId={10} onClose={onClose} onExpired={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Quem você quer convidar?' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Escolher atleta' }).getAttribute('aria-selected')).toBe('true')
    const list = await screen.findByRole('list', { name: 'Quem você segue' })
    expect(within(list).getAllByText('Pendente')).toHaveLength(2)
    expect(within(list).getByText('No elenco')).toBeTruthy()
    expect(within(list).queryByRole('button', { name: 'Escolher Marcos Lima' })).toBeNull()

    await ui.click(within(list).getByRole('button', { name: 'Escolher Rafael Gomes' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Revisar convite' })).toBeTruthy()
    expect(screen.getByText('Como Rafael vai ver')).toBeTruthy()
    expect(await screen.findByText('Carteirinha do Ferrugem FC com o selo Convite e os botões Aceitar e Recusar.')).toBeTruthy()
    const message = screen.getByLabelText('Mensagem (opcional)')
    expect(message.getAttribute('maxlength')).toBe('140')
    await ui.type(message, '  Jogamos society às quintas, 20h.  ')
    expect(screen.getByText(/^36\/140/)).toBeTruthy()
    await ui.click(screen.getByRole('button', { name: 'Enviar convite' }))
    await waitFor(() => expect(screen.getByText('Convite enviado para Rafael Gomes.')).toBeTruthy())
    expect(api.find('POST', '/teams/10/invites')[0].body).toEqual({ user_id: 14, message: 'Jogamos society às quintas, 20h.' })
    // De volta ao passo 1, a pessoa já aparece como pendente.
    expect(within(screen.getByRole('list', { name: 'Quem você segue' })).queryByRole('button', { name: 'Escolher Rafael Gomes' })).toBeNull()

    // Busca por nome com espera curta; mensagem vazia vai como null.
    await ui.type(screen.getByLabelText('Buscar atleta por nome ou @usuário'), 'Júlia')
    const results = await screen.findByRole('list', { name: 'Resultados da busca' }, { timeout: 2000 })
    await ui.click(within(results).getByRole('button', { name: 'Escolher Júlia Andrade' }))
    await ui.click(screen.getByRole('button', { name: 'Enviar convite' }))
    await waitFor(() => expect(api.find('POST', '/teams/10/invites')).toHaveLength(2))
    expect(api.find('POST', '/teams/10/invites')[1].body).toEqual({ user_id: 15, message: null })
    await ui.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('mostra o erro do servidor no passo 2 e volta ao passo 1', async () => {
    mockApi({
      'GET /teams/10': team(), 'GET /teams/10/invite-candidates': candidates,
      'POST /teams/10/invites': apiError(409, 'Este atleta já pediu para entrar. Responda em Pedidos para entrar.'),
    })
    const ui = userEvent.setup()
    renderWithToaster(<InviteFlow teamId={10} onClose={vi.fn()} onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: 'Escolher Rafael Gomes' }))
    await ui.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(await findToast('Este atleta já pediu para entrar. Responda em Pedidos para entrar.')).toBeTruthy()
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Quem você quer convidar?' })).toBeTruthy()
  })

  it('mostra quando você ainda não segue ninguém e quando a busca não acha', async () => {
    mockApi({ 'GET /teams/10': team(), 'GET /teams/10/invite-candidates': { items: [], next_cursor: null }, 'GET /teams/10/invite-candidates?q=zzz': { items: [], next_cursor: null } })
    const ui = userEvent.setup()
    renderWithToaster(<InviteFlow teamId={10} onClose={vi.fn()} onExpired={vi.fn()} />)
    expect(await screen.findByText(/Você ainda não segue ninguém aqui/)).toBeTruthy()
    await ui.type(screen.getByLabelText('Buscar atleta por nome ou @usuário'), 'zzz{Enter}')
    expect(await screen.findByText('Ninguém com esse nome ou @usuário.')).toBeTruthy()
  })
})

describe('Link e QR do time (Q2 + Q5)', () => {
  it('mostra o QR e o link, copia, compartilha e gera outro link com confirmação', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    const api = mockApi({
      'GET /teams/10': team(), 'GET /teams/10/invite-candidates': candidates,
      'GET /teams/10/invite-link': link,
      'POST /teams/10/invite-link': { ...link, url: 'http://localhost:5173/entrar/tokenNovo', token: 'tokenNovo' },
    })
    const ui = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderWithToaster(<InviteFlow teamId={10} initialTab="link" onClose={vi.fn()} onExpired={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Link e QR' }).getAttribute('aria-selected')).toBe('true')
    expect(await screen.findByRole('img', { name: 'Código QR para entrar no Ferrugem FC' })).toBeTruthy()
    expect(screen.getByText('localhost:5173/entrar/tokenAtual')).toBeTruthy()

    await ui.click(screen.getByRole('button', { name: 'Copiar link' }))
    expect(writeText).toHaveBeenCalledWith(link.url)
    expect(await screen.findByText('Link copiado.')).toBeTruthy()
    await ui.click(screen.getByRole('button', { name: 'Compartilhar link' }))
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: link.url }))

    await ui.click(screen.getByRole('button', { name: 'Gerar outro link' }))
    const confirm = screen.getByRole('group', { name: 'Confirmar novo link' })
    expect(confirm.textContent).toContain('deixam de valer na hora')
    expect(api.find('POST', '/teams/10/invite-link')).toHaveLength(0)
    await ui.click(within(confirm).getByRole('button', { name: 'Gerar outro link' }))
    expect(await screen.findByText('Novo link gerado. O anterior não vale mais.')).toBeTruthy()
    expect(screen.getByText('localhost:5173/entrar/tokenNovo')).toBeTruthy()
    expect(api.find('POST', '/teams/10/invite-link')[0].body).toEqual({})

    // Teclado nas abas: a seta volta para Escolher atleta.
    screen.getByRole('tab', { name: 'Link e QR' }).focus()
    await ui.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Escolher atleta' }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Escolher atleta' }))
  })

  it('deixa o link selecionável quando a cópia falha e mostra o erro do link', async () => {
    mockApi({ 'GET /teams/10': team(), 'GET /teams/10/invite-candidates': candidates, 'GET /teams/10/invite-link': link, 'GET /teams/11': team({ id: 11 }),
      'GET /teams/11/invite-candidates': candidates, 'GET /teams/11/invite-link': apiError(403, 'Só representantes podem ver ou gerar o link do time.') })
    const ui = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('negado')) }, configurable: true })
    renderWithToaster(<InviteFlow teamId={10} initialTab="link" onClose={vi.fn()} onExpired={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Compartilhar link' })).toBeNull()
    await ui.click(await screen.findByRole('button', { name: 'Copiar link' }))
    expect(await screen.findByText('Não foi possível copiar. Selecione o link abaixo e copie.')).toBeTruthy()
    const field = screen.getByLabelText('Link do time') as HTMLInputElement
    expect(field.value).toBe(link.url)
    expect(field.readOnly).toBe(true)
    expect(document.activeElement).toBe(field)
    cleanup()
    renderWithToaster(<InviteFlow teamId={11} initialTab="link" onClose={vi.fn()} onExpired={vi.fn()} />)
    expect((await screen.findByRole('alert')).textContent).toContain('Só representantes podem ver ou gerar o link do time.')
  })
})

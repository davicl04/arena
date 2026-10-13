import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import type { User } from '../src/api/client'
import JoinPage from '../src/pages/JoinPage'
import { clearJoinPath, joinTokenFrom } from '../src/utils/joinLink'
import { apiError, brasilia, member, mockApi, person, reply, roster, team } from './teams-fixtures'
import { findToast, renderWithToaster } from './toast-utils'

const me: User = { id: 1, name: 'Ricardo Moura', username: 'ricardo', email: 'ricardo@example.com', birth_date: '1990-01-01', social_public: true, is_admin: false, avatar: null, cover: null }
const TOKEN = 'AbC_123-xyz'
const linkTeam = team({ id: 30, name: 'Real Sudoeste', initials: 'RS', my_role: null, member_count: 4, pending_invites: null, pending_join_requests: null })
const preview = (my_status: string, extra = {}) => ({ team: linkTeam, my_status, invite_id: null, request_id: null, ...extra })
const joinRequest = { id: 700, team_id: 30, requester: person(1, 'Ricardo Moura'), state: 'pendente', created_at: '2026-10-12T10:00:00Z', decided_at: null }

beforeEach(() => { Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

function renderJoin(token = TOKEN) {
  const handlers = { onClose: vi.fn(), onOpenTeams: vi.fn(), onExpired: vi.fn() }
  renderWithToaster(<JoinPage token={token} {...handlers} />)
  return handlers
}

describe('Entrar no time pelo link', () => {
  it('mostra a carteirinha e pede para entrar; depois, aguarda um representante e pode cancelar', async () => {
    const api = mockApi({ [`GET /join/${TOKEN}`]: preview('disponivel'), [`POST /join/${TOKEN}`]: reply(201, joinRequest), 'DELETE /team-join-requests/700': undefined })
    const ui = userEvent.setup()
    renderJoin()
    expect(await screen.findByText('Real Sudoeste')).toBeTruthy()
    expect(screen.getByText('Brasília · 4 atletas')).toBeTruthy()
    expect(screen.getByText('Link do time')).toBeTruthy()
    expect(screen.getByText(/sua posição preferida do futebol aparece no elenco/)).toBeTruthy()
    await ui.click(screen.getByRole('button', { name: 'Pedir para entrar' }))
    expect(await screen.findByText('Pedido enviado · aguardando um representante')).toBeTruthy()
    const sent = await findToast('Pedido enviado.')
    expect(sent.closest('[data-tone]')?.getAttribute('data-tone')).toBe('success')
    expect(await findToast(/Um representante do Real Sudoeste vai responder/)).toBeTruthy()
    expect(api.find('POST', `/join/${TOKEN}`)[0].body).toEqual({})
    await ui.click(screen.getByRole('button', { name: 'Cancelar pedido' }))
    expect(await screen.findByRole('button', { name: 'Pedir para entrar' })).toBeTruthy()
    expect(api.find('DELETE', '/team-join-requests/700')).toHaveLength(1)
  })

  it('cancelar um pedido que um representante já aprovou recarrega a prévia e mostra o estado atual', async () => {
    let approved = false
    const api = mockApi({
      [`GET /join/${TOKEN}`]: () => approved ? preview('membro', { team: { ...linkTeam, my_role: 'membro' } }) : preview('pedido_pendente', { request_id: 700 }),
      'DELETE /team-join-requests/700': () => { approved = true; return apiError(409, 'Este pedido já foi decidido.') },
    })
    const ui = userEvent.setup()
    renderJoin()
    await ui.click(await screen.findByRole('button', { name: 'Cancelar pedido' }))
    expect((await screen.findAllByRole('status')).map(node => node.textContent).join(' ')).toContain('Você já está no elenco do Real Sudoeste.')
    expect(await findToast('Este pedido já foi decidido.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Abrir Meus times' })).toBeTruthy()
    expect(api.find('GET', `/join/${TOKEN}`)).toHaveLength(2)
  })

  it('link trocado ou de time encerrado: "Este link não vale mais"', async () => {
    mockApi({ 'GET /join/velho': apiError(404, 'Este link não vale mais.') })
    const { onClose } = renderJoin('velho')
    expect(await screen.findByRole('heading', { name: 'Este link não vale mais' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Pedir para entrar' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('quem já é membro vê o aviso e segue para Meus times; quem tem convite responde por lá', async () => {
    mockApi({ [`GET /join/${TOKEN}`]: preview('membro', { team: { ...linkTeam, my_role: 'membro' } }), 'GET /join/convite': preview('convite_pendente', { invite_id: 5 }) })
    const ui = userEvent.setup()
    const first = renderJoin()
    expect(await screen.findByText('Você já está no elenco do Real Sudoeste.')).toBeTruthy()
    await ui.click(screen.getByRole('button', { name: 'Abrir Meus times' }))
    expect(first.onOpenTeams).toHaveBeenCalledWith(expect.objectContaining({ id: 30 }), false)
    cleanup()
    const second = renderJoin('convite')
    expect(await screen.findByText('Você já tem um convite do Real Sudoeste. Responda em Meus times.')).toBeTruthy()
    await ui.click(screen.getByRole('button', { name: 'Ver o convite em Meus times' }))
    expect(second.onOpenTeams).toHaveBeenCalledWith(expect.objectContaining({ id: 30 }), true)
  })

  it('mostra o conflito do servidor ao pedir e confere de novo o estado', async () => {
    let member = false
    mockApi({ [`GET /join/${TOKEN}`]: () => preview(member ? 'membro' : 'disponivel'), [`POST /join/${TOKEN}`]: () => { member = true; return apiError(409, 'Você já está no elenco.') } })
    const ui = userEvent.setup()
    renderJoin()
    await ui.click(await screen.findByRole('button', { name: 'Pedir para entrar' }))
    expect(await findToast('Você já está no elenco.')).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Abrir Meus times' })).toBeTruthy()
  })

  it('lê o token do caminho e limpa o endereço', () => {
    expect(joinTokenFrom(`/entrar/${TOKEN}`)).toBe(TOKEN)
    expect(joinTokenFrom(`/entrar/${TOKEN}/`)).toBe(TOKEN)
    expect(joinTokenFrom('/entrar/')).toBeNull()
    expect(joinTokenFrom('/entrar/a b')).toBeNull()
    expect(joinTokenFrom('/perfil')).toBeNull()
    const history = { replaceState: vi.fn() }
    clearJoinPath({ pathname: '/perfil' }, history)
    expect(history.replaceState).not.toHaveBeenCalled()
    clearJoinPath({ pathname: `/entrar/${TOKEN}` }, history)
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/')
  })
})

describe('Link do time no App', () => {
  it('sem sessão, guarda o token em memória durante o login e abre a tela de entrar no time', async () => {
    window.history.pushState(null, '', `/entrar/${TOKEN}`)
    let session = false
    mockApi({
      'GET /me': () => session ? me : apiError(401, 'Entre na sua conta para continuar.'),
      'POST /auth/login': () => { session = true; return { user: me } },
      'GET /me/sports-profiles': [], 'GET /cities': [brasilia],
      [`GET /join/${TOKEN}`]: preview('disponivel'),
    })
    const ui = userEvent.setup()
    renderWithToaster(<App />)
    expect(await screen.findByRole('button', { name: 'Entrar no Arena →' })).toBeTruthy()
    // O token sai do endereço na hora e não vai para nenhum armazenamento.
    expect(window.location.pathname).toBe('/')
    expect(JSON.stringify({ ...localStorage })).not.toContain(TOKEN)
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: me.email } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'SenhaDeTeste123' } })
    await ui.click(screen.getByRole('button', { name: 'Entrar no Arena →' }))
    expect(await screen.findByRole('button', { name: 'Pedir para entrar' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Entrar no time' })).toBeTruthy()
    // Fechar volta ao Início.
    await ui.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Pedir para entrar' })).toBeNull())
  })

  it('sessão expirada na tela do link: o token volta ao App e o próximo login reabre o link', async () => {
    window.history.pushState(null, '', `/entrar/${TOKEN}`)
    let previews = 0
    let session = true
    const api = mockApi({
      'GET /me': () => session ? me : apiError(401, 'Entre na sua conta para continuar.'),
      'POST /auth/login': () => { session = true; return { user: me } },
      'GET /me/sports-profiles': [], 'GET /cities': [brasilia],
      [`GET /join/${TOKEN}`]: () => (++previews === 1 ? apiError(401, 'Entre na sua conta para continuar.') : preview('disponivel')),
    })
    const ui = userEvent.setup()
    renderWithToaster(<App />)
    // A primeira consulta do link responde 401: volta ao login, avisando que a sessão expirou.
    expect(await screen.findByRole('button', { name: 'Entrar no Arena →' })).toBeTruthy()
    expect(screen.getByText('Sua sessão expirou. Entre novamente para continuar.')).toBeTruthy()
    session = false
    expect(JSON.stringify({ ...localStorage })).not.toContain(TOKEN)
    expect(window.location.pathname).toBe('/')
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: me.email } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'SenhaDeTeste123' } })
    await ui.click(screen.getByRole('button', { name: 'Entrar no Arena →' }))
    // O link não se perdeu: a carteirinha do time abre de novo, com o mesmo token.
    expect(await screen.findByRole('button', { name: 'Pedir para entrar' })).toBeTruthy()
    expect(api.find('GET', `/join/${TOKEN}`)).toHaveLength(2)
    // Fechar volta ao Início.
    await ui.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Pedir para entrar' })).toBeNull())
  })

  it('com sessão, vai do link a Meus times, edita, convida pelo QR e cria um time, voltando ao carrossel', async () => {
    window.history.pushState(null, '', `/entrar/${TOKEN}`)
    const created = team({ id: 40, name: 'Unidos do Lago', member_count: 1, representative_count: 1 })
    let mine = [team()]
    mockApi({
      'GET /me': me, 'GET /me/sports-profiles': [{ id: 1, sport: 'futebol', city_id: brasilia.id, position: 'atacante', looking_for: true, is_public: false, level: null }],
      'GET /cities': [brasilia],
      [`GET /join/${TOKEN}`]: preview('membro', { team: team() }),
      'GET /me/teams': () => ({ items: mine }), 'GET /me/team-invites': { items: [] },
      'GET /teams/10': team(), 'GET /teams/10/members': { items: roster() },
      'GET /teams/10/invite-link': { url: 'http://localhost:5173/entrar/x', token: 'x', generated_at: '2026-10-01T10:00:00Z' },
      'GET /teams/10/invite-candidates': { items: [], next_cursor: null },
      'POST /teams': () => { mine = [team(), created]; return reply(201, created) },
      'GET /teams/40/members': { items: [member(1, 'Ricardo Moura', { role: 'representante' })] },
    })
    const ui = userEvent.setup()
    renderWithToaster(<App />)
    await ui.click(await screen.findByRole('button', { name: 'Abrir Meus times' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Meus times' })).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getByRole('button', { current: 'page' }).textContent).toBe('JOGAR')

    await ui.click(await screen.findByRole('button', { name: 'Editar time' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Editar time' })).toBeTruthy()
    await ui.click(screen.getByRole('button', { name: 'Fechar' }))
    await ui.click(await screen.findByRole('button', { name: 'Link e QR do time' }))
    expect(await screen.findByRole('tab', { name: 'Link e QR', selected: true })).toBeTruthy()
    await ui.click(screen.getByRole('button', { name: 'Fechar' }))

    await ui.click(await screen.findByRole('button', { name: 'Criar time' }))
    await ui.type(await screen.findByLabelText('Nome do time'), 'Unidos do Lago')
    await ui.click(screen.getByRole('button', { name: 'Criar time' }))
    expect(await screen.findByText('Seu time só tem você')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Unidos do Lago, 2 de 2' }).getAttribute('tabindex')).toBe('0')
    // Voltar sai de Meus times (Criar time não fica na pilha).
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(screen.queryByRole('heading', { level: 1, name: 'Meus times' })).toBeNull())
  })
})

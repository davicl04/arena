import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { request } from '../src/api/client'
import type { SocialUser, User } from '../src/api/client'
import ArenaPage from '../src/pages/ArenaPage'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

const me: User = { id: 1, name: 'Eu Mesmo', username: 'eu.mesmo', email: 'eu@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
const other: SocialUser = { id: 2, name: 'Atleta Dois', username: 'atleta.dois', avatar_url: null, cover_url: null, social_public: true,
  post_count: 0, follower_count: 3, following_count: 2, follows_you: false, follow_state: 'approved' }
const page = (items: unknown[]) => ({ items, next_cursor: null })

beforeEach(() => {
  Element.prototype.scrollTo = () => {} // jsdom não implementa rolagem
  vi.mocked(request).mockReset()
  vi.mocked(request).mockImplementation(async (path, method) => {
    if (path === '/me/sports-profiles' || path === '/cities') return [] as never
    if (path === '/users/1') return { ...other, id: 1, name: me.name, username: me.username, follower_count: 1, following_count: 0, follow_state: 'self' } as never
    if (path === '/users/2') return other as never
    if (path === '/users/1/followers') return page([{ user: other, state: 'approved' }]) as never
    if (path === '/users/2/followers') return page([]) as never
    if (path.startsWith('/users/2/mutual-followers')) return { items: [], total: 0, next_cursor: null } as never
    if (path === '/users?q=Atleta') return page([other]) as never
    if (path === '/me/follow-requests') return page([{ user: other, state: 'pending' }]) as never
    if (method === 'PUT' || method === 'POST') return {} as never
    return page([]) as never
  })
})
afterEach(cleanup)

const renderArena = (overrides: { onLogout?: () => void } = {}) => {
  const onUser = vi.fn()
  render(<ArenaPage user={me} onUser={onUser} onLogout={overrides.onLogout ?? vi.fn()} onExpired={vi.fn()} />)
  return onUser
}
const nav = (name: string) => within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { name })
const current = () => within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { current: 'page' }).textContent

describe('navegação do ArenaPage', () => {
  it('volta de cada tela de perfil para a tela anterior correta', async () => {
    const ui = userEvent.setup()
    renderArena()
    await ui.click(nav('Perfil'))
    await ui.click(await screen.findByRole('button', { name: 'Editar perfil' }))
    expect(screen.getByRole('heading', { name: 'Editar perfil' })).not.toBeNull()
    expect(current()).toBe('Perfil')
    await ui.click(screen.getByRole('button', { name: /Contas bloqueadas/ }))
    expect(screen.getByRole('heading', { name: 'Contas bloqueadas' })).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('heading', { name: 'Editar perfil' })).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('region', { name: 'Seu perfil' })).not.toBeNull()
    expect(screen.queryByText('eu@example.com')).toBeNull()
  })

  it('abre conexões a partir do perfil, o perfil de uma pessoa e volta passo a passo', async () => {
    const ui = userEvent.setup()
    renderArena()
    await ui.click(nav('Perfil'))
    await ui.click(await screen.findByRole('button', { name: '1 seguidor' }))
    expect(screen.getByRole('heading', { name: 'Conexões' })).not.toBeNull()
    await ui.click(await screen.findByRole('button', { name: 'Abrir perfil de Atleta Dois' }))
    expect(await screen.findByText('@atleta.dois')).not.toBeNull()
    expect(current()).toBe('Perfil')
    await ui.click(screen.getByRole('button', { name: '3 seguidores' }))
    expect(screen.getByRole('heading', { name: 'Conexões' })).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('region', { name: 'Perfil de Atleta Dois' })).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('heading', { name: 'Conexões' })).not.toBeNull()
    await ui.click(screen.getByRole('tab', { name: 'Seguindo' }))
    expect(request).toHaveBeenCalledWith('/users/1/following')
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('region', { name: 'Seu perfil' })).not.toBeNull()
  })

  it('destaca Comunidade ao abrir um perfil pela busca e volta para a comunidade', async () => {
    const ui = userEvent.setup()
    renderArena()
    await ui.click(nav('Comunidade'))
    await ui.type(await screen.findByLabelText('Buscar atletas por nome ou @'), 'Atleta')
    await ui.click(screen.getByRole('button', { name: 'Buscar atletas' }))
    await ui.click(await screen.findByRole('button', { name: 'Abrir perfil de Atleta Dois' }))
    expect(await screen.findByRole('region', { name: 'Perfil de Atleta Dois' })).not.toBeNull()
    expect(current()).toBe('Comunidade')
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(await screen.findByRole('region', { name: 'Comunidade Arena' })).not.toBeNull()
  })

  it('abre as configurações do app pela engrenagem e sai da conta', async () => {
    const onLogout = vi.fn()
    const ui = userEvent.setup()
    renderArena({ onLogout })
    await ui.click(nav('Perfil'))
    await ui.click(await screen.findByRole('button', { name: 'Configurações do app' }))
    expect(screen.getByRole('heading', { name: 'Configurações' })).not.toBeNull()
    expect(screen.getByText('Em breve')).not.toBeNull()
    expect(screen.getByText(/^Versão \d/)).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Sair da conta' }))
    await waitFor(() => expect(onLogout).toHaveBeenCalled())
    expect(request).toHaveBeenCalledWith('/auth/logout', 'POST')
  })

  it('mostra solicitações em Notificações, mantendo Início como aba ativa, e volta ao início', async () => {
    const ui = userEvent.setup()
    renderArena()
    await ui.click(screen.getByRole('button', { name: 'Notificações' }))
    expect(current()).toBe('Início')
    await ui.click(await screen.findByRole('button', { name: 'Aprovar solicitação de Atleta Dois' }))
    expect(request).toHaveBeenCalledWith('/me/follow-requests/2?approve=true', 'PUT')
    expect(await screen.findByText('Tudo em dia')).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('heading', { name: /Bora jogar/ })).not.toBeNull()
  })
})

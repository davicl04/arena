import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import type { SocialUser } from '../src/api/client'
import ConnectionsPage from '../src/pages/ConnectionsPage'
import UserProfilePage from '../src/pages/UserProfilePage'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

const base: SocialUser = { id: 2, name: 'Atleta Dois', username: 'atleta.dois', avatar_url: null, cover_url: null, social_public: false,
  post_count: 0, follower_count: 12, following_count: 5, follows_you: false, follow_state: 'none' }
const friend = (id: number, name: string): SocialUser => ({ ...base, id, name, username: name.toLowerCase().replace(/\s/g, '.') })
const mutualPage = { items: [friend(7, 'Ana Lima'), friend(8, 'Bia Souza'), friend(9, 'Caio Reis')], total: 5, next_cursor: null }

beforeEach(() => { vi.mocked(request).mockReset() })
afterEach(cleanup)

function mockProfile(person: SocialUser, mutual: unknown = mutualPage) {
  let current = person
  vi.mocked(request).mockImplementation(async (path, method) => {
    if (path === '/users/2' && !method) return current as never
    if (path.startsWith('/users/2/mutual-followers')) return mutual as never
    if (path === '/users/2/follow' && method === 'PUT') { current = { ...current, follow_state: current.social_public ? 'approved' : 'pending' }; return { state: current.follow_state } as never }
    if (path === '/users/2/follow' && method === 'DELETE') { current = { ...current, follow_state: 'none' }; return undefined as never }
    if (path.startsWith('/users/2/posts')) return { items: [{ id: 1, author: current, caption: 'Treino', image_url: '/foto.webp', created_at: '2026-10-10T10:00:00Z', like_count: 0, comment_count: 0, liked_by_me: false, can_edit: false }], next_cursor: null } as never
    return undefined as never
  })
}
const renderProfile = (overrides: Partial<React.ComponentProps<typeof UserProfilePage>> = {}) => {
  const props = { userId: 2, ownUserId: 1, onBack: vi.fn(), onOpenConnections: vi.fn(), onExpired: vi.fn(), ...overrides }
  render(<UserProfilePage {...props} />)
  return props
}

describe('UserProfilePage', () => {
  it('mostra contagens e seguidores em comum, mas fecha listas e fotos de conta privada', async () => {
    mockProfile(base)
    const props = renderProfile()
    expect(await screen.findByText('@atleta.dois')).not.toBeNull()
    expect(screen.getByRole('button', { name: '12 seguidores' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '5 seguindo' })).not.toBeNull()
    expect(screen.getByText(/e mais 3 que você segue também seguem esta conta/).textContent).toBe('Ana Lima, Bia Souza e mais 3 que você segue também seguem esta conta')
    expect(screen.getByText(/Esta conta é privada\. Solicite acesso/)).not.toBeNull()
    expect(request).not.toHaveBeenCalledWith('/users/2/posts')
    await userEvent.setup().click(screen.getByRole('button', { name: '12 seguidores' }))
    expect(screen.getByRole('status').textContent).toContain('Esta conta é privada')
    expect(props.onOpenConnections).not.toHaveBeenCalled()
  })

  it('abre conexões e seguidores em comum quando a conta é visível', async () => {
    mockProfile({ ...base, social_public: true }, { items: [friend(7, 'Ana Lima')], total: 1, next_cursor: null })
    const props = renderProfile()
    expect(await screen.findByAltText('Treino')).not.toBeNull()
    expect(screen.getByText(/que você segue, também segue esta conta/).textContent).toBe('Ana Lima, que você segue, também segue esta conta')
    const ui = userEvent.setup()
    await ui.click(screen.getByRole('button', { name: '5 seguindo' }))
    expect(props.onOpenConnections).toHaveBeenCalledWith(2, 'following')
    await ui.click(screen.getByText(/que você segue, também segue/))
    expect(props.onOpenConnections).toHaveBeenCalledWith(2, 'followers', true)
  })

  it('solicita acesso, cancela a solicitação e segue contas públicas', async () => {
    mockProfile(base)
    renderProfile()
    const ui = userEvent.setup()
    await ui.click(await screen.findByRole('button', { name: 'Solicitar' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('/users/2/follow', 'PUT'))
    await ui.click(await screen.findByRole('button', { name: 'Cancelar solicitação' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('/users/2/follow', 'DELETE'))
    expect(await screen.findByRole('button', { name: 'Solicitar' })).not.toBeNull()
    cleanup()
    mockProfile({ ...base, social_public: true })
    renderProfile()
    await ui.click(await screen.findByRole('button', { name: 'Seguir' }))
    expect(await screen.findByRole('button', { name: 'Deixar de seguir' })).not.toBeNull()
  })

  it('bloqueia (voltando à tela anterior) e denuncia a conta', async () => {
    mockProfile(base)
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.stubGlobal('prompt', vi.fn(() => 'spam'))
    const props = renderProfile()
    const ui = userEvent.setup()
    await ui.click(await screen.findByText('•••'))
    await ui.click(screen.getByRole('button', { name: 'Denunciar conta' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('/reports', 'POST', { target_type: 'user', target_id: 2, reason: 'spam' }))
    expect(await screen.findByText('Denúncia enviada para análise.')).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Bloquear' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('/users/2/block', 'PUT'))
    await waitFor(() => expect(props.onBack).toHaveBeenCalled())
  })

  it('mostra o erro quando o perfil está indisponível e permite voltar', async () => {
    vi.mocked(request).mockImplementation(async () => { throw new ApiError('Perfil não encontrado.', 404) })
    const props = renderProfile()
    expect((await screen.findByRole('alert')).textContent).toBe('Perfil não encontrado.')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Voltar' }))
    expect(props.onBack).toHaveBeenCalled()
  })
})

describe('ConnectionsPage', () => {
  const entry = (person: SocialUser) => ({ user: person, state: 'approved' })
  const renderList = (props: Partial<React.ComponentProps<typeof ConnectionsPage>> = {}) => {
    const all = { ownUserId: 1, userId: 1, tab: 'followers' as const, mutual: false, onTab: vi.fn(), onOpenUser: vi.fn(), onExpired: vi.fn(), ...props }
    render(<ConnectionsPage {...all} />)
    return all
  }

  it('no perfil próprio remove seguidores e deixa de seguir', async () => {
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (method === 'DELETE') return undefined as never
      if (path === '/users/1/followers') return { items: [entry(friend(2, 'Ana Lima'))], next_cursor: null } as never
      return { items: [entry({ ...friend(3, 'Bia Souza'), follows_you: true })], next_cursor: null } as never
    })
    const ui = userEvent.setup()
    const props = renderList()
    await ui.click(await screen.findByRole('button', { name: 'Remover' }))
    expect(request).toHaveBeenCalledWith('/me/followers/2', 'DELETE')
    await waitFor(() => expect(screen.queryByText('Ana Lima')).toBeNull())
    expect(await screen.findByText('Nenhuma pessoa por aqui')).not.toBeNull()
    cleanup()
    renderList({ tab: 'following' })
    expect(await screen.findByText('Segue você')).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Deixar de seguir' }))
    expect(request).toHaveBeenCalledWith('/users/3/follow', 'DELETE')
    expect(props.onTab).not.toHaveBeenCalled()
  })

  it('troca de aba e abre o perfil de uma pessoa', async () => {
    vi.mocked(request).mockResolvedValue({ items: [entry(friend(2, 'Ana Lima'))], next_cursor: null } as never)
    const ui = userEvent.setup()
    const props = renderList()
    await ui.click(await screen.findByRole('button', { name: 'Abrir perfil de Ana Lima' }))
    expect(props.onOpenUser).toHaveBeenCalledWith(2)
    await ui.click(screen.getByRole('tab', { name: 'Seguindo' }))
    expect(props.onTab).toHaveBeenCalledWith('following')
  })

  it('é somente leitura no perfil de outra pessoa e trata lista fechada', async () => {
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/users/2/followers') return { items: [entry(friend(5, 'Caio Reis'))], next_cursor: null } as never
      throw new ApiError('Perfil não encontrado.', 404)
    })
    renderList({ userId: 2 })
    expect(await screen.findByText('Caio Reis')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Remover' })).toBeNull()
    cleanup()
    renderList({ userId: 2, tab: 'following' })
    expect(await screen.findByText('Lista fechada')).not.toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('lista seguidores em comum no modo "em comum"', async () => {
    vi.mocked(request).mockResolvedValue({ items: [friend(7, 'Ana Lima')], total: 1, next_cursor: null } as never)
    renderList({ userId: 2, mutual: true })
    expect(await screen.findByText('Ana Lima')).not.toBeNull()
    expect(request).toHaveBeenCalledWith('/users/2/mutual-followers')
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remover' })).toBeNull()
  })
})

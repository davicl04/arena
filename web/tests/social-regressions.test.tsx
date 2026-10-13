import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { request } from '../src/api/client'
import SocialCommunity from '../src/components/SocialCommunity'
import AdminReports from '../src/components/AdminReports'
import BlockedAccountsPage from '../src/pages/BlockedAccountsPage'
import NotificationsPage from '../src/pages/NotificationsPage'
import ProfilePage from '../src/pages/ProfilePage'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))
const person = { id: 2, name: 'Atleta', username: 'atleta', avatar_url: null, cover_url: null, social_public: true, post_count: 21,
  follower_count: 0, following_count: 0, follows_you: false, follow_state: 'none' }
const post = { id: 7, author: person, caption: 'Treino', image_url: '/image',
  created_at: '2026-10-10T10:00:00Z', like_count: 0, comment_count: 0, liked_by_me: false, can_edit: false }
const me = { id: 1, name: 'Eu', username: 'eu', email: 'eu@example.com', birth_date: '1990-01-01', avatar: null, cover: null, social_public: false, is_admin: false }
beforeEach(() => { vi.mocked(request).mockReset() })
afterEach(cleanup)

it('mantém foco e todos os caracteres enquanto digita comentário', async () => {
  vi.mocked(request).mockImplementation(async path => ({ items: path === '/posts' ? [post] : [], next_cursor: null }) as never)
  const user = userEvent.setup()
  render(<SocialCommunity viewerId={1} onOpenUser={vi.fn()} onExpired={vi.fn()} />)
  await user.click(await screen.findByRole('button', { name: 'Comentários (0)' }))
  const input = await screen.findByLabelText('Escreva um comentário')
  await user.type(input, 'Boa!')
  expect((screen.getByLabelText('Escreva um comentário') as HTMLInputElement).value).toBe('Boa!')
  expect(document.activeElement).toBe(screen.getByLabelText('Escreva um comentário'))
})

it('lista solicitações para seguir nas notificações e continua na segunda página', async () => {
  vi.mocked(request).mockImplementation(async path => {
    if (path.startsWith('/me/notifications')) return { items: [], next_cursor: null, unread_count: 0 } as never
    if (path.includes('cursor=')) return { items: [{ user: { ...person, id: 3, name: 'Outra conta' }, state: 'pending' }], next_cursor: null } as never
    return { items: [{ user: person, state: 'pending' }], next_cursor: 'more-requests' } as never
  })
  render(<NotificationsPage onOpenUser={vi.fn()} onNavigate={vi.fn()} onExpired={vi.fn()} />)
  await screen.findByRole('button', { name: 'Aprovar solicitação de Atleta' })
  await userEvent.setup().click(screen.getByRole('button', { name: 'Carregar mais solicitações' }))
  await waitFor(() => expect(request).toHaveBeenCalledWith('/me/follow-requests?cursor=more-requests'))
  expect(await screen.findByText('Outra conta')).not.toBeNull()
  expect(screen.queryByRole('button', { name: 'Carregar mais solicitações' })).toBeNull()
})

it('aprova, recusa e aprova todas as solicitações', async () => {
  const user = userEvent.setup()
  let items = [2, 3, 4].map(id => ({ user: { ...person, id, name: `Conta ${id}` }, state: 'pending' }))
  vi.mocked(request).mockImplementation(async (path, method) => {
    if (method === 'PUT') { items = items.filter(item => !path.includes(`/${item.user.id}?`)); return { state: 'approved' } as never }
    if (path.startsWith('/me/notifications')) return { items: [], next_cursor: null, unread_count: 0 } as never
    return { items, next_cursor: null } as never
  })
  render(<NotificationsPage onOpenUser={vi.fn()} onNavigate={vi.fn()} onExpired={vi.fn()} />)
  await user.click(await screen.findByRole('button', { name: 'Recusar solicitação de Conta 2' }))
  expect(request).toHaveBeenCalledWith('/me/follow-requests/2?approve=false', 'PUT')
  await waitFor(() => expect(screen.queryByText('Conta 2')).toBeNull())
  await user.click(screen.getByRole('button', { name: 'Aprovar solicitação de Conta 3' }))
  expect(request).toHaveBeenCalledWith('/me/follow-requests/3?approve=true', 'PUT')
  await waitFor(() => expect(screen.queryByText('Conta 3')).toBeNull())
  await user.click(screen.getByRole('button', { name: 'Aprovar todas' }))
  expect(await screen.findByText('Tudo em dia')).not.toBeNull()
  expect(request).toHaveBeenCalledWith('/me/follow-requests/4?approve=true', 'PUT')
})

it('mostra o estado vazio quando não há solicitações', async () => {
  vi.mocked(request).mockResolvedValue({ items: [], next_cursor: null } as never)
  render(<NotificationsPage onOpenUser={vi.fn()} onNavigate={vi.fn()} onExpired={vi.fn()} />)
  expect(await screen.findByText('Tudo em dia')).not.toBeNull()
})

it('pagina contas bloqueadas e desbloqueia', async () => {
  vi.mocked(request).mockImplementation(async (path, method) => {
    if (method === 'DELETE') return undefined as never
    const next = path.includes('cursor=')
    return { items: [{ ...person, id: next ? 3 : 2, name: next ? 'Outra conta' : 'Atleta' }], next_cursor: next ? null : 'next-page' } as never
  })
  const user = userEvent.setup()
  render(<BlockedAccountsPage onExpired={vi.fn()} />)
  await user.click(await screen.findByRole('button', { name: 'Carregar mais contas bloqueadas' }))
  expect(await screen.findByText('Outra conta')).not.toBeNull()
  expect(screen.getByText('Atleta')).not.toBeNull()
  await user.click(screen.getAllByRole('button', { name: 'Desbloquear' })[0])
  await waitFor(() => expect(request).toHaveBeenCalledWith('/users/2/block', 'DELETE'))
  await waitFor(() => expect(screen.queryByText('Atleta')).toBeNull())
})

it('mostra estado vazio de contas bloqueadas', async () => {
  vi.mocked(request).mockResolvedValue({ items: [], next_cursor: null } as never)
  render(<BlockedAccountsPage onExpired={vi.fn()} />)
  expect(await screen.findByText('Nenhuma conta bloqueada')).not.toBeNull()
})

it('pagina busca e comentários com seus respectivos cursores', async () => {
  vi.mocked(request).mockImplementation(async path => {
    if (path === '/users/1/following') return { items: [], next_cursor: null } as never
    if (path.startsWith('/users?q=')) return { items: path.includes('cursor=') ? [{ ...person, id: 3, name: 'Outro atleta' }] : [person], next_cursor: path.includes('cursor=') ? null : 'people-next' } as never
    if (path.startsWith('/posts/7/comments')) return { items: [{ id: path.includes('cursor=') ? 12 : 11, author_name: 'Comentarista', author_id: 3, author_avatar_url: null, body: path.includes('cursor=') ? 'Comentário antigo' : 'Comentário recente', created_at: post.created_at, can_delete: false }], next_cursor: path.includes('cursor=') ? null : 'comments-next' } as never
    return { items: [post], next_cursor: null } as never
  })
  const user = userEvent.setup()
  render(<SocialCommunity viewerId={1} onOpenUser={vi.fn()} onExpired={vi.fn()} />)
  await user.click(await screen.findByRole('button', { name: 'Comentários (0)' }))
  await user.click(await screen.findByRole('button', { name: 'Carregar mais comentários' }))
  expect(await screen.findByText(/Comentário antigo/)).not.toBeNull()
  expect(request).toHaveBeenCalledWith('/posts/7/comments?cursor=comments-next')
  await user.click(screen.getByRole('tab', { name: 'Atletas' }))
  await user.type(screen.getByLabelText('Buscar atletas por nome ou @'), 'Atleta{Enter}')
  await user.click(await screen.findByRole('button', { name: 'Carregar mais atletas' }))
  expect(await screen.findByRole('button', { name: 'Abrir perfil de Outro atleta' })).not.toBeNull()
  expect(request).toHaveBeenCalledWith('/users?q=Atleta&cursor=people-next')
})

it('abre o próprio perfil em Fotos, pagina a grade e abre as conexões pelas contagens', async () => {
  vi.mocked(request).mockImplementation(async path => {
    if (path === '/users/1') return { ...person, id: 1, follower_count: 4, following_count: 1, username: 'eu' } as never
    if (path === '/me/profile-stats') return { played: 0, wins: 0, draws: 0, losses: 0, win_rate: null, best_tier: null, in_placement: false } as never
    if (path === '/me/play') return { attention: false, searches: [], proposals: [], offers: [], matches: [] } as never
    if (path.startsWith('/users/1/timeline')) return { items: [], next_cursor: null, total: 0 } as never
    return { items: [{ ...post, id: path.includes('cursor=') ? 8 : 7, caption: path.includes('cursor=') ? 'Foto antiga' : 'Foto recente' }], next_cursor: path.includes('cursor=') ? null : 'own-gallery' } as never
  })
  const go = vi.fn()
  const onNewPhoto = vi.fn()
  const openConnections = vi.fn()
  const user = userEvent.setup()
  render(<ProfilePage user={me} profiles={[]} go={go} onNewPhoto={onNewPhoto} openConnections={openConnections} onExpired={vi.fn()} />)
  expect(screen.queryByText('eu@example.com')).toBeNull()
  expect(screen.getByRole('heading', { name: '@eu' })).not.toBeNull()
  expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Fotos', 'Partidas'])
  expect(screen.getByRole('tab', { name: 'Fotos' }).getAttribute('aria-selected')).toBe('true')
  await user.click(await screen.findByRole('button', { name: '4 seguidores' }))
  expect(openConnections).toHaveBeenCalledWith(1, 'followers')
  await user.click(screen.getByRole('button', { name: '1 seguindo' }))
  expect(openConnections).toHaveBeenCalledWith(1, 'following')
  await user.click(screen.getByRole('button', { name: 'Editar perfil' }))
  expect(go).toHaveBeenCalledWith('edit-profile')
  await user.click(screen.getByRole('button', { name: 'Menu' }))
  expect(go).toHaveBeenCalledWith('menu')
  await user.click(await screen.findByRole('button', { name: 'Carregar mais fotos' }))
  expect(await screen.findByRole('button', { name: /Abrir publicação .*: Foto antiga/ })).not.toBeNull()
  expect(request).toHaveBeenCalledWith('/users/1/posts?cursor=own-gallery')
  // Duas fotos: o quadro "Nova foto" completa a linha e abre a nova publicação na Comunidade.
  await user.click(screen.getByRole('button', { name: 'Nova foto' }))
  expect(onNewPhoto).toHaveBeenCalled()
  await user.click(screen.getByRole('tab', { name: 'Partidas' }))
  expect(await screen.findByText('Sua história em campo começa aqui')).not.toBeNull()
  expect(screen.queryByRole('button', { name: 'Nova foto' })).toBeNull()
})

it('oferece reativação da conta depois de suspensão pela fila', async () => {
  vi.mocked(request).mockResolvedValue({ items: [{ id: 1, target_type: 'user', target_id: 2,
    reason: 'spam', description: null, status: 'resolved', created_at: '2026-10-10T10:00:00Z',
    target_user_id: 2, target_user_active: false, target_preview: null }], next_cursor: null } as never)
  const user = userEvent.setup()
  render(<AdminReports onExpired={vi.fn()} />)
  await user.selectOptions(screen.getByLabelText('Estado das denúncias'), 'resolved')
  await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/reports?status=resolved'))
  await screen.findByText('Conta · #2')
  await user.type(screen.getByLabelText('Justificativa para reativação'), 'Conta revisada')
  await user.click(screen.getByRole('button', { name: 'Reativar conta' }))
  await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/users/2/status?active=true&justification=Conta%20revisada', 'PUT', {}))
  expect(screen.queryByRole('button', { name: 'Reativar conta' })).toBeNull()
})

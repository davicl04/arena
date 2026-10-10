import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { request } from '../src/api/client'
import SocialCommunity from '../src/components/SocialCommunity'
import SocialSettings from '../src/components/SocialSettings'
import AdminReports from '../src/components/AdminReports'
import ProfilePage from '../src/pages/ProfilePage'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))
const person = { id: 2, name: 'Atleta', avatar_url: null, social_public: true, post_count: 21,
  follower_count: 0, following_count: 0, follows_you: false, follow_state: 'none' }
const post = { id: 7, author: person, caption: 'Treino', image_url: '/image',
  created_at: '2026-10-10T10:00:00Z', like_count: 0, comment_count: 0, liked_by_me: false, can_edit: false }
beforeEach(() => { vi.mocked(request).mockReset() })
afterEach(cleanup)

it('mantém foco e todos os caracteres enquanto digita comentário', async () => {
  vi.mocked(request).mockImplementation(async path => ({ items: path === '/posts' ? [post] : [], next_cursor: null }) as never)
  const user = userEvent.setup()
  render(<SocialCommunity ownUserId={1} onExpired={vi.fn()} />)
  await user.click(await screen.findByRole('button', { name: /Comentários · 0/ }))
  const input = await screen.findByLabelText('Escreva um comentário')
  await user.type(input, 'Boa!')
  expect((screen.getByLabelText('Escreva um comentário') as HTMLInputElement).value).toBe('Boa!')
  expect(document.activeElement).toBe(screen.getByLabelText('Escreva um comentário'))
})

it('sincroniza a visibilidade da conta ao carregar e alterar configurações', async () => {
  vi.stubGlobal('confirm', vi.fn(() => true))
  vi.mocked(request).mockImplementation(async (path, method) => {
    if (path === '/me/privacy') return { social_public: method === 'PUT' } as never
    return { items: [], next_cursor: null } as never
  })
  const onPrivacyChange = vi.fn()
  render(<SocialSettings userId={1} onExpired={vi.fn()} onPrivacyChange={onPrivacyChange} />)
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Tornar pública' }))
  await waitFor(() => expect(onPrivacyChange).toHaveBeenCalledWith(true))
  expect(onPrivacyChange).toHaveBeenCalledWith(false)
})

it('oferece a segunda página de solicitações em configurações', async () => {
  vi.mocked(request).mockImplementation(async path => {
    if (path === '/me/privacy') return { social_public: false } as never
    if (path === '/me/blocks') return { items: [], next_cursor: null } as never
    if (path.includes('cursor=')) return { items: [{ user: { ...person, id: 3, name: 'Outra conta' }, state: 'pending' }], next_cursor: null } as never
    return { items: [{ user: person, state: 'pending' }], next_cursor: 'more-requests' } as never
  })
  render(<SocialSettings userId={1} onExpired={vi.fn()} />)
  await screen.findByRole('button', { name: 'Aprovar' })
  await userEvent.setup().click(screen.getByRole('button', { name: 'Carregar mais solicitações' }))
  await waitFor(() => expect(request).toHaveBeenCalledWith('/me/follow-requests?cursor=more-requests'))
  expect(await screen.findByText('Outra conta')).not.toBeNull()
  expect(screen.queryByRole('button', { name: 'Carregar mais solicitações' })).toBeNull()
})

it.each(['followers', 'following', 'blocks'] as const)('pagina %s em configurações preservando a primeira página', async which => {
  vi.mocked(request).mockImplementation(async path => {
    if (path === '/me/privacy') return { social_public: false } as never
    const base = which === 'blocks' ? '/me/blocks' : `/users/1/${which}`
    if (path.startsWith(base)) {
      const next = path.includes('cursor=')
      const user = { ...person, id: next ? 3 : 2, name: next ? 'Outra conta' : 'Atleta' }
      return { items: which === 'blocks' ? [user] : [{ user, state: 'approved' }], next_cursor: next ? null : 'next-page' } as never
    }
    return { items: [], next_cursor: null } as never
  })
  const user = userEvent.setup()
  render(<SocialSettings userId={1} onExpired={vi.fn()} />)
  await screen.findByText('Privacidade social')
  if (which !== 'blocks') await user.click(await screen.findByRole('button', { name: which === 'followers' ? 'Gerenciar seguidores' : 'Gerenciar contas seguidas' }))
  const label = which === 'blocks' ? 'contas bloqueadas' : which === 'followers' ? 'seguidores' : 'contas seguidas'
  await user.click(await screen.findByRole('button', { name: `Carregar mais ${label}` }))
  expect(await screen.findByText('Outra conta')).not.toBeNull()
  expect(screen.getByText('Atleta')).not.toBeNull()
})

it('pagina busca, galeria de terceiro e comentários com seus respectivos cursores', async () => {
  vi.mocked(request).mockImplementation(async path => {
    if (path === '/users/2') return person as never
    if (path.startsWith('/users?q=')) return { items: path.includes('cursor=') ? [{ ...person, id: 3, name: 'Outro atleta' }] : [person], next_cursor: path.includes('cursor=') ? null : 'people-next' } as never
    if (path.startsWith('/posts/7/comments')) return { items: [{ id: path.includes('cursor=') ? 12 : 11, author_name: 'Comentarista', author_id: 3, author_avatar_url: null, body: path.includes('cursor=') ? 'Comentário antigo' : 'Comentário recente', created_at: post.created_at, can_delete: false }], next_cursor: path.includes('cursor=') ? null : 'comments-next' } as never
    if (path.startsWith('/users/2/posts')) return { items: path.includes('cursor=') ? [{ ...post, id: 8, caption: 'Foto antiga' }] : [], next_cursor: path.includes('cursor=') ? null : 'gallery-next' } as never
    return { items: [post], next_cursor: null } as never
  })
  const user = userEvent.setup()
  render(<SocialCommunity ownUserId={1} onExpired={vi.fn()} />)
  await user.click(await screen.findByRole('button', { name: /Comentários · 0/ }))
  await user.click(await screen.findByRole('button', { name: 'Carregar mais comentários' }))
  expect(await screen.findByText(/Comentário antigo/)).not.toBeNull()
  expect(request).toHaveBeenCalledWith('/posts/7/comments?cursor=comments-next')
  await user.type(screen.getByLabelText('Buscar atletas por nome'), 'Atleta')
  await user.click(screen.getByRole('button', { name: 'Buscar atletas' }))
  await user.click(await screen.findByRole('button', { name: 'Carregar mais atletas' }))
  expect(await screen.findByRole('button', { name: /Outro atleta/ })).not.toBeNull()
  expect(request).toHaveBeenCalledWith('/users?q=Atleta&cursor=people-next')
  await user.click(screen.getAllByRole('button', { name: /Atleta/ }).find(button => button.className === 'social-author-link')!)
  await user.click(await screen.findByRole('button', { name: 'Carregar mais fotos' }))
  expect(await screen.findByText(/Foto antiga/)).not.toBeNull()
  expect(request).toHaveBeenCalledWith('/users/2/posts?cursor=gallery-next')
})

it('pagina a aba Fotos do próprio perfil', async () => {
  vi.mocked(request).mockImplementation(async path => ({ items: [{ ...post, id: path.includes('cursor=') ? 8 : 7, caption: path.includes('cursor=') ? 'Foto antiga' : 'Foto recente' }], next_cursor: path.includes('cursor=') ? null : 'own-gallery' }) as never)
  const user = userEvent.setup()
  render(<ProfilePage user={{ id: 1, name: 'Eu', email: 'eu@example.com', birth_date: '1990-01-01', avatar: null, social_public: false, is_admin: false }} profiles={[]} go={vi.fn()} />)
  await user.click(screen.getByRole('tab', { name: 'Fotos' }))
  await user.click(await screen.findByRole('button', { name: 'Carregar mais fotos' }))
  expect(await screen.findByAltText('Foto antiga')).not.toBeNull()
  expect(screen.getByAltText('Foto recente')).not.toBeNull()
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

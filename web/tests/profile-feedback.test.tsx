import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import type { SocialUser, User } from '../src/api/client'
import AccountActions from '../src/components/AccountActions'
import SportCard from '../src/components/SportCard'
import ArenaPage from '../src/pages/ArenaPage'
import BlockedAccountsPage from '../src/pages/BlockedAccountsPage'
import EditProfilePage from '../src/pages/EditProfilePage'
import { findToast, renderWithToaster } from './toast-utils'

/* Níveis de feedback das telas de perfil e conta: toast de ação, erro de carregamento e erro junto ao formulário. */

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

const me: User = { id: 1, name: 'Eu Mesmo', username: 'eu.mesmo', email: 'eu@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
const person: SocialUser = { id: 2, name: 'Atleta Dois', username: 'atleta.dois', avatar_url: null, cover_url: null, social_public: true,
  post_count: 0, follower_count: 3, following_count: 2, follows_you: false, follow_state: 'none' }
const tone = async (text: string) => (await findToast(text)).closest('[data-tone]')?.getAttribute('data-tone')
const cities = [{ id: 1, name: 'Brasília', state: 'DF' }]

beforeEach(() => {
  Element.prototype.scrollTo = () => {}
  vi.mocked(request).mockReset()
})
afterEach(cleanup)

describe('SportCard', () => {
  const open = async (onSave: () => Promise<void>, onExpired = vi.fn()) => {
    const ui = userEvent.setup()
    renderWithToaster(<SportCard sport="tenis" label="Tênis" symbol="" description="Quadras" cities={cities} onSave={onSave} onExpired={onExpired} />)
    await ui.click(screen.getByRole('button', { name: /Adicionar tênis/ }))
    await ui.selectOptions(screen.getByLabelText('Cidade'), '1')
    await ui.click(screen.getByRole('button', { name: 'Salvar perfil' }))
    return onExpired
  }

  it('confirma o salvamento com um toast de sucesso, sem bloco na tela', async () => {
    await open(vi.fn().mockResolvedValue(undefined))
    expect(await tone('Perfil salvo.')).toBe('success')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('mostra a falha comum como toast de erro e mantém o formulário aberto', async () => {
    await open(vi.fn().mockRejectedValue(new ApiError('Cidade indisponível agora.', 500)))
    expect(await tone('Cidade indisponível agora.')).toBe('error')
    expect(screen.getByRole('button', { name: 'Salvar perfil' })).not.toBeNull()
  })

  it('deixa a recusa de campos junto ao formulário e chama onExpired no 401', async () => {
    await open(vi.fn().mockRejectedValue(new ApiError('Revise a cidade.', 422, [{ field: 'city_id', message: 'Cidade inválida' }])))
    const form = await screen.findByText('Revise a cidade.')
    expect(form.getAttribute('role')).toBe('alert')
    expect(form.closest('[data-tone]')).toBeNull()
    cleanup()
    const onExpired = await open(vi.fn().mockRejectedValue(new ApiError('Sessão expirada.', 401)))
    await waitFor(() => expect(onExpired).toHaveBeenCalled())
  })
})

describe('EditProfilePage', () => {
  const openVisibility = async () => {
    const ui = userEvent.setup()
    renderWithToaster(<EditProfilePage user={me} onUser={vi.fn()} onExpired={vi.fn()} openBlocked={vi.fn()} />)
    await ui.click(screen.getByRole('button', { name: /Visibilidade da conta/ }))
    await ui.click(screen.getByRole('radio', { name: /Pública/ }))
    await ui.click(screen.getByRole('button', { name: 'Tornar pública' }))
  }

  it('confirma a visibilidade alterada com um toast de sucesso', async () => {
    vi.mocked(request).mockResolvedValue({ social_public: true } as never)
    await openVisibility()
    expect(await tone('Conta pública.')).toBe('success')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('mostra a falha ao salvar como toast de erro e mantém a folha aberta', async () => {
    vi.mocked(request).mockRejectedValue(new ApiError('Falha ao salvar a privacidade.', 500))
    await openVisibility()
    expect(await tone('Falha ao salvar a privacidade.')).toBe('error')
    expect(screen.getByRole('dialog', { name: 'Visibilidade da conta' })).not.toBeNull()
  })
})

describe('BlockedAccountsPage', () => {
  it('mostra o erro de carregamento com Tentar novamente e a falha ao desbloquear como toast', async () => {
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Lista indisponível.', 500))
    const ui = userEvent.setup()
    renderWithToaster(<BlockedAccountsPage onExpired={vi.fn()} />)
    const alert = await screen.findByRole('alert')
    expect(alert.getAttribute('data-slot')).toBe('load-error')
    expect(alert.textContent).toContain('Lista indisponível.')
    vi.mocked(request).mockImplementation(async (_path, method) => {
      if (method === 'DELETE') throw new ApiError('Não foi possível desbloquear agora.', 500)
      return { items: [person], next_cursor: null } as never
    })
    await ui.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    await ui.click(await screen.findByRole('button', { name: 'Desbloquear' }))
    expect(await tone('Não foi possível desbloquear agora.')).toBe('error')
    expect(screen.getByText('Atleta Dois')).not.toBeNull()
  })
})

describe('AccountActions', () => {
  it('mostra a falha ao bloquear como toast e mantém a confirmação', async () => {
    vi.mocked(request).mockRejectedValue(new ApiError('Não foi possível bloquear agora.', 500))
    const onBlocked = vi.fn()
    const ui = userEvent.setup()
    renderWithToaster(<AccountActions person={person} onClose={vi.fn()} onBlocked={onBlocked} onReported={vi.fn()} onExpired={vi.fn()} />)
    await ui.click(screen.getByRole('button', { name: 'Bloquear' }))
    await ui.click(screen.getByRole('button', { name: 'Bloquear' }))
    expect(await tone('Não foi possível bloquear agora.')).toBe('error')
    expect(onBlocked).not.toHaveBeenCalled()
    expect(screen.getByText('Bloquear @atleta.dois?')).not.toBeNull()
  })
})

describe('ArenaPage: perfis e cidades', () => {
  it('separa o erro de carregamento (Tentar novamente) do erro de ação (toast)', async () => {
    let failing = true
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/me/sports-profiles' && failing) throw new ApiError('Perfis indisponíveis.', 500)
      if (path === '/auth/logout') throw new ApiError('Não foi possível sair agora.', 500)
      if (path === '/me/sports-profiles' || path === '/cities') return [] as never
      return { items: [], next_cursor: null } as never
    })
    const ui = userEvent.setup()
    render(<ArenaPage user={me} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} />)
    const text = await screen.findByText('Perfis indisponíveis.')
    expect(text.closest('[data-slot="load-error"]')).not.toBeNull()
    failing = false
    await ui.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(document.querySelector('[data-slot="load-error"]')).toBeNull())
    await ui.click(within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { name: 'Perfil' }))
    await ui.click(await screen.findByRole('button', { name: 'Menu' }))
    await ui.click(screen.getByRole('button', { name: 'Sair da conta' }))
    expect(await tone('Não foi possível sair agora.')).toBe('error')
    expect(document.querySelector('[data-slot="load-error"]')).toBeNull()
  })
})

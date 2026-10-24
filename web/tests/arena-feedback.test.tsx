import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '../src/api/client'
import { request } from '../src/api/client'
import { connection } from '../src/api/connection'
import { toast } from '../src/components/ui/toast'
import ArenaPage from '../src/pages/ArenaPage'
import AuthPage from '../src/pages/AuthPage'
import { brasilia, football, playBoard, standings } from './matchmaking-fixtures'
import { mockApi } from './teams-fixtures'
import { findToast } from './toast-utils'

afterEach(cleanup)

const me: User = { id: 1, name: 'Ricardo Leão', username: 'ricardo.leao', email: 'r@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }

describe('avisos no painel do app', () => {
  it('ArenaPage monta o Toaster e o aviso de conexão dentro do painel', async () => {
    Element.prototype.scrollTo = () => {}
    mockApi({
      'GET /me/sports-profiles': [football], 'GET /cities': [brasilia], 'GET /me/notifications/unread-count': { unread_count: 0 },
      'GET /me/standings': standings(), 'GET /me/play': playBoard(),
    })
    render(<ArenaPage user={me} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} />)
    await screen.findByRole('navigation', { name: 'Navegação principal' })
    const frame = document.querySelector<HTMLElement>('[data-slot="app-frame"]')!

    // Toast: dentro do painel, acima da navegação.
    act(() => { toast.success('Perfil salvo.') })
    const message = await findToast('Perfil salvo.')
    expect(frame.contains(message)).toBe(true)
    expect(document.querySelectorAll('[role="region"][aria-label="Avisos"]')).toHaveLength(1)

    // Uma leitura sem conexão liga a faixa e sobe o toast; uma ação abre a folha por cima do painel.
    act(() => connection.lost({ mutating: false }))
    expect(within(frame).getByText('Sem conexão com a ARENA')).toBeTruthy()
    expect(frame.style.getPropertyValue('--connection-dock')).toBe('52px')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
    await act(async () => { await request('/me', 'PUT', { name: 'Ricardo' }).catch(() => undefined) })
    const sheet = screen.getByRole('dialog', { name: 'Sem conexão com a ARENA' })
    expect(frame.contains(sheet)).toBe(true)
    await userEvent.setup().click(within(sheet).getByRole('button', { name: 'Continuar sem conexão' }))
    expect(screen.queryByRole('dialog', { name: 'Sem conexão com a ARENA' })).toBeNull()
    expect(connection.getState().sheetDismissed).toBe(true)
  })

  it('a tela de entrada tem o Toaster, mas não o aviso de conexão', async () => {
    render(<AuthPage onLogin={vi.fn()} notice="" onRetry={vi.fn()} />)
    act(() => { toast.success('Conta criada.') })
    expect(await findToast('Conta criada.')).toBeTruthy()
    act(() => connection.lost({ mutating: true }))
    expect(document.querySelector('[data-slot="connection-strip"]')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

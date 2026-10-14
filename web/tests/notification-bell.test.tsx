import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { request } from '../src/api/client'
import type { User } from '../src/api/client'
import { NotificationBell } from '../src/components/notifications/NotificationBell'
import SocialCommunity from '../src/components/SocialCommunity'
import PlayPage from '../src/pages/PlayPage'
import ProfilePage from '../src/pages/ProfilePage'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

beforeEach(() => { vi.mocked(request).mockReset(); vi.mocked(request).mockResolvedValue({ items: [], next_cursor: null } as never) })
afterEach(cleanup)

describe('NotificationBell', () => {
  it.each(['light', 'dark', 'cover'] as const)('tom %s: mostra o número e o nome acessível com o total', tone => {
    render(<NotificationBell tone={tone} count={5} onOpen={vi.fn()} />)
    const bell = screen.getByRole('button', { name: 'Notificações, 5 novas' })
    expect(bell.textContent).toBe('5')
    expect(bell.querySelector('[data-testid="unread-indicator"]')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('usa o singular com uma novidade', () => {
    render(<NotificationBell tone="light" count={1} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Notificações, 1 nova' }).textContent).toBe('1')
  })

  it.each([[9, '9'], [10, '9+'], [137, '9+']])('com %i mostra "%s" e o nome acessível traz o total real', (count, shown) => {
    render(<NotificationBell tone="dark" count={count} onOpen={vi.fn()} />)
    const bell = screen.getByRole('button', { name: `Notificações, ${count} novas` })
    expect(bell.querySelector('[data-testid="unread-indicator"]')?.textContent).toBe(shown)
  })

  it.each(['light', 'dark', 'cover'] as const)('tom %s: sem novidades não mostra contador e o nome é só "Notificações"', tone => {
    render(<NotificationBell tone={tone} count={0} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Notificações' }).textContent).toBe('')
    expect(screen.queryByTestId('unread-indicator')).toBeNull()
  })

  it('abre ao clicar e ao usar o teclado, e tem alvo de 44 px (size-11)', async () => {
    const onOpen = vi.fn()
    render(<NotificationBell tone="dark" count={2} onOpen={onOpen} />)
    const bell = screen.getByRole('button', { name: 'Notificações, 2 novas' })
    expect(bell.className).toContain('size-11')
    const ui = userEvent.setup()
    await ui.click(bell)
    bell.focus()
    await ui.keyboard('{Enter}')
    await ui.keyboard(' ')
    expect(onOpen).toHaveBeenCalledTimes(3)
  })

  it('o contador troca de cor com o fundo: verde na barra clara, menta nas escuras', () => {
    const { rerender } = render(<NotificationBell tone="light" count={3} onOpen={vi.fn()} />)
    expect(screen.getByTestId('unread-indicator').className).toContain('bg-brand')
    rerender(<NotificationBell tone="dark" count={3} onOpen={vi.fn()} />)
    expect(screen.getByTestId('unread-indicator').className).toContain('bg-mint')
    expect(screen.getByTestId('unread-indicator').className).toContain('ring-forest')
    rerender(<NotificationBell tone="cover" count={3} onOpen={vi.fn()} />)
    expect(screen.getByTestId('unread-indicator').className).toContain('bg-mint')
  })
})

describe('o sino nas abas raiz', () => {
  const me: User = { id: 1, name: 'Eu Mesmo', username: 'eu.mesmo', email: 'eu@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }

  it('Jogar: fica na barra da placa, depois do chip da cidade, e abre as notificações', async () => {
    const go = vi.fn()
    render(<PlayPage profiles={[]} cities={[]} loading={false} notificationCount={4} go={go}
      board={{ board: null, loading: true, error: '', reload: vi.fn(async () => null), deferred: [], defer: vi.fn() }} onExpired={vi.fn()} />)
    const city = screen.getByRole('button', { name: /cidade/i })
    const bell = screen.getByRole('button', { name: 'Notificações, 4 novas' })
    expect(city.compareDocumentPosition(bell) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(city.parentElement).toBe(bell.parentElement)
    await userEvent.setup().click(bell)
    expect(go).toHaveBeenCalledWith('notifications')
  })

  it('Comunidade: fica antes do botão "+" e abre as notificações', async () => {
    const onNotifications = vi.fn()
    render(<SocialCommunity viewerId={1} onOpenUser={vi.fn()} onExpired={vi.fn()} notificationCount={12} onNotifications={onNotifications} />)
    const bell = screen.getByRole('button', { name: 'Notificações, 12 novas' })
    const plus = screen.getByRole('button', { name: 'Nova publicação' })
    expect(bell.compareDocumentPosition(plus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(bell.textContent).toBe('9+')
    await userEvent.setup().click(bell)
    expect(onNotifications).toHaveBeenCalledTimes(1)
  })

  it('Comunidade sem o atalho não mostra o sino', () => {
    render(<SocialCommunity viewerId={1} onOpenUser={vi.fn()} onExpired={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /^Notificações/ })).toBeNull()
  })

  it('Perfil próprio: o sino de capa fica antes do Menu', async () => {
    const go = vi.fn()
    render(<ProfilePage user={me} profiles={[]} go={go} notificationCount={2} onNewPhoto={vi.fn()} openConnections={vi.fn()} onExpired={vi.fn()} />)
    const bell = screen.getByRole('button', { name: 'Notificações, 2 novas' })
    const menu = screen.getByRole('button', { name: 'Menu' })
    expect(bell.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(bell.getAttribute('data-slot')).toBe('icon-button')
    await userEvent.setup().click(bell)
    expect(go).toHaveBeenCalledWith('notifications')
  })
})

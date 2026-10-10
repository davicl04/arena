import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { SocialUser } from '../src/api/client'
import NotificationsPage from '../src/pages/NotificationsPage'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(),
}))

function requests(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1
    const user: SocialUser = {
      id, name: `Atleta ${id}`, username: `atleta${id}`, avatar_url: null, cover_url: null,
      social_public: false, post_count: 0, follower_count: 0, following_count: 0,
      follows_you: false, follow_state: 'pending',
    }
    return { user, state: 'pending' }
  })
}

describe('aprovação de todas as solicitações', () => {
  beforeEach(() => { vi.mocked(request).mockReset() })
  afterEach(cleanup)

  it.each([21, 45])('aprova %i pedidos de todas as páginas em sequência', async count => {
    const pending = requests(count)
    const approved: number[] = []
    let active = 0
    let maxActive = 0
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (method === 'PUT') {
        active += 1
        maxActive = Math.max(maxActive, active)
        await Promise.resolve()
        const id = Number(path.match(/requests\/(\d+)/)?.[1])
        approved.push(id)
        pending.splice(pending.findIndex(item => item.user.id === id), 1)
        active -= 1
        return { state: 'approved' } as never
      }
      expect(path).toBe('/me/follow-requests')
      return { items: pending.slice(0, 20), next_cursor: pending.length > 20 ? 'next' : null } as never
    })
    render(<NotificationsPage onOpenUser={vi.fn()} onExpired={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar todas' }))

    await screen.findByText('Tudo em dia')
    expect(pending).toHaveLength(0)
    expect(approved).toEqual(Array.from({ length: count }, (_, index) => index + 1))
    expect(maxActive).toBe(1)
  })

  it('mantém os pedidos pendentes após erro parcial e permite retomar sem repetir aprovados', async () => {
    const pending = requests(45)
    const approved: number[] = []
    let fail = true
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (method === 'PUT') {
        const id = Number(path.match(/requests\/(\d+)/)?.[1])
        if (id === 21 && fail) throw new ApiError('Falha ao aprovar a solicitação.', 503)
        approved.push(id)
        pending.splice(pending.findIndex(item => item.user.id === id), 1)
        return { state: 'approved' } as never
      }
      return { items: pending.slice(0, 20), next_cursor: pending.length > 20 ? 'next' : null } as never
    })
    render(<NotificationsPage onOpenUser={vi.fn()} onExpired={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar todas' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Falha ao aprovar a solicitação.')
    await screen.findByText('Atleta 21')
    expect(screen.queryByText('Atleta 1')).toBeNull()
    expect(screen.queryByText('Tudo em dia')).toBeNull()
    expect(pending).toHaveLength(25)
    expect(approved).toHaveLength(20)
    await waitFor(() => expect((screen.getByRole('button', { name: 'Aprovar todas' }) as HTMLButtonElement).disabled).toBe(false))

    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar todas' }))
    await screen.findByText('Tudo em dia')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(pending).toHaveLength(0)
    expect(approved).toEqual(Array.from({ length: 45 }, (_, index) => index + 1))
  })

  it('recupera a lista quando buscar o próximo lote falha depois de aprovar a primeira página', async () => {
    const pending = requests(21)
    let reads = 0
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (method === 'PUT') {
        const id = Number(path.match(/requests\/(\d+)/)?.[1])
        pending.splice(pending.findIndex(item => item.user.id === id), 1)
        return { state: 'approved' } as never
      }
      reads += 1
      if (reads === 3) throw new ApiError('Não foi possível carregar o próximo lote.', 503)
      return { items: pending.slice(0, 20), next_cursor: pending.length > 20 ? 'next' : null } as never
    })
    render(<NotificationsPage onOpenUser={vi.fn()} onExpired={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar todas' }))

    await screen.findByText('Atleta 21')
    expect(screen.getByRole('alert').textContent).toContain('Não foi possível carregar o próximo lote.')
    expect(screen.queryByText('Tudo em dia')).toBeNull()
    expect(pending).toHaveLength(1)
    expect((screen.getByRole('button', { name: 'Aprovar todas' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

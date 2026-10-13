import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import type { SocialUser } from '../src/api/client'
import FollowRequestsPage from '../src/pages/FollowRequestsPage'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(),
}))

const reload = vi.fn(async () => {})
const renderPage = () => render(<FollowRequestsPage summary={{ data: null, count: 0, error: '', reload, setData: vi.fn() }} onOpenUser={vi.fn()} onExpired={vi.fn()} />)

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
  beforeEach(() => { vi.mocked(request).mockReset(); reload.mockClear() })
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
    renderPage()
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
    renderPage()
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
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar todas' }))

    await screen.findByText('Atleta 21')
    expect(screen.getByRole('alert').textContent).toContain('Não foi possível carregar o próximo lote.')
    expect(screen.queryByText('Tudo em dia')).toBeNull()
    expect(pending).toHaveLength(1)
    expect((screen.getByRole('button', { name: 'Aprovar todas' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

const person = { id: 2, name: 'Atleta', username: 'atleta', avatar_url: null, cover_url: null, social_public: true, post_count: 21,
  follower_count: 0, following_count: 0, follows_you: false, follow_state: 'none' }

describe('Pedidos para seguir', () => {
  beforeEach(() => { vi.mocked(request).mockReset(); reload.mockClear() })
  afterEach(cleanup)

  it('lista os pedidos para seguir e continua na segunda página', async () => {
    vi.mocked(request).mockImplementation(async path => {
      if (path.includes('cursor=')) return { items: [{ user: { ...person, id: 3, name: 'Outra conta' }, state: 'pending' }], next_cursor: null } as never
      return { items: [{ user: person, state: 'pending' }], next_cursor: 'more-requests' } as never
    })
    renderPage()
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
      return { items, next_cursor: null } as never
    })
    renderPage()
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

  it('mostra o estado vazio quando não há pedidos', async () => {
    vi.mocked(request).mockResolvedValue({ items: [], next_cursor: null } as never)
    renderPage()
    expect(await screen.findByText('Tudo em dia')).not.toBeNull()
  })

  it('lê o resumo de novo depois de aprovar e depois de recusar', async () => {
    let items = [2, 3].map(id => ({ user: { ...person, id, name: `Conta ${id}` }, state: 'pending' }))
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (method === 'PUT') { items = items.filter(item => !path.includes(`/${item.user.id}?`)); return { state: 'approved' } as never }
      return { items, next_cursor: null } as never
    })
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Aprovar solicitação de Conta 2' }))
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Recusar solicitação de Conta 3' }))
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Tudo em dia')).not.toBeNull()
  })
})

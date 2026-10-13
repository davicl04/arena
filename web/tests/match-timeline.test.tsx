import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import type { Profile, User } from '../src/api/client'
import { MatchTimeline } from '../src/components/profile-matches/MatchTimeline'
import ProfilePage from '../src/pages/ProfilePage'
import { matchCard, playBoard, inFuture, HOUR } from './matchmaking-fixtures'
import { match, run, stats, tennisMatch } from './timeline-fixtures'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

beforeEach(() => { vi.mocked(request).mockReset() })
afterEach(cleanup)

const page = (items: unknown[], extra: Record<string, unknown> = {}) => ({ items, next_cursor: null, total: items.length, ...extra })
const upcoming = matchCard({ id: 77, state: 'agendada', phase: 'agendada', starts_at: inFuture(50 * HOUR), court: { id: 3, name: 'Arena Sudoeste', address: null, kind: 'society', city: { id: 1, name: 'Brasília', state: 'DF' }, state: 'publicada', provisional: false } })

const renderTimeline = (props: Partial<React.ComponentProps<typeof MatchTimeline>> = {}) =>
  render(<MatchTimeline userId={1} own onExpired={vi.fn()} {...props} />)

describe('MatchTimeline', () => {
  it('mostra o carregamento com role status e depois a contagem e o trilho com partida e corrida', async () => {
    let resolve!: (value: unknown) => void
    vi.mocked(request).mockImplementation(() => new Promise(done => { resolve = done }) as never)
    renderTimeline({ matches: null })
    expect(screen.getByRole('status', { name: 'Carregando partidas' })).not.toBeNull()
    resolve(page([match(), run()], { total: 12 }))
    expect(await screen.findByText('12 registros')).not.toBeNull()
    expect(screen.getByText(/Todas as modalidades/)).not.toBeNull()
    expect(screen.getByRole('article', { name: 'Ferrugem FC × Leões do Cerrado' })).not.toBeNull()
    expect(screen.getByRole('article', { name: 'Corrida de 5 km em 24:12' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'outubro 2026' })).not.toBeNull()
    expect(request).toHaveBeenCalledWith('/users/1/timeline')
  })

  it('mostra o erro e tenta de novo', async () => {
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Falha ao carregar.', 500)).mockResolvedValue(page([match()]) as never)
    renderTimeline({ matches: null })
    expect(await screen.findByRole('alert')).not.toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('1 registro')).not.toBeNull()
  })

  it('mostra o vazio próprio com o botão Jogar', async () => {
    vi.mocked(request).mockResolvedValue(page([]) as never)
    const onPlay = vi.fn()
    renderTimeline({ matches: [], onPlay })
    expect(await screen.findByText('Sua história em campo começa aqui')).not.toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Jogar' }))
    expect(onPlay).toHaveBeenCalled()
  })

  it('mostra o vazio de visitante, inclusive quando a API responde 404', async () => {
    vi.mocked(request).mockResolvedValue(page([]) as never)
    renderTimeline({ own: false })
    expect(await screen.findByText('Nenhuma partida por aqui')).not.toBeNull()
    cleanup()
    vi.mocked(request).mockRejectedValue(new ApiError('Não encontrado.', 404))
    renderTimeline({ own: false, userId: 2 })
    expect(await screen.findByText('Nenhuma partida por aqui')).not.toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('filtra pelo ícone, com menu de escolha única, ponto de filtro ativo e vazio do filtro', async () => {
    vi.mocked(request).mockImplementation(async path => (path.includes('sport=tenis') ? page([]) : page([match(), tennisMatch()])) as never)
    const ui = userEvent.setup()
    renderTimeline({ matches: null })
    const trigger = await screen.findByRole('button', { name: 'Filtrar por modalidade' })
    expect(document.querySelector('[data-slot="filter-dot"]')).toBeNull()
    await ui.click(trigger)
    const group = await screen.findByRole('radiogroup', { name: 'Modalidade' })
    expect(within(group).getAllByRole('radio').map(radio => radio.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false'])
    await ui.click(within(group).getByText('Tênis'))
    await waitFor(() => expect(request).toHaveBeenCalledWith('/users/1/timeline?sport=tenis'))
    expect(await screen.findByText('Nenhum registro neste filtro')).not.toBeNull()
    expect(screen.getByText(/0 registros/)).not.toBeNull()
    expect(document.querySelector('[data-slot="filter-dot"]')).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Ver todas as modalidades' }))
    expect(await screen.findByRole('article', { name: 'Ricardo Moura × Caio Ramos' })).not.toBeNull()
    expect(document.querySelector('[data-slot="filter-dot"]')).toBeNull()
  })

  it('carrega mais com o cursor', async () => {
    vi.mocked(request).mockImplementation(async path => (path.includes('cursor=c2')
      ? page([match({ id: 60, sides: [match().sides[0], { ...match().sides[1], team: { id: 30, name: 'Tigres FC', initials: 'TF', crest_url: null } }] })], { total: 2 })
      : page([match()], { total: 2, next_cursor: 'c2' })) as never)
    const ui = userEvent.setup()
    renderTimeline({ matches: null })
    await ui.click(await screen.findByRole('button', { name: 'Carregar mais' }))
    expect(await screen.findByRole('article', { name: 'Ferrugem FC × Tigres FC' })).not.toBeNull()
    expect(request).toHaveBeenCalledWith('/users/1/timeline?cursor=c2')
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
  })

  it('mostra a próxima partida só no perfil próprio e a abre', async () => {
    vi.mocked(request).mockResolvedValue(page([match()]) as never)
    const onOpenMatch = vi.fn()
    const ui = userEvent.setup()
    renderTimeline({ matches: playBoard({ matches: [upcoming] }).matches, onOpenMatch })
    await ui.click(await screen.findByRole('button', { name: /Abrir próxima partida: Leões J1 × Tigres J1, Em [0-9] dias/ }))
    expect(onOpenMatch).toHaveBeenCalledWith(77)
    expect(screen.getByText(/Arena Sudoeste/)).not.toBeNull()
    cleanup()
    renderTimeline({ own: false, matches: [upcoming], onOpenMatch })
    await screen.findByRole('article', { name: 'Ferrugem FC × Leões do Cerrado' })
    expect(screen.queryByText('Próxima partida')).toBeNull()
  })

  it('lê a placa sozinha quando a página não a trouxe e mostra a próxima partida mesmo sem registros', async () => {
    vi.mocked(request).mockImplementation(async path => (path === '/me/play' ? playBoard({ matches: [upcoming] }) : page([])) as never)
    renderTimeline({ onOpenMatch: vi.fn() })
    expect(await screen.findByRole('button', { name: /Abrir próxima partida/ })).not.toBeNull()
    expect(request).toHaveBeenCalledWith('/me/play')
    expect(screen.queryByText('Sua história em campo começa aqui')).toBeNull()
  })

  it('torna só as partidas tocáveis no perfil próprio, nunca as corridas', async () => {
    vi.mocked(request).mockResolvedValue(page([match(), run()]) as never)
    const onOpenMatch = vi.fn()
    const ui = userEvent.setup()
    renderTimeline({ matches: null, onOpenMatch })
    await ui.click(await screen.findByRole('button', { name: /Abrir partida: Ferrugem FC × Leões do Cerrado/ }))
    expect(onOpenMatch).toHaveBeenCalledWith(50)
    expect(screen.getAllByRole('button').map(button => button.getAttribute('aria-label'))).not.toContain('Corrida de 5 km em 24:12')
    cleanup()
    renderTimeline({ own: false, onOpenMatch })
    await screen.findByRole('article', { name: 'Ferrugem FC × Leões do Cerrado' })
    expect(screen.queryByRole('button', { name: /Abrir partida/ })).toBeNull()
  })
})

describe('ProfilePage: estatísticas do perfil', () => {
  const me: User = { id: 1, name: 'Eu', username: 'eu', email: 'eu@example.com', birth_date: '1990-01-01', avatar: null, cover: null, social_public: false, is_admin: false }
  const mockStats = (result: unknown) => vi.mocked(request).mockImplementation(async path => {
    if (path === '/me/profile-stats') { if (result instanceof Error) throw result; return result as never }
    if (path === '/users/1') return { id: 1, name: 'Eu', username: 'eu', avatar_url: null, cover_url: null, social_public: false, post_count: 0, follower_count: 0, following_count: 0, follows_you: false, follow_state: 'self' } as never
    return page([]) as never
  })
  const renderProfile = () => render(<ProfilePage user={me} profiles={[] as Profile[]} go={vi.fn()} onNewPhoto={vi.fn()} openConnections={vi.fn()} onExpired={vi.fn()} />)

  it('mostra taxa de vitória, partidas e o melhor elo', async () => {
    mockStats(stats())
    renderProfile()
    expect(await screen.findByText('63%')).not.toBeNull()
    expect(screen.getByText('8')).not.toBeNull()
    expect(screen.getByText('Melhor elo')).not.toBeNull()
    expect(screen.getByText('Ouro')).not.toBeNull()
    expect(screen.queryByText('Pontos de elo')).toBeNull()
  })

  it('mostra "Em classificação" sem elo ranqueado', async () => {
    mockStats(stats({ best_tier: null, in_placement: true, played: 2, win_rate: 50 }))
    renderProfile()
    expect(await screen.findByText('Em classificação')).not.toBeNull()
    expect(screen.getByText('50%')).not.toBeNull()
  })

  it('mostra "—" sem partidas e quando a leitura falha, sem bloquear o perfil', async () => {
    mockStats(stats({ best_tier: null, in_placement: false, played: 0, win_rate: null }))
    renderProfile()
    await waitFor(() => expect(request).toHaveBeenCalledWith('/me/profile-stats'))
    expect((await screen.findAllByText('0')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('—')).toHaveLength(2)
    cleanup()
    mockStats(new ApiError('Falha', 500))
    renderProfile()
    expect(await screen.findByRole('heading', { name: '@eu' })).not.toBeNull()
    await waitFor(() => expect(screen.getAllByText('—')).toHaveLength(3))
  })

  it('abre a aba Partidas com a linha do tempo e leva à tela da partida', async () => {
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/me/profile-stats') return stats() as never
      if (path === '/me/play') return playBoard() as never
      if (path.startsWith('/users/1/timeline')) return page([match()]) as never
      return { id: 1, name: 'Eu', username: 'eu', avatar_url: null, cover_url: null, social_public: false, post_count: 0, follower_count: 0, following_count: 0, follows_you: false, follow_state: 'self', items: [], next_cursor: null } as never
    })
    const go = vi.fn()
    render(<ProfilePage user={me} profiles={[] as Profile[]} go={go} onNewPhoto={vi.fn()} openConnections={vi.fn()} onExpired={vi.fn()} />)
    const ui = userEvent.setup()
    await ui.click(screen.getByRole('tab', { name: 'Partidas' }))
    await ui.click(await screen.findByRole('button', { name: /Abrir partida: Ferrugem FC/ }))
    expect(go).toHaveBeenCalledWith('match', { matchId: 50 })
  })
})

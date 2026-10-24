import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '../src/api/client'
import ArenaPage from '../src/pages/ArenaPage'
import { apiError, mockApi, reply } from './teams-fixtures'
import { brasilia, football, matchCard, playBoard, proposal, search, standings, teamSide, leoes } from './matchmaking-fixtures'
import { summaryOf } from './notifications-fixtures'

/*
 * Ligações da placa do Jogar com o ArenaPage inteiro (etapa 3, frente J1): o ponto menta da navegação lido de
 * `GET /me/play`, o diálogo dentro da moldura do app e a ida à tela da partida.
 */

const me: User = { id: 1, name: 'Ricardo Leão', username: 'ricardo.leao', email: 'r@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
const nav = () => within(screen.getByRole('navigation', { name: 'Navegação principal' }))

function api(board: unknown, extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /me/sports-profiles': [football],
    'GET /cities': [brasilia],
    'GET /me/notifications/summary': summaryOf({ unread_count: 0 }),
    'GET /me/standings': standings(),
    'GET /me/play': board,
    ...extra,
  })
}
function renderArena() {
  render(<StrictMode><ArenaPage user={me} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} /></StrictMode>)
  return userEvent.setup()
}

beforeEach(() => { Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('ponto menta do JOGAR', () => {
  it('acende com busca, proposta ou partida combinando, sem ler a placa além do necessário', async () => {
    const calls = api(playBoard({ searches: [search()] }))
    const ui = renderArena()
    const dot = await screen.findByTestId('play-attention')
    expect(dot.getAttribute('aria-hidden')).toBe('true')
    const play = nav().getByRole('button', { name: 'JOGAR' })
    expect(document.getElementById(play.getAttribute('aria-describedby')!)?.textContent).toBe('Há uma busca, proposta ou partida em andamento')
    const reads = () => calls.find('GET', '/me/play').length
    const afterMount = reads()
    expect(afterMount).toBeLessThanOrEqual(2) // StrictMode monta duas vezes; a segunda leitura vale mais que a primeira
    await ui.click(play)
    expect(await screen.findByRole('heading', { level: 1, name: 'Jogar' })).not.toBeNull()
    expect(reads()).toBe(afterMount) // entrar na tela logo depois da leitura não lê de novo
  })

  it('apagado sem nada em andamento, e também quando a placa não chega', async () => {
    api(playBoard())
    renderArena()
    await screen.findByRole('button', { name: 'Notificações' })
    await waitFor(() => expect(screen.queryByTestId('play-attention')).toBeNull())
    expect(nav().getByRole('button', { name: 'JOGAR' }).hasAttribute('aria-describedby')).toBe(false)
    cleanup()
    api(undefined, { 'GET /me/play': () => apiError(500, 'Erro interno.') })
    renderArena()
    await screen.findByRole('button', { name: 'Notificações' })
    expect(screen.queryByTestId('play-attention')).toBeNull()
  })

  it('uma partida combinando mantém o ponto aceso depois de a busca terminar', async () => {
    api(playBoard({ matches: [matchCard()] }))
    renderArena()
    expect(await screen.findByTestId('play-attention')).not.toBeNull()
  })
})

describe('diálogo e navegação', () => {
  it('a proposta abre em tela cheia dentro da moldura do app e aceitar leva à partida', async () => {
    let board = playBoard({ proposals: [proposal()], searches: [search({ state: 'pareada', match_id: 50 })] })
    const calls = api(() => board, {
      'PUT /matches/50/accept': () => { board = playBoard({ matches: [matchCard()] }); return reply(200, proposal({ state: 'combinando', can_respond: false, sides: [teamSide('a', leoes, { is_mine: true, accepted_at: '2026-10-12T12:00:00Z' }), teamSide('b', leoes)] })) },
    })
    const ui = renderArena()
    await ui.click(nav().getByRole('button', { name: 'JOGAR' }))
    const dialog = await screen.findByRole('dialog', { name: 'Adversário encontrado · Society' })
    const frame = document.querySelector('[data-slot=app-frame]') as HTMLElement
    expect(frame.contains(dialog)).toBe(true)
    expect(dialog.className).toContain('absolute') // presa à moldura, não à viewport
    expect(dialog.className).not.toContain('fixed')
    expect(frame.querySelector('[data-slot=dialog-overlay]')?.className).toContain('absolute')
    await ui.click(within(dialog).getByRole('button', { name: 'Aceitar partida' }))
    expect(calls.find('PUT', '/matches/50/accept')).toHaveLength(1)
    // A tela `match` é da frente da partida; aqui só se confere que a navegação chegou a ela com a aba JOGAR acesa.
    expect(await screen.findByRole('heading', { level: 1, name: 'Partida' })).not.toBeNull()
    expect(nav().getByRole('button', { current: 'page' }).textContent).toBe('JOGAR')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

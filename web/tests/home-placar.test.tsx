import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile } from '../src/api/client'
import type { MatchCard } from '../src/api/matches'
import {
  countdownParts, countdownText, emptyPlacarText, matchupLabel, sideLabel, primaryButtonLabel, spokenMatchCountdown,
} from '../src/data/home'
import HomePage from '../src/pages/HomePage'
import { athleteSide, football, leoes, matchCard, standings, teamSide, tigres } from './matchmaking-fixtures'
import { mockApi } from './teams-fixtures'
import { summaryOf } from './notifications-fixtures'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('Contagem do Placar', () => {
  it('a partir de 24 h mostra dias e horas, com "1 dia" no singular e "0 h"', () => {
    expect(countdownText(3 * DAY + 4 * HOUR + 59 * MINUTE)).toBe('3 dias 4 h')
    expect(countdownText(DAY)).toBe('1 dia 0 h')
    expect(countdownText(DAY + 5 * HOUR + 30 * MINUTE)).toBe('1 dia 5 h')
    expect(countdownText(2 * DAY)).toBe('2 dias 0 h')
    expect(countdownParts(3 * DAY + 4 * HOUR)).toEqual([{ value: 3, unit: 'dias' }, { value: 4, unit: 'h' }])
  })

  it('de 1 h a 24 h mostra horas e minutos', () => {
    expect(countdownText(DAY - 1_000)).toBe('23 h 59 min')
    expect(countdownText(5 * HOUR + 12 * MINUTE + 40_000)).toBe('5 h 12 min')
    expect(countdownText(HOUR)).toBe('1 h 0 min')
  })

  it('abaixo de 1 h mostra só os minutos, no mínimo 1', () => {
    expect(countdownText(HOUR - 1)).toBe('59 min')
    expect(countdownText(8 * MINUTE + 59_000)).toBe('8 min')
    expect(countdownText(30_000)).toBe('1 min')
    expect(countdownText(0)).toBe('1 min')
    expect(countdownParts(-5_000)).toEqual([{ value: 1, unit: 'min' }])
    expect(countdownText(Number.NaN)).toBe('1 min')
  })

  it('para leitores de tela, as unidades por extenso e sem as partes zeradas', () => {
    expect(spokenMatchCountdown(3 * DAY + 4 * HOUR)).toBe('3 dias e 4 horas')
    expect(spokenMatchCountdown(DAY)).toBe('1 dia')
    expect(spokenMatchCountdown(HOUR + MINUTE)).toBe('1 hora e 1 minuto')
    expect(spokenMatchCountdown(2 * HOUR)).toBe('2 horas')
    expect(spokenMatchCountdown(10_000)).toBe('1 minuto')
  })
})

describe('lados, textos e botão do Placar', () => {
  const tennis = matchCard({
    sport: 'tenis', format: null, my_side: 'b', my_role: 'atleta',
    sides: [athleteSide('a', 7, 'Rafael Lima'), athleteSide('b', 1, 'Ricardo Leão', { is_mine: true })],
  })

  it('em partida individual o lado do titular é "Você" e vem primeiro', () => {
    expect(sideLabel(tennis, tennis.sides[1])).toBe('Você')
    expect(sideLabel(tennis, tennis.sides[0])).toBe('Rafael Lima')
    expect(matchupLabel(tennis)).toBe('Você × Rafael Lima')
  })

  it('em partida de times os dois lados levam o nome do time; sem lado do titular, A × B', () => {
    const teams = matchCard({ my_side: 'b' })
    expect(sideLabel(teams, teams.sides[1])).toBe('Tigres J1')
    expect(matchupLabel(teams)).toBe('Tigres J1 × Leões J1')
    expect(matchupLabel(matchCard({ my_side: null }))).toBe('Leões J1 × Tigres J1')
    expect(matchupLabel({ ...tennis, my_side: null })).toBe('Rafael Lima × Ricardo Leão')
  })

  it('o texto sem partida e o rótulo do botão dependem dos perfis e da próxima partida', () => {
    expect(emptyPlacarText(false)).toBe('Prepare seus perfis esportivos e encontre a primeira.')
    expect(emptyPlacarText(true)).toBe('Que tal marcar a próxima?')
    expect(primaryButtonLabel({ hasProfiles: false, hasNextMatch: false })).toBe('Preparar perfis')
    expect(primaryButtonLabel({ hasProfiles: false, hasNextMatch: true })).toBe('Preparar perfis')
    expect(primaryButtonLabel({ hasProfiles: true, hasNextMatch: true })).toBe('Encontrar outra partida')
    expect(primaryButtonLabel({ hasProfiles: true, hasNextMatch: false })).toBe('Encontrar partida')
  })
})

describe('Placar no Início', () => {
  // Domingo, 22 de novembro de 2026, 12:00 no fuso do aparelho.
  const NOON = new Date(2026, 10, 22, 12, 0, 0)
  const at = (days: number, hours: number, minutes = 0) => new Date(NOON.getTime() + days * DAY + hours * HOUR + minutes * MINUTE).toISOString()
  const brasilia = football.city
  const court = (name: string) => ({ id: 3, name, address: null, kind: 'society' as const, city: brasilia, state: 'publicada' as const, provisional: false })
  /** Quarta, 25 de novembro, 20:00. */
  const wednesday = matchCard({ id: 71, state: 'agendada', phase: 'agendada', starts_at: at(3, 8), court: court('Arena Sudoeste') })

  function renderHome({ matches = [], profiles = [football] }: { matches?: MatchCard[]; profiles?: Profile[] } = {}) {
    mockApi({ 'GET /me/notifications/summary': summaryOf({ unread_count: 0 }), 'GET /me/standings': standings() })
    const go = vi.fn()
    render(<HomePage firstName="Ricardo" profiles={profiles} loading={false} matches={matches} go={go} onExpired={vi.fn()} />)
    return go
  }
  const placar = () => document.querySelector('[data-slot="placar"]') as HTMLElement

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(NOON)
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

  it('mostra a data, a saudação e a próxima partida com a Contagem; o bloco inteiro abre a partida', async () => {
    const go = renderHome({ matches: [wednesday] })
    expect(screen.getByText('domingo, 22 de novembro')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('A arena te chama, Ricardo')
    expect(screen.queryByText(/Bora jogar/)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Próxima partida' })).toBeNull()

    const block = screen.getByRole('button', { name: /^Próxima partida em/ })
    expect(block.getAttribute('aria-label')).toBe('Próxima partida em 3 dias e 8 horas: Leões J1 × Tigres J1, qua, 25 nov · 20:00, Arena Sudoeste')
    expect(block.textContent).toContain('Futebol')
    expect(within(block).getByText('3').nextElementSibling?.textContent).toBe('dias')
    expect(block.querySelector('[data-slot="countdown"]')?.textContent).toBe('3dias8h')
    expect(block.textContent).toContain('qua, 25 nov · 20:00')
    expect(block.textContent).toContain('Leões J1 × Tigres J1')
    expect(block.textContent).toContain('Arena Sudoeste')
    // Um único controle: nada tocável dentro dele.
    expect(within(block).queryAllByRole('button')).toHaveLength(0)
    expect(block.querySelector('span[class*="coliseum.svg"]')).not.toBeNull()

    vi.useRealTimers()
    const ui = userEvent.setup()
    await ui.click(block)
    expect(go).toHaveBeenCalledWith('match', { matchId: 71 })
    await ui.click(screen.getByRole('button', { name: 'Encontrar outra partida' }))
    expect(go).toHaveBeenLastCalledWith('play')
  })

  it('em partida individual mostra "Você" com a foto ou as iniciais', () => {
    const tennis = matchCard({
      id: 72, sport: 'tenis', format: null, state: 'agendada', phase: 'agendada', my_side: 'b', my_role: 'atleta', starts_at: at(0, 5, 30), court: court('Quadra 2'),
      sides: [athleteSide('a', 7, 'Rafael Lima'), athleteSide('b', 1, 'Ricardo Leão', { is_mine: true, athlete: { id: 1, name: 'Ricardo Leão', username: 'ricardo', avatar_url: '/media/r.jpg' } })],
    })
    renderHome({ matches: [tennis] })
    const block = screen.getByRole('button', { name: /Você × Rafael Lima/ })
    expect(block.textContent).toContain('Tênis')
    expect(block.querySelector('[data-slot="countdown"]')?.textContent).toBe('5h30min')
    expect(block.querySelector('img[data-slot="social-photo"]')?.getAttribute('src')).toContain('/media/r.jpg')
    expect(block.querySelector('span[data-slot="social-photo"]')?.textContent).toBe('RL')
  })

  it('recalcula a Contagem a cada minuto e, quando a partida começa, troca para a seguinte e depois para o vazio', () => {
    const soon = matchCard({ id: 73, state: 'agendada', phase: 'agendada', starts_at: at(0, 0, 2), sides: [teamSide('a', leoes, { is_mine: true }), teamSide('b', tigres)], court: court('Arena Norte') })
    const later = { ...wednesday, starts_at: at(0, 0, 70) }
    renderHome({ matches: [later, soon] })
    const countdown = () => placar().querySelector('[data-slot="countdown"]')?.textContent
    expect(countdown()).toBe('2min')
    act(() => { vi.advanceTimersByTime(MINUTE) })
    expect(countdown()).toBe('1min')
    expect(placar().getAttribute('aria-label')).toContain('Arena Norte')
    // Às 12:02 a primeira começa: o Placar passa à seguinte (às 13:10, falta 1 h 8 min).
    act(() => { vi.advanceTimersByTime(MINUTE) })
    expect(countdown()).toBe('1h8min')
    expect(placar().getAttribute('aria-label')).toContain('Arena Sudoeste')
    expect(screen.getByRole('button', { name: 'Encontrar outra partida' })).not.toBeNull()
    act(() => { vi.advanceTimersByTime(70 * MINUTE) })
    expect(screen.getByRole('heading', { name: 'Nenhuma partida agendada' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Encontrar partida' })).not.toBeNull()
  })

  it('sem partida mostra o traço e convida a marcar a próxima, sem toque', () => {
    const go = renderHome({ matches: [matchCard({ id: 74, state: 'combinando', phase: 'combinando' })] })
    const block = placar()
    expect(block.tagName).toBe('SECTION')
    expect(block.textContent).toContain('Próxima partida')
    expect(block.textContent).toContain('—')
    expect(within(block).getByRole('heading', { name: 'Nenhuma partida agendada' })).not.toBeNull()
    expect(block.textContent).toContain('Que tal marcar a próxima?')
    expect(screen.queryByRole('button', { name: /Próxima partida/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Encontrar partida' })).not.toBeNull()
    expect(go).not.toHaveBeenCalled()
  })

  it('sem perfis esportivos convida a prepará-los, e o botão leva ao Jogar', async () => {
    const go = renderHome({ profiles: [] })
    expect(placar().textContent).toContain('Prepare seus perfis esportivos e encontre a primeira.')
    vi.useRealTimers()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Preparar perfis' }))
    expect(go).toHaveBeenCalledWith('play')
  })

  it('só a lista vazia confirmada conta como "sem perfis": carregando ou com falha, não convida a prepará-los', () => {
    mockApi({ 'GET /me/notifications/summary': summaryOf({ unread_count: 0 }), 'GET /me/standings': standings() })
    const { rerender } = render(<HomePage firstName="Ricardo" profiles={[]} loading matches={[]} go={vi.fn()} onExpired={vi.fn()} />)
    expect(placar().textContent).toContain('Que tal marcar a próxima?')
    expect(screen.getByRole('button', { name: 'Encontrar partida' })).not.toBeNull()
    rerender(<HomePage firstName="Ricardo" profiles={[]} loading={false} profilesFailed matches={[]} go={vi.fn()} onExpired={vi.fn()} />)
    expect(placar().textContent).toContain('Que tal marcar a próxima?')
    expect(screen.queryByRole('button', { name: 'Preparar perfis' })).toBeNull()
  })
})

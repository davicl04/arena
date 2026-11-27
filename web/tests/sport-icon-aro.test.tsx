import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { request } from '../src/api/client'
import type { City, Profile, Sport } from '../src/api/client'
import ProfileHeader from '../src/components/ProfileHeader'
import { EventPoster } from '../src/components/events/EventPoster'
import { Pilulas } from '../src/components/home/Pilulas'
import { Placar } from '../src/components/home/Placar'
import { OrganizerRequestForm } from '../src/components/organizer/OrganizerRequestForm'
import { CategorySheet } from '../src/components/ranking/CategorySheet'
import type { PlayBoardState } from '../src/hooks/usePlayBoard'
import EventsPage from '../src/pages/EventsPage'
import EventWizard from '../src/pages/EventWizard'
import PlayPage from '../src/pages/PlayPage'
import { matchCard } from './matchmaking-fixtures'

/*
 * Símbolo com aro (ticket 03 dos selos): nos chips, nas abas do Jogar e nas opções de modalidade, o ícone aparece só no
 * item ativo e some ao desmarcar; nas pílulas "Seu elo", no placar, no cartaz e na linha de modalidade única, sempre.
 * O ícone é SVG decorativo (`aria-hidden`, `data-slot="sport-icon"`, `data-forma="aro"`) e não muda os nomes acessíveis.
 */

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

const city: City = { id: 7, name: 'Brasília', state: 'DF' }
const football: Profile = { id: 1, sport: 'futebol', city_id: 7, city, position: 'atacante', looking_for: false, is_public: false, level: null }
const tennis: Profile = { ...football, id: 2, sport: 'tenis', position: null }
const running: Profile = { ...football, id: 3, sport: 'corrida', position: null }
const idleBoard = (): PlayBoardState => ({
  board: { attention: false, searches: [], proposals: [], offers: [], matches: [] },
  loading: false, error: '', reload: vi.fn(async () => null), deferred: [], defer: vi.fn(),
})

const icons = (root: ParentNode) => Array.from(root.querySelectorAll<SVGElement>('[data-slot="sport-icon"]'))
/** O ícone do item: um só, símbolo com aro, oculto à acessibilidade e sem PNG. */
function aroOf(element: Element) {
  const found = icons(element)
  expect(found).toHaveLength(1)
  const [icon] = found
  expect(icon.tagName.toLowerCase()).toBe('svg')
  expect(icon.getAttribute('data-forma')).toBe('aro')
  expect(icon.getAttribute('aria-hidden')).toBe('true')
  expect(element.querySelector('img, [style*="mask"]')).toBeNull()
  return icon
}
/** Itens com ícone, pelo nome acessível. */
const withIcon = (items: HTMLElement[]) => items.filter(item => icons(item).length > 0).map(item => item.textContent)

beforeEach(() => {
  vi.mocked(request).mockReset()
  // As telas abaixo só precisam do primeiro render: as leituras ficam pendentes.
  vi.mocked(request).mockImplementation(() => new Promise<never>(() => {}))
})
afterEach(cleanup)

describe('símbolo com aro só no item ativo', () => {
  it('chips de modalidade dos campeonatos: só o chip pressionado tem o ícone, que muda com a seleção', async () => {
    function Harness() {
      const [sport, setSport] = useState<Sport>('futebol')
      return <EventsPage sport={sport} profiles={[football]} loading={false} onSport={setSport} onOpen={vi.fn()} onSports={vi.fn()} onExpired={vi.fn()} />
    }
    render(<Harness />)
    const group = screen.getByRole('group', { name: 'Modalidade' })
    const chips = within(group).getAllByRole('button')
    expect(chips.map(chip => chip.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
    expect(withIcon(chips)).toEqual(['Futebol'])
    aroOf(chips[0])

    const user = userEvent.setup()
    await user.click(within(group).getByRole('button', { name: 'Tênis' }))
    expect(within(group).getByRole('button', { name: 'Tênis' }).getAttribute('aria-pressed')).toBe('true')
    expect(withIcon(within(group).getAllByRole('button'))).toEqual(['Tênis'])
    // Teclado: a ordem e o foco seguem no chip que ganhou o ícone.
    await user.tab()
    expect(document.activeElement?.textContent).toBe('Corrida')
    await user.keyboard('{Enter}')
    expect(document.activeElement?.textContent).toBe('Corrida')
    expect(withIcon(within(group).getAllByRole('button'))).toEqual(['Corrida'])
    expect(within(group).getAllByRole('button').map(chip => chip.textContent)).toEqual(['Futebol', 'Tênis', 'Corrida'])
  })

  it('abas do Jogar: o ícone acompanha a aba selecionada pelo teclado, em branco', async () => {
    render(<PlayPage profiles={[football, tennis, running]} loading={false} board={idleBoard()} go={vi.fn()} onExpired={vi.fn()} />)
    const tabs = screen.getByRole('tablist', { name: 'Modalidade' })
    const all = () => within(tabs).getAllByRole('tab')
    expect(all().map(tab => tab.textContent)).toEqual(['Futebol', 'Tênis', 'Corrida'])
    expect(withIcon(all())).toEqual(['Futebol'])
    expect(aroOf(all()[0]).getAttribute('class')).toContain('text-white')

    within(tabs).getByRole('tab', { name: 'Futebol' }).focus()
    const user = userEvent.setup()
    await user.keyboard('{ArrowRight}')
    expect(within(tabs).getByRole('tab', { name: 'Tênis' }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement?.textContent).toBe('Tênis')
    expect(withIcon(all())).toEqual(['Tênis'])
    await user.keyboard('{End}')
    expect(withIcon(all())).toEqual(['Corrida'])
  })

  it('modalidades do pedido de organizador: o ícone aparece ao marcar e some ao desmarcar', async () => {
    render(<OrganizerRequestForm defaultCity={city} onSent={vi.fn()} onExpired={vi.fn()} />)
    const option = (name: string) => screen.getByRole('button', { name })
    const options = () => ['Futebol', 'Tênis', 'Corrida'].map(option)
    expect(withIcon(options())).toEqual([])

    const user = userEvent.setup()
    await user.click(option('Futebol'))
    await user.click(option('Corrida'))
    expect(option('Futebol').getAttribute('aria-pressed')).toBe('true')
    expect(withIcon(options())).toEqual(['Futebol', 'Corrida'])
    aroOf(option('Corrida'))

    await user.click(option('Futebol'))
    expect(option('Futebol').getAttribute('aria-pressed')).toBe('false')
    expect(withIcon(options())).toEqual(['Corrida'])
  })

  it('modalidade do assistente de evento: só a opção marcada tem o ícone', async () => {
    render(<EventWizard onClose={vi.fn()} onDone={vi.fn()} onExpired={vi.fn()} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nome do evento'), 'Desafio Saibro{Enter}')
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Qual modalidade?' })).toBeTruthy())
    const option = (name: string) => screen.getByRole('button', { name })
    const options = () => ['Futebol', 'Tênis', 'Corrida'].map(option)
    expect(withIcon(options())).toEqual([])

    await user.click(option('Tênis'))
    expect(option('Tênis').getAttribute('aria-pressed')).toBe('true')
    expect(withIcon(options())).toEqual(['Tênis'])
    aroOf(option('Tênis'))
    await user.click(option('Futebol'))
    expect(withIcon(options())).toEqual(['Futebol'])
  })
})

describe('símbolo com aro sempre', () => {
  it('pílulas "Seu elo": as três têm o ícone em branco translúcido, com o nome acessível de sempre', () => {
    render(<Pilulas standings={null} standingsLoading profiles={null} profilesLoading onOpenRanking={vi.fn()} onOpenModalities={vi.fn()} />)
    const pills = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="pill"]'))
    expect(pills.map(pill => pill.dataset.sport)).toEqual(['futebol', 'tenis', 'corrida'])
    for (const pill of pills) expect(aroOf(pill).getAttribute('class')).toContain('text-white/82')
    expect(pills.map(pill => pill.getAttribute('aria-label')?.split(':')[0])).toEqual(['Futebol', 'Tênis', 'Corrida'])
  })

  it('selo de modalidade do placar', () => {
    render(<Placar match={matchCard({ sport: 'tenis', format: null, starts_at: '2026-10-14T19:00:00-03:00' })} now={Date.parse('2026-10-12T10:00:00-03:00')} hasProfiles onOpen={vi.fn()} />)
    const placar = document.querySelector<HTMLElement>('[data-slot="placar"]')!
    const icon = aroOf(placar)
    expect(icon.parentElement?.textContent).toBe('Tênis')
    expect(placar.getAttribute('aria-label')).toMatch(/^Próxima partida em 2 dias e 9 horas: /)
  })

  it('rodapé do cartaz de evento', () => {
    render(<EventPoster name="Copa Inverno" sport="corrida" startsAt={null} priceCents={0} state="publicado" showSport />)
    const poster = document.querySelector<HTMLElement>('[data-slot="event-poster"]')!
    expect(aroOf(poster).getAttribute('class')).toContain('text-white')
  })

  it('linha "{Modalidade} é a sua única modalidade ativa" da folha de categoria, na cor do quadro de ícone', () => {
    render(<CategorySheet profiles={[tennis]} category={{ sport: 'tenis', kind: 'time', format: 'society', position: 'atacante', distance: 5 }}
      onChange={vi.fn()} onClose={vi.fn()} />)
    const line = screen.getByText('Tênis é a sua única modalidade ativa').closest('p')!
    expect(aroOf(line).getAttribute('class')).toContain('text-icon-tile-ink')
  })

  it('chips das modalidades do perfil (sempre ativos)', () => {
    render(<ProfileHeader mode="visitor" name="Atleta Dois" username="atleta.dois" avatar={<span />} coverUrl={null} isPublic
      followerCount={1} followingCount={2} sportList={['futebol', 'corrida']} onFollowers={vi.fn()} onFollowing={vi.fn()} />)
    const chips = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="chip"]'))
    expect(chips.map(chip => chip.textContent)).toEqual(['Futebol', 'Corrida'])
    chips.forEach(aroOf)
  })
})

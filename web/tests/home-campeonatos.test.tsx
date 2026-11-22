import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { City, Profile } from '../src/api/client'
import type { EventCard } from '../src/api/entries'
import { eventsPath } from '../src/api/entries'
import {
  CHAMPIONSHIPS_LIMIT, championshipMeta, championshipTags, championshipsSport, championshipsTitle, emptyChampionshipsText, mergeChampionships, missingSportsCount,
} from '../src/data/home'
import HomePage from '../src/pages/HomePage'
import { card } from './events-fixtures'
import { standings } from './matchmaking-fixtures'
import { summaryOf } from './notifications-fixtures'
import { apiError, brasilia, goiania, mockApi } from './teams-fixtures'
import type { Call } from './teams-fixtures'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const profileOf = (id: number, sport: Profile['sport'], city: City): Profile =>
  ({ id, sport, city_id: city.id, city, position: null, looking_for: false, is_public: false, level: null })
const football = profileOf(1, 'futebol', brasilia)
const tennis = profileOf(2, 'tenis', brasilia)
const runner = profileOf(3, 'corrida', goiania)
const FOOTBALL_EVENTS = '/events?sport=futebol&city_id=5300108&limit=2'
const TENNIS_EVENTS = '/events?sport=tenis&city_id=5300108&limit=2'
const RUN_EVENTS = '/events?sport=corrida&city_id=5208707&limit=2'
const DAY = 86_400_000
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString()
/** Preço como o `Intl` o escreve, com o espaço inseparável depois de "R$". */
const brl = (value: string) => `R$\u00a0${value}`
const page = (items: EventCard[]) => ({ items, next_cursor: null })
/** Campeonato de futebol (o cartaz padrão das fixtures é de tênis). */
const footballCup = (id: number, overrides: Partial<EventCard> = {}) =>
  card({ id, name: `Copa ${id}`, sport: 'futebol', format: 'society', ...overrides })

type Route = Parameters<typeof mockApi>[0][string]

/** Monta o Início com os perfis do shell e as listas de eventos por caminho. */
function renderHome(profiles: Profile[], events: Record<string, Route> = {}, { loading = false, profilesFailed = false } = {}) {
  const api = mockApi({ 'GET /me/notifications/summary': summaryOf({ unread_count: 0 }), 'GET /me/standings': standings(), ...events })
  const go = vi.fn()
  const onExpired = vi.fn()
  const view = render(<HomePage firstName="Caio" profiles={profiles} loading={loading} profilesFailed={profilesFailed} go={go} onExpired={onExpired} />)
  return { api, go, onExpired, view }
}
const eventCalls = (calls: Call[]) => calls.filter(call => call.path.startsWith('/events'))
const section = () => screen.getByRole('region', { name: /perto de você|^Campeonatos/i })
const rows = () => within(section()).queryAllByRole('button').filter(button => button.dataset.slot === 'championship')

describe('Campeonatos: lógica pura', () => {
  const item = (id: number, startsAt: string | null) => ({ id, starts_at: startsAt })

  it('une as listas sem duplicatas por id, ordena por starts_at crescente e corta nos 2 primeiros', () => {
    expect(CHAMPIONSHIPS_LIMIT).toBe(2)
    const a = item(1, '2026-12-10T12:00:00Z')
    const b = item(2, '2026-12-03T12:00:00Z')
    const c = item(3, '2026-12-05T12:00:00Z')
    expect(mergeChampionships([[a, b], [{ ...b }, c]])).toEqual([b, c])
    expect(mergeChampionships([[a, b], [c]], 5)).toEqual([b, c, a])
    // A primeira ocorrência fica; sem data vai por último; empate de data pelo id.
    const first = { ...item(7, '2026-12-01T12:00:00Z'), name: 'primeira' }
    expect(mergeChampionships([[first], [{ ...item(7, '2026-12-01T12:00:00Z'), name: 'segunda' }]])).toEqual([first])
    expect(mergeChampionships([[item(9, null), item(8, '2026-12-01T12:00:00Z')]])).toEqual([item(8, '2026-12-01T12:00:00Z'), item(9, null)])
    expect(mergeChampionships([[item(5, '2026-12-01T12:00:00Z'), item(4, '2026-12-01T12:00:00Z')]])).toEqual([item(4, '2026-12-01T12:00:00Z'), item(5, '2026-12-01T12:00:00Z')])
    expect(mergeChampionships([[], []])).toEqual([])
    expect(mergeChampionships([])).toEqual([])
  })

  it('título: "Campeonatos em {cidade}" com a mesma cidade, "Campeonatos perto de você" com cidades diferentes e "Perto de você" sem perfis', () => {
    expect(championshipsTitle([football, tennis])).toBe('Campeonatos em Brasília')
    expect(championshipsTitle([football])).toBe('Campeonatos em Brasília')
    expect(championshipsTitle([football, runner])).toBe('Campeonatos perto de você')
    expect(championshipsTitle([])).toBe('Perto de você')
    // Perfis carregando ou com falha não contam como "sem perfis".
    expect(championshipsTitle(null)).toBe('Campeonatos perto de você')
  })

  it('estado vazio pela cidade, a modalidade de "Ver todos" e as modalidades que faltam', () => {
    expect(emptyChampionshipsText([football, tennis])).toBe('Nenhum campeonato aberto em Brasília')
    expect(emptyChampionshipsText([football, runner])).toBe('Nenhum campeonato aberto perto de você')
    expect(championshipsSport([{ sport: 'tenis' }], [football])).toBe('tenis')
    expect(championshipsSport([], [runner, football])).toBe('corrida')
    expect(championshipsSport([{ sport: null }], [football])).toBe('futebol')
    expect(championshipsSport([], [])).toBeNull()
    expect(missingSportsCount([])).toBe(3)
    expect(missingSportsCount([football, tennis])).toBe(1)
    expect(missingSportsCount([football, tennis, runner])).toBe(0)
  })

  it('linha: "{data e hora} · {local}", com a cidade sem local e "Data a definir" sem data', () => {
    const now = new Date(2026, 10, 22, 10, 0)
    const startsAt = new Date(2026, 11, 6, 8, 0).toISOString()
    expect(championshipMeta({ starts_at: startsAt, venue: 'Arena Guará', city: brasilia }, now)).toBe('dom, 6 dez · 08:00 · Arena Guará')
    expect(championshipMeta({ starts_at: startsAt, venue: '  ', city: brasilia }, now)).toBe('dom, 6 dez · 08:00 · Brasília')
    expect(championshipMeta({ starts_at: null, venue: 'Arena Guará', city: null }, now)).toBe('Data a definir · Arena Guará')
    expect(championshipMeta({ starts_at: startsAt, venue: null, city: null }, now)).toBe('dom, 6 dez · 08:00')
  })

  it('etiquetas: preço ("Gratuita" ou o formato dos cartazes), vagas (ou "Vagas esgotadas"), elegibilidade e "Em andamento"', () => {
    const labels = (extra: Partial<EventCard>) => championshipTags(footballCup(5, extra)).map(tag => tag.label)
    expect(labels({})).toEqual([brl('240'), '3 de 8 times', 'Você pode se inscrever'])
    expect(labels({ price_cents: 0 })[0]).toBe('Gratuita')
    expect(labels({ price_cents: null })[0]).toBe('Gratuita')
    expect(labels({ price_cents: 4250 })[0]).toBe(brl('42,50'))
    expect(labels({ entries_count: 8 })).toContain('Vagas esgotadas')
    expect(labels({ capacity: null })).toEqual([brl('240'), 'Você pode se inscrever'])
    expect(labels({ sport: 'corrida', capacity: 300, entries_count: 120 })).toContain('120 de 300 corredores')
    expect(labels({ sport: 'tenis', capacity: 16, entries_count: 4 })).toContain('4 de 16 atletas')
    expect(labels({ eligibility: { eligible: false, reason: 'fora_da_faixa', message: null, tier: null, teams: null } })).toEqual([brl('240'), '3 de 8 times'])
    // Em andamento: o estado vem primeiro e o evento não recebe mais inscrições, mesmo elegível.
    expect(championshipTags(footballCup(5, { state: 'em_andamento', phase: 'em_andamento' }))).toEqual([
      { kind: 'ongoing', label: 'Em andamento' }, { kind: 'price', label: brl('240') }, { kind: 'spots', label: '3 de 8 times' },
    ])
  })

  it('eventsPath acrescenta o limite só quando pedido (a lista de campeonatos segue igual)', () => {
    expect(eventsPath('futebol', 5300108, 2)).toBe(FOOTBALL_EVENTS)
    expect(eventsPath('tenis', 12)).toBe('/events?sport=tenis&city_id=12')
    expect(eventsPath('corrida', null)).toBe('/events?sport=corrida')
  })
})

describe('Início: Campeonatos', () => {
  it('uma leitura por perfil com sport, city_id e limit=2, em paralelo; mostra os 2 primeiros da união, sem duplicatas', async () => {
    const late = footballCup(11, { name: 'Copa Tardia', starts_at: inDays(20) })
    const shared = footballCup(12, { name: 'Copa Compartilhada', starts_at: inDays(3) })
    const tennisCup = card({ id: 13, name: 'Aberto de Tênis', starts_at: inDays(5) })
    let open = 0
    let concurrent = 0
    const slow = (items: EventCard[]) => async () => {
      open++
      concurrent = Math.max(concurrent, open)
      await new Promise(resolve => setTimeout(resolve, 5))
      open--
      return page(items)
    }
    const { api } = renderHome([football, tennis], { [`GET ${FOOTBALL_EVENTS}`]: slow([late, shared]), [`GET ${TENNIS_EVENTS}`]: slow([shared, tennisCup]) })
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(api.find('GET', FOOTBALL_EVENTS)).toHaveLength(1)
    expect(api.find('GET', TENNIS_EVENTS)).toHaveLength(1)
    expect(eventCalls(api.calls)).toHaveLength(2)
    // As duas leituras ficam abertas ao mesmo tempo.
    expect(concurrent).toBe(2)
    expect(screen.getByRole('heading', { level: 2, name: 'Campeonatos em Brasília' })).not.toBeNull()
    expect(rows().map(row => row.dataset.eventId)).toEqual(['12', '13'])
    expect(section().textContent).not.toContain('Copa Tardia')
    // A foto "Perto de você / Sua próxima arena" saiu.
    expect(screen.queryByText('Sua próxima arena')).toBeNull()
    expect(screen.queryByText(/Novas atividades em breve/)).toBeNull()
    expect(screen.queryByRole('img', { name: 'Esporte ao ar livre ao pôr do sol' })).toBeNull()
  })

  it('não relê os campeonatos quando o Início se renderiza de novo com os mesmos perfis', async () => {
    const profiles = [football]
    const { api, view, go, onExpired } = renderHome(profiles, { [`GET ${FOOTBALL_EVENTS}`]: page([footballCup(1)]) })
    await waitFor(() => expect(rows()).toHaveLength(1))
    view.rerender(<HomePage firstName="Caio" profiles={profiles} loading={false} go={go} onExpired={onExpired} />)
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(api.find('GET', FOOTBALL_EVENTS)).toHaveLength(1)
  })

  it('linha com ícone, nome, "{data e hora} · {local}" e as etiquetas; "Em andamento" sem "Você pode se inscrever"; o toque abre o campeonato', async () => {
    const ongoing = footballCup(21, { name: 'Liga em Curso', state: 'em_andamento', phase: 'em_andamento', starts_at: inDays(-1), price_cents: 0, venue: 'Quadra Central' })
    const full = footballCup(22, { name: 'Copa Lotada', starts_at: inDays(2), entries_count: 8, eligibility: { eligible: false, reason: 'fora_da_faixa', message: null, tier: null, teams: null } })
    const { go } = renderHome([football], { [`GET ${FOOTBALL_EVENTS}`]: page([full, ongoing]) })
    await waitFor(() => expect(rows()).toHaveLength(2))
    const [first, second] = rows()
    expect(first.querySelector('[data-slot="sport-icon"]')).not.toBeNull()
    expect(first.textContent).toContain('Liga em Curso')
    expect(first.textContent).toContain('· Quadra Central')
    expect(first.textContent).toContain('Em andamento')
    expect(first.textContent).toContain('Gratuita')
    expect(first.textContent).not.toContain('Você pode se inscrever')
    expect(first.querySelector('[data-slot="state-badge"][data-tone="live"]')?.textContent).toBe('Em andamento')
    expect(first.getAttribute('aria-label')).toMatch(/^Liga em Curso, .+ · Quadra Central, Em andamento, Gratuita, 3 de 8 times$/)
    expect(second.textContent).toContain(brl('240'))
    expect(second.textContent).toContain('Vagas esgotadas')
    expect(second.textContent).not.toContain('Você pode se inscrever')
    await userEvent.setup().click(second)
    expect(go).toHaveBeenLastCalledWith('event', { eventId: 22, sport: 'futebol' })
  })

  it('"Você pode se inscrever" com eligibility.eligible; "Ver todos" abre a lista na modalidade do primeiro campeonato exibido; teclado abre a linha', async () => {
    const tennisCup = card({ id: 31, name: 'Aberto de Tênis', starts_at: inDays(1) })
    const { go } = renderHome([football, tennis], { [`GET ${FOOTBALL_EVENTS}`]: page([footballCup(32, { starts_at: inDays(4) })]), [`GET ${TENNIS_EVENTS}`]: page([tennisCup]) })
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(rows()[0].querySelector('[data-kind="eligible"]')?.textContent).toBe('Você pode se inscrever')
    const ui = userEvent.setup()
    await ui.click(screen.getByRole('button', { name: 'Ver todos os campeonatos' }))
    expect(go).toHaveBeenLastCalledWith('events', { sport: 'tenis' })
    rows()[0].focus()
    await ui.keyboard('{Enter}')
    expect(go).toHaveBeenLastCalledWith('event', { eventId: 31, sport: 'tenis' })
  })

  it('sem campeonatos na mesma cidade: "Nenhum campeonato aberto em {cidade}", com "Ver campeonatos"; "Ver todos" na modalidade do primeiro perfil', async () => {
    const { go } = renderHome([tennis, football], { [`GET ${FOOTBALL_EVENTS}`]: page([]), [`GET ${TENNIS_EVENTS}`]: page([]) })
    expect(await screen.findByText('Nenhum campeonato aberto em Brasília')).not.toBeNull()
    const ui = userEvent.setup()
    await ui.click(within(section()).getByRole('button', { name: 'Ver campeonatos' }))
    expect(go).toHaveBeenLastCalledWith('events', { sport: 'tenis' })
    await ui.click(screen.getByRole('button', { name: 'Ver todos os campeonatos' }))
    expect(go).toHaveBeenLastCalledWith('events', { sport: 'tenis' })
  })

  it('cidades diferentes: "Campeonatos perto de você" e o vazio "Nenhum campeonato aberto perto de você"', async () => {
    const { api } = renderHome([football, runner], { [`GET ${FOOTBALL_EVENTS}`]: page([]), [`GET ${RUN_EVENTS}`]: page([]) })
    expect(await screen.findByText('Nenhum campeonato aberto perto de você')).not.toBeNull()
    expect(api.find('GET', RUN_EVENTS)).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 2, name: 'Campeonatos perto de você' })).not.toBeNull()
  })

  it('sem perfis: "Perto de você" e o cartão "Configure suas modalidades", que abre as modalidades; nenhuma leitura de eventos', async () => {
    const { api, go } = renderHome([])
    const invite = await screen.findByRole('button', { name: /^Configure suas modalidades/ })
    expect(invite.textContent).toContain('Para ver campeonatos perto de você')
    expect(screen.getByRole('heading', { level: 2, name: 'Perto de você' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Ver todos os campeonatos' })).toBeNull()
    await userEvent.setup().click(invite)
    expect(go).toHaveBeenLastCalledWith('sports')
    expect(eventCalls(api.calls)).toHaveLength(0)
  })

  it('perfis carregando: "Carregando campeonatos…"; falha nos perfis: só a nota da seção (o shell mostra o erro); nenhuma leitura de eventos', async () => {
    const loading = renderHome([], {}, { loading: true })
    expect(within(section()).getByRole('status').textContent).toBe('Carregando campeonatos…')
    expect(screen.getByRole('heading', { level: 2, name: 'Campeonatos perto de você' })).not.toBeNull()
    expect(screen.queryByText('Configure suas modalidades')).toBeNull()
    expect(eventCalls(loading.api.calls)).toHaveLength(0)
    cleanup()
    const failed = renderHome([], {}, { profilesFailed: true })
    expect(section().textContent).toContain('Os campeonatos aparecem quando seus perfis esportivos carregarem.')
    expect(screen.getByRole('heading', { level: 2, name: 'Campeonatos perto de você' })).not.toBeNull()
    expect(screen.queryByText('Configure suas modalidades')).toBeNull()
    expect(screen.queryByText('Complete seu perfil esportivo')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ver todos os campeonatos' })).toBeNull()
    expect(eventCalls(failed.api.calls)).toHaveLength(0)
  })

  it('falha em qualquer leitura: o erro só na seção, com "Tentar novamente", que lê de novo', async () => {
    let fail = true
    const { api, onExpired } = renderHome([football, tennis], {
      [`GET ${FOOTBALL_EVENTS}`]: page([footballCup(41, { name: 'Copa Volta' })]),
      [`GET ${TENNIS_EVENTS}`]: () => (fail ? apiError(500, 'Servidor com problema.') : page([])),
    })
    const alert = await within(section()).findByRole('alert')
    expect(alert.textContent).toContain('Não foi possível carregar os campeonatos')
    expect(alert.textContent).toContain('Servidor com problema.')
    expect(rows()).toHaveLength(0)
    // As demais seções seguem de pé.
    expect(screen.getByRole('heading', { name: 'Seu elo' })).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('A arena te chama, Caio')
    expect(onExpired).not.toHaveBeenCalled()
    fail = false
    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(api.find('GET', TENNIS_EVENTS)).toHaveLength(2)
    expect(api.find('GET', FOOTBALL_EVENTS)).toHaveLength(2)
    expect(rows()[0].dataset.eventId).toBe('41')
    expect(within(section()).queryByRole('alert')).toBeNull()
  })

  it('401 em uma leitura de eventos encerra a sessão pelo fluxo existente', async () => {
    const { onExpired } = renderHome([football], { [`GET ${FOOTBALL_EVENTS}`]: apiError(401, 'Sessão expirada.') })
    await waitFor(() => expect(onExpired).toHaveBeenCalled())
  })
})

describe('Início: próximo passo', () => {
  it('"Complete seu perfil esportivo" enquanto falta modalidade, depois de "Seu elo" e antes de Campeonatos; abre as modalidades', async () => {
    const { go } = renderHome([football], { [`GET ${FOOTBALL_EVENTS}`]: page([]) })
    const step = await screen.findByRole('button', { name: /^Complete seu perfil esportivo/ })
    expect(step.textContent).toContain('Mostre onde e como você gosta de jogar.')
    expect(screen.getByRole('heading', { level: 2, name: 'Seu próximo passo' })).not.toBeNull()
    await screen.findByText('Nenhum campeonato aberto em Brasília')
    const text = document.body.textContent ?? ''
    const order = ['Seu elo', 'Complete seu perfil esportivo', 'Campeonatos em Brasília'].map(item => text.indexOf(item))
    expect(order.every(index => index >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    await userEvent.setup().click(step)
    expect(go).toHaveBeenLastCalledWith('sports')
  })

  it('sem perfis o cartão aparece; com as três modalidades, não; carregando, também não', async () => {
    renderHome([])
    expect(await screen.findByText('Complete seu perfil esportivo')).not.toBeNull()
    cleanup()
    const all = renderHome([football, tennis, runner], { [`GET ${FOOTBALL_EVENTS}`]: page([]), [`GET ${TENNIS_EVENTS}`]: page([]), [`GET ${RUN_EVENTS}`]: page([]) })
    expect(await screen.findByText('Nenhum campeonato aberto perto de você')).not.toBeNull()
    expect(screen.queryByText('Complete seu perfil esportivo')).toBeNull()
    expect(screen.queryByText('Seu próximo passo')).toBeNull()
    expect(eventCalls(all.api.calls)).toHaveLength(3)
    cleanup()
    renderHome([], {}, { loading: true })
    expect(screen.queryByText('Complete seu perfil esportivo')).toBeNull()
  })
})

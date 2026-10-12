import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { Profile } from '../src/api/client'
import type { MeStandings, PositionStanding, RunStanding, StandingLine } from '../src/api/play'
import { modalityStanding } from '../src/components/arena/modalityStanding'
import HomePage from '../src/pages/HomePage'
import { apiError, mockApi } from './teams-fixtures'

afterEach(cleanup)

const empty = (overrides: Partial<StandingLine> = {}): StandingLine => ({
  state: 'sem_jogos', tier: null, played: 0, required: 3, rank_position: null, metric_value: null,
  faces: ['bronze', 'prata', 'ouro', 'diamante', 'lendario'], faces_any_level: true, ...overrides,
})
const ranked = (tier: StandingLine['tier'], overrides: Partial<StandingLine> = {}) =>
  empty({ state: 'ranqueado', tier, played: 6, rank_position: 3, metric_value: 34, faces_any_level: false, faces: ['prata', 'ouro'], ...overrides })
const individual = (overrides: Record<string, Partial<StandingLine>> = {}): PositionStanding[] =>
  (['goleiro', 'defesa', 'meio_campo', 'atacante'] as const).flatMap(position =>
    (['futsal', 'society', 'campo'] as const).map(format => ({ ...empty(overrides[`${position}:${format}`]), position, format })))
const runs = (overrides: Record<number, Partial<StandingLine>> = {}): RunStanding[] =>
  ([3, 5, 10, 21, 42] as const).map(distance_km => ({ ...empty({ state: 'sem_marca', required: 1, ...overrides[distance_km] }), distance_km }))
const teamOf = (formats: Partial<Record<'futsal' | 'society' | 'campo', Partial<StandingLine>>>) => ({
  team: { id: 5, name: 'Leões do Cerrado', initials: 'LC', crest_url: null }, my_role: 'representante' as const,
  formats: (['futsal', 'society', 'campo'] as const).map(format => ({ ...empty(formats[format]), format } as MeStandings['futebol']['teams'][number]['formats'][number])),
})
const standings = (extra: Partial<MeStandings> = {}): MeStandings =>
  ({ calc_version: 1, futebol: { teams: [], individual: individual() }, tenis: empty(), corrida: runs(), ...extra })

const profiles: Profile[] = (['futebol', 'tenis', 'corrida'] as const).map((sport, index) =>
  ({ id: index + 1, sport, city_id: 5300108, position: null, looking_for: false, is_public: false, level: null }))

function renderHome(reply: unknown, loadedProfiles: Profile[] = profiles) {
  const api = mockApi({ 'GET /me/notifications/unread-count': { unread_count: 0 }, 'GET /me/standings': reply as never })
  render(<HomePage firstName="Caio" profiles={loadedProfiles} loading={false} go={vi.fn()} onExpired={vi.fn()} />)
  return api
}
const badge = (sport: string) => screen.getByTestId(`standing-${sport}`)
const card = (sport: string) => badge(sport).closest('article') as HTMLElement

describe('"Seu elo" no Início lê GET /me/standings', () => {
  it('com classificação mostra o elo e onde ele vale; sem ela, "n de 3 partidas"', async () => {
    renderHome(standings({
      futebol: { teams: [teamOf({ futsal: { state: 'classificacao', played: 2 }, society: ranked('ouro', { metric_value: 34 }) })], individual: individual() },
      tenis: empty({ state: 'classificacao', played: 2 }),
    }))
    expect(await screen.findByText('Ouro')).not.toBeNull()
    expect(badge('futebol').querySelector('img')?.getAttribute('src')).toBe('/images/brand/ouro.svg')
    expect(card('futebol').textContent).toContain('Society · Leões do Cerrado')
    expect(card('futebol').textContent).toContain('34pontos')
    expect(badge('tenis').textContent).toBe('2 de 3 partidas')
    expect(within(badge('tenis')).queryByRole('img')).toBeNull()
    expect(card('tenis').textContent).toContain('Sua trajetória começa aqui')
    expect(badge('corrida').textContent).toBe('Sem marca')
    expect(screen.queryByText('Sem classificação')).toBeNull()
  })

  it('quem ainda não jogou vê "0 de 3 partidas"; o elo nunca aparece em classificação', async () => {
    renderHome(standings({ tenis: empty({ state: 'classificacao', played: 2, tier: 'prata' }) }))
    expect(await screen.findByText('Seu elo')).not.toBeNull()
    await vi.waitFor(() => expect(badge('futebol').textContent).toBe('0 de 3 partidas'))
    expect(badge('tenis').textContent).toBe('2 de 3 partidas')
    expect(document.querySelector('[data-slot="tier-emblem"]')).toBeNull()
  })

  it('o maior elo vence entre as linhas e a média individual leva a unidade "média"', async () => {
    renderHome(standings({
      futebol: { teams: [teamOf({ society: ranked('prata') })], individual: individual({ 'atacante:campo': ranked('diamante', { metric_value: 5.63 }) }) },
      corrida: runs({ 5: ranked('ouro', { required: 1, played: 1, metric_value: 1500 }) }),
    }))
    await vi.waitFor(() => expect(badge('futebol').textContent).toBe('Elo Diamante'))
    expect(card('futebol').textContent).toContain('Campo · como atacante')
    expect(card('futebol').textContent).toContain('5,63média')
    expect(badge('corrida').textContent).toBe('Elo Ouro')
    expect(card('corrida').textContent).toContain('Nos 5 km')
    expect(card('corrida').textContent).toContain('25:00melhor tempo')
  })

  it('corrida: a distância de maior elo e o melhor tempo dela; sem marca, "—" com a unidade de tempo', async () => {
    renderHome(standings({
      corrida: runs({
        5: ranked('prata', { required: 1, played: 1, metric_value: 1860 }),
        10: ranked('diamante', { required: 1, played: 2, metric_value: 2760 }),
        21: ranked('diamante', { required: 1, played: 1, metric_value: 6000 }),
      }),
    }))
    await vi.waitFor(() => expect(badge('corrida').textContent).toBe('Elo Diamante'))
    // Empate de elo: a primeira distância na ordem 3, 5, 10, 21, 42.
    expect(card('corrida').textContent).toContain('46:00melhor tempo')
    expect(card('corrida').textContent).toContain('Nos 10 km')
    expect(card('corrida').textContent).not.toContain('pontos')
    expect(card('corrida').textContent).not.toContain('autodeclarad')
  })

  it('corrida sem marca: "Sem marca", "—" e "melhor tempo", sem pontos', async () => {
    renderHome(standings())
    await vi.waitFor(() => expect(badge('corrida').textContent).toBe('Sem marca'))
    expect(card('corrida').textContent).toContain('—melhor tempo')
    expect(card('corrida').textContent).not.toContain('pontos')
  })

  it('sem perfil da modalidade, o convite continua e a classificação segue a API', async () => {
    renderHome(standings(), [])
    await vi.waitFor(() => expect(badge('futebol').textContent).toBe('0 de 3 partidas'))
    expect(card('futebol').textContent).toContain('Adicione seu perfil esportivo')
  })

  it('enquanto carrega e quando a API falha não inventa classificação', async () => {
    renderHome(apiError(503, 'Serviço fora do ar.'))
    expect(badge('futebol').textContent).toBe('…')
    await vi.waitFor(() => expect(badge('futebol').textContent).toBe('Classificação indisponível'))
    expect(screen.queryByText('Sem classificação')).toBeNull()
  })
})

describe('modalityStanding', () => {
  it('responde com segurança a uma resposta incompleta', () => {
    expect(modalityStanding('futebol', null)).toEqual({ tier: null, played: 0, required: 3, context: null, metric: null })
    expect(modalityStanding('tenis', { calc_version: 1 })).toMatchObject({ tier: null, played: 0, required: 3 })
    expect(modalityStanding('corrida', {})).toMatchObject({ tier: null, required: 1 })
  })

  it('na corrida a métrica é o melhor tempo, em segundos', () => {
    const data = standings({ corrida: runs({ 5: ranked('ouro', { required: 1, played: 1, metric_value: 1452 }) }) })
    expect(modalityStanding('corrida', data)).toEqual({ tier: 'ouro', played: 1, required: 1, context: 'Nos 5 km', metric: { value: 1452, unit: 'tempo' } })
  })

  it('o andamento é o maior número de partidas, limitado ao exigido', () => {
    const data = standings({ futebol: { teams: [teamOf({ society: { state: 'classificacao', played: 2 } })], individual: individual({ 'defesa:futsal': { state: 'classificacao', played: 3 } }) } })
    expect(modalityStanding('futebol', data)).toMatchObject({ tier: null, played: 3, required: 3 })
  })

  it('só aceita elo de linha ranqueada e com a classificação completa', () => {
    const data = standings({ tenis: empty({ state: 'ranqueado', tier: 'ouro', played: 2 }) })
    expect(modalityStanding('tenis', data)).toMatchObject({ tier: null, played: 2 })
    expect(modalityStanding('tenis', standings({ tenis: ranked('lendario', { metric_value: 210 }) }))).toMatchObject({
      tier: 'lendario', context: 'Tênis', metric: { value: 210, unit: 'pontos' },
    })
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile } from '../src/api/client'
import type { MeStandings, PositionStanding, RunStanding, StandingLine } from '../src/api/play'
import { modalityStanding } from '../src/components/arena/modalityStanding'
import type { ModalityStanding } from '../src/components/arena/modalityStanding'
import { pillAccessibilityLabel, pillMetric, pillStatus, pillTexts } from '../src/data/home'
import HomePage from '../src/pages/HomePage'
import { apiError, mockApi } from './teams-fixtures'
import { summaryOf } from './notifications-fixtures'

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
  ({ id: index + 1, sport, city_id: 5300108, city: { id: 5300108, name: 'Brasília', state: 'DF' }, position: null, looking_for: false, is_public: false, level: null }))

function renderHome(reply: unknown, loadedProfiles: Profile[] = profiles, { loading = false, profilesFailed = false } = {}) {
  const api = mockApi({ 'GET /me/notifications/summary': summaryOf({ unread_count: 0 }), 'GET /me/standings': reply as never })
  const go = vi.fn()
  const onExpired = vi.fn()
  render(<HomePage firstName="Caio" profiles={loadedProfiles} loading={loading} profilesFailed={profilesFailed} go={go} onExpired={onExpired} />)
  return { api, go, onExpired }
}
/** A pílula da modalidade: um único botão, com o nome acessível começando pela modalidade. */
const pill = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}:`) })
const plate = () => screen.getByTestId('pilulas')
/** Texto visível da pílula, com os trechos separados por "|". */
const pillText = (label: string) => Array.from(pill(label).querySelectorAll('[data-slot="pill-line"]')).map(node => node.textContent).join('|')
const ouroTeam = () => ({ teams: [teamOf({ futsal: { state: 'classificacao', played: 2 }, society: ranked('ouro', { metric_value: 38 }) })], individual: individual() }) as MeStandings['futebol']

describe('Início: Pílulas de "Seu elo" (GET /me/standings)', () => {
  it('cabeçalho "Seu elo" com "Ver elos" no Ranking; bloco escuro com três pílulas na ordem futebol, tênis e corrida; sem o carrossel', async () => {
    const { go } = renderHome(standings())
    expect(await screen.findByRole('heading', { name: 'Seu elo' })).not.toBeNull()
    await vi.waitFor(() => expect(pill('Futebol').getAttribute('aria-label')).toBe('Futebol: sem classificação, 0 de 3 partidas'))
    expect(plate().querySelector('[data-slot="pilulas-plate"]')?.className).toContain('bg-forest')
    expect(plate().querySelector('[data-slot="pilulas-plate"] span[aria-hidden="true"]')?.className).toContain('coliseum.svg')
    const buttons = within(plate()).getAllByRole('button').filter(button => button.dataset.slot === 'pill')
    expect(buttons.map(button => button.dataset.sport)).toEqual(['futebol', 'tenis', 'corrida'])
    expect(buttons.map(button => button.querySelector('b')?.textContent)).toEqual(['Futebol', 'Tênis', 'Corrida'])
    expect(buttons.every(button => button.querySelector('[data-slot="sport-icon"]'))).toBe(true)
    // O carrossel de cartões, a barra de progresso e os textos dos cartões saíram do Início.
    expect(screen.queryByTestId('standing-futebol')).toBeNull()
    expect(screen.queryByText('Sua trajetória começa aqui')).toBeNull()
    expect(screen.queryByText(/melhor tempo/)).toBeNull()
    expect(document.querySelector('article')).toBeNull()
    await userEvent.setup().click(within(plate()).getByRole('button', { name: 'Ver elos' }))
    expect(go).toHaveBeenCalledWith('ranking')
  })

  it('sem jogos: "0 de 3" e "Sem classificação"; a corrida, "Sem marca"; nenhum elo', async () => {
    renderHome(standings())
    await vi.waitFor(() => expect(pillText('Futebol')).toBe('0 de 3|Sem classificação'))
    expect(pillText('Tênis')).toBe('0 de 3|Sem classificação')
    expect(pillText('Corrida')).toBe('Sem marca|Sem classificação')
    expect(pill('Corrida').getAttribute('aria-label')).toBe('Corrida: sem marca, sem classificação')
    expect(document.querySelector('[data-slot="tier-emblem"]')).toBeNull()
  })

  it('com elo: emblema, nome do elo e "{n} pts"; o tênis em classificação mostra "2 de 3"; sem a posição no ranking', async () => {
    renderHome(standings({ futebol: ouroTeam(), tenis: empty({ state: 'classificacao', played: 2 }) }))
    await vi.waitFor(() => expect(pillText('Futebol')).toBe('Ouro|38 pts'))
    expect(pill('Futebol').getAttribute('aria-label')).toBe('Futebol: elo Ouro, 38 pontos')
    expect(pill('Futebol').querySelector('[data-slot="tier-emblem"]')?.getAttribute('src')).toBe('/images/brand/ouro.svg')
    expect(pillText('Tênis')).toBe('2 de 3|Sem classificação')
    expect(pill('Tênis').getAttribute('aria-label')).toBe('Tênis: sem classificação, 2 de 3 partidas')
    expect(pill('Tênis').querySelector('[data-slot="tier-emblem"]')).toBeNull()
    // `rank_position` (3) nunca aparece.
    expect(plate().textContent).not.toMatch(/3º|#3|posição/)
  })

  it('pontos com milhar e média por partida: "1.234 pts" e "4,25 média"', async () => {
    renderHome(standings({
      futebol: { teams: [], individual: individual({ 'atacante:campo': ranked('prata', { metric_value: 4.25 }) }) },
      tenis: ranked('lendario', { metric_value: 1234 }),
    }))
    await vi.waitFor(() => expect(pillText('Futebol')).toBe('Prata|4,25 média'))
    expect(pill('Futebol').getAttribute('aria-label')).toBe('Futebol: elo Prata, 4,25 de média')
    expect(pillText('Tênis')).toBe('Lendário|1.234 pts')
  })

  it('corrida com elo: o tempo e a distância de maior elo; o toque abre o Ranking nessa distância; as demais, na modalidade', async () => {
    const { go } = renderHome(standings({
      corrida: runs({ 5: ranked('prata', { required: 1, played: 1, metric_value: 1860 }), 21: ranked('diamante', { required: 1, played: 1, metric_value: 6330 }) }),
    }))
    await vi.waitFor(() => expect(pillText('Corrida')).toBe('Diamante|1:45:30 · 21 km'))
    expect(pill('Corrida').getAttribute('aria-label')).toBe('Corrida: elo Diamante, 1:45:30 nos 21 km')
    const ui = userEvent.setup()
    await ui.click(pill('Corrida'))
    expect(go).toHaveBeenLastCalledWith('ranking', { sport: 'corrida', distance: 21 })
    await ui.click(pill('Tênis'))
    expect(go).toHaveBeenLastCalledWith('ranking', { sport: 'tenis' })
    await ui.click(pill('Futebol'))
    expect(go).toHaveBeenLastCalledWith('ranking', { sport: 'futebol' })
  })

  it('corrida sem marca abre o Ranking da corrida sem distância; o teclado aciona a pílula com foco visível', async () => {
    const { go } = renderHome(standings())
    await vi.waitFor(() => expect(pillText('Corrida')).toBe('Sem marca|Sem classificação'))
    expect(pill('Corrida').className).toContain('focus-visible:outline')
    pill('Corrida').focus()
    await userEvent.setup().keyboard('{Enter}')
    expect(go).toHaveBeenCalledWith('ranking', { sport: 'corrida' })
  })

  it('nunca atribui elo a quem está em classificação, mesmo que a resposta traga a chave', async () => {
    renderHome(standings({ tenis: empty({ state: 'classificacao', played: 2, tier: 'prata' }) }))
    await vi.waitFor(() => expect(pillText('Tênis')).toBe('2 de 3|Sem classificação'))
    expect(document.querySelector('[data-slot="tier-emblem"]')).toBeNull()
    expect(plate().textContent).not.toContain('Prata')
  })

  it('sem perfil na modalidade: "Sem perfil" e "Configurar", mesmo com elo na resposta; o toque abre as modalidades', async () => {
    const { go } = renderHome(standings({ futebol: ouroTeam() }), profiles.filter(profile => profile.sport !== 'futebol'))
    await vi.waitFor(() => expect(pillText('Tênis')).toBe('0 de 3|Sem classificação'))
    expect(pillText('Futebol')).toBe('Sem perfil|Configurar')
    expect(pill('Futebol').getAttribute('aria-label')).toBe('Futebol: sem perfil, configurar')
    expect(pill('Futebol').querySelector('[data-slot="tier-emblem"]')).toBeNull()
    await userEvent.setup().click(pill('Futebol'))
    expect(go).toHaveBeenCalledWith('sports')
  })

  it('conta nova: as três pílulas "Sem perfil"', async () => {
    renderHome(standings(), [])
    await vi.waitFor(() => expect(pillText('Corrida')).toBe('Sem perfil|Configurar'))
    expect(pillText('Futebol')).toBe('Sem perfil|Configurar')
    expect(pillText('Tênis')).toBe('Sem perfil|Configurar')
  })

  it('enquanto lê a classificação ou os perfis, as pílulas indicam o carregamento, sem "Sem perfil"', async () => {
    renderHome(new Promise(() => {}))
    expect(pill('Futebol').getAttribute('aria-label')).toBe('Futebol: carregando classificação')
    expect(pill('Futebol').getAttribute('aria-busy')).toBe('true')
    expect(within(pill('Tênis')).getByText('…')).not.toBeNull()
    cleanup()
    renderHome(standings(), [], { loading: true })
    await vi.waitFor(() => expect(pill('Corrida').getAttribute('aria-label')).toBe('Corrida: carregando classificação'))
    expect(screen.queryByText('Sem perfil')).toBeNull()
  })

  it('com a leitura dos perfis em falha, as pílulas seguem a classificação', async () => {
    renderHome(standings({ futebol: ouroTeam() }), [], { profilesFailed: true })
    await vi.waitFor(() => expect(pillText('Futebol')).toBe('Ouro|38 pts'))
    expect(screen.queryByText('Sem perfil')).toBeNull()
  })

  it('falha ao ler a classificação: "Classificação indisponível" sem inventar números, ainda abrindo o Ranking; 401 expira a sessão', async () => {
    const { go } = renderHome(apiError(503, 'Serviço fora do ar.'))
    await vi.waitFor(() => expect(pillText('Futebol')).toBe('Classificação indisponível'))
    expect(pillText('Corrida')).toBe('Classificação indisponível')
    expect(pill('Tênis').getAttribute('aria-label')).toBe('Tênis: classificação indisponível')
    expect(screen.queryByText('Sem classificação')).toBeNull()
    await userEvent.setup().click(pill('Tênis'))
    expect(go).toHaveBeenCalledWith('ranking', { sport: 'tenis' })
    cleanup()
    const { onExpired } = renderHome(apiError(401, 'Sessão expirada.'))
    await vi.waitFor(() => expect(onExpired).toHaveBeenCalled())
  })

  it('a classificação é lida uma única vez', async () => {
    const { api } = renderHome(standings())
    await vi.waitFor(() => expect(pillText('Futebol')).toBe('0 de 3|Sem classificação'))
    expect(api.find('GET', '/me/standings')).toHaveLength(1)
  })
})

describe('Pílulas: regras puras', () => {
  const standing = (overrides: Partial<ModalityStanding> = {}): ModalityStanding =>
    ({ tier: null, played: 0, required: 3, context: null, metric: null, distanceKm: null, ...overrides })

  it('pillStatus: sem perfil confirmado vence; depois carregando, falha, elo, sem marca e classificação', () => {
    const ouro = standing({ tier: 'ouro', played: 3, metric: { value: 38, unit: 'pontos' } })
    expect(pillStatus('futebol', { standing: ouro, loading: false, hasProfile: false })).toEqual({ kind: 'no-profile' })
    expect(pillStatus('futebol', { standing: null, loading: true, hasProfile: false })).toEqual({ kind: 'no-profile' })
    expect(pillStatus('futebol', { standing: null, loading: true, hasProfile: null })).toEqual({ kind: 'loading' })
    expect(pillStatus('futebol', { standing: ouro, loading: true, hasProfile: true })).toEqual({ kind: 'loading' })
    expect(pillStatus('futebol', { standing: null, loading: false, hasProfile: true })).toEqual({ kind: 'unavailable' })
    expect(pillStatus('futebol', { standing: ouro, loading: false, hasProfile: null })).toEqual({ kind: 'tier', tier: 'ouro', metric: { value: 38, unit: 'pontos' }, distanceKm: null })
    expect(pillStatus('corrida', { standing: standing({ tier: 'prata', required: 1, played: 1, distanceKm: 10 }), loading: false, hasProfile: true }))
      .toEqual({ kind: 'tier', tier: 'prata', metric: null, distanceKm: 10 })
    expect(pillStatus('corrida', { standing: standing({ required: 1, played: 0 }), loading: false, hasProfile: true })).toEqual({ kind: 'no-mark' })
    expect(pillStatus('tenis', { standing: standing({ played: 2 }), loading: false, hasProfile: true })).toEqual({ kind: 'placement', played: 2, required: 3 })
  })

  it('pillMetric: pontos, média, tempo com distância e os casos sem valor', () => {
    expect(pillMetric({ value: 38, unit: 'pontos' })).toBe('38 pts')
    expect(pillMetric({ value: 1234, unit: 'pontos' })).toBe('1.234 pts')
    expect(pillMetric({ value: 7.5, unit: 'média' })).toBe('7,5 média')
    expect(pillMetric({ value: 5.6349, unit: 'média' })).toBe('5,63 média')
    expect(pillMetric({ value: 6330, unit: 'tempo' }, 21)).toBe('1:45:30 · 21 km')
    expect(pillMetric({ value: 1452, unit: 'tempo' }, 5)).toBe('24:12 · 5 km')
    expect(pillMetric({ value: 1452, unit: 'tempo' })).toBe('24:12')
    expect(pillMetric(null, 10)).toBe('10 km')
    expect(pillMetric(null)).toBeNull()
  })

  it('pillTexts e pillAccessibilityLabel: os textos de cada situação', () => {
    expect(pillTexts({ kind: 'placement', played: 1, required: 3 })).toEqual({ status: '1 de 3', detail: 'Sem classificação' })
    expect(pillTexts({ kind: 'no-mark' })).toEqual({ status: 'Sem marca', detail: 'Sem classificação' })
    expect(pillTexts({ kind: 'no-profile' })).toEqual({ status: 'Sem perfil', detail: 'Configurar' })
    expect(pillTexts({ kind: 'unavailable' })).toEqual({ status: 'Classificação indisponível', detail: null })
    expect(pillTexts({ kind: 'loading' })).toBeNull()
    expect(pillTexts({ kind: 'tier', tier: 'ouro', metric: null, distanceKm: null })).toBeNull()
    expect(pillAccessibilityLabel('Futebol', { kind: 'tier', tier: 'ouro', metric: { value: 38, unit: 'pontos' }, distanceKm: null })).toBe('Futebol: elo Ouro, 38 pontos')
    expect(pillAccessibilityLabel('Futebol', { kind: 'tier', tier: 'prata', metric: { value: 4.25, unit: 'média' }, distanceKm: null })).toBe('Futebol: elo Prata, 4,25 de média')
    expect(pillAccessibilityLabel('Corrida', { kind: 'tier', tier: 'diamante', metric: { value: 6330, unit: 'tempo' }, distanceKm: 21 })).toBe('Corrida: elo Diamante, 1:45:30 nos 21 km')
    expect(pillAccessibilityLabel('Tênis', { kind: 'tier', tier: 'lendario', metric: null, distanceKm: null })).toBe('Tênis: elo Lendário')
    expect(pillAccessibilityLabel('Corrida', { kind: 'tier', tier: 'bronze', metric: null, distanceKm: 5 })).toBe('Corrida: elo Bronze, nos 5 km')
    expect(pillAccessibilityLabel('Tênis', { kind: 'placement', played: 2, required: 3 })).toBe('Tênis: sem classificação, 2 de 3 partidas')
    expect(pillAccessibilityLabel('Corrida', { kind: 'placement', played: 0, required: 1 })).toBe('Corrida: sem classificação, 0 de 1 partida')
    expect(pillAccessibilityLabel('Corrida', { kind: 'no-mark' })).toBe('Corrida: sem marca, sem classificação')
    expect(pillAccessibilityLabel('Tênis', { kind: 'no-profile' })).toBe('Tênis: sem perfil, configurar')
    expect(pillAccessibilityLabel('Futebol', { kind: 'loading' })).toBe('Futebol: carregando classificação')
    expect(pillAccessibilityLabel('Futebol', { kind: 'unavailable' })).toBe('Futebol: classificação indisponível')
  })
})

describe('modalityStanding', () => {
  it('responde com segurança a uma resposta incompleta', () => {
    expect(modalityStanding('futebol', null)).toEqual({ tier: null, played: 0, required: 3, context: null, metric: null, distanceKm: null })
    expect(modalityStanding('tenis', { calc_version: 1 })).toMatchObject({ tier: null, played: 0, required: 3 })
    expect(modalityStanding('corrida', {})).toMatchObject({ tier: null, required: 1 })
  })

  it('na corrida a métrica é o melhor tempo, em segundos, na distância de maior elo (empate: a primeira na ordem 3, 5, 10, 21, 42)', () => {
    const data = standings({ corrida: runs({ 5: ranked('ouro', { required: 1, played: 1, metric_value: 1452 }) }) })
    expect(modalityStanding('corrida', data)).toEqual({ tier: 'ouro', played: 1, required: 1, context: 'Nos 5 km', metric: { value: 1452, unit: 'tempo' }, distanceKm: 5 })
    const tie = standings({ corrida: runs({ 5: ranked('prata', { required: 1, played: 1 }), 10: ranked('diamante', { required: 1, played: 1, metric_value: 2760 }), 21: ranked('diamante', { required: 1, played: 1 }) }) })
    expect(modalityStanding('corrida', tie)).toMatchObject({ tier: 'diamante', context: 'Nos 10 km', distanceKm: 10, metric: { value: 2760, unit: 'tempo' } })
    expect(modalityStanding('corrida', standings())).toMatchObject({ tier: null, distanceKm: null })
  })

  it('o maior elo vence entre times e posições; a média individual leva a unidade "média"', () => {
    const data = standings({ futebol: { teams: [teamOf({ society: ranked('prata') })], individual: individual({ 'atacante:campo': ranked('diamante', { metric_value: 5.63 }) }) } })
    expect(modalityStanding('futebol', data)).toMatchObject({ tier: 'diamante', context: 'Campo · como atacante', metric: { value: 5.63, unit: 'média' }, distanceKm: null })
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

describe('"Seu próximo passo" no Início', () => {
  it('pede o perfil esportivo só enquanto falta alguma modalidade', async () => {
    renderHome(standings(), profiles.slice(0, 2))
    expect(await screen.findByText('Complete seu perfil esportivo')).not.toBeNull()
    expect(screen.getByText('Seu próximo passo')).not.toBeNull()
    cleanup()
    renderHome(standings())
    expect(await screen.findByText('Seu elo')).not.toBeNull()
    expect(screen.queryByText('Complete seu perfil esportivo')).toBeNull()
    expect(screen.queryByText('Seu próximo passo')).toBeNull()
  })
})

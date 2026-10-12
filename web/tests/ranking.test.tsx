import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile, User } from '../src/api/client'
import type { MyRankingLine } from '../src/api/results'
import { rankingPath } from '../src/api/results'
import { formatMetric } from '../src/components/ranking/metric'
import ArenaPage from '../src/pages/ArenaPage'
import RankingPage from '../src/pages/RankingPage'
import { athleteRow, leoes, rankingPage, rankingRow } from './results-fixtures'
import { apiError, brasilia, mockApi } from './teams-fixtures'

afterEach(cleanup)

const profile = (sport: Profile['sport'], position: Profile['position'] = null): Profile =>
  ({ id: 1, sport, city_id: 5300108, position, looking_for: false, is_public: false, level: null })
const line = (overrides: Partial<MyRankingLine> = {}): MyRankingLine => ({
  state: 'ranqueado', tier: 'ouro', played: 8, required: 3, rank_position: 2, metric_value: 38, faces: ['prata', 'ouro', 'diamante'],
  faces_any_level: false, team: leoes, ...overrides,
})
const society = '/rankings?sport=futebol&kind=time&format=society&limit=20'

function setup(routes: Parameters<typeof mockApi>[0], profiles: Profile[] = [profile('futebol', 'goleiro')]) {
  const api = mockApi(routes)
  const go = vi.fn()
  const onOpenUser = vi.fn()
  const onExpired = vi.fn()
  render(<RankingPage profiles={profiles} go={go} onOpenUser={onOpenUser} onExpired={onExpired} />)
  return { api, go, onOpenUser, onExpired }
}
const chip = (name: string) => screen.getByRole('button', { name })

describe('Ranking geral (GET /rankings)', () => {
  it('lista os times do society com o elo de cada um, a minha linha em destaque e a placa "Sua posição"', async () => {
    const page = rankingPage({
      classified_count: 18, legend_slots: 2,
      items: [rankingRow(1, 'Ferrugem FC', { tier: 'diamante', metric_value: 62 }), rankingRow(2, 'Leões do Cerrado', { is_mine: true, metric_value: 38.5 }), rankingRow(3, 'Gigantes', { tier: 'prata', metric_value: 12 })],
      mine: [line()],
    })
    const { api } = setup({ [`GET ${society}`]: page })
    expect(await screen.findByRole('heading', { name: 'Society' })).not.toBeNull()
    expect(screen.getByText('18 classificados · 2 vagas de Lendário')).not.toBeNull()
    const list = document.querySelector('[data-slot="ranking-list"]') as HTMLElement
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain('Ferrugem FC')
    expect(within(rows[0]).getByRole('img', { name: 'Elo Diamante' }).getAttribute('src')).toBe('/images/brand/diamante.svg')
    expect(within(rows[0]).getByText('62')).not.toBeNull()
    expect(within(rows[0]).getByText('pontos')).not.toBeNull()
    // A minha linha: destacada, com a etiqueta e a campanha.
    expect(rows[1].hasAttribute('data-mine')).toBe(true)
    expect(rows[1].getAttribute('aria-current')).toBe('true')
    expect(within(rows[1]).getByText('Seu time')).not.toBeNull()
    expect(within(rows[1]).getByText('38,5')).not.toBeNull()
    expect(rows[1].textContent).toContain('8 partidas · 5V 1E 2D')
    expect(rows[0].hasAttribute('data-mine')).toBe(false)
    const plate = screen.getByLabelText('Sua posição')
    expect(within(plate).getByText('Leões do Cerrado')).not.toBeNull()
    expect(plate.textContent).toContain('Ouro')
    expect(plate.textContent).toContain('2º lugar · 38 pontos')
    // O ranking é geral: não há linha de cidade e os elos de referência continuam no topo.
    expect(screen.queryByText(/Cidade ainda não definida/)).toBeNull()
    expect(screen.getByLabelText('Elos do ranking').textContent).toContain('Lendário')
    expect(api.calls.map(call => call.path)).toEqual([society])
  })

  it('troca de formato, de tipo, de posição e de modalidade, sempre pedindo à API a categoria certa', async () => {
    const ui = userEvent.setup()
    const individual = rankingPage({ ranking: 'futebol_individual', position: 'goleiro', items: [athleteRow(1, 40, 'Bruno Dias', { metric_value: 4.256 })], mine: [line({ team: null })] })
    const { api } = setup({
      [`GET ${society}`]: rankingPage(),
      'GET /rankings?sport=futebol&kind=time&format=futsal&limit=20': rankingPage({ format: 'futsal' }),
      'GET /rankings?sport=futebol&kind=individual&format=society&position=goleiro&limit=20': individual,
      'GET /rankings?sport=futebol&kind=individual&format=society&position=atacante&limit=20': rankingPage({ ranking: 'futebol_individual', position: 'atacante' }),
      'GET /rankings?sport=tenis&limit=20': rankingPage({ ranking: 'tenis', format: null, items: [athleteRow(1, 50, 'Ana Souza', { goals_for: 12, goals_against: 5, draws: 0 })] }),
      'GET /rankings?sport=corrida&distance_km=5&limit=20': rankingPage({ ranking: 'corrida_5', format: null, distance_km: 5, classified_count: 0 }),
      'GET /rankings?sport=corrida&distance_km=10&limit=20': rankingPage({ ranking: 'corrida_10', format: null, distance_km: 10, classified_count: 0 }),
    })
    expect(chip('Society 7×7').getAttribute('aria-pressed')).toBe('true')
    await ui.click(chip('Futsal 5×5'))
    expect(chip('Futsal 5×5').getAttribute('aria-pressed')).toBe('true')

    // Individual: formato e posição; começa na posição do perfil de futebol (goleiro).
    await ui.click(chip('Society 7×7'))
    await ui.click(screen.getByRole('tab', { name: 'Individual' }))
    expect(await screen.findByText('Bruno Dias')).not.toBeNull()
    expect(chip('Goleiro').getAttribute('aria-pressed')).toBe('true')
    const row = within(document.querySelector('[data-slot="ranking-list"]') as HTMLElement).getAllByRole('listitem')[0]
    expect(within(row).getByText('4,26')).not.toBeNull()
    expect(within(row).getByText('média')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Society · Goleiro' })).not.toBeNull()
    await ui.click(chip('Atacante'))
    expect(await screen.findByText('Ninguém classificado ainda')).not.toBeNull()

    // Tênis: lista única, sem formato nem posição, e o saldo é de sets.
    await ui.click(chip('Tênis'))
    expect(await screen.findByText('Ana Souza')).not.toBeNull()
    expect(screen.queryByRole('tab', { name: 'Individual' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Society 7×7' })).toBeNull()
    expect(screen.getByText(/8 partidas · 5V 2D/)).not.toBeNull()

    // Corrida: a distância.
    await ui.click(chip('Corrida'))
    await ui.click(await screen.findByRole('button', { name: '10 km' }))
    await waitFor(() => expect(api.calls.at(-1)?.path).toBe('/rankings?sport=corrida&distance_km=10&limit=20'))
    expect(api.calls.map(call => call.path)).toEqual(expect.arrayContaining([
      '/rankings?sport=futebol&kind=time&format=futsal&limit=20',
      '/rankings?sport=futebol&kind=individual&format=society&position=goleiro&limit=20',
      '/rankings?sport=futebol&kind=individual&format=society&position=atacante&limit=20',
      '/rankings?sport=tenis&limit=20',
      '/rankings?sport=corrida&distance_km=5&limit=20',
    ]))
  })

  it('pagina por cursor: "Carregar mais" acrescenta as linhas e some no fim', async () => {
    const first = rankingPage({ classified_count: 3, items: [rankingRow(1, 'Ferrugem FC'), rankingRow(2, 'Gigantes')], next_cursor: 'Mg' })
    const second = rankingPage({ classified_count: 3, items: [rankingRow(3, 'Leões do Cerrado', { is_mine: true })], next_cursor: null, mine: [line({ rank_position: 3 })] })
    const { api } = setup({ [`GET ${society}`]: first, [`GET ${society}&cursor=Mg`]: second })
    const ui = userEvent.setup()
    expect(await screen.findByText('Gigantes')).not.toBeNull()
    expect(screen.queryByText('Leões do Cerrado', { selector: 'b' })).toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Carregar mais' }))
    expect(await screen.findByText('Leões do Cerrado', { selector: 'b' })).not.toBeNull()
    expect(within(document.querySelector('[data-slot="ranking-list"]') as HTMLElement).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
    expect(api.calls.map(call => call.path)).toEqual([society, `${society}&cursor=Mg`])
  })

  it('uma falha ao carregar mais mantém a lista e avisa', async () => {
    let fails = true
    setup({
      [`GET ${society}`]: rankingPage({ items: [rankingRow(1, 'Ferrugem FC')], next_cursor: 'c1' }),
      [`GET ${society}&cursor=c1`]: () => (fails ? apiError(503, 'Serviço fora do ar.') : rankingPage({ items: [rankingRow(2, 'Gigantes')] })),
    })
    const ui = userEvent.setup()
    await screen.findByText('Ferrugem FC')
    await ui.click(screen.getByRole('button', { name: 'Carregar mais' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Serviço fora do ar.')
    expect(screen.getByText('Ferrugem FC')).not.toBeNull()
    fails = false
    await ui.click(screen.getByRole('button', { name: 'Carregar mais' }))
    expect(await screen.findByText('Gigantes')).not.toBeNull()
  })

  it('quem está em classificação aparece só na placa, com "n de 3 partidas" e sem elo', async () => {
    setup({ [`GET ${society}`]: rankingPage({ items: [rankingRow(1, 'Ferrugem FC')], mine: [line({ state: 'classificacao', tier: null, played: 2, rank_position: null, metric_value: 6 })] }) })
    const plate = await screen.findByLabelText('Sua posição')
    expect(plate.textContent).toContain('Em classificação')
    expect(plate.textContent).toContain('2 de 3 partidas')
    expect(plate.querySelector('[data-slot="tier-emblem"]')).toBeNull()
    expect(within(plate.parentElement as HTMLElement).getAllByRole('listitem')).toHaveLength(1)
  })

  it('cada time ativo do titular tem a sua linha na placa; sem time, o caminho para Meus times', async () => {
    const { go } = setup({
      [`GET ${society}`]: rankingPage({ items: [rankingRow(1, 'Ferrugem FC')], mine: [line(), line({ team: { id: 9, name: 'Os Sem Elo', initials: 'OS', crest_url: null }, state: 'sem_jogos', tier: null, played: 0, rank_position: null, metric_value: null })] }),
      'GET /rankings?sport=futebol&kind=time&format=campo&limit=20': rankingPage({ format: 'campo', items: [], mine: [] }),
    })
    const plate = await screen.findByLabelText('Sua posição')
    expect(plate.textContent).toContain('Os Sem Elo')
    expect(plate.textContent).toContain('0 de 3 partidas')
    const ui = userEvent.setup()
    await ui.click(chip('Campo 11×11'))
    expect(await screen.findByText('Você ainda não faz parte de um time ativo.')).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Meus times' }))
    expect(go).toHaveBeenCalledWith('teams')
  })

  it('o estado vazio é honesto: ninguém classificado e quantas partidas faltam para entrar', async () => {
    setup({ [`GET ${society}`]: rankingPage({ classified_count: 0, items: [], mine: [] }) })
    expect(await screen.findByText('Ninguém classificado ainda')).not.toBeNull()
    expect(screen.getByText(/O ranking de Society começa quando as primeiras partidas forem confirmadas\. São 3 partidas/)).not.toBeNull()
    expect(screen.queryByText(/Seu elo começa em campo/)).toBeNull()
  })

  it('a corrida vazia diz que as marcas chegam na próxima etapa', async () => {
    const ui = userEvent.setup()
    setup({
      [`GET ${society}`]: rankingPage(),
      'GET /rankings?sport=corrida&distance_km=5&limit=20': rankingPage({ ranking: 'corrida_5', format: null, distance_km: 5, classified_count: 0, required: 1, mine: [line({ state: 'sem_marca', tier: null, played: 0, required: 1, team: null, rank_position: null, metric_value: null })] }),
    })
    await ui.click(chip('Corrida'))
    expect(await screen.findByText('As marcas da corrida chegam na próxima etapa')).not.toBeNull()
    expect(screen.getByLabelText('Sua posição').textContent).toContain('Sem marca neste ranking')
    expect(chip('5 km').getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText('Ninguém classificado ainda')).toBeNull()
  })

  it('abre o perfil do atleta ao tocar na linha; times não são links', async () => {
    const { onOpenUser } = setup({
      'GET /rankings?sport=tenis&limit=20': rankingPage({ ranking: 'tenis', format: null, items: [athleteRow(1, 50, 'Ana Souza')] }),
      [`GET ${society}`]: rankingPage({ items: [rankingRow(1, 'Ferrugem FC')] }),
    })
    const ui = userEvent.setup()
    await screen.findByText('Ferrugem FC')
    expect(screen.queryByRole('button', { name: /Abrir perfil/ })).toBeNull()
    await ui.click(chip('Tênis'))
    await ui.click(await screen.findByRole('button', { name: 'Abrir perfil de Ana Souza, posição 1' }))
    expect(onOpenUser).toHaveBeenCalledWith(50)
  })

  it('mostra o erro com nova tentativa e chama onExpired quando a sessão cai', async () => {
    let fails = true
    const { onExpired } = setup({ [`GET ${society}`]: () => (fails ? apiError(503, 'Serviço fora do ar.') : rankingPage({ items: [rankingRow(1, 'Ferrugem FC')] })) })
    expect((await screen.findByRole('alert')).textContent).toContain('Serviço fora do ar.')
    fails = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Ferrugem FC')).not.toBeNull()
    expect(onExpired).not.toHaveBeenCalled()
    cleanup()
    const expired = setup({ [`GET ${society}`]: apiError(401, 'Sua sessão expirou. Entre novamente.') })
    await waitFor(() => expect(expired.onExpired).toHaveBeenCalled())
  })

  it('o botão "Configurar modalidade" continua levando a Suas modalidades', async () => {
    const { go } = setup({ [`GET ${society}`]: rankingPage() })
    await screen.findByText('Ninguém classificado ainda')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Configurar modalidade' }))
    expect(go).toHaveBeenCalledWith('sports')
  })
})

describe('caminho e formato do Ranking', () => {
  it('monta a consulta na ordem do contrato e ignora o que não se aplica', () => {
    expect(rankingPath({ sport: 'futebol', kind: 'individual', format: 'campo', position: 'defesa', limit: 20, cursor: 'Mw' }))
      .toBe('/rankings?sport=futebol&kind=individual&format=campo&position=defesa&limit=20&cursor=Mw')
    expect(rankingPath({ sport: 'tenis' })).toBe('/rankings?sport=tenis')
    expect(rankingPath({ sport: 'corrida', distance_km: 21 })).toBe('/rankings?sport=corrida&distance_km=21')
  })

  it('pontos com até uma casa e média por partida com até duas', () => {
    expect(formatMetric(38, 'futebol_time')).toBe('38')
    expect(formatMetric(38.55, 'tenis')).toBe('38,6')
    expect(formatMetric(4.256, 'futebol_individual')).toBe('4,26')
  })
})

describe('Ranking no aplicativo', () => {
  const me: User = { id: 1, name: 'Ricardo Moura', username: 'ricardo.moura', email: 'r@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }

  it('"Ver elos" do Início abre o Ranking geral na aba acesa, sem a linha de cidade', async () => {
    Element.prototype.scrollTo = () => {}
    const api = mockApi({
      'GET /me/sports-profiles': [profile('futebol', 'atacante')],
      'GET /cities': [brasilia],
      'GET /me/notifications/unread-count': { unread_count: 0 },
      'GET /me/standings': { calc_version: 1, futebol: { teams: [], individual: [] }, tenis: null, corrida: [] },
      [`GET ${society}`]: rankingPage({ items: [rankingRow(1, 'Ferrugem FC')], mine: [line()] }),
    })
    render(<ArenaPage user={me} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} />)
    const ui = userEvent.setup()
    await ui.click(await screen.findByRole('button', { name: 'Ver elos' }))
    expect(await screen.findByText('Ferrugem FC')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Ranking' })).not.toBeNull()
    expect(within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { current: 'page' }).textContent).toBe('Ranking')
    expect(screen.queryByText(/Cidade ainda não definida|Brasília/)).toBeNull()
    expect(api.calls.map(call => call.path)).toContain(society)
    expect(api.calls.some(call => call.path.includes('city'))).toBe(false)
  })
})

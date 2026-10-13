import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import type { City, Profile, User } from '../src/api/client'
import type { MeStandings, PositionStanding, RunStanding, StandingLine } from '../src/api/play'
import type { RunBest } from '../src/api/runs'
import { avulsoLine, facesText, formatDuration, lineView } from '../src/components/play/tierLines'
import ArenaPage from '../src/pages/ArenaPage'
import PlayPage from '../src/pages/PlayPage'
import type { PlayBoardState } from '../src/hooks/usePlayBoard'
import { bests, lago, markCard } from './run-fixtures'
import { summaryOf } from './notifications-fixtures'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

const city: City = { id: 7, name: 'Brasília', state: 'DF' }
const football: Profile = { id: 1, sport: 'futebol', city_id: 7, position: 'atacante', looking_for: false, is_public: false, level: null }
const tennis: Profile = { ...football, id: 2, sport: 'tenis', position: null }
const running: Profile = { ...football, id: 3, sport: 'corrida', position: null }

const empty = (extra: Partial<StandingLine> = {}): StandingLine => ({
  state: 'sem_jogos', tier: null, played: 0, required: 3, rank_position: null, metric_value: null,
  faces: ['bronze', 'prata', 'ouro', 'diamante', 'lendario'], faces_any_level: true, ...extra,
})
const ranked = (tier: StandingLine['tier'], faces: StandingLine['faces'], extra: Partial<StandingLine> = {}) =>
  empty({ state: 'ranqueado', tier, played: 5, rank_position: 4, metric_value: 32, faces, faces_any_level: false, ...extra })
const formats = (['futsal', 'society', 'campo'] as const)
const individual = (overrides: Partial<Record<string, Partial<StandingLine>>> = {}): PositionStanding[] =>
  (['goleiro', 'defesa', 'meio_campo', 'atacante'] as const).flatMap(position =>
    formats.map(format => ({ ...empty(overrides[`${position}:${format}`]), position, format })))
const corrida = (overrides: Partial<Record<number, Partial<StandingLine>>> = {}): RunStanding[] =>
  ([3, 5, 10, 21, 42] as const).map(distance_km => ({ ...empty({ state: 'sem_marca', required: 1, ...overrides[distance_km] }), distance_km }))
function standings(extra: Partial<MeStandings> = {}): MeStandings {
  return { calc_version: 1, futebol: { teams: [], individual: individual() }, tenis: empty(), corrida: corrida(), ...extra }
}

/** Placa sem busca, proposta, oferta nem partida (a leitura de `/me/play` é do ArenaPage; aqui ela já chegou). */
const idleBoard = (): PlayBoardState => ({
  board: { attention: false, searches: [], proposals: [], offers: [], matches: [] },
  loading: false, error: '', reload: vi.fn(async () => null), deferred: [], defer: vi.fn(),
})

function renderPlay(data: MeStandings | Error, profiles: Profile[] = [football, tennis, running], runBests: { items: RunBest[] } = bests()) {
  vi.mocked(request).mockImplementation(async path => {
    if (path === '/me/run-bests') return runBests as never
    if (path !== '/me/standings') throw new Error(`rota inesperada ${path}`)
    if (data instanceof Error) throw data
    return data as never
  })
  const go = vi.fn()
  render(<PlayPage profiles={profiles} cities={[city]} loading={false} board={idleBoard()} go={go} onExpired={vi.fn()} />)
  return go
}
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement

beforeEach(() => { vi.mocked(request).mockReset() })
afterEach(cleanup)

describe('placa do Jogar (fase 1)', () => {
  it('mostra a placa com a cidade do perfil e as abas das modalidades no teclado', async () => {
    renderPlay(standings())
    expect(screen.getByRole('heading', { level: 1, name: 'Jogar' })).not.toBeNull()
    expect(button(/Cidade do perfil de Futebol: Brasília/)).not.toBeNull()
    const tabs = screen.getByRole('tablist', { name: 'Modalidade' })
    expect(within(tabs).getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Futebol', 'Tênis', 'Corrida'])
    within(tabs).getByRole('tab', { name: 'Futebol' }).focus()
    await userEvent.setup().keyboard('{ArrowRight}')
    expect(within(tabs).getByRole('tab', { name: 'Tênis' }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement?.textContent).toBe('Tênis')
  })

  it('com meu time, sem representar um time, leva a Meus times', async () => {
    const go = renderPlay(standings())
    expect(await screen.findByText('Você ainda não representa um time.')).not.toBeNull()
    await userEvent.setup().click(button('Crie ou represente um time'))
    expect(go).toHaveBeenCalledWith('teams')
  })

  it('avulso em classificação 0/3: sem elo, "enfrenta qualquer nível" e a busca de vaga pronta', async () => {
    const ui = userEvent.setup()
    renderPlay(standings())
    await ui.click(screen.getByRole('button', { name: 'Avulso' }))
    expect(screen.getByRole('button', { name: 'Atacante' }).getAttribute('aria-pressed')).toBe('true')
    expect(await screen.findByText('Em classificação como atacante')).not.toBeNull()
    expect(screen.getByText('0 de 3 partidas · enfrenta qualquer nível')).not.toBeNull()
    expect(screen.queryByRole('img', { name: /^Elo/ })).toBeNull()
    expect(document.querySelector('[data-slot="tier-emblem"]')).toBeNull()
    const play = button('Encontrar vaga')
    expect(play.disabled).toBe(false)
    expect(document.getElementById(play.getAttribute('aria-describedby')!)?.textContent).toBe('Vagas de atacante em partidas de Brasília.')
    await ui.click(screen.getByRole('button', { name: 'Qualquer posição' }))
    expect(screen.getByText('Em classificação')).not.toBeNull()
    expect(screen.queryByText(/partida encontrada|buscando/i)).toBeNull()

    // Teclado nos chips: setas movem o foco e Enter escolhe.
    await ui.keyboard('{ArrowRight}')
    expect(document.activeElement?.textContent).toBe('Goleiro')
    await ui.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Goleiro' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Em classificação como goleiro')).not.toBeNull()
  })

  it('com meu time, mostra o elo do formato com "Enfrenta…" vindo da API e nunca o elo em classificação', async () => {
    const ui = userEvent.setup()
    renderPlay(standings({ futebol: { individual: individual(), teams: [{
      team: { id: 5, name: 'Leões do Cerrado', initials: 'LC', crest_url: null }, my_role: 'representante',
      formats: [
        { ...ranked('ouro', ['prata', 'ouro', 'diamante']), format: 'futsal' },
        { ...empty({ state: 'classificacao', played: 2, tier: 'ouro' }), format: 'society' },
        { ...empty(), format: 'campo' },
      ],
    }] } }))
    expect(await screen.findByText('Leões do Cerrado')).not.toBeNull()
    expect(screen.getByText('2 de 3 partidas · enfrenta qualquer nível')).not.toBeNull()
    expect(document.querySelector('[data-slot="tier-emblem"]')).toBeNull()
    expect(button('Encontrar partida').disabled).toBe(false)

    await ui.click(screen.getByRole('button', { name: 'Futsal 5 contra 5' }))
    expect(screen.getByText('Enfrenta Prata, Ouro ou Diamante')).not.toBeNull()
    expect(screen.getByText('Ouro')).not.toBeNull()
    expect(document.querySelector('[data-slot="tier-emblem"]')?.getAttribute('src')).toBe('/images/brand/ouro.svg')
  })

  it('tênis com ranking mostra o elo; sem perfil, o botão leva a prepará-lo', async () => {
    const ui = userEvent.setup()
    const go = renderPlay(standings({ tenis: ranked('prata', ['bronze', 'prata', 'ouro']) }), [football])
    await ui.click(screen.getByRole('tab', { name: 'Tênis' }))
    expect(await screen.findByText('Enfrenta Bronze, Prata ou Ouro')).not.toBeNull()
    expect(button('Definir a cidade do perfil de Tênis')).not.toBeNull()
    await ui.click(button('Preparar perfil de Tênis'))
    expect(go).toHaveBeenCalledWith('sports')
  })

  it('corrida: chips de distância, sem marca e marca ranqueada (elo e melhor tempo vêm de run-bests)', async () => {
    const ui = userEvent.setup()
    renderPlay(standings(), [football, tennis, running], bests(markCard(10, ['52:40'], { best: { ...markCard(10, ['52:40']).best!, origin: lago } })))
    await ui.click(screen.getByRole('tab', { name: 'Corrida' }))
    expect(screen.getByRole('button', { name: '5 km' }).getAttribute('aria-pressed')).toBe('true')
    expect(await screen.findByText('Sem marca nos 5 km')).not.toBeNull()
    expect(button('Registrar treino ou prova').disabled).toBe(false)
    expect(screen.getByText(/Registre o tempo de um treino ou de uma prova do Arena/)).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: '10 km' }))
    expect(screen.getByText('Ouro nos 10 km')).not.toBeNull()
    expect(screen.getByText('Melhor 52:40 · Corrida do Lago')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Provas' })).not.toBeNull()
  })

  it('"Outras formas de jogar": Meu time e os campeonatos (ou provas) da modalidade da aba', async () => {
    const ui = userEvent.setup()
    const go = renderPlay(standings())
    const section = screen.getByRole('region', { name: 'Outras formas de jogar' })
    expect(within(section).queryByText('Em breve')).toBeNull()
    await ui.click(within(section).getByRole('button', { name: /Meu time/ }))
    expect(go).toHaveBeenCalledWith('teams')
    await ui.click(within(section).getByRole('button', { name: /Campeonatos/ }))
    expect(go).toHaveBeenLastCalledWith('events', { sport: 'futebol' })
    await ui.click(screen.getByRole('tab', { name: 'Tênis' }))
    await ui.click(within(screen.getByRole('region', { name: 'Outras formas de jogar' })).getByRole('button', { name: /Campeonatos/ }))
    expect(go).toHaveBeenLastCalledWith('events', { sport: 'tenis' })
    await ui.click(screen.getByRole('tab', { name: 'Corrida' }))
    await ui.click(within(screen.getByRole('region', { name: 'Provas' })).getByRole('button', { name: /Provas/ }))
    expect(go).toHaveBeenLastCalledWith('events', { sport: 'corrida' })
  })

  it('mostra o erro do elo e tenta de novo', async () => {
    renderPlay(new ApiError('Serviço indisponível.', 503))
    expect((await screen.findByRole('alert')).textContent).toContain('Serviço indisponível.')
    vi.mocked(request).mockResolvedValue(standings() as never)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Você ainda não representa um time.')).not.toBeNull()
  })

  it('substitui o antigo bloco do Jogar no ArenaPage, sem cabeçalho de voltar', async () => {
    const me: User = { id: 1, name: 'Eu Mesmo', username: 'eu', email: 'eu@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
    Element.prototype.scrollTo = () => {}
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/me/sports-profiles') return [football] as never
      if (path === '/cities') return [city] as never
      if (path === '/me/standings') return standings() as never
      if (path === '/me/notifications/summary') return summaryOf({ unread_count: 2 }) as never
      return { items: [], next_cursor: null } as never
    })
    const ui = userEvent.setup()
    render(<ArenaPage user={me} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} />)
    expect(await screen.findByRole('button', { name: 'Notificações, 2 novas' })).not.toBeNull()
    await ui.click(within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { name: 'JOGAR' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Jogar' })).not.toBeNull()
    expect(screen.queryByText('Qual é o jogo de hoje?')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull()
    await ui.click(await screen.findByRole('button', { name: 'Crie ou represente um time' }))
    expect(screen.getByRole('heading', { name: 'Meus times' })).not.toBeNull()
  })
})

describe('linha do elo', () => {
  it('monta "Enfrenta…" a partir de faces e formata a marca', () => {
    expect(facesText(ranked('bronze', ['bronze', 'prata']))).toBe('Enfrenta Bronze ou Prata')
    expect(facesText(ranked('lendario', ['lendario']))).toBe('Enfrenta Lendário')
    expect(facesText(empty())).toBe('Enfrenta qualquer nível')
    expect(formatDuration(1452)).toBe('24:12')
    expect(formatDuration(6300)).toBe('1:45:00')
  })

  it('nunca atribui elo em classificação, mesmo com a chave na resposta', () => {
    expect(lineView(empty({ state: 'classificacao', tier: 'ouro', played: 2 }))).toEqual({ kind: 'placement', title: 'Em classificação', played: 2, required: 3 })
    expect(lineView(empty({ state: 'ranqueado', tier: 'ouro', played: 1 })).kind).toBe('placement')
    expect(lineView(undefined)).toEqual({ kind: 'placement', title: 'Em classificação', played: 0, required: 3 })
  })

  it('no avulso, escolhe o maior elo da posição com o formato no texto', () => {
    const lines = individual({
      'atacante:futsal': { state: 'ranqueado', tier: 'prata', played: 4, faces: ['bronze', 'prata', 'ouro'], faces_any_level: false },
      'atacante:society': { state: 'ranqueado', tier: 'ouro', played: 6, faces: ['prata', 'ouro', 'diamante'], faces_any_level: false },
      'goleiro:campo': { state: 'classificacao', played: 2 },
    })
    expect(avulsoLine(lines, 'atacante')).toMatchObject({ kind: 'ranked', tier: 'ouro', title: 'Ouro no society como atacante', detail: 'Enfrenta Prata, Ouro ou Diamante' })
    expect(avulsoLine(lines, 'goleiro')).toEqual({ kind: 'placement', title: 'Em classificação como goleiro', played: 2, required: 3 })
    expect(avulsoLine(lines, 'qualquer')).toMatchObject({ title: 'Ouro no society como atacante' })
  })
})

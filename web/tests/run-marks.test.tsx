import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile, User } from '../src/api/client'
import { RunHistorySheet } from '../src/components/play/RunHistorySheet'
import { RunMarks } from '../src/components/play/RunMarks'
import { RunSpark } from '../src/components/play/RunSpark'
import { runBestLine } from '../src/components/play/tierLines'
import type { PlayBoardState } from '../src/hooks/usePlayBoard'
import ArenaPage from '../src/pages/ArenaPage'
import PlayPage from '../src/pages/PlayPage'
import { apiError, mockApi, reply } from './teams-fixtures'
import { brasilia, football, playBoard, standings } from './matchmaking-fixtures'
import { athleteRow, rankingPage } from './results-fixtures'
import { bests, created, emptyCard, impact, lago, markCard, preview, run, sec } from './run-fixtures'
import { summaryOf } from './notifications-fixtures'

/*
 * "Suas marcas" (K4), o histórico, a linha do elo da corrida na placa e o fluxo REGISTRAR → salvar, etapa 5.
 */

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const running: Profile = { id: 3, sport: 'corrida', city_id: brasilia.id, position: null, looking_for: false, is_public: false, level: null }
const idleBoard = (): PlayBoardState => ({
  board: { attention: false, searches: [], proposals: [], offers: [], matches: [] },
  loading: false, error: '', reload: vi.fn(async () => null), deferred: [], defer: vi.fn(),
})

describe('RunSpark: minigráfico de evolução em SVG próprio', () => {
  const points = (container: HTMLElement) => (container.querySelector('polyline')?.getAttribute('points') ?? '').split(' ').map(pair => pair.split(',').map(Number))

  it('o tempo menor sobe o traço e a marca mais recente fica marcada', () => {
    const { container } = render(<RunSpark series={markCard(5, ['26:05', '25:00', '24:12']).series} />)
    const line = points(container)
    expect(line).toHaveLength(3)
    expect(line[0][0]).toBe(0)
    expect(line[2][0]).toBe(92)
    expect(line[0][1]).toBeGreaterThan(line[1][1]) // y maior = mais baixo no gráfico
    expect(line[1][1]).toBeGreaterThan(line[2][1])
    const dot = container.querySelector('circle')!
    expect([Number(dot.getAttribute('cx')), Number(dot.getAttribute('cy'))]).toEqual(line[2])
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe('Evolução: 3 marcas, de 26:05 a 24:12')
  })

  it('uma marca é só um ponto; marcas iguais, uma linha reta; sem marcas, nada', () => {
    const one = render(<RunSpark series={markCard(5, ['24:12']).series} />)
    expect(one.container.querySelector('polyline')).toBeNull()
    expect(one.container.querySelector('circle')?.getAttribute('cx')).toBe('46')
    expect(one.container.querySelector('svg')?.getAttribute('aria-label')).toBe('Evolução: uma marca, 24:12')
    const flat = render(<RunSpark series={markCard(5, ['24:12', '24:12']).series} />)
    const ys = points(flat.container).map(pair => pair[1])
    expect(ys).toEqual([14, 14])
    const none = render(<RunSpark series={[]} />)
    expect(none.container.querySelector('svg')).toBeNull()
  })
})

describe('RunMarks: os cinco cartões', () => {
  const cards = bests(markCard(5, ['26:05', '25:00', '24:12'], { tier: 'ouro' }), markCard(10, ['52:40'], { tier: 'prata', best: { ...markCard(10, ['52:40']).best!, origin: lago } })).items

  function renderMarks(overrides: Partial<Parameters<typeof RunMarks>[0]> = {}) {
    const onAdd = vi.fn()
    const onOpen = vi.fn()
    const onRetry = vi.fn()
    const onOpenRanking = vi.fn()
    render(<RunMarks items={cards} loading={false} error="" selected={5} onAdd={onAdd} onOpen={onOpen} onRetry={onRetry} onOpenRanking={onOpenRanking} {...overrides} />)
    return { onAdd, onOpen, onRetry, onOpenRanking, ui: userEvent.setup() }
  }
  const card = (km: number) => document.querySelector(`[data-slot="run-mark"][data-distance="${km}"]`) as HTMLElement

  it('mostra o melhor tempo, o elo, a origem e o minigráfico; sem marca, o convite e nunca um elo', () => {
    renderMarks()
    expect(document.querySelectorAll('[data-slot="run-mark"]')).toHaveLength(5)
    const five = card(5)
    expect(five.textContent).toContain('24:12')
    expect(five.textContent).toContain('Ouro')
    expect(five.textContent).toContain('Treino')
    expect(five.textContent).toContain('Melhor nas últimas 52 semanas')
    expect(within(five).getByRole('img', { name: 'Evolução: 3 marcas, de 26:05 a 24:12' })).not.toBeNull()
    expect(five.querySelector('[data-slot="tier-emblem"]')?.getAttribute('src')).toBe('/images/brand/ouro.svg')
    expect(five.getAttribute('aria-current')).toBe('true')
    // A origem da prova é o nome dela; "autodeclarado" nunca aparece.
    expect(card(10).textContent).toContain('Corrida do Lago')
    expect(card(10).textContent).toContain('Prata')
    expect(card(10).getAttribute('aria-current')).toBeNull()
    const three = card(3)
    expect(three.textContent).toContain('Sem marca')
    expect(three.textContent).toContain('Registre um treino ou prova para entrar no ranking dos 3 km.')
    expect(three.querySelector('[data-slot="tier-emblem"]')).toBeNull()
    expect(three.querySelector('svg[data-slot="run-spark"]')).toBeNull()
    expect(document.body.textContent).not.toMatch(/autodeclarad/i)
  })

  it('o "+" registra naquela distância e tocar no cartão abre o histórico dela', async () => {
    const { onAdd, onOpen, ui } = renderMarks()
    await ui.click(screen.getByRole('button', { name: 'Registrar 21 km' }))
    expect(onAdd).toHaveBeenCalledWith(21)
    await ui.click(screen.getByRole('button', { name: 'Histórico dos 5 km' }))
    expect(onOpen).toHaveBeenLastCalledWith('5')
    await ui.click(screen.getByRole('button', { name: 'Histórico dos 3 km' }))
    expect(onOpen).toHaveBeenLastCalledWith('3')
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('"Outras distâncias" abre o histórico das marcas fora das cinco', async () => {
    const { onOpen, ui } = renderMarks()
    await ui.click(screen.getByRole('button', { name: /Outras distâncias/ }))
    expect(onOpen).toHaveBeenCalledWith('outra')
  })

  it('"Ver ranking" no título abre o Ranking da corrida na distância escolhida na placa', async () => {
    const first = renderMarks()
    await first.ui.click(screen.getByRole('button', { name: 'Ver ranking' }))
    expect(first.onOpenRanking).toHaveBeenCalledExactlyOnceWith(5)
    cleanup()
    const second = renderMarks({ selected: 21 })
    await second.ui.click(screen.getByRole('button', { name: 'Ver ranking' }))
    expect(second.onOpenRanking).toHaveBeenCalledExactlyOnceWith(21)
  })

  it('carregando e erro: texto de estado e nova tentativa, sem cartões inventados', async () => {
    cleanup()
    render(<RunMarks items={[]} loading error="" selected={5} onAdd={vi.fn()} onOpen={vi.fn()} onRetry={vi.fn()} onOpenRanking={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toBe('Carregando suas marcas…')
    expect(document.querySelector('[data-slot="run-mark"]')).toBeNull()
    cleanup()
    const { onRetry, ui } = renderMarks({ items: [], error: 'Não foi possível carregar suas marcas.' })
    expect(screen.getByRole('alert').textContent).toContain('Não foi possível carregar suas marcas.')
    await ui.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('RunHistorySheet: histórico paginado e remoção', () => {
  const path = (filter: string, cursor = '') => `GET /me/runs?distance=${filter}&limit=20${cursor ? `&cursor=${cursor}` : ''}`
  const rows = [
    run({ id: 3, duration_s: sec('24:12'), date: '2026-10-09', pace_s_per_km: 290 }),
    run({ id: 2, duration_s: sec('25:31'), date: '2026-09-27', pace_s_per_km: 306, origin: lago, distance_m: 5050 }),
    run({ id: 1, duration_s: sec('26:05'), date: '2025-10-01', counts_for_ranking: false, pace_s_per_km: 313 }),
  ]
  function open(filter: Parameters<typeof RunHistorySheet>[0]['filter'], routes: Parameters<typeof mockApi>[0], extra: Partial<Parameters<typeof RunHistorySheet>[0]> = {}) {
    const api = mockApi(routes)
    const handlers = { onClose: vi.fn(), onChanged: vi.fn(), onExpired: vi.fn(), onAdd: vi.fn() }
    render(<RunHistorySheet filter={filter} {...handlers} {...extra} />)
    return { api, ...handlers, ui: userEvent.setup() }
  }
  const sheet = () => screen.getByRole('dialog', { name: 'Histórico dos 5 km' })

  it('lista as marcas do dia mais recente ao mais antigo, com ritmo, data, origem e distância', async () => {
    open('5', { [path('5')]: { items: rows, next_cursor: null } })
    expect(await screen.findByText('24:12')).not.toBeNull()
    const items = within(sheet()).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0].textContent).toContain('4:50/km')
    expect(items[0].textContent).toContain('9 out · Treino · 5 km')
    expect(items[1].textContent).toContain('Corrida do Lago · 5,05 km')
    expect(items[2].textContent).toContain('fora das 52 semanas')
    expect(items[0].textContent).not.toContain('fora das 52 semanas')
    expect(document.body.textContent).not.toMatch(/autodeclarad/i)
  })

  it('pagina por cursor: "Carregar mais" acrescenta as marcas e some no fim', async () => {
    const { api, ui } = open('5', {
      [path('5')]: { items: [rows[0]], next_cursor: 'abc' },
      [path('5', 'abc')]: { items: [rows[1]], next_cursor: null },
    })
    await screen.findByText('24:12')
    await ui.click(screen.getByRole('button', { name: 'Carregar mais' }))
    expect(await screen.findByText('25:31')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
    expect(api.calls.map(call => call.path)).toEqual(['/me/runs?distance=5&limit=20', '/me/runs?distance=5&limit=20&cursor=abc'])
  })

  it('remover pede confirmação, apaga a marca e avisa quem chamou; cancelar não apaga', async () => {
    const { api, ui, onChanged } = open('5', { [path('5')]: { items: rows, next_cursor: null }, 'DELETE /me/runs/2': undefined })
    await screen.findByText('24:12')
    await ui.click(screen.getByRole('button', { name: 'Remover a marca de 25:31 em 27 set' }))
    const confirm = screen.getByRole('group', { name: 'Confirmação' })
    expect(confirm.textContent).toContain('Remover esta marca?')
    expect(confirm.textContent).toContain('o ranking da distância é recalculado')
    await waitFor(() => expect(document.activeElement).toBe(confirm))
    await ui.click(within(confirm).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('group', { name: 'Confirmação' })).toBeNull()
    expect(api.find('DELETE', '/me/runs/2')).toHaveLength(0)
    await ui.click(screen.getByRole('button', { name: 'Remover a marca de 25:31 em 27 set' }))
    await ui.click(within(screen.getByRole('group', { name: 'Confirmação' })).getByRole('button', { name: 'Remover marca' }))
    await waitFor(() => expect(screen.queryByText('25:31')).toBeNull())
    expect(screen.getByRole('status', { name: '' }).textContent).toBe('Marca removida.')
    expect(api.find('DELETE', '/me/runs/2')).toHaveLength(1)
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(within(sheet()).getAllByRole('listitem')).toHaveLength(2)
  })

  it('a marca fora das 52 semanas avisa que não conta para o ranking; erro ao remover fica na confirmação', async () => {
    const { api, ui, onChanged } = open('5', { [path('5')]: { items: rows, next_cursor: null }, 'DELETE /me/runs/1': apiError(503, 'Serviço indisponível.') })
    await screen.findByText('26:05')
    await ui.click(screen.getByRole('button', { name: 'Remover a marca de 26:05 em 1 out 2025' }))
    expect(screen.getByRole('group', { name: 'Confirmação' }).textContent).toContain('Não conta para o ranking.')
    await ui.click(within(screen.getByRole('group', { name: 'Confirmação' })).getByRole('button', { name: 'Remover marca' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Serviço indisponível.')
    expect(onChanged).not.toHaveBeenCalled()
    expect(screen.getByText('26:05')).not.toBeNull()
    // Uma falha de servidor não é estado velho: a lista não é relida e a confirmação continua aberta.
    expect(api.find('GET', '/me/runs?distance=5&limit=20')).toHaveLength(1)
    expect(screen.getByRole('group', { name: 'Confirmação' })).not.toBeNull()
  })

  it('404 ao remover (a marca já saiu em outra aba): relê a lista e os cartões, tira a marca e mantém a mensagem', async () => {
    let reads = 0
    const { api, ui, onChanged } = open('5', {
      [path('5')]: () => ({ items: ++reads === 1 ? rows : [rows[0], rows[2]], next_cursor: null }),
      'DELETE /me/runs/2': apiError(404, 'Marca não encontrada.'),
    })
    await screen.findByText('25:31')
    await ui.click(screen.getByRole('button', { name: 'Remover a marca de 25:31 em 27 set' }))
    await ui.click(within(screen.getByRole('group', { name: 'Confirmação' })).getByRole('button', { name: 'Remover marca' }))
    await waitFor(() => expect(screen.queryByText('25:31')).toBeNull())
    expect(api.find('GET', '/me/runs?distance=5&limit=20')).toHaveLength(2)
    expect((await screen.findByRole('alert')).textContent).toBe('Marca não encontrada.')
    expect(screen.queryByRole('group', { name: 'Confirmação' })).toBeNull()
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(within(sheet()).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('24:12')).not.toBeNull()
  })

  it('histórico vazio de uma distância oferece registrar; o de "Outra" explica que fica só ali', async () => {
    const first = open('5', { [path('5')]: { items: [], next_cursor: null } })
    expect(await screen.findByText('Nenhuma marca nos 5 km.')).not.toBeNull()
    await first.ui.click(screen.getByRole('button', { name: 'Registrar 5 km' }))
    expect(first.onAdd).toHaveBeenCalled()
    cleanup()
    open('outra', { [path('outra')]: { items: [run({ id: 9, distance_m: 7000, standard_distance_km: null, duration_s: sec('40:00'), counts_for_ranking: false, pace_s_per_km: 343 })], next_cursor: null } }, { onAdd: undefined })
    const dialog = screen.getByRole('dialog', { name: 'Outras distâncias' })
    expect(await within(dialog).findByText('40:00')).not.toBeNull()
    expect(dialog.textContent).toContain('Ficam só aqui, sem ranking.')
    expect(dialog.textContent).toContain('7 km')
    expect(dialog.textContent).not.toContain('fora das 52 semanas') // sem distância padrão
    cleanup()
    open('outra', { [path('outra')]: { items: [], next_cursor: null } }, { onAdd: undefined })
    expect(await screen.findByText('Nenhuma marca fora das cinco distâncias.')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /^Registrar/ })).toBeNull()
  })

  it('erro de leitura oferece tentar de novo; Esc fecha a folha', async () => {
    const { ui, onClose } = open('5', { [path('5')]: apiError(503, 'Serviço indisponível.') })
    expect((await screen.findByRole('alert')).textContent).toContain('Serviço indisponível.')
    await ui.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})

describe('placa da corrida (K2 + K4 na PlayPage)', () => {
  function renderPlay(routes: Parameters<typeof mockApi>[0], profiles: Profile[] = [football, running]) {
    const api = mockApi({ 'GET /me/standings': standings(), ...routes })
    const go = vi.fn()
    const onExpired = vi.fn()
    render(<PlayPage profiles={profiles} cities={[brasilia]} loading={false} board={idleBoard()} go={go} onExpired={onExpired} />)
    return { api, go, onExpired, ui: userEvent.setup() }
  }
  const openRunning = async (ui: ReturnType<typeof userEvent.setup>) => { await ui.click(screen.getByRole('tab', { name: 'Corrida' })) }
  const tierLine = () => document.querySelector('[data-slot="tier-line"]') as HTMLElement | null
  const runButton = () => screen.getByRole('button', { name: 'Registrar treino ou prova' }) as HTMLButtonElement

  it('o elo e o melhor tempo da distância escolhida vêm de run-bests, com a origem', async () => {
    const { ui } = renderPlay({ 'GET /me/run-bests': bests(markCard(5, ['25:00', '24:12']), markCard(10, ['52:40'], { tier: 'prata', best: { ...markCard(10, ['52:40']).best!, origin: lago } })) })
    await openRunning(ui)
    await waitFor(() => expect(tierLine()?.textContent).toContain('Ouro nos 5 km'))
    expect(tierLine()?.textContent).toContain('Melhor 24:12 · treino')
    expect(tierLine()?.querySelector('[data-slot="tier-emblem"]')?.getAttribute('src')).toBe('/images/brand/ouro.svg')
    await ui.click(screen.getByRole('button', { name: '10 km' }))
    expect(tierLine()?.textContent).toContain('Prata nos 10 km')
    expect(tierLine()?.textContent).toContain('Melhor 52:40 · Corrida do Lago')
    await ui.click(screen.getByRole('button', { name: '3 km' }))
    expect(tierLine()?.textContent).toContain('Sem marca nos 3 km')
    expect(tierLine()?.textContent).toContain('Registre um treino ou prova para entrar no ranking')
    expect(tierLine()?.querySelector('[data-slot="tier-emblem"]')).toBeNull()
    expect(screen.getByRole('region', { name: 'Suas marcas' })).not.toBeNull()
    expect(screen.queryByText(/chega numa próxima etapa/)).toBeNull()
  })

  it('runBestLine: sem cartão ou sem marca, nunca há elo; com marca, "Melhor … · origem"', () => {
    expect(runBestLine([], 5)).toEqual({ kind: 'no-mark', title: 'Sem marca nos 5 km', detail: 'Registre um treino ou prova para entrar no ranking' })
    expect(runBestLine([emptyCard(5)], 5)).toMatchObject({ kind: 'no-mark' })
    // Elo no cartão, mas sem marcas: não se atribui elo.
    expect(runBestLine([{ ...emptyCard(5), tier: 'ouro' }], 5)).toMatchObject({ kind: 'no-mark' })
    expect(runBestLine(bests(markCard(21, ['1:49:30'])).items, 21)).toEqual({ kind: 'ranked', tier: 'ouro', title: 'Ouro nos 21 km', detail: 'Melhor 1:49:30 · treino', levels: 'qualquer nível' })
  })

  it('REGISTRAR abre o cronômetro na distância da placa; salvar mostra a confirmação, atualiza o elo e a série', async () => {
    let saved = false
    const result = created({
      run: run({ id: 5, duration_s: sec('23:48'), pace_s_per_km: 286 }),
      impact: impact({ kind: 'novo_melhor', previous_best_s: sec('24:12'), delta_s: -24, tier_before: 'ouro', tier_after: 'diamante', tier_up: true }),
      best: markCard(5, ['24:12', '23:48'], { tier: 'diamante' }),
    })
    const { api, ui } = renderPlay({
      'GET /me/run-bests': () => (saved ? bests(markCard(5, ['24:12', '23:48'], { tier: 'diamante' })) : bests(markCard(5, ['24:12']))),
      'POST /me/runs/preview': preview({ duration_s: sec('23:48'), impact: result.impact }),
      'POST /me/runs': () => { saved = true; return reply(201, result) },
    })
    await openRunning(ui)
    await waitFor(() => expect(tierLine()?.textContent).toContain('Melhor 24:12'))
    await ui.click(screen.getByRole('button', { name: '5 km' }))
    await ui.click(runButton())
    const dialog = await screen.findByRole('dialog', { name: 'Registrar corrida' })
    expect(within(dialog).getByRole('button', { name: '5 km' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Minutos' }), { target: { value: '23' } })
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Segundos' }), { target: { value: '48' } })
    expect(await within(dialog).findByText('Novo melhor tempo · −0:24')).not.toBeNull()
    await ui.click(within(dialog).getByRole('button', { name: 'Salvar corrida' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Registrar corrida' })).toBeNull())
    const card = await screen.findByText('Novo melhor tempo · 5 km')
    expect(card.closest('[data-slot="run-saved"]')?.textContent).toContain('23:48 · 4:46/km · treino')
    expect(card.closest('[data-slot="run-saved"]')?.textContent).toContain('Sobe para Diamante nos 5 km.')
    // A placa e o cartão releem run-bests, sem recarregar a página.
    await waitFor(() => expect(tierLine()?.textContent).toContain('Diamante nos 5 km'))
    expect(tierLine()?.textContent).toContain('Melhor 23:48 · treino')
    expect(document.querySelector('[data-slot="run-mark"][data-distance="5"]')?.textContent).toContain('23:48')
    expect(api.find('GET', '/me/run-bests').length).toBeGreaterThanOrEqual(2)
    // O aviso sai com o toque em dispensar.
    await ui.click(screen.getByRole('button', { name: 'Dispensar aviso' }))
    expect(screen.queryByText('Novo melhor tempo · 5 km')).toBeNull()
  })

  it('o "+" do cartão abre o cronômetro naquela distância e salvar uma marca de 7 km só entra no histórico', async () => {
    const result = created({ run: run({ id: 8, distance_m: 7000, standard_distance_km: null, duration_s: sec('40:00'), pace_s_per_km: 343 }),
      impact: impact({ kind: 'fora_do_ranking', tier_after: null }), best: null })
    const { ui } = renderPlay({
      'GET /me/run-bests': bests(),
      'POST /me/runs/preview': preview({ distance_m: 7000, standard_distance_km: null, impact: result.impact }),
      'POST /me/runs': reply(201, result),
    })
    await openRunning(ui)
    await ui.click(await screen.findByRole('button', { name: 'Registrar 21 km' }))
    const dialog = await screen.findByRole('dialog', { name: 'Registrar corrida' })
    expect(within(dialog).getByRole('button', { name: '21 km' }).getAttribute('aria-pressed')).toBe('true')
    await ui.click(within(dialog).getByRole('button', { name: 'Outra' }))
    await ui.type(within(dialog).getByLabelText('Distância em metros'), '7000')
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Minutos' }), { target: { value: '40' } })
    expect(await within(dialog).findByText('Fica só no histórico')).not.toBeNull()
    await ui.click(within(dialog).getByRole('button', { name: 'Salvar corrida' }))
    const card = await screen.findByText('Corrida registrada · 7 km')
    expect(card.closest('[data-slot="run-saved"]')?.textContent).toContain('Fica só no histórico.')
    // Distância fora das cinco: a placa continua na distância escolhida antes.
    expect(screen.getByRole('button', { name: '5 km' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('Esc fecha o cronômetro e o foco volta a quem abriu: REGISTRAR ou o "+" do cartão', async () => {
    const { ui } = renderPlay({ 'GET /me/run-bests': bests() })
    await openRunning(ui)
    await ui.click(runButton())
    await screen.findByRole('dialog', { name: 'Registrar corrida' })
    await ui.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Registrar corrida' })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(runButton()))
    const plus = await screen.findByRole('button', { name: 'Registrar 10 km' })
    await ui.click(plus)
    expect(within(await screen.findByRole('dialog', { name: 'Registrar corrida' })).getByRole('button', { name: '10 km' }).getAttribute('aria-pressed')).toBe('true')
    await ui.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(document.activeElement).toBe(plus))
  })

  it('sessão expirada ao reler as marcas depois de salvar chama onExpired', async () => {
    let reads = 0
    const { onExpired, ui } = renderPlay({
      'GET /me/run-bests': () => (++reads > 1 ? apiError(401, 'Entre na sua conta para continuar.') : bests()),
      'POST /me/runs/preview': preview(),
      'POST /me/runs': reply(201, created()),
    })
    await openRunning(ui)
    await ui.click(runButton())
    const dialog = await screen.findByRole('dialog', { name: 'Registrar corrida' })
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Minutos' }), { target: { value: '24' } })
    await within(dialog).findByText('Primeira marca nos 5 km')
    await ui.click(within(dialog).getByRole('button', { name: 'Salvar corrida' }))
    await waitFor(() => expect(onExpired).toHaveBeenCalled())
  })

  it('tocar no cartão abre o histórico e remover relê as marcas', async () => {
    let removed = false
    const { api, ui } = renderPlay({
      'GET /me/run-bests': () => (removed ? bests() : bests(markCard(5, ['24:12']))),
      'GET /me/runs?distance=5&limit=20': { items: [run({ id: 4 })], next_cursor: null },
      'DELETE /me/runs/4': () => { removed = true; return undefined },
    })
    await openRunning(ui)
    await ui.click(await screen.findByRole('button', { name: 'Histórico dos 5 km' }))
    const sheet = await screen.findByRole('dialog', { name: 'Histórico dos 5 km' })
    await ui.click(await within(sheet).findByRole('button', { name: /^Remover a marca de 24:12/ }))
    await ui.click(within(sheet).getByRole('button', { name: 'Remover marca' }))
    await waitFor(() => expect(tierLine()?.textContent).toContain('Sem marca nos 5 km'))
    expect(api.find('DELETE', '/me/runs/4')).toHaveLength(1)
    await ui.click(within(sheet).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog', { name: 'Histórico dos 5 km' })).toBeNull()
  })

  it('sem perfil de corrida a placa leva a preparar o perfil e não mostra marcas; "Ver provas" abre a lista', async () => {
    const { go, ui } = renderPlay({ 'GET /me/run-bests': bests() }, [football])
    await openRunning(ui)
    expect(screen.getByRole('button', { name: 'Preparar perfil de Corrida' })).not.toBeNull()
    expect(screen.queryByRole('region', { name: 'Suas marcas' })).toBeNull()
    cleanup()
    const second = renderPlay({ 'GET /me/run-bests': bests(), 'GET /me/run-races': { items: [] } })
    await openRunning(second.ui)
    await second.ui.click(runButton())
    await second.ui.click(await screen.findByRole('button', { name: 'Prova do Arena' }))
    await second.ui.click(await screen.findByRole('button', { name: 'Ver provas' }))
    expect(second.go).toHaveBeenCalledWith('events', { sport: 'corrida' })
    expect(screen.queryByRole('dialog', { name: 'Registrar corrida' })).toBeNull()
    expect(go).not.toHaveBeenCalled()
  })

  it('"Ver ranking" leva o Ranking à corrida e à distância escolhida na placa', async () => {
    const { go, ui } = renderPlay({ 'GET /me/run-bests': bests(markCard(10, ['52:40'], { tier: 'prata' })) })
    await openRunning(ui)
    await ui.click(screen.getByRole('button', { name: '10 km' }))
    await ui.click(await screen.findByRole('button', { name: 'Ver ranking' }))
    expect(go).toHaveBeenCalledExactlyOnceWith('ranking', { sport: 'corrida', distance: 10 })
  })

  it('erro ao ler as marcas: o alerta oferece tentar de novo e o botão REGISTRAR continua disponível', async () => {
    const { ui } = renderPlay({ 'GET /me/run-bests': apiError(503, 'Serviço indisponível.') })
    await openRunning(ui)
    expect((await screen.findAllByRole('alert')).map(item => item.textContent).join(' ')).toContain('Serviço indisponível.')
    expect(runButton().disabled).toBe(false)
    expect(screen.queryByText('Sem marca nos 5 km')).toBeNull() // sem leitura, nada de "sem marca"
  })
})


describe('"Ver ranking" no aplicativo inteiro', () => {
  const me: User = { id: 1, name: 'Ricardo Leão', username: 'ricardo.leao', email: 'r@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }

  it('abre o Ranking já na corrida e na distância da placa, com a lista daquela distância', async () => {
    Element.prototype.scrollTo = () => {}
    const tenKm = '/rankings?sport=corrida&distance_km=10&limit=20'
    const api = mockApi({
      'GET /me/sports-profiles': [football, running],
      'GET /cities': [brasilia],
      'GET /me/notifications/summary': summaryOf({ unread_count: 0 }),
      'GET /me/standings': standings(),
      'GET /me/play': playBoard(),
      'GET /me/run-bests': bests(markCard(10, ['52:40'], { tier: 'prata' })),
      [`GET ${tenKm}`]: rankingPage({
        ranking: 'corrida_10', format: null, distance_km: 10, required: 1, classified_count: 1, legend_slots: 0,
        items: [athleteRow(1, 40, 'Ana Souza', { metric_value: 3160, tier: 'prata', matches_played: 1, wins: 0, draws: 0, losses: 0 })],
      }),
    })
    render(<ArenaPage user={me} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} />)
    const ui = userEvent.setup()
    await ui.click(await screen.findByRole('button', { name: 'JOGAR' }))
    await ui.click(await screen.findByRole('tab', { name: 'Corrida' }))
    await ui.click(screen.getByRole('button', { name: '10 km' }))
    await ui.click(await screen.findByRole('button', { name: 'Ver ranking' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ranking' })).not.toBeNull()
    expect(await screen.findByText('Ana Souza')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Corrida' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '10 km' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '5 km' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Futebol' }).getAttribute('aria-pressed')).toBe('false')
    expect(within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { current: 'page' }).textContent).toBe('Ranking')
    // A primeira leitura do Ranking já é a da corrida; o futebol nem chega a ser pedido.
    expect(api.calls.filter(call => call.path.startsWith('/rankings')).map(call => call.path)).toEqual([tenKm])
  })
})

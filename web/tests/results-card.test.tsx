import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Lineup, ResultMatch } from '../src/api/results'
import { MatchResultCard } from '../src/components/results/MatchResultCard'
import { formatDeadline } from '../src/utils/format'
import {
  acting, asFerrugem, caio, confirmed, football, ferrugem, hiddenReport, inHours, leoes, lineup, permissions, preview, rafa, report, result, stat, tennis,
  tiago, walkover,
} from './results-fixtures'
import { apiError, mockApi } from './teams-fixtures'
import { findToast, renderWithToaster, toastRegion } from './toast-utils'

afterEach(cleanup)

type Routes = Parameters<typeof mockApi>[0]

/** Monta o cartão com o `fetch` simulado; a leitura do elenco (`/stats`) responde `lineups`. */
function setup(match: ResultMatch, routes: Routes = {}, { viewerId = 11, lineups = [] as Lineup[], walkoverActions = undefined as React.ReactNode } = {}) {
  const api = mockApi({ [`GET /matches/${match.id}/stats`]: { items: lineups }, ...routes })
  const onChanged = vi.fn()
  const onOpenChat = vi.fn()
  const onExpired = vi.fn()
  const view = renderWithToaster(
    <MatchResultCard match={match} viewerId={viewerId} onChanged={onChanged} onOpenChat={onOpenChat} onExpired={onExpired} walkoverActions={walkoverActions} />,
  )
  return { api, onChanged, onOpenChat, onExpired, ...view }
}
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const spin = (name: string) => screen.getByRole('spinbutton', { name })
const body = (api: ReturnType<typeof mockApi>, method: string, path: string) => api.find(method, path)[0]?.body

describe('Informe o placar (futebol)', () => {
  it('acesso histórico mostra as estatísticas próprias sem oferecer revisão de elenco', async () => {
    setup(football({ my_role: 'historico', state: 'encerrada', result: confirmed(3, 1, null), permissions: permissions() }), {},
      { lineups: [lineup(caio, { side: 'a', present: true, stat: stat({ goals: 1 }), points: preview() })] })
    await screen.findByText('Suas estatísticas')
    expect(screen.queryByRole('button', { name: /Elenco e estatísticas/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Enviar estatísticas/ })).toBeNull()
  })
  it('não renderiza nada antes do início da partida (sem resultado)', () => {
    const { container, api } = setup(football({ result: null, permissions: permissions() }))
    expect(container.querySelector('[data-slot="match-result"]')).toBeNull()
    expect(api.calls).toHaveLength(0)
  })

  it('mostra o meu lado à esquerda, soma com os botões e envia os gols do lado A', async () => {
    const sent = football({ result: result({ reports: { a: report('a', 2, 1), b: null } }) })
    const { api, onChanged } = setup(football(), { 'PUT /matches/7/result': sent })
    const ui = userEvent.setup()
    expect(screen.getByRole('heading', { name: 'Informe o placar' })).not.toBeNull()
    await ui.click(button('Mais gols do Leões do Cerrado'))
    await ui.click(button('Mais gols do Leões do Cerrado'))
    await ui.click(button('Mais gols do Ferrugem FC'))
    expect(spin('Gols do Leões do Cerrado').getAttribute('aria-valuenow')).toBe('2')
    await ui.click(button('Enviar placar'))
    expect(body(api, 'PUT', '/matches/7/result')).toEqual({ goals_a: 2, goals_b: 1 })
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(sent))
    expect(toastRegion().getAttribute('aria-live')).toBe('polite')
    expect(await findToast('Placar enviado. Falta o outro lado.')).toBeTruthy()
  })

  it.each([
    ['confirmado', football({ result: confirmed(1, 0, 3) }), 'Placar confirmado pelos dois lados', 'success'],
    ['divergente', football({ result: result({ state: 'divergente', reports: { a: report('a', 1, 0), b: report('b', 0, 1) } }) }), 'Placar enviado. Os placares não bateram.', 'warning'],
    ['aguardando', football({ result: result({ reports: { a: report('a', 1, 0), b: null } }) }), 'Placar enviado. Falta o outro lado.', 'success'],
  ])('o envio %s mostra o toast no tom certo (a divergência é aviso)', async (_state, sent, text, tone) => {
    setup(football(), { 'PUT /matches/7/result': football({ ...sent }) })
    const ui = userEvent.setup()
    await ui.click(button('Mais gols do Leões do Cerrado'))
    await ui.click(button('Enviar placar'))
    expect((await findToast(text)).closest('[data-tone]')?.getAttribute('data-tone')).toBe(tone)
  })

  it('o lado B troca os gols: o placar enviado é sempre A × B da partida', async () => {
    const { api } = setup(asFerrugem(), { 'PUT /matches/7/result': asFerrugem() })
    const ui = userEvent.setup()
    await ui.click(button('Mais gols do Ferrugem FC'))
    await ui.click(button('Mais gols do Ferrugem FC'))
    await ui.click(button('Mais gols do Leões do Cerrado'))
    await ui.click(button('Enviar placar'))
    expect(body(api, 'PUT', '/matches/7/result')).toEqual({ goals_a: 1, goals_b: 2 })
  })

  it('os contadores respondem às setas, a Home e End, e respeitam os limites', async () => {
    setup(football())
    const ui = userEvent.setup()
    await ui.click(spin('Gols do Leões do Cerrado'))
    await ui.keyboard('{ArrowUp}{ArrowUp}{ArrowRight}{ArrowDown}')
    expect(spin('Gols do Leões do Cerrado').getAttribute('aria-valuenow')).toBe('2')
    await ui.keyboard('{End}')
    expect(spin('Gols do Leões do Cerrado').getAttribute('aria-valuenow')).toBe('99')
    expect(button('Mais gols do Leões do Cerrado')).toHaveProperty('disabled', true)
    await ui.keyboard('{Home}{ArrowDown}')
    expect(spin('Gols do Leões do Cerrado').getAttribute('aria-valuenow')).toBe('0')
    expect(button('Menos gols do Leões do Cerrado')).toHaveProperty('disabled', true)
  })

  it('mostra o erro do servidor sem perder o placar digitado', async () => {
    const { api } = setup(football(), { 'PUT /matches/7/result': apiError(409, 'O placar já foi confirmado pelos dois lados.') })
    const ui = userEvent.setup()
    await ui.click(button('Mais gols do Leões do Cerrado'))
    await ui.click(button('Enviar placar'))
    expect(await findToast('O placar já foi confirmado pelos dois lados.')).toBeTruthy()
    expect(spin('Gols do Leões do Cerrado').getAttribute('aria-valuenow')).toBe('1')
    expect(api.find('PUT', '/matches/7/result')).toHaveLength(1)
  })

  it('avisa que o outro lado já informou, sem mostrar o placar dele', () => {
    setup(football({ result: result({ reports: { a: null, b: hiddenReport('b') } }) }))
    expect(screen.getByText(/Ferrugem FC já informou o placar/)).not.toBeNull()
    expect(screen.queryByText('1 × 1')).toBeNull()
  })
})

describe('Placar do tênis', () => {
  const fill = async (ui: ReturnType<typeof userEvent.setup>, values: Record<string, number>) => {
    for (const [name, value] of Object.entries(values)) {
      await ui.click(spin(name))
      await ui.keyboard('{ArrowUp}'.repeat(value))
    }
  }

  it('recusa sets inválidos com a mensagem do servidor, sem enviar', async () => {
    const { api } = setup(tennis())
    const ui = userEvent.setup()
    await ui.click(button('Enviar placar'))
    expect((await screen.findByRole('alert')).textContent).toBe('O 1º set precisa terminar em 6-0 a 6-4, 7-5 ou 7-6.')
    await fill(ui, { 'Games seus no set 1': 6, 'Games de Beatriz Lima no set 1': 5, 'Games seus no set 2': 6, 'Games de Beatriz Lima no set 2': 4 })
    await ui.click(button('Enviar placar'))
    expect(screen.getByRole('alert').textContent).toBe('O 1º set precisa terminar em 6-0 a 6-4, 7-5 ou 7-6.')
    expect(api.find('PUT', '/matches/8/result')).toHaveLength(0)
  })

  it('com sets divididos pede o super tie-break combinado e envia os pontos no lugar do 3º set', async () => {
    const sent = tennis({ result: result({ reports: { a: report('a', 2, 1, { winner: 'a' }), b: null } }) })
    const { api, onChanged } = setup(tennis({ super_tiebreak: true }), { 'PUT /matches/8/result': sent })
    const ui = userEvent.setup()
    await fill(ui, { 'Games seus no set 1': 6, 'Games de Beatriz Lima no set 1': 4, 'Games seus no set 2': 3, 'Games de Beatriz Lima no set 2': 6 })
    expect(screen.getByRole('group', { name: 'Super tie-break' })).not.toBeNull()
    expect(screen.getByText(/super tie-break até 10, com 2 de vantagem/)).not.toBeNull()
    await fill(ui, { 'Pontos seus no super tie-break': 9, 'Pontos de Beatriz Lima no super tie-break': 8 })
    await ui.click(button('Enviar placar'))
    expect(screen.getByRole('alert').textContent).toBe('O super tie-break vai a 10 pontos, com 2 de vantagem.')
    expect(api.find('PUT', '/matches/8/result')).toHaveLength(0)
    await ui.click(button('Mais pontos seus no super tie-break'))
    await ui.click(button('Mais pontos de Beatriz Lima no super tie-break'))
    await ui.click(button('Menos pontos de Beatriz Lima no super tie-break'))
    await ui.click(button('Enviar placar'))
    expect(body(api, 'PUT', '/matches/8/result')).toEqual({ sets: [{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 10, b: 8 }] })
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(sent))
  })

  it('o 3º set só aparece com os dois primeiros divididos e, sem super tie-break, é um set comum', async () => {
    setup(tennis())
    const ui = userEvent.setup()
    await fill(ui, { 'Games seus no set 1': 6, 'Games de Beatriz Lima no set 1': 4, 'Games seus no set 2': 6, 'Games de Beatriz Lima no set 2': 2 })
    expect(screen.queryByRole('group', { name: 'Set 3' })).toBeNull()
    expect(screen.getByText(/já ganhou a partida/)).not.toBeNull()
    await ui.click(spin('Games de Beatriz Lima no set 2'))
    await ui.keyboard('{End}')
    expect(screen.getByRole('group', { name: 'Set 3' })).not.toBeNull()
    expect(screen.queryByRole('group', { name: 'Super tie-break' })).toBeNull()
  })

  it('o set de 7-6 pede o tie-break do vencedor e o envia dentro do set', async () => {
    const { api } = setup(tennis(), { 'PUT /matches/8/result': tennis() })
    const ui = userEvent.setup()
    await fill(ui, { 'Games seus no set 1': 7, 'Games de Beatriz Lima no set 1': 6, 'Games seus no set 2': 6, 'Games de Beatriz Lima no set 2': 3 })
    await fill(ui, { 'Pontos seus no tie-break do set 1': 5, 'Pontos de Beatriz Lima no tie-break do set 1': 7 })
    await ui.click(button('Enviar placar'))
    expect(screen.getByRole('alert').textContent).toBe('O tie-break do 1º set vai a 7 pontos, com 2 de vantagem, e é de quem venceu o set.')
    await fill(ui, { 'Pontos seus no tie-break do set 1': 4 })
    await ui.click(button('Enviar placar'))
    expect(body(api, 'PUT', '/matches/8/result')).toEqual({ sets: [{ a: 7, b: 6, tiebreak: { a: 9, b: 7 } }, { a: 6, b: 3 }] })
  })

  it('o lado B informa os sets do ponto de vista dele e a API recebe A × B', async () => {
    const asBeatriz = tennis({ my_side: 'b', sides: [{ ...tennis().sides[0], is_mine: false }, { ...tennis().sides[1], is_mine: true }] })
    const { api } = setup(asBeatriz, { 'PUT /matches/8/result': asBeatriz })
    const ui = userEvent.setup()
    await fill(ui, { 'Games seus no set 1': 6, 'Games de Ana Souza no set 1': 3, 'Games seus no set 2': 6, 'Games de Ana Souza no set 2': 1 })
    await ui.click(button('Enviar placar'))
    expect(body(api, 'PUT', '/matches/8/result')).toEqual({ sets: [{ a: 3, b: 6 }, { a: 1, b: 6 }] })
  })
})

describe('Estados do cartão S1', () => {
  it('aguardando: anel com as horas até o prazo, o prazo por extenso e "Corrigir o meu"', async () => {
    const deadline = inHours(41)
    setup(football({ result: result({ deadline, reports: { a: report('a', 3, 1), b: null } }) }))
    const card = document.querySelector('[data-slot="status-card"]') as HTMLElement
    expect(card.getAttribute('data-tone')).toBe('aguardando')
    expect(within(card).getByText('Aguardando Ferrugem FC')).not.toBeNull()
    expect(card.querySelector('[data-slot="deadline-ring"]')?.textContent).toContain('41 horas restantes')
    expect(card.textContent).toContain('Vocês informaram 3 × 1')
    expect(card.textContent).toContain(`Fecha ${formatDeadline(deadline)}`)
    expect(within(card).queryByRole('button', { name: 'Conversar' })).toBeNull()

    const ui = userEvent.setup()
    await ui.click(within(card).getByRole('button', { name: 'Corrigir o meu' }))
    expect(screen.getByRole('heading', { name: 'Corrigir o meu placar' })).not.toBeNull()
    expect(spin('Gols do Leões do Cerrado').getAttribute('aria-valuenow')).toBe('3')
    expect(spin('Gols do Ferrugem FC').getAttribute('aria-valuenow')).toBe('1')
    await ui.click(button('Cancelar'))
    expect(screen.getByText('Aguardando Ferrugem FC')).not.toBeNull()
  })

  it('confirmado: selo menta e a pílula "+3 pts" só para quem pontuou', () => {
    setup(football({ result: confirmed(3, 1, 3), permissions: permissions() }))
    const card = document.querySelector('[data-slot="status-card"]') as HTMLElement
    expect(card.getAttribute('data-tone')).toBe('confirmado')
    expect(card.textContent).toContain('Placar confirmado · 3 × 1')
    expect(card.textContent).toContain('Os dois lados informaram o mesmo resultado.')
    expect(within(card).getByText('+3 pts')).not.toBeNull()
    cleanup()
    setup(asFerrugem({ result: confirmed(3, 1, 0), permissions: permissions() }))
    expect(screen.getByText('Placar confirmado · 1 × 3')).not.toBeNull()
    expect(screen.getByText('0 pts')).not.toBeNull()
    cleanup()
    setup(football({ result: confirmed(3, 1, null), permissions: permissions() }))
    expect(screen.queryByText(/pts/)).toBeNull()
  })

  it('confirmado por W.O., pela administração ou pelo organizador explica a origem', () => {
    setup(football({ result: confirmed(3, 0, 3, { source: 'wo' }), permissions: permissions() }))
    expect(screen.getByText('W.O. valendo · 3 × 0')).not.toBeNull()
    cleanup()
    setup(football({ result: confirmed(3, 0, 3, { source: 'administracao', decision_reason: 'Provas conferidas.' }), permissions: permissions() }))
    expect(screen.getByText(/A administração decidiu o resultado\. Provas conferidas\./)).not.toBeNull()
    cleanup()
    setup(football({ result: confirmed(1, 0, 3, { source: 'organizador' }), permissions: permissions() }))
    expect(screen.getByText(/O organizador decidiu o resultado/)).not.toBeNull()
  })

  it('divergente: ≠, os dois placares, "Corrigir o meu" e "Conversar"', async () => {
    const { onOpenChat } = setup(football({ result: result({ state: 'divergente', reports: { a: report('a', 3, 1), b: report('b', 1, 1) } }) }))
    const card = document.querySelector('[data-slot="status-card"]') as HTMLElement
    expect(card.getAttribute('data-tone')).toBe('divergente')
    expect(within(card).getByText('Placares diferentes')).not.toBeNull()
    expect(card.textContent).toContain('3 × 1')
    expect(card.textContent).toContain('1 × 1')
    expect(card.textContent).toContain('Vocês informaram 3 × 1')
    expect(card.textContent).toContain('Ferrugem FC informou 1 × 1')
    const ui = userEvent.setup()
    await ui.click(within(card).getByRole('button', { name: 'Conversar' }))
    expect(onOpenChat).toHaveBeenCalledTimes(1)
    await ui.click(within(card).getByRole('button', { name: 'Corrigir o meu' }))
    expect(screen.getByRole('heading', { name: 'Corrigir o meu placar' })).not.toBeNull()
  })

  it('divergente do lado B lê os dois placares do ponto de vista de quem vê', () => {
    setup(asFerrugem({ result: result({ state: 'divergente', reports: { a: report('a', 3, 1), b: report('b', 1, 1) } }) }))
    const card = document.querySelector('[data-slot="status-card"]') as HTMLElement
    const text = card.textContent!
    expect(text.indexOf('1 × 1')).toBeGreaterThan(-1)
    expect(text.indexOf('1 × 1')).toBeLessThan(text.indexOf('1 × 3'))
    expect(text).toContain('Leões do Cerrado informou 1 × 3')
  })

  it('sem o chat liberado, a divergência não oferece "Conversar"; sem permissão de placar, não corrige', () => {
    setup(football({ result: result({ state: 'divergente', reports: { a: report('a', 3, 1), b: report('b', 1, 1) } }), permissions: permissions({ read_chat: false }) }))
    expect(screen.queryByRole('button', { name: 'Conversar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Corrigir o meu' })).toBeNull()
  })

  it('quem não informa o placar vê só o andamento', () => {
    setup(football({ my_role: 'membro', permissions: permissions({ send_stats: true }) }), {}, { viewerId: 12, lineups: [lineup(tiago)] })
    expect(screen.getByText('Aguardando o placar')).not.toBeNull()
    expect(screen.getByText(/Os representantes informam o placar até/)).not.toBeNull()
    expect(screen.queryByRole('heading', { name: 'Informe o placar' })).toBeNull()
    cleanup()
    setup(football({ my_role: 'membro', permissions: permissions(), result: result({ reports: { a: null, b: hiddenReport('b') } }) }))
    expect(screen.getByText(/Ferrugem FC já informou o placar/)).not.toBeNull()
  })

  it('sem resultado: placares que não bateram, ninguém informou ou W.O. anulado', () => {
    setup(football({ state: 'sem_resultado', result: result({ state: 'sem_resultado', reports: { a: report('a', 3, 1), b: report('b', 1, 1) } }), permissions: permissions() }))
    expect(screen.getByText('Partida sem resultado')).not.toBeNull()
    expect(screen.getByText(/Os placares não bateram até/)).not.toBeNull()
    cleanup()
    setup(football({ state: 'sem_resultado', result: result({ state: 'sem_resultado' }), permissions: permissions() }))
    expect(screen.getByText(/Ninguém concluiu o placar até/)).not.toBeNull()
    cleanup()
    setup(football({ state: 'sem_resultado', result: result({ state: 'sem_resultado' }), walkover: walkover({ decision: 'anulado', decision_reason: 'Houve jogo.' }), permissions: permissions() }))
    expect(screen.getByText(/A administração anulou o W\.O\. Motivo: “Houve jogo\.” A partida não pontua\./)).not.toBeNull()
  })

  it('prazo encerrado: não oferece mais envio nem correção', () => {
    setup(football({ result: result({ deadline: inHours(-1), reports: { a: report('a', 3, 1), b: null } }), permissions: permissions() }))
    expect(screen.getByText('Prazo encerrado')).not.toBeNull()
    expect(document.querySelector('[data-slot="deadline-ring"]')).toBeNull()
    cleanup()
    setup(football({ result: result({ state: 'divergente', deadline: inHours(-1), reports: { a: report('a', 3, 1), b: report('b', 1, 1) } }), permissions: permissions() }))
    expect(screen.getByText(/Sem acordo até .*: a partida fica sem resultado e não pontua\./)).not.toBeNull()
  })

  it('W.O. registrado: contra o lado ausente, com a contestação até o prazo e os botões da tela da partida', () => {
    const actions = <button type="button">Contestar W.O.</button>
    setup(asFerrugem({ result: result({ state: 'wo_registrado' }), walkover: walkover(), permissions: permissions({ contest_walkover: true }) }), {}, { walkoverActions: actions })
    expect(screen.getByText('W.O. registrado contra o seu lado')).not.toBeNull()
    expect(screen.getByText(/Caio Ramos registrou que vocês não compareceram\. Se compareceram, conteste até/)).not.toBeNull()
    expect(button('Contestar W.O.')).not.toBeNull()
    cleanup()
    setup(football({ result: result({ state: 'wo_registrado' }), walkover: walkover(), permissions: permissions() }))
    expect(screen.getByText('W.O. registrado contra Ferrugem FC')).not.toBeNull()
    expect(screen.getByText('3 × 0')).not.toBeNull()
    expect(screen.getByText(/se Ferrugem FC não contestar até/)).not.toBeNull()
  })

  it('W.O. contestado: o motivo e a decisão da administração', () => {
    setup(football({
      result: result({ state: 'wo_contestado' }), permissions: permissions(),
      walkover: walkover({ contested_by: rafa, contested_at: '2026-10-12T16:00:00Z', contest_reason: 'Estávamos na quadra.' }),
    }))
    expect(screen.getByText('W.O. contestado')).not.toBeNull()
    expect(screen.getByText(/Rafa Nunes contestou o W\.O\.: “Estávamos na quadra\.” A administração decide/)).not.toBeNull()
  })
})

describe('Suas estatísticas (RN10, RN12, RN13)', () => {
  const member = () => football({ my_role: 'membro', permissions: permissions({ send_stats: true }), result: result({ reports: { a: report('a', 3, 1), b: null } }) })

  it('mostra a posição do elenco, atualiza a prévia ao mexer e envia zeros como campo vazio', async () => {
    const saved = { lineup: lineup(tiago, { present: true, stat: stat({ goals: 2, assists: 1, position_stat: 4 }), points: preview({ total: 9 }) }), preview: preview({ total: 9 }) }
    const { api, onChanged } = setup(member(), { 'PUT /matches/7/my-stats': saved }, { viewerId: 12, lineups: [lineup(tiago)] })
    const ui = userEvent.setup()
    expect(await screen.findByRole('heading', { name: 'Suas estatísticas' })).not.toBeNull()
    expect(screen.getByRole('radio', { name: 'Atacante' }).getAttribute('aria-checked')).toBe('true')
    const previewBox = () => document.querySelector('[data-slot="points-preview"]')!.textContent!
    expect(previewBox()).toContain('4 pts')
    expect(previewBox()).toContain('1 presença + 3 vitória')
    await ui.click(button('Mais gols'))
    await ui.click(button('Mais gols'))
    await ui.click(button('Mais assistências'))
    for (let i = 0; i < 4; i++) await ui.click(button('Mais finalizações no alvo'))
    expect(previewBox()).toContain('9 pts')
    expect(previewBox()).toContain('1 presença + 3 vitória + 2 gols + 1 assistência + 2 (finalizações no alvo, até 4)')
    await ui.click(button('Enviar estatísticas'))
    expect(body(api, 'PUT', '/matches/7/my-stats')).toEqual({ position: 'atacante', goals: 2, assists: 1, position_stat: 4 })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(await findToast('Estatísticas enviadas')).toBeTruthy()
    expect(screen.getByText('Enviadas')).not.toBeNull()
    expect(button('Atualizar estatísticas')).toHaveProperty('disabled', true)
  })

  it('só gols: assistências e a estatística da posição vão vazias', async () => {
    const { api } = setup(member(), { 'PUT /matches/7/my-stats': { lineup: lineup(tiago, { present: true, stat: stat() }), preview: preview() } }, { viewerId: 12, lineups: [lineup(tiago, { position: 'goleiro' })] })
    const ui = userEvent.setup()
    await screen.findByRole('heading', { name: 'Suas estatísticas' })
    expect(screen.getByText('Defesas')).not.toBeNull()
    await ui.click(screen.getByRole('radio', { name: 'Defesa' }))
    expect(screen.getByText('Desarmes')).not.toBeNull()
    await ui.click(button('Mais gols'))
    await ui.click(button('Enviar estatísticas'))
    expect(body(api, 'PUT', '/matches/7/my-stats')).toEqual({ position: 'defesa', goals: 1, assists: null, position_stat: null })
  })

  it('sem posição conhecida, só envia depois de escolher; as setas movem a escolha', async () => {
    setup(member(), {}, { viewerId: 12, lineups: [lineup(tiago, { position: null })] })
    const ui = userEvent.setup()
    await screen.findByRole('heading', { name: 'Suas estatísticas' })
    expect(button('Enviar estatísticas')).toHaveProperty('disabled', true)
    await ui.click(screen.getByRole('radio', { name: 'Goleiro' }))
    expect(button('Enviar estatísticas')).toHaveProperty('disabled', false)
    await ui.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Defesa' }).getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Defesa' }))
  })

  it('a prévia do servidor mostra o que já pontua (revisado) e o que depende da revisão', async () => {
    const reviewed = lineup(tiago, { present: true, stat: stat({ state: 'revisada', reviewed_at: '2026-10-12T17:00:00Z' }), points: preview({ counted: ['gols', 'assistencias', 'estatistica_posicao'], final: true }) })
    setup(football({ my_role: 'membro', permissions: permissions({ send_stats: true }), result: confirmed(3, 1, 3) }), {}, { viewerId: 12, lineups: [reviewed] })
    await screen.findByText('Revisadas')
    const text = document.querySelector('[data-slot="points-preview"]')!.textContent!
    expect(text).toContain('Já pontuam: gols, assistências, finalizações no alvo.')
    expect(text).toContain('Pontuação final.')
  })

  it('contestada: somente leitura, com o motivo e o que ainda pontua', async () => {
    const contested = lineup(tiago, {
      present: true, points: preview({ counted: ['assistencias', 'estatistica_posicao'] }),
      stat: stat({ state: 'contestada', contested_by: rafa, contested_at: '2026-10-12T17:00:00Z', contest_reason: 'Foi gol contra.', contested_fields: ['gols'], reviewed_at: '2026-10-12T16:00:00Z' }),
    })
    setup(football({ my_role: 'membro', permissions: permissions(), result: confirmed(3, 1, 3) }), {}, { viewerId: 12, lineups: [contested] })
    await screen.findByText('Contestadas')
    expect(screen.getByText(/Rafa Nunes contestou: “Foi gol contra\.”/)).not.toBeNull()
    expect(screen.queryByRole('button', { name: /estatísticas$/ })).toBeNull()
    expect(screen.getByRole('radio', { name: 'Atacante' })).toHaveProperty('disabled', true)
    expect(document.querySelector('[data-slot="points-preview"]')!.textContent).toContain('Já pontuam: assistências, finalizações no alvo.')
  })

  it('depois da revisão final (pós-contestação), os campos ficam travados mesmo com send_stats', async () => {
    const final = lineup(tiago, {
      present: true, points: preview({ counted: ['gols', 'assistencias', 'estatistica_posicao'] }),
      stat: stat({ state: 'revisada', reviewed_at: '2026-10-12T18:00:00Z', contested_at: '2026-10-12T17:00:00Z', contested_fields: ['gols'], contested_by: rafa }),
    })
    setup(football({ my_role: 'membro', permissions: permissions({ send_stats: true }), result: confirmed(3, 1, 3) }), {}, { viewerId: 12, lineups: [final] })
    await screen.findByText('Revisadas')
    expect(screen.queryByRole('button', { name: /estatísticas$/ })).toBeNull()
    expect(screen.getByRole('radio', { name: 'Atacante' })).toHaveProperty('disabled', true)
    expect(document.querySelector('[data-slot="points-preview"]')!.textContent).toContain('Revisão final do representante do seu time, depois da contestação.')
  })

  it('o representante que marcou a pessoa como ausente vê o aviso', async () => {
    const absent = lineup(tiago, { present: false, stat: stat() })
    setup(football({ my_role: 'membro', permissions: permissions(), result: confirmed(3, 1, 3) }), {}, { viewerId: 12, lineups: [absent] })
    expect((await screen.findByText('O representante marcou que você não jogou. Fale com ele.'))).not.toBeNull()
  })

  it('o tênis não tem estatísticas nem elenco, e não lê o elenco', () => {
    const { api } = setup(tennis({ result: confirmed(2, 0, 10, { final: undefined }) }))
    expect(screen.queryByRole('heading', { name: 'Suas estatísticas' })).toBeNull()
    expect(screen.queryByText('Elenco e estatísticas')).toBeNull()
    expect(api.calls).toHaveLength(0)
  })
})

describe('Revisar elenco', () => {
  const lineups = () => [
    lineup(caio, { present: true, stat: null }),
    lineup(tiago, { present: null }),
    lineup(rafa, { side: 'b', present: true, stat: stat({ id: 71, goals: 2 }), can_contest: true, position: 'atacante' }),
  ]

  it('marca quem jogou e envia só o que mudou, com a posição', async () => {
    const saved = [lineup(caio, { present: true }), lineup(tiago, { present: true }), lineups()[2]]
    const { api, onChanged } = setup(football({ result: confirmed(3, 1, 3) }), { 'PUT /matches/7/attendance': { items: saved } }, { lineups: lineups() })
    const ui = userEvent.setup()
    await ui.click(await screen.findByRole('button', { name: /Elenco e estatísticas/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Quem jogou e estatísticas' })
    expect(within(sheet).getByRole('checkbox', { name: 'Caio Ramos jogou' }).getAttribute('aria-checked')).toBe('true')
    expect(within(sheet).getByRole('checkbox', { name: 'Tiago Melo jogou' }).getAttribute('aria-checked')).toBe('false')
    expect(within(sheet).getByRole('button', { name: 'Salvar presença' })).toHaveProperty('disabled', true)
    await ui.click(within(sheet).getByRole('checkbox', { name: 'Tiago Melo jogou' }))
    await ui.click(within(sheet).getByRole('button', { name: 'Salvar presença' }))
    expect(body(api, 'PUT', '/matches/7/attendance')).toEqual({ athletes: [{ user_id: 12, present: true, position: 'atacante' }] })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(await findToast('Presença registrada')).toBeTruthy()
    expect(within(sheet).getByRole('checkbox', { name: 'Tiago Melo jogou' }).getAttribute('aria-checked')).toBe('true')
  })

  it('pede a posição de quem não tem nenhuma antes de salvar a presença', async () => {
    setup(football({ result: confirmed(3, 1, 3) }), {}, { lineups: [lineup(tiago, { present: null, position: null })] })
    const ui = userEvent.setup()
    await ui.click(await screen.findByRole('button', { name: /Elenco e estatísticas/ }))
    const sheet = await screen.findByRole('dialog')
    await ui.click(within(sheet).getByRole('checkbox', { name: 'Tiago Melo jogou' }))
    expect(within(sheet).getByRole('alert').textContent).toBe('Escolha a posição de quem jogou.')
    expect(within(sheet).getByRole('button', { name: 'Salvar presença' })).toHaveProperty('disabled', true)
    await ui.click(within(sheet).getByRole('radio', { name: 'Meio de campo' }))
    expect(within(sheet).getByRole('button', { name: 'Salvar presença' })).toHaveProperty('disabled', false)
  })

  it('o representante revisa a estatística do próprio time, corrigindo o que estiver errado', async () => {
    const own = lineup(tiago, { present: true, stat: stat({ goals: 2 }), can_review: true })
    const reviewed = { ...own, can_review: true, stat: stat({ goals: 1, state: 'revisada', reviewed_at: '2026-10-12T17:00:00Z' }) }
    const { api, onChanged } = setup(football({ result: confirmed(3, 1, 3) }), { 'PUT /matches/7/stats/70/review': reviewed }, { lineups: [own] })
    const ui = userEvent.setup()
    const row = await screen.findByRole('button', { name: /Elenco e estatísticas/ })
    expect(row.textContent).toContain('1 de 1 que jogaram enviaram · 1 para revisar')
    await ui.click(row)
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByText('2 gols · 1 assistência · 4 finalizações no alvo', { exact: false })).not.toBeNull()
    await ui.click(within(sheet).getByRole('button', { name: 'Revisar' }))
    await ui.click(within(sheet).getByRole('button', { name: 'Menos gols de Tiago Melo' }))
    await ui.click(within(sheet).getByRole('button', { name: 'Aprovar' }))
    expect(body(api, 'PUT', '/matches/7/stats/70/review')).toEqual({ goals: 1 })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(await findToast('Estatísticas revisadas')).toBeTruthy()
    expect(within(sheet).getByText('Revisada')).not.toBeNull()
  })

  it('aprovar sem mexer manda o corpo vazio; depois de contestada, a revisão é final', async () => {
    const contested = lineup(tiago, {
      present: true, can_review: true,
      stat: stat({ state: 'contestada', contested_by: rafa, contested_at: '2026-10-12T17:00:00Z', contested_fields: ['gols', 'estatistica_posicao'], contest_reason: 'Foi gol contra.', reviewed_at: '2026-10-12T16:00:00Z' }),
    })
    const { api } = setup(football({ result: confirmed(3, 1, 3) }), { 'PUT /matches/7/stats/70/review': { ...contested, stat: stat({ state: 'revisada', contested_at: '2026-10-12T17:00:00Z' }) } }, { lineups: [contested] })
    const ui = userEvent.setup()
    await ui.click(await screen.findByRole('button', { name: /Elenco e estatísticas/ }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByText(/Rafa Nunes contestou gols, finalizações no alvo: “Foi gol contra\.” O item contestado só pontua/)).not.toBeNull()
    await ui.click(within(sheet).getByRole('button', { name: 'Revisar de novo' }))
    expect(within(sheet).getByText('Depois de uma contestação, esta revisão é final.')).not.toBeNull()
    await ui.click(within(sheet).getByRole('button', { name: 'Aprovar' }))
    expect(body(api, 'PUT', '/matches/7/stats/70/review')).toEqual({})
    expect(await within(sheet).findByText('Revisão final depois da contestação.')).not.toBeNull()
  })

  it('o representante adversário contesta itens com motivo, uma vez', async () => {
    const contested = { ...lineups()[2], can_contest: false, stat: stat({ id: 71, state: 'contestada', contested_by: caio, contested_at: '2026-10-12T17:00:00Z', contested_fields: ['gols'], contest_reason: 'Foi gol contra.' }) }
    const { api, onChanged } = setup(football({ result: confirmed(3, 1, 3) }), { 'POST /matches/7/stats/71/contest': contested }, { lineups: lineups() })
    const ui = userEvent.setup()
    await ui.click(await screen.findByRole('button', { name: /Elenco e estatísticas/ }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).queryByRole('button', { name: 'Contestar' })).toBeNull()
    await ui.click(within(sheet).getByRole('tab', { name: 'Ferrugem FC' }))
    await ui.click(within(sheet).getByRole('button', { name: 'Contestar' }))
    await ui.click(within(sheet).getByRole('button', { name: 'Enviar contestação' }))
    expect(within(sheet).getByRole('alert').textContent).toBe('Escolha o que está errado.')
    await ui.click(within(sheet).getByLabelText(/^Gols: 2/))
    await ui.type(within(sheet).getByLabelText('Motivo'), 'Não')
    await ui.click(within(sheet).getByRole('button', { name: 'Enviar contestação' }))
    expect(within(sheet).getByRole('alert').textContent).toBe('Conte por que a estatística está errada.')
    await ui.type(within(sheet).getByLabelText('Motivo'), ' foi gol, foi contra.')
    await ui.click(within(sheet).getByRole('button', { name: 'Enviar contestação' }))
    expect(body(api, 'POST', '/matches/7/stats/71/contest')).toEqual({ fields: ['gols'], reason: 'Não foi gol, foi contra.' })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(await findToast('Contestação enviada')).toBeTruthy()
    expect(within(sheet).getByText(/Caio Ramos contestou gols: “Foi gol contra\.” O item contestado/)).not.toBeNull()
    expect(within(sheet).queryByRole('button', { name: 'Contestar' })).toBeNull()
  })

  it('quem só lê vê o elenco sem ações', async () => {
    setup(football({ my_role: 'membro', permissions: permissions({ send_stats: true }), result: confirmed(3, 1, 3) }), {}, { viewerId: 12, lineups: lineups().map(item => ({ ...item, can_contest: false })) })
    const ui = userEvent.setup()
    await ui.click(await screen.findByRole('button', { name: /Elenco e estatísticas/ }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).queryByRole('checkbox')).toBeNull()
    expect(within(sheet).queryByRole('button', { name: 'Salvar presença' })).toBeNull()
    expect(within(sheet).queryByRole('button', { name: /Revisar|Contestar/ })).toBeNull()
    expect(within(sheet).getAllByText('ATA · Presença não informada · Estatísticas não enviadas').length).toBeGreaterThan(0)
    await ui.click(within(sheet).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('"Revisar elenco" do formulário abre a mesma folha', async () => {
    setup(football(), {}, { lineups: lineups() })
    const ui = userEvent.setup()
    await ui.click(await screen.findByRole('button', { name: 'Revisar elenco' }))
    expect(await screen.findByRole('dialog', { name: 'Quem jogou e estatísticas' })).not.toBeNull()
    expect(screen.getByText('0/1 estatísticas', { exact: false })).not.toBeNull()
  })

  it('o erro da leitura do elenco aparece com nova tentativa; 401 chama onExpired', async () => {
    let fails = true
    const api = mockApi({ 'GET /matches/7/stats': () => (fails ? apiError(500, 'Erro ao ler o elenco.') : { items: lineups() }) })
    renderWithToaster(<MatchResultCard match={football({ result: confirmed(3, 1, 3) })} viewerId={11} onChanged={vi.fn()} onExpired={vi.fn()} />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Erro ao ler o elenco.')
    fails = false
    await userEvent.setup().click(button('Tentar novamente'))
    expect(await screen.findByRole('button', { name: /Elenco e estatísticas/ })).not.toBeNull()
    expect(api.find('GET', '/matches/7/stats')).toHaveLength(2)
    cleanup()
    mockApi({ 'GET /matches/7/stats': apiError(503, 'Serviço fora do ar.') })
    renderWithToaster(<MatchResultCard match={football({ result: confirmed(3, 1, 3) })} viewerId={11} onChanged={vi.fn()} onExpired={vi.fn()} />)
    expect((await screen.findByRole('alert')).textContent).toContain('Sem conexão com a ARENA')
    cleanup()
    mockApi({ 'GET /matches/7/stats': apiError(401, 'Sua sessão expirou.') })
    const onExpired = vi.fn()
    renderWithToaster(<MatchResultCard match={football({ result: confirmed(3, 1, 3) })} viewerId={11} onChanged={vi.fn()} onExpired={onExpired} />)
    await waitFor(() => expect(onExpired).toHaveBeenCalled())
  })
})

// Mantém os nomes usados só nos dados de apoio (evita avisos de importação não usada).
void [acting, ferrugem, leoes]

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventBracketPanel } from '../src/components/events/EventBracketPanel'
import EventPage from '../src/pages/EventPage'
import { apiError, mockApi } from './teams-fixtures'
import { confirmed, eightTeams, eliminationBracket, roundRobinBracket, score } from './brackets-fixtures'
import { detail, myEntry, withEntry } from './events-fixtures'

/*
 * Aba Tabela do detalhe do evento (D2), em leitura: a árvore ou a tabela para quem está inscrito, um texto honesto para quem
 * não está ou antes de o organizador confirmar, os resultados, o campeão e as colocações e, no tênis, o bônus do ranking.
 */

afterEach(cleanup)

const bonus = { champion: 40, runner_up: 20, semifinalist: 10, min_entries: 4, applies: true }
type Routes = Parameters<typeof mockApi>[0]
function renderPanel(routes: Routes, props: Partial<Parameters<typeof EventBracketPanel>[0]> = {}) {
  const api = mockApi(routes)
  const onExpired = vi.fn()
  render(<div className="grid"><EventBracketPanel eventId={1} canRead bonus={null} onExpired={onExpired} {...props} /></div>)
  return { ...api, onExpired, user: userEvent.setup() }
}

describe('leitura da tabela', () => {
  it('quem não está inscrito vê o texto honesto e a API nem é consultada', () => {
    const { find } = renderPanel({}, { canRead: false })
    expect(screen.getByText('A tabela é dos inscritos')).not.toBeNull()
    expect(find('GET', '/events/1/bracket')).toHaveLength(0)
  })

  it('inscrito antes de o organizador confirmar: "Tabela ainda não definida"', async () => {
    renderPanel({ 'GET /events/1/bracket': { ...eliminationBracket([]), state: 'sem_chaveamento', rounds: [], is_organizer: false } })
    expect(await screen.findByText('Tabela ainda não definida')).not.toBeNull()
    expect(screen.getByText('A tabela aparece quando o organizador confirmar o chaveamento.')).not.toBeNull()
  })

  it('o organizador com o sorteio feito é avisado de que os inscritos só veem depois de confirmar', async () => {
    renderPanel({ 'GET /events/1/bracket': eliminationBracket(eightTeams, { state: 'sorteado' }) })
    expect(await screen.findByText(/os inscritos só veem a tabela depois que você confirmar/)).not.toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('403 e 404 da API viram o mesmo texto de quem não está inscrito', async () => {
    renderPanel({ 'GET /events/1/bracket': apiError(403, 'Só quem está inscrito vê a tabela.') })
    expect(await screen.findByText('A tabela é dos inscritos')).not.toBeNull()
    cleanup()
    renderPanel({ 'GET /events/1/bracket': apiError(404, 'Evento não encontrado.') })
    expect(await screen.findByText('A tabela é dos inscritos')).not.toBeNull()
  })

  it('erro de rede tem "Tentar novamente" e 401 chama onExpired', async () => {
    const first = renderPanel({ 'GET /events/1/bracket': apiError(500, 'Falha ao carregar.') })
    expect((await screen.findByRole('alert')).textContent).toContain('Falha ao carregar.')
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).not.toBeNull()
    expect(first.onExpired).not.toHaveBeenCalled()
    cleanup()
    const expired = renderPanel({ 'GET /events/1/bracket': apiError(401, 'Sessão expirada.') })
    await screen.findByRole('alert')
    expect(expired.onExpired).toHaveBeenCalled()
  })

  it('eliminação confirmada: a árvore em leitura (sem troca) e os confrontos com os placares', async () => {
    const base = eliminationBracket(eightTeams.slice(0, 4), {}, true)
    base.rounds[0].nodes[0].match = { ...base.rounds[0].nodes[0].match!, state: 'realizada', phase: 'confirmado', score: score(3, 1) }
    renderPanel({ 'GET /events/1/bracket': confirmed(base, { is_organizer: false, permissions: { can_draw: false, can_swap: false, can_confirm: false, draw_blocker: null } }) })
    expect(await screen.findByRole('img', { name: /4 lugares/ })).not.toBeNull()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText('3 × 1')).not.toBeNull()
    expect(screen.getByRole('region', { name: 'Semifinal' })).not.toBeNull()
  })

  it('todos contra todos: tabela cruzada, classificação e rodadas', async () => {
    renderPanel({ 'GET /events/1/bracket': confirmed(roundRobinBracket(), { is_organizer: false }) })
    expect(await screen.findByRole('table', { name: /Tabela cruzada/ })).not.toBeNull()
    expect(screen.getByRole('table', { name: /Classificação/ })).not.toBeNull()
    expect(screen.getByRole('region', { name: 'Rodada 5' })).not.toBeNull()
  })
})

describe('tênis: bônus e colocações', () => {
  const tennis = () => {
    const base = eliminationBracket(['Beatriz Lima', 'Caio Ramos', 'Dani Souza', 'Eduardo Pires'], { sport: 'tenis', format: null }, true)
    const people = base.rounds[0].nodes.flatMap(node => node.slots.map(slot => slot.competitor!))
    return { base, people }
  }

  it('evento encerrado: o campeão e as colocações com o bônus de cada uma', async () => {
    const { base, people } = tennis()
    const asAthlete = (item: (typeof people)[number]) => ({ ...item, kind: 'atleta' as const, team: null, athlete: { id: item.entry_id, name: item.team!.name, username: 'x', avatar_url: null } })
    const [first, second, third, fourth] = people.map(asAthlete)
    renderPanel({
      'GET /events/1/bracket': confirmed(base, {
        event_state: 'encerrado', is_organizer: false, champion: first,
        placements: [
          { placement: 1, competitor: first, bonus_points: 40 }, { placement: 2, competitor: second, bonus_points: 20 },
          { placement: 3, competitor: third, bonus_points: 10 }, { placement: 3, competitor: fourth, bonus_points: 10 },
        ],
      }),
    }, { bonus })
    const board = await screen.findByRole('region', { name: 'Classificação final' })
    const items = within(board).getAllByRole('listitem').map(item => item.textContent)
    expect(items[0]).toContain('Beatriz Lima')
    expect(items[0]).toContain('+40 no ranking')
    expect(items[1]).toContain('+20 no ranking')
    expect(items[2]).toContain('Semifinalista')
    expect(items[3]).toContain('+10 no ranking')
    // Encerrado: o lembrete do bônus já não aparece.
    expect(screen.queryByText(/Bônus no ranking do tênis:/)).toBeNull()
  })

  it('sem 4 confirmadas o bônus não vale: as colocações dizem isso', async () => {
    const { base, people } = tennis()
    renderPanel({
      'GET /events/1/bracket': confirmed(base, {
        event_state: 'encerrado', is_organizer: false, sport: 'tenis', champion: people[0],
        placements: [{ placement: 1, competitor: people[0], bonus_points: 0 }, { placement: 2, competitor: people[1], bonus_points: 0 }],
      }),
    }, { bonus: { ...bonus, applies: false } })
    expect(await screen.findByText('O bônus do ranking do tênis vale com 4 ou mais inscrições confirmadas.')).not.toBeNull()
    expect(screen.queryByText(/no ranking$/)).toBeNull()
  })

  it('em andamento: lembra o bônus (campeão +40, vice +20, semifinalistas +10) mesmo sem a tabela', async () => {
    renderPanel({ 'GET /events/1/bracket': { ...eliminationBracket([]), state: 'sem_chaveamento', rounds: [], is_organizer: false } }, { bonus: { ...bonus, applies: false } })
    const note = await screen.findByText(/Bônus no ranking do tênis:/)
    expect(note.closest('p')?.textContent).toContain('campeão +40, vice +20 e semifinalistas +10')
    expect(note.closest('p')?.textContent).toContain('ainda não vale')
  })
})

describe('aba Tabela do detalhe (EventPage)', () => {
  function renderEvent(base: ReturnType<typeof detail>, routes: Routes, props: Partial<Parameters<typeof EventPage>[0]> = {}) {
    const api = mockApi({ 'GET /events/1': base, ...routes })
    render(<div className="relative"><EventPage eventId={1} onTeams={vi.fn()} onExpired={vi.fn()} {...props} /></div>)
    return { ...api, user: userEvent.setup() }
  }

  it('inscrito: a aba mostra a árvore; quem não está inscrito não consulta a API', async () => {
    const mine = myEntry({ state: 'confirmada', price_cents: 0, can_cancel: false, can_send_receipt: false })
    const base = withEntry(detail({ price_cents: 0, pix: null, state: 'em_andamento', phase: 'em_andamento' }), mine)
    const { user, find } = renderEvent(base, {
      'GET /entries/5': mine,
      'GET /events/1/bracket': confirmed(eliminationBracket(eightTeams.slice(0, 4), {}, true), { is_organizer: false }),
    })
    await user.click(await screen.findByRole('tab', { name: 'Tabela' }))
    expect(await screen.findByRole('img', { name: /4 lugares/ })).not.toBeNull()
    expect(find('GET', '/events/1/bracket')).toHaveLength(1)
    cleanup()
    const outsider = renderEvent(detail({ price_cents: 0, pix: null, state: 'em_andamento', phase: 'em_andamento' }), {})
    await outsider.user.click(await screen.findByRole('tab', { name: 'Tabela' }))
    expect(screen.getByText('A tabela é dos inscritos')).not.toBeNull()
    expect(outsider.find('GET', '/events/1/bracket')).toHaveLength(0)
  })

  it('initialSection abre a aba Tabela (notificações); na prova de corrida, cai nas informações', async () => {
    const mine = myEntry({ state: 'confirmada', price_cents: 0, can_cancel: false, can_send_receipt: false })
    const base = withEntry(detail({ price_cents: 0, pix: null, state: 'encerrado', phase: 'encerrado' }), mine)
    renderEvent(base, { 'GET /entries/5': mine, 'GET /events/1/bracket': { ...eliminationBracket([]), state: 'sem_chaveamento', rounds: [], is_organizer: false } }, { initialSection: 'tabela' })
    expect((await screen.findByRole('tab', { name: 'Tabela' })).getAttribute('aria-selected')).toBe('true')
    cleanup()
    renderEvent(detail({ sport: 'corrida', competition_type: null, distance_km: 10, price_cents: 0, pix: null, format: null }), {}, { initialSection: 'tabela' })
    expect((await screen.findByRole('tab', { name: 'Informações' })).getAttribute('aria-selected')).toBe('true')
  })
})

import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '../src/api/client'
import type { ArenaNotification } from '../src/api/notifications'
import ArenaPage from '../src/pages/ArenaPage'
import { brasilia, mockApi, person } from './teams-fixtures'
import { football, inFuture, leoes, matchCard, playBoard, proposal, search, slotOffer, standings, teamSide, tigres } from './matchmaking-fixtures'
import { fromNow, message, noPermissions, page as chatPage, scheduled } from './match-fixtures'
import { dispute, suggestion } from './admin-match-fixtures'
import { hiddenReport, report, result as resultOf } from './results-fixtures'
import { nextScheduledMatch } from '../src/components/play/matchView'
import { summaryOf } from './notifications-fixtures'

/*
 * Pontas entre as frentes web da etapa 3 (Jogar), com o ArenaPage inteiro: a placa leva à proposta, a proposta à tela da
 * partida e a partida ao cartão de resultado (com o relato cego); as notificações abrem a proposta, a oferta, a partida
 * e as filas certas; o Menu leva às filas da administração e conta as denúncias.
 */

const me: User = { id: 1, name: 'Ricardo Leão', username: 'ricardo.leao', email: 'r@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
const nav = () => within(screen.getByRole('navigation', { name: 'Navegação principal' }))
const lit = () => nav().getByRole('button', { current: 'page' }).textContent
/** Com um diálogo aberto o fundo fica oculto para a árvore de acessibilidade: lê a aba acesa direto do DOM. */
const litBehindDialog = () => document.querySelector('nav[aria-label="Navegação principal"] [aria-current="page"]')?.textContent
const list = <T,>(items: T[]) => ({ items, next_cursor: null })

function base(extra: Record<string, unknown> = {}) {
  return {
    'GET /me/sports-profiles': [football],
    'GET /cities': [brasilia],
    'GET /me/notifications/summary': summaryOf({ unread_count: 0 }),
    'GET /me/standings': standings(),
    'GET /me/follow-requests': list([]),
    'GET /me/organizer-request': { state: 'nenhum', request: null, organizer: null, revocation: null },
    'GET /organizer/events?scope=abertos': list([]),
    ...extra,
  }
}
function renderArena(user: User = me) {
  render(<StrictMode><ArenaPage user={user} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} /></StrictMode>)
  return userEvent.setup()
}
const note = (type: string, payload: Record<string, unknown>, extra: Partial<ArenaNotification> = {}): ArenaNotification =>
  ({ id: 1, type, payload, actor: null, created_at: new Date(Date.now() - 60e3).toISOString(), read_at: null, ...extra })

beforeEach(() => { Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('ligações da etapa 3: placa, proposta, partida e resultado', () => {
  /** Partida 50 já começada, vista pelo representante do Ferrugem; o outro lado já informou (relato cego: sem placar). */
  const started = scheduled(-2, {
    id: 50, phase: 'informar_resultado', needs_my_action: true,
    result: resultOf({ deadline: fromNow(46), reports: { a: null, b: hiddenReport('b') } }),
    permissions: { ...noPermissions, read_chat: true, write_chat: true, report_result: true, register_walkover: true, send_stats: true },
  })

  it('a placa abre a proposta, aceitar leva à partida e o placar é informado pelo MatchResultCard', async () => {
    let board = playBoard({ proposals: [proposal()], searches: [search({ state: 'pareada', match_id: 50 })] })
    const divergent = {
      ...started, phase: 'divergente' as const,
      result: resultOf({ state: 'divergente', deadline: fromNow(46), reports: { a: report('a', 2, 1), b: report('b', 0, 0) } }),
    }
    let detail = started
    const calls = mockApi(base({
      'GET /me/play': () => board,
      'PUT /matches/50/accept': () => {
        board = playBoard({ matches: [matchCard()] })
        return proposal({ state: 'combinando', can_respond: false, sides: [teamSide('a', leoes, { is_mine: true, accepted_at: inFuture(-1000) }), teamSide('b', tigres, { accepted_at: inFuture(-500) })] })
      },
      'GET /matches/50': () => detail,
      'GET /matches/50/messages': chatPage([message(1, { body: 'Chegamos na quadra.' })]),
      'GET /matches/50/stats': { items: [] },
      'PUT /matches/50/result': () => { detail = divergent; return divergent },
    }))
    const ui = renderArena()

    // Placa → proposta em tela cheia → aceitar → tela da partida (JOGAR aceso).
    await ui.click(nav().getByRole('button', { name: 'JOGAR' }))
    const dialog = await screen.findByRole('dialog', { name: 'Adversário encontrado · Society' })
    await ui.click(within(dialog).getByRole('button', { name: 'Aceitar partida' }))
    expect(await screen.findByRole('heading', { level: 1, name: /Ferrugem FC contra Leões do Cerrado/ })).not.toBeNull()
    expect(lit()).toBe('JOGAR')
    expect(calls.find('GET', '/matches/50').length).toBeGreaterThanOrEqual(1)

    // O cartão de resultado fica no topo, no ponto de encaixe, e o chat segue montado. O relato do outro lado vem cego.
    const card = await screen.findByRole('heading', { name: 'Informe o placar' })
    expect(card).not.toBeNull()
    expect(screen.getByText(/Leões do Cerrado já informou o placar/)).not.toBeNull()
    expect(screen.getByRole('log', { name: 'Mensagens da partida' })).not.toBeNull()
    // Os botões do W.O. ficam no cartão de condições, uma vez só.
    expect(screen.queryAllByRole('button', { name: 'Registrar W.O.' })).toHaveLength(0)
    await ui.click(screen.getByRole('button', { name: /Partida agendada/ }))
    expect(screen.getAllByRole('button', { name: 'Registrar W.O.' })).toHaveLength(1)

    // Enviar o placar: a resposta (divergência) mostra os dois placares ao mesmo tempo.
    await ui.click(screen.getByRole('button', { name: 'Mais gols do Ferrugem FC' }))
    await ui.click(screen.getByRole('button', { name: 'Mais gols do Ferrugem FC' }))
    await ui.click(screen.getByRole('button', { name: 'Mais gols do Leões do Cerrado' }))
    await ui.click(screen.getByRole('button', { name: 'Enviar placar' }))
    expect(calls.find('PUT', '/matches/50/result')[0].body).toEqual({ goals_a: 2, goals_b: 1 })
    expect(await screen.findByText('Placares diferentes')).not.toBeNull()
    expect(screen.getAllByText('0 × 0', { exact: false }).length).toBeGreaterThan(0)
    // "Conversar" leva o foco ao campo do chat.
    await ui.click(screen.getByRole('button', { name: 'Conversar' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Mensagem'))
    // Voltar da partida devolve à placa.
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Jogar' })).not.toBeNull()
  })
})

describe('ligações da etapa 3: Início', () => {
  const soon = matchCard({ id: 61, state: 'agendada', phase: 'agendada', starts_at: inFuture(20 * 3600e3) })
  const later = matchCard({ id: 62, state: 'agendada', phase: 'agendada', starts_at: inFuture(70 * 3600e3) })

  it('a próxima partida é a agendada mais próxima que ainda não começou', () => {
    const started = matchCard({ id: 60, state: 'agendada', phase: 'informar_resultado', starts_at: inFuture(-2 * 3600e3) })
    const arranging = matchCard({ id: 59, state: 'combinando', phase: 'combinando', starts_at: null })
    expect(nextScheduledMatch([later, started, arranging, soon], Date.now())?.id).toBe(61)
    expect(nextScheduledMatch([started, arranging], Date.now())).toBeNull()
    expect(nextScheduledMatch([], Date.now())).toBeNull()
  })

  it('o cartão "Próxima partida" mostra a partida real e abre a tela da partida; sem partida, o estado vazio', async () => {
    mockApi(base({
      'GET /me/play': playBoard({ matches: [later, soon] }),
      'GET /matches/61': scheduled(20, { id: 61 }),
      'GET /matches/61/messages': chatPage([]),
    }))
    const ui = renderArena()
    const row = await screen.findByRole('button', { name: /Leões J1 × Tigres J1/ })
    expect(row.getAttribute('data-phase')).toBe('agendada')
    await ui.click(row)
    expect(await screen.findByRole('heading', { level: 1, name: /Ferrugem FC contra Leões do Cerrado/ })).not.toBeNull()
    expect(lit()).toBe('JOGAR')
    cleanup()
    mockApi(base({ 'GET /me/play': playBoard() }))
    renderArena()
    expect(await screen.findByText('Nenhuma partida agendada')).not.toBeNull()
  })
})

describe('ligações da etapa 3: notificações', () => {
  function withNotification(notification: ArenaNotification, extra: Record<string, unknown> = {}, user: User = me) {
    mockApi(base({
      'GET /me/notifications/summary': summaryOf({ unread_count: 1 }),
      'GET /me/notifications/pending?limit=50': { items: [] },
      'GET /me/notifications?pendente=false': list([notification]),
      'PUT /me/notifications/1/read': summaryOf({ unread_count: 0 }),
      ...extra,
    }))
    return renderArena(user)
  }
  const openFirst = async (ui: ReturnType<typeof userEvent.setup>, name: RegExp) => {
    await ui.click(await screen.findByRole('button', { name: 'Notificações, 1 nova' }))
    await ui.click(await screen.findByRole('button', { name }))
  }

  it('"Partida encontrada" abre a proposta daquela partida, e não a primeira da placa', async () => {
    const other = proposal({ match_id: 49, sides: [teamSide('a', leoes, { is_mine: true }), teamSide('b', { id: 12, name: 'Real Guará', initials: 'RG', crest_url: null })] })
    const ui = withNotification(note('proposta_partida', { match_id: 50, sport: 'futebol', format: 'society', opponent_name: 'Tigres J1', expires_at: inFuture(3600e3) }), {
      'GET /me/play': playBoard({ proposals: [other, proposal()], searches: [search({ state: 'pareada', match_id: 50 })] }),
    })
    await openFirst(ui, /Partida encontrada contra Tigres J1/)
    const dialog = await screen.findByRole('dialog', { name: 'Adversário encontrado · Society' })
    expect(litBehindDialog()).toBe('JOGAR')
    expect(within(dialog).getAllByText(/Tigres J1/).length).toBeGreaterThan(0)
    expect(within(dialog).queryByText(/Real Guará/)).toBeNull()
  })

  it('"Vaga encontrada" abre a oferta de vaga do avulso', async () => {
    const ui = withNotification(note('vaga_encontrada', { match_id: 60, slot_id: 9, position: 'atacante', format: 'society', team_name: 'Leões J1', starts_at: inFuture(48 * 3600e3), expires_at: inFuture(3600e3) }), {
      'GET /me/play': playBoard({ offers: [slotOffer()], searches: [search({ kind: 'avulso', team: null, format: null, position: null, state: 'pareada', slot_id: 9 })] }),
    })
    await openFirst(ui, /Vaga de atacante/)
    expect(await screen.findByRole('dialog', { name: 'Vaga encontrada · Society' })).not.toBeNull()
    expect(litBehindDialog()).toBe('JOGAR')
  })

  it('"Partida agendada" abre a tela da partida com o chat e o cartão de condições', async () => {
    const detail = scheduled(72, { id: 12 })
    const ui = withNotification(note('partida_agendada', { match_id: 12, starts_at: detail.starts_at, court_name: 'Arena Sudoeste', changed: false }), {
      'GET /matches/12': detail,
      'GET /matches/12/messages': chatPage([]),
    })
    await openFirst(ui, /Partida agendada/)
    expect(await screen.findByRole('heading', { level: 1, name: /Ferrugem FC contra Leões do Cerrado/ })).not.toBeNull()
    expect(lit()).toBe('JOGAR')
    expect(await screen.findByRole('button', { name: /Partida agendada/ })).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect((await screen.findAllByRole('listitem')).length).toBeGreaterThan(0)
  })

  it('"W.O. contestado", para a administração, abre a fila com a decisão', async () => {
    const ui = withNotification(note('wo_contestado', { match_id: 12, reason: 'Estávamos lá.' }, { actor: person(9, 'Caio Ramos') }), {
      'GET /admin/walkover-disputes': list([dispute()]),
      'GET /matches/12/messages?limit=12': { items: [], has_more: false, last_id: null },
    }, { ...me, is_admin: true })
    await openFirst(ui, /contestou o W\.O\./)
    expect(await screen.findByRole('heading', { level: 1, name: 'W.O. contestados' })).not.toBeNull()
    expect(lit()).toBe('Perfil')
    expect(await screen.findByRole('button', { name: /Ferrugem FC × Tigres do Lago/ })).not.toBeNull()
  })
})

describe('ligações da etapa 3: Menu da administração', () => {
  const counts = { organizer_requests: 0, reports: 2, paid_events: 0, revoked_events: 0, refund_disputes: 0, court_suggestions: 1, walkover_disputes: 1 }

  async function openMenu(ui: ReturnType<typeof userEvent.setup>) {
    await ui.click(nav().getByRole('button', { name: 'Perfil' }))
    await ui.click(await screen.findByRole('button', { name: 'Menu' }))
    return (await screen.findByRole('heading', { name: 'Administração' })).nextElementSibling as HTMLElement
  }

  it('leva às filas de quadras, W.O. e denúncias, com os contadores, e Voltar devolve ao Menu', async () => {
    mockApi(base({
      'GET /admin/queue-counts': counts,
      'GET /admin/court-suggestions?state=em_revisao': list([suggestion()]),
      'GET /matches/12': { sides: [] },
      'GET /admin/walkover-disputes': list([dispute()]),
      'GET /matches/12/messages?limit=12': { items: [], has_more: false, last_id: null },
      'GET /admin/reports?status=pending': list([{
        id: 9, target_type: 'match_message', target_id: 44, reason: 'assedio', description: null, status: 'pending', created_at: '2026-10-12T20:00:00Z',
        target_preview: { body: 'Vocês são ridículos.', removed: false, author: 'Caio Ramos', match_id: 12, match: 'Ferrugem FC × Tigres do Lago' },
        target_user_id: 9, target_user_active: true,
      }]),
    }))
    const ui = renderArena({ ...me, is_admin: true })
    const admin = await openMenu(ui)
    const rows = () => within(admin).getAllByRole('button').map(row => row.textContent)
    await vi.waitFor(() => expect(rows()).toContain('Denúncias2 pendentes'))
    expect(rows()).toContain('Sugestões de quadra1 pendente')
    expect(rows()).toContain('W.O. contestados1 pendente')

    await ui.click(within(admin).getByRole('button', { name: /Sugestões de quadra/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sugestões de quadra' })).not.toBeNull()
    expect(await screen.findByRole('button', { name: /Arena Sul/ })).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))

    await ui.click(within(await openAdmin()).getByRole('button', { name: /W\.O\. contestados/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'W.O. contestados' })).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))

    await ui.click(within(await openAdmin()).getByRole('button', { name: /Denúncias/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Moderação' })).not.toBeNull()
    expect(await screen.findByText('Mensagem da partida · #44')).not.toBeNull()
    expect(lit()).toBe('Perfil')

    async function openAdmin() {
      return (await screen.findByRole('heading', { name: 'Administração' })).nextElementSibling as HTMLElement
    }
  })
})

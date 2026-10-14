import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile, User } from '../src/api/client'
import type { Championship } from '../src/api/events'
import type { ArenaNotification } from '../src/api/notifications'
import ArenaPage from '../src/pages/ArenaPage'
import { activeNavFor } from '../src/data/arena'
import type { Screen } from '../src/data/arena'
import { notificationView } from '../src/data/notifications'
import { brasilia, mockApi } from './teams-fixtures'
import { detail, eventDetail, myEntry, withEntry } from './events-fixtures'
import { confirmed, eightTeams, eliminationBracket, matchList, row } from './brackets-fixtures'
import { court, fromNow, matchDetail, noPermissions, page as chatPage, sides } from './match-fixtures'
import { report, result as resultOf } from './results-fixtures'
import { summaryOf } from './notifications-fixtures'

/*
 * Pontas da etapa 4 (campeonatos), com o ArenaPage inteiro: da gestão do evento ao chaveamento, às partidas, à decisão e à
 * partida; e as notificações novas (tabela, adversário, divergência, decisão e encerramento) abrindo a tela certa, com a aba
 * da navegação acesa (Perfil para o organizador, JOGAR para o atleta).
 */

const me: User = { id: 1, name: 'Ricardo Moura', username: 'ricardo.moura', email: 'r@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
const football: Profile = { id: 1, sport: 'futebol', city_id: brasilia.id, position: 'atacante', looking_for: false, is_public: false, level: null }
const list = <T,>(items: T[]) => ({ items, next_cursor: null })
const note = (id: number, type: string, payload: Record<string, unknown>, extra: Partial<ArenaNotification> = {}): ArenaNotification =>
  ({ id, type, payload, actor: null, created_at: new Date(Date.now() - 60e3).toISOString(), read_at: null, ...extra })

const champ = (overrides: Partial<Championship> = {}): Championship => ({
  bracket: 'confirmado', confirmed: 6, matches_total: 5, to_schedule: 1, waiting: 2, scheduled: 0, to_decide: 1, finished: 1, attention: 2, ...overrides,
})
const copa = () => eventDetail({
  id: 5, state: 'em_andamento', phase: 'em_andamento', price_cents: 0, pix: null, championship: champ(),
  next_action: { kind: 'decidir_divergencias', count: 1, deadline: null },
})

function base(extra: Record<string, unknown> = {}) {
  return {
    'GET /me/sports-profiles': [football],
    'GET /cities': [brasilia],
    'GET /me/notifications/summary': summaryOf({ unread_count: 0 }),
    'GET /me/follow-requests': list([]),
    'GET /me/organizer-request': { state: 'aprovado', request: null, organizer: { id: 3, display_name: 'Liga Sudoeste', approved_at: '2026-10-12T10:00:00Z' }, revocation: null },
    'GET /organizer/events?scope=abertos': list([]),
    'GET /organizer/events?scope=encerrados': list([]),
    'GET /me/play': { attention: false, matches: [], proposals: [], searches: [], offers: [] },
    ...extra,
  }
}
function renderArena() {
  render(<ArenaPage user={me} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} />)
  return userEvent.setup()
}
const nav = () => within(screen.getByRole('navigation', { name: 'Navegação principal' }))
const lit = () => nav().getByRole('button', { current: 'page' }).textContent
/** Com um diálogo aberto o fundo fica oculto para a árvore de acessibilidade: lê a aba acesa direto do DOM. */
const litAnyway = () => document.querySelector('nav[aria-label="Navegação principal"] [aria-current="page"]')?.textContent

beforeEach(() => { Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

/** Partida 11 da Copa, com placares divergentes, vista pelo organizador. */
const divergent = () => matchDetail({
  id: 11, origin: 'campeonato', state: 'agendada', phase: 'divergente', my_side: null, my_role: 'organizador', sides: sides({ is_mine: false }, { is_mine: false }),
  starts_at: fromNow(-3), court: court(), result_deadline: fromNow(45), event: { id: 5, name: 'Copa Sudoeste Society' }, round_number: 1,
  result: resultOf({ state: 'divergente', deadline: fromNow(45), reports: { a: report('a', 2, 1), b: report('b', 0, 1) } }),
  permissions: { ...noPermissions, read_chat: true, write_chat: true, decide_result: true },
})
const matchRoutes = (detailOf = divergent()) => ({
  'GET /matches/11': detailOf, 'GET /matches/11/messages': chatPage([]), 'GET /matches/11/messages?limit=20': chatPage([]), 'GET /matches/11/stats': { items: [] },
})

describe('organizador: da gestão ao chaveamento, às partidas e à decisão', () => {
  it('G3 abre o Chaveamento e as Partidas com o contador; as partidas levam à decisão e à partida; sempre com Perfil aceso', async () => {
    const calls = mockApi(base({
      'GET /me/notifications/pending?limit=50': { items: [] },
      'GET /me/notifications?pendente=false': list([note(1, 'evento_decidido', { event_id: 5, event_name: 'Copa Sudoeste Society', decision: 'aprovado' })]),
      'GET /organizer/events/5': copa(),
      'GET /events/5/messages': list([]),
      'GET /events/5/bracket': confirmed(eliminationBracket(eightTeams.slice(0, 4), {}, true)),
      'GET /organizer/events/5/matches': matchList([
        row('J1', 11, ['Ferrugem FC', 'Leões do Cerrado'], { awaiting_decision: true, can_schedule: false }, { state: 'agendada', phase: 'divergente', starts_at: fromNow(-3), court: court() }),
        row('J2', 12, ['Atlético Guará', 'Unidos do Lago']),
      ]),
      ...matchRoutes(),
    }))
    const ui = renderArena()
    await ui.click(screen.getByRole('button', { name: /Notificações/ }))
    await ui.click(await screen.findByRole('button', { name: /Copa Sudoeste Society foi aprovado e publicado/ }))

    // G3: o "Agora" de decisão e as duas seções com os contadores.
    expect(await screen.findByRole('heading', { name: '1 partida para decidir' })).not.toBeNull()
    expect(lit()).toBe('Perfil')
    await ui.click(screen.getByRole('button', { name: /Chaveamento\s*Confirmado · 5 jogos/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Chaveamento' })).not.toBeNull()
    expect(await screen.findByRole('img', { name: /4 lugares/ })).not.toBeNull()
    expect(lit()).toBe('Perfil')
    expect(calls.find('GET', '/events/5/bracket')).toHaveLength(1)
    // Do chaveamento confirmado às partidas.
    await ui.click(screen.getByRole('button', { name: 'Ver e agendar partidas' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Partidas' })).not.toBeNull()
    expect(lit()).toBe('Perfil')

    // Um jogo com decisão pendente abre a decisão (D3); "Abrir chat" leva à partida; voltar volta passo a passo.
    await ui.click(await screen.findByRole('button', { name: /^J1,/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Placar divergente' })).not.toBeNull()
    expect(lit()).toBe('Perfil')
    await ui.click(screen.getByRole('button', { name: 'Abrir chat' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ferrugem FC contra Leões do Cerrado' })).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Decidir resultado' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Placar divergente' })).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    await screen.findByRole('heading', { level: 1, name: 'Ferrugem FC contra Leões do Cerrado' })
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Placar divergente' })).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Partidas' })).not.toBeNull()
  })

  it('registrar a decisão volta à tela anterior, que lê os dados de novo', async () => {
    let decided = false
    const calls = mockApi(base({
      'GET /me/notifications/pending?limit=50': { items: [] },
      'GET /me/notifications?pendente=false': list([note(1, 'divergencia_para_decidir', { match_id: 11, event_id: 5, event_name: 'Copa Sudoeste Society', deadline: new Date(Date.now() + 40 * 3600e3).toISOString() })]),
      'GET /matches/11': () => (decided ? { ...divergent(), state: 'encerrada', permissions: { ...noPermissions, read_chat: true } } : divergent()),
      'GET /matches/11/messages': chatPage([]), 'GET /matches/11/messages?limit=20': chatPage([]), 'GET /matches/11/stats': { items: [] },
      'POST /organizer/matches/11/result-decision': () => { decided = true; return divergent() },
    }))
    const ui = renderArena()
    await ui.click(screen.getByRole('button', { name: /Notificações/ }))
    await ui.click(await screen.findByRole('button', { name: /Os placares de uma partida de Copa Sudoeste Society não batem\. Decida/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Placar divergente' })).not.toBeNull()
    expect(lit()).toBe('Perfil')
    await ui.click(screen.getByRole('radio', { name: /Informado por Ferrugem FC/ }))
    await ui.type(screen.getByLabelText('Justificativa (obrigatória)'), 'O vídeo confirma o gol.')
    await ui.click(screen.getByRole('button', { name: 'Registrar 2 × 1' }))
    await waitFor(() => expect(calls.find('POST', '/organizer/matches/11/result-decision')).toHaveLength(1))
    // Volta às notificações (a tela de baixo na pilha).
    expect(await screen.findByRole('heading', { level: 1, name: 'Notificações' })).not.toBeNull()
  })

  it('"Agendar" da partida abre a lista de partidas com a folha daquele jogo', async () => {
    const combining = matchDetail({
      id: 12, origin: 'campeonato', state: 'combinando', phase: 'combinando', my_side: null, my_role: 'organizador', sides: sides({ is_mine: false }, { is_mine: false }),
      event: { id: 5, name: 'Copa Sudoeste Society' }, round_number: 1, permissions: { ...noPermissions, read_chat: true, write_chat: true, schedule_match: true },
    })
    mockApi(base({
      'GET /me/notifications/pending?limit=50': { items: [] },
      'GET /me/notifications?pendente=false': list([note(1, 'adversario_definido', { match_id: 12, event_id: 5, event_name: 'Copa Sudoeste Society', opponent_name: 'Atlético Guará' })]),
      'GET /matches/12': combining, 'GET /matches/12/messages': chatPage([]), 'GET /matches/12/stats': { items: [] },
      'GET /organizer/events/5': copa(),
      'GET /organizer/events/5/matches': matchList([row('J2', 12, ['Atlético Guará', 'Unidos do Lago'])]),
      'GET /courts?city_id=5300108&kind=society&match_id=12': { items: [court()] },
    }))
    const ui = renderArena()
    await ui.click(screen.getByRole('button', { name: /Notificações/ }))
    await ui.click(await screen.findByRole('button', { name: /Seu próximo jogo: Atlético Guará em Copa Sudoeste Society/ }))
    await ui.click(await screen.findByRole('button', { name: 'Agendar' }))
    expect(await screen.findByRole('dialog', { name: 'Agendar J2' })).not.toBeNull()
    expect(litAnyway()).toBe('Perfil')
  })
})

describe('atleta: as notificações novas abrem a tela certa', () => {
  const mine = myEntry({ id: 9, state: 'confirmada', price_cents: 0, can_cancel: false, can_send_receipt: false })
  const eventRoutes = (state: 'em_andamento' | 'encerrado' = 'em_andamento') => ({
    'GET /events/5': withEntry(detail({ id: 5, name: 'Copa Sudoeste Society', sport: 'futebol', format: 'society', price_cents: 0, pix: null, state, phase: state }), mine),
    'GET /entries/9': mine,
    'GET /events/5/bracket': confirmed(eliminationBracket(eightTeams.slice(0, 4), {}, true), { is_organizer: false }),
  })

  it('tabela_publicada abre o detalhe do evento na aba Tabela, com JOGAR aceso', async () => {
    const calls = mockApi(base({
      'GET /me/notifications/pending?limit=50': { items: [] },
      'GET /me/notifications?pendente=false': list([note(1, 'tabela_publicada', { event_id: 5, event_name: 'Copa Sudoeste Society' }, { actor: { id: 2, name: 'Rafa Nunes', username: 'rafa', avatar_url: null } })]),
      ...eventRoutes(),
    }))
    const ui = renderArena()
    await ui.click(screen.getByRole('button', { name: /Notificações/ }))
    await ui.click(await screen.findByRole('button', { name: /A tabela de Copa Sudoeste Society saiu/ }))
    expect((await screen.findByRole('tab', { name: 'Tabela' })).getAttribute('aria-selected')).toBe('true')
    expect(await screen.findByRole('img', { name: /4 lugares/ })).not.toBeNull()
    expect(lit()).toBe('JOGAR')
    expect(calls.find('GET', '/events/5/bracket')).toHaveLength(1)
  })

  it('evento_encerrado abre o detalhe na aba Tabela com o campeão', async () => {
    const bracket = confirmed(eliminationBracket(eightTeams.slice(0, 4), {}, true), { is_organizer: false, event_state: 'encerrado' })
    const champion = bracket.rounds[0].nodes[0].slots[0].competitor!
    mockApi(base({
      'GET /me/notifications/pending?limit=50': { items: [] },
      'GET /me/notifications?pendente=false': list([note(1, 'evento_encerrado', { event_id: 5, event_name: 'Copa Sudoeste Society', champion: 'Novo Horizonte' })]),
      ...eventRoutes('encerrado'),
      'GET /events/5/bracket': { ...bracket, champion, placements: [{ placement: 1, competitor: champion, bonus_points: 0 }] },
    }))
    const ui = renderArena()
    await ui.click(screen.getByRole('button', { name: /Notificações/ }))
    await ui.click(await screen.findByRole('button', { name: /Copa Sudoeste Society terminou: campeão Novo Horizonte/ }))
    expect((await screen.findByRole('tab', { name: 'Tabela' })).getAttribute('aria-selected')).toBe('true')
    expect(await screen.findByRole('region', { name: 'Classificação final' })).not.toBeNull()
  })

  it('adversario_definido e decisao_registrada abrem a partida', async () => {
    const own = matchDetail({
      id: 50, origin: 'campeonato', state: 'agendada', phase: 'agendada', starts_at: fromNow(30), court: court(), result_deadline: fromNow(78), event: { id: 5, name: 'Copa Sudoeste Society' }, round_number: 1,
      permissions: { ...noPermissions, read_chat: true, write_chat: true },
    })
    mockApi(base({
      'GET /me/notifications/pending?limit=50': { items: [] },
      'GET /me/notifications?pendente=false': list([
        note(2, 'decisao_registrada', { match_id: 50, event_id: 5, event_name: 'Copa Sudoeste Society', kind: 'divergencia', score_a: 2, score_b: 1, justification: 'Vídeo.', absent_side: null }),
        note(1, 'adversario_definido', { match_id: 50, event_id: 5, event_name: 'Copa Sudoeste Society', opponent_name: 'Leões do Cerrado' }),
      ]),
      'GET /matches/50': own, 'GET /matches/50/messages': chatPage([]), 'GET /matches/50/stats': { items: [] },
    }))
    const ui = renderArena()
    await ui.click(screen.getByRole('button', { name: /Notificações/ }))
    await ui.click(await screen.findByRole('button', { name: /O organizador decidiu o resultado: 2 × 1/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ferrugem FC contra Leões do Cerrado' })).not.toBeNull()
    expect(lit()).toBe('JOGAR')
    await ui.click(screen.getByRole('button', { name: /Partida agendada/ }))
    expect(screen.getByText('Data, horário e quadra são do organizador. A reserva é com o local; o Arena só registra.')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Propor outra' })).toBeNull()
  })
})

describe('textos e destinos das notificações do campeonato', () => {
  const view = (type: string, payload: Record<string, unknown>) => notificationView(note(1, type, payload))

  it('tabela_publicada, adversario_definido, divergencia_para_decidir, decisao_registrada e evento_encerrado', () => {
    expect(view('tabela_publicada', { event_id: 5, event_name: 'Copa' })).toMatchObject({ text: 'A tabela de Copa saiu', kind: 'event', target: { screen: 'event', eventId: 5, section: 'tabela' } })
    expect(view('adversario_definido', { match_id: 7, event_id: 5, event_name: 'Copa', opponent_name: 'Leões' })).toMatchObject({ text: 'Seu próximo jogo: Leões em Copa', kind: 'match', target: { screen: 'match', matchId: 7 } })
    expect(view('divergencia_para_decidir', { match_id: 7, event_id: 5, event_name: 'Copa', deadline: null })).toMatchObject({ text: 'Os placares de uma partida de Copa não batem. Decida', kind: 'result', target: { screen: 'result-decision', matchId: 7 } })
    expect(view('decisao_registrada', { match_id: 7, kind: 'divergencia', score_a: 2, score_b: 1 })).toMatchObject({ text: 'O organizador decidiu o resultado: 2 × 1', target: { screen: 'match', matchId: 7 } })
    expect(view('decisao_registrada', { match_id: 7, kind: 'wo', score_a: 3, score_b: 0 }).text).toBe('O organizador decidiu o resultado por W.O. (3 × 0)')
    expect(view('evento_encerrado', { event_id: 5, event_name: 'Copa', champion: 'Ferrugem FC' })).toMatchObject({ text: 'Copa terminou: campeão Ferrugem FC', target: { screen: 'event', eventId: 5, section: 'tabela' } })
  })

  it('sem identificadores ou nomes, os textos seguem legíveis e os destinos somem', () => {
    expect(view('tabela_publicada', {})).toMatchObject({ text: 'A tabela de um evento saiu', target: null })
    expect(view('adversario_definido', { match_id: 0 })).toMatchObject({ text: 'Seu próximo jogo está definido', target: null })
    expect(view('divergencia_para_decidir', {}).target).toBeNull()
    expect(view('decisao_registrada', {}).text).toBe('O organizador decidiu o resultado')
    expect(view('evento_encerrado', {}).text).toBe('Um evento terminou')
  })
})

describe('navegação das telas novas', () => {
  it('as do organizador acendem Perfil; o detalhe e a partida do atleta, JOGAR', () => {
    const lights = (screen: Screen, root: Screen = screen) => activeNavFor(screen, root)
    expect(lights('event-bracket')).toBe('profile')
    expect(lights('event-matches')).toBe('profile')
    expect(lights('result-decision')).toBe('profile')
    expect(lights('event')).toBe('play')
    expect(lights('match')).toBe('play')
  })
})

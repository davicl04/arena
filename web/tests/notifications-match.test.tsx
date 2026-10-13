import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile, User } from '../src/api/client'
import type { ArenaNotification } from '../src/api/notifications'
import { notificationView } from '../src/data/notifications'
import ArenaPage from '../src/pages/ArenaPage'
import { brasilia, mockApi, person } from './teams-fixtures'
import { dispute, fromNow } from './admin-match-fixtures'
import { matchDetail, page } from './match-fixtures'
import { listed, summaryOf } from './notifications-fixtures'
import { NotificationsHarness } from './notifications-harness'

/*
 * Notificações da etapa 3 (0002-jogar, seção 13): texto e destino dos 16 tipos do Jogar e a navegação até a partida
 * (`match`), a placa do Jogar (`play`) e as filas da administração.
 */

const rafa = person(2, 'Rafa Nunes')
const caio = person(9, 'Caio Ramos')
const note = (type: string, payload: Record<string, unknown>, extra: Partial<ArenaNotification> = {}, id = 1): ArenaNotification =>
  ({ id, type, payload, actor: null, created_at: new Date(Date.now() - id * 60e3).toISOString(), read_at: null, ...extra })
const view = (type: string, payload: Record<string, unknown> = {}, extra: Partial<ArenaNotification> = {}, isAdmin = false) =>
  notificationView(note(type, { match_id: 12, ...payload }, extra), { isAdmin })
/** 20/10/2026 às 16:00 no fuso do aparelho. */
const kickoff = new Date(2026, 9, 20, 16, 0).toISOString()

beforeEach(() => { Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('texto e destino dos tipos da etapa 3', () => {
  it('proposta, aceite e encerramento levam à placa do Jogar (ou à partida, com o aceite dos dois lados)', () => {
    const toBoard = { screen: 'play', matchId: 12 }
    const proposal = view('proposta_partida', { sport: 'futebol', format: 'society', opponent_name: 'Tigres do Lago', expires_at: kickoff })
    expect(proposal).toMatchObject({ kind: 'match', teamName: null, target: toBoard })
    expect(proposal.text).toMatch(/^Partida encontrada contra Tigres do Lago\. Responda até \w{3}, 20 out · 16:00$/)
    expect(view('proposta_partida', { opponent_name: 'Tigres do Lago' }).text).toBe('Partida encontrada contra Tigres do Lago. Responda em até 2 h')
    expect(view('proposta_aceita', { opponent_name: 'Tigres do Lago', complete: false })).toMatchObject({ text: 'Tigres do Lago aceitou a proposta', target: toBoard })
    expect(view('proposta_aceita', { opponent_name: 'Tigres do Lago', complete: true })).toMatchObject({ text: 'Partida confirmada contra Tigres do Lago. Combinem no chat', target: { screen: 'match', matchId: 12 } })
    expect(view('proposta_encerrada', { opponent_name: 'Tigres do Lago', reason: 'recusada', requeued: true })).toMatchObject({ text: 'A proposta contra Tigres do Lago foi recusada. Sua busca continua', target: toBoard })
    expect(view('proposta_encerrada', { opponent_name: 'Tigres do Lago', reason: 'expirada', requeued: false }).text).toBe('A proposta contra Tigres do Lago expirou')
  })

  it('vaga encontrada abre a placa; preenchida e removido seguem a partida (removido, sem destino)', () => {
    const offer = view('vaga_encontrada', { slot_id: 4, position: 'meio_campo', format: 'society', team_name: 'Ferrugem FC', starts_at: kickoff, expires_at: kickoff })
    expect(offer).toMatchObject({ kind: 'match', target: { screen: 'play', matchId: 12 } })
    expect(offer.text).toMatch(/^Vaga de meio de campo no Ferrugem FC\. Responda até \w{3}, 20 out · 16:00$/)
    expect(view('vaga_encontrada', { position: 'goleiro', team_name: 'Ferrugem FC' }).text).toBe('Vaga de goleiro no Ferrugem FC. Responda em até 2 h')
    expect(view('vaga_preenchida', { slot_id: 4, position: 'goleiro' }, { actor: caio })).toMatchObject({ text: 'Caio Ramos entrou como goleiro', kind: 'match', target: { screen: 'match', matchId: 12 } })
    expect(view('removido_da_partida', { team_name: 'Ferrugem FC' })).toMatchObject({ text: 'Você foi removido da partida do Ferrugem FC', kind: 'match', target: null })
    expect(view('oferta_retirada', { slot_id: 4, position: 'goleiro', team_name: 'Ferrugem FC', reason: 'vagas_reduzidas', requeued: true })).toMatchObject({ text: 'A vaga de goleiro no Ferrugem FC foi retirada. Sua busca continua', kind: 'match', target: { screen: 'play', matchId: 12 } })
    expect(view('oferta_retirada', { position: 'defesa', team_name: 'Ferrugem FC', reason: 'partida_cancelada', requeued: false }).text).toBe('A vaga de defesa no Ferrugem FC foi retirada')
  })

  it('condições, agenda e cancelamento levam à partida', () => {
    const toMatch = { screen: 'match', matchId: 12 }
    const proposed = view('condicoes_propostas', { terms_id: 3, starts_at: kickoff, court_name: 'Quadra do Lago' }, { actor: rafa })
    expect(proposed).toMatchObject({ kind: 'schedule', target: toMatch })
    expect(proposed.text).toMatch(/^Rafa Nunes propôs novas condições: \w{3}, 20 out · 16:00 em Quadra do Lago$/)
    expect(view('condicoes_propostas', { terms_id: 3 }).text).toBe('O outro lado propôs novas condições')
    expect(view('partida_agendada', { terms_id: 3, starts_at: kickoff, court_name: 'Quadra do Lago', changed: false }, { actor: rafa }).text).toMatch(/^Partida agendada: \w{3}, 20 out · 16:00 em Quadra do Lago$/)
    expect(view('partida_agendada', { terms_id: 3, starts_at: kickoff, court_name: 'Quadra do Lago', changed: true })).toMatchObject({ kind: 'schedule', target: toMatch })
    expect(view('partida_agendada', { changed: true }).text).toBe('Partida alterada')
    expect(view('partida_cancelada', { starts_at: kickoff, reason: 'Chuva forte.' }, { actor: rafa }).text).toMatch(/^Rafa Nunes cancelou a partida de \w{3}, 20 out · 16:00: Chuva forte$/)
    expect(view('partida_cancelada', { starts_at: kickoff, reason: null }).text).toMatch(/^A partida de \w{3}, 20 out · 16:00 foi cancelada$/)
    expect(view('partida_cancelada', { starts_at: null, reason: null })).toMatchObject({ text: 'A partida foi cancelada', target: toMatch })
  })

  it('W.O.: registro, contestação e decisão levam à partida; a contestação, para a administração, à fila', () => {
    const toMatch = { screen: 'match', matchId: 12 }
    const registered = view('wo_registrado', { opponent_name: 'Ferrugem FC', contest_until: kickoff }, { actor: rafa })
    expect(registered).toMatchObject({ kind: 'walkover', target: toMatch })
    expect(registered.text).toMatch(/^Ferrugem FC registrou W\.O\. Conteste até \w{3}, 20 out · 16:00 se vocês compareceram$/)
    expect(view('wo_contestado', { reason: 'Estávamos lá.' }, { actor: caio })).toMatchObject({ text: 'Caio Ramos contestou o W.O.', kind: 'walkover', target: toMatch })
    expect(view('wo_contestado', { reason: 'Estávamos lá.' }, { actor: caio }, true)).toMatchObject({ text: 'Caio Ramos contestou o W.O.', target: { screen: 'admin-walkover-disputes' } })
    expect(view('wo_decidido', { decision: 'mantido', reason: 'Vale o registro.' })).toMatchObject({ text: 'A administração manteve o W.O.: Vale o registro', target: toMatch })
    expect(view('wo_decidido', { decision: 'anulado' }).text).toBe('A administração anulou o W.O.')
  })

  it('resultado, divergência e estatística contestada levam à partida', () => {
    const toMatch = { screen: 'match', matchId: 12 }
    expect(view('resultado_partida', { outcome: 'confirmado', score_a: 3, score_b: 1 })).toMatchObject({ text: 'Resultado confirmado: 3 × 1', kind: 'result', target: toMatch })
    expect(view('resultado_partida', { outcome: 'confirmado' }).text).toBe('Resultado confirmado')
    expect(view('resultado_partida', { outcome: 'wo', score_a: 3, score_b: 0, absent_side: 'b' })).toMatchObject({ text: 'Resultado definido: vale o W.O.', target: toMatch })
    expect(view('resultado_partida', { outcome: 'sem_resultado' })).toMatchObject({ text: 'A partida ficou sem resultado', target: toMatch })
    expect(view('resultado_divergente', { deadline: kickoff }).text).toMatch(/^Os placares não batem\. Corrijam até \w{3}, 20 out · 16:00$/)
    expect(view('resultado_divergente', { deadline: null })).toMatchObject({ text: 'Os placares não batem. Corrijam antes do fim do prazo', target: toMatch })
    expect(view('estatistica_contestada', { stat_id: 5, fields: ['gols', 'assistencias'], reason: 'Foram dois.' }, { actor: caio })).toMatchObject({
      text: 'Caio Ramos contestou estatísticas da partida (gols e assistências)', kind: 'result', target: toMatch,
    })
    expect(view('estatistica_contestada', { stat_id: 5, fields: ['gols', 'assistencias', 'estatistica_posicao'] }, { actor: caio }).text)
      .toBe('Caio Ramos contestou estatísticas da partida (gols, assistências e estatística da posição)')
    expect(view('estatistica_contestada', { stat_id: 5, fields: [] }).text).toBe('O adversário contestou estatísticas da partida')
  })

  it('quadra decidida mostra o resultado e não tem destino', () => {
    expect(view('quadra_decidida', { court_id: 8, court_name: 'Arena Sul', decision: 'publicada' })).toMatchObject({ text: 'Arena Sul entrou no catálogo', kind: 'court', target: null })
    expect(view('quadra_decidida', { court_id: 8, court_name: 'Arena Sul', decision: 'rejeitada', reason: 'Endereço inexistente.' }).text).toBe('Arena Sul foi recusada: Endereço inexistente')
    expect(view('quadra_decidida', { court_id: 8, court_name: 'Arena Sul', decision: 'rejeitada', duplicate_of_id: 3 }).text).toBe('Arena Sul foi recusada: já existe no catálogo')
    expect(view('quadra_decidida', { court_id: 8, court_name: 'Arena Sul', decision: 'rejeitada' }).text).toBe('Arena Sul foi recusada')
  })

  it('sem o id da partida, mostra o texto sem destino (a placa continua servindo propostas)', () => {
    expect(notificationView(note('partida_agendada', { starts_at: kickoff, court_name: 'Quadra do Lago', changed: false }))).toMatchObject({ target: null })
    expect(notificationView(note('proposta_partida', { opponent_name: 'Tigres do Lago' }))).toMatchObject({ target: { screen: 'play' } })
    expect(notificationView(note('resultado_partida', { match_id: 'x', outcome: 'confirmado' })).target).toBeNull()
  })

  it('todos os tipos do contrato têm texto próprio e ícone, e nenhum cai no texto genérico', () => {
    const types = ['proposta_partida', 'proposta_aceita', 'proposta_encerrada', 'vaga_encontrada', 'condicoes_propostas', 'partida_agendada',
      'partida_cancelada', 'wo_registrado', 'wo_contestado', 'wo_decidido', 'resultado_partida', 'resultado_divergente', 'estatistica_contestada',
      'vaga_preenchida', 'removido_da_partida', 'quadra_decidida']
    expect(types).toHaveLength(16)
    for (const type of types) {
      const result = view(type, { decision: 'publicada', outcome: 'confirmado', court_name: 'Arena Sul' })
      expect(result.text, type).not.toBe('Nova atividade na sua conta')
      expect(result.kind, type).not.toBe('other')
    }
  })
})

describe('tela Notificações com os tipos da etapa 3', () => {
  const items = [
    note('proposta_partida', { match_id: 12, opponent_name: 'Tigres do Lago', expires_at: fromNow(2) }, {}, 1),
    note('partida_agendada', { match_id: 12, starts_at: kickoff, court_name: 'Quadra do Lago', changed: false }, { actor: rafa }, 2),
    note('wo_contestado', { match_id: 13, reason: 'Estávamos lá.' }, { actor: caio }, 3),
    note('quadra_decidida', { court_id: 8, court_name: 'Arena Sul', decision: 'publicada' }, {}, 4),
  ]
  const routes = () => mockApi({
    'GET /me/follow-requests': { items: [], next_cursor: null },
    'GET /me/notifications/pending?limit=50': { items: [] },
    'GET /me/notifications?pendente=false': { items, next_cursor: null },
    'GET /me/notifications/summary': summaryOf({ unread_count: 4 }),
    'PUT /me/notifications/1/read': summaryOf({ unread_count: 3 }),
    'PUT /me/notifications/2/read': summaryOf({ unread_count: 2 }),
    'PUT /me/notifications/3/read': summaryOf({ unread_count: 1 }),
    'PUT /me/notifications/4/read': summaryOf({ unread_count: 0 }),
    'PUT /me/notifications/read-all': summaryOf({ unread_count: 0 }),
  })

  it('lista com os ícones, o tempo relativo e o não lido; cada toque marca como lida e navega', async () => {
    const calls = routes()
    const onNavigate = vi.fn()
    const ui = userEvent.setup()
    render(<NotificationsHarness isAdmin onNavigate={onNavigate} />)
    const list = await listed()
    const rows = within(list).getAllByRole('listitem')
    expect(rows[0].querySelector('.lucide-zap')).not.toBeNull()
    expect(rows[1].querySelector('.lucide-calendar-clock')).not.toBeNull()
    expect(rows[2].querySelector('.lucide-flag')).not.toBeNull()
    expect(rows[3].querySelector('.lucide-map-pin')).not.toBeNull()
    expect(rows[0].textContent).toContain('há 1 min')
    expect(rows.every(row => row.hasAttribute('data-unread'))).toBe(true)

    await ui.click(within(list).getByRole('button', { name: /Partida encontrada contra Tigres do Lago/ }))
    expect(onNavigate).toHaveBeenLastCalledWith({ screen: 'play', matchId: 12 })
    await ui.click(within(list).getByRole('button', { name: /Partida agendada/ }))
    expect(onNavigate).toHaveBeenLastCalledWith({ screen: 'match', matchId: 12 })
    await ui.click(within(list).getByRole('button', { name: /contestou o W\.O\./ }))
    expect(onNavigate).toHaveBeenLastCalledWith({ screen: 'admin-walkover-disputes' })
    expect(calls.find('PUT', '/me/notifications/3/read')).toHaveLength(1)
    // "Arena Sul entrou no catálogo" não tem destino: o toque só marca como lida.
    onNavigate.mockClear()
    await ui.click(within(list).getByRole('button', { name: /Arena Sul entrou no catálogo/ }))
    expect(onNavigate).not.toHaveBeenCalled()
    expect(calls.find('PUT', '/me/notifications/4/read')).toHaveLength(1)
  })

  it('"Ler todas" zera as não lidas', async () => {
    const calls = routes()
    const ui = userEvent.setup()
    render(<NotificationsHarness />)
    await listed()
    await ui.click(screen.getByRole('button', { name: 'Ler todas' }))
    expect((await screen.findByRole('status')).textContent).toBe('Todas as notificações foram marcadas como lidas.')
    expect(calls.find('PUT', '/me/notifications/read-all')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Ler todas' })).toBeNull()
  })
})

describe('ArenaPage: a notificação abre a partida e as filas da administração', () => {
  const me: User = { id: 1, name: 'Ricardo Moura', username: 'ricardo.moura', email: 'r@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
  const football: Profile = { id: 1, sport: 'futebol', city_id: brasilia.id, position: 'atacante', looking_for: false, is_public: false, level: null }
  const nav = () => within(screen.getByRole('navigation', { name: 'Navegação principal' }))

  function api(notifications: ArenaNotification[], extra: Record<string, unknown> = {}) {
    return mockApi({
      'GET /me/sports-profiles': [football],
      'GET /cities': [brasilia],
      'GET /me/notifications/summary': summaryOf({ unread_count: notifications.length }),
      'GET /me/follow-requests': { items: [], next_cursor: null },
      'GET /me/notifications/pending?limit=50': { items: [] },
      'GET /me/notifications?pendente=false': { items: notifications, next_cursor: null },
      'PUT /me/notifications/1/read': summaryOf({ unread_count: 0 }),
      // A tela da partida (J2) lê o detalhe e o chat da partida 12.
      'GET /matches/12': matchDetail({ id: 12 }),
      'GET /matches/12/messages': page([]),
      ...extra,
    })
  }

  it('o aviso de partida abre a tela Partida com o JOGAR aceso e volta às Notificações', async () => {
    api([note('partida_agendada', { match_id: 12, starts_at: kickoff, court_name: 'Quadra do Lago', changed: false })])
    const ui = userEvent.setup()
    render(<ArenaPage user={me} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: 'Notificações, 1 nova' }))
    await ui.click(await screen.findByRole('button', { name: /Partida agendada/ }))
    // A navegação é síncrona: a região principal já se chama "Partida". O título "Partida" da barra de carregamento é
    // transitório (some assim que o detalhe chega), então a espera é pelo cabeçalho do detalhe, com os dois lados.
    expect(screen.getByRole('main', { name: 'Partida' })).not.toBeNull()
    expect(await screen.findByRole('heading', { level: 1, name: /^Ferrugem FC contra / })).not.toBeNull()
    expect(nav().getByRole('button', { name: 'JOGAR' }).getAttribute('aria-current')).toBe('page')
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(await listed()).not.toBeNull()
  })

  it('o W.O. contestado, para a administração, abre a fila com o Perfil aceso', async () => {
    api([note('wo_contestado', { match_id: 12, reason: 'Estávamos lá.' }, { actor: caio })], {
      'GET /admin/walkover-disputes': { items: [dispute()], next_cursor: null },
      'GET /matches/12/messages?limit=12': { items: [], has_more: false, last_id: null },
    })
    const ui = userEvent.setup()
    render(<ArenaPage user={{ ...me, is_admin: true }} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: 'Notificações, 1 nova' }))
    await ui.click(await screen.findByRole('button', { name: /contestou o W\.O\./ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'W.O. contestados' })).not.toBeNull()
    expect(nav().getByRole('button', { current: 'page' }).textContent).toBe('Perfil')
    expect(await screen.findByRole('button', { name: /Ferrugem FC × Tigres do Lago/ })).not.toBeNull()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile, User } from '../src/api/client'
import type { ArenaNotification } from '../src/api/notifications'
import { notificationView } from '../src/data/notifications'
import ArenaPage from '../src/pages/ArenaPage'
import NotificationsPage from '../src/pages/NotificationsPage'
import { brasilia, mockApi, person } from './teams-fixtures'
import { card, detail, fromNow } from './events-fixtures'

/*
 * Notificações da etapa 2 (0003, seção 17): texto e destino dos tipos novos do atleta, do organizador e da
 * administração, e a navegação até o detalhe do evento pelo ArenaPage.
 */

const caio = person(9, 'Caio Ramos')
const ev = { event_id: 3, event_name: 'Copa Sudoeste' }
const note = (id: number, type: string, payload: Record<string, unknown>, extra: Partial<ArenaNotification> = {}): ArenaNotification =>
  ({ id, type, payload: { ...ev, ...payload }, actor: null, created_at: new Date(Date.now() - id * 60e3).toISOString(), read_at: null, ...extra })
const view = (type: string, payload: Record<string, unknown> = {}, extra: Partial<ArenaNotification> = {}, isAdmin = false) =>
  notificationView(note(1, type, payload, extra), { isAdmin })

beforeEach(() => { Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('texto e destino dos tipos da etapa 2', () => {
  it('atleta: inscrição, comprovante, reserva, cancelamento, avisos e devolução levam ao detalhe do evento', () => {
    const toEvent = { screen: 'event', eventId: 3 }
    expect(view('time_inscrito', { entry_id: 5, team_id: 10, team_name: 'Ferrugem FC' }, { actor: caio })).toMatchObject({ text: 'Caio Ramos inscreveu o Ferrugem FC em Copa Sudoeste', kind: 'event', target: toEvent })
    expect(view('comprovante_decidido', { entry_id: 5, receipt_id: 9, decision: 'aprovado' })).toMatchObject({ text: 'Inscrição confirmada em Copa Sudoeste', target: toEvent })
    const deadline = new Date(2026, 9, 20, 16, 0).toISOString()
    expect(view('comprovante_decidido', { entry_id: 5, receipt_id: 9, decision: 'recusado', reason_code: 'valor_diferente', reason_detail: 'faltaram R$ 40', reserved_until: deadline }).text)
      .toMatch(/^Comprovante recusado em Copa Sudoeste: Valor diferente: faltaram R\$ 40\. Envie outro até \w{3}, 20 out · 16:00$/)
    expect(view('comprovante_decidido', { decision: 'recusado', reason_code: 'outro', reason_detail: 'Arquivo de outro evento' }).text)
      .toBe('Comprovante recusado em Copa Sudoeste: Arquivo de outro evento. Envie outro')
    expect(view('reserva_expirada', { entry_id: 5 })).toMatchObject({ text: 'Sua reserva em Copa Sudoeste expirou e a vaga foi liberada', target: toEvent })
    expect(view('evento_cancelado', { entry_id: 5, reason: 'Chuva forte.', refund: true }, { actor: caio }).text)
      .toBe('Copa Sudoeste foi cancelado: Chuva forte. O organizador vai devolver o valor por Pix')
    expect(view('evento_cancelado', { entry_id: 5, reason: 'Chuva forte', refund: false }).text).toBe('Copa Sudoeste foi cancelado: Chuva forte')
    expect(view('aviso_evento', { message_id: 2 }, { actor: caio })).toMatchObject({ text: 'Novo aviso em Copa Sudoeste', target: toEvent })
    expect(view('devolucao_enviada', { entry_id: 5, receipt_id: 21 })).toMatchObject({ text: 'O organizador enviou a devolução de Copa Sudoeste. Confirme o recebimento', target: toEvent })
    expect(view('devolucao_decidida', { entry_id: 5, receipt_id: 21, decision: 'devolvida' }).text).toBe('A administração considerou feita a devolução de Copa Sudoeste')
    expect(view('devolucao_decidida', { entry_id: 5, receipt_id: 21, decision: 'pendente' }).text).toBe('A administração pediu outro comprovante da devolução de Copa Sudoeste')
    expect(view('devolucao_confirmada', { entry_id: 5, receipt_id: 21, automatic: true })).toMatchObject({ text: 'Devolução de Copa Sudoeste considerada recebida após 7 dias', target: toEvent })
  })

  it('organizador: comprovantes, decisão da administração, revogação e devoluções levam à gestão do evento', () => {
    expect(view('comprovante_recebido', { entry_id: 5, receipt_id: 9 }, { actor: caio })).toMatchObject({ text: 'Novo comprovante em Copa Sudoeste', target: { screen: 'event-receipts', eventId: 3 } })
    expect(view('evento_decidido', { decision: 'aprovado' })).toMatchObject({ text: 'Copa Sudoeste foi aprovado e publicado', target: { screen: 'event-manage', eventId: 3 } })
    expect(view('evento_decidido', { decision: 'recusado', reason_code: 'pix_incompleto', reason_detail: null }).text).toBe('Copa Sudoeste foi recusado: Dados do Pix incompletos')
    expect(view('evento_revogacao_decidida', { decision: 'seguir' }).text).toBe('A administração manteve Copa Sudoeste')
    expect(view('evento_revogacao_decidida', { decision: 'cancelado' }).text).toBe('A administração cancelou Copa Sudoeste')
    expect(view('devolucao_confirmada', { entry_id: 5, receipt_id: 21, automatic: false }, { actor: caio })).toMatchObject({ text: 'Caio Ramos confirmou a devolução de Copa Sudoeste', target: { screen: 'event-manage', eventId: 3 } })
    expect(view('devolucao_contestada', { entry_id: 5, receipt_id: 21 }, { actor: caio })).toMatchObject({ text: 'Caio Ramos contestou a devolução de Copa Sudoeste', target: { screen: 'event-manage', eventId: 3 } })
  })

  it('administração: evento para aprovar vai à fila de eventos pagos; contestação, à fila do Menu', () => {
    expect(view('evento_para_aprovar', {}, { actor: caio }, true)).toMatchObject({ text: 'Caio Ramos enviou Copa Sudoeste para aprovação', target: { screen: 'admin-paid-events', eventId: 3 } })
    expect(view('evento_para_aprovar', { event_id: undefined }, {}, true)).toMatchObject({ text: 'Um organizador enviou Copa Sudoeste para aprovação', target: { screen: 'admin-paid-events' } })
    expect(view('devolucao_contestada', {}, { actor: caio }, true).target).toEqual({ screen: 'admin-refund-disputes' })
  })

  it('sem o id do evento, mostra o texto sem destino', () => {
    expect(view('reserva_expirada', { event_id: null, event_name: null })).toMatchObject({ text: 'Sua reserva em um evento expirou e a vaga foi liberada', target: null })
    expect(view('evento_cancelado', { event_id: null, event_name: '', reason: 'Chuva' }).text).toBe('Um evento foi cancelado: Chuva')
  })
})

describe('tela Notificações com os tipos novos', () => {
  it('lista com o ícone de evento e navega marcando como lida', async () => {
    const items = [
      note(1, 'comprovante_recebido', { entry_id: 5, receipt_id: 9 }, { actor: caio }),
      note(2, 'devolucao_contestada', { entry_id: 5, receipt_id: 21 }, { actor: caio }),
    ]
    const calls = mockApi({
      'GET /me/follow-requests': { items: [], next_cursor: null },
      'GET /me/notifications': { items, next_cursor: null },
      'GET /me/notifications/unread-count': { unread_count: 2 },
      'PUT /me/notifications/1/read': { unread_count: 1 },
      'PUT /me/notifications/2/read': { unread_count: 0 },
    })
    const onNavigate = vi.fn()
    const ui = userEvent.setup()
    render(<NotificationsPage isAdmin onOpenUser={vi.fn()} onNavigate={onNavigate} onExpired={vi.fn()} />)
    const list = await screen.findByRole('list', { name: 'Notificações da conta' })
    expect(within(list).getAllByRole('listitem')[0].querySelector('.lucide-trophy')).not.toBeNull()
    await ui.click(within(list).getByRole('button', { name: /Novo comprovante em Copa Sudoeste/ }))
    expect(onNavigate).toHaveBeenLastCalledWith({ screen: 'event-receipts', eventId: 3 })
    await ui.click(within(list).getByRole('button', { name: /contestou a devolução/ }))
    expect(onNavigate).toHaveBeenLastCalledWith({ screen: 'admin-refund-disputes' })
    expect(calls.find('PUT', '/me/notifications/2/read')).toHaveLength(1)
  })
})

describe('ArenaPage: notificação e Jogar levam aos campeonatos do atleta', () => {
  const me: User = { id: 1, name: 'Ricardo Moura', username: 'ricardo.moura', email: 'r@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
  const running: Profile = { id: 3, sport: 'corrida', city_id: brasilia.id, position: null, looking_for: false, is_public: false, level: null }
  const race = detail({ id: 3, name: 'Corrida do Lago', sport: 'corrida', distance_km: 10, competition_type: null, price_cents: 0, pix: null })
  const standings = { calc_version: 1, futebol: { teams: [], individual: [] }, tenis: { state: 'sem_jogos', tier: null, played: 0, required: 3, rank_position: null, metric_value: null, faces: [], faces_any_level: true }, corrida: [] }

  function api(notifications: ArenaNotification[]) {
    return mockApi({
      'GET /me/sports-profiles': [running],
      'GET /cities': [brasilia],
      'GET /me/notifications/unread-count': { unread_count: notifications.length },
      'GET /me/follow-requests': { items: [], next_cursor: null },
      'GET /me/notifications': { items: notifications, next_cursor: null },
      'PUT /me/notifications/1/read': { unread_count: 0 },
      'GET /me/standings': standings,
      'GET /me/entries?scope=ativas&limit=50': { items: [], next_cursor: null },
      [`GET /events?sport=corrida&city_id=${brasilia.id}`]: { items: [card({ ...race, eligibility: race.eligibility })], next_cursor: null },
      'GET /events?sport=futebol': { items: [], next_cursor: null },
      'GET /events/3': race,
    })
  }

  it('o aviso abre o detalhe do evento com o título "Prova" e volta às Notificações', async () => {
    api([note(1, 'aviso_evento', { event_name: 'Corrida do Lago', message_id: 2 }, { created_at: fromNow(-1) })])
    const ui = userEvent.setup()
    render(<ArenaPage user={me} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: 'Notificações, 1 não lida' }))
    await ui.click(await screen.findByRole('button', { name: /Novo aviso em Corrida do Lago/ }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Corrida do Lago' })).not.toBeNull()
    expect(await screen.findByRole('heading', { level: 1, name: 'Prova' })).not.toBeNull()
    expect(within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { name: 'JOGAR' }).getAttribute('aria-current')).toBe('page')
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(await screen.findByRole('list', { name: 'Notificações da conta' })).not.toBeNull()
  })

  it('Jogar → Provas lista os cartazes da corrida e abre o detalhe', async () => {
    api([])
    const ui = userEvent.setup()
    render(<ArenaPage user={me} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} />)
    await ui.click(within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { name: 'JOGAR' }))
    await ui.click(await screen.findByRole('tab', { name: 'Corrida' }))
    await ui.click(within(screen.getByRole('region', { name: 'Provas' })).getByRole('button', { name: /Provas/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Provas' })).not.toBeNull()
    const list = await screen.findByRole('list', { name: 'Provas' })
    await ui.click(within(list).getByRole('button', { name: /Corrida do Lago/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Prova' })).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Provas' })).not.toBeNull())
    expect(screen.getByRole('button', { name: 'Corrida' }).getAttribute('aria-pressed')).toBe('true')
  })
})

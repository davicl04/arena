import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile, User } from '../src/api/client'
import type { ArenaNotification } from '../src/api/notifications'
import type { OrganizerStatus } from '../src/api/organizer'
import ArenaPage from '../src/pages/ArenaPage'
import { brasilia, mockApi, person } from './teams-fixtures'
import { adminEvent, card, detail, dispute, entry, eventCard, eventDetail, fromNow, myEntry, receipt, review, withEntry } from './events-fixtures'

/*
 * Pontas entre as frentes web da etapa 2, com o ArenaPage inteiro: o Menu leva à área do organizador (O3), à gestão do
 * evento (G3) e aos comprovantes (A2) com o evento certo, e convive com as filas da administração (AD1); a placa do
 * Jogar leva aos campeonatos (E2), ao detalhe (D2) e à inscrição, e as notificações abrem a tela de cada papel.
 */

const me: User = { id: 1, name: 'Ricardo Moura', username: 'ricardo.moura', email: 'r@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
const football: Profile = { id: 1, sport: 'futebol', city_id: brasilia.id, position: 'atacante', looking_for: false, is_public: false, level: null }
const approved: OrganizerStatus = { state: 'aprovado', request: null, organizer: { id: 3, display_name: 'Liga Sudoeste', approved_at: '2026-10-12T10:00:00Z' }, revocation: null }
const page = <T,>(items: T[]) => ({ items, next_cursor: null })
const pending = { receipts: 2, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 2 }

/** Evento pago e publicado, com dois comprovantes para analisar. */
const copa = { id: 5, pending, next_action: { kind: 'analisar_comprovantes' as const, count: 2, deadline: null } }
const copaCard = eventCard(copa)
const copaDetail = eventDetail(copa)

function api(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /me/sports-profiles': [football],
    'GET /cities': [brasilia],
    'GET /me/notifications/unread-count': { unread_count: 0 },
    'GET /me/follow-requests': page([]),
    'GET /me/organizer-request': approved,
    'GET /organizer/events?scope=abertos': page([copaCard]),
    'GET /organizer/events?scope=encerrados': page([]),
    ...extra,
  })
}
function renderArena(user: User = me) {
  render(<ArenaPage user={user} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} />)
  return userEvent.setup()
}
const nav = () => within(screen.getByRole('navigation', { name: 'Navegação principal' }))
const lit = () => nav().getByRole('button', { current: 'page' }).textContent
async function openMenu(ui: ReturnType<typeof userEvent.setup>) {
  await ui.click(nav().getByRole('button', { name: 'Perfil' }))
  await ui.click(await screen.findByRole('button', { name: 'Menu' }))
  expect(screen.getByRole('heading', { name: 'Menu' })).not.toBeNull()
}

beforeEach(() => {
  Element.prototype.scrollTo = () => {}
  URL.createObjectURL = vi.fn(() => 'blob:comprovante')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('ligações da etapa 2: organizador', () => {
  it('Menu, Meus eventos, gestão e Comprovantes abrem o mesmo evento e mostram o contador', async () => {
    const calls = api({
      'GET /organizer/events/5': copaDetail,
      'GET /organizer/events/5/receipts?tab=para_analisar': page([review(receipt(101), entry(1, 'Ferrugem FC'))]),
      'GET /receipts/101/file': { imagem: true },
    })
    const ui = renderArena()
    await openMenu(ui)

    // Menu: a seção Organizador com o resumo do que está em aberto e as pendências.
    const section = await screen.findByRole('region', { name: 'Organizador' })
    const list = within(section).getByRole('button', { name: /^Meus eventos/ })
    expect(list.textContent).toContain('1 evento em aberto · 2 pendências')
    expect(screen.queryByRole('heading', { name: 'Administração' })).toBeNull()

    // O3: o cartaz do evento, com o alerta de pendências.
    await ui.click(list)
    expect(await screen.findByRole('heading', { name: 'Meus eventos' })).not.toBeNull()
    expect(lit()).toBe('Perfil')
    await ui.click(await screen.findByRole('button', { name: /Copa Sudoeste Society/ }))

    // G3: a seção Comprovantes com a contagem e o cartão "Agora".
    expect(await screen.findByRole('heading', { name: 'Gestão do evento' })).not.toBeNull()
    expect(await screen.findByRole('heading', { name: '2 comprovantes para analisar' })).not.toBeNull()
    expect(lit()).toBe('Perfil')
    await ui.click(screen.getByRole('button', { name: /Comprovantes\s*2 comprovantes para analisar/ }))

    // A2: o evento 5, a lista da aba "Para analisar" e o contador na placa e na aba.
    expect(await screen.findByRole('heading', { name: 'Comprovantes' })).not.toBeNull()
    expect(await screen.findByRole('list', { name: 'Comprovantes para analisar' })).not.toBeNull()
    expect(screen.getByText(/^2 comprovantes para analisar · inscrições até/)).not.toBeNull()
    expect(screen.getByRole('tab', { name: 'Para analisar (2)' })).not.toBeNull()
    expect(lit()).toBe('Perfil')
    expect(calls.find('GET', '/organizer/events/5/receipts?tab=para_analisar')).toHaveLength(1)
    expect(calls.calls.filter(call => /\/organizer\/events\/\d+/.test(call.path) && !call.path.startsWith('/organizer/events/5'))).toHaveLength(0)

    // Voltar do A2 leva à gestão do mesmo evento; voltar da gestão, à lista.
    await ui.click(screen.getByRole('button', { name: 'Voltar para o evento' }))
    expect(await screen.findByRole('heading', { name: 'Gestão do evento' })).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(await screen.findByRole('heading', { name: 'Meus eventos' })).not.toBeNull()
  })

  it('o cartaz da seção Organizador do Menu abre direto a gestão do evento', async () => {
    api({ 'GET /organizer/events/5': copaDetail })
    const ui = renderArena()
    await openMenu(ui)
    const section = await screen.findByRole('region', { name: 'Organizador' })
    await ui.click(await within(section).findByRole('button', { name: /Copa Sudoeste Society/ }))
    expect(await screen.findByRole('heading', { name: 'Gestão do evento' })).not.toBeNull()
    expect(await screen.findByRole('heading', { name: 'Copa Sudoeste Society' })).not.toBeNull()
    expect(lit()).toBe('Perfil')
  })
})

describe('ligações da etapa 2: administração', () => {
  const counts = { organizer_requests: 1, reports: 0, paid_events: 3, revoked_events: 1, refund_disputes: 2 }

  it('Menu mostra o Organizador e a Administração juntos e abre Eventos pagos com a aba Perfil acesa', async () => {
    const calls = api({
      'GET /admin/queue-counts': counts,
      'GET /admin/events?queue=em_aprovacao': page([adminEvent({ id: 9, name: 'Torneio Relâmpago Society' })]),
    })
    const ui = renderArena({ ...me, is_admin: true })
    await openMenu(ui)

    expect(await screen.findByRole('region', { name: 'Organizador' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Administração' })).not.toBeNull()
    const paid = await screen.findByRole('button', { name: /Eventos pagos/ })
    expect(await within(paid).findByText('3', { exact: false })).not.toBeNull()
    expect(paid.textContent).toContain('3 pendentes')
    expect(screen.getByRole('button', { name: /Eventos de organizador revogado/ }).textContent).toContain('1 pendente')
    expect(screen.getByRole('button', { name: /Devoluções contestadas/ }).textContent).toContain('2 pendentes')

    await ui.click(paid)
    expect(screen.getByRole('heading', { name: 'Eventos pagos' })).not.toBeNull()
    expect(lit()).toBe('Perfil')
    const queue = await screen.findByRole('list', { name: 'Eventos pagos para aprovar' })
    expect(within(queue).getByRole('button', { name: /Torneio Relâmpago Society/ })).not.toBeNull()
    expect(calls.find('GET', '/admin/events?queue=em_aprovacao')).toHaveLength(1)

    // Voltar devolve ao Menu, com as duas seções.
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('heading', { name: 'Menu' })).not.toBeNull()
    expect(await screen.findByRole('region', { name: 'Organizador' })).not.toBeNull()
  })

  it('abre as filas de organizador revogado e de devoluções contestadas pelo Menu', async () => {
    const calls = api({
      'GET /admin/queue-counts': counts,
      'GET /admin/events?queue=revogacao': page([adminEvent({ id: 12, name: 'Copa do Cerrado', state: 'publicado', phase: 'inscricoes_abertas', revocation_pending: true })]),
      'GET /admin/refund-disputes': page([dispute()]),
      'GET /entries/7/receipts': page([]),
    })
    const ui = renderArena({ ...me, is_admin: true })
    await openMenu(ui)

    await ui.click(await screen.findByRole('button', { name: /Eventos de organizador revogado/ }))
    expect(screen.getByRole('heading', { name: 'Organizador revogado' })).not.toBeNull()
    expect(lit()).toBe('Perfil')
    expect(await screen.findByRole('button', { name: /Copa do Cerrado/ })).not.toBeNull()
    expect(calls.find('GET', '/admin/events?queue=revogacao')).toHaveLength(1)
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))

    await ui.click(await screen.findByRole('button', { name: /Devoluções contestadas/ }))
    expect(screen.getByRole('heading', { name: 'Devoluções contestadas' })).not.toBeNull()
    expect(lit()).toBe('Perfil')
    expect(await screen.findByRole('button', { name: /Ferrugem FC/ })).not.toBeNull()
    expect(calls.find('GET', '/admin/refund-disputes')).toHaveLength(1)
  })

  it('quem não é da administração não vê as filas nem consulta os contadores', async () => {
    const calls = api()
    const ui = renderArena()
    await openMenu(ui)
    await screen.findByRole('region', { name: 'Organizador' })
    expect(screen.queryByRole('heading', { name: 'Administração' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Eventos pagos/ })).toBeNull()
    expect(calls.find('GET', '/admin/queue-counts')).toHaveLength(0)
  })
})

describe('ligações da etapa 2: atleta', () => {
  const tennis: Profile = { id: 2, sport: 'tenis', city_id: brasilia.id, position: null, looking_for: false, is_public: false, level: null }
  const standings = {
    calc_version: 1, futebol: { teams: [], individual: [] }, corrida: [],
    tenis: { state: 'sem_jogos', tier: null, played: 0, required: 3, rank_position: null, metric_value: null, faces: [], faces_any_level: true },
  }
  const free = { price_cents: 0, pix: null }

  /** Jogar → aba Tênis → "Campeonatos" da placa. */
  async function openTennisEvents(ui: ReturnType<typeof userEvent.setup>) {
    await ui.click(nav().getByRole('button', { name: 'JOGAR' }))
    await ui.click(await screen.findByRole('tab', { name: 'Tênis' }))
    await ui.click(within(await screen.findByRole('region', { name: 'Outras formas de jogar' })).getByRole('button', { name: /Campeonatos/ }))
  }

  it('placa do Jogar, Campeonatos (E2), detalhe (D2) e inscrição gratuita confirmada', async () => {
    let enrolled = false
    const confirmed = myEntry({ state: 'confirmada', price_cents: 0, reserved_until: null, confirmed_at: fromNow(0), can_send_receipt: false, can_cancel: true })
    const calls = api({
      'GET /me/sports-profiles': [tennis],
      'GET /me/standings': standings,
      'GET /me/entries?scope=ativas&limit=50': page([]),
      [`GET /events?sport=tenis&city_id=${brasilia.id}`]: page([card(free)]),
      'GET /events/1': () => (enrolled ? withEntry(detail(free), confirmed) : detail(free)),
      'POST /events/1/entries': () => { enrolled = true; return confirmed },
      'GET /entries/5': confirmed,
    })
    const ui = renderArena()
    await openTennisEvents(ui)

    // E2: título, lista da cidade do perfil e aba JOGAR acesa.
    expect(await screen.findByRole('heading', { level: 1, name: 'Campeonatos' })).not.toBeNull()
    expect(lit()).toBe('JOGAR')
    const list = await screen.findByRole('list', { name: 'Campeonatos' })
    await ui.click(within(list).getByRole('button', { name: /Copa Sudoeste/ }))

    // D2: título "Campeonato" e o botão fixo; a inscrição gratuita é confirmada na hora.
    expect(await screen.findByRole('heading', { level: 1, name: 'Campeonato' })).not.toBeNull()
    await ui.click(await screen.findByRole('button', { name: 'Inscrever-se · Grátis' }))
    await ui.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar inscrição' }))
    expect(await screen.findByText('Inscrição confirmada em Copa Sudoeste.')).not.toBeNull()
    expect(calls.find('POST', '/events/1/entries')[0].body).toEqual({})
    expect(lit()).toBe('JOGAR')

    // Voltar devolve à lista, na modalidade escolhida.
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Campeonatos' })).not.toBeNull()
    expect(screen.getByRole('button', { name: /Tênis/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('o organizador no detalhe do evento abre a gestão', async () => {
    api({
      'GET /me/sports-profiles': [tennis],
      'GET /me/standings': standings,
      'GET /me/entries?scope=ativas&limit=50': page([]),
      [`GET /events?sport=tenis&city_id=${brasilia.id}`]: page([card({ ...free, id: 5 })]),
      'GET /events/5': detail({ ...free, id: 5, is_organizer: true, can_read_messages: true }),
      'GET /events/5/messages': page([]),
      'GET /organizer/events/5': copaDetail,
    })
    const ui = renderArena()
    await openTennisEvents(ui)
    await ui.click(within(await screen.findByRole('list', { name: 'Campeonatos' })).getByRole('button', { name: /Copa Sudoeste/ }))
    await ui.click(await screen.findByRole('button', { name: 'Abrir gestão' }))
    expect(await screen.findByRole('heading', { name: 'Gestão do evento' })).not.toBeNull()
    expect(await screen.findByRole('heading', { name: '2 comprovantes para analisar' })).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Campeonato' })).not.toBeNull()
  })
})

describe('ligações da etapa 2: notificações', () => {
  const note = (id: number, type: string, payload: Record<string, unknown>): ArenaNotification =>
    ({ id, type, payload, actor: person(9, 'Caio Ramos'), created_at: fromNow(-id), read_at: null })
  const withNotifications = (items: ArenaNotification[], extra: Record<string, unknown> = {}) => api({
    'GET /me/notifications/unread-count': { unread_count: items.length },
    'GET /me/notifications': page(items),
    [`PUT /me/notifications/${items[0].id}/read`]: { unread_count: items.length - 1 },
    ...extra,
  })
  async function openFirst(ui: ReturnType<typeof userEvent.setup>, text: RegExp) {
    await ui.click(await screen.findByRole('button', { name: 'Notificações, 1 não lida' }))
    await ui.click(await screen.findByRole('button', { name: text }))
  }

  it('comprovante recebido abre a tela de comprovantes do evento certo', async () => {
    const calls = withNotifications([note(1, 'comprovante_recebido', { event_id: 5, event_name: 'Copa Sudoeste Society', entry_id: 3 })], {
      'GET /organizer/events/5': copaDetail,
      'GET /organizer/events/5/receipts?tab=para_analisar': page([review(receipt(101), entry(1, 'Ferrugem FC'))]),
      'GET /receipts/101/file': { imagem: true },
    })
    const ui = renderArena()
    await openFirst(ui, /Novo comprovante em Copa Sudoeste Society/)
    expect(await screen.findByRole('heading', { name: 'Comprovantes' })).not.toBeNull()
    expect(await screen.findByRole('list', { name: 'Comprovantes para analisar' })).not.toBeNull()
    expect(calls.find('GET', '/organizer/events/5/receipts?tab=para_analisar')).toHaveLength(1)
    expect(calls.find('PUT', '/me/notifications/1/read')).toHaveLength(1)
    // Voltar da tela de comprovantes retorna às Notificações, de onde foi aberta.
    await ui.click(screen.getByRole('button', { name: 'Voltar para o evento' }))
    expect(await screen.findByRole('list', { name: 'Notificações da conta' })).not.toBeNull()
  })

  it('evento para aprovar leva a administração à fila de eventos pagos', async () => {
    const calls = withNotifications([note(1, 'evento_para_aprovar', { event_id: 9, event_name: 'Torneio Relâmpago Society' })], {
      'GET /admin/events?queue=em_aprovacao': page([adminEvent({ id: 9, name: 'Torneio Relâmpago Society' })]),
    })
    const ui = renderArena({ ...me, is_admin: true })
    await openFirst(ui, /enviou Torneio Relâmpago Society para aprovação/)
    expect(await screen.findByRole('heading', { name: 'Eventos pagos' })).not.toBeNull()
    expect(await screen.findByRole('list', { name: 'Eventos pagos para aprovar' })).not.toBeNull()
    expect(calls.find('GET', '/admin/events?queue=em_aprovacao')).toHaveLength(1)
  })

  it('devolução contestada leva a administração à fila de contestações e o organizador, à gestão', async () => {
    const contested = note(1, 'devolucao_contestada', { event_id: 5, event_name: 'Copa Sudoeste Society', entry_id: 7 })
    const admin = withNotifications([contested], {
      'GET /admin/refund-disputes': page([dispute()]),
      'GET /entries/7/receipts': page([]),
    })
    const ui = renderArena({ ...me, is_admin: true })
    await openFirst(ui, /contestou a devolução de Copa Sudoeste Society/)
    expect(await screen.findByRole('heading', { name: 'Devoluções contestadas' })).not.toBeNull()
    expect(await screen.findByRole('button', { name: /Ferrugem FC/ })).not.toBeNull()
    expect(admin.find('GET', '/admin/refund-disputes')).toHaveLength(1)
    expect(lit()).toBe('Perfil')
    cleanup()

    // Para o organizador (sem administração), a mesma notificação abre a gestão do evento.
    withNotifications([contested], { 'GET /organizer/events/5': copaDetail })
    const ui2 = renderArena()
    await openFirst(ui2, /contestou a devolução de Copa Sudoeste Society/)
    expect(await screen.findByRole('heading', { name: 'Gestão do evento' })).not.toBeNull()
    expect(screen.queryByRole('heading', { name: 'Devoluções contestadas' })).toBeNull()
  })
})

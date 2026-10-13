import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import type { ArenaNotification, NotificationFilterCategory } from '../src/api/notifications'
import { listed, noteOf, summaryOf } from './notifications-fixtures'
import { NotificationsHarness } from './notifications-harness'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

/** Meio-dia fixo: "Hoje", "Ontem" e os prazos não dependem da hora em que o teste roda. */
const NOON = new Date(2026, 9, 13, 12, 0, 0)
const caio = { id: 30, name: 'Caio Ramos', username: 'caio', avatar_url: null }
const minutesAgo = (minutes: number) => new Date(NOON.getTime() - minutes * 60_000).toISOString()
const minutesAhead = (minutes: number) => new Date(NOON.getTime() + minutes * 60_000).toISOString()

/* O que o servidor devolve: pendências em /pending (e nunca na lista de pendente=false). */
const invite = noteOf(1, 'convite_time', { team_id: 9, team_name: 'Leões do Cerrado', invite_id: 3 },
  { actor: caio, category: 'times', pending: true, created_at: minutesAgo(30), action_until: null })
const proposal = noteOf(2, 'proposta_partida', { match_id: 12, opponent_name: 'Tigres do Lago', format: 'society' },
  { category: 'partidas', pending: true, created_at: minutesAgo(8), action_until: minutesAhead(112) })
const refused = noteOf(3, 'pedido_organizador_decidido', { request_id: 4, decision: 'recusado', reason_code: 'pouca_informacao', reason_detail: null },
  { category: 'conta', created_at: minutesAgo(60) })
const removed = noteOf(4, 'removido_do_time', { team_id: 9, team_name: 'Leões do Cerrado' }, { category: 'times', created_at: minutesAgo(26 * 60) })
const accepted = noteOf(5, 'convite_aceito', { team_id: 9, team_name: 'Leões do Cerrado', invite_id: 3 },
  { actor: caio, category: 'times', created_at: minutesAgo(3 * 24 * 60), read_at: minutesAgo(2 * 24 * 60) })
const tableOut = noteOf(6, 'tabela_publicada', { event_id: 5, event_name: 'Copa Sudoeste' },
  { category: 'eventos', created_at: minutesAgo(10 * 24 * 60), read_at: minutesAgo(9 * 24 * 60) })
const person = (id: number, name: string) => ({
  user: { id, name, username: name.toLowerCase().replace(/\s+/g, '.'), avatar_url: null, cover_url: null, social_public: false, post_count: 0,
    follower_count: 0, following_count: 0, follows_you: false, follow_state: 'pending' as const },
  state: 'pending',
})
const bruna = person(50, 'Bruna Alves')
const diego = person(51, 'Diego Souza')

interface Options {
  items?: ArenaNotification[]
  pending?: ArenaNotification[]
  follow?: ReturnType<typeof person>[]
  /** Total de pedidos para seguir no resumo (padrão: o tamanho de `follow`). */
  followTotal?: number
  next?: string | null
  failRead?: boolean
  failFeed?: number
  failPending?: number
  failFollow?: number
}
let calls: { path: string; method?: string; body?: unknown }[]
const paths = () => calls.map(call => call.path)

/** Servidor simulado: o resumo é calculado dos dados, como o backend, e ler uma notificação a tira das não lidas. */
function mockServer({ items = [], pending = [], follow = [], followTotal = follow.length, next = null, failRead = false, failFeed = 0, failPending = 0, failFollow = 0 }: Options = {}) {
  calls = []
  const all = [...items, ...pending]
  const unread = new Set(all.filter(item => !item.read_at).map(item => item.id))
  const summary = () => {
    const byCategory = (category: NotificationFilterCategory) => all.filter(item => unread.has(item.id) && item.category === category).length
    return summaryOf({ unread_count: unread.size, follow_requests_count: followTotal, pending_count: pending.length,
      unread_by_category: { partidas: byCategory('partidas'), times: byCategory('times'), eventos: byCategory('eventos') } })
  }
  const failures = { feed: failFeed, pending: failPending, follow: failFollow }
  vi.mocked(request).mockImplementation(async (path, method, body) => {
    calls.push({ path, method, body })
    const url = new URL(path, 'http://arena.test')
    const category = url.searchParams.get('categoria')
    if (path === '/me/notifications/summary') return summary() as never
    if (url.pathname === '/me/notifications/pending') {
      if (failures.pending-- > 0) throw new ApiError('Não foi possível carregar as pendências.', 500)
      return { items: pending.filter(item => !category || item.category === category) } as never
    }
    if (url.pathname === '/me/notifications') {
      if (failures.feed-- > 0) throw new ApiError('Serviço indisponível.', 503)
      if (url.searchParams.has('cursor')) return { items: [noteOf(40, 'time_encerrado', { team_id: 8, team_name: 'Ferrugem FC' }, { category: 'times', read_at: minutesAgo(1) })], next_cursor: null } as never
      return { items: items.filter(item => !category || item.category === category), next_cursor: next } as never
    }
    if (path === '/me/follow-requests') {
      if (failures.follow-- > 0) throw new ApiError('Não foi possível carregar os pedidos.', 500)
      return { items: follow, next_cursor: null } as never
    }
    if (path === '/me/notifications/read-all') { unread.clear(); return summary() as never }
    const one = path.match(/^\/me\/notifications\/(\d+)\/read$/)
    if (one) {
      if (failRead) throw new ApiError('Notificação não encontrada.', 404)
      unread.delete(Number(one[1]))
      return summary() as never
    }
    throw new Error(`rota inesperada ${path}`)
  })
}

beforeEach(() => {
  vi.mocked(request).mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOON)
})
afterEach(() => { cleanup(); vi.useRealTimers() })

const chip = (name: string) => screen.getByRole('button', { name })
const everything = { items: [refused, removed, accepted, tableOut], pending: [proposal, invite] }

describe('Notificações: placa, resumo e filtros', () => {
  it.each([
    ['não lidas e pendências', { items: [refused], pending: [proposal, invite] }, '3 não lidas · 2 pedem sua resposta'],
    ['uma de cada', { items: [], pending: [invite] }, '1 não lida · 1 pede sua resposta'],
    ['tudo lido com pendências', { items: [], pending: [{ ...invite, read_at: minutesAgo(1) }] }, 'Tudo lido · 1 ainda pede sua resposta'],
    ['só não lidas', { items: [refused, removed], pending: [] }, '2 não lidas'],
  ])('linha de resumo: %s', async (_name, options, text) => {
    mockServer(options)
    render(<NotificationsHarness />)
    await waitFor(() => expect(document.querySelector('header p')?.textContent).toBe(text))
  })

  it('sem nada, o resumo diz "Tudo em dia" e a tela mostra o estado vazio com o Coliseu', async () => {
    mockServer()
    render(<NotificationsHarness />)
    await waitFor(() => expect(screen.getAllByText('Tudo em dia')).toHaveLength(2))
    expect(screen.getByRole('heading', { level: 2, name: 'Tudo em dia' })).not.toBeNull()
    expect(screen.getByText(/Convites e pedidos dos seus times/)).not.toBeNull()
    expect(document.querySelector('[data-slot="empty-state"] [style*="width"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Ler todas' })).toBeNull()
  })

  it('os chips são um grupo de opção única e mostram as contagens combinadas', async () => {
    mockServer({ ...everything })
    render(<NotificationsHarness />)
    const group = await screen.findByRole('group', { name: 'Filtrar notificações' })
    await waitFor(() => expect(within(group).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual([
      'Tudo', 'Para responder, 2 pendências', 'Partidas, 1 não lida', 'Times, 2 não lidas', 'Eventos',
    ]))
    expect(chip('Tudo').getAttribute('aria-pressed')).toBe('true')
    expect(chip('Partidas, 1 não lida').getAttribute('aria-pressed')).toBe('false')
    await userEvent.setup().click(chip('Times, 2 não lidas'))
    expect(chip('Times, 2 não lidas').getAttribute('aria-pressed')).toBe('true')
    expect(chip('Tudo').getAttribute('aria-pressed')).toBe('false')
    // Escolher o mesmo chip de novo não o desmarca.
    await userEvent.setup().click(chip('Times, 2 não lidas'))
    expect(chip('Times, 2 não lidas').getAttribute('aria-pressed')).toBe('true')
  })

  it('as setas movem o foco entre os chips', async () => {
    mockServer({ ...everything })
    render(<NotificationsHarness />)
    await screen.findByRole('button', { name: 'Para responder, 2 pendências' })
    chip('Tudo').focus()
    await userEvent.setup().keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(chip('Para responder, 2 pendências'))
  })

  it('Voltar chama onBack', async () => {
    mockServer({ pending: [proposal] })
    const onBack = vi.fn()
    render(<NotificationsHarness onBack={onBack} />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('Notificações: consulta de cada chip', () => {
  it('Tudo lê as pendências e a lista sem as pendências, sem a rota antiga', async () => {
    mockServer({ ...everything })
    render(<NotificationsHarness />)
    await listed()
    expect(paths()).toEqual(expect.arrayContaining(['/me/notifications/pending?limit=50', '/me/notifications?pendente=false']))
    expect(paths()).not.toContain('/me/notifications')
    expect(paths()).not.toContain('/me/follow-requests')
  })

  it.each([
    ['Partidas, 1 não lida', 'partidas'],
    ['Times, 2 não lidas', 'times'],
    ['Eventos', 'eventos'],
  ])('%s lê as pendências e a lista da categoria %s, sem recarregar o resumo', async (name, category) => {
    mockServer({ ...everything })
    render(<NotificationsHarness />)
    await listed()
    const reads = () => paths().filter(path => path === '/me/notifications/summary').length
    const before = reads()
    await userEvent.setup().click(chip(name))
    await waitFor(() => expect(paths()).toContain(`/me/notifications?categoria=${category}&pendente=false`))
    expect(paths()).toContain(`/me/notifications/pending?categoria=${category}&limit=50`)
    expect(reads()).toBe(before)
  })

  it('Para responder lê só as pendências e mostra só os cartões', async () => {
    mockServer({ ...everything })
    render(<NotificationsHarness />)
    await listed()
    calls.length = 0
    await userEvent.setup().click(chip('Para responder, 2 pendências'))
    await waitFor(() => expect(screen.queryAllByRole('listitem')).toHaveLength(0))
    expect(screen.getAllByRole('article')).toHaveLength(2)
    // As pendências de Tudo e de Para responder são as mesmas (até 50): nada novo a ler, e a lista nem é pedida.
    expect(paths().filter(path => path.startsWith('/me/notifications?'))).toEqual([])
  })

  it('abre já no chip pedido e mostra "Nada neste filtro." quando ele está vazio', async () => {
    mockServer({ items: [refused, removed], pending: [proposal, invite] })
    render(<NotificationsHarness filter="eventos" />)
    expect(await screen.findByText('Nada neste filtro.')).not.toBeNull()
    expect(chip('Eventos').getAttribute('aria-pressed')).toBe('true')
  })

  it('o chip de categoria mostra as pendências e as notificações dela', async () => {
    mockServer({ ...everything })
    render(<NotificationsHarness />)
    await listed()
    await userEvent.setup().click(chip('Times, 2 não lidas'))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1))
    expect(screen.getByRole('article').textContent).toContain('CONVITE DE TIME')
    expect(screen.getAllByRole('listitem').map(row => row.textContent).join('|')).toContain('Você foi removido do Leões do Cerrado')
    expect(screen.queryByText(/Seu pedido de organizador/)).toBeNull()
  })
})

describe('Notificações: pendências fixadas e lista por dia', () => {
  it('põe o bloco "Para responder" antes e agrupa o resto por dia', async () => {
    mockServer({ ...everything })
    render(<NotificationsHarness />)
    await listed()
    const headings = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)
    expect(headings).toEqual(['Para responder2', 'Hoje', 'Ontem', 'Esta semana', 'Anteriores'])
    const first = screen.getAllByRole('article')[0]
    const list = screen.getAllByRole('list')[0]
    expect(first.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const rows = screen.getAllByRole('listitem').map(row => row.textContent ?? '')
    expect(rows[0]).toBe('Seu pedido de organizador foi recusado: Pouca informaçãohá 1 hora · não lida')
    expect(rows[1]).toBe('LCVocê foi removido do Leões do Cerradoontem · não lida')
    expect(rows[2]).toBe('LCCaio Ramos aceitou o convite e entrou no Leões do Cerradohá 3 dias')
    expect(rows[3]).toMatch(/^A tabela de Copa Sudoeste saiu/)
  })

  it('cada cartão traz rótulo curto, texto, tempo, prazo e o botão da ação', async () => {
    mockServer({ pending: [proposal, invite] })
    render(<NotificationsHarness />)
    const cards = await screen.findAllByRole('article')
    expect(cards[0].textContent).toContain('PARTIDA ENCONTRADA')
    expect(cards[0].textContent).toContain('Partida encontrada contra Tigres do Lago. Responda em até 2 h')
    expect(cards[0].textContent).toContain('há 8 min')
    expect(cards[0].textContent).toContain('faltam 1 h 52')
    // Proposta de 2 h com 1 h 52 restante (93%): ainda não é urgente, a barra segue verde.
    expect(cards[0].hasAttribute('data-warn')).toBe(false)
    expect((cards[0].querySelector('[style*="width"]') as HTMLElement).style.width).toBe('93%')
    expect(within(cards[0]).getByRole('button', { name: 'Responder proposta' })).not.toBeNull()
    expect(cards[1].textContent).toContain('CONVITE DE TIME')
    expect(cards[1].textContent).toContain('sem prazo')
    expect(cards[1].querySelector('[style*="width"]')).toBeNull()
    expect(within(cards[1]).getByRole('button', { name: 'Ver convite' })).not.toBeNull()
  })

  it('a barra fica âmbar só com menos de 25% do tempo restante, não por horas fixas', async () => {
    // 30 min de 90 (33%): verde, mesmo com menos de 1 h. 1 dia de 11 (9%): âmbar. 10 h de 11 (91%): verde.
    const soon = noteOf(7, 'wo_registrado', { match_id: 13, opponent_name: 'Atlético Norte' }, { category: 'partidas', pending: true, created_at: minutesAgo(60), action_until: minutesAhead(30) })
    const late = noteOf(8, 'resultado_divergente', { match_id: 14 }, { category: 'partidas', pending: true, created_at: minutesAgo(10 * 24 * 60), action_until: minutesAhead(24 * 60) })
    const roomy = noteOf(9, 'comprovante_recebido', { event_id: 5, event_name: 'Copa Sudoeste' }, { category: 'eventos', pending: true, created_at: minutesAgo(60), action_until: minutesAhead(10 * 60) })
    mockServer({ pending: [soon, late, roomy] })
    render(<NotificationsHarness />)
    const cards = await screen.findAllByRole('article')
    expect(cards.map(card => card.hasAttribute('data-warn'))).toEqual([false, true, false])
    expect(cards[0].textContent).toContain('faltam 30 min')
    expect(cards[1].textContent).toContain('faltam 1 d')
    expect(cards[2].textContent).toContain('faltam 10 h')
    expect(screen.getByRole('button', { name: 'Contestar W.O.' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Revisar resultado' })).not.toBeNull()
  })

  it('o botão do cartão marca como lida, leva ao destino e a pendência continua no bloco', async () => {
    mockServer({ items: [refused], pending: [proposal] })
    const onNavigate = vi.fn()
    render(<NotificationsHarness onNavigate={onNavigate} />)
    const ui = userEvent.setup()
    await ui.click(await screen.findByRole('button', { name: 'Responder proposta' }))
    expect(calls).toContainEqual({ path: '/me/notifications/2/read', method: 'PUT', body: {} })
    expect(onNavigate).toHaveBeenLastCalledWith({ screen: 'play', matchId: 12 })
    await waitFor(() => expect(screen.getByRole('article').hasAttribute('data-unread')).toBe(false))
    expect(screen.getByRole('article')).not.toBeNull()
    // A segunda vez só navega.
    await ui.click(screen.getByRole('button', { name: 'Responder proposta' }))
    expect(onNavigate).toHaveBeenCalledTimes(2)
    expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
    // O resumo acompanha: sobrou a recusada e a pendência, já lida, segue pedindo resposta.
    await waitFor(() => expect(document.querySelector('header p')?.textContent).toBe('1 não lida · 1 pede sua resposta'))
  })

  it('o botão do cartão navega mesmo se marcar como lida falhar', async () => {
    mockServer({ pending: [proposal], failRead: true })
    const onNavigate = vi.fn()
    render(<NotificationsHarness onNavigate={onNavigate} />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Responder proposta' }))
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'play', matchId: 12 })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('"Ler todas" atualiza o resumo, as linhas e os cartões, e mantém a pendência no bloco', async () => {
    mockServer({ items: [refused, removed], pending: [proposal] })
    render(<NotificationsHarness />)
    await listed()
    await waitFor(() => expect(document.querySelector('header p')?.textContent).toBe('3 não lidas · 1 pede sua resposta'))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ler todas' }))
    expect(calls).toContainEqual({ path: '/me/notifications/read-all', method: 'PUT', body: {} })
    expect((await screen.findByRole('status')).textContent).toBe('Todas as notificações foram marcadas como lidas.')
    await waitFor(() => expect(document.querySelector('header p')?.textContent).toBe('Tudo lido · 1 ainda pede sua resposta'))
    expect(document.querySelectorAll('[data-unread]')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Ler todas' })).toBeNull()
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('mostra o erro de "Ler todas"', async () => {
    mockServer({ items: [refused] })
    const ui = userEvent.setup()
    render(<NotificationsHarness />)
    await listed()
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/me/notifications/read-all') throw new ApiError('Falha ao marcar.', 500)
      throw new Error(`rota inesperada ${path}`)
    })
    await ui.click(screen.getByRole('button', { name: 'Ler todas' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Falha ao marcar.')
  })
})

describe('Notificações: linhas', () => {
  it('lista com texto, tempo relativo e estado de leitura', async () => {
    mockServer({ items: [refused, removed, accepted] })
    render(<NotificationsHarness />)
    await listed()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows.filter(row => row.hasAttribute('data-unread'))).toHaveLength(2)
    expect(rows[1].querySelector('[data-slot="team-crest"]')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('ao tocar numa linha, marca como lida e navega', async () => {
    mockServer({ items: [{ ...removed, type: 'convite_aceito', payload: { team_id: 9, team_name: 'Leões do Cerrado' }, actor: caio }] })
    const onNavigate = vi.fn()
    render(<NotificationsHarness onNavigate={onNavigate} />)
    await userEvent.setup().click(await screen.findByRole('button', { name: /aceitou o convite/ }))
    expect(calls).toContainEqual({ path: '/me/notifications/4/read', method: 'PUT', body: {} })
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'teams', teamId: 9 })
  })

  it('leva as decisões do organizador ao Menu, mesmo se marcar como lida falhar', async () => {
    mockServer({ items: [refused], failRead: true })
    const onNavigate = vi.fn()
    render(<NotificationsHarness onNavigate={onNavigate} />)
    await userEvent.setup().click(await screen.findByRole('button', { name: /pedido de organizador/ }))
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'menu' })
  })

  it('sem destino, só marca como lida e fica na tela', async () => {
    mockServer({ items: [removed] })
    const onNavigate = vi.fn()
    render(<NotificationsHarness onNavigate={onNavigate} />)
    await userEvent.setup().click(await screen.findByRole('button', { name: /removido do/ }))
    await waitFor(() => expect(screen.getByText(/removido do/).closest('li')?.hasAttribute('data-unread')).toBe(false))
    expect(onNavigate).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /removido do/ })).toBeNull()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Ler todas' })).toBeNull())
  })

  it('mostra o erro ao marcar como lida sem destino', async () => {
    mockServer({ items: [removed], failRead: true })
    const onNavigate = vi.fn()
    render(<NotificationsHarness onNavigate={onNavigate} />)
    await userEvent.setup().click(await screen.findByRole('button', { name: /removido do/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('Notificação não encontrada.')
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('carrega mais páginas com o cursor', async () => {
    mockServer({ items: [accepted], next: 'n2' })
    render(<NotificationsHarness />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Carregar mais notificações' }))
    expect(await screen.findByText('O Ferrugem FC foi encerrado')).not.toBeNull()
    expect(paths()).toContain('/me/notifications?pendente=false&cursor=n2')
  })

  it('mostra o erro da lista com nova tentativa, mantendo as pendências', async () => {
    mockServer({ items: [accepted], pending: [proposal], failFeed: 1 })
    render(<NotificationsHarness />)
    expect((await screen.findByRole('alert')).textContent).toContain('Serviço indisponível.')
    expect(screen.getByRole('article')).not.toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText(/aceitou o convite/)).not.toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('mostra o erro das pendências na própria seção, com as linhas da lista', async () => {
    mockServer({ items: [accepted], pending: [proposal], failPending: 1 })
    render(<NotificationsHarness />)
    const section = await screen.findByRole('region', { name: 'Para responder' })
    expect(within(section).getByRole('alert').textContent).toContain('Não foi possível carregar as pendências.')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    await userEvent.setup().click(within(section).getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('article')).not.toBeNull()
  })
})

describe('Notificações: pedidos para seguir', () => {
  it.each([
    [[bruna], 1, '1 pedido para seguir', 'Bruna Alves'],
    [[bruna, diego], 2, '2 pedidos para seguir', 'Bruna Alves e Diego Souza'],
    [[bruna, diego], 4, '4 pedidos para seguir', 'Bruna Alves, Diego Souza e mais 2'],
  ])('a linha-resumo no topo de Tudo: %#', async (follow, total, title, names) => {
    mockServer({ items: [accepted], follow, followTotal: total })
    const onOpen = vi.fn()
    render(<NotificationsHarness onOpenFollowRequests={onOpen} />)
    const line = await screen.findByRole('button', { name: new RegExp(title) })
    expect(line.textContent).toContain(names)
    expect(line.querySelectorAll('[data-slot="social-photo"]').length).toBe(follow.length)
    await userEvent.setup().click(line)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('só aparece em Tudo e conta no resumo da placa e no estado vazio', async () => {
    mockServer({ follow: [bruna], items: [] })
    render(<NotificationsHarness />)
    await screen.findByRole('button', { name: /1 pedido para seguir/ })
    expect(screen.queryByText('Nada neste filtro.')).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: 'Tudo em dia' })).toBeNull()
    await userEvent.setup().click(chip('Partidas'))
    await screen.findByText('Nada neste filtro.')
    expect(screen.queryByRole('button', { name: /pedido para seguir/ })).toBeNull()
  })

  it('mostra o erro da leitura dos pedidos sem esconder o resto, com nova tentativa', async () => {
    mockServer({ items: [accepted], follow: [bruna], failFollow: 1 })
    render(<NotificationsHarness />)
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível carregar os pedidos.')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('button', { name: /1 pedido para seguir/ })).not.toBeNull()
  })
})

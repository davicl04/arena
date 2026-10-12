import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { Bracket } from '../src/api/brackets'
import EventScreen from '../src/screens/EventScreen'
import { enableAct } from './support/native'
import { competitor, confirmed, eightTeams, eliminationBracket, roundRobinBracket, score } from './support/brackets'
import { playContext } from './support/play'
import {
  allText, byId, callsTo, eventDetail, findButton, labelled, me, myEntry, navigationMock, page, pressButton, render, serve, team,
} from './support/events'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn().mockResolvedValue('test-token'), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('expo-document-picker', () => ({ getDocumentAsync: vi.fn() }))
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

/*
 * Aba Tabela do detalhe do evento (D2), só leitura: a árvore ou a tabela, o campeão e as colocações (no tênis, com o bônus
 * por colocação). Quem não está inscrito vê um texto honesto e a API nem é chamada; `section: 'tabela'` abre a aba.
 */

const h = React.createElement
const BRACKET = '/events/5/bracket'
const bonus = { champion: 40, runner_up: 20, semifinalist: 10, min_entries: 4, applies: true }
const onExpired = vi.fn()

beforeEach(() => {
  enableAct()
  onExpired.mockClear()
  vi.mocked(request).mockReset()
})

/** Detalhe do evento; `enrolled` acrescenta o resumo da inscrição do titular (`my_entry`). */
function world(extra: Record<string, unknown> = {}, { enrolled = false, detail = {} }: { enrolled?: boolean; detail?: Parameters<typeof eventDetail>[0] } = {}) {
  const entry = myEntry({ state: 'confirmada', can_cancel: false, can_send_receipt: false })
  const my_entry = enrolled ? { id: entry.id, state: entry.state, team, reserved_until: entry.reserved_until } : null
  serve({
    '/events/5': { ...eventDetail({ competition_type: 'eliminacao_simples', ...detail }), my_entry },
    '/events/5/messages': page([]), '/events/5/entries': page([]), '/entries/9': entry, ...extra,
  })
}
async function mount(params: { eventId: number; sport?: 'futebol' | 'tenis' | 'corrida'; section?: 'tabela' } = { eventId: 5 }, navigation = navigationMock()) {
  return render(h(EventScreen, { user: me, navigation, onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), onExpired, params, title: 'Campeonato' }))
}
type Tree = Awaited<ReturnType<typeof mount>>
const matchups = (tree: Tree) => tree.root.findAll(node => typeof node.type === 'string' && typeof node.props.testID === 'string' && node.props.testID.startsWith('node-'))

describe('leitura da tabela', () => {
  it('quem não está inscrito vê o texto honesto e a API não é consultada', async () => {
    world({ [BRACKET]: eliminationBracket(eightTeams) })
    const tree = await mount()
    await pressButton(tree, 'Tabela')
    expect(allText(tree)).toContain('A tabela é dos inscritos')
    expect(allText(tree)).toContain('depois que o organizador confirmar o chaveamento.')
    expect(callsTo('GET', BRACKET)).toHaveLength(0)
    expect(allText(tree)).not.toContain('Quartas de final')
  })

  it('inscrito antes de o organizador confirmar: "Tabela ainda não definida"', async () => {
    world({ [BRACKET]: eliminationBracket(eightTeams, { state: 'sem_chaveamento', rounds: [], is_organizer: false }) }, { enrolled: true })
    const tree = await mount()
    await pressButton(tree, 'Tabela')
    expect(callsTo('GET', BRACKET)).toHaveLength(1)
    expect(allText(tree)).toContain('Tabela ainda não definida')
    expect(allText(tree)).toContain('A tabela aparece quando o organizador confirmar o chaveamento.')
  })

  it('o organizador com o sorteio feito é avisado de que os inscritos só veem depois de confirmar', async () => {
    world({ [BRACKET]: eliminationBracket(eightTeams, { state: 'sorteado', is_organizer: true }) }, { detail: { is_organizer: true } })
    const tree = await mount()
    await pressButton(tree, 'Tabela')
    expect(callsTo('GET', BRACKET)).toHaveLength(1)
    expect(allText(tree)).toContain('Tabela ainda não definida')
    expect(allText(tree)).toContain('O sorteio está feito, mas os inscritos só veem a tabela depois que você confirmar o chaveamento, na gestão do evento.')
  })

  it('403 e 404 da API viram o mesmo texto de quem não está inscrito', async () => {
    for (const status of [403, 404]) {
      world({ [BRACKET]: new ApiError('Sem acesso', status) }, { enrolled: true })
      const tree = await mount()
      await pressButton(tree, 'Tabela')
      expect(allText(tree)).toContain('A tabela é dos inscritos')
      expect(allText(tree)).not.toContain('Sem acesso')
    }
  })

  it('erro de rede tem "Tentar novamente" e 401 chama onExpired', async () => {
    world({ [BRACKET]: new ApiError('Fora do ar', 500) }, { enrolled: true })
    const tree = await mount()
    await pressButton(tree, 'Tabela')
    expect(allText(tree)).toContain('Fora do ar')
    world({ [BRACKET]: confirmed(eliminationBracket(eightTeams)) }, { enrolled: true })
    await pressButton(tree, 'Tentar novamente')
    expect(allText(tree)).toContain('Quartas de final')
    world({ [BRACKET]: new ApiError('Sessão expirada', 401) }, { enrolled: true })
    const expired = await mount()
    await pressButton(expired, 'Tabela')
    expect(onExpired).toHaveBeenCalled()
  })
})

describe('tabela confirmada', () => {
  it('eliminação: a árvore em leitura (sem troca) e os confrontos por rodada com os placares', async () => {
    const bracket = confirmed(eliminationBracket(eightTeams, {}, true))
    const first = bracket.rounds[0].nodes[0]
    first.match = { ...first.match!, state: 'encerrada', phase: 'encerrada', score: score(2, 1) }
    world({ [BRACKET]: bracket }, { enrolled: true })
    const tree = await mount()
    await pressButton(tree, 'Tabela')
    expect(labelled(tree, 'Árvore do chaveamento: 8 lugares. Os confrontos estão na lista por rodada logo abaixo.').length).toBeGreaterThan(0)
    expect(matchups(tree)).toHaveLength(7)
    expect(allText(tree)).toContain('Novo Horizonte × Bola Murcha FC')
    expect(allText(tree)).toContain('2 × 1')
    expect(allText(tree)).toContain('Sem data')
    expect(allText(tree)).toContain('Vencedor J1 × Vencedor J2')
    // Só leitura: nenhum botão de troca de lugar.
    expect(tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('lugar 1 da chave'))).toHaveLength(0)
  })

  it('todos contra todos: tabela cruzada, classificação e rodadas', async () => {
    world({ [BRACKET]: confirmed(roundRobinBracket()) }, { enrolled: true })
    const tree = await mount()
    await pressButton(tree, 'Tabela')
    expect(byId(tree, 'cross-table')).toHaveLength(1)
    expect(byId(tree, 'standings')).toHaveLength(1)
    expect(allText(tree)).toContain('Rodada 1')
    expect(allText(tree)).toContain('Folga por rodada:')
  })

  it('o parâmetro section abre a aba Tabela sem tocar nela (notificações da tabela e do encerramento)', async () => {
    world({ [BRACKET]: confirmed(eliminationBracket(eightTeams)) }, { enrolled: true })
    const tree = await mount({ eventId: 5, section: 'tabela' })
    expect(labelled(tree, 'Tabela')[0].props.accessibilityState).toMatchObject({ selected: true })
    expect(allText(tree)).toContain('Quartas de final')
    expect(allText(tree)).not.toContain('Informações do evento')
  })

  it('na prova de corrida não há Tabela: o pedido cai nas informações', async () => {
    world({}, { enrolled: true, detail: { sport: 'corrida', format: null, competition_type: null, distance_km: 10 } })
    const tree = await mount({ eventId: 5, section: 'tabela' })
    expect(labelled(tree, 'Tabela')).toHaveLength(0)
    expect(labelled(tree, 'Percurso')).toHaveLength(1)
    expect(labelled(tree, 'Informações')[0].props.accessibilityState).toMatchObject({ selected: true })
    expect(callsTo('GET', BRACKET)).toHaveLength(0)
  })
})

describe('tênis: bônus e colocações', () => {
  const people = ['Ana Souza', 'Beatriz Lima', 'Carla Dias', 'Dora Alves']
  const tennisEvent = { sport: 'tenis' as const, format: null, tennis_bonus: bonus }
  const final = (): Bracket => {
    const base = eliminationBracket(people, { sport: 'tenis', format: null }, true)
    return confirmed(base, {
      event_state: 'encerrado', champion: competitor(1, 'Ana Souza', 0, 'atleta'),
      placements: [
        { placement: 1, competitor: competitor(1, 'Ana Souza', 0, 'atleta'), bonus_points: 40 },
        { placement: 2, competitor: competitor(3, 'Carla Dias', 2, 'atleta'), bonus_points: 20 },
        { placement: 3, competitor: competitor(2, 'Beatriz Lima', 1, 'atleta'), bonus_points: 10 },
        { placement: 3, competitor: competitor(4, 'Dora Alves', 3, 'atleta'), bonus_points: 10 },
      ],
    })
  }

  it('evento encerrado: o campeão e as colocações com o bônus de cada uma (+40, +20, +10)', async () => {
    world({ [BRACKET]: final() }, { enrolled: true, detail: tennisEvent })
    const tree = await mount()
    await pressButton(tree, 'Tabela')
    expect(labelled(tree, 'Campeão: Ana Souza')).toHaveLength(1)
    expect(allText(tree)).toContain('+40 no ranking')
    expect(allText(tree)).toContain('+20 no ranking')
    expect(allText(tree)).toContain('+10 no ranking')
    expect(labelled(tree, '2º lugar, Carla Dias, Vice-campeão, mais 20 pontos no ranking')).toHaveLength(1)
    // Encerrado, o lembrete do bônus sai: o que vale está nas colocações.
    expect(byId(tree, 'tennis-bonus')).toHaveLength(0)
  })

  it('sem 4 confirmadas o bônus não vale: as colocações dizem isso', async () => {
    const bracket = final()
    bracket.placements = bracket.placements!.map(item => ({ ...item, bonus_points: 0 }))
    world({ [BRACKET]: bracket }, { enrolled: true, detail: tennisEvent })
    const tree = await mount()
    await pressButton(tree, 'Tabela')
    expect(allText(tree)).toContain('O bônus do ranking do tênis vale com 4 ou mais inscrições confirmadas.')
    expect(allText(tree)).not.toContain('+40 no ranking')
  })

  it('em andamento: lembra o bônus (campeão +40, vice +20, semifinalistas +10) com a tabela', async () => {
    world({ [BRACKET]: confirmed(eliminationBracket(people, { sport: 'tenis', format: null }, true)) }, { enrolled: true, detail: tennisEvent })
    const tree = await mount()
    await pressButton(tree, 'Tabela')
    expect(byId(tree, 'tennis-bonus')).toHaveLength(1)
    expect(allText(tree)).toContain('campeão +40, vice +20 e semifinalistas +10 (com 4 ou mais inscrições confirmadas; já vale).')
    expect(findButton(tree, 'Tabela')).toBeTruthy()
  })

  it('quem não está inscrito também vê o bônus, sem consultar a tabela', async () => {
    world({}, { detail: tennisEvent })
    const tree = await mount()
    await pressButton(tree, 'Tabela')
    expect(byId(tree, 'tennis-bonus')).toHaveLength(1)
    expect(callsTo('GET', BRACKET)).toHaveLength(0)
  })

  it('antes de confirmar, o inscrito vê o texto honesto e o lembrete do bônus', async () => {
    world({ [BRACKET]: eliminationBracket(people, { state: 'sem_chaveamento', rounds: [], sport: 'tenis', format: null }) }, { enrolled: true, detail: { ...tennisEvent, tennis_bonus: { ...bonus, applies: false } } })
    const tree = await mount()
    await pressButton(tree, 'Tabela')
    expect(allText(tree)).toContain('Tabela ainda não definida')
    expect(allText(tree)).toContain('ainda não vale')
  })
})

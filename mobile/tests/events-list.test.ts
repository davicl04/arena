import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { City, Profile } from '../src/api/client'
import type { EventCard, MyEntry } from '../src/api/entries'
import EventsScreen from '../src/screens/EventsScreen'
import { enableAct } from './support/native'
import { allText, byId, callsTo, eventCard, findButton, flush, labelled, me, myEntry, navigationMock, page, pressButton, render, serve, team } from './support/events'
import { playContext } from './support/play'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn().mockResolvedValue('test-token'), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

const h = React.createElement
const brasilia: City = { id: 1, name: 'Brasília', state: 'DF' }
const profile = (sport: Profile['sport'], city_id = 1): Profile => ({ id: 1, sport, city_id, position: null, looking_for: false, is_public: false, level: null })

function mountScreen(navigation = navigationMock(), params: { sport?: 'futebol' | 'tenis' | 'corrida' } | undefined = { sport: 'futebol' }, onExpired = vi.fn()) {
  return render(h(EventsScreen, { user: me, navigation, onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), onExpired, params, title: 'Campeonatos' }))
}
const cards = (tree: Awaited<ReturnType<typeof mountScreen>>) => tree.root.findAll(node => String(node.type) === 'Pressable' && typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityRole === 'button' && /R\$|Gratuito/.test(node.props.accessibilityLabel))

const open = eventCard(5, { name: 'Copa Sudoeste', my_entry: null })
const locked = eventCard(6, {
  name: 'Taça Elite', accepted_tiers: ['ouro', 'diamante'],
  eligibility: { eligible: false, reason: 'fora_da_faixa', message: 'Este evento aceita só Ouro e Diamante.', tier: null, teams: [] },
})
const joined = eventCard(7, { name: 'Liga Noturna', my_entry: { id: 9, state: 'confirmada', team, reserved_until: null } })

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
})

describe('Campeonatos e provas (E2): lista', () => {
  it('lista os cartazes da cidade do perfil e deixa os de fora da faixa apagados, com cadeado e o motivo', async () => {
    serve({
      '/me/sports-profiles': [profile('futebol')], '/cities': [brasilia], '/me/entries?scope=ativas&limit=50': page<MyEntry>([]),
      '/events?sport=futebol&city_id=1': page<EventCard>([open, locked, joined]),
    })
    const tree = await mountScreen()
    const text = allText(tree)
    expect(text).toContain('Brasília')
    expect(text).toContain('Ver todas')
    expect(text).toContain('Copa Sudoeste')
    expect(text).toContain('Taça Elite')
    expect(text).toContain('Liga Noturna')
    // O cartaz fora da faixa fica apagado, com o cadeado e o motivo do servidor logo abaixo.
    expect(cards(tree).map(card => card.props.accessibilityLabel).filter((label: string) => label.includes('Taça Elite'))[0]).toContain('Fora da faixa')
    expect(text).toContain('Este evento aceita só Ouro e Diamante.')
    // A inscrição de quem vê aparece no rodapé do cartaz.
    expect(cards(tree).map(card => card.props.accessibilityLabel).filter((label: string) => label.includes('Liga Noturna'))[0]).toContain('Inscrito')
    expect(cards(tree)).toHaveLength(3)
  })

  it('abre o detalhe do cartaz tocado, com a modalidade', async () => {
    serve({ '/me/sports-profiles': [profile('futebol')], '/cities': [brasilia], '/me/entries?scope=ativas&limit=50': page<MyEntry>([]), '/events?sport=futebol&city_id=1': page([open]) })
    const navigation = navigationMock()
    const tree = await mountScreen(navigation)
    await pressButton(tree, cards(tree)[0].props.accessibilityLabel)
    expect(navigation.go).toHaveBeenCalledWith('event', { eventId: 5, sport: 'futebol' })
  })

  it('"Ver todas" tira o filtro da cidade e "Só Brasília" o devolve', async () => {
    serve({
      '/me/sports-profiles': [profile('futebol')], '/cities': [brasilia], '/me/entries?scope=ativas&limit=50': page<MyEntry>([]),
      '/events?sport=futebol&city_id=1': page([open]), '/events?sport=futebol': page([open, locked]),
    })
    const tree = await mountScreen()
    expect(cards(tree)).toHaveLength(1)
    await pressButton(tree, 'Ver todas as cidades')
    expect(cards(tree)).toHaveLength(2)
    expect(allText(tree)).toContain('Todas as cidades')
    await pressButton(tree, 'Só Brasília')
    expect(cards(tree)).toHaveLength(1)
    expect(callsTo('GET', '/events?sport=futebol')).toHaveLength(1)
  })

  it('sem cidade no perfil lista todas as cidades e "Definir cidade" leva ao Perfil', async () => {
    serve({ '/me/sports-profiles': [], '/cities': [brasilia], '/me/entries?scope=ativas&limit=50': page<MyEntry>([]), '/events?sport=futebol': page([open]) })
    const navigation = navigationMock()
    const tree = await mountScreen(navigation)
    expect(allText(tree)).toContain('Sem cidade no perfil de Futebol · todas as cidades')
    await pressButton(tree, 'Definir cidade')
    expect(navigation.go).toHaveBeenCalledWith('profile')
  })

  it('os chips trocam a modalidade (a tela chama os eventos da corrida de Provas)', async () => {
    serve({ '/me/sports-profiles': [], '/cities': [], '/me/entries?scope=ativas&limit=50': page<MyEntry>([]), '/events?sport=futebol': page<EventCard>([]) })
    const navigation = navigationMock()
    const tree = await mountScreen(navigation)
    expect(labelled(tree, 'Futebol')[0].props.accessibilityState).toMatchObject({ checked: true, selected: true })
    await pressButton(tree, 'Corrida')
    expect(navigation.setParams).toHaveBeenCalledWith('events', { sport: 'corrida' })
  })

  it('mostra o estado vazio honesto, com a cidade quando filtrada, e "Provas" na corrida', async () => {
    serve({ '/me/sports-profiles': [profile('futebol')], '/cities': [brasilia], '/me/entries?scope=ativas&limit=50': page<MyEntry>([]), '/events?sport=futebol&city_id=1': page<EventCard>([]) })
    const tree = await mountScreen()
    expect(byId(tree, 'events-empty')).toHaveLength(1)
    expect(allText(tree)).toContain('Nenhum campeonato aberto em Brasília')
    expect(allText(tree)).toContain('Quando um organizador publicar um campeonato na sua cidade, ele aparece aqui.')
    expect(findButton(tree, 'Ver todas as cidades')).toBeTruthy()
    serve({ '/me/sports-profiles': [], '/cities': [], '/me/entries?scope=ativas&limit=50': page<MyEntry>([]), '/events?sport=corrida': page<EventCard>([]) })
    const run = await mountScreen(navigationMock(), { sport: 'corrida' })
    expect(allText(run)).toContain('Nenhuma prova aberta')
    expect(allText(run)).toContain('Quando um organizador publicar uma prova, ela aparece aqui.')
    expect(allText(run)).not.toMatch(/pontos|moedas/i)
  })

  it('"Minhas inscrições" mostra as da modalidade e abre o detalhe do evento', async () => {
    const mine = myEntry({ id: 9, event: { ...open, id: 5 }, state: 'reservada' })
    const other = myEntry({ id: 10, event: { ...open, id: 8, name: 'Prova da Orla', sport: 'corrida' }, state: 'confirmada', subject: { kind: 'atleta', team: null, athlete: { id: 1, name: 'Maria', username: 'maria.s', avatar_url: null } } })
    serve({ '/me/sports-profiles': [], '/cities': [], '/me/entries?scope=ativas&limit=50': page([mine, other]), '/events?sport=futebol': page<EventCard>([]) })
    const navigation = navigationMock()
    const tree = await mountScreen(navigation)
    expect(allText(tree)).toContain('MINHAS INSCRIÇÕES')
    expect(allText(tree)).toContain('Copa Sudoeste')
    expect(allText(tree)).toContain('Reservada')
    expect(allText(tree)).not.toContain('Prova da Orla')
    const entryRow = tree.root.findAll(node => String(node.type) === 'Pressable' && String(node.props.accessibilityLabel).startsWith('Copa Sudoeste,') && String(node.props.accessibilityLabel).endsWith('Reservada'))[0]
    await pressButton(tree, entryRow.props.accessibilityLabel)
    expect(navigation.go).toHaveBeenCalledWith('event', { eventId: 5, sport: 'futebol' })
  })

  it('avisa as vagas esgotadas e as inscrições encerradas abaixo do cartaz', async () => {
    const full = eventCard(11, { name: 'Copa Lotada', capacity: 8, entries_count: 8 })
    const closed = eventCard(12, { name: 'Copa Encerrada', phase: 'inscricoes_encerradas' })
    const paused = eventCard(13, { name: 'Copa Pausada', revocation_pending: true })
    serve({ '/me/sports-profiles': [], '/cities': [], '/me/entries?scope=ativas&limit=50': page<MyEntry>([]), '/events?sport=futebol': page([full, closed, paused]) })
    const text = allText(await mountScreen())
    expect(text).toContain('Vagas esgotadas')
    expect(text).toContain('Inscrições encerradas')
    expect(text).toContain('Inscrições suspensas')
  })

  it('pagina com "Carregar mais campeonatos" e conserva a ordem', async () => {
    const first = [eventCard(21, { name: 'Copa A' }), eventCard(22, { name: 'Copa B' }), eventCard(23, { name: 'Copa C' })]
    serve({
      '/me/sports-profiles': [], '/cities': [], '/me/entries?scope=ativas&limit=50': page<MyEntry>([]),
      '/events?sport=futebol': page(first, 'p2'), '/events?sport=futebol&cursor=p2': page([eventCard(24, { name: 'Copa D' })]),
    })
    const tree = await mountScreen()
    expect(cards(tree)).toHaveLength(3)
    await pressButton(tree, 'Carregar mais campeonatos')
    expect(cards(tree)).toHaveLength(4)
    expect(allText(tree)).toContain('Copa D')
    expect(findButton(tree, 'Carregar mais campeonatos')).toBeUndefined()
  })

  it('falhas aparecem com a mensagem e "Tentar novamente"; 401 expira a sessão', async () => {
    let fail = true
    serve({
      '/me/sports-profiles': [], '/cities': [], '/me/entries?scope=ativas&limit=50': new ApiError('Inscrições fora do ar', 500),
      '/events?sport=futebol': () => { if (fail) return new ApiError('Eventos fora do ar', 500); return page([open]) },
    })
    const tree = await mountScreen()
    expect(allText(tree)).toContain('Eventos fora do ar')
    expect(allText(tree)).toContain('Não foi possível carregar as suas inscrições')
    expect(allText(tree)).toContain('Inscrições fora do ar')
    fail = false
    await pressButton(tree, 'Tentar novamente')
    expect(cards(tree)).toHaveLength(1)

    const onExpired = vi.fn()
    serve({ '/me/sports-profiles': new ApiError('Sessão expirada', 401), '/cities': [], '/me/entries?scope=ativas&limit=50': page<MyEntry>([]), '/events?sport=futebol': page<EventCard>([]) })
    const expired = await mountScreen(navigationMock(), { sport: 'futebol' }, onExpired)
    expect(onExpired).toHaveBeenCalled()
    expect(allText(expired)).toContain('Cidade do perfil indisponível · todas as cidades')
    expect(findButton(expired, 'Tentar carregar a cidade de novo')).toBeTruthy()
    await flush()
  })

  it('sem parâmetros abre em Campeonatos de futebol', async () => {
    serve({ '/me/sports-profiles': [], '/cities': [], '/me/entries?scope=ativas&limit=50': page<MyEntry>([]), '/events?sport=futebol': page([open]) })
    const tree = await mountScreen(navigationMock(), undefined)
    expect(cards(tree)).toHaveLength(1)
  })
})

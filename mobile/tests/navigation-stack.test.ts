import { describe, expect, it, vi } from 'vitest'
import { activeNavFor, hasOwnHeader, isRootScreen, makeEntry, rootScreens, tabItems, titleFor, titles } from '../src/navigation/routes'
import type { ScreenName } from '../src/navigation/routes'
import { openUser } from '../src/navigation/openUser'
import { canGoBack, currentOf, initialStack, patchCurrent, pop, push, replaceTop, rootOf } from '../src/navigation/stack'
import type { Stack } from '../src/navigation/stack'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

const screensOf = (stack: Stack) => stack.map(entry => entry.screen)

describe('entradas tipadas', () => {
  it('monta { screen, params } e omite params quando a tela não tem', () => {
    expect(makeEntry('home')).toEqual({ screen: 'home' })
    expect('params' in makeEntry('home')).toBe(false)
    expect(makeEntry('event-manage', { eventId: 7 })).toEqual({ screen: 'event-manage', params: { eventId: 7 } })
    expect(makeEntry('teams')).toEqual({ screen: 'teams' })
    expect(makeEntry('join', { token: 'abc' })).toEqual({ screen: 'join', params: { token: 'abc' } })
  })

  it('declara as telas de todas as frentes seguintes, cada uma com título', () => {
    const declared: ScreenName[] = [
      'home', 'ranking', 'play', 'community', 'profile', 'user-profile', 'notifications', 'events', 'event', 'match',
      'event-bracket', 'event-matches', 'result-decision',
      'teams', 'team-form', 'team-invite', 'join',
      'organizer-request', 'organizer-events', 'event-wizard', 'event-manage', 'event-receipts',
      'admin-organizer-requests', 'admin-paid-events', 'admin-revoked-events', 'admin-refund-disputes', 'admin-court-suggestions', 'admin-walkover-disputes', 'moderation',
    ]
    expect(Object.keys(titles).sort()).toEqual([...declared].sort())
    expect(declared.every(screen => titles[screen].length > 0)).toBe(true)
  })

  it('os nomes das telas seguem os da web (admin-walkover-disputes, user-profile)', () => {
    expect(titles['admin-walkover-disputes']).toBe('W.O. contestados')
    expect(titles['user-profile']).toBe('Perfil')
    expect(Object.keys(titles)).not.toContain('admin-walkovers')
  })

  it('as telas com placa escura ou capa própria dispensam o cabeçalho do shell; as demais o usam', () => {
    for (const screen of ['home', 'play', 'user-profile', 'teams', 'team-form', 'team-invite', 'join', 'organizer-events', 'event-wizard', 'event-manage', 'event-receipts',
      'match', 'event-bracket', 'event-matches', 'result-decision'] as const) expect(hasOwnHeader(screen)).toBe(true)
    for (const screen of ['ranking', 'community', 'profile', 'notifications', 'events', 'event', 'organizer-request', 'moderation', 'admin-paid-events', 'admin-court-suggestions', 'admin-walkover-disputes'] as const) expect(hasOwnHeader(screen)).toBe(false)
  })

  it('"Ver perfil" empilha o perfil do atleta; o próprio perfil é a aba Perfil', () => {
    const navigation = { go: vi.fn() }
    openUser(navigation, 1, 9)
    expect(navigation.go).toHaveBeenLastCalledWith('user-profile', { userId: 9 })
    openUser(navigation, 1, 1)
    expect(navigation.go).toHaveBeenLastCalledWith('profile')
  })

  it('abas: Início, Ranking, JOGAR no centro, Comunidade e Perfil', () => {
    expect(tabItems.map(item => item.label)).toEqual(['Início', 'Ranking', 'JOGAR', 'Comunidade', 'Perfil'])
    expect(tabItems[2].screen).toBe('play')
    expect(rootScreens).toEqual(['home', 'ranking', 'play', 'community', 'profile'])
    expect(isRootScreen('community')).toBe(true)
    expect(isRootScreen('teams')).toBe(false)
  })
})

describe('pilha', () => {
  it('começa no Início e só as abas zeram a pilha', () => {
    let stack = initialStack()
    expect(screensOf(stack)).toEqual(['home'])
    stack = push(stack, makeEntry('teams'))
    stack = push(stack, makeEntry('team-invite', { teamId: 3, link: true }))
    expect(screensOf(stack)).toEqual(['home', 'teams', 'team-invite'])
    expect(currentOf(stack)).toEqual({ screen: 'team-invite', params: { teamId: 3, link: true } })
    expect(rootOf(stack)).toBe('home')
    expect(screensOf(push(stack, makeEntry('profile')))).toEqual(['profile'])
  })

  it('voltar tira a tela do topo; na raiz de uma aba, volta ao Início; no Início, não há para onde voltar', () => {
    const stack = push(push(initialStack(), makeEntry('events', { sport: 'corrida' })), makeEntry('event', { eventId: 4, sport: 'corrida' }))
    expect(canGoBack(stack)).toBe(true)
    expect(screensOf(pop(stack))).toEqual(['home', 'events'])
    expect(currentOf(pop(stack))).toEqual({ screen: 'events', params: { sport: 'corrida' } })
    const community = push(initialStack(), makeEntry('community'))
    expect(canGoBack(community)).toBe(true)
    expect(screensOf(pop(community))).toEqual(['home'])
    expect(canGoBack(initialStack())).toBe(false)
    expect(screensOf(pop(initialStack()))).toEqual(['home'])
  })

  it('patchCurrent troca os parâmetros da tela atual sem empilhar e ignora outra tela', () => {
    const stack = push(initialStack(), makeEntry('community', { compose: true }))
    expect(patchCurrent(stack, 'community', { compose: false })).toEqual([{ screen: 'community', params: { compose: false } }])
    const teams = push(initialStack(), makeEntry('teams', { invites: true }))
    expect(currentOf(patchCurrent(teams, 'teams', { teamId: 9 }))).toEqual({ screen: 'teams', params: { invites: true, teamId: 9 } })
    expect(patchCurrent(teams, 'event-manage', { eventId: 1 })).toBe(teams)
    expect(currentOf(patchCurrent(push(initialStack(), makeEntry('teams')), 'teams', { teamId: 2 }))).toEqual({ screen: 'teams', params: { teamId: 2 } })
  })

  it('replaceTop volta à mesma tela logo abaixo ou empilha (Meus times após Criar time)', () => {
    const afterForm = push(push(initialStack(), makeEntry('teams', { teamId: 1 })), makeEntry('team-form'))
    expect(replaceTop(afterForm, makeEntry('teams', { teamId: 5 }))).toEqual([{ screen: 'home' }, { screen: 'teams', params: { teamId: 5 } }])
    const fromJoin = push(push(initialStack(), makeEntry('events')), makeEntry('join', { token: 'x' }))
    expect(screensOf(replaceTop(fromJoin, makeEntry('teams', { teamId: 5, invites: true })))).toEqual(['home', 'events', 'teams'])
    // Raiz sozinha: não substitui o Início; só empilha. Uma aba zera a pilha.
    expect(screensOf(replaceTop(initialStack(), makeEntry('teams')))).toEqual(['home', 'teams'])
    expect(screensOf(replaceTop(afterForm, makeEntry('profile')))).toEqual(['profile'])
  })

  it('replaceTop respeita o critério de "mesma tela" (gestão do mesmo evento)', () => {
    const manage = (eventId: number) => makeEntry('event-manage', { eventId })
    const sameEvent = (below: ReturnType<typeof makeEntry>) => below.screen === 'event-manage' && below.params.eventId === 7
    const stack = push(push(initialStack(), manage(7)), makeEntry('event-wizard', { eventId: 7 }))
    expect(replaceTop(stack, manage(7), sameEvent)).toEqual([{ screen: 'home' }, manage(7)])
    const other = push(push(initialStack(), manage(8)), makeEntry('event-wizard'))
    expect(screensOf(replaceTop(other, manage(7), sameEvent))).toEqual(['home', 'event-manage', 'event-manage'])
  })
})

describe('aba acesa e título', () => {
  it('Meus times e os eventos do atleta acendem JOGAR; organizador e administração, Perfil', () => {
    for (const screen of ['teams', 'team-form', 'team-invite', 'join', 'events', 'event', 'match'] as const) expect(activeNavFor(screen, 'home')).toBe('play')
    for (const screen of ['organizer-request', 'organizer-events', 'event-wizard', 'event-manage', 'event-receipts', 'event-bracket', 'event-matches', 'result-decision', 'admin-paid-events', 'admin-court-suggestions', 'admin-walkover-disputes', 'moderation'] as const)
      expect(activeNavFor(screen, 'home')).toBe('profile')
  })

  it('as abas acendem a si mesmas; Notificações acendem Início, ou Perfil quando abertas por ali', () => {
    for (const tab of rootScreens) expect(activeNavFor(tab, 'home')).toBe(tab)
    expect(activeNavFor('notifications', 'home')).toBe('home')
    expect(activeNavFor('notifications', 'profile')).toBe('profile')
  })

  it('o título muda na edição de time e de rascunho e chama os eventos da corrida de Provas', () => {
    expect(titleFor(makeEntry('team-form'))).toBe('Criar time')
    expect(titleFor(makeEntry('team-form', { teamId: 2 }))).toBe('Editar time')
    expect(titleFor(makeEntry('event-wizard'))).toBe('Novo evento')
    expect(titleFor(makeEntry('event-wizard', { eventId: 3 }))).toBe('Editar rascunho')
    expect(titleFor(makeEntry('events'))).toBe('Campeonatos')
    expect(titleFor(makeEntry('events', { sport: 'corrida' }))).toBe('Provas')
    expect(titleFor(makeEntry('event', { eventId: 1 }))).toBe('Campeonato')
    expect(titleFor(makeEntry('event', { eventId: 1, sport: 'corrida' }))).toBe('Prova')
    expect(titleFor(makeEntry('moderation'))).toBe('Denúncias')
  })

  it('as telas do Jogar e do campeonato têm título e parâmetros tipados como na web', () => {
    expect([titleFor(makeEntry('play')), titleFor(makeEntry('ranking')), titleFor(makeEntry('match', { matchId: 4 }))]).toEqual(['Jogar', 'Ranking', 'Partida'])
    expect([titleFor(makeEntry('event-bracket', { eventId: 5 })), titleFor(makeEntry('event-matches', { eventId: 5 })), titleFor(makeEntry('result-decision', { matchId: 9 }))])
      .toEqual(['Chaveamento', 'Partidas', 'Decidir resultado'])
    expect(makeEntry('play')).toEqual({ screen: 'play' })
    expect(makeEntry('play', { matchId: 50 })).toEqual({ screen: 'play', params: { matchId: 50 } })
    expect(makeEntry('ranking', { sport: 'corrida', distanceKm: 10 })).toEqual({ screen: 'ranking', params: { sport: 'corrida', distanceKm: 10 } })
    expect(makeEntry('event-matches', { eventId: 5, matchId: 11 })).toEqual({ screen: 'event-matches', params: { eventId: 5, matchId: 11 } })
    expect(makeEntry('event', { eventId: 5, section: 'tabela' })).toEqual({ screen: 'event', params: { eventId: 5, section: 'tabela' } })
  })

  it('abrir o Jogar ou o Ranking com parâmetros zera a pilha (são abas) e guarda os parâmetros', () => {
    const stack = push(push(initialStack(), makeEntry('teams')), makeEntry('play', { matchId: 7 }))
    expect(stack).toEqual([{ screen: 'play', params: { matchId: 7 } }])
    expect(push(initialStack(), makeEntry('ranking', { sport: 'tenis' }))).toEqual([{ screen: 'ranking', params: { sport: 'tenis' } }])
  })
})

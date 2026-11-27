import React from 'react'
import { act } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { MatchCard } from '../src/api/matches'
import { countdownParts, countdownText, emptyPlacarText, matchupLabel, primaryButtonLabel, sideLabel } from '../src/data/home'
import HomeScreen from '../src/screens/HomeScreen'
import { formatLongDate } from '../src/utils/format'
import { enableAct } from './support/native'
import { allText, byId, callsTo, findButton, me, navigationMock, pressButton, render, serve } from './support/review'
import { athleteSide, court, emptySummary, ferrugemRef, football, leoesRef, matchCard, notificationSummaryState, person, sides, standings, teamSide } from './support/play'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const PROFILES = '/me/sports-profiles'
/** Domingo, 22 de novembro de 2026, 16:00 no fuso local. */
const NOW = new Date(2026, 10, 22, 16, 0, 0)
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString()

const rafael = person(7, 'Rafael Lima')
const lucas = person(8, 'Lucas Andrade')
const scheduled = (id: number, startsIn: number, extra: Partial<MatchCard> = {}) =>
  matchCard({ id, state: 'agendada', phase: 'agendada', starts_at: at(startsIn), court: court(), ...extra })
const tennis = (id: number, startsIn: number) => scheduled(id, startsIn, {
  sport: 'tenis', format: null, my_side: 'b', court: court({ name: 'Quadra 2 · Clube do Congresso', kind: 'tenis' as never }),
  sides: [athleteSide('a', rafael), athleteSide('b', lucas, { is_mine: true })],
})

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(NOW)
})
afterEach(() => { vi.useRealTimers() })

async function mount({ matches = [] as MatchCard[], profiles = [football] as unknown } = {}) {
  const navigation = navigationMock()
  const onExpired = vi.fn()
  serve({ '/me/standings': standings(), [PROFILES]: profiles })
  const tree = await render(h(HomeScreen, { user: me, navigation, onExpired, matches, notificationSummary: notificationSummaryState(emptySummary()) }))
  return { tree, navigation, onExpired }
}
const placarText = (tree: Awaited<ReturnType<typeof mount>>['tree'], id = 'placar') => allText({ root: byId(tree, id)[0] } as never)
const countdown = (tree: Awaited<ReturnType<typeof mount>>['tree']) => allText({ root: byId(tree, 'placar-countdown')[0] } as never)

describe('Contagem do Placar', () => {
  it('a partir de 24 h: dias e horas, "1 dia" no singular e "0 h" quando for o caso', () => {
    expect(countdownText(3 * DAY + 4 * HOUR + 35 * MINUTE)).toBe('3 dias 4 h')
    expect(countdownText(DAY)).toBe('1 dia 0 h')
    expect(countdownText(DAY + 59 * MINUTE)).toBe('1 dia 0 h')
    expect(countdownText(DAY + HOUR + 30 * MINUTE)).toBe('1 dia 1 h')
    expect(countdownText(2 * DAY)).toBe('2 dias 0 h')
    expect(countdownParts(6 * DAY + 13 * HOUR)).toEqual([{ value: 6, unit: 'dias' }, { value: 13, unit: 'h' }])
  })

  it('de 1 h a 24 h: horas e minutos', () => {
    expect(countdownText(5 * HOUR + 20 * MINUTE)).toBe('5 h 20 min')
    expect(countdownText(DAY - 1)).toBe('23 h 59 min')
    expect(countdownText(HOUR)).toBe('1 h 0 min')
    expect(countdownParts(2 * HOUR + 5 * MINUTE)).toEqual([{ value: 2, unit: 'h' }, { value: 5, unit: 'min' }])
  })

  it('abaixo de 1 h: só minutos, no mínimo "1 min"', () => {
    expect(countdownText(40 * MINUTE)).toBe('40 min')
    expect(countdownText(HOUR - 1)).toBe('59 min')
    expect(countdownText(MINUTE)).toBe('1 min')
    expect(countdownText(30_000)).toBe('1 min')
    expect(countdownText(0)).toBe('1 min')
    expect(countdownText(-5 * MINUTE)).toBe('1 min')
    expect(countdownText(Number.NaN)).toBe('1 min')
  })
})

describe('lados, convite e botão do Início', () => {
  it('em partida individual o lado do titular é "Você" e vem primeiro; times e o adversário mantêm o nome', () => {
    const card = tennis(1, DAY)
    expect(matchupLabel(card)).toBe('Você × Rafael Lima')
    expect(sideLabel(card, card.sides[0])).toBe('Rafael Lima')
    expect(sideLabel(card, card.sides[1])).toBe('Você')
    const teams = matchCard({ sides: sides(), my_side: 'a' })
    expect(matchupLabel(teams)).toBe('Ferrugem FC × Leões do Cerrado')
    expect(sideLabel(teams, teams.sides[0])).toBe('Ferrugem FC')
    expect(matchupLabel(matchCard({ sides: [teamSide('a', leoesRef), teamSide('b', ferrugemRef)], my_side: 'b' }))).toBe('Ferrugem FC × Leões do Cerrado')
    expect(matchupLabel(matchCard({ sides: [athleteSide('a', rafael)], my_side: null }))).toBe('Rafael Lima × adversário a definir')
  })

  it('o convite do Placar vazio e o rótulo do botão dependem dos perfis e da próxima partida', () => {
    expect(emptyPlacarText(false)).toBe('Prepare seus perfis esportivos e encontre a primeira.')
    expect(emptyPlacarText(true)).toBe('Que tal marcar a próxima?')
    expect(primaryButtonLabel({ hasProfiles: false, hasNextMatch: false })).toBe('Preparar perfis')
    expect(primaryButtonLabel({ hasProfiles: false, hasNextMatch: true })).toBe('Preparar perfis')
    expect(primaryButtonLabel({ hasProfiles: true, hasNextMatch: true })).toBe('Encontrar outra partida')
    expect(primaryButtonLabel({ hasProfiles: true, hasNextMatch: false })).toBe('Encontrar partida')
  })

  it('a data do topo vem por extenso, sem o ano', () => {
    expect(formatLongDate(NOW)).toBe('domingo, 22 de novembro')
  })
})

describe('Início: saudação, Placar e botão', () => {
  it('topo com a data por extenso e "A arena te chama, {primeiro nome}", sem o subtítulo nem a seção "Próxima partida"', async () => {
    const { tree } = await mount()
    const text = allText(tree)
    expect(text).toContain('domingo, 22 de novembro')
    expect(text).toContain('A arena te chama, Carlos')
    expect(text).not.toContain('A arena te chama, Carlos.')
    expect(text).not.toContain('Bora jogar')
    expect(text).not.toContain('Veja o seu elo em cada modalidade e escolha por onde começar.')
    expect(text).not.toContain('PRÓXIMA PARTIDA')
    expect(text).not.toContain('Seu próximo encontro aparecerá aqui.')
    expect(text.indexOf('A arena te chama')).toBeLessThan(text.indexOf('Próxima partida'))
    expect(text.indexOf('Próxima partida')).toBeLessThan(text.indexOf('Encontrar partida'))
    expect(text.indexOf('Encontrar partida')).toBeLessThan(text.indexOf('Seu elo'))
    expect(callsTo('GET', PROFILES)).toHaveLength(1)
  })

  it('sem perfis: Placar vazio com o convite para prepará-los, não tocável, e o botão "Preparar perfis" abre o Jogar', async () => {
    const { tree, navigation } = await mount({ profiles: [] })
    expect(byId(tree, 'placar')).toHaveLength(0)
    const empty = placarText(tree, 'placar-empty')
    expect(empty).toContain('Próxima partida')
    expect(empty).toContain('—')
    expect(empty).toContain('Nenhuma partida agendada')
    expect(empty).toContain('Prepare seus perfis esportivos e encontre a primeira.')
    expect(byId(tree, 'placar-empty')[0].props.onPress).toBeUndefined()
    await pressButton(tree, 'Preparar perfis')
    expect(navigation.go).toHaveBeenCalledWith('play')
  })

  it('com perfis e sem partida agendada: "Que tal marcar a próxima?" e o botão "Encontrar partida"', async () => {
    const { tree, navigation } = await mount({ matches: [matchCard({ id: 9, state: 'combinando' }), scheduled(4, -HOUR)] })
    expect(byId(tree, 'placar')).toHaveLength(0)
    expect(placarText(tree, 'placar-empty')).toContain('Que tal marcar a próxima?')
    expect(findButton(tree, 'Preparar perfis')).toBeUndefined()
    await pressButton(tree, 'Encontrar partida')
    expect(navigation.go).toHaveBeenCalledWith('play')
  })

  it('com partida: modalidade, Contagem, data e hora, confronto e local; o bloco inteiro abre a partida', async () => {
    const start = new Date(2026, 10, 25, 20, 0, 0).getTime() - NOW.getTime()
    const { tree, navigation } = await mount({ matches: [scheduled(1, 6 * DAY), scheduled(2, start), scheduled(3, 2 * DAY, { state: 'cancelada' })] })
    const text = placarText(tree)
    expect(text).toContain('Próxima partida')
    expect(text).toContain('Futebol')
    expect(countdown(tree)).toBe('3 dias 4 h')
    expect(text).toContain('qua, 25 nov · 20:00')
    expect(text).toContain('Ferrugem FC × Leões do Cerrado')
    expect(text).toContain('Arena Sudoeste')
    const placar = byId(tree, 'placar')[0]
    expect(placar.props.accessibilityRole).toBe('button')
    expect(placar.props.accessibilityLabel).toBe('Próxima partida em 3 dias 4 h, Ferrugem FC × Leões do Cerrado, qua, 25 nov · 20:00, Arena Sudoeste')
    await act(async () => { placar.props.onPress() })
    expect(navigation.go).toHaveBeenCalledWith('match', { matchId: 2 })
    await pressButton(tree, 'Encontrar outra partida')
    expect(navigation.go).toHaveBeenLastCalledWith('play')
  })

  it('partida individual: o lado do titular aparece como "Você"', async () => {
    const { tree } = await mount({ matches: [tennis(5, 2 * HOUR + 5 * MINUTE)] })
    const text = placarText(tree)
    expect(text).toContain('Tênis')
    expect(text).toContain('Você × Rafael Lima')
    expect(text).toContain('Quadra 2 · Clube do Congresso')
    expect(countdown(tree)).toBe('2 h 5 min')
  })

  it('a Contagem é recalculada a cada minuto e, quando a partida começa, o Placar passa para a seguinte e depois ao vazio', async () => {
    const { tree, navigation } = await mount({ matches: [scheduled(1, 30 * MINUTE), scheduled(2, 3 * HOUR, { sides: [teamSide('a', leoesRef, { is_mine: true }), teamSide('b', ferrugemRef)] })] })
    expect(countdown(tree)).toBe('30 min')
    await act(async () => { vi.advanceTimersByTime(MINUTE) })
    expect(countdown(tree)).toBe('29 min')
    await act(async () => { vi.advanceTimersByTime(30 * MINUTE) })
    expect(countdown(tree)).toBe('2 h 29 min')
    expect(placarText(tree)).toContain('Leões do Cerrado × Ferrugem FC')
    await act(async () => { byId(tree, 'placar')[0].props.onPress() })
    expect(navigation.go).toHaveBeenLastCalledWith('match', { matchId: 2 })
    expect(findButton(tree, 'Encontrar outra partida')).toBeTruthy()
    await act(async () => { vi.advanceTimersByTime(3 * HOUR) })
    expect(byId(tree, 'placar')).toHaveLength(0)
    expect(placarText(tree, 'placar-empty')).toContain('Nenhuma partida agendada')
    expect(findButton(tree, 'Encontrar partida')).toBeTruthy()
  })

  it('perfis ainda indisponíveis não viram "sem perfis"; 401 na leitura dos perfis expira a sessão', async () => {
    const failed = await mount({ profiles: new ApiError('Fora do ar', 500) })
    expect(placarText(failed.tree, 'placar-empty')).toContain('Que tal marcar a próxima?')
    expect(findButton(failed.tree, 'Encontrar partida')).toBeTruthy()
    expect(failed.onExpired).not.toHaveBeenCalled()
    const expired = await mount({ profiles: new ApiError('Sessão expirada', 401) })
    expect(expired.onExpired).toHaveBeenCalled()
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { FormatStanding } from '../src/api/teams'
import { carouselMetrics, slideAt } from '../src/components/teams/TeamCardCarousel'
import { athletes, formatGrid, normalizeTeamName, playedFormats, positionLabel, roleLine } from '../src/components/teams/teamView'
import { makeEntry } from '../src/navigation/routes'
import { fold } from '../src/utils/format'
import { showTeams } from '../src/screens/teamsNavigation'
import { replaceTop } from '../src/navigation/stack'
import { fakeNavigation } from './support/teams'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

const cell = (format: FormatStanding['format'], extra: Partial<FormatStanding> = {}): FormatStanding =>
  ({ format, state: 'sem_jogos', tier: null, played: 0, required: 3, rank_position: null, metric_value: null, faces: [], faces_any_level: true, ...extra })

describe('teamView', () => {
  it('a grade sempre tem Futsal, Society e Campo, nessa ordem, com "sem jogos" nos ausentes', () => {
    const grid = formatGrid([cell('campo', { played: 2, state: 'classificacao' })])
    expect(grid.map(item => item.format)).toEqual(['futsal', 'society', 'campo'])
    expect(grid.map(item => item.played)).toEqual([0, 0, 2])
    expect(formatGrid([]).every(item => item.state === 'sem_jogos' && item.required === 3)).toBe(true)
  })

  it('as pílulas do convite só trazem formatos com jogos ou elo', () => {
    expect(playedFormats([])).toEqual([])
    const formats = playedFormats([cell('futsal', { played: 1, state: 'classificacao' }), cell('society', { state: 'ranqueado', tier: 'ouro', played: 5 })])
    expect(formats.map(item => item.format)).toEqual(['futsal', 'society'])
  })

  it('linha do papel, posição, contagem e nome normalizado', () => {
    const city = { id: 1, name: 'Brasília', state: 'DF' }
    expect(roleLine({ city, my_role: 'representante' })).toBe('Brasília · você representa')
    expect(roleLine({ city, my_role: 'membro' })).toBe('Brasília · você é membro')
    expect(roleLine({ city, my_role: null })).toBe('Brasília · DF')
    expect(positionLabel('meio_campo')).toBe('Meio de campo')
    expect(positionLabel(null)).toBe('Sem posição')
    expect(athletes(1)).toBe('1 atleta')
    expect(athletes(12)).toBe('12 atletas')
    expect(normalizeTeamName('  Leões   do  Cerrado ')).toBe('Leões do Cerrado')
    expect(fold('Brasília DF')).toBe('brasilia df')
    expect(fold('GOIÂNIA')).toBe('goiania')
  })
})

describe('carrossel de carteirinhas', () => {
  it('o cartão ocupa 84% da tela, o passo soma o espaço e a margem centraliza o cartão', () => {
    const { card, step, side } = carouselMetrics(390)
    expect(card).toBe(328)
    expect(step).toBe(340)
    expect(side).toBe(31)
    // Cartão + as duas margens preenchem a tela: o cartão fica centralizado.
    expect(side * 2 + card).toBe(390)
    expect(carouselMetrics(320).card).toBe(269)
  })

  it('o quadro vem do deslocamento, limitado ao primeiro e ao último', () => {
    expect(slideAt(0, 340, 3)).toBe(0)
    expect(slideAt(169, 340, 3)).toBe(0)
    expect(slideAt(171, 340, 3)).toBe(1)
    expect(slideAt(680, 340, 3)).toBe(2)
    expect(slideAt(5000, 340, 3)).toBe(2)
    expect(slideAt(-40, 340, 3)).toBe(0)
  })
})

describe('showTeams', () => {
  it('substitui Meus times logo abaixo na pilha e, sem ele, empilha no lugar da tela atual', () => {
    const navigation = fakeNavigation()
    showTeams(navigation, 7)
    const [entry, same] = navigation.replace.mock.calls[0]
    expect(entry).toEqual(makeEntry('teams', { teamId: 7, invites: false }))
    // Pilha Início > Meus times > Criar time: a saída substitui os dois; sem Meus times, só a tela atual.
    const withTeams = replaceTop([makeEntry('home'), makeEntry('teams'), makeEntry('team-form')], entry, same)
    expect(withTeams.map(item => item.screen)).toEqual(['home', 'teams'])
    expect(withTeams[1]).toEqual(entry)
    const without = replaceTop([makeEntry('home'), makeEntry('join', { token: 'x' })], entry, same)
    expect(without.map(item => item.screen)).toEqual(['home', 'teams'])
    showTeams(navigation, 7, true)
    expect(navigation.replace.mock.calls[1][0]).toEqual(makeEntry('teams', { teamId: 7, invites: true }))
  })
})

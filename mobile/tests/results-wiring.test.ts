import { describe, expect, it, vi } from 'vitest'
import { screens } from '../src/navigation/screens'
import type { ScreenProps } from '../src/navigation/screens'
import AdminCourtSuggestionsScreen from '../src/screens/AdminCourtSuggestionsScreen'
import AdminWalkoverDisputesScreen from '../src/screens/AdminWalkoverDisputesScreen'
import RankingScreen from '../src/screens/RankingScreen'
import { admin } from './support/review'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))
// As telas que carregam o seletor de imagens do Expo ficam fora: o registro só precisa delas como componentes.
vi.mock('../src/screens/CommunityScreen', async () => (await import('./support/review')).hostScreen('CommunityScreen'))
vi.mock('../src/screens/ProfileScreen', async () => (await import('./support/review')).hostScreen('ProfileScreen'))
vi.mock('../src/screens/TeamsScreen', async () => (await import('./support/review')).hostScreen('TeamsScreen'))
vi.mock('../src/screens/UserProfileScreen', async () => (await import('./support/review')).hostScreen('UserProfileScreen'))

/*
 * Registro das telas (`screens.tsx`): as linhas do Ranking e das duas filas da administração do Jogar apontam para as telas
 * reais (o `ComingSoon` saiu delas), e a administração recebe o usuário e o tratamento da sessão expirada.
 */
describe('registro das telas: Ranking e filas da administração', () => {
  it('a aba Ranking é a RankingScreen', () => {
    expect(screens.ranking).toBe(RankingScreen)
  })

  it.each([
    ['admin-court-suggestions', AdminCourtSuggestionsScreen],
    ['admin-walkover-disputes', AdminWalkoverDisputesScreen],
  ] as const)('%s abre a fila com o usuário e o onExpired do shell', (name, Screen) => {
    const onExpired = vi.fn()
    const element = (screens[name] as unknown as (props: Partial<ScreenProps<typeof name>>) => { type: unknown; props: Record<string, unknown> })({ user: admin, onExpired })
    expect(element.type).toBe(Screen)
    expect(element.props).toMatchObject({ user: admin, onExpired })
  })
})

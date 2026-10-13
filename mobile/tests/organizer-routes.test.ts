import { createElement } from 'react'
import type { ReactElement } from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { User } from '../src/api/client'
import OrganizerMenu from '../src/components/organizer/OrganizerMenu'
import { screens } from '../src/navigation/screens'
import EventManageScreen from '../src/screens/EventManageScreen'
import EventWizardScreen from '../src/screens/EventWizardScreen'
import OrganizerEventsScreen from '../src/screens/OrganizerEventsScreen'
import OrganizerRequestScreen from '../src/screens/OrganizerRequestScreen'
import ProfileScreen from '../src/screens/ProfileScreen'
import { navigationMock } from './support/organizer'
import { playContext } from './support/play'
import { enableAct } from './support/native'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/screens/CommunityScreen', () => ({ default: () => null }))
vi.mock('../src/screens/ProfileScreen', () => ({ default: () => null }))

const me: User = { id: 1, name: 'Maria Souza', username: 'maria.s', email: 'maria@example.com', birth_date: '1995-01-01', social_public: false, is_admin: true, avatar: null, cover: null }

type ProfileElement = ReactElement<{ menuSections: (close: () => void) => ReactElement<Record<string, unknown>> }>

describe('registro de telas: organizador e Menu do Perfil', () => {
  it('as quatro telas do organizador estão ligadas às suas linhas do registro', () => {
    expect(screens['organizer-request']).toBe(OrganizerRequestScreen)
    expect(screens['organizer-events']).toBe(OrganizerEventsScreen)
    expect(screens['event-wizard']).toBe(EventWizardScreen)
    expect(screens['event-manage']).toBe(EventManageScreen)
  })

  it('o Perfil entrega ao Menu as seções do organizador com a navegação e o encerramento de sessão do shell', async () => {
    enableAct()
    const navigation = navigationMock()
    const onExpired = vi.fn()
    const close = vi.fn()
    const props = { user: me, navigation: navigation as never, onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), onExpired, params: undefined, title: 'Perfil' }
    let tree!: ReactTestRenderer
    await act(async () => { tree = create(createElement(screens.profile, props)) })
    const profileProps = tree.root.findByType(ProfileScreen).props as ProfileElement['props']
    const sections = profileProps.menuSections(close)
    expect(sections.type).toBe(OrganizerMenu)
    expect(sections.props).toMatchObject({ isAdmin: true, navigation, onLeave: close, onExpired })
    await act(async () => { tree.update(createElement(screens.profile, { ...props, user: { ...me, is_admin: false } })) })
    const plainProps = tree.root.findByType(ProfileScreen).props as ProfileElement['props']
    expect(plainProps.menuSections(close).props.isAdmin).toBe(false)
    await act(async () => { tree.unmount() })
  })
})

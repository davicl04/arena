import { useCallback } from 'react'
import type { ReactElement } from 'react'
import type { User } from '../api/client'
import type { PlayBoard } from '../api/matchmaking'
import type { PlayBoardState } from '../hooks/usePlayBoard'
import OrganizerMenu from '../components/organizer/OrganizerMenu'
import AdminCourtSuggestionsScreen from '../screens/AdminCourtSuggestionsScreen'
import AdminOrganizerRequestsScreen from '../screens/AdminOrganizerRequestsScreen'
import AdminPaidEventsScreen from '../screens/AdminPaidEventsScreen'
import AdminRefundDisputesScreen from '../screens/AdminRefundDisputesScreen'
import AdminRevokedEventsScreen from '../screens/AdminRevokedEventsScreen'
import AdminWalkoverDisputesScreen from '../screens/AdminWalkoverDisputesScreen'
import BracketScreen from '../screens/BracketScreen'
import CommunityScreen from '../screens/CommunityScreen'
import EventManageScreen from '../screens/EventManageScreen'
import EventMatchesScreen from '../screens/EventMatchesScreen'
import EventScreen from '../screens/EventScreen'
import EventsScreen from '../screens/EventsScreen'
import EventWizardScreen from '../screens/EventWizardScreen'
import HomeScreen from '../screens/HomeScreen'
import JoinScreen from '../screens/JoinScreen'
import MatchScreen from '../screens/MatchScreen'
import ModerationScreen from '../screens/ModerationScreen'
import NotificationsScreen from '../screens/NotificationsScreen'
import OrganizerEventsScreen from '../screens/OrganizerEventsScreen'
import OrganizerRequestScreen from '../screens/OrganizerRequestScreen'
import PlayScreen from '../screens/PlayScreen'
import ProfileScreen from '../screens/ProfileScreen'
import RankingScreen from '../screens/RankingScreen'
import ReceiptsScreen from '../screens/ReceiptsScreen'
import ResultDecisionScreen from '../screens/ResultDecisionScreen'
import TeamFormScreen from '../screens/TeamFormScreen'
import TeamInviteScreen from '../screens/TeamInviteScreen'
import TeamsScreen from '../screens/TeamsScreen'
import UserProfileScreen from '../screens/UserProfileScreen'
import { openUser } from './openUser'
import type { ScreenName, ScreenParams } from './routes'
import type { Navigation } from './useNavigation'

/** Tudo que o shell entrega a cada tela, além dos parâmetros da entrada. */
export interface ScreenContext {
  user: User
  navigation: Navigation
  onUser: (user: User) => void
  onLogout: () => void
  /** Sessão expirada (401): o App volta ao login. */
  onExpired: () => void
  /**
   * Placa do Jogar (`GET /me/play`) lida pelo shell: a mesma leitura acende o ponto do JOGAR e alimenta a placa, o Início
   * e a tela da partida. `board` é `null` até a primeira resposta; `deferred`/`defer` guardam as propostas deixadas para
   * "Responder depois" (só na memória da sessão).
   */
  playBoard: PlayBoardState
  /** Relê a placa agora (depois de aceitar, recusar ou cancelar algo), para o ponto e as listas acompanharem; devolve a placa nova. */
  refreshPlayBoard: () => Promise<PlayBoard | null>
}
export type ScreenProps<S extends ScreenName> = ScreenContext & {
  params: ScreenParams[S]
  /** Título da entrada atual (`titleFor`), o mesmo do cabeçalho do shell. */
  title: string
}
export type ScreenComponent<S extends ScreenName> = (props: ScreenProps<S>) => ReactElement


function CommunityRoute({ user, params, navigation, onExpired }: ScreenProps<'community'>) {
  // Pedido do quadro "Nova foto" do perfil: a Comunidade abre já na nova publicação e consome o pedido.
  const started = useCallback(() => navigation.setParams('community', { compose: false }), [navigation])
  return <CommunityScreen user={user} onExpired={onExpired} composeOnOpen={Boolean(params?.compose)} onComposeStarted={started} />
}

/**
 * Registro das telas: uma linha por tela de `ScreenParams`, cada uma com o componente (que recebe `ScreenProps`). Todas existem:
 * as abas, o Jogar (placa, partida, resultado e corrida nos próprios componentes), o Ranking, os campeonatos do atleta e do
 * organizador (a aba Tabela do `event`, o chaveamento, a agenda e a decisão do resultado), o organizador e a administração.
 */
export const screens: { [S in ScreenName]: ScreenComponent<S> } = {
  home: ({ user, navigation, onExpired, playBoard }) => <HomeScreen user={user} navigation={navigation} onExpired={onExpired} matches={playBoard.board?.matches} />,
  ranking: RankingScreen,
  play: PlayScreen,
  community: CommunityRoute,
  'user-profile': UserProfileScreen,
  profile: ({ user, navigation, onUser, onLogout, onExpired }) => <ProfileScreen user={user} onUser={onUser} onLogout={onLogout} onExpired={onExpired} onNewPhoto={() => navigation.go('community', { compose: true })}
    menuSections={close => <OrganizerMenu isAdmin={user.is_admin} navigation={navigation} onLeave={close} onExpired={onExpired} />} />,
  notifications: NotificationsScreen,
  events: EventsScreen,
  event: EventScreen,
  match: MatchScreen,
  'event-bracket': BracketScreen,
  'event-matches': EventMatchesScreen,
  'result-decision': ResultDecisionScreen,
  teams: TeamsScreen,
  'team-form': TeamFormScreen,
  'team-invite': TeamInviteScreen,
  join: JoinScreen,
  'organizer-request': OrganizerRequestScreen,
  'organizer-events': OrganizerEventsScreen,
  'event-wizard': EventWizardScreen,
  'event-manage': EventManageScreen,
  'event-receipts': ReceiptsScreen,
  'admin-organizer-requests': ({ user, navigation, onExpired }) => <AdminOrganizerRequestsScreen user={user} onExpired={onExpired} onOpenProfile={userId => openUser(navigation, user.id, userId)} />,
  'admin-paid-events': ({ user, onExpired }) => <AdminPaidEventsScreen user={user} onExpired={onExpired} />,
  'admin-revoked-events': ({ user, onExpired }) => <AdminRevokedEventsScreen user={user} onExpired={onExpired} />,
  'admin-refund-disputes': ({ user, onExpired }) => <AdminRefundDisputesScreen user={user} onExpired={onExpired} />,
  'admin-court-suggestions': ({ user, onExpired }) => <AdminCourtSuggestionsScreen user={user} onExpired={onExpired} />,
  'admin-walkover-disputes': ({ user, onExpired }) => <AdminWalkoverDisputesScreen user={user} onExpired={onExpired} />,
  moderation: ({ user, onExpired }) => <ModerationScreen user={user} onExpired={onExpired} />,
}

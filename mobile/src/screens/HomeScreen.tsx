import type { ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import type { User } from '../api/client'
import type { ArenaNotification } from '../api/notifications'
import type { MatchCard } from '../api/matches'
import { getMyStandings } from '../api/play'
import { ActionButton } from '../components/arena/controls'
import ListRow from '../components/ListRow'
import { Destaque } from '../components/home/Destaque'
import { Pilulas } from '../components/home/Pilulas'
import { Placar } from '../components/home/Placar'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { nextScheduledMatch } from '../components/play/matchView'
import { primaryButtonLabel } from '../data/home'
import type { NotificationSummaryState } from '../hooks/useNotificationSummary'
import { loadProfiles } from '../hooks/useCities'
import { useNow } from '../hooks/useNow'
import { usePendingNotifications } from '../hooks/usePendingNotifications'
import { useResource } from '../hooks/useResource'
import { openNotification } from '../navigation/openNotification'
import type { Navigation } from '../navigation/useNavigation'
import { tw } from '../styles'
import { formatLongDate } from '../utils/format'

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <View className="mb-1.5"><Text className="mt-3.5 mb-1.5 text-[11px] font-bold tracking-[2px] text-brand">{title}</Text><View className="rounded-card bg-surface px-5.5">{children}</View></View>
}

/**
 * Início: sino das Notificações com o contador de novas (não lidas e pedidos para seguir, do resumo lido pelo shell), a data
 * por extenso e "A arena te chama, {primeiro nome}", o Placar (a próxima partida agendada entre as partidas da placa do Jogar,
 * `matches`, com a Contagem recalculada a cada minuto), o botão principal (abre o Jogar; o rótulo depende dos perfis
 * esportivos, `GET /me/sports-profiles`, e da próxima partida), o Destaque "Para responder" com a pendência mais urgente
 * (`GET /me/notifications/pending?limit=1`, com o total do resumo; só aparece com `pending_count > 0` e um item lido, e some
 * sem pendências ou se a leitura falhar), as Pílulas de "Seu elo" (`GET /me/standings`, lido uma vez: o elo com a métrica de
 * quem já se classificou, "n de 3" em classificação, "Sem marca" na corrida ou "Sem perfil" quando a lista de perfis não tem a
 * modalidade) e atalhos para as áreas do app. Sem pontos, partidas ou classificações fictícias: o que não vem da API aparece
 * vazio ou indisponível.
 */
export default function HomeScreen({ user, navigation, onExpired, matches = [], notificationSummary }: {
  user: User; navigation: Navigation; onExpired: () => void
  /** Resumo das notificações entregue pelo shell: o número do sino e o total de pendências da placa. */
  notificationSummary: NotificationSummaryState
  /** Partidas do titular lidas pela placa (`GET /me/play`, entregue pelo shell). */
  matches?: MatchCard[]
}) {
  const now = useNow(60_000)
  const nextMatch = nextScheduledMatch(Array.isArray(matches) ? matches : [], now)
  // O Destaque mostra só a primeira pendência (a lista vem por urgência) e relê quando o total do resumo muda (o resumo é relido
  // a cada minuto). Aparece com `pending_count > 0` e um item lido; sem pendências, sem resumo ou com falha na leitura, some.
  const pendingTotal = notificationSummary.data?.pending_count ?? 0
  const pending = usePendingNotifications({ limit: 1 }, onExpired, { refreshKey: notificationSummary.data?.pending_count ?? -1 })
  const firstPending = pendingTotal > 0 ? pending.items[0] : undefined
  const standings = useResource(getMyStandings, onExpired)
  // Perfis esportivos (o shell não os lê): só uma lista vazia confirmada conta como "sem perfis"; carregando ou com falha, não.
  const profiles = useResource(loadProfiles, onExpired)
  const hasProfiles = !Array.isArray(profiles.data) || profiles.data.length > 0
  const openAllPending = () => navigation.go('notifications', { filter: 'responder' })
  // Marca como lida e abre o destino do aviso; sem destino, as notificações no filtro Para responder.
  const openPending = (notification: ArenaNotification) => void openNotification(notification, {
    navigation, isAdmin: user.is_admin, onRead: notificationSummary.setData, onExpired, onNoTarget: openAllPending,
  })
  const firstName = user.name.trim().split(/\s+/)[0]
  return <ScrollView contentContainerClassName="px-6 pt-3.5 pb-8">
    <View className="flex-row items-center justify-between">
      <Text className={tw.brand}>arena.</Text>
      <NotificationBell tone="light" count={notificationSummary.count} onOpen={() => navigation.go('notifications')} />
    </View>
    <Text className="mt-4 text-[11px] font-bold uppercase tracking-[1px] text-eyebrow">{formatLongDate(new Date(now))}</Text>
    <Text accessibilityRole="header" className="mt-1 mb-4 text-[25px] font-bold leading-[31px] text-heading">A arena te chama, {firstName}</Text>
    <Placar match={nextMatch} now={now} hasProfiles={hasProfiles} onOpen={matchId => navigation.go('match', { matchId })} />
    <View className="mt-3 mb-3.5"><ActionButton block tone="brand" icon="zap" title={primaryButtonLabel({ hasProfiles, hasNextMatch: Boolean(nextMatch) })} accessibilityHint="Abre o Jogar" onPress={() => navigation.go('play')} /></View>
    {firstPending ? <Destaque notification={firstPending} total={pendingTotal} now={now} isAdmin={user.is_admin} onOpen={openPending} onOpenAll={openAllPending} /> : null}
    <Pilulas standings={standings.data} standingsLoading={standings.loading} profiles={profiles.data} profilesLoading={profiles.loading}
      onOpenRanking={params => (params ? navigation.go('ranking', params) : navigation.go('ranking'))} onOpenModalities={() => navigation.go('profile')} />
    <Group title="JOGAR">
      <ListRow label="Meus times" onPress={() => navigation.go('teams')} />
      <ListRow label="Campeonatos" onPress={() => navigation.go('events', { sport: 'futebol' })} />
      <ListRow label="Provas de corrida" onPress={() => navigation.go('events', { sport: 'corrida' })} />
    </Group>
    <Group title="ORGANIZADOR">
      <ListRow label="Seja organizador" onPress={() => navigation.go('organizer-request')} />
      <ListRow label="Meus eventos" onPress={() => navigation.go('organizer-events')} />
    </Group>
    {user.is_admin ? <Group title="ADMINISTRAÇÃO">
      <ListRow label="Pedidos de organizador" onPress={() => navigation.go('admin-organizer-requests')} />
      <ListRow label="Eventos pagos" onPress={() => navigation.go('admin-paid-events')} />
      <ListRow label="Organizador revogado" onPress={() => navigation.go('admin-revoked-events')} />
      <ListRow label="Devoluções contestadas" onPress={() => navigation.go('admin-refund-disputes')} />
      <ListRow label="Sugestões de quadra" onPress={() => navigation.go('admin-court-suggestions')} />
      <ListRow label="W.O. contestados" onPress={() => navigation.go('admin-walkover-disputes')} />
      <ListRow label="Denúncias" onPress={() => navigation.go('moderation')} />
    </Group> : null}
  </ScrollView>
}

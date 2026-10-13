import type { ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import type { User } from '../api/client'
import { sports } from '../api/client'
import type { ArenaNotification } from '../api/notifications'
import type { MatchCard } from '../api/matches'
import { getMyStandings } from '../api/play'
import { ModalityCard } from '../components/arena/ModalityCard'
import { modalityStanding } from '../components/arena/modalityStanding'
import { ActionButton, TextAction } from '../components/arena/controls'
import ListRow from '../components/ListRow'
import { Icon } from '../components/Icon'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { PendingPlate } from '../components/notifications/PendingPlate'
import { MatchRow } from '../components/play/MyMatches'
import { nextScheduledMatch } from '../components/play/matchView'
import type { NotificationSummaryState } from '../hooks/useNotificationSummary'
import { useNow } from '../hooks/useNow'
import { usePendingNotifications } from '../hooks/usePendingNotifications'
import { useResource } from '../hooks/useResource'
import { useThemeColors } from '../hooks/useTheme'
import { openNotification } from '../navigation/openNotification'
import type { Navigation } from '../navigation/useNavigation'
import { tw } from '../styles'

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <View className="mb-1.5"><Text className="mt-3.5 mb-1.5 text-[11px] font-bold tracking-[2px] text-brand">{title}</Text><View className="rounded-card bg-surface px-5.5">{children}</View></View>
}

/**
 * Início: sino das Notificações com o contador de novas (não lidas e pedidos para seguir, do resumo lido pelo shell), a placa
 * "Para responder" com as 2 pendências mais urgentes (`GET /me/notifications/pending?limit=2`; some sem pendências ou se a leitura
 * falhar), "Seu elo" em cada
 * modalidade (`GET /me/standings`: o elo de quem já se classificou, a classificação "n de 3" ou, na corrida, a distância de
 * maior elo com o melhor tempo), a "Próxima partida" (a agendada mais próxima entre as partidas da placa do Jogar, `matches`)
 * o atalho "Encontrar partida" (abre o Jogar) e atalhos para as áreas do app. Sem pontos, partidas ou classificações fictícias: o que não vem da API aparece vazio ou
 * indisponível.
 */
export default function HomeScreen({ user, navigation, onExpired, matches = [], notificationSummary }: {
  user: User; navigation: Navigation; onExpired: () => void
  /** Resumo das notificações entregue pelo shell: o número do sino e o total de pendências da placa. */
  notificationSummary: NotificationSummaryState
  /** Partidas do titular lidas pela placa (`GET /me/play`, entregue pelo shell). */
  matches?: MatchCard[]
}) {
  const colors = useThemeColors()
  const now = useNow(60_000)
  const nextMatch = nextScheduledMatch(Array.isArray(matches) ? matches : [], now)
  // A placa relê quando o total de pendências do resumo muda (o resumo é relido a cada minuto); falha ou lista vazia a escondem.
  const pending = usePendingNotifications({ limit: 2 }, onExpired, { refreshKey: notificationSummary.data?.pending_count ?? -1 })
  const pendingTotal = notificationSummary.data?.pending_count ?? pending.items.length
  const standings = useResource(getMyStandings, onExpired)
  const openPending = (notification: ArenaNotification) => void openNotification(notification, {
    navigation, isAdmin: user.is_admin, onRead: notificationSummary.setData, onExpired,
  })
  const firstName = user.name.trim().split(/\s+/)[0]
  return <ScrollView contentContainerClassName="px-6 pt-3.5 pb-8">
    <View className="flex-row items-center justify-between">
      <Text className={tw.brand}>arena.</Text>
      <NotificationBell tone="light" count={notificationSummary.count} onOpen={() => navigation.go('notifications')} />
    </View>
    <Text className="mt-4 mb-1.5 text-[25px] font-bold leading-[31px] text-ink">Bora jogar, {firstName}?</Text>
    <Text className={tw.body}>Veja o seu elo em cada modalidade e escolha por onde começar.</Text>
    {pending.items.length > 0 ? <View className="mb-3.5">
      <PendingPlate items={pending.items} total={pendingTotal} now={now} isAdmin={user.is_admin} onOpenItem={openPending} onOpenAll={() => navigation.go('notifications', { filter: 'responder' })} />
    </View> : null}
    <View className="mb-2 flex-row items-center justify-between">
      <Text accessibilityRole="header" className="text-[11px] font-bold tracking-[2px] text-brand">SEU ELO</Text>
      <TextAction title="Ver elos" accessibilityLabel="Ver elos no Ranking" onPress={() => navigation.go('ranking')} />
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -24 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 8, gap: 12 }}>
      {sports.map(sport => {
        const standing = standings.data ? modalityStanding(sport.value, standings.data) : null
        return <ModalityCard key={sport.value} sport={sport.value} standing={standing} loading={standings.loading}
          onOpenRanking={() => navigation.go('ranking', standing?.distanceKm ? { sport: sport.value, distanceKm: standing.distanceKm } : { sport: sport.value })} />
      })}
    </ScrollView>
    <View className="mt-3 mb-1"><ActionButton block tone="brand" icon="zap" title="Encontrar partida" accessibilityHint="Abre o Jogar" onPress={() => navigation.go('play')} /></View>
    <Group title="PRÓXIMA PARTIDA">
      {nextMatch
        ? <MatchRow card={nextMatch} onOpen={matchId => navigation.go('match', { matchId })} />
        : <View testID="next-match-empty" accessible accessibilityLabel="Nenhuma partida agendada. Seu próximo encontro aparecerá aqui." className="min-h-16 flex-row items-center gap-3 py-3">
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="size-11 items-center justify-center rounded-xl bg-ink"><Icon name="calendar-days" size={22} color={colors.app} /></View>
          <View className="grow basis-0">
            <Text className="text-[13px] font-bold text-ink">Nenhuma partida agendada</Text>
            <Text className="text-[11px] leading-[16px] text-ink-muted">Seu próximo encontro aparecerá aqui.</Text>
          </View>
        </View>}
    </Group>
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

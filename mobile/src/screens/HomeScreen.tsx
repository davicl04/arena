import type { ReactNode } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import type { User } from '../api/client'
import { sports } from '../api/client'
import { getUnreadCount } from '../api/notifications'
import type { MatchCard } from '../api/matches'
import { getMyStandings } from '../api/play'
import { ModalityCard } from '../components/arena/ModalityCard'
import { modalityStanding } from '../components/arena/modalityStanding'
import { ActionButton, TextAction } from '../components/arena/controls'
import ListRow from '../components/ListRow'
import { Icon } from '../components/Icon'
import { MatchRow } from '../components/play/MyMatches'
import { nextScheduledMatch } from '../components/play/matchView'
import { useNow } from '../hooks/useNow'
import { useResource } from '../hooks/useResource'
import type { Navigation } from '../navigation/useNavigation'
import { tw } from '../styles'
import { colors } from '../theme'

/** Rótulo do sino: "Notificações" ou "Notificações, 3 não lidas". */
export const bellLabel = (count: number) => count ? `Notificações, ${count} ${count === 1 ? 'não lida' : 'não lidas'}` : 'Notificações'

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <View className="mb-1.5"><Text className="mt-3.5 mb-1.5 text-[11px] font-bold tracking-[2px] text-brand">{title}</Text><View className="rounded-card bg-white px-5.5">{children}</View></View>
}

/**
 * Início: sino das Notificações com o contador de não lidas (`GET /me/notifications/unread-count`), "Seu elo" em cada
 * modalidade (`GET /me/standings`: o elo de quem já se classificou, a classificação "n de 3" ou, na corrida, a distância de
 * maior elo com o melhor tempo), a "Próxima partida" (a agendada mais próxima entre as partidas da placa do Jogar, `matches`)
 * o atalho "Encontrar partida" (abre o Jogar) e atalhos para as áreas do app. Sem pontos, partidas ou classificações fictícias: o que não vem da API aparece vazio ou
 * indisponível.
 */
export default function HomeScreen({ user, navigation, onExpired, matches = [] }: {
  user: User; navigation: Navigation; onExpired: () => void
  /** Partidas do titular lidas pela placa (`GET /me/play`, entregue pelo shell). */
  matches?: MatchCard[]
}) {
  const now = useNow(60_000)
  const nextMatch = nextScheduledMatch(Array.isArray(matches) ? matches : [], now)
  const unread = useResource(getUnreadCount, onExpired)
  const standings = useResource(getMyStandings, onExpired)
  const count = typeof unread.data?.unread_count === 'number' ? unread.data.unread_count : 0
  const firstName = user.name.trim().split(/\s+/)[0]
  return <ScrollView contentContainerClassName="px-6 pt-3.5 pb-8">
    <View className="flex-row items-center justify-between">
      <Text className={tw.brand}>arena.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={bellLabel(count)} onPress={() => navigation.go('notifications')} className="min-h-11 min-w-11 items-center justify-center">
        <Icon name="bell" size={22} color={colors.ink} />
        {count > 0 ? <View testID="unread-indicator" className="absolute top-1 right-0 h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1">
          <Text className="text-[9px] font-bold text-white">{count > 9 ? '9+' : count}</Text>
        </View> : null}
      </Pressable>
    </View>
    <Text className="mt-4 mb-1.5 text-[25px] font-bold leading-[31px] text-ink">Bora jogar, {firstName}?</Text>
    <Text className={tw.body}>Veja o seu elo em cada modalidade e escolha por onde começar.</Text>
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

import { useEffect, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { markAllNotificationsRead, notificationsPath } from '../api/notifications'
import type { ArenaNotification } from '../api/notifications'
import { LoadError } from '../components/arena/LoadError'
import { Icon } from '../components/Icon'
import type { FollowRequest } from '../components/notifications/FollowRequestList'
import { FollowRequestsLine } from '../components/notifications/FollowRequestsLine'
import { NotificationItem } from '../components/notifications/NotificationItem'
import { NotificationsPlate } from '../components/notifications/NotificationsPlate'
import { PendingCard } from '../components/notifications/PendingCard'
import { toast } from '../components/toast/toastStore'
import { Button } from '../components/ui'
import { groupByDay } from '../data/notifications'
import type { NotificationFilter } from '../data/notifications'
import { useNow } from '../hooks/useNow'
import { usePagedList } from '../hooks/usePagedList'
import { usePendingNotifications } from '../hooks/usePendingNotifications'
import { reportActionError } from '../hooks/useSubmit'
import { openNotification } from '../navigation/openNotification'
import type { ScreenProps } from '../navigation/screens'
import { colors } from '../theme'

const feedback = { fontSize: 13, lineHeight: 19, marginVertical: 8 } as const

/** Lista abaixo do bloco fixado de cada chip (a mesma consulta da web): sempre sem as pendências (`pendente=false`). */
export function feedPathFor(filter: NotificationFilter): string {
  return notificationsPath({ categoria: filter === 'tudo' || filter === 'responder' ? undefined : filter, pendente: false })
}

function SectionTitle({ children, count }: { children: string; count?: number }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 }}>
    <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>{children}</Text>
    {count ? <View accessible accessibilityLabel={`${count} ${count === 1 ? 'pendência' : 'pendências'}`} style={{ minWidth: 21, height: 21, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: 'rgba(0,90,54,0.07)', paddingHorizontal: 4 }}>
      <Text style={{ color: colors.brand, fontSize: 10, fontWeight: '700' }}>{count}</Text>
    </View> : null}
  </View>
}

/**
 * Notificações: a placa `forest` (voltar, "Ler todas", resumo e chips *Tudo · Para responder · Partidas · Times · Eventos*), o
 * bloco fixado "Para responder" (`GET /me/notifications/pending`, com cartões de prazo), a linha dos pedidos para seguir (que
 * abre a subtela `follow-requests`) e a lista agrupada por dia (`GET /me/notifications` com `categoria` e `pendente=false`).
 * O resumo (sino, linha da placa e números dos chips) vem do shell; trocar de chip não o relê. Tocar numa notificação ou no
 * botão do cartão marca como lida e leva à tela do aviso (`openNotification`), onde a decisão acontece: a pendência lida só
 * sai do bloco quando a ação é resolvida ou o prazo vence. `params.filter` abre num chip (a placa do Início usa `responder`).
 */
export default function NotificationsScreen({ user, navigation, onExpired, notificationSummary, params }: ScreenProps<'notifications'>) {
  const [filter, setFilter] = useState<NotificationFilter>(params?.filter ?? 'tudo')
  const now = useNow(60_000)
  const feedOn = filter !== 'responder'
  const pending = usePendingNotifications({ categoria: filter === 'tudo' || filter === 'responder' ? undefined : filter, limit: 50 }, onExpired)
  const feed = usePagedList<ArenaNotification>(feedPathFor(filter), onExpired, feedOn)
  // Só "Tudo" mostra a linha dos pedidos para seguir; as fotos e os nomes vêm da primeira página da fila.
  const requests = usePagedList<FollowRequest>('/me/follow-requests', onExpired, filter === 'tudo')
  const [busy, setBusy] = useState(false)
  const summary = notificationSummary.data
  // Ao abrir a tela o resumo é relido uma vez (o sino pode estar até 60 s defasado); trocar de chip não o relê.
  const { reload: reloadSummary } = notificationSummary
  useEffect(() => { reloadSummary() }, [reloadSummary])

  const markRead = (items: ArenaNotification[], readAt: string) => items.map(item => item.read_at ? item : { ...item, read_at: readAt })
  async function open(notification: ArenaNotification) {
    setBusy(true)
    try {
      await openNotification(notification, {
        navigation, isAdmin: user.is_admin, onExpired,
        onRead: result => {
          const readAt = new Date().toISOString()
          const mark = (item: ArenaNotification) => item.id === notification.id ? { ...item, read_at: item.read_at ?? readAt } : item
          feed.setItems(old => old.map(mark))
          pending.setItems(old => old.map(mark))
          notificationSummary.setData(result)
        },
      })
    } finally { setBusy(false) }
  }
  async function readAll() {
    setBusy(true)
    try {
      const result = await markAllNotificationsRead()
      const readAt = new Date().toISOString()
      feed.setItems(old => markRead(old, readAt))
      pending.setItems(old => markRead(old, readAt))
      notificationSummary.setData(result)
      toast.success('Todas as notificações foram marcadas como lidas.')
    } catch (cause) {
      reportActionError(cause, 'Não foi possível marcar as notificações como lidas.', onExpired)
    } finally { setBusy(false) }
  }

  const requestsTotal = filter === 'tudo' ? Math.max(summary?.follow_requests_count ?? 0, requests.items.length) : 0
  const loading = pending.loading || (feedOn && feed.loading)
  const failed = Boolean(pending.error || (feedOn && feed.error))
  const nothing = !loading && !failed && pending.items.length === 0 && (!feedOn || feed.items.length === 0) && requestsTotal === 0
  return <ScrollView testID="notifications-screen" contentContainerStyle={{ paddingBottom: 32 }}>
    <NotificationsPlate summary={summary} filter={filter} onFilter={setFilter} busy={busy}
      onBack={navigation.back} onReadAll={() => void readAll()} />
    <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
      {loading ? <Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 14, marginTop: 8 }}>Carregando notificações…</Text> : null}
      {requestsTotal > 0 ? <View style={{ marginBottom: 14 }}>
        <FollowRequestsLine people={requests.items.map(item => item.user)} total={requestsTotal} onOpen={() => navigation.go('follow-requests')} />
      </View> : null}
      {pending.error ? <LoadError size="section" title="Não foi possível carregar as pendências" text={pending.error} cause={pending.errorCause} onRetry={pending.reload} /> : null}
      {pending.items.length > 0 ? <View accessibilityLabel="Para responder" style={{ marginBottom: 14 }}>
        <SectionTitle count={pending.items.length}>Para responder</SectionTitle>
        <View style={{ gap: 8 }}>
          {pending.items.map(item => <PendingCard key={item.id} notification={item} now={now} busy={busy} isAdmin={user.is_admin} onOpen={notification => void open(notification)} />)}
        </View>
      </View> : null}
      {feedOn && feed.error ? <LoadError size="section" title="Não foi possível carregar as notificações" text={feed.error.message} cause={feed.error} onRetry={feed.reload} /> : null}
      {feedOn ? groupByDay(feed.items, now).map(group => <View key={group.label} accessibilityLabel={group.label} style={{ marginBottom: 12 }}>
        <Text accessibilityRole="header" style={{ marginHorizontal: 4, marginBottom: 6, color: colors['ink-soft'], fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>{group.label}</Text>
        <View style={{ overflow: 'hidden', borderRadius: 16, backgroundColor: '#ffffff' }}>
          {group.items.map((item, index) => <NotificationItem key={item.id} notification={item} busy={busy} isAdmin={user.is_admin} first={index === 0} onOpen={notification => void open(notification)} />)}
        </View>
      </View>) : null}
      {feedOn && feed.moreError ? <Text accessibilityRole="alert" style={{ ...feedback, color: colors.error }}>{feed.moreError}</Text> : null}
      {feedOn && feed.hasMore ? <Button secondary title={feed.busy ? 'Carregando…' : 'Carregar mais notificações'} disabled={busy || feed.busy} onPress={() => void feed.loadMore()} /> : null}
      {nothing && filter === 'tudo' ? <View testID="notifications-empty" style={{ alignItems: 'center', borderRadius: 16, backgroundColor: '#ffffff', padding: 24 }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="bell" size={28} color={colors.brand} /></View>
        <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 17, fontWeight: '700', marginTop: 8 }}>Tudo em dia</Text>
        <Text style={{ color: colors['ink-muted'], fontSize: 13, lineHeight: 19, marginTop: 4, textAlign: 'center' }}>Convites e pedidos dos seus times, propostas e partidas, inscrições em campeonatos e provas e as respostas da administração aparecem aqui.</Text>
      </View> : null}
      {nothing && filter !== 'tudo' ? <Text testID="notifications-filter-empty" style={{ borderRadius: 16, backgroundColor: '#ffffff', paddingHorizontal: 14, paddingVertical: 16, color: colors['ink-muted'], fontSize: 12, lineHeight: 19 }}>Nada neste filtro.</Text> : null}
    </View>
  </ScrollView>
}

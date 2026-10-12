import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { ApiError, request } from '../api/client'
import type { Page, SocialUser } from '../api/client'
import { NOTIFICATIONS_PATH, getUnreadCount, markAllNotificationsRead, markNotificationRead } from '../api/notifications'
import type { ArenaNotification } from '../api/notifications'
import { TextAction } from '../components/arena/controls'
import { Icon } from '../components/Icon'
import { Avatar } from '../components/media'
import { NotificationItem } from '../components/notifications/NotificationItem'
import { Button } from '../components/ui'
import { notificationView } from '../data/notifications'
import type { NotificationTarget } from '../data/notifications'
import { usePagedList } from '../hooks/usePagedList'
import { useResource } from '../hooks/useResource'
import { useSessionToken } from '../hooks/useSessionToken'
import type { ScreenProps } from '../navigation/screens'
import type { Navigation } from '../navigation/useNavigation'
import { colors } from '../theme'

type FollowRequest = { user: SocialUser; state: string }

/** Abre a tela de destino da notificação (os identificadores vêm do `payload`, nunca do cliente). */
export function openTarget(navigation: Navigation, target: NotificationTarget) {
  switch (target.screen) {
    case 'teams': navigation.go('teams', { ...(target.teamId ? { teamId: target.teamId } : {}), ...(target.invites ? { invites: true } : {}), ...(target.requests ? { requests: true } : {}) }); break
    case 'organizer-request': navigation.go('organizer-request'); break
    // `section: 'tabela'` abre o detalhe do evento na aba Tabela (tabela publicada e campeonato encerrado).
    case 'event': navigation.go('event', { eventId: target.eventId, ...(target.section ? { section: target.section } : {}) }); break
    case 'event-manage': navigation.go('event-manage', { eventId: target.eventId }); break
    case 'event-receipts': navigation.go('event-receipts', { eventId: target.eventId }); break
    case 'event-matches': navigation.go('event-matches', { eventId: target.eventId, ...(target.matchId ? { matchId: target.matchId } : {}) }); break
    // Etapas 3 a 5: a placa do Jogar (`matchId` é a dica da proposta ou da oferta a abrir), a partida e a decisão do organizador.
    case 'play': if (target.matchId) navigation.go('play', { matchId: target.matchId }); else navigation.go('play'); break
    case 'match': navigation.go('match', { matchId: target.matchId }); break
    case 'result-decision': navigation.go('result-decision', { matchId: target.matchId }); break
    case 'admin-paid-events': navigation.go('admin-paid-events'); break
    case 'admin-refund-disputes': navigation.go('admin-refund-disputes'); break
    case 'admin-court-suggestions': navigation.go('admin-court-suggestions'); break
    case 'admin-walkover-disputes': navigation.go('admin-walkover-disputes'); break
  }
}

function CountBadge({ children, label }: { children: string; label?: string }) {
  return <View accessibilityLabel={label} style={{ minWidth: 21, height: 21, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: 'rgba(0,90,54,0.07)', paddingHorizontal: 4 }}>
    <Text style={{ color: colors.brand, fontSize: 10, fontWeight: '700' }}>{children}</Text>
  </View>
}

/** Pedidos para seguir: foto, nome, @usuário e os botões de aprovar e recusar (44 pt). A foto lê o token só aqui. */
function FollowRequestList({ items, busy, onResolve }: { items: FollowRequest[]; busy: boolean; onResolve: (person: SocialUser, approve: boolean) => void }) {
  const token = useSessionToken()
  return <View style={{ overflow: 'hidden', borderRadius: 16, backgroundColor: '#ffffff' }}>
    {items.map(({ user: person }, index) => <View key={person.id} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: index > 0 ? 1 : 0, borderTopColor: colors.line }}>
      <Avatar path={person.avatar_url} name={person.name} token={token} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>{person.name}</Text>
        <Text numberOfLines={1} style={{ color: colors['ink-muted'], fontSize: 11 }}>@{person.username}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Aprovar solicitação de ${person.name}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => onResolve(person, true)}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.brand, opacity: busy ? 0.5 : 1 }}>
        <Icon name="check" size={18} color="#ffffff" />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Recusar solicitação de ${person.name}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => onResolve(person, false)}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: colors['line-strong'], opacity: busy ? 0.5 : 1 }}>
        <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>✕</Text>
      </Pressable>
    </View>)}
  </View>
}

const feedback = { fontSize: 13, lineHeight: 19, marginVertical: 8 } as const

/**
 * Notificações: os pedidos para seguir (`/me/follow-requests`) e as atividades da conta (`/me/notifications`):
 * convites e pedidos de times, decisões do organizador e, na etapa 2, inscrições, comprovantes, devoluções e avisos dos
 * eventos, e, nas etapas 3 a 5, propostas, partidas, W.O., resultados, vagas e quadras. Tocar marca como lida e leva à tela
 * do aviso (`openTarget`): a placa do Jogar, a partida, a decisão do organizador, a Tabela do evento e as filas da administração.
 */
export default function NotificationsScreen({ user, navigation, onExpired }: ScreenProps<'notifications'>) {
  const requests = usePagedList<FollowRequest>('/me/follow-requests', onExpired)
  const feed = usePagedList<ArenaNotification>(NOTIFICATIONS_PATH, onExpired)
  const unread = useResource(getUnreadCount, onExpired)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const loadedUnread = feed.items.filter(item => !item.read_at).length
  const unreadCount = Math.max(typeof unread.data?.unread_count === 'number' ? unread.data.unread_count : 0, loadedUnread)

  function failed(cause: unknown, fallback: string) {
    if (cause instanceof ApiError && cause.status === 401) onExpired()
    setError(cause instanceof Error && cause.message ? cause.message : fallback)
  }
  async function resolve(person: SocialUser, approve: boolean) {
    setBusy(true); setError(''); setNotice('')
    try {
      await request(`/me/follow-requests/${person.id}?approve=${approve}`, 'PUT')
      requests.setItems(old => old.filter(item => item.user.id !== person.id))
      setNotice(approve ? `Solicitação de ${person.name} aprovada.` : `Solicitação de ${person.name} recusada.`)
    } catch (cause) {
      failed(cause, 'Não foi possível responder à solicitação.')
    } finally { setBusy(false) }
  }
  async function approveAll() {
    setBusy(true); setError(''); setNotice('')
    try {
      // Aprovar tira itens da fila: cada lote recomeça na primeira página.
      while (true) {
        const page = await request<Page<FollowRequest>>('/me/follow-requests')
        if (page.items.length === 0) break
        for (const item of page.items) {
          await request(`/me/follow-requests/${item.user.id}?approve=true`, 'PUT')
          requests.setItems(old => old.filter(entry => entry.user.id !== item.user.id))
        }
      }
      setNotice('Solicitações aprovadas.')
    } catch (cause) {
      failed(cause, 'Não foi possível aprovar todas as solicitações.')
    } finally { requests.reload(); setBusy(false) }
  }
  async function open(notification: ArenaNotification) {
    const { target } = notificationView(notification, { isAdmin: user.is_admin })
    setError(''); setNotice('')
    if (!notification.read_at) {
      setBusy(true)
      try {
        const result = await markNotificationRead(notification.id)
        const readAt = new Date().toISOString()
        feed.setItems(old => old.map(item => item.id === notification.id ? { ...item, read_at: item.read_at ?? readAt } : item))
        unread.setData(result)
      } catch (cause) {
        // Sem destino, o erro fica na tela; com destino, a navegação segue (marcar como lida é secundário).
        if (cause instanceof ApiError && cause.status === 401) { onExpired(); return }
        if (!target) failed(cause, 'Não foi possível marcar a notificação como lida.')
      } finally { setBusy(false) }
    }
    if (target) openTarget(navigation, target)
  }
  async function readAll() {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await markAllNotificationsRead()
      const readAt = new Date().toISOString()
      feed.setItems(old => old.map(item => item.read_at ? item : { ...item, read_at: readAt }))
      unread.setData(result)
      setNotice('Todas as notificações foram marcadas como lidas.')
    } catch (cause) {
      failed(cause, 'Não foi possível marcar as notificações como lidas.')
    } finally { setBusy(false) }
  }

  if (requests.loading || feed.loading) return <View style={{ flex: 1, padding: 24 }}><Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 14 }}>Carregando notificações…</Text></View>
  // Um erro nas solicitações para seguir fica na própria seção: as atividades da conta continuam na tela.
  const empty = requests.items.length === 0 && feed.items.length === 0 && !feed.error && !requests.error
  return <ScrollView testID="notifications-screen" contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
    <View accessibilityLiveRegion="polite">
      {error ? <Text accessibilityRole="alert" style={{ ...feedback, color: colors.error }}>{error}</Text> : null}
      {notice ? <Text style={{ ...feedback, color: colors.brand }}>{notice}</Text> : null}
    </View>
    {requests.items.length === 0 && busy && !feed.items.length ? <Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 14 }}>Aprovando solicitações…</Text>
      : empty ? <View testID="notifications-empty" style={{ alignItems: 'center', borderRadius: 16, backgroundColor: '#ffffff', padding: 24 }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="bell" size={28} color={colors.brand} /></View>
        <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 17, fontWeight: '700', marginTop: 8 }}>Tudo em dia</Text>
        <Text style={{ color: colors['ink-muted'], fontSize: 13, lineHeight: 19, marginTop: 4, textAlign: 'center' }}>Convites e pedidos dos seus times, propostas e partidas, inscrições em campeonatos e provas e as respostas da administração aparecem aqui.</Text>
      </View>
        : <>
          {requests.error ? <View accessibilityLabel="Solicitações para seguir">
            <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Solicitações para seguir</Text>
            <Text accessibilityRole="alert" style={{ ...feedback, color: colors.error }}>{requests.error.message}</Text>
            <Button secondary title="Tentar novamente" onPress={requests.reload} />
          </View> : null}
          {requests.items.length > 0 ? <View accessibilityLabel="Solicitações para seguir">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>Solicitações para seguir</Text>
                <CountBadge>{`${requests.items.length}${requests.hasMore ? '+' : ''}`}</CountBadge>
              </View>
              <TextAction title="Aprovar todas" accessibilityLabel="Aprovar todas as solicitações" disabled={busy || requests.busy} onPress={() => void approveAll()} />
            </View>
            <FollowRequestList items={requests.items} busy={busy} onResolve={(person, approve) => void resolve(person, approve)} />
            {requests.moreError ? <Text accessibilityRole="alert" style={{ ...feedback, color: colors.error }}>{requests.moreError}</Text> : null}
            {requests.hasMore ? <Button secondary title="Carregar mais solicitações" disabled={busy || requests.busy} onPress={() => void requests.loadMore()} /> : null}
          </View> : null}
          <View accessibilityLabel="Atividades" style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>Atividades</Text>
                {unreadCount > 0 ? <CountBadge label={`${unreadCount} ${unreadCount === 1 ? 'não lida' : 'não lidas'}`}>{String(unreadCount)}</CountBadge> : null}
              </View>
              {unreadCount > 0 ? <TextAction title="Marcar todas como lidas" disabled={busy} onPress={() => void readAll()} /> : null}
            </View>
            {feed.error ? <View>
              <Text accessibilityRole="alert" style={{ ...feedback, color: colors.error }}>{feed.error.message}</Text>
              <Button secondary title="Tentar novamente" onPress={feed.reload} />
            </View>
              : feed.items.length === 0 ? <Text style={{ borderRadius: 16, backgroundColor: '#ffffff', paddingHorizontal: 14, paddingVertical: 16, color: colors['ink-muted'], fontSize: 12, lineHeight: 19 }}>
                Nenhuma atividade por enquanto. Convites e pedidos dos seus times, propostas e partidas, inscrições em campeonatos e provas e as respostas da administração aparecem aqui.
              </Text>
                : <View accessibilityLabel="Notificações da conta" style={{ overflow: 'hidden', borderRadius: 16, backgroundColor: '#ffffff' }}>
                  {feed.items.map((item, index) => <NotificationItem key={item.id} notification={item} busy={busy} isAdmin={user.is_admin} first={index === 0} onOpen={notification => void open(notification)} />)}
                </View>}
            {feed.moreError ? <Text accessibilityRole="alert" style={{ ...feedback, color: colors.error }}>{feed.moreError}</Text> : null}
            {feed.hasMore ? <Button secondary title={feed.busy ? 'Carregando…' : 'Carregar mais notificações'} disabled={busy || feed.busy} onPress={() => void feed.loadMore()} /> : null}
          </View>
        </>}
  </ScrollView>
}

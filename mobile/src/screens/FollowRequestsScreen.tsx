import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { request } from '../api/client'
import type { SocialUser } from '../api/client'
import { approveAllFollowRequests } from '../api/social'
import { LoadError } from '../components/arena/LoadError'
import { TextAction } from '../components/arena/controls'
import { FollowRequestList } from '../components/notifications/FollowRequestList'
import type { FollowRequest } from '../components/notifications/FollowRequestList'
import { toast } from '../components/toast/toastStore'
import { Button } from '../components/ui'
import { usePagedList } from '../hooks/usePagedList'
import { reportActionError } from '../hooks/useSubmit'
import type { ScreenProps } from '../navigation/screens'
import { colors } from '../theme'

const feedback = { fontSize: 13, lineHeight: 19, marginVertical: 8 } as const

/**
 * Pedidos para seguir (`/me/follow-requests`), aberta pela linha-resumo da tela de notificações: aprovar, recusar e "Aprovar
 * todas". Depois de cada ação o resumo das notificações é relido, para o sino e a linha de resumo acompanharem. O cabeçalho
 * com voltar e o título vem do shell.
 */
export default function FollowRequestsScreen({ onExpired, notificationSummary }: ScreenProps<'follow-requests'>) {
  const requests = usePagedList<FollowRequest>('/me/follow-requests', onExpired)
  const [busy, setBusy] = useState(false)

  async function resolve(person: SocialUser, approve: boolean) {
    setBusy(true)
    try {
      await request(`/me/follow-requests/${person.id}?approve=${approve}`, 'PUT')
      requests.setItems(old => old.filter(item => item.user.id !== person.id))
      toast.success(approve ? `Solicitação de ${person.name} aprovada.` : `Solicitação de ${person.name} recusada.`)
      notificationSummary.reload()
    } catch (cause) {
      reportActionError(cause, 'Não foi possível responder à solicitação.', onExpired)
    } finally { setBusy(false) }
  }
  async function approveAll() {
    setBusy(true)
    try {
      // Aprovar tira itens da fila: cada lote recomeça na primeira página, com teto de rodadas e parada se a fila não andar.
      const done = await approveAllFollowRequests(userId => requests.setItems(old => old.filter(entry => entry.user.id !== userId)))
      if (done) toast.success('Solicitações aprovadas.')
      else toast.warning('Nem todas as solicitações foram aprovadas. Tente de novo em instantes.')
    } catch (cause) {
      reportActionError(cause, 'Não foi possível aprovar todas as solicitações.', onExpired)
    } finally { requests.reload(); notificationSummary.reload(); setBusy(false) }
  }

  if (requests.loading) return <View style={{ flex: 1, padding: 24 }}><Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 14 }}>{busy ? 'Aprovando solicitações…' : 'Carregando pedidos…'}</Text></View>
  return <ScrollView testID="follow-requests-screen" contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
    {requests.error ? <LoadError size="section" title="Não foi possível carregar os pedidos" text={requests.error.message} cause={requests.error} onRetry={requests.reload} />
      : requests.items.length === 0 ? <Text testID="follow-requests-empty" style={{ borderRadius: 16, backgroundColor: '#ffffff', paddingHorizontal: 14, paddingVertical: 16, color: colors['ink-muted'], fontSize: 12, lineHeight: 19 }}>
        Nenhum pedido para seguir por enquanto. Quando alguém pedir para seguir a sua conta privada, o pedido aparece aqui.
      </Text>
        : <View accessibilityLabel="Pedidos para seguir" style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <View accessible accessibilityLabel={`${requests.items.length}${requests.hasMore ? ' ou mais' : ''} ${requests.items.length === 1 && !requests.hasMore ? 'pedido' : 'pedidos'}`}
              style={{ minWidth: 21, height: 21, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: 'rgba(0,90,54,0.07)', paddingHorizontal: 4 }}>
              <Text style={{ color: colors.brand, fontSize: 10, fontWeight: '700' }}>{`${requests.items.length}${requests.hasMore ? '+' : ''}`}</Text>
            </View>
            <TextAction title="Aprovar todas" accessibilityLabel="Aprovar todas as solicitações" disabled={busy || requests.busy} onPress={() => void approveAll()} />
          </View>
          <FollowRequestList items={requests.items} busy={busy} onResolve={(person, approve) => void resolve(person, approve)} />
          {requests.moreError ? <Text accessibilityRole="alert" style={{ ...feedback, color: colors.error }}>{requests.moreError}</Text> : null}
          {requests.hasMore ? <Button secondary title="Carregar mais solicitações" disabled={busy || requests.busy} onPress={() => void requests.loadMore()} /> : null}
        </View>}
  </ScrollView>
}

import { Pressable, ScrollView, Text, View } from 'react-native'
import { listOpenOrganizerEvents, organizerEventsPath } from '../api/events'
import type { OrganizerEventCard } from '../api/events'
import { getOrganizerStatus } from '../api/organizer'
import { EventPoster } from '../components/arena/EventPoster'
import { ActionButton, Notice, TextAction } from '../components/arena/controls'
import { LoadError } from '../components/arena/LoadError'
import { DarkTopBar, TeamsPlate } from '../components/arena/TeamsPlate'
import { alertCount, posterProps } from '../components/organizer/eventView'
import { NewEventPoster, PosterGrid } from '../components/organizer/PosterGrid'
import { usePagedList } from '../hooks/usePagedList'
import { useResource } from '../hooks/useResource'
import type { ScreenProps } from '../navigation/screens'
import { useThemeColors } from '../hooks/useTheme'
import { Icon } from '../components/Icon'

/**
 * Área do organizador (O3): os eventos como cartazes, com o estado no canto, a barra de inscrições e o alerta de
 * pendências (`pending.total` mais `championship.attention`); "Novo evento" é o último cartaz, tracejado. Abaixo, os encerrados e cancelados
 * (paginados). Sem permissão ativa (revogado), os eventos mantidos continuam, mas não há criação.
 */
export default function OrganizerEventsScreen({ navigation, onExpired }: ScreenProps<'organizer-events'>) {
  const colors = useThemeColors()
  const open = useResource(listOpenOrganizerEvents, onExpired, { fallback: 'Não foi possível carregar os seus eventos.' })
  const closed = usePagedList<OrganizerEventCard>(organizerEventsPath('encerrados'), onExpired)
  const status = useResource(getOrganizerStatus, onExpired)
  const canCreate = status.data?.state === 'aprovado'
  const openItems = open.data?.items ?? []
  const empty = !open.loading && !open.error && !openItems.length && !closed.loading && !closed.items.length
  const create = () => navigation.go('event-wizard')
  const manage = (eventId: number) => navigation.go('event-manage', { eventId })

  return <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
    <TeamsPlate bottom={16}>
      <DarkTopBar eyebrow="Menu" title="Meus eventos" backLabel="Voltar para o Menu" onBack={navigation.back}
        trailing={canCreate && !empty ? <Pressable accessibilityRole="button" accessibilityLabel="Criar evento" onPress={create}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)' }}>
          <Icon name="plus" size={22} color={colors.mint} />
        </Pressable> : undefined} />
      <Text style={{ paddingHorizontal: 16, paddingTop: 4, color: 'rgba(255,255,255,0.7)', fontSize: 11, lineHeight: 17 }}>Campeonatos de futebol e tênis e provas de corrida. Toque num cartaz para gerir.</Text>
    </TeamsPlate>
    <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
    {status.data && !canCreate ? <View style={{ marginTop: 12, borderRadius: 10, backgroundColor: colors['warning-bg'], padding: 12 }}>
      <Text style={{ color: colors.warning, fontSize: 11.5, lineHeight: 17 }}>
        {status.data.state === 'revogado' ? 'Sua permissão de organizador foi revogada. Os eventos que a administração manteve continuam aqui.' : 'Você precisa ser organizador para criar eventos.'}
      </Text>
    </View> : null}

    {open.loading ? <Text accessibilityLiveRegion="polite" style={{ marginTop: 14, color: colors['ink-muted'], fontSize: 12 }}>Carregando os seus eventos…</Text> : null}
    {open.error ? <LoadError size="screen" title="Não foi possível carregar os seus eventos" text={open.error} cause={open.errorCause} onRetry={open.reload} /> : null}

    {empty ? <View accessibilityLabel="Seu primeiro evento" style={{ alignItems: 'center', paddingHorizontal: 12, paddingVertical: 32 }}>
      <View style={{ width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors['icon-tile'] }}><Icon name="trophy" size={26} color={colors['icon-tile-ink']} /></View>
      <Text accessibilityRole="header" style={{ marginTop: 14, color: colors.ink, fontSize: 15, fontWeight: '800' }}>Seu primeiro evento</Text>
      <Text style={{ marginTop: 7, maxWidth: 290, textAlign: 'center', color: colors['ink-muted'], fontSize: 12, lineHeight: 20 }}>
        Campeonato de futebol ou tênis (todos contra todos ou eliminação simples) ou prova de corrida. Eventos pagos passam pela aprovação da administração antes de publicar.
      </Text>
      {canCreate ? <View style={{ marginTop: 16, alignSelf: 'stretch' }}><ActionButton block icon="plus" title="Criar evento" onPress={create} /></View> : null}
    </View> : !open.loading && !open.error ? <View style={{ marginTop: 14 }}>
      <PosterGrid label="Eventos em aberto">
        {[
          ...openItems.map(event => <EventPoster key={event.id} {...posterProps(event)} pendingCount={alertCount(event)} showSport onPress={() => manage(event.id)} />),
          ...(canCreate ? [<NewEventPoster key="new" onPress={create} />] : []),
        ]}
      </PosterGrid>
    </View> : null}

    {closed.items.length > 0 ? <View style={{ marginTop: 24 }}>
      <Text accessibilityRole="header" style={{ marginBottom: 8, color: colors.ink, fontSize: 16, fontWeight: '700' }}>Encerrados e cancelados</Text>
      <PosterGrid label="Eventos encerrados e cancelados">
        {closed.items.map(event => <EventPoster key={event.id} {...posterProps(event)} pendingCount={alertCount(event)} showSport onPress={() => manage(event.id)} />)}
      </PosterGrid>
      {closed.moreError ? <Notice>{closed.moreError}</Notice> : null}
      {closed.hasMore ? <TextAction title={closed.busy ? 'Carregando…' : 'Carregar mais'} disabled={closed.busy} onPress={() => void closed.loadMore()} /> : null}
    </View> : null}
    {closed.error ? <LoadError size="section" title="Não foi possível carregar os eventos encerrados" text={closed.error.message} cause={closed.error} onRetry={closed.reload} /> : null}
    </View>
  </ScrollView>
}

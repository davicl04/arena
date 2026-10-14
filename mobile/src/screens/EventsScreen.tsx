import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { sports } from '../api/client'
import type { City, Profile, Sport } from '../api/client'
import { eventsPath, myEntriesPath } from '../api/entries'
import type { EventCard, MyEntry } from '../api/entries'
import { EventPoster } from '../components/arena/EventPoster'
import { ChoicePills, sportChoices } from '../components/arena/controls'
import { LoadError } from '../components/arena/LoadError'
import { StateBadge } from '../components/arena/StateBadge'
import { isLocked } from '../components/events/entryCta'
import { Icon } from '../components/Icon'
import { Button } from '../components/ui'
import { entryState, eventNoun } from '../data/arena'
import { usePagedList } from '../hooks/usePagedList'
import { loadPlaces } from '../hooks/useCities'
import { useResource } from '../hooks/useResource'
import type { ScreenProps } from '../navigation/screens'
import { useThemeColors } from '../hooks/useTheme'
import { eventDateParts } from '../utils/format'

/** Perfis esportivos e cidades: a cidade do filtro vem do perfil da modalidade. */
const sportOptions = sportChoices('light')

/** Linha abaixo do cartaz: o motivo do cadeado ou por que não dá para se inscrever agora. */
function posterNote(card: EventCard, locked: boolean): string {
  if (locked) return card.eligibility.message ?? 'Fora da faixa de elos do evento.'
  if (card.my_entry) return ''
  if (card.revocation_pending) return 'Inscrições suspensas'
  if (card.phase === 'inscricoes_encerradas') return 'Inscrições encerradas'
  if (card.capacity && card.entries_count >= card.capacity) return 'Vagas esgotadas'
  return ''
}

/** Artigo e nome no singular: "nenhum campeonato", "nenhuma prova". */
const none = (sport: Sport) => (sport === 'corrida' ? 'Nenhuma prova aberta' : 'Nenhum campeonato aberto')

/** Cartazes da modalidade e da cidade, paginados, com o estado vazio honesto. Dois por linha. */
function EventGrid({ path, sport, cityName, onAllCities, onOpen, onExpired }: {
  path: string
  sport: Sport
  /** Cidade do filtro; sem ela, todas as cidades. */
  cityName: string | null
  onAllCities?: () => void
  onOpen: (card: EventCard) => void
  onExpired: () => void
}) {
  const colors = useThemeColors()
  const list = usePagedList<EventCard>(path, onExpired)
  const noun = eventNoun[sport]
  if (list.loading) return <Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 14 }}>Carregando {noun.many.toLowerCase()}…</Text>
  if (list.error) return <LoadError size="screen" title={`Não foi possível carregar ${noun.many.toLowerCase()}`} text={list.error.message} cause={list.error} onRetry={list.reload} />
  if (list.items.length === 0) return <View testID="events-empty" style={{ alignItems: 'center', borderRadius: 16, backgroundColor: colors.surface, padding: 22 }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name={sport === 'corrida' ? 'flag' : 'trophy'} size={26} color={colors.brand} /></View>
    <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 16, fontWeight: '700', marginTop: 8, textAlign: 'center' }}>{cityName ? `${none(sport)} em ${cityName}` : none(sport)}</Text>
    <Text style={{ color: colors['ink-muted'], fontSize: 13, lineHeight: 19, marginTop: 4, textAlign: 'center' }}>
      Quando um organizador publicar {sport === 'corrida' ? 'uma prova' : 'um campeonato'}{cityName ? ' na sua cidade' : ''}, {sport === 'corrida' ? 'ela' : 'ele'} aparece aqui.
    </Text>
    {onAllCities ? <View style={{ alignSelf: 'stretch' }}><Button secondary title="Ver todas as cidades" onPress={onAllCities} /></View> : null}
  </View>
  const rows: EventCard[][] = []
  for (let index = 0; index < list.items.length; index += 2) rows.push(list.items.slice(index, index + 2))
  return <View style={{ gap: 10 }}>
    <View accessibilityLabel={noun.many} style={{ gap: 10 }}>
      {rows.map(row => <View key={row[0].id} style={{ flexDirection: 'row', gap: 10 }}>
        {[0, 1].map(column => {
          const card = row[column]
          if (!card) return <View key={`vazio-${column}`} style={{ flex: 1 }} />
          const locked = isLocked(card)
          const note = posterNote(card, locked)
          return <View key={card.id} style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <EventPoster name={card.name} sport={card.sport ?? sport} startsAt={card.starts_at} format={card.format} distanceKm={card.distance_km} eventType={card.competition_type}
              priceCents={card.price_cents ?? 0} acceptedTiers={card.accepted_tiers} entries={card.capacity ? { count: card.entries_count, capacity: card.capacity } : null}
              state={card.state === 'em_andamento' ? 'em_andamento' : null} entryState={card.my_entry?.state ?? null} locked={locked} onPress={() => onOpen(card)} />
            {note ? <Text style={{ color: colors['ink-muted'], fontSize: 10, lineHeight: 14, paddingHorizontal: 4 }}>{note}</Text> : null}
          </View>
        })}
      </View>)}
    </View>
    {list.moreError ? <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 13 }}>{list.moreError}</Text> : null}
    {list.hasMore ? <Button secondary title={list.busy ? 'Carregando…' : `Carregar mais ${noun.many.toLowerCase()}`} disabled={list.busy} onPress={() => void list.loadMore()} /> : null}
  </View>
}

/** "Minhas inscrições" da modalidade: inscrições em curso (ocupam vaga ou com devolução), acima dos cartazes. */
function MyEntries({ entries, onOpen }: { entries: MyEntry[]; onOpen: (entry: MyEntry) => void }) {
  const colors = useThemeColors()
  return <View style={{ marginBottom: 16 }}>
    <Text accessibilityRole="header" style={{ color: colors.brand, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 6 }}>MINHAS INSCRIÇÕES</Text>
    <View style={{ overflow: 'hidden', borderRadius: 16, backgroundColor: colors.surface }}>
      {entries.map((entry, index) => {
        const date = eventDateParts(entry.event.starts_at)
        const info = entryState[entry.state]
        const detail = `${date ? date.label : 'Data a definir'}${entry.subject.team ? ` · ${entry.subject.team.name}` : ''}`
        return <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={`${entry.event.name}, ${detail}, ${info?.short ?? ''}`} onPress={() => onOpen(entry)}
          style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: index > 0 ? 1 : 0, borderTopColor: colors.line }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 40, alignItems: 'center', borderRadius: 10, backgroundColor: colors.forest, paddingVertical: 4 }}>
            <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '800', lineHeight: 18 }}>{date?.day ?? '—'}</Text>
            <Text style={{ color: colors.mint, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 }}>{(date?.month ?? '').toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '700' }}>{entry.event.name}</Text>
            <Text style={{ color: colors['ink-muted'], fontSize: 10.5 }}>{detail}</Text>
          </View>
          {info ? <StateBadge tone={info.tone}>{info.short}</StateBadge> : null}
          <Icon name="chevron" size={16} color={colors['ink-muted']} />
        </Pressable>
      })}
    </View>
  </View>
}

/**
 * Campeonatos e provas do atleta (E2 do Jogar): chips das modalidades, a cidade do perfil da modalidade (com a opção de
 * ver todas), "Minhas inscrições" em curso e os cartazes verde-escuros, com os fora da faixa apagados e com cadeado. Só
 * eventos reais: sem eventos publicados, o estado vazio.
 */
export default function EventsScreen({ params, navigation, onExpired }: ScreenProps<'events'>) {
  const colors = useThemeColors()
  const sport = params?.sport ?? 'futebol'
  const [allCities, setAllCities] = useState(false)
  const places = useResource(loadPlaces, onExpired, { fallback: 'Não foi possível carregar a cidade do seu perfil.' })
  const mine = usePagedList<MyEntry>(myEntriesPath('ativas'), onExpired)
  const [profiles, cities]: [Profile[], City[]] = places.data ?? [[], []]
  const profile = profiles.find(item => item.sport === sport)
  const city = cities.find(item => item.id === profile?.city_id) ?? null
  const filtered = Boolean(city) && !allCities
  const label = sports.find(item => item.value === sport)?.label ?? ''
  const myEntries = mine.items.filter(entry => entry.event.sport === sport)
  const cityText = places.loading ? 'Carregando cidade…'
    : places.error ? 'Cidade do perfil indisponível · todas as cidades'
      : filtered && city ? city.name : city ? 'Todas as cidades' : `Sem cidade no perfil de ${label} · todas as cidades`
  return <ScrollView testID="events-screen" contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
    <View style={{ marginBottom: 12 }}>
      <ChoicePills label="Modalidade" options={sportOptions} value={sport} onChange={value => navigation.setParams('events', { sport: value })} />
    </View>
    <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, borderRadius: 12, backgroundColor: colors.surface, paddingLeft: 13, paddingRight: 4 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="map-pin" size={16} color={colors.brand} /></View>
      <Text numberOfLines={2} accessibilityLiveRegion="polite" style={{ flex: 1, color: colors.ink, fontSize: 12, paddingVertical: 6 }}>{cityText}</Text>
      {places.loading ? null : places.error ? <Pressable accessibilityRole="button" accessibilityLabel="Tentar carregar a cidade de novo" onPress={places.reload} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 }}>
        <Text style={{ color: colors.brand, fontSize: 12, fontWeight: '700' }}>Tentar de novo</Text>
      </Pressable> : city ? <Pressable accessibilityRole="button" accessibilityLabel={filtered ? 'Ver todas as cidades' : `Só ${city.name}`} accessibilityState={{ selected: !filtered }} onPress={() => setAllCities(value => !value)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 }}>
        <Text style={{ color: colors.brand, fontSize: 12, fontWeight: '700' }}>{filtered ? 'Ver todas' : `Só ${city.name}`}</Text>
      </Pressable> : <Pressable accessibilityRole="button" accessibilityLabel="Definir cidade" onPress={() => navigation.go('profile')} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 }}>
        <Text style={{ color: colors.brand, fontSize: 12, fontWeight: '700' }}>Definir cidade</Text>
      </Pressable>}
    </View>
    {myEntries.length > 0 ? <MyEntries entries={myEntries} onOpen={entry => navigation.go('event', { eventId: entry.event.id, sport })} /> : null}
    {mine.error ? <LoadError size="section" title="Não foi possível carregar as suas inscrições" text={mine.error.message} cause={mine.error} onRetry={mine.reload} /> : null}
    {places.loading ? <Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 14 }}>Carregando {eventNoun[sport].many.toLowerCase()}…</Text>
      : <EventGrid path={eventsPath(sport, filtered ? city?.id : null)} sport={sport} cityName={filtered ? (city?.name ?? null) : null} onAllCities={filtered ? () => setAllCities(true) : undefined}
        onOpen={card => navigation.go('event', { eventId: card.id, sport: card.sport ?? sport })} onExpired={onExpired} />}
  </ScrollView>
}

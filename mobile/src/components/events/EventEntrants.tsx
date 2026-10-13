import { Text, View } from 'react-native'
import type { Sport } from '../../api/client'
import { publicEntriesPath } from '../../api/entries'
import type { PublicEntry } from '../../api/entries'
import { eventNoun } from '../../data/arena'
import { usePagedList } from '../../hooks/usePagedList'
import { useSessionToken } from '../../hooks/useSessionToken'
import { colors } from '../../theme'
import { formatShortDate, parseIso } from '../../utils/format'
import { TeamCrest } from '../arena/TeamCrest'
import { Avatar } from '../media'
import { Button } from '../ui'

/** Aba Inscritos do D2: só as inscrições confirmadas, na ordem da confirmação, com o selo "Você" na de quem vê. */
export function EventEntrants({ eventId, sport, myEntryId, onExpired }: { eventId: number; sport: Sport; myEntryId: number | null; onExpired: () => void }) {
  const list = usePagedList<PublicEntry>(publicEntriesPath(eventId), onExpired)
  const token = useSessionToken()
  const noun = eventNoun[sport]
  if (list.loading) return <Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 11, paddingHorizontal: 4 }}>Carregando inscritos…</Text>
  if (list.error) return <View>
    <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12, lineHeight: 17 }}>{list.error.message}</Text>
    <Button secondary title="Tentar novamente" onPress={list.reload} />
  </View>
  if (list.items.length === 0) return <View style={{ alignItems: 'center', borderRadius: 16, backgroundColor: '#ffffff', padding: 20 }}>
    <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>Nenhuma inscrição confirmada</Text>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, lineHeight: 18, marginTop: 4, textAlign: 'center' }}>Os {noun.entrants} aparecem aqui quando a inscrição é confirmada.</Text>
  </View>
  return <View style={{ gap: 8 }}>
    <View accessibilityLabel={`${noun.entrants[0].toUpperCase()}${noun.entrants.slice(1)} confirmados`} style={{ borderRadius: 16, backgroundColor: '#ffffff', paddingHorizontal: 14, paddingVertical: 4 }}>
      {list.items.map((item, index) => {
        const team = item.subject.team
        const athlete = item.subject.athlete
        const name = team?.name ?? athlete?.name ?? 'Inscrição'
        const confirmed = parseIso(item.confirmed_at)
        return <View key={item.id} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: index > 0 ? 1 : 0, borderTopColor: colors.line }}>
          {team ? <TeamCrest name={team.name} initials={team.initials} path={team.crest_url} size="sm" decorative token={token} />
            : <Avatar path={athlete?.avatar_url ?? null} name={name} token={token} size={32} />}
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <Text style={{ flexShrink: 1, color: colors.ink, fontSize: 12, fontWeight: '700' }}>{name}</Text>
              {item.id === myEntryId ? <Text style={{ borderRadius: 999, backgroundColor: colors['success-bg'], color: colors.brand, fontSize: 9.5, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 1 }}>Você</Text> : null}
            </View>
            <Text style={{ color: colors['ink-muted'], fontSize: 10.5 }}>{athlete ? `@${athlete.username} · ` : ''}{confirmed ? `confirmado em ${formatShortDate(confirmed)}` : 'confirmado'}</Text>
          </View>
        </View>
      })}
    </View>
    {list.moreError ? <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12 }}>{list.moreError}</Text> : null}
    {list.hasMore ? <Button secondary title={list.busy ? 'Carregando…' : 'Carregar mais inscritos'} disabled={list.busy} onPress={() => void list.loadMore()} /> : null}
  </View>
}

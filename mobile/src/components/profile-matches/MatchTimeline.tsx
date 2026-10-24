import { useState } from 'react'
import { Text, View } from 'react-native'
import { ApiError } from '../../api/client'
import type { MatchCard } from '../../api/matches'
import { timelinePath } from '../../api/profile'
import type { TimelineItem } from '../../api/profile'
import { usePagedList } from '../../hooks/usePagedList'
import { useNow } from '../../hooks/useNow'
import { useThemeColors } from '../../hooks/useTheme'
import { ActionButton } from '../arena/controls'
import { LoadError } from '../arena/LoadError'
import { nextScheduledMatch } from '../play/matchView'
import { NextMatchNode } from './NextMatchNode'
import { TimelineHeader } from './TimelineHeader'
import { TimelineRail } from './TimelineRail'
import type { SportFilter } from './timelineView'

/** Esqueleto de 3 cartões enquanto a primeira página chega. */
function Skeleton() {
  const colors = useThemeColors()
  return <View accessibilityLiveRegion="polite" accessibilityLabel="Carregando partidas" style={{ paddingHorizontal: 20, paddingTop: 8, gap: 12 }}>
    {[0, 1, 2].map(index => <View key={index} testID="timeline-skeleton" style={{ height: 92, borderRadius: 14, backgroundColor: colors.subtle }} />)}
  </View>
}

/**
 * Aba Partidas do perfil: topo com a contagem e o filtro, a próxima partida (só no perfil próprio, vinda da placa do Jogar
 * já lida pela tela) e o trilho da linha do tempo, tudo dentro da rolagem da tela (sem lista aninhada), com "Carregar mais".
 * No perfil visitado (`own = false`) nada é tocável, não há próxima partida nem quadra, e um 404 vira o vazio de visitante.
 */
export function MatchTimeline({ userId, own, upcoming = [], onOpenMatch, onPlay, onExpired }: {
  userId: number
  own: boolean
  /** Partidas da placa do Jogar (`GET /me/play`), de onde sai a próxima partida; ignorado no perfil visitado. */
  upcoming?: readonly MatchCard[]
  onOpenMatch?: (matchId: number) => void
  /** Leva ao Jogar (botão do vazio próprio). */
  onPlay?: () => void
  onExpired: () => void
}) {
  const colors = useThemeColors()
  const message = { color: colors['ink-muted'], fontSize: 12, lineHeight: 18, textAlign: 'center' as const }
  const [filter, setFilter] = useState<SportFilter>(null)
  const list = usePagedList<TimelineItem>(timelinePath(userId, filter), onExpired)
  const now = useNow(60_000, own)
  const scheduled = own ? nextScheduledMatch(upcoming, now) : null
  const next = scheduled && (filter === null || scheduled.sport === filter) ? scheduled : null
  // O filtro só vale com a lista carregada; o 404 do visitante (sem acesso) é o mesmo vazio do visitante.
  const hidden = !own && list.error instanceof ApiError && list.error.status === 404
  const failed = Boolean(list.error) && !hidden
  const header = <TimelineHeader total={list.loading || failed || hidden ? undefined : list.total ?? list.items.length} filter={filter} onFilter={setFilter} />

  if (list.loading) return <View>{header}<Skeleton /></View>
  if (failed) {
    return <View>
      {header}
      <LoadError size="section" title="Não foi possível carregar as partidas" text={list.error?.message || 'Não foi possível carregar as partidas.'} cause={list.error} onRetry={list.reload} />
    </View>
  }
  const empty = hidden || list.items.length === 0
  if (empty && filter !== null && !hidden && !next) {
    return <View>{header}<Text style={{ ...message, padding: 24 }}>Nenhum registro nesta modalidade.</Text></View>
  }
  if (empty && !next) {
    return <View>
      {header}
      <View style={{ alignItems: 'center', gap: 8, padding: 24 }}>
        <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 16, fontWeight: '800', textAlign: 'center' }}>{own ? 'Sua história em campo começa aqui' : 'Nenhuma partida por aqui'}</Text>
        <Text style={message}>{own ? 'Suas partidas e corridas aparecem nesta linha do tempo, da mais recente para a mais antiga.' : 'Quando esta pessoa tiver partidas ou corridas, elas aparecem aqui.'}</Text>
        {own && onPlay ? <ActionButton tone="brand" title="Jogar" onPress={onPlay} /> : null}
      </View>
    </View>
  }
  return <View>
    {header}
    <TimelineRail items={list.items} own={own} continues={list.hasMore} onOpenMatch={onOpenMatch}
      leading={next && onOpenMatch ? <NextMatchNode card={next} onOpen={onOpenMatch} /> : undefined} />
    {list.moreError ? <Text accessibilityRole="alert" style={{ ...message, color: colors.error, paddingVertical: 8 }}>{list.moreError}</Text> : null}
    {list.hasMore ? <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}><ActionButton tone="outline" title={list.busy ? 'Carregando…' : 'Carregar mais'} disabled={list.busy} onPress={() => void list.loadMore()} /></View> : null}
  </View>
}

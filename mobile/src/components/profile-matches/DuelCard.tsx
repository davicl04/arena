import { Pressable, Text, View } from 'react-native'
import type { TimelineMatch, TimelineMatchSide } from '../../api/profile'
import { useSessionToken } from '../../hooks/useSessionToken'
import { colors } from '../../theme'
import { StateBadge } from '../arena/StateBadge'
import { TeamCrest } from '../arena/TeamCrest'
import { Icon } from '../Icon'
import { Avatar } from '../media'
import { eventBand, isFaded, matchBadge, matchHeading, pointsLabel, pointsText, showsTiebreak, statsText } from './timelineView'
import type { MatchBadge } from './timelineView'

const sideName = (side: TimelineMatchSide) => side.team?.name ?? side.athlete?.name ?? 'Adversário'

function SideMark({ side }: { side: TimelineMatchSide }) {
  const token = useSessionToken()
  return side.team
    ? <TeamCrest name={side.team.name} initials={side.team.initials} path={side.team.crest_url} size="sm" decorative token={token} />
    : <View accessible={false} importantForAccessibility="no-hide-descendants"><Avatar path={side.athlete?.avatar_url ?? null} name={sideName(side)} token={token} size={29} /></View>
}

/** Selo do canto: cheio (Vitória, Empate, Derrota) ou tracejado (Cancelada, Sem resultado). */
function Badge({ badge }: { badge: MatchBadge }) {
  if (!badge.dashed) return <StateBadge tone={badge.tone}>{badge.label}</StateBadge>
  return <View testID="badge-dashed" style={{ alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: colors['ink-muted'], paddingHorizontal: 8, paddingVertical: 2 }}>
    <Text style={{ color: colors['ink-muted'], fontSize: 9.5, fontWeight: '800' }}>{badge.label}</Text>
  </View>
}

/** Placar de um lado: "Ausente" no W.O., colunas por set no tênis, os gols no futebol ou "–" sem placar. */
function ScoreCells({ match, side }: { match: TimelineMatch; side: TimelineMatchSide }) {
  const cell = { minWidth: 22, textAlign: 'center' as const, fontSize: 15 }
  const weight = match.score?.winner === side.side ? '800' : '500'
  if (match.walkover_absent_side === side.side) {
    return <View testID="absent-tag" style={{ borderRadius: 6, backgroundColor: colors.subtle, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color: colors['ink-muted'], fontSize: 11, fontWeight: '800' }}>Ausente</Text>
    </View>
  }
  if (!match.score) return <Text style={{ ...cell, color: colors['ink-muted'] }}>–</Text>
  const sets = match.score.sets
  if (sets?.length) {
    return <View style={{ flexDirection: 'row', gap: 4 }}>
      {sets.map((set, index) => <Text key={index} testID="set-cell" style={{ ...cell, color: colors.ink, fontWeight: weight }}>
        {set[side.side]}{showsTiebreak(set, side.side) && set.tiebreak ? <Text style={{ fontSize: 9, fontWeight: '500' }}>{set.tiebreak[side.side]}</Text> : null}
      </Text>)}
    </View>
  }
  return <Text style={{ ...cell, color: colors.ink, fontWeight: weight }}>{match.score[side.side]}</Text>
}

function summary(match: TimelineMatch, heading: string, badge: MatchBadge | null): string {
  const sides = match.sides.map(sideName).join(' contra ')
  const score = match.score && match.walkover_absent_side === null && !match.score.sets?.length ? `, placar ${match.score.a} a ${match.score.b}` : ''
  return [badge?.label, sides + score, heading, match.event?.name].filter(Boolean).join(', ')
}

/**
 * Uma partida na linha do tempo: o mini placar claro com os dois lados em linhas. O lado do titular leva "você" (só no
 * perfil próprio) e o vencedor fica em negrito. Vira botão só com `onOpen` (perfil próprio); cancelada e sem resultado ficam
 * esmaecidas, com "–" no placar. A quadra só aparece no perfil próprio (o servidor já a omite para visitantes).
 */
export function DuelCard({ match, own, onOpen }: { match: TimelineMatch; own: boolean; onOpen?: (matchId: number) => void }) {
  const heading = matchHeading(match)
  const badge = matchBadge(match)
  const band = eventBand(match)
  const stats = statsText(match.stats)
  const body = <>
    {band ? <View testID="event-band" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.forest, paddingHorizontal: 12, paddingVertical: 6 }}>
      <Icon name="trophy" size={13} color={colors.mint} />
      <Text numberOfLines={1} style={{ flexShrink: 1, color: '#ffffff', fontSize: 11, fontWeight: '700' }}>{band.name}</Text>
      {band.round ? <Text style={{ color: colors.mint, fontSize: 11, fontWeight: '800' }}>· {band.round}</Text> : null}
    </View> : null}
    <View style={{ padding: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ flexShrink: 1, color: colors['ink-muted'], fontSize: 11, fontWeight: '600' }}>{heading}</Text>
        {badge ? <Badge badge={badge} /> : null}
      </View>
      {match.sides.map(side => <View key={side.side} testID="duel-side" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <SideMark side={side} />
        <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.ink, fontSize: 13, fontWeight: match.score?.winner === side.side ? '800' : '500' }}>{sideName(side)}</Text>
        {own && side.is_owner ? <View style={{ borderRadius: 999, backgroundColor: colors['brand-soft'], paddingHorizontal: 7, paddingVertical: 1 }}>
          <Text style={{ color: colors.brand, fontSize: 9.5, fontWeight: '800' }}>você</Text>
        </View> : null}
        <View style={{ flexGrow: 1, alignItems: 'flex-end' }}><ScoreCells match={match} side={side} /></View>
      </View>)}
      {match.points !== null || stats ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {match.points !== null ? <View accessible accessibilityLabel={pointsLabel(match.points)} style={{ borderRadius: 999, backgroundColor: colors['success-bg'], paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ color: colors.brand, fontSize: 11, fontWeight: '800' }}>{pointsText(match.points)}</Text>
        </View> : null}
        {stats ? <View style={{ borderRadius: 999, backgroundColor: colors.subtle, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ color: colors['ink-muted'], fontSize: 11, fontWeight: '600' }}>{stats}</Text>
        </View> : null}
      </View> : null}
      {own && match.court ? <Text style={{ color: colors['ink-muted'], fontSize: 11 }}>{match.court.name}</Text> : null}
    </View>
  </>
  const frame = { overflow: 'hidden' as const, borderRadius: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: colors.line, opacity: isFaded(match) ? 0.6 : 1 }
  if (onOpen) {
    return <Pressable testID="duel-card" accessibilityRole="button" accessibilityLabel={summary(match, heading, badge)} accessibilityHint="Abre a partida" onPress={() => onOpen(match.id)} style={{ ...frame, minHeight: 44 }}>{body}</Pressable>
  }
  return <View testID="duel-card" style={frame}>{body}</View>
}

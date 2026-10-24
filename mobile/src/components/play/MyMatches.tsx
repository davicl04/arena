import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { MY_MATCHES_HISTORY_PATH } from '../../api/matchmaking'
import type { MatchCard } from '../../api/matches'
import { matchPhases, sideOf } from '../../data/match'
import { usePagedList } from '../../hooks/usePagedList'
import { useResolvedTheme, useThemeColors } from '../../hooks/useTheme'
import { ActionButton } from '../arena/controls'
import { LoadError } from '../arena/LoadError'
import { StateBadge } from '../arena/StateBadge'
import { Icon } from '../Icon'
import { matchDetail, matchTitle } from './matchView'
import { SideMark } from './SideBadge'

type Scope = 'proximas' | 'historico'
const scopes: { value: Scope; label: string }[] = [{ value: 'proximas', label: 'Próximas' }, { value: 'historico', label: 'Histórico' }]

/** Cartão de uma partida nas listas da placa: os dois lados, o título, quando e onde, e a fase. Leva à tela da partida. */
export function MatchRow({ card, divider = false, onOpen }: { card: MatchCard; divider?: boolean; onOpen: (matchId: number) => void }) {
  const c = useThemeColors()
  const phase = matchPhases[card.phase]
  const mine = sideOf(card, card.my_side) ?? card.sides[0]
  const other = card.sides.find(side => side !== mine)
  const title = matchTitle(card)
  const detail = matchDetail(card)
  const label = [title, detail, phase?.label ?? card.phase, card.needs_my_action ? 'sua vez' : ''].filter(Boolean).join(', ')
  return <Pressable testID="match-row" accessibilityRole="button" accessibilityLabel={label} onPress={() => onOpen(card.id)}
    style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: divider ? 1 : 0, borderTopColor: c.line }}>
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row' }}>
      <SideMark side={mine} />
      <View style={{ marginLeft: -8 }}><SideMark side={other} /></View>
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: c.ink, fontSize: 12.5, fontWeight: '700' }}>{title}</Text>
      <Text style={{ marginTop: 2, color: c['ink-muted'], fontSize: 10.5, lineHeight: 16 }}>{detail}</Text>
      <View style={{ marginTop: 4, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
        <StateBadge tone={phase?.tone ?? 'closed'}>{phase?.label ?? card.phase}</StateBadge>
        {card.needs_my_action ? <StateBadge tone="pending">Sua vez</StateBadge> : null}
      </View>
    </View>
    <Icon name="chevron" size={18} color={c['ink-muted']} />
  </Pressable>
}

const messageStyle = (color: string) => ({ color, fontSize: 11.5, lineHeight: 17, textAlign: 'center' as const, paddingVertical: 16 })

function History({ sport, onOpen, onExpired }: { sport: MatchCard['sport']; onOpen: (matchId: number) => void; onExpired: () => void }) {
  const c = useThemeColors()
  const message = messageStyle(c['ink-muted'])
  const list = usePagedList<MatchCard>(MY_MATCHES_HISTORY_PATH, onExpired)
  const items = list.items.filter(card => card.sport === sport)
  if (list.loading) return <Text accessibilityLiveRegion="polite" style={message}>Carregando o histórico…</Text>
  if (list.error) return <LoadError size="section" title="Não foi possível carregar o histórico" text={list.error.message} cause={list.error} onRetry={list.reload} />
  return <View>
    {items.length
      ? items.map((card, index) => <MatchRow key={card.id} card={card} divider={index > 0} onOpen={onOpen} />)
      : <Text style={message}>Suas partidas encerradas, sem resultado ou canceladas aparecem aqui.</Text>}
    {list.moreError ? <Text accessibilityRole="alert" style={{ ...message, color: c.error, paddingVertical: 8 }}>{list.moreError}</Text> : null}
    {list.hasMore ? <ActionButton tone="outline" title={list.busy ? 'Carregando…' : 'Carregar mais'} disabled={list.busy} onPress={() => void list.loadMore()} /> : null}
  </View>
}

/**
 * Minhas partidas (Próximas | Histórico). Próximas é o que a placa já leu (`GET /me/play`: combinando, agendada e
 * resultado em aberto); o Histórico lê `GET /me/matches?scope=historico` só quando é aberto. Cada cartão leva à partida.
 */
export function MyMatches({ sport, upcoming, onOpen, onExpired }: {
  sport: MatchCard['sport']
  upcoming: MatchCard[]
  onOpen: (matchId: number) => void
  onExpired: () => void
}) {
  const c = useThemeColors()
  const night = useResolvedTheme() === 'dark'
  const [scope, setScope] = useState<Scope>('proximas')
  const shown = upcoming.filter(card => card.sport === sport)
  return <View style={{ paddingHorizontal: 20 }}>
    <Text accessibilityRole="header" style={{ marginTop: 22, marginBottom: 10, color: night ? c.eyebrow : c.brand, fontSize: 11, fontWeight: '700', letterSpacing: 2 }}>MINHAS PARTIDAS</Text>
    <View accessibilityRole="tablist" accessibilityLabel="Minhas partidas" style={{ marginBottom: 8, flexDirection: 'row', gap: 4, borderRadius: 12, padding: 3, backgroundColor: c.tile }}>
      {scopes.map(item => {
        const selected = item.value === scope
        return <Pressable key={item.value} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected }} onPress={() => setScope(item.value)}
          style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: selected ? c.surface : 'transparent' }}>
          <Text style={{ color: selected ? c.brand : c['ink-muted'], fontSize: 12.5, fontWeight: selected ? '800' : '600' }}>{item.label}</Text>
        </Pressable>
      })}
    </View>
    <View style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 4, backgroundColor: c.surface }}>
      {scope === 'proximas'
        ? shown.length
          ? shown.map((card, index) => <MatchRow key={card.id} card={card} divider={index > 0} onOpen={onOpen} />)
          : <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 20 }}>
            <Icon name="swords" size={16} color={c['ink-muted']} />
            <Text style={{ flexShrink: 1, color: c['ink-muted'], fontSize: 11.5, lineHeight: 17, textAlign: 'center' }}>Nenhuma partida em andamento. Encontre um adversário para começar.</Text>
          </View>
        : <History sport={sport} onOpen={onOpen} onExpired={onExpired} />}
    </View>
  </View>
}

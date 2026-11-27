import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Text } from '../Text'
import { getProfileStats } from '../../api/profile'
import type { ProfileStats } from '../../api/profile'
import { tiers } from '../../data/arena'
import { useResource } from '../../hooks/useResource'
import { useThemeColors } from '../../hooks/useTheme'
import { TierEmblem } from '../arena/TierEmblem'

/** "62%" (arredondado) ou "—" sem partidas. */
export const winRateText = (stats: ProfileStats | null) => stats?.win_rate == null ? '—' : `${Math.round(stats.win_rate)}%`

function Block({ label, value, children, compact = false }: { label: string; value: string; children?: ReactNode; compact?: boolean }) {
  const colors = useThemeColors()
  // Cartão da superfície com o número em Sora no centro e o rótulo embaixo, como a web.
  return <View accessible accessibilityLabel={`${label}: ${value}`}
    style={{ flex: 1, minWidth: 0, alignItems: 'center', borderRadius: 13, borderWidth: 1, borderColor: colors['surface-edge'], backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 13 }}>
    <View style={{ minHeight: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      {children}
      <Text display={!compact} numberOfLines={2} style={{ flexShrink: 1, textAlign: 'center', color: colors.heading, fontSize: compact ? 12 : children ? 14 : 18, lineHeight: compact || children ? 22 : 23, fontWeight: '700' }}>{value}</Text>
    </View>
    <Text style={{ marginTop: 3, color: colors['ink-muted'], fontSize: 9 }}>{label}</Text>
  </View>
}

/**
 * "Suas estatísticas" do perfil próprio (`GET /me/profile-stats`): Taxa de vitória, Partidas e Melhor elo. O título fica com o
 * perfil (`SectionTitle`). O carregamento e o erro não bloqueiam o perfil: os blocos ficam com "—". Quem só está em
 * classificação nunca recebe um elo.
 */
export function ProfileStatsBlocks({ onExpired }: { onExpired: () => void }) {
  const colors = useThemeColors()
  const stats = useResource(getProfileStats, onExpired, { fallback: 'Não foi possível carregar as estatísticas.' })
  const data = stats.data
  const tier = data?.best_tier && data.best_tier in tiers ? data.best_tier : null
  const elo = tier ? tiers[tier].name : data?.in_placement ? 'Em classificação' : '—'
  return <View style={{ paddingHorizontal: 20, paddingBottom: 6, gap: 8 }}>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Block label="Taxa de vitória" value={winRateText(data)} />
      <Block label="Partidas" value={data ? String(data.played) : '—'} />
      <Block label="Melhor elo" value={elo} compact={!tier && Boolean(data?.in_placement)}>{tier ? <TierEmblem tier={tier} size="sm" decorative /> : null}</Block>
    </View>
    {stats.error ? <Text style={{ color: colors['ink-muted'], fontSize: 11 }}>{stats.error}</Text> : null}
  </View>
}

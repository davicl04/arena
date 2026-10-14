import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { getProfileStats } from '../../api/profile'
import type { ProfileStats } from '../../api/profile'
import { tiers } from '../../data/arena'
import { useResource } from '../../hooks/useResource'
import { useThemeColors } from '../../hooks/useTheme'
import { TierEmblem } from '../arena/TierEmblem'

/** "62%" (arredondado) ou "—" sem partidas. */
export const winRateText = (stats: ProfileStats | null) => stats?.win_rate == null ? '—' : `${Math.round(stats.win_rate)}%`

function Block({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  const colors = useThemeColors()
  return <View accessible accessibilityLabel={`${label}: ${value}`} style={{ flex: 1, minWidth: 0, borderRadius: 12, backgroundColor: colors['brand-soft'], padding: 12, gap: 4 }}>
    <Text style={{ color: colors['ink-muted'], fontSize: 10.5, fontWeight: '700' }}>{label}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 }}>
      {children}
      <Text numberOfLines={2} style={{ flexShrink: 1, color: colors.ink, fontSize: value.length > 6 ? 13 : 20, fontWeight: '800' }}>{value}</Text>
    </View>
  </View>
}

/**
 * "Suas estatísticas" do perfil próprio (`GET /me/profile-stats`): Taxa de vitória, Partidas e Melhor elo. O carregamento e o
 * erro não bloqueiam o perfil: os blocos ficam com "—". Quem só está em classificação nunca recebe um elo.
 */
export function ProfileStatsBlocks({ onExpired }: { onExpired: () => void }) {
  const colors = useThemeColors()
  const stats = useResource(getProfileStats, onExpired, { fallback: 'Não foi possível carregar as estatísticas.' })
  const data = stats.data
  const tier = data?.best_tier && data.best_tier in tiers ? data.best_tier : null
  const elo = tier ? tiers[tier].name : data?.in_placement ? 'Em classificação' : '—'
  return <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6, gap: 8 }}>
    <Text accessibilityRole="header" style={{ color: colors.brand, fontSize: 11, fontWeight: '700', letterSpacing: 2 }}>SUAS ESTATÍSTICAS</Text>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Block label="Taxa de vitória" value={winRateText(data)} />
      <Block label="Partidas" value={data ? String(data.played) : '—'} />
      <Block label="Melhor elo" value={elo}>{tier ? <TierEmblem tier={tier} size="sm" decorative /> : null}</Block>
    </View>
    {stats.error ? <Text style={{ color: colors['ink-muted'], fontSize: 11 }}>{stats.error}</Text> : null}
  </View>
}

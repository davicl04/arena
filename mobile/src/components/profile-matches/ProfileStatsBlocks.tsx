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

/**
 * Bloco como o da web: o valor centralizado em cima e o rótulo pequeno embaixo. Nome de elo (com o brasão) em 14 e uma
 * linha, que encolhe em telas estreitas em vez de partir a palavra; "Em classificação" em 12, podendo ir a duas linhas.
 */
function Block({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  const colors = useThemeColors()
  const words = value.includes(' ')
  const size = children ? 14 : words ? 12 : 18
  return <View accessible accessibilityLabel={`${label}: ${value}`} style={{ flex: 1, minWidth: 0, borderRadius: 12, backgroundColor: colors['brand-soft'], paddingHorizontal: 8, paddingVertical: 13, alignItems: 'center', gap: 3 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 22, maxWidth: '100%' }}>
      {children}
      <Text numberOfLines={words ? 2 : 1} adjustsFontSizeToFit={!words} minimumFontScale={0.7}
        style={{ flexShrink: 1, color: colors.ink, fontSize: size, fontWeight: '800', textAlign: 'center' }}>{value}</Text>
    </View>
    <Text style={{ color: colors['ink-muted'], fontSize: 10, fontWeight: '600', textAlign: 'center' }}>{label}</Text>
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

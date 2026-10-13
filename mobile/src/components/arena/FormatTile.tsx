import { Text, View } from 'react-native'
import { footballFormat, placementRequired, shownTier, tiers } from '../../data/arena'
import type { FootballFormat, TierKey } from '../../data/arena'
import { colors } from '../../theme'
import { PlacementBadge } from './PlacementMeter'
import { TierEmblem } from './TierEmblem'

export interface FormatTileProps {
  format: FootballFormat
  /** Elo do time no formato, como vier da API. Só aparece com a classificação completa (`shownTier`). */
  tier: TierKey | null
  /** Partidas confirmadas no formato (janela de 52 semanas). */
  played: number
  required?: number
}

/**
 * Célula da grade Futsal | Society | Campo da carteirinha (C5), sobre a placa escura: o elo (nome em
 * menta), "n/3 jogos" durante a classificação ou "sem jogos", apagada.
 */
export function FormatTile({ format, tier, played, required = placementRequired }: FormatTileProps) {
  const shown = shownTier(tier, played, required)
  const state = shown ? 'ranked' : played > 0 ? 'placement' : 'empty'
  const done = Math.min(Math.max(0, played), required)
  const label = footballFormat[format].label
  const detail = shown ? tiers[shown].name : state === 'placement' ? `${done}/${required} jogos` : 'sem jogos'
  const spoken = shown ? `${label}, elo ${tiers[shown].name}` : state === 'placement' ? `${label}, ${done} de ${required} partidas de classificação` : `${label}, sem jogos`
  return <View accessible accessibilityLabel={spoken} testID={`format-tile-${state}`}
    style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 3, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.18)', paddingHorizontal: 4, paddingTop: 9, paddingBottom: 8, opacity: state === 'empty' ? 0.55 : 1 }}>
    {shown ? <TierEmblem tier={shown} size="md" decorative /> : <PlacementBadge played={done} required={required} size="md" decorative />}
    <Text className="text-[10.5px] font-bold text-white">{label}</Text>
    <Text numberOfLines={1} style={{ fontSize: 9, color: shown ? colors.mint : 'rgba(255,255,255,0.55)', fontWeight: shown ? '700' : '400' }}>{detail}</Text>
  </View>
}

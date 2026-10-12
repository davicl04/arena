import { Text, View } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { brandSvgs } from '../../assets/brand-svgs'
import { tiers } from '../../data/arena'
import type { TierKey } from '../../data/arena'

/** Tamanhos dos protótipos, em pontos: xs 16 (pílulas de formato) · sm 22 (padrão, linhas) · md 32 (célula de formato) · lg 44 (linha do elo do Jogar) · xl 52 (cartazes e ranking). */
export const tierEmblemSizes = { xs: 16, sm: 22, md: 32, lg: 44, xl: 52 } as const
export type TierEmblemSize = keyof typeof tierEmblemSizes

export interface TierEmblemProps {
  /**
   * Elo com a classificação completa (obtenha com `shownTier`). **Nunca** use para quem está em
   * classificação: nesse caso, `PlacementBadge` ou `PlacementMeter`.
   */
  tier: TierKey
  size?: TierEmblemSize
  /** Mostra o nome do elo ao lado do brasão. */
  showName?: boolean
  /** Use quando o nome do elo já aparece no texto vizinho. */
  decorative?: boolean
}

/** Brasão do elo (Bronze a Lendário), com o nome opcional. Uma chave desconhecida não mostra nada. */
export function TierEmblem({ tier, size = 'sm', showName = false, decorative = false }: TierEmblemProps) {
  const info = tiers[tier]
  if (!info) return null
  const px = tierEmblemSizes[size]
  const hidden = showName || decorative
  const image = <View accessibilityRole={hidden ? undefined : 'image'} accessibilityLabel={hidden ? undefined : `Elo ${info.name}`}
    accessible={!hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}>
    <SvgXml xml={brandSvgs[tier]} width={px} height={px} />
  </View>
  if (!showName) return image
  return <View className="flex-row items-center gap-1.5">{image}<Text className="font-bold text-ink">{info.name}</Text></View>
}

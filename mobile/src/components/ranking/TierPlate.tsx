import { Text, View } from 'react-native'
import type { ReactNode } from 'react'
import type { MyRankingOverviewLine, RankingCategory, RankingKey, RankingRow, TierCounts } from '../../api/results'
import { tierTint } from '../../data/arena'
import type { TierKey } from '../../data/arena'
import { colors } from '../../theme'
import { ArenaMark } from '../arena/ArenaMark'
import { TierPositionHero } from './TierPositionHero'
import { TierSwitch } from './TierSwitch'
import { TierWindow } from './TierWindow'
import { inTier } from './tiers'
import { Wash } from './Wash'

const MARK_WIDTH = 330
const MARK_HEIGHT = 188

/**
 * Fundo escuro das placas do Ranking: `forest` com o topo tingido do tom do elo (o gradiente é um `Svg`, sem dependência
 * nova) e o Coliseu em marca-d'água. Os filhos ficam acima de ambos.
 */
export function TintedPlate({ tier, children, testID }: { tier: TierKey; children: ReactNode; testID?: string }) {
  const tint = tierTint[tier]
  return <View testID={testID} style={{ overflow: 'hidden', borderRadius: 22, backgroundColor: colors.forest }}>
    <Wash id={`plate-${tier}`} color={tint} />
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', bottom: -24, left: '50%', marginLeft: -MARK_WIDTH / 2, width: MARK_WIDTH, height: MARK_HEIGHT, opacity: 0.045 }}>
      <ArenaMark width={MARK_WIDTH} height={MARK_HEIGHT} color="#ffffff" />
    </View>
    {children}
  </View>
}

/**
 * Placa contínua do Ranking: um bloco tingido na cor do elo mostrado, com a troca de elo no topo, a posição do titular (quando o
 * elo é o dele) e a janela do elo em vidro. Em outro elo (ou sem elo) diz "Os 5 primeiros no Ouro:" e mostra os 5 primeiros.
 */
export function TierPlate({ category, ranking, tier, counts, mineTier, line, window, teamName, noun, onShow, onHall, onExpired, onOpenUser, reveal }: {
  category: RankingCategory
  ranking: RankingKey
  /** Elo mostrado na placa. */
  tier: TierKey
  counts: TierCounts
  /** Elo do titular nesta categoria; nulo em classificação, sem marca ou sem time. */
  mineTier: TierKey | null
  line: MyRankingOverviewLine | null
  window: RankingRow[] | null
  teamName: string | null
  noun: { one: string; many: string }
  onShow: (tier: TierKey) => void
  onHall: () => void
  onExpired: () => void
  onOpenUser?: (userId: number) => void
  reveal?: (node: View | null) => void
}) {
  const mine = mineTier === tier && line
  const shown = Math.min(5, counts[tier])
  const first = shown === 1 ? 'O primeiro' : `Os ${shown} primeiros`
  return <TintedPlate tier={tier} testID="tier-plate">
    <TierSwitch tier={tier} counts={counts} noun={noun} onShow={onShow} onHall={onHall} />
    {mine ? <TierPositionHero line={line} tier={tier} ranking={ranking} teamName={teamName} />
      : counts[tier] > 0
        ? <Text style={{ marginHorizontal: 16, marginTop: 14, color: 'rgba(255,255,255,0.75)', fontSize: 11.5 }}>
          {`${mineTier ? `Você está ${inTier(mineTier)}. ` : ''}${first} ${inTier(tier)}:`}
        </Text>
        : null}
    <TierWindow category={category} ranking={ranking} tier={tier} counts={counts} line={mine ? line : null} window={mine ? window : null}
      noun={noun} onExpired={onExpired} onOpenUser={onOpenUser} reveal={reveal} />
  </TintedPlate>
}

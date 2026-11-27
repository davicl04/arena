import { View } from 'react-native'
import { Text } from '../Text'
import { tierOrder, tiers } from '../../data/arena'
import type { TierKey } from '../../data/arena'
import { useThemeColors } from '../../hooks/useTheme'
import { ChoicePills } from '../arena/controls'
import type { ChoiceOption } from '../arena/controls'
import { TierEmblem } from '../arena/TierEmblem'

/** As faixas que quem está sem elo pode ver: Bronze a Diamante (o Lendário tem o Salão). */
const options: ChoiceOption<TierKey>[] = tierOrder.filter(tier => tier !== 'lendario').map(tier => ({
  value: tier, label: tiers[tier].name, leading: () => <TierEmblem tier={tier} size="xs" decorative />,
}))

/** Quem está sem elo escolhe qual faixa ver; a placa começa no Bronze. As quatro faixas ficam numa linha que rola, sem quebrar. */
export function TierPicker({ value, onChange }: { value: TierKey; onChange: (tier: TierKey) => void }) {
  const c = useThemeColors()
  return <View style={{ gap: 8 }}>
    <Text style={{ color: c['ink-muted'], fontSize: 11, lineHeight: 16.5 }}>Você ainda não tem elo. Veja quem está em cada faixa:</Text>
    <ChoicePills label="Elo" options={options} value={value} onChange={onChange} row={20} />
  </View>
}

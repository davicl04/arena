import { Pressable, Text, View } from 'react-native'
import type { TierCounts } from '../../api/results'
import { tiers } from '../../data/arena'
import type { TierKey } from '../../data/arena'
import { plural } from '../../utils/format'
import { TierEmblem } from '../arena/TierEmblem'
import { Icon } from '../Icon'
import { tierName, tierNeighbor } from './tiers'

function Step({ label, text, disabled, direction, onPress }: { label: string; text: string; disabled: boolean; direction: 'down' | 'up'; onPress: () => void }) {
  const chevron = <View style={direction === 'down' ? { transform: [{ rotate: '180deg' }] } : undefined}><Icon name="chevron" size={17} color="#ffffff" /></View>
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: direction === 'down' ? 'flex-start' : 'flex-end', gap: 2, opacity: disabled ? 0.3 : 1 }}>
    {direction === 'down' ? chevron : null}
    <Text numberOfLines={1} style={{ flexShrink: 1, color: '#ffffff', fontSize: 12, fontWeight: '600' }}>{text}</Text>
    {direction === 'up' ? chevron : null}
  </Pressable>
}

/**
 * Troca de elo no topo da placa contínua (‹ Ouro · DIAMANTE · Salão ›). As setas pulam os elos vazios: ‹ vai ao elo de baixo com
 * integrantes e › ao de cima; a partir do Diamante, › abre o Salão dos Lendários (`onHall`) quando há Lendários.
 */
export function TierSwitch({ tier, counts, noun, onShow, onHall }: {
  tier: TierKey
  counts: TierCounts
  noun: { one: string; many: string }
  onShow: (tier: TierKey) => void
  onHall: () => void
}) {
  const down = tierNeighbor(counts, tier, -1)
  const up = tierNeighbor(counts, tier, 1)
  return <View testID="tier-switch" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 6 }}>
    <Step direction="down" disabled={!down} text={down ? tiers[down].name : ''} label={down ? `Ver elo ${tiers[down].name}` : 'Nenhum elo abaixo'} onPress={() => down && onShow(down)} />
    <View accessible accessibilityLabel={`Elo ${tiers[tier].name}, ${plural(counts[tier], noun.one, noun.many)}`} style={{ alignItems: 'center', gap: 1, paddingHorizontal: 4 }}>
      <TierEmblem tier={tier} size="lg" decorative />
      <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '800', letterSpacing: 0.6 }}>{tiers[tier].name.toUpperCase()}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>{plural(counts[tier], noun.one, noun.many)}</Text>
    </View>
    <Step direction="up" disabled={!up} text={up ? tierName(up) : ''}
      label={up ? (up === 'lendario' ? 'Abrir o Salão dos Lendários' : `Ver elo ${tiers[up].name}`) : 'Nenhum elo acima'}
      onPress={() => { if (up === 'lendario') onHall(); else if (up) onShow(up) }} />
  </View>
}

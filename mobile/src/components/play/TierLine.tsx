import { Text, View } from 'react-native'
import { ArenaMark } from '../arena/ArenaMark'
import { PlacementMeter } from '../arena/PlacementMeter'
import { TierEmblem } from '../arena/TierEmblem'
import type { TierLineView } from './tierLines'

/**
 * Linha do elo (H1) sobre a placa `forest`: brasão, nome do elo e "Enfrenta…" (ranqueado); "n/3" tracejado, três
 * barrinhas e "n de 3 partidas · enfrenta qualquer nível" (classificação); Coliseu sem elo (corrida sem marca). Quem está
 * em classificação ou sem marca nunca recebe brasão de elo. A visão vem de `tierLines.ts`.
 */
export function TierLine({ view }: { view: TierLineView }) {
  if (view.kind === 'placement')
    return <PlacementMeter played={view.played} required={view.required} title={view.title} hint="enfrenta qualquer nível" />
  const ranked = view.kind === 'ranked'
  return <View testID="tier-line" accessible accessibilityLabel={`${ranked ? 'Elo ' : ''}${view.title}. ${view.detail}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
    {ranked
      ? <TierEmblem tier={view.tier} size="lg" decorative />
      : <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' }}>
        <ArenaMark width={24} height={18} color="rgba(255,255,255,0.55)" />
      </View>}
    <View style={{ flexShrink: 1 }}>
      <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>{view.title}</Text>
      <Text style={{ marginTop: 2, color: 'rgba(255,255,255,0.65)', fontSize: 10.5 }}>{view.detail}</Text>
    </View>
  </View>
}

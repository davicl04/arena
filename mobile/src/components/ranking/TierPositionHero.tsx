import { Text, View } from 'react-native'
import type { MyRankingOverviewLine, RankingKey } from '../../api/results'
import type { TierKey } from '../../data/arena'
import { colors } from '../../theme'
import { TierEmblem } from '../arena/TierEmblem'
import { formatMetric, gapText, metricText, metricUnit } from './metric'
import { inTier, ofTier, theTier } from './tiers'

function Stat({ big, small, label }: { big: string; small: string; label: string }) {
  return <View accessible accessibilityLabel={label} style={{ flex: 1, minWidth: 0, gap: 1 }}>
    <Text numberOfLines={1} style={{ color: '#ffffff', fontSize: 14, fontWeight: '800' }}>{big}</Text>
    <Text numberOfLines={2} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>{small}</Text>
  </View>
}

/**
 * Posição do titular no elo que a placa mostra: "SUA POSIÇÃO NO DIAMANTE", o número grande ("6º"), "de 12 no Diamante · Resenha
 * EC" (o time só no ranking de Times) e três números: a métrica, a distância para o 1º do elo ("7 pts atrás do 1º" ou "Lidera o
 * Diamante") e a vantagem sobre o próximo ("1 pt à frente do 7º" ou "Último do Diamante"). A posição geral não aparece.
 */
export function TierPositionHero({ line, tier, ranking, teamName }: { line: MyRankingOverviewLine; tier: TierKey; ranking: RankingKey; teamName: string | null }) {
  const position = line.tier_position ?? 0
  const size = line.tier_size ?? position
  const legend = tier === 'lendario'
  const where = inTier(tier)
  const lead = line.leader_gap === null
    ? { big: 'Lidera', small: theTier(tier), label: `Lidera ${theTier(tier)}` }
    : { big: gapText(line.leader_gap, ranking), small: 'atrás do 1º', label: `${gapText(line.leader_gap, ranking)} atrás do 1º` }
  const back = line.next_gap === null
    ? { big: 'Último', small: ofTier(tier), label: `Último ${ofTier(tier)}` }
    : { big: gapText(line.next_gap, ranking), small: `à frente do ${line.next_tier_position ?? position + 1}º`, label: `${gapText(line.next_gap, ranking)} à frente do ${line.next_tier_position ?? position + 1}º` }
  return <View testID="tier-hero" style={{ gap: 14, marginHorizontal: 12, marginTop: 10, borderRadius: 18, borderWidth: 1, padding: 14,
    borderColor: legend ? 'rgba(244,222,154,0.3)' : 'rgba(255,255,255,0.1)', backgroundColor: legend ? 'rgba(244,222,154,0.07)' : 'rgba(255,255,255,0.05)' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <View accessible accessibilityLabel={`Sua posição ${where}: ${position}º de ${size}${teamName ? `, ${teamName}` : ''}`} style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.mint, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>SUA POSIÇÃO {where.toUpperCase()}</Text>
        <Text style={{ marginTop: 4, color: '#ffffff', fontSize: 40, lineHeight: 44, fontWeight: '800' }}>{position}º</Text>
        <Text numberOfLines={2} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11.5 }}>de {size} {where}{teamName ? ` · ${teamName}` : ''}</Text>
      </View>
      <TierEmblem tier={tier} size="xl" decorative />
    </View>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Stat big={formatMetric(line.metric_value ?? 0, ranking)} small={metricUnit(ranking)} label={metricText(line.metric_value ?? 0, ranking)} />
      <Stat {...lead} />
      <Stat {...back} />
    </View>
  </View>
}

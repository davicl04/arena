import { Text, View } from 'react-native'
import type { Sport } from '../../api/client'
import { sports } from '../../api/client'
import { colors } from '../../theme'
import { plural } from '../../utils/format'
import { formatDuration } from '../play/tierLines'
import { SportIcon } from './SportIcon'
import { TextAction } from './controls'
import { TierEmblem } from './TierEmblem'
import type { ModalityStanding } from './modalityStanding'

/** Quanto falta para sair da classificação, em texto honesto: sem partida inventada nem pontos de exemplo. */
function nextStep(sport: Sport, standing: ModalityStanding): string {
  if (sport === 'corrida') return 'A primeira marca já define o seu elo.'
  const missing = standing.required - standing.played
  if (standing.played <= 0) return `${plural(standing.required, 'partida confirmada define', 'partidas confirmadas definem')} o seu elo.`
  return `${missing === 1 ? 'Falta' : 'Faltam'} ${plural(missing, 'partida', 'partidas')} para o seu elo.`
}

/**
 * Cartão "Seu elo" de uma modalidade no Início: o elo de quem já se classificou (com a pontuação ou, na corrida, o melhor
 * tempo da distância de maior elo) ou o andamento da classificação ("n de 3 partidas"). `standing` é `null` enquanto a
 * leitura de `GET /me/standings` não chega (`loading`) ou quando falhou: o cartão não inventa números.
 */
export function ModalityCard({ sport, standing, loading, onOpenRanking }: {
  sport: Sport
  standing: ModalityStanding | null
  loading: boolean
  onOpenRanking: () => void
}) {
  const label = sports.find(item => item.value === sport)?.label ?? sport
  const metric = standing?.metric
  const value = metric ? (metric.unit === 'tempo' ? formatDuration(metric.value) : metric.value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })) : '—'
  const unit = sport === 'corrida' ? 'melhor tempo' : (metric?.unit ?? 'pontos')
  const badge = standing?.tier
    ? <TierEmblem tier={standing.tier} size="xs" showName />
    : standing
      ? <Text style={{ color: colors.ink, fontSize: 11, fontWeight: '700' }}>{sport === 'corrida' ? 'Sem marca' : `${standing.played} de ${standing.required} partidas`}</Text>
      : loading
        ? <Text accessibilityLabel="Carregando classificação" style={{ color: colors['ink-muted'], fontSize: 11, fontWeight: '700' }}>…</Text>
        : <Text style={{ color: colors['ink-muted'], fontSize: 11, fontWeight: '700' }}>Classificação indisponível</Text>
  const context = standing ? (standing.tier ? standing.context : nextStep(sport, standing)) : ''
  return <View testID={`modality-${sport}`} accessible={false} style={{ width: 286, borderRadius: 20, backgroundColor: '#ffffff', padding: 17 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.tile }}><SportIcon sport={sport} size={30} /></View>
      <View testID={`standing-${sport}`} style={{ flexShrink: 1, borderRadius: 999, backgroundColor: colors.subtle, paddingHorizontal: 10, paddingVertical: 6 }}>{badge}</View>
    </View>
    <Text accessibilityRole="header" style={{ marginTop: 11, color: colors['ink-muted'], fontSize: 12 }}>{label}</Text>
    <View style={{ marginTop: 3, flexDirection: 'row', alignItems: 'baseline', gap: 7 }}>
      <Text style={{ color: colors.ink, fontSize: 28, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: colors['ink-muted'], fontSize: 12 }}>{unit}</Text>
    </View>
    <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <Text style={{ flex: 1, minWidth: 0, color: colors['ink-muted'], fontSize: 10.5, lineHeight: 15 }}>{context}</Text>
      <TextAction title="Ver ranking" accessibilityLabel={`Ver ranking de ${label}`} onPress={onOpenRanking} />
    </View>
  </View>
}

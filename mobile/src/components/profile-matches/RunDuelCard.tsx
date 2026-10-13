import { Text, View } from 'react-native'
import type { TimelineRun } from '../../api/profile'
import { useThemeColors } from '../../hooks/useTheme'
import { StateBadge } from '../arena/StateBadge'
import { formatKm } from '../play/runView'
import { formatDuration } from '../play/tierLines'
import { markLabel, runHeading } from './timelineView'

function Column({ title, distance, time, muted = false }: { title: string; distance?: string; time: string; muted?: boolean }) {
  const colors = useThemeColors()
  return <View accessible accessibilityLabel={`${title}: ${[distance, time].filter(Boolean).join(', ')}`} style={{ flex: 1, minWidth: 0, borderRadius: 10, backgroundColor: muted ? colors.subtle : colors['brand-soft'], padding: 10 }}>
    <Text style={{ color: colors['ink-muted'], fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>{title.toUpperCase()}</Text>
    {distance ? <Text style={{ marginTop: 2, color: colors.ink, fontSize: 12 }}>{distance}</Text> : null}
    <Text style={{ marginTop: 2, color: muted ? colors['ink-muted'] : colors.brand, fontSize: muted && !/\d/.test(time) ? 12 : 18, fontWeight: '800' }}>{time}</Text>
  </View>
}

/**
 * Corrida contra a própria marca: "Esta marca" (distância e tempo) diante do "Melhor anterior" na mesma distância, ou
 * "Sem marca anterior". O selo diz "Novo melhor" ou "Primeira marca"; fora das faixas não há comparação nem selo.
 * Corridas não são tocáveis.
 */
export function RunDuelCard({ run }: { run: TimelineRun }) {
  const colors = useThemeColors()
  const mark = run.mark_kind ? markLabel[run.mark_kind] : null
  const best = run.previous_best_s !== null ? formatDuration(run.previous_best_s) : 'Sem marca anterior'
  return <View testID="run-duel-card" style={{ borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <Text style={{ flexShrink: 1, color: colors['ink-muted'], fontSize: 11, fontWeight: '600' }}>{runHeading(run)}</Text>
      {mark ? <StateBadge tone="open">{mark}</StateBadge> : null}
    </View>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Column title="Esta marca" distance={formatKm(run.distance_m)} time={formatDuration(run.duration_s)} />
      {run.mark_kind !== null ? <Column title="Melhor anterior" time={best} muted /> : null}
    </View>
  </View>
}

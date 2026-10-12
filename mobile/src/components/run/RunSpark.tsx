import { View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import type { RunSeriesPoint } from '../../api/runs'
import { colors } from '../../theme'
import { formatDuration } from '../play/tierLines'

const WIDTH = 92
const HEIGHT = 28
const PAD = 4

/** Pontos do traço: x espaçado pela ordem das marcas; y mais alto para o tempo menor (melhorar sobe o traço). */
export function sparkPoints(series: readonly Pick<RunSeriesPoint, 'duration_s'>[]): [number, number][] {
  const values = series.map(point => point.duration_s)
  const max = Math.max(...values)
  const min = Math.min(...values)
  return values.map((value, index) => [
    series.length === 1 ? WIDTH / 2 : (index * WIDTH) / (series.length - 1),
    max === min ? HEIGHT / 2 : PAD + ((value - min) / (max - min)) * (HEIGHT - 2 * PAD),
  ])
}

/** Texto de apoio do minigráfico: o traço é só ilustração, então o nome dá os extremos. */
export function sparkLabel(series: readonly RunSeriesPoint[]): string {
  const first = series[0]
  const last = series[series.length - 1]
  if (!first || !last) return ''
  return series.length === 1
    ? `Evolução: uma marca, ${formatDuration(last.duration_s)}`
    : `Evolução: ${series.length} marcas, de ${formatDuration(first.duration_s)} a ${formatDuration(last.duration_s)}`
}

/**
 * Minigráfico de evolução (K4) em `react-native-svg`: as marcas da janela, da mais antiga à mais nova, com a mais recente
 * marcada. O traço é um `Path` (o mesmo desenho da polilinha da web). Sem marcas, não desenha nada.
 */
export function RunSpark({ series }: { series: readonly RunSeriesPoint[] }) {
  if (!series.length) return null
  const points = sparkPoints(series)
  const last = points[points.length - 1]
  return <View testID="run-spark" accessible accessibilityRole="image" accessibilityLabel={sparkLabel(series)} style={{ width: 64, height: 26 }}>
    <Svg width={64} height={26} viewBox={`-4 -3 ${WIDTH + 8} ${HEIGHT + 6}`}>
      {points.length > 1 ? <Path d={points.map(([x, y], index) => `${index ? 'L' : 'M'}${x} ${y}`).join(' ')} fill="none" stroke={colors.brand} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> : null}
      <Circle cx={last[0]} cy={last[1]} r={3} fill={colors.brand} />
    </Svg>
  </View>
}

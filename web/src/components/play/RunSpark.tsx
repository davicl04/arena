import type { RunSeriesPoint } from '@/api/runs'
import { cn } from '@/lib/utils'
import { formatDuration } from './tierLines'

const WIDTH = 92
const HEIGHT = 28
const PAD = 4

/** Pontos do traço: x espaçado pela ordem das marcas; y mais alto para o tempo menor (melhorar sobe o traço). */
function sparkPoints(series: readonly Pick<RunSeriesPoint, 'duration_s'>[]): [number, number][] {
  const values = series.map(point => point.duration_s)
  const max = Math.max(...values)
  const min = Math.min(...values)
  return values.map((value, index) => [
    series.length === 1 ? WIDTH / 2 : (index * WIDTH) / (series.length - 1),
    max === min ? HEIGHT / 2 : PAD + ((value - min) / (max - min)) * (HEIGHT - 2 * PAD),
  ])
}

/**
 * Minigráfico de evolução (K4) em SVG próprio: as marcas da janela, da mais antiga à mais nova, com a mais recente
 * marcada. Sem marcas, não desenha nada. O texto de apoio (`aria-label`) dá os extremos, já que o traço é só ilustração.
 */
export function RunSpark({ series, className }: { series: readonly RunSeriesPoint[]; className?: string }) {
  if (!series.length) return null
  const points = sparkPoints(series)
  const last = points[points.length - 1]
  const first = series[0].duration_s
  const latest = series[series.length - 1].duration_s
  const label = series.length === 1
    ? `Evolução: uma marca, ${formatDuration(latest)}`
    : `Evolução: ${series.length} marcas, de ${formatDuration(first)} a ${formatDuration(latest)}`
  return <svg data-slot="run-spark" role="img" aria-label={label} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    className={cn('h-[26px] w-16 flex-none overflow-visible text-brand', className)}>
    {points.length > 1 && <polyline points={points.map(point => point.join(',')).join(' ')} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    <circle cx={last[0]} cy={last[1]} r="3" fill="currentColor" />
  </svg>
}

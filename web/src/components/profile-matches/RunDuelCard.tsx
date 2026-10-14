import type { TimelineRun } from '@/api/profile'
import { StateBadge } from '@/components/events/StateBadge'
import { formatKm, formatPace, formatRunDate } from '@/components/play/runView'
import { formatDuration } from '@/components/play/tierLines'
import { markBadge, runOriginText } from './timelineView'

/**
 * Corrida contra a própria marca: "Esta marca" (distância e tempo) diante do "Melhor anterior" na mesma distância.
 * Fora das faixas (sem `standard_distance_km`) não há comparação e o cartão mostra só a marca. Não é tocável.
 */
export function RunDuelCard({ run }: { run: TimelineRun }) {
  const badge = markBadge(run.mark_kind)
  const compared = run.standard_distance_km !== null
  return <article data-slot="run-duel-card" aria-label={`Corrida de ${formatKm(run.distance_m)} em ${formatDuration(run.duration_s)}`}
    className="grid gap-2 overflow-hidden rounded-card border border-solid border-line surface px-3 py-2.5 shadow-card noite:border-surface-edge">
    <div className="flex items-start justify-between gap-2">
      <small className="min-w-0 text-[10.5px] leading-normal wrap-anywhere text-ink-muted">{formatRunDate(run.date)} · {runOriginText(run)}</small>
      {badge && <StateBadge tone={badge.tone} className="flex-none">{badge.label}</StateBadge>}
    </div>
    <div className={compared ? 'grid grid-cols-2 gap-2' : 'grid gap-2'}>
      <div data-slot="run-mark" className="rounded-control bg-success-bg px-2.5 py-2">
        <small className="block text-[9.5px] font-bold tracking-[0.04em] text-brand uppercase">Esta marca</small>
        <b className="block font-display text-[16px] leading-tight tabular-nums">{formatDuration(run.duration_s)}</b>
        <span className="block text-[10.5px] text-ink-muted">{formatKm(run.distance_m)} · {formatPace(run.pace_s_per_km)}</span>
      </div>
      {compared && <div data-slot="run-previous" className="rounded-control bg-subtle px-2.5 py-2">
        <small className="block text-[9.5px] font-bold tracking-[0.04em] text-ink-muted uppercase">Melhor anterior</small>
        {run.previous_best_s === null
          ? <b className="block text-[12px] leading-tight text-ink-muted">Sem marca anterior</b>
          : <b className="block font-display text-[16px] leading-tight tabular-nums">{formatDuration(run.previous_best_s)}</b>}
        <span className="block text-[10.5px] text-ink-muted">nos {run.standard_distance_km} km</span>
      </div>}
    </div>
  </article>
}

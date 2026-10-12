import { Check, Trophy, X } from 'lucide-react'
import type { RunCreated } from '@/api/runs'
import { TierEmblem } from '@/components/arena/TierEmblem'
import { cn } from '@/lib/utils'
import { plateCard } from './styles'
import { formatKm, formatPace, impactView, originInline } from './runView'
import { formatDuration } from './tierLines'

/**
 * Confirmação sobre a placa depois de salvar (cartão de estado `.s1 ok` do protótipo): "Novo melhor tempo · 5 km", o tempo,
 * o ritmo e a origem, mais a linha do que mudou no ranking ("Sobe para Ouro nos 5 km."). Nunca diz "autodeclarado".
 */
export function RunSavedCard({ created, onDismiss }: { created: RunCreated; onDismiss: () => void }) {
  const { run, impact } = created
  const label = run.standard_distance_km ? `${run.standard_distance_km} km` : formatKm(run.distance_m)
  const view = impactView(impact, label, { saved: true })
  const best = impact.kind === 'novo_melhor' || impact.kind === 'primeira_marca'
  const title = impact.kind === 'novo_melhor' ? 'Novo melhor tempo' : impact.kind === 'primeira_marca' ? 'Primeira marca registrada' : 'Corrida registrada'
  return <div role="status" data-slot="run-saved" data-kind={impact.kind} className={cn(plateCard, 'relative grid-cols-[auto_1fr] items-center gap-x-3 gap-y-0.5 pr-11')}>
    <span aria-hidden="true" className="grid size-9 flex-none place-items-center rounded-full bg-mint/15 text-mint">
      {best ? <Trophy size={18} /> : <Check size={18} />}
    </span>
    <div className="min-w-0">
      <b className="block font-display text-[13px] text-white">{title} · {label}</b>
      <small className="mt-0.5 block text-[10.5px] leading-[1.45] text-white/70">
        {formatDuration(run.duration_s)} · {formatPace(run.pace_s_per_km)} · {originInline(run.origin)}
      </small>
      {best && view.detail && <small className="mt-0.5 flex items-center gap-1.5 text-[10.5px] leading-[1.45] text-mint">
        {view.tier && <TierEmblem tier={view.tier} size="xs" decorative />}{view.detail}
      </small>}
      {!best && <small className="mt-0.5 block text-[10.5px] leading-[1.45] text-white/60">{view.title}. {view.detail}</small>}
    </div>
    <button type="button" aria-label="Dispensar aviso" onClick={onDismiss}
      className="absolute top-1 right-1 grid size-9 place-items-center rounded-full border-0 bg-transparent text-white/60 hover:bg-white/10 focus-visible:outline-mint">
      <X size={16} aria-hidden="true" />
    </button>
  </div>
}

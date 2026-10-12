import { History, Trophy } from 'lucide-react'
import { TierEmblem } from '@/components/arena/TierEmblem'
import { cn } from '@/lib/utils'
import type { ImpactView } from './runView'

/**
 * Prévia do que a marca faz com o ranking da distância (K2): "Novo melhor tempo · −0:24", "Sobe para Ouro nos 5 km",
 * "Primeira marca nos 5 km" ou "Fica só no histórico". Mora numa região `aria-live` discreta: só fala quando o texto muda.
 */
export function RunPreviewCard({ view, stale }: { view: ImpactView; /** Os campos mudaram e a prévia nova ainda não chegou. */ stale?: boolean }) {
  const best = view.tone === 'best'
  return <div data-slot="run-preview" data-tone={view.tone} data-stale={stale ? '' : undefined}
    className={cn('flex items-center gap-3 rounded-[14px] p-3 transition-opacity motion-reduce:transition-none',
      best ? 'bg-mint/10 shadow-[inset_0_0_0_1px_#8fe0b455]' : 'bg-white/6', stale && 'opacity-60')}>
    {view.tier
      ? <TierEmblem tier={view.tier} size="lg" decorative />
      : <span aria-hidden="true" className="grid size-11 flex-none place-items-center text-white/60">{best ? <Trophy size={22} /> : <History size={22} />}</span>}
    <div className="min-w-0">
      <b className="block font-display text-[12.5px] text-white">{view.title}</b>
      {view.detail && <small className="mt-0.5 block text-[10.5px] leading-[1.45] text-white/65">{view.detail}</small>}
    </div>
  </div>
}

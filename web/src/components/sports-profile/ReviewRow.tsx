import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Linha da revisão: rótulo, valor e "Alterar", que volta ao passo correspondente. */
export function ReviewRow({ label, value, onChange, first = false }: { label: string; value: string; onChange: () => void; first?: boolean }) {
  return (
    <div className={cn('flex min-h-[52px] items-center gap-2.5 pr-2 pl-3.5 text-[13px]', !first && 'border-t border-solid border-line')}>
      <span className="text-ink-muted">{label}</span>
      <b className="min-w-0 flex-1 text-right font-semibold wrap-anywhere text-heading">{value}</b>
      <Button type="button" variant="link" className="min-h-11 px-1.5 text-[11px]" aria-label={`Alterar ${label.toLowerCase()}`} onClick={onChange}>Alterar</Button>
    </div>
  )
}

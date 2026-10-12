import { ArenaMark } from '@/components/Brand'
import { cn } from '@/lib/utils'

/**
 * Botão redondo da placa (J1/H1): muralha do Coliseu em menta, verbo em caixa alta e complemento. Desabilitado,
 * continua legível e o motivo fica no texto ligado por `aria-describedby`. Sem pulso: o pareamento ainda não existe.
 */
export function PlayButton({ verb, caption, label, disabled = false, onClick, describedBy, className }: {
  verb: string
  caption: string
  /** Nome acessível ("Encontrar partida", "Preparar perfil de Futebol"…). */
  label: string
  disabled?: boolean
  onClick?: () => void
  describedBy?: string
  className?: string
}) {
  return <button type="button" data-slot="play-button" aria-label={label} aria-describedby={describedBy} disabled={disabled} onClick={onClick}
    className={cn(
      'relative my-1 grid size-[184px] flex-none place-items-center rounded-full border-0 p-0 text-white',
      'bg-[radial-gradient(circle_at_50%_38%,#0f3a28_0%,#0b2218_72%)] shadow-[0_0_0_6px_#8fe0b41f,inset_0_0_0_1px_var(--color-mint),0_18px_40px_#0007]',
      'enabled:hover:shadow-[0_0_0_8px_#8fe0b42e,inset_0_0_0_1px_var(--color-mint),0_18px_40px_#0007] focus-visible:outline-mint',
      'disabled:opacity-100 disabled:shadow-[0_0_0_6px_#8fe0b40d,inset_0_0_0_1px_#8fe0b459,0_18px_40px_#0006]',
      'motion-safe:transition-[box-shadow,scale] motion-safe:enabled:active:scale-[0.98]',
      className,
    )}>
    <span className={cn('grid justify-items-center gap-2', disabled && 'opacity-65')}>
      <ArenaMark compact className="h-[46px] w-[46px] text-mint" />
      <b className="font-display text-[14px] font-extrabold tracking-[0.08em]">{verb}</b>
      <small className="text-[10px] text-white/65">{caption}</small>
    </span>
  </button>
}

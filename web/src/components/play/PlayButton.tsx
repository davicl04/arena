import type { Ref } from 'react'
import { ArenaMark } from '@/components/Brand'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'
import { formatElapsed, spokenDuration } from '@/utils/clock'
import { parseIso } from '@/utils/format'

/**
 * Botão redondo da placa (J1/H1): muralha do Coliseu em menta, verbo em caixa alta e complemento. Desabilitado,
 * continua legível e o motivo fica no texto ligado por `aria-describedby`.
 *
 * Durante a busca (`searchedSince` = `started_at`), pulsa com duas ondas menta (só com movimento permitido; sem ele,
 * o contorno fica mais forte), mostra o tempo decorrido e anuncia "Buscando há N minutos" numa região discreta que
 * só muda a cada minuto, para o leitor de tela não narrar cada segundo.
 */
export function PlayButton({ verb, caption, label, disabled = false, onClick, describedBy, searchedSince, className, ref }: {
  verb: string
  caption: string
  /** Nome acessível ("Encontrar partida", "Cancelar busca", "Preparar perfil de Futebol"…). */
  label: string
  disabled?: boolean
  onClick?: () => void
  describedBy?: string
  /** Início da busca em andamento (ISO): liga o pulso e o cronômetro. */
  searchedSince?: string | null
  className?: string
  /** Para devolver o foco ao botão quando um diálogo da placa fecha. */
  ref?: Ref<HTMLButtonElement>
}) {
  const started = parseIso(searchedSince)?.getTime() ?? null
  const searching = started !== null
  const now = useNow(1000, searching)
  const elapsed = started === null ? 0 : Math.max(0, now - started)
  return <>
    <button ref={ref} type="button" data-slot="play-button" data-searching={searching ? '' : undefined} aria-label={label} aria-describedby={describedBy}
      disabled={disabled} onClick={onClick}
      className={cn(
        'relative my-1 grid size-[184px] flex-none place-items-center rounded-full border-0 p-0 text-white',
        'bg-[radial-gradient(circle_at_50%_38%,#0f3a28_0%,#0b2218_72%)] shadow-[0_0_0_6px_#8fe0b41f,inset_0_0_0_1px_var(--color-mint),0_18px_40px_#0007]',
        'enabled:hover:shadow-[0_0_0_8px_#8fe0b42e,inset_0_0_0_1px_var(--color-mint),0_18px_40px_#0007] focus-visible:outline-mint',
        'disabled:opacity-100 disabled:shadow-[0_0_0_6px_#8fe0b40d,inset_0_0_0_1px_#8fe0b459,0_18px_40px_#0006]',
        'motion-safe:transition-[box-shadow,scale] motion-safe:enabled:active:scale-[0.98]',
        searching && 'shadow-[0_0_0_6px_#8fe0b440,inset_0_0_0_2px_var(--color-mint),0_18px_40px_#0007] enabled:hover:shadow-[0_0_0_8px_#8fe0b44d,inset_0_0_0_2px_var(--color-mint),0_18px_40px_#0007]',
        className,
      )}>
      {searching && <>
        <span aria-hidden="true" data-slot="play-ripple" className="pointer-events-none absolute -inset-1.5 rounded-full border-2 border-solid border-mint opacity-0 motion-safe:animate-ripple" />
        <span aria-hidden="true" data-slot="play-ripple" className="pointer-events-none absolute -inset-1.5 rounded-full border-2 border-solid border-mint opacity-0 motion-safe:animate-ripple motion-safe:[animation-delay:0.9s]" />
      </>}
      <span className={cn('grid justify-items-center gap-2', disabled && 'opacity-65')}>
        <ArenaMark compact className="h-[46px] w-[46px] text-mint" />
        <b className="font-display text-[14px] font-extrabold tracking-[0.08em]">{verb}</b>
        <small className="text-[10px] text-white/65">
          {searching ? <span data-slot="play-elapsed" aria-hidden="true" className="tabular-nums">{formatElapsed(elapsed)}</span> : caption}
        </small>
      </span>
    </button>
    {searching && <span role="status" className="sr-only">Buscando há {spokenDuration(elapsed)}</span>}
  </>
}

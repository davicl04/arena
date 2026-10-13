import type { ReactNode } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { IconButton } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { darkEyebrow } from './styles'

/*
 * Placa `forest` com o Coliseu em marca-d'água (.plate), de ponta a ponta no topo da tela (Meus times, Entrar no time).
 * Os filhos ficam acima da marca-d'água.
 */
export function TeamsPlate({ className, children }: { className?: string; children: ReactNode }) {
  return <header className={cn(
    "relative overflow-hidden rounded-b-[28px] bg-forest text-white *:relative *:z-1",
    "after:pointer-events-none after:absolute after:-bottom-[30px] after:left-1/2 after:h-[240px] after:w-[420px] after:-translate-x-1/2 after:bg-white after:opacity-[0.045] after:content-['']",
    'after:mask-[url(/images/brand/coliseum.svg)] after:mask-contain after:mask-center after:mask-no-repeat',
    className)}>
    {children}
  </header>
}

/**
 * Barra do topo das telas escuras (.topbar): voltar ou fechar, sobretítulo menta e título. O título é o `h1` da tela
 * (o ArenaPage não desenha o cabeçalho padrão nas telas de Meus times).
 */
export function DarkTopBar({ eyebrow, title, onBack, icon = 'back', backLabel, className }: {
  eyebrow: string
  title: string
  onBack: () => void
  icon?: 'back' | 'close'
  backLabel?: string
  className?: string
}) {
  return <div className={cn('flex items-center gap-1 px-2 pt-2.5', className)}>
    <IconButton type="button" tone="glass" aria-label={backLabel ?? (icon === 'close' ? 'Fechar' : 'Voltar')} onClick={onBack}>
      {icon === 'close' ? <X size={21} /> : <ArrowLeft size={21} />}
    </IconButton>
    <div className="min-w-0 flex-1">
      <span className={darkEyebrow}>{eyebrow}</span>
      <h1 className="text-[19px] leading-[1.2] text-balance wrap-anywhere text-white">{title}</h1>
    </div>
  </div>
}

/** Barras de progresso dos passos (.steps2): `total` trilhos, os `done` primeiros em menta. */
export function StepBars({ done, total }: { done: number; total: number }) {
  return <div className="flex gap-1.5 px-4 pt-1.5" aria-hidden="true">
    {Array.from({ length: total }, (_, index) => <span key={index} className={cn('h-1 flex-1 rounded-[2px]', index < done ? 'bg-mint' : 'bg-white/14')} />)}
  </div>
}

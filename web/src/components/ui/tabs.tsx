import type { KeyboardEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/*
 * Abas com o teclado de ProfileTabs: setas esquerda/direita circulam, Home e End vão aos extremos,
 * a seleção acompanha o foco e só a aba ativa entra na ordem de Tab (tabindex itinerante).
 * profile → .tabs (fixas abaixo da barra do perfil) · segmented → .segmented (Conexões) ·
 * dark → abas sublinhadas em menta dentro da barra escura da Comunidade (a barra cuida da posição) ·
 * pill → segmento escuro com a aba ativa em menta (Convidar: Escolher atleta | Link e QR, Q2).
 * Ids: `${idPrefix}${value}`; o painel controlado é `controls`.
 */
const listVariants = cva('px-3.5', {
  variants: {
    variant: {
      profile: 'sticky top-14 z-tabs -mx-5 mt-5 flex border-b border-line bg-app',
      segmented: '-mx-5 mb-3 grid grid-cols-2 border-b border-line',
      dark: 'flex px-2.5',
      pill: 'flex gap-1 rounded-[13px] bg-white/7 p-1',
    },
  },
  defaultVariants: { variant: 'profile' },
})
const tabVariants = cva('border-0 border-b-2 border-transparent bg-transparent font-bold', {
  variants: {
    variant: {
      profile: 'flex min-h-12 flex-1 items-center justify-center gap-1.5 text-[10.5px] text-ink-muted focus-visible:outline-offset-[-3px] aria-selected:border-brand aria-selected:text-brand',
      segmented: 'min-h-11 text-[11.5px] text-ink-muted aria-selected:border-brand aria-selected:text-brand',
      dark: 'flex min-h-[46px] flex-1 items-center justify-center gap-1.5 text-[11px] text-[#ffffff99] focus-visible:outline-offset-[-3px] aria-selected:border-mint aria-selected:text-mint',
      pill: 'flex min-h-[38px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] border-b-0 text-[11.5px] text-white/66 focus-visible:outline-mint aria-selected:bg-mint aria-selected:text-night',
    },
  },
  defaultVariants: { variant: 'profile' },
})

/** `Icon`: ícone Lucide; `icon`: nó pronto (ex.: `SportIcon` nas abas das modalidades), decorativo. */
export interface TabItem<T extends string> { value: T; label: string; Icon?: LucideIcon; icon?: ReactNode }

export function Tabs<T extends string>({ items, value, onChange, label, idPrefix, controls, variant = 'profile', className }: {
  items: readonly TabItem<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  idPrefix: string
  controls: string
  variant?: 'profile' | 'segmented' | 'dark' | 'pill'
  className?: string
}) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = items.length - 1
    const next = event.key === 'ArrowRight' ? (index + 1) % items.length
      : event.key === 'ArrowLeft' ? (index + last) % items.length
        : event.key === 'Home' ? 0
          : event.key === 'End' ? last
            : null
    if (next === null) return
    event.preventDefault()
    onChange(items[next].value)
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }
  return <div data-slot="tabs" role="tablist" aria-label={label} className={cn(listVariants({ variant }), className)}>
    {items.map((item, index) => {
      const selected = item.value === value
      return <button key={item.value} id={`${idPrefix}${item.value}`} type="button" role="tab" data-slot="tab" aria-selected={selected} aria-controls={controls}
        tabIndex={selected ? 0 : -1} className={tabVariants({ variant })} onClick={() => onChange(item.value)} onKeyDown={event => onKeyDown(event, index)}>
        {item.Icon && <item.Icon size={16} aria-hidden="true" />}
        {item.icon}
        {item.label}
      </button>
    })}
  </div>
}

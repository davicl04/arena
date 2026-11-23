import { useId } from 'react'
import type { KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

export interface RadioListOption<T> {
  value: T
  label: string
  description: string
}

/**
 * Lista de rádio com descrição (cartão de linhas): `radiogroup` com foco só na opção escolhida (ou na primeira) e as setas
 * movendo a escolha e o foco, como os botões de opção nativos. Cada linha tem 56 px, rótulo e descrição; a escolhida fica
 * com o fundo de sucesso e o círculo preenchido. O nome acessível é o rótulo; a descrição fica em `aria-describedby`.
 */
export function RadioList<T extends string | null>({ label, options, value, onChange, className }: {
  label: string
  options: readonly RadioListOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  const id = useId()
  const active = options.some(option => option.value === value) ? value : options[0]?.value
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const move = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[event.key]
    if (move === undefined) return
    event.preventDefault()
    const next = (index + move + options.length) % options.length
    onChange(options[next].value)
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className={cn('surface overflow-hidden rounded-card border border-solid border-surface-edge shadow-card', className)}>
      {options.map((option, index) => {
        const checked = option.value === value
        return (
          <button key={option.value ?? 'none'} type="button" role="radio" aria-checked={checked} aria-label={option.label} aria-describedby={`${id}-${index}`} tabIndex={option.value === active ? 0 : -1}
            onClick={() => onChange(option.value)} onKeyDown={event => onKeyDown(event, index)}
            className={cn('flex min-h-14 w-full items-center gap-3 border-0 bg-transparent px-3.5 py-2 text-left focus-visible:-outline-offset-3',
              index > 0 && 'border-t border-solid border-line', checked && 'bg-success-bg')}>
            <span aria-hidden="true" className={cn('grid size-5 flex-none place-items-center rounded-full border-2 border-solid', checked ? 'border-brand' : 'border-field-border')}>
              {checked && <i className="block size-2.5 rounded-full bg-brand" />}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[13px] text-heading">{option.label}</b>
              <small id={`${id}-${index}`} className="block text-[10.5px] leading-[1.45] text-ink-muted">{option.description}</small>
            </span>
          </button>
        )
      })}
    </div>
  )
}

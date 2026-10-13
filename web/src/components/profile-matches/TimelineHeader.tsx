import { useId } from 'react'
import { ListFilter } from 'lucide-react'
import { iconButtonVariants } from '@/components/ui/button-variants'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import SportIcon from '@/components/SportIcon'
import { plural } from '@/utils/format'
import { filterOptions, filterSummary } from './timelineView'
import type { SportFilter } from './timelineView'

/** Topo mínimo: "N registros · Todas as modalidades" e um botão só com o ícone de filtro (ponto quando há filtro). */
export function TimelineHeader({ total, filter, onFilter }: { total: number | null; filter: SportFilter; onFilter: (filter: SportFilter) => void }) {
  const id = useId()
  const active = filter !== 'todas'
  return <div data-slot="timeline-header" className="mb-3 flex items-center justify-between gap-2">
    <p className="m-0 min-w-0 text-[12px] leading-normal text-ink-muted" aria-live="polite">
      {total !== null && <><b className="text-ink">{plural(total, 'registro', 'registros')}</b> · </>}{filterSummary(filter)}
    </p>
    <Popover>
      <PopoverTrigger aria-label="Filtrar por modalidade" data-filter-active={active || undefined}
        className={`${iconButtonVariants({ tone: 'outline' })} relative flex-none`}>
        <ListFilter size={18} aria-hidden="true" />
        {active && <span data-slot="filter-dot" aria-hidden="true" className="absolute top-1 right-1 size-2.5 rounded-full border-2 border-solid border-app bg-brand" />}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 gap-1">
        <RadioGroup aria-label="Modalidade" name={`${id}-sport`} value={filter} className="gap-0.5"
          onValueChange={value => onFilter(value as SportFilter)}>
          {filterOptions.map(option => <label key={option.value} htmlFor={`${id}-${option.value}`}
            className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-control px-2 text-[12.5px] font-semibold hover:bg-subtle has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
            {option.value === 'todas' ? <span className="size-6 flex-none" aria-hidden="true" /> : <SportIcon sport={option.value} size={24} />}
            <span className="flex-1">{option.label}</span>
            <RadioGroupItem value={option.value} id={`${id}-${option.value}`} />
          </label>)}
        </RadioGroup>
      </PopoverContent>
    </Popover>
  </div>
}

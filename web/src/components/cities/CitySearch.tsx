import { useId, useState } from 'react'
import { Check } from 'lucide-react'
import type { City } from '@/api/client'
import { CITY_SEARCH_MIN, cityLabel } from '@/api/cities'
import { LoadError } from '@/components/ui/load-error'
import { useCitySearch } from '@/hooks/useCitySearch'
import { cn } from '@/lib/utils'

/**
 * Busca de cidade no catálogo nacional (servidor): campo, aviso de estado numa região viva e a lista "Nome · UF". A cidade
 * já escolhida aparece marcada no topo mesmo sem estar entre os resultados. Serve à folha de cidade (time, evento,
 * pedido de organizador), ao formulário da modalidade e a qualquer passo de cidade que a componha. `autoFocus` marca o
 * campo para o foco inicial da folha (`data-autofocus`). Enter no campo não envia o formulário em volta.
 */
export function CitySearch({ selected, onSelect, label = 'Buscar cidade', autoFocus = false, className }: {
  selected: City | null
  onSelect: (city: City) => void
  label?: string
  autoFocus?: boolean
  className?: string
}) {
  const id = useId()
  const [query, setQuery] = useState('')
  const search = useCitySearch(query)
  const shown = selected && !search.results.some(city => city.id === selected.id) ? [selected, ...search.results] : search.results
  const found = search.results.length
  const status = search.short ? `Digite pelo menos ${CITY_SEARCH_MIN} letras do nome ou da UF.`
    : search.loading ? 'Buscando cidades…'
      : search.error ? ''
        : found ? `${found} ${found === 1 ? 'cidade encontrada' : 'cidades encontradas'}.` : 'Nenhuma cidade encontrada.'
  return <div className={cn('grid min-w-0', className)}>
    <label htmlFor={`${id}-input`} className="mt-2 mb-1.5">{label}</label>
    <input id={`${id}-input`} data-autofocus={autoFocus || undefined} type="search" autoComplete="off" value={query} placeholder="Nome da cidade ou UF"
      aria-describedby={`${id}-status`} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault() }} />
    <p id={`${id}-status`} role="status" aria-live="polite" className="mt-1.5 mb-0 min-h-[18px] text-[11.5px] leading-[1.5] text-ink-muted">
      <span className={cn(!search.short && !search.loading && found > 0 && 'sr-only')}>{status}</span>
    </p>
    {search.error && <LoadError size="section" title="Não foi possível buscar as cidades" text={search.error} cause={search.errorCause} onRetry={search.retry} />}
    {shown.length > 0 && <ul className="m-0 grid max-h-[50vh] list-none overflow-y-auto p-0" aria-label="Cidades">
      {shown.map(city => {
        const active = city.id === selected?.id
        return <li key={city.id}>
          <button type="button" aria-pressed={active} onClick={() => onSelect(city)}
            className={cn('flex min-h-11 w-full items-center gap-2 border-0 border-b border-solid border-line bg-transparent px-1 text-left text-[13px] text-ink', active && 'font-bold text-brand')}>
            <span className="min-w-0 flex-1 truncate">{cityLabel(city)}</span>
            {active && <Check size={17} aria-hidden="true" />}
          </button>
        </li>
      })}
    </ul>}
  </div>
}

import { useState } from 'react'
import { Check } from 'lucide-react'
import type { City } from '@/api/client'
import { Sheet } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const fold = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Escolha da cidade do time no catálogo (o mesmo das modalidades), com busca por nome ou UF. */
export function CitySheet({ cities, selectedId, onSelect, onClose }: {
  cities: City[]
  selectedId: number | null
  onSelect: (city: City) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const term = fold(query.trim())
  const shown = term ? cities.filter(city => fold(`${city.name} ${city.state}`).includes(term)) : cities
  return <Sheet title="Cidade do time" description="O pareamento de partidas usa a cidade do time." onClose={onClose}>
    <label htmlFor="team-city-search" className="mt-2 mb-1.5">Buscar cidade</label>
    <input id="team-city-search" data-autofocus type="search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nome da cidade ou UF" />
    <ul className="m-0 mt-2 grid max-h-[50vh] list-none overflow-y-auto p-0" aria-label="Cidades do catálogo">
      {shown.map(city => {
        const active = city.id === selectedId
        return <li key={city.id}>
          <button type="button" aria-pressed={active} onClick={() => onSelect(city)}
            className={cn('flex min-h-11 w-full items-center gap-2 border-0 border-b border-solid border-line bg-transparent px-1 text-left text-[13px]', active && 'font-bold text-brand')}>
            <span className="min-w-0 flex-1 truncate">{city.name} · {city.state}</span>
            {active && <Check size={17} aria-hidden="true" />}
          </button>
        </li>
      })}
      {!shown.length && <li className="py-4 text-center text-[12px] text-ink-muted">Nenhuma cidade do catálogo com esse nome.</li>}
    </ul>
  </Sheet>
}

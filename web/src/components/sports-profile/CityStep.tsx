import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import type { City } from '@/api/client'
import { cityLabel } from '@/api/cities'
import { CitySearch } from '@/components/cities/CitySearch'
import { Button } from '@/components/ui/button'

/** Cartão da cidade escolhida: ✓, `label` ("Escolhida por você"), "Cidade · UF" e "Trocar". */
export function ChosenCity({ city, label, onChange }: { city: City; label: string; onChange: () => void }) {
  return (
    <div data-slot="chosen-city" className="surface mt-3 flex min-h-16 items-center gap-3 rounded-[14px] border-2 border-solid border-brand px-3.5 py-2.5">
      <Check size={16} strokeWidth={3} className="text-brand" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <small className="block text-[10.5px] text-ink-muted">{label}</small>
        <b className="block font-display text-[15px] wrap-anywhere text-heading">{cityLabel(city)}</b>
      </span>
      <Button type="button" variant="link" className="min-h-11 px-2" aria-label={`Trocar cidade: ${cityLabel(city)}`} onClick={onChange}>Trocar</Button>
    </div>
  )
}

/**
 * Passo da cidade da folha de modalidades. Com cidade escolhida, mostra o cartão selecionado; sem ela, ou depois de
 * "Trocar", a busca do servidor (`CitySearch`), que mantém a cidade atual marcada até outra ser escolhida. `before` fica
 * acima da busca: é onde entram os estados da localização (`LocationCityStep`); como função, recebe `select`, que escolhe
 * uma cidade como a busca (volta ao cartão). `chosenLabel` permite o rótulo "Pela sua localização" no cartão.
 * `startSearching` abre direto na busca, com o foco no campo, mesmo com cidade (o "Não, escolher outra cidade" da sugestão).
 */
export function CityStep({ city, onChange, before, chosenLabel = 'Escolhida por você', startSearching = false }: {
  city: City | null
  onChange: (city: City) => void
  before?: ReactNode | ((select: (city: City) => void) => ReactNode)
  chosenLabel?: string
  startSearching?: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const [changing, setChanging] = useState(startSearching)
  // O botão tocado some na troca entre cartão e busca: o foco segue para o campo da busca ou para o "Trocar" do cartão.
  const [moved, setMoved] = useState(startSearching)
  useEffect(() => {
    if (moved) box.current?.querySelector<HTMLElement>(changing ? 'input' : '[data-slot="chosen-city"] button')?.focus()
  }, [changing, moved])
  const showSearch = !city || changing
  const select = (next: City) => { setChanging(false); setMoved(true); onChange(next) }
  return (
    <div ref={box} className="grid min-w-0">
      {showSearch ? <>
        {typeof before === 'function' ? before(select) : before}
        <CitySearch selected={city} onSelect={select} />
      </> : <ChosenCity city={city} label={chosenLabel} onChange={() => { setChanging(true); setMoved(true) }} />}
    </div>
  )
}

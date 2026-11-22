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
 * acima da busca: é onde a sugestão pela localização (ticket 05, "Usar minha localização") entra; `chosenLabel` permite
 * o rótulo "Pela sua localização" no cartão.
 */
export function CityStep({ city, onChange, before, chosenLabel = 'Escolhida por você' }: {
  city: City | null
  onChange: (city: City) => void
  before?: ReactNode
  chosenLabel?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [changing, setChanging] = useState(false)
  // O botão tocado some na troca entre cartão e busca: o foco segue para o campo da busca ou para o "Trocar" do cartão.
  const [moved, setMoved] = useState(false)
  useEffect(() => {
    if (moved) box.current?.querySelector<HTMLElement>(changing ? 'input' : '[data-slot="chosen-city"] button')?.focus()
  }, [changing, moved])
  const showSearch = !city || changing
  return (
    <div ref={box} className="grid min-w-0">
      {showSearch ? <>
        {before}
        <CitySearch selected={city} onSelect={next => { setChanging(false); setMoved(true); onChange(next) }} />
      </> : <ChosenCity city={city} label={chosenLabel} onChange={() => { setChanging(true); setMoved(true) }} />}
    </div>
  )
}

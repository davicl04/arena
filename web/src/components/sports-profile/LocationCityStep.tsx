import { useEffect, useRef, useState } from 'react'
import { ChevronRight, MapPin } from 'lucide-react'
import type { City } from '@/api/client'
import { cityLabel } from '@/api/cities'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CityLocation } from '@/hooks/useCityLocation'
import { locationText } from '@/hooks/useCityLocation'
import { CityStep } from './CityStep'

/** Divisor "ou" entre a localização e a busca. */
function OrDivider() {
  return <div className="mt-3.5 flex items-center gap-2.5">
    <i aria-hidden="true" className="block h-px flex-1 bg-line" />
    <span className="text-[11px] text-ink-muted">ou</span>
    <i aria-hidden="true" className="block h-px flex-1 bg-line" />
  </div>
}

/** Aviso curto da localização (negada, falha ou fora da cobertura), com o pino; a busca segue logo abaixo. */
function LocationNotice({ text }: { text: string }) {
  return <div data-slot="location-notice" className="mt-3 flex items-start gap-2.5 rounded-[13px] bg-subtle p-3.5">
    <MapPin size={16} className="mt-px flex-none text-brand" aria-hidden="true" />
    <p className="text-[12px] leading-normal text-ink-muted">{text}</p>
  </div>
}

/** Confirmação da cidade sugerida: pino, "Pela sua localização", o nome em destaque, a UF em selo e "Não, escolher outra cidade". */
function SuggestionCard({ city, onOther }: { city: City; onOther: () => void }) {
  return <div data-slot="city-suggested" className="grid justify-items-center pt-[18px] text-center">
    <div tabIndex={-1} className="grid min-w-0 justify-items-center rounded-control outline-none focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-focus">
      <MapPin size={28} className="text-brand" aria-hidden="true" />
      <p className="mt-1.5 text-[12px] text-ink-muted">{locationText.suggested}</p>
      <strong className="mt-1 block font-display text-[30px] leading-tight font-bold wrap-anywhere text-heading">{city.name}</strong>
      <Badge className="mt-2 rounded-full px-[9px] py-1 font-semibold">{city.state}</Badge>
    </div>
    <Button type="button" variant="link" className="mt-2.5 min-h-11 w-full text-[13px]" onClick={onOther}>Não, escolher outra cidade</Button>
  </div>
}

/** O que fica acima da busca em cada estado da localização. */
function LocationStatus({ location, city, onLocate, onChoose }: {
  location: CityLocation
  city: City | null
  onLocate: () => void
  onChoose: (city: City) => void
}) {
  const { phase, suggestion } = location
  if (phase === 'ask') {
    return <>
      <Button type="button" variant="secondary" className="mt-3 min-h-[52px] w-full justify-start gap-2.5 px-3.5 text-[13px] text-heading" onClick={onLocate}>
        <MapPin size={16} className="flex-none text-brand" aria-hidden="true" />
        <span className="flex-1 text-left">Usar minha localização</span>
        <ChevronRight size={16} className="flex-none text-ink-muted" aria-hidden="true" />
      </Button>
      <OrDivider />
    </>
  }
  if (phase === 'seeking') {
    return <div data-slot="location-seeking" tabIndex={-1}
      className="surface mt-3 flex min-h-12 items-center gap-3 rounded-[14px] border border-solid border-surface-edge px-3.5 outline-none focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-focus">
      <span aria-hidden="true" className="block size-[18px] flex-none rounded-full border-[2.5px] border-solid border-line border-t-brand motion-safe:animate-spin" />
      <span className="text-[12px] text-ink-muted">{locationText.seeking}</span>
    </div>
  }
  if (phase === 'suggested' && suggestion && suggestion.id !== city?.id) {
    // A sugestão continua disponível depois de "Não, escolher outra cidade" ou de "Trocar" com outra cidade escolhida.
    return <>
      <Button type="button" variant="secondary" className="mt-3 min-h-[52px] w-full justify-start gap-2.5 px-3.5 text-left font-normal"
        aria-label={`Usar a cidade pela sua localização: ${cityLabel(suggestion)}`} onClick={() => onChoose(suggestion)}>
        <MapPin size={16} className="flex-none text-brand" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <small className="block text-[10.5px] text-ink-muted">{locationText.suggested}</small>
          <b className="block text-[13px] wrap-anywhere text-heading">{cityLabel(suggestion)}</b>
        </span>
        <span className="text-[12px] font-bold text-brand">Usar</span>
      </Button>
      <OrDivider />
    </>
  }
  if (phase === 'denied' || phase === 'failed' || phase === 'outside') return <LocationNotice text={locationText[phase]} />
  return null
}

/** Mensagem do estado para leitores de tela (região viva sempre montada no passo). */
function statusMessage({ phase, suggestion }: CityLocation): string {
  if (phase === 'suggested' && suggestion) return `${locationText.suggested}: ${cityLabel(suggestion)}.`
  if (phase === 'seeking' || phase === 'denied' || phase === 'failed' || phase === 'outside') return locationText[phase]
  return ''
}

/**
 * Passo da cidade com a localização (F10): sobre o `CityStep`, a sugestão aparece como confirmação; os demais estados
 * ("Usar minha localização" e "ou", "Buscando sua localização…", negada, falha e 404) ficam no `before`, acima da busca,
 * sem travar o fluxo. A cidade escolhida pela sugestão usa o rótulo "Pela sua localização". O resultado é anunciado numa
 * região viva educada; depois de um toque em "Usar minha localização", o foco segue o resultado (indicador, sugestão ou
 * campo da busca), já que o botão tocado some.
 */
export function LocationCityStep({ city, onChange, location }: {
  city: City | null
  onChange: (city: City) => void
  location: CityLocation
}) {
  const box = useRef<HTMLDivElement>(null)
  const requested = useRef(false)
  const [leftSuggestion, setLeftSuggestion] = useState(false)
  const { phase, confirming } = location
  const fromLocation = Boolean(location.suggestion && city?.id === location.suggestion.id)
  const showSuggestion = phase === 'suggested' && confirming && location.suggestion && fromLocation

  useEffect(() => {
    if (!requested.current) return
    const target = phase === 'seeking' ? '[data-slot="location-seeking"]'
      : phase === 'suggested' ? '[data-slot="city-suggested"] [tabindex="-1"]'
        : phase === 'denied' || phase === 'failed' || phase === 'outside' ? 'input' : null
    if (!target) return
    if (phase !== 'seeking') requested.current = false
    box.current?.querySelector<HTMLElement>(target)?.focus()
  }, [phase])

  return <div ref={box} className="grid min-w-0">
    <p role="status" aria-live="polite" className="sr-only">{statusMessage(location)}</p>
    {showSuggestion && location.suggestion
      ? <SuggestionCard city={location.suggestion} onOther={() => { setLeftSuggestion(true); location.dismiss() }} />
      : <CityStep city={city} onChange={onChange} startSearching={leftSuggestion}
        chosenLabel={fromLocation ? locationText.suggested : undefined}
        before={select => <LocationStatus location={location} city={city} onChoose={select}
          onLocate={() => { requested.current = true; location.locate() }} />} />}
  </div>
}

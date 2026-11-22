import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import type { City } from '../../api/client'
import { cityLabel } from '../../api/cities'
import type { CityLocation } from '../../hooks/useCityLocation'
import { locationText } from '../../hooks/useCityLocation'
import { useThemeColors } from '../../hooks/useTheme'
import { announce } from '../../utils/announce'
import { Icon } from '../Icon'
import { CityStep } from './CityStep'

/** Divisor "ou" entre a localização e a busca. */
function OrDivider() {
  const c = useThemeColors()
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
    <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
    <Text style={{ color: c['ink-muted'], fontSize: 11 }}>ou</Text>
    <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
  </View>
}

/** Aviso curto da localização (negada, falha ou fora da cobertura), com o pino; a busca segue logo abaixo. */
function LocationNotice({ text }: { text: string }) {
  const c = useThemeColors()
  return <View accessibilityLiveRegion="polite" style={{ marginTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 13, padding: 13, backgroundColor: c.subtle }}>
    <Icon name="map-pin" size={16} color={c.brand} />
    <Text style={{ flex: 1, color: c['ink-muted'], fontSize: 12, lineHeight: 18 }}>{text}</Text>
  </View>
}

/** Confirmação da cidade sugerida: pino, "Pela sua localização", o nome em destaque, a UF em selo e "Não, escolher outra cidade". */
function SuggestionCard({ city, onOther }: { city: City; onOther: () => void }) {
  const c = useThemeColors()
  return <View testID="city-suggested" style={{ alignItems: 'center', paddingTop: 18 }}>
    <View accessible accessibilityLabel={`${locationText.suggested}: ${city.name}, ${city.state}`} accessibilityLiveRegion="polite" style={{ alignItems: 'center' }}>
      <Icon name="map-pin" size={28} color={c.brand} />
      <Text style={{ marginTop: 6, color: c['ink-muted'], fontSize: 12 }}>{locationText.suggested}</Text>
      <Text style={{ marginTop: 4, color: c.heading, fontSize: 28, fontWeight: '800', textAlign: 'center' }}>{city.name}</Text>
      <Text style={{ marginTop: 8, overflow: 'hidden', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: c.tile, color: c.heading, fontSize: 10.5, fontWeight: '700' }}>{city.state}</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Não, escolher outra cidade" onPress={onOther}
      style={{ marginTop: 10, minHeight: 44, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.brand, fontSize: 13, fontWeight: '700' }}>Não, escolher outra cidade</Text>
    </Pressable>
  </View>
}

/** O que fica acima da busca em cada estado da localização. */
function LocationStatus({ location, city, onChoose }: { location: CityLocation; city: City | null; onChoose: (city: City) => void }) {
  const c = useThemeColors()
  const { phase, suggestion } = location
  if (phase === 'ask') {
    return <>
      <Pressable accessibilityRole="button" accessibilityLabel="Usar minha localização" accessibilityHint="Sugere a cidade pela localização aproximada do aparelho" onPress={location.locate}
        style={{ marginTop: 12, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, borderColor: c['line-strong'], paddingHorizontal: 14 }}>
        <Icon name="map-pin" size={16} color={c.brand} />
        <Text style={{ flex: 1, color: c.heading, fontSize: 14, fontWeight: '600' }}>Usar minha localização</Text>
        <Icon name="chevron" size={16} color={c['ink-muted']} />
      </Pressable>
      <OrDivider />
    </>
  }
  if (phase === 'seeking') {
    return <View accessibilityLiveRegion="polite" style={{ marginTop: 12, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: c['surface-edge'], backgroundColor: c.surface, paddingHorizontal: 14 }}>
      <ActivityIndicator color={c.brand} />
      <Text style={{ color: c['ink-muted'], fontSize: 12 }}>{locationText.seeking}</Text>
    </View>
  }
  if (phase === 'suggested' && suggestion && suggestion.id !== city?.id) {
    // A sugestão continua disponível depois de "Não, escolher outra cidade" ou de "Trocar" com outra cidade escolhida.
    return <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Usar a cidade pela sua localização: ${suggestion.name}, ${suggestion.state}`} onPress={() => onChoose(suggestion)}
        style={{ marginTop: 12, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, borderColor: c['line-strong'], paddingHorizontal: 14 }}>
        <Icon name="map-pin" size={16} color={c.brand} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c['ink-muted'], fontSize: 10.5 }}>{locationText.suggested}</Text>
          <Text numberOfLines={2} style={{ color: c.heading, fontSize: 14, fontWeight: '700' }}>{cityLabel(suggestion)}</Text>
        </View>
        <Text style={{ color: c.brand, fontSize: 12, fontWeight: '700' }}>Usar</Text>
      </Pressable>
      <OrDivider />
    </>
  }
  if (phase === 'denied' || phase === 'failed' || phase === 'outside') return <LocationNotice text={locationText[phase]} />
  return null
}

/** Mensagem do estado para leitores de tela (região viva no Android; anúncio explícito no iOS). */
function statusMessage({ phase, suggestion }: CityLocation): string {
  if (phase === 'suggested' && suggestion) return `${locationText.suggested}: ${suggestion.name}, ${suggestion.state}`
  if (phase === 'seeking' || phase === 'denied' || phase === 'failed' || phase === 'outside') return locationText[phase]
  return ''
}

/**
 * Passo da cidade com a localização (F10): sobre o `CityStep`, a sugestão aparece como confirmação; os demais estados
 * ("Usar minha localização" e "ou", "Buscando sua localização…", negada, falha e 404) ficam no `before`, acima da busca,
 * sem travar o fluxo. A cidade escolhida pela sugestão usa o rótulo "Pela sua localização".
 */
export function LocationCityStep({ city, onChange, onExpired, location }: {
  city: City | null
  onChange: (city: City) => void
  onExpired?: () => void
  location: CityLocation
}) {
  const [leftSuggestion, setLeftSuggestion] = useState(false)
  const message = statusMessage(location)
  useEffect(() => { announce(message) }, [message])
  const fromLocation = Boolean(location.suggestion && city?.id === location.suggestion.id)
  return location.phase === 'suggested' && location.confirming && location.suggestion && fromLocation
    ? <SuggestionCard city={location.suggestion} onOther={() => { setLeftSuggestion(true); location.dismiss() }} />
    : <CityStep city={city} onChange={onChange} onExpired={onExpired} startSearching={leftSuggestion}
      chosenLabel={fromLocation ? locationText.suggested : undefined} before={select => <LocationStatus location={location} city={city} onChoose={select} />} />
}

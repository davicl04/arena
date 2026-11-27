import { useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { Text } from '../Text'
import type { City } from '../../api/client'
import { CITY_SEARCH_MIN, cityLabel } from '../../api/cities'
import { useCity, useCitySearch } from '../../hooks/useCities'
import { useThemeColors } from '../../hooks/useTheme'
import { colors } from '../../theme'
import { Icon } from '../Icon'
import Sheet from '../Sheet'
import { FieldError, FieldLabel, fieldLook, FormField, Hint } from './controls'
import type { Surface } from './controls'

/*
 * Escolha da cidade no catálogo nacional pela busca do servidor (mínimo de 2 caracteres, até 20 resultados "Nome · UF"),
 * com os estados de espera, vazio e erro com "Tentar novamente". `CitySearch` é a peça reutilizável (folha da cidade do
 * time, do evento e do organizador, perfil esportivo e o passo da cidade da tela de modalidades); `CitySheet` a põe numa
 * folha e `CityField` mostra a cidade escolhida e abre a folha.
 */

/** Uma linha de cidade (resultado ou a escolhida), com alvo de 48 pt e o ✓ quando é a escolhida. */
function CityRow({ city, active, onPress }: { city: City; active: boolean; onPress: () => void }) {
  const c = useThemeColors()
  return <Pressable accessibilityRole="button" accessibilityLabel={`${city.name}, ${city.state}`} accessibilityState={{ selected: active }} onPress={onPress}
    style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: c['brand-soft'] }}>
    <Text numberOfLines={1} style={{ flex: 1, color: active ? c.brand : c.ink, fontSize: 14, fontWeight: active ? '700' : '500' }}>{cityLabel(city)}</Text>
    {active ? <Icon name="check" size={17} color={c.brand} /> : null}
  </Pressable>
}

/**
 * Busca de cidade: campo "Buscar cidade" e a lista do servidor. A cidade escolhida (`selected`) aparece marcada no topo
 * mesmo quando não está entre os resultados; tocar numa linha chama `onSelect`.
 */
export function CitySearch({ selected, onSelect, onExpired, label = 'Buscar cidade' }: {
  selected: City | null
  onSelect: (city: City) => void
  onExpired?: () => void
  label?: string
}) {
  const c = useThemeColors()
  const [query, setQuery] = useState('')
  const search = useCitySearch(query, onExpired)
  const results = search.items.filter(city => city.id !== selected?.id)
  return <View>
    <FormField label={label} value={query} onChangeText={setQuery} placeholder="Nome da cidade ou UF" autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
    {selected ? <View accessibilityLabel="Cidade escolhida" style={{ marginTop: 8 }}>
      <CityRow city={selected} active onPress={() => onSelect(selected)} />
    </View> : null}
    <View accessibilityLabel="Cidades do catálogo" style={{ marginTop: 4 }}>
      {!search.active ? <Hint>{`Digite pelo menos ${CITY_SEARCH_MIN} letras do nome da cidade ou a UF.`}</Hint>
        : search.loading ? <View accessibilityLiveRegion="polite" style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator color={c.brand} />
          <Text style={{ color: c['ink-muted'], fontSize: 12 }}>Buscando cidades…</Text>
        </View>
          : search.error ? <View accessibilityLiveRegion="polite" style={{ paddingVertical: 10, gap: 4 }}>
            <Text accessibilityRole="alert" style={{ color: c.error, fontSize: 12, lineHeight: 18 }}>{search.error}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Tentar novamente" onPress={search.retry} style={{ minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' }}>
              <Text style={{ color: c.brand, fontSize: 13, fontWeight: '700' }}>Tentar novamente</Text>
            </Pressable>
          </View>
            : !search.items.length ? <Text accessibilityLiveRegion="polite" style={{ paddingVertical: 16, textAlign: 'center', color: c['ink-muted'], fontSize: 12 }}>Nenhuma cidade encontrada.</Text>
              : results.map(city => <CityRow key={city.id} city={city} active={false} onPress={() => onSelect(city)} />)}
    </View>
  </View>
}

/** Folha de escolha da cidade com a busca do servidor. */
export function CitySheet({ selected, title, description, onSelect, onClose, onExpired }: {
  selected: City | null
  title: string
  description?: string
  onSelect: (city: City) => void
  onClose: () => void
  onExpired?: () => void
}) {
  const c = useThemeColors()
  return <Sheet title={title} onClose={onClose}>
    {description ? <Text style={{ color: c['ink-muted'], fontSize: 12, lineHeight: 18 }}>{description}</Text> : null}
    <CitySearch selected={selected} onSelect={onSelect} onExpired={onExpired} />
  </Sheet>
}

/**
 * Campo da cidade: mostra a escolhida e abre a folha com a busca. `value` é o ID salvo; o nome vem de `city` (o objeto da
 * resposta), da cidade escolhida na folha ou, sem eles, de `GET /cities?ids=`.
 */
export function CityField({ value, city, onChange, label, title, description, surface = 'light', error, placeholder = 'Escolher a cidade', onExpired }: {
  value: number | null
  city?: City | null
  onChange: (city: City) => void
  label: string
  title: string
  description?: string
  surface?: Surface
  error?: string
  placeholder?: string
  onExpired?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<City | null>(null)
  const known = picked?.id === value ? picked : city?.id === value ? city : null
  const resolved = useCity(value, known, onExpired)
  const shown = resolved.city
  const pending = value !== null && !shown ? (resolved.loading ? 'Carregando cidade…' : 'Cidade indisponível') : null
  const c = useThemeColors()
  const look = fieldLook(c)[surface]
  return <View>
    <FieldLabel surface={surface}>{label}</FieldLabel>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${shown ? `${shown.name}, ${shown.state}` : pending ?? 'não escolhida'}`} accessibilityHint="Abre a busca de cidades"
      onPress={() => setOpen(true)}
      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, backgroundColor: look.bg, borderColor: error ? (surface === 'dark' ? colors['danger-soft'] : c.error) : look.border }}>
      <Icon name="map-pin" size={17} color={surface === 'dark' ? colors.mint : c.brand} />
      <Text numberOfLines={1} style={{ flex: 1, color: shown ? look.input : look.placeholder, fontSize: 14, fontWeight: shown ? '600' : '400' }}>{shown ? cityLabel(shown) : pending ?? placeholder}</Text>
      <Text style={{ color: surface === 'dark' ? colors.mint : c.brand, fontSize: 11.5, fontWeight: '700' }}>{value !== null ? 'Trocar' : 'Escolher'}</Text>
    </Pressable>
    <FieldError error={error} surface={surface} />
    {open ? <CitySheet selected={shown} title={title} description={description} onExpired={onExpired} onClose={() => setOpen(false)}
      onSelect={next => { setPicked(next); onChange(next); setOpen(false) }} /> : null}
  </View>
}

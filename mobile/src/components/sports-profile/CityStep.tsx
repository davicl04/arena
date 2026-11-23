import { useState } from 'react'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import type { City } from '../../api/client'
import { cityLabel } from '../../api/cities'
import { useThemeColors } from '../../hooks/useTheme'
import { CitySearch } from '../arena/CitySearch'
import { TextAction } from '../arena/controls'
import { Icon } from '../Icon'

/**
 * Passo da cidade da folha de modalidades. Com cidade escolhida, mostra o cartão selecionado (✓, `chosenLabel`, "Cidade · UF"
 * e "Trocar"); sem ela, ou depois de "Trocar", a busca do servidor (`CitySearch`), que mantém a cidade atual marcada até
 * outra ser escolhida. `before` fica acima da busca: é onde entram os estados da localização (`LocationCityStep`); como
 * função, recebe `select`, que escolhe uma cidade como a busca (volta ao cartão). `startSearching` abre direto na busca
 * mesmo com cidade (o "Não, escolher outra cidade" da sugestão).
 */
export function CityStep({ city, onChange, onExpired, before, chosenLabel = 'Escolhida por você', startSearching = false }: {
  city: City | null
  onChange: (city: City) => void
  onExpired?: () => void
  before?: ReactNode | ((select: (city: City) => void) => ReactNode)
  chosenLabel?: string
  startSearching?: boolean
}) {
  const c = useThemeColors()
  const [changing, setChanging] = useState(startSearching)
  if (city && !changing) {
    return <View testID="city-chosen" style={{ marginTop: 12, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 2, borderColor: c.brand, backgroundColor: c.surface, paddingHorizontal: 14, paddingVertical: 10 }}>
      <Icon name="check" size={16} color={c.brand} strokeWidth={3} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: c['ink-muted'], fontSize: 10.5 }}>{chosenLabel}</Text>
        <Text numberOfLines={2} style={{ color: c.heading, fontSize: 15, fontWeight: '700' }}>{cityLabel(city)}</Text>
      </View>
      <TextAction title="Trocar" accessibilityLabel="Trocar cidade" onPress={() => setChanging(true)} />
    </View>
  }
  const select = (next: City) => { setChanging(false); onChange(next) }
  return <View style={{ marginTop: 4 }}>
    {typeof before === 'function' ? before(select) : before}
    <CitySearch selected={city} onExpired={onExpired} onSelect={select} />
  </View>
}

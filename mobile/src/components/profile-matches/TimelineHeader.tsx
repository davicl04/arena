import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useThemeColors } from '../../hooks/useTheme'
import { SportIcon } from '../arena/SportIcon'
import { Icon } from '../Icon'
import Sheet from '../Sheet'
import { countLine, filterLabel, filterOptions } from './timelineView'
import type { SportFilter } from './timelineView'

/**
 * Topo mínimo da aba: "N registros · Todas as modalidades" e um botão só com o ícone de filtro, que abre a folha com
 * Todas, Futebol, Tênis e Corrida (escolha única). Um ponto no botão indica filtro ativo.
 */
export function TimelineHeader({ total, filter, onFilter }: { total: number | undefined; filter: SportFilter; onFilter: (filter: SportFilter) => void }) {
  const colors = useThemeColors()
  const [open, setOpen] = useState(false)
  const active = filter !== null
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 }}>
    <Text accessibilityLiveRegion="polite" style={{ flexShrink: 1, color: colors['ink-muted'], fontSize: 12, fontWeight: '600' }}>
      {total === undefined ? filterLabel(filter) : countLine(total, filter)}
    </Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Filtrar por modalidade" accessibilityHint={active ? `Filtro ativo: ${filterLabel(filter)}` : undefined}
      onPress={() => setOpen(true)} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="list-filter" size={20} color={colors.brand} />
      {active ? <View testID="filter-dot" style={{ position: 'absolute', top: 9, right: 9, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand, borderWidth: 1.5, borderColor: colors.surface }} /> : null}
    </Pressable>
    {open ? <Sheet title="Filtrar por modalidade" onClose={() => setOpen(false)}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Modalidade">
        {filterOptions.map(option => {
          const selected = option.value === filter
          return <Pressable key={option.label} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: selected }}
            onPress={() => { onFilter(option.value); setOpen(false) }}
            style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            {option.value ? <SportIcon sport={option.value} size={26} /> : <View style={{ width: 26 }} />}
            <Text style={{ flex: 1, color: selected ? colors.brand : colors.ink, fontSize: 15, fontWeight: selected ? '800' : '600' }}>{option.label}</Text>
            {selected ? <Icon name="check" size={18} color={colors.brand} /> : null}
          </Pressable>
        })}
      </View>
    </Sheet> : null}
  </View>
}

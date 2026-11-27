import { Pressable, View } from 'react-native'
import { Text } from '../Text'
import type { Position } from '../../api/client'
import { useThemeColors } from '../../hooks/useTheme'
import { positionChoices } from './profileSteps'

/**
 * Passo da posição (só futebol): grupo de rádio com rótulo e descrição, alvo de 56 pt por linha. "Ainda não sei" grava
 * `position: null`; o passo é sempre opcional.
 */
export function PositionStep({ value, onChange }: { value: Position | null; onChange: (position: Position | null) => void }) {
  const c = useThemeColors()
  return <View accessibilityRole="radiogroup" accessibilityLabel="Posição preferida"
    style={{ marginTop: 12, overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: c['surface-edge'], backgroundColor: c.surface }}>
    {positionChoices.map((choice, index) => {
      const checked = choice.value === value
      return <Pressable key={choice.value ?? 'none'} accessibilityRole="radio" accessibilityLabel={choice.label} accessibilityHint={choice.description}
        accessibilityState={{ checked }} onPress={() => onChange(choice.value)}
        style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: checked ? c['success-bg'] : 'transparent', ...(index ? { borderTopWidth: 1, borderTopColor: c.line } : {}) }}>
        <View accessible={false} style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 2, borderColor: checked ? c.brand : c['line-strong'] }}>
          {checked ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.brand }} /> : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c.heading, fontSize: 13.5, fontWeight: '700' }}>{choice.label}</Text>
          <Text style={{ marginTop: 1, color: c['ink-muted'], fontSize: 11, lineHeight: 15 }}>{choice.description}</Text>
        </View>
      </Pressable>
    })}
  </View>
}

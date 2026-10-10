import { Pressable, Text } from 'react-native'

// Linha de lista: botão com chevron quando há ação, estática quando não há. A linha 'danger' fica em vermelho e sem chevron.
export default function ListRow({ label, value, onPress, tone, disabled }: { label: string; value?: string; onPress?: () => void; tone?: 'danger'; disabled?: boolean }) {
  const danger = tone === 'danger'
  const inactive = disabled || !onPress
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityState={onPress ? { disabled: Boolean(disabled) } : undefined}
    accessibilityLabel={value ? `${label}: ${value}` : label} disabled={inactive} onPress={onPress}
    style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: '#edf3ef', opacity: disabled ? 0.5 : 1 }}>
    <Text style={{ fontWeight: '600', color: danger ? '#b42318' : '#343d39' }}>{label}</Text>
    <Text numberOfLines={1} style={{ flex: 1, textAlign: 'right', color: '#606965' }}>{value ?? ''}</Text>
    {onPress && !danger ? <Text style={{ color: '#606965' }}>›</Text> : null}
  </Pressable>
}

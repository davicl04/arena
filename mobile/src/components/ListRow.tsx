import { Pressable, Text } from 'react-native'
import { cx } from '../styles'
// Linha de lista: botão com chevron quando há ação, estática quando não há. A linha 'danger' fica em vermelho e sem chevron.
export default function ListRow({ label, value, onPress, tone, disabled }: { label: string; value?: string; onPress?: () => void; tone?: 'danger'; disabled?: boolean }) {
  const danger = tone === 'danger'
  const inactive = disabled || !onPress
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityState={onPress ? { disabled: Boolean(disabled) } : undefined}
    accessibilityLabel={value ? `${label}: ${value}` : label} disabled={inactive} onPress={onPress}
    className={cx('min-h-[52px] flex-row items-center gap-2.5 border-b border-brand-soft', disabled && 'opacity-50')}>
    <Text className={cx('font-semibold', danger ? 'text-danger' : 'text-ink')}>{label}</Text>
    <Text numberOfLines={1} className="grow basis-0 text-right text-ink-muted">{value ?? ''}</Text>
    {onPress && !danger ? <Text className="text-ink-muted">›</Text> : null}
  </Pressable>
}

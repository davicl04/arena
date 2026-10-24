import { Pressable, Text, View } from 'react-native'
import type { AccessibilityActionEvent } from 'react-native'
import { useThemeColors } from '../../hooks/useTheme'
import { Icon } from '../Icon'

/*
 * Contador −/+ dos protótipos (R4), para o placar, os sets e as estatísticas. É um único elemento ajustável para leitores de
 * tela (`accessibilityRole="adjustable"`, com as ações "increment" e "decrement": o deslizar para cima e para baixo do
 * TalkBack e do VoiceOver), e os botões −/+ atendem o toque com área de 44 pt (botão de 32 ou 36 pt mais a margem de toque).
 */
/** Botão (`box`), margem de toque (`slop`, para chegar a 44 pt) e tamanho do número (`value`). */
const sizes = { md: { box: 32, slop: 6, value: 18 }, lg: { box: 36, slop: 4, value: 30 } } as const

/** Ações de acessibilidade do contador: aumentar e diminuir. */
export const stepperActions = [
  { name: 'increment', label: 'Aumentar' },
  { name: 'decrement', label: 'Diminuir' },
] as const

export interface StepperProps {
  value: number
  onChange: (value: number) => void
  /** Nome do valor, com inicial maiúscula ("Gols do Ferrugem FC"): vira o nome do contador e, em minúsculas, o dos botões. */
  label: string
  min?: number
  max?: number
  /** `lg` para o placar do futebol (30 pt) e `md` para sets e estatísticas (18 pt). */
  size?: 'md' | 'lg'
  disabled?: boolean
  /** Cores sobre fundo escuro (a placa `forest`). */
  tone?: 'light' | 'dark'
}

export function Stepper({ value, onChange, label, min = 0, max = 99, size = 'md', disabled = false, tone = 'light' }: StepperProps) {
  const colors = useThemeColors()
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next))
    if (!disabled && clamped !== value) onChange(clamped)
  }
  const look = sizes[size]
  const dark = tone === 'dark'
  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') set(value + 1)
    else if (event.nativeEvent.actionName === 'decrement') set(value - 1)
  }
  const button = (kind: 'minus' | 'plus') => {
    const off = disabled || (kind === 'minus' ? value <= min : value >= max)
    return <Pressable testID={`stepper-${kind}`} accessible={false} importantForAccessibility="no" disabled={off} onPress={() => set(value + (kind === 'plus' ? 1 : -1))}
      hitSlop={look.slop}
      style={{ width: look.box, height: look.box, borderRadius: 9, borderWidth: 1, borderColor: dark ? 'rgba(255,255,255,0.35)' : colors['line-strong'], backgroundColor: dark ? 'rgba(255,255,255,0.08)' : colors.surface, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.35 : 1 }}>
      <Icon name={kind} size={14} color={dark ? '#ffffff' : colors.brand} />
    </Pressable>
  }
  return <View testID="stepper" accessible accessibilityRole="adjustable" accessibilityLabel={label}
    accessibilityValue={{ min, max, now: value, text: String(value) }} accessibilityActions={stepperActions.map(action => ({ ...action }))}
    accessibilityState={{ disabled }} onAccessibilityAction={onAction}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 }}>
    {button('minus')}
    <Text accessibilityElementsHidden importantForAccessibility="no" style={{ minWidth: 26, textAlign: 'center', color: dark ? '#ffffff' : colors.ink, fontSize: look.value, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value}</Text>
    {button('plus')}
  </View>
}

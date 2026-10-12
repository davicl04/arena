import { useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { tiers as tierInfo } from '../../data/arena'
import type { TierKey } from '../../data/arena'
import { colors } from '../../theme'
import { TierEmblem } from '../arena/TierEmblem'
import { FieldError, MultiPills } from '../arena/controls'
import type { ChoiceOption } from '../arena/controls'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import { tierOrder } from './eventForm'

/*
 * Campos específicos da tela escura do Criar evento (V4): o contador de vagas (`.stepper`), os elos aceitos
 * (`.elochips`) e a nota sob os campos (`.fnote`). Os demais campos escuros (`FormField`, `ChoicePills`) vêm de
 * `controls.tsx` com `surface="dark"`.
 */

const tierOptions: ChoiceOption<TierKey>[] = tierOrder.map(tier => ({
  value: tier, label: tierInfo[tier].name, leading: () => <TierEmblem tier={tier} size="sm" decorative />,
}))

/** Elos aceitos (vários): brasão e nome, na ordem Bronze → Lendário. */
export function TierChips({ value, onChange, error }: { value: readonly TierKey[]; onChange: (value: TierKey[]) => void; error?: string }) {
  return <MultiPills label="Elos aceitos" tone="dark" options={tierOptions} values={value} error={error} onChange={next => onChange(tierOrder.filter(tier => next.includes(tier)))} />
}

/** Nota sob os campos (ícone menta e texto esmaecido). */
export function Note({ children, icon = 'info' }: { children: ReactNode; icon?: IconName }) {
  return <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
    <View style={{ marginTop: 1 }}><Icon name={icon} size={15} color={colors.mint} /></View>
    <Text style={{ flex: 1, minWidth: 0, color: 'rgba(255,255,255,0.7)', fontSize: 11, lineHeight: 17 }}>{children}</Text>
  </View>
}

function StepButton({ label, glyph, disabled, onPress }: { label: string; glyph: 'minus' | 'plus'; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
    <Icon name={glyph} size={18} color="#ffffff" />
  </Pressable>
}

/** Vagas livres (todos contra todos e corrida): campo numérico com − e +, dentro dos limites. */
export function CapacityStepper({ value, onChange, min, max, step = 1, unit, error }: {
  value: string
  onChange: (value: string) => void
  min: number
  max: number
  step?: number
  /** "times", "atletas" ou "corredores". */
  unit: string
  error?: string
}) {
  const [focused, setFocused] = useState(false)
  const current = /^\d+$/.test(value.trim()) ? Number(value) : null
  const change = (delta: number) => {
    const base = current ?? (delta > 0 ? min - delta : min)
    onChange(String(Math.min(max, Math.max(min, base + delta))))
  }
  return <View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <StepButton label="Menos vagas" glyph="minus" disabled={current !== null && current <= min} onPress={() => change(-step)} />
      <TextInput accessibilityLabel="Vagas" accessibilityHint={error || `De ${min} a ${max} ${unit}`} keyboardType="number-pad" maxLength={4} value={value} placeholder={String(min)}
        placeholderTextColor="rgba(255,255,255,0.4)" onChangeText={text => onChange(text.replace(/\D/g, '').slice(0, 4))} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ width: 92, height: 48, borderRadius: 8, borderWidth: 1, borderColor: error ? colors['danger-soft'] : focused ? colors.mint : 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.05)', color: '#ffffff', fontSize: 18, fontWeight: '800', textAlign: 'center', padding: 0 }} />
      <StepButton label="Mais vagas" glyph="plus" disabled={current !== null && current >= max} onPress={() => change(step)} />
      <Text style={{ flexShrink: 1, color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{unit}</Text>
    </View>
    <FieldError error={error} surface="dark" />
  </View>
}

import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { colors } from '../../theme'
import { Icon } from '../Icon'
import { ActionButton, ChoicePills, ErrorText } from '../arena/controls'
import { ActionRow, LongField } from './ui'

/**
 * Painel do motivo (recusa, cancelamento, revogação ou decisão): opções em chips (quando há), o texto e [Voltar |
 * confirmar]. A validação vem de quem usa (`error`), com as mesmas mensagens do servidor, só depois da primeira tentativa.
 */
export function ReasonPanel<T extends string = string>({ title, options, option, onOption, textLabel, text, onText, max, error, note, confirmLabel, busyLabel, busy, onConfirm, onCancel, tone = 'danger', placeholder }: {
  title: string
  options?: readonly { value: T; label: string }[]
  option?: T | null
  onOption?: (value: T) => void
  textLabel: string
  text: string
  onText: (value: string) => void
  max: number
  error: string | null
  note: ReactNode
  confirmLabel: string
  busyLabel: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
  tone?: 'danger' | 'brand'
  placeholder?: string
}) {
  const accent = tone === 'danger' ? 'rgba(180,35,24,0.45)' : 'rgba(0,90,54,0.4)'
  return <View accessibilityLabel={title} style={{ marginTop: 14, gap: 10, borderRadius: 16, borderWidth: 1.5, borderColor: accent, padding: 14 }}>
    <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>{title}</Text>
    {options && onOption ? <ChoicePills label={title} options={options} value={option ?? null} onChange={onOption} disabled={busy} accent={tone} /> : null}
    <LongField label={textLabel} value={text} onChangeText={onText} max={max} disabled={busy} invalid={Boolean(error)} placeholder={placeholder} />
    {error ? <ErrorText>{error}</ErrorText> : null}
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginTop: 1 }}><Icon name="info" size={15} color={colors.brand} /></View>
      <Text style={{ flex: 1, color: colors['ink-muted'], fontSize: 11, lineHeight: 16 }}>{note}</Text>
    </View>
    <ActionRow>
      <ActionButton tone="outline" title="Voltar" disabled={busy} onPress={onCancel} grow />
      <ActionButton tone={tone === 'danger' ? 'danger' : 'brand'} title={busy ? busyLabel : confirmLabel} disabled={busy} onPress={onConfirm} grow />
    </ActionRow>
  </View>
}

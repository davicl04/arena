import { useState } from 'react'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { colors } from '../../theme'
import { ActionButton, BusyStatus, ErrorText, FormField } from '../arena/controls'
import Sheet from '../Sheet'

/*
 * Folhas de confirmação da partida: cancelar (motivo opcional), registrar ou retirar o W.O. e contestar o W.O. (motivo de 5 a
 * 500 caracteres). A folha fica aberta para tentar de novo: a recusa do formulário pelo servidor (`error`) aparece dentro dela
 * e as demais falhas de ação saem em toast. O "Fechar" da folha desiste sem enviar nada.
 */

const body = { color: colors.ink, fontSize: 12.5, lineHeight: 19 } as const

/** Confirmação simples: o texto que explica o efeito e a ação (desistir é o "Fechar" da folha). */
export function ConfirmSheet({ title, description, children, confirmLabel, busyLabel, busy, error, onConfirm, onClose }: {
  title: string
  description?: string
  children: ReactNode
  confirmLabel: string
  busyLabel: string
  busy: boolean
  error: string
  onConfirm: () => void
  onClose: () => void
}) {
  return <Sheet title={title} onClose={onClose}>
    {description ? <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 8 }}>{description}</Text> : null}
    <View style={{ gap: 8 }}>{children}</View>
    {error ? <ErrorText>{error}</ErrorText> : null}
    <BusyStatus text={busy ? busyLabel : ''} />
    <View style={{ marginTop: 14 }}>
      <ActionButton block tone="brand" title={busy ? busyLabel : confirmLabel} accessibilityLabel={confirmLabel} busy={busy} onPress={onConfirm} />
    </View>
  </Sheet>
}

/** Parágrafo da folha de confirmação (`muted` para a nota de apoio). */
export function SheetText({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[body, muted ? { color: colors['ink-muted'] } : null]}>{children}</Text>
}

/** Folha com um motivo digitado: opcional (cancelamento, até 300) ou obrigatório (contestação, 5 a 500). */
export function ReasonSheet({ title, description, intro, label, placeholder, min, max, shortMessage, confirmLabel, busyLabel, busy, error, onSubmit, onClose }: {
  title: string
  description?: string
  intro: ReactNode
  label: string
  placeholder: string
  /** Mínimo de caracteres do motivo aparado; 0 quando é opcional. */
  min: number
  max: number
  shortMessage?: string
  confirmLabel: string
  busyLabel: string
  busy: boolean
  error: string
  onSubmit: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const text = reason.trim()
  const short = text.length < min
  function submit() {
    setTouched(true)
    if (!short && !busy) onSubmit(text)
  }
  return <Sheet title={title} onClose={onClose}>
    {description ? <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 8 }}>{description}</Text> : null}
    <Text style={body}>{intro}</Text>
    <FormField label={label} multiline maxLength={max} value={reason} onChangeText={setReason} placeholder={placeholder} editable={!busy}
      hint={`${min > 0 ? `De ${min} a ${max} caracteres.` : 'Opcional.'} ${reason.length}/${max}`}
      error={touched && short ? shortMessage : undefined} style={{ minHeight: 88 }} />
    {error ? <ErrorText>{error}</ErrorText> : null}
    <BusyStatus text={busy ? busyLabel : ''} />
    <View style={{ marginTop: 14 }}>
      <ActionButton block tone="brand" title={busy ? busyLabel : confirmLabel} accessibilityLabel={confirmLabel} busy={busy} onPress={submit} />
    </View>
  </Sheet>
}

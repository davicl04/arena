import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { colors } from '../../theme'
import { Icon } from '../Icon'

const pad = (value: number) => String(value).padStart(2, '0')
const DAY_MINUTES = 24 * 60
export const TIME_ERROR = 'Informe a hora entre 00:00 e 23:59.'

/** "HH:MM" válido (00:00 a 23:59) ou `null`. */
export function parseTime(text: string): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(text.trim())
  return match && Number(match[1]) <= 23 && Number(match[2]) <= 59 ? text.trim() : null
}

/** Digitação em máscara: só dígitos, no máximo quatro, com os dois pontos depois da hora ("0930" → "09:30"). */
export function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits
}

/**
 * Completa uma hora digitada pela metade ao sair do campo: "9" e "21" viram "09:00" e "21:00"; "930" vira "09:30".
 * Vazio → `''`; fora de 00:00 a 23:59 ou ilegível → `null`.
 */
export function completeTime(text: string): string | null {
  const digits = text.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length > 4) return null
  const full = digits.length <= 2 ? `${digits.padStart(2, '0')}:00` : `${digits.padStart(4, '0').slice(0, 2)}:${digits.padStart(4, '0').slice(2)}`
  return parseTime(full)
}

/**
 * Próxima hora na grade do passo, subindo (`1`) ou descendo (`-1`): 09:10 com passo 15 vai a 09:15 ou 09:00; a virada do
 * dia fecha o círculo (23:45 → 00:00). Sem hora válida, começa em `emptyStart`.
 */
export function stepTime(value: string, direction: 1 | -1, step = 15, emptyStart = '09:00'): string {
  const current = parseTime(value)
  if (!current) return emptyStart
  const [hours, minutes] = current.split(':').map(Number)
  const total = hours * 60 + minutes
  const next = direction > 0 ? (Math.floor(total / step) + 1) * step : (Math.ceil(total / step) - 1) * step
  const wrapped = ((next % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`
}

export interface TimeFieldProps {
  /** Hora "HH:MM"; vazio sem hora válida. */
  value: string
  /** Recebe "HH:MM" (a hora digitada pela metade já vale completada: "9" é 09:00) e `''` com o campo vazio ou fora de 00:00 a 23:59. */
  onChange: (value: string) => void
  /** Nome do campo ("Hora do início"). */
  label: string
  /** Passo dos botões − e +, em minutos (padrão 15). */
  stepMinutes?: number
  /** Onde os botões começam quando o campo está vazio (padrão 09:00). */
  emptyStart?: string
  /** Texto de ajuda do campo vazio (padrão "HH:MM"). */
  placeholder?: string
  /** `dark` para as telas escuras. */
  tone?: 'light' | 'dark'
  invalid?: boolean
  disabled?: boolean
}

const look = {
  light: { bg: '#ffffff', border: colors['line-strong'], text: colors.ink, hint: colors.placeholder, icon: colors.brand, button: colors['brand-soft'], glyph: colors.brand, error: colors.error },
  dark: { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.18)', text: '#ffffff', hint: 'rgba(255,255,255,0.4)', icon: colors.mint, button: 'rgba(255,255,255,0.08)', glyph: '#ffffff', error: colors['danger-soft'] },
} as const

/**
 * Campo de hora: digitação "HH:MM" com máscara e validação (ao sair, "9" vira 09:00) e botões − e + que andam de 15 em
 * 15 minutos (ou o `stepMinutes`). Hora fora de 00:00 a 23:59 mostra o erro no campo. Serve também ao Jogar.
 */
export function TimeField({ value, onChange, label, stepMinutes = 15, emptyStart = '09:00', placeholder = 'HH:MM', tone = 'light', invalid = false, disabled = false }: TimeFieldProps) {
  const [text, setText] = useState(value)
  const [error, setError] = useState('')
  // Última hora entregue ao pai: uma mudança de `value` diferente dela veio de fora (rascunho carregado) e atualiza o texto.
  const emitted = useRef(value)
  useEffect(() => {
    if (value === emitted.current) return
    emitted.current = value
    setText(value)
    setError('')
  }, [value])
  const style = look[tone]

  function emit(next: string) {
    emitted.current = next
    onChange(next)
  }
  function type(raw: string) {
    const formatted = formatTimeInput(raw)
    setText(formatted)
    setError('')
    emit(completeTime(formatted) ?? '')
  }
  function finish() {
    const completed = completeTime(text)
    if (completed === null) { setError(TIME_ERROR); emit(''); return }
    setText(completed)
    setError('')
    emit(completed)
  }
  function step(direction: 1 | -1) {
    const next = stepTime(parseTime(text) ?? '', direction, stepMinutes, emptyStart)
    setText(next)
    setError('')
    emit(next)
  }
  const shown = Boolean(error) || invalid
  const stepButton = (direction: 1 | -1) => <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${direction > 0 ? 'mais' : 'menos'} ${stepMinutes} minutos`}
    accessibilityState={{ disabled }} disabled={disabled} onPress={() => step(direction)}
    style={{ width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: style.button, opacity: disabled ? 0.5 : 1 }}>
    <Icon name={direction > 0 ? 'plus' : 'minus'} size={18} color={style.glyph} />
  </Pressable>
  return <View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, backgroundColor: style.bg, borderColor: shown ? style.error : style.border, opacity: disabled ? 0.5 : 1 }}>
        <Icon name="clock" size={17} color={style.icon} />
        <TextInput accessibilityLabel={label} accessibilityHint={error || `Digite a hora como HH:MM ou use os botões de ${stepMinutes} em ${stepMinutes} minutos`}
          value={text} onChangeText={type} onBlur={finish} placeholder={placeholder} placeholderTextColor={style.hint} keyboardType="number-pad" maxLength={5} editable={!disabled}
          style={{ flex: 1, minHeight: 46, padding: 0, color: style.text, fontSize: 15, fontWeight: '600' }} />
      </View>
      {stepButton(-1)}
      {stepButton(1)}
    </View>
    {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ marginTop: 6, color: style.error, fontSize: 11, fontWeight: '600' }}>{error}</Text> : null}
  </View>
}

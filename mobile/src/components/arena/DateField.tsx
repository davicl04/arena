import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { colors } from '../../theme'
import { addMonths, dayAllowed, dayKey, dayLabel, initialMonth, monthKey, monthOf, monthTitle, monthWeeks, WEEKDAY_INITIALS } from '../../utils/calendar'
import type { MonthView } from '../../utils/calendar'
import { fromDateKey, startOfToday, toDateKey } from '../../utils/dateKey'
import { formatShortDate } from '../../utils/format'
import Sheet from '../Sheet'
import { Icon } from '../Icon'

const ROW_HEIGHT = 44

function NavButton({ label, glyph, disabled, onPress }: { label: string; glyph: 'arrow-left' | 'arrow-right'; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ width: ROW_HEIGHT, height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}>
    <Icon name={glyph} size={20} color={colors.brand} />
  </Pressable>
}

export interface CalendarGridProps {
  /** Dia escolhido ("AAAA-MM-DD"); vazio sem escolha. */
  value: string
  /** Primeiro dia permitido (inclusive); dias antes dele ficam desabilitados. */
  min?: string
  /** Último dia permitido (inclusive). */
  max?: string
  /** Hoje, destacado na grade. */
  today: Date
  onSelect: (key: string) => void
}

/**
 * Grade do calendário em português: o mês com a semana começando no domingo, navegação por mês, dias fora de `min` e
 * `max` desabilitados e o dia escolhido em destaque. Cada dia é um botão de 44 pt, com a data por extenso como nome.
 */
export function CalendarGrid({ value, min, max, today, onSelect }: CalendarGridProps) {
  const [view, setView] = useState<MonthView>(() => initialMonth(value, min, today))
  const todayKey = toDateKey(today)
  const canGoBack = !min || monthKey(addMonths(view, -1)) >= monthKey(monthOf(fromDateKey(min) ?? today))
  const maxDate = fromDateKey(max)
  const canGoOn = !maxDate || monthKey(addMonths(view, 1)) <= monthKey(monthOf(maxDate))
  return <View testID="calendar-grid" style={{ marginTop: 6 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <NavButton label="Mês anterior" glyph="arrow-left" disabled={!canGoBack} onPress={() => setView(old => addMonths(old, -1))} />
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={{ color: colors.ink, fontSize: 15, fontWeight: '700', textTransform: 'capitalize' }}>{monthTitle(view)}</Text>
      <NavButton label="Próximo mês" glyph="arrow-right" disabled={!canGoOn} onPress={() => setView(old => addMonths(old, 1))} />
    </View>
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', marginTop: 4 }}>
      {WEEKDAY_INITIALS.map((initial, index) => <Text key={index} style={{ flex: 1, textAlign: 'center', color: colors['ink-muted'], fontSize: 11, fontWeight: '700' }}>{initial}</Text>)}
    </View>
    {monthWeeks(view).map((week, row) => <View key={row} style={{ flexDirection: 'row' }}>
      {week.map((day, column) => {
        if (day === null) return <View key={column} style={{ flex: 1, minHeight: ROW_HEIGHT }} />
        const key = dayKey(view, day)
        const allowed = dayAllowed(key, min, max)
        const selected = key === value
        return <Pressable key={column} accessibilityRole="button" accessibilityLabel={dayLabel(new Date(view.year, view.month, day))}
          accessibilityState={{ selected, disabled: !allowed }} disabled={!allowed} onPress={() => onSelect(key)}
          style={{ flex: 1, minHeight: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.brand : 'transparent', borderWidth: key === todayKey && !selected ? 1.5 : 0, borderColor: colors.brand }}>
            <Text style={{ color: selected ? '#ffffff' : colors.ink, fontSize: 14, fontWeight: selected ? '800' : '500', opacity: allowed ? 1 : 0.3 }}>{day}</Text>
          </View>
        </Pressable>
      })}
    </View>)}
  </View>
}

export interface DateFieldProps {
  /** Dia escolhido ("AAAA-MM-DD"); vazio sem escolha. */
  value: string
  onChange: (value: string) => void
  /** Nome do campo e título do calendário ("Data do evento"). */
  label: string
  /** Primeiro dia permitido ("AAAA-MM-DD", inclusive). */
  min?: string
  /** Último dia permitido (inclusive). */
  max?: string
  /** Desabilita os dias anteriores a hoje (padrão `true`). */
  disablePast?: boolean
  /** `dark` para as telas escuras (campo de vidro, ícone menta). */
  tone?: 'light' | 'dark'
  invalid?: boolean
  placeholder?: string
  disabled?: boolean
  /** Hoje, para os testes. */
  now?: Date
}

const look = {
  light: { bg: '#ffffff', border: colors['line-strong'], text: colors.ink, hint: colors.placeholder, icon: colors.brand },
  dark: { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.18)', text: '#ffffff', hint: 'rgba(255,255,255,0.4)', icon: colors.mint },
} as const

/**
 * Campo de data: mostra o dia escolhido ("sáb, 25 out") e abre o calendário numa folha, em português, com os dias
 * passados desabilitados e navegação por mês. Sem dependência de data e hora (a grade é do app). Serve também ao Jogar.
 */
export function DateField({ value, onChange, label, min, max, disablePast = true, tone = 'light', invalid = false, placeholder = 'Escolher a data', disabled = false, now }: DateFieldProps) {
  const [open, setOpen] = useState(false)
  const today = startOfToday(now)
  const floor = disablePast && (!min || toDateKey(today) > min) ? toDateKey(today) : min
  const date = fromDateKey(value)
  const style = look[tone]
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${date ? dayLabel(date) : 'não escolhida'}`} accessibilityHint="Abre o calendário"
      accessibilityState={{ disabled }} disabled={disabled} onPress={() => setOpen(true)}
      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, backgroundColor: style.bg, borderColor: invalid ? (tone === 'dark' ? colors['danger-soft'] : colors.error) : style.border, opacity: disabled ? 0.5 : 1 }}>
      <Icon name="calendar" size={17} color={style.icon} />
      <Text numberOfLines={1} style={{ flex: 1, color: date ? style.text : style.hint, fontSize: 14, fontWeight: date ? '600' : '400' }}>{date ? formatShortDate(date, now) : placeholder}</Text>
    </Pressable>
    {open ? <Sheet title={label} onClose={() => setOpen(false)}>
      <CalendarGrid value={value} min={floor} max={max} today={today} onSelect={key => { onChange(key); setOpen(false) }} />
    </Sheet> : null}
  </>
}

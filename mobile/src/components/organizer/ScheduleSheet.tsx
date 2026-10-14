import { useState } from 'react'
import { Text, View } from 'react-native'
import type { City } from '../../api/client'
import type { EventMatchRow, ScheduleConflict, ScheduleInput } from '../../api/brackets'
import type { CourtOut } from '../../api/matches'
import { whenText } from '../../data/match'
import { useThemeColors } from '../../hooks/useTheme'
import { combineDateTime, splitDateTime, toDateKey } from '../../utils/dateKey'
import { ActionButton, BusyStatus, ErrorText, FieldLabel, Hint } from '../arena/controls'
import { DateField } from '../arena/DateField'
import { TimeField } from '../arena/TimeField'
import { Icon } from '../Icon'
import { CourtPicker } from '../match/CourtPicker'
import Sheet from '../Sheet'
import { rowNames } from './scheduleRows'
import { SCHEDULE_DAYS_AHEAD, scheduleError, scheduleInput } from './scheduleRules'

/** O que foi enviado por último (data, horário e quadra): com o conflito na tela, o mesmo envio não se repete. */
export const sentKey = (date: string, time: string, court: CourtOut | null) => `${date}|${time}|${court?.id}|${court?.name}`

/**
 * Folha "Agendar" de uma partida do campeonato (S1): data, horário livre digitado, quadra do catálogo da cidade do evento
 * ou "Sugerir outra quadra" (fica em revisão, enviada junto do agendamento) e salvar. O `409` de conflito (a mesma quadra
 * ou o mesmo time a menos de 2 h) aparece aqui, com o jogo que conflita, e a folha continua aberta para escolher outro
 * horário ou outra quadra; reenviar os mesmos dados fica bloqueado.
 */
export function ScheduleSheet({ row, city, busy, error, conflict, onSubmit, onClose, onOpenMatch, onExpired }: {
  row: EventMatchRow
  /** Cidade do evento: a das quadras do catálogo. */
  city: City | null
  busy: boolean
  error: string
  conflict: ScheduleConflict | null
  onSubmit: (input: ScheduleInput) => void
  onClose: () => void
  /** "Abrir partida e chat". */
  onOpenMatch?: () => void
  onExpired: () => void
}) {
  const colors = useThemeColors()
  const { card } = row
  const initial = splitDateTime(card.starts_at)
  const [date, setDate] = useState(initial?.date ?? '')
  const [time, setTime] = useState(initial?.time ?? '')
  const [court, setCourt] = useState<CourtOut | null>(card.court && card.court.state !== 'rejeitada' ? card.court : null)
  const [problem, setProblem] = useState('')
  const [sent, setSent] = useState('')
  const [last] = useState(() => toDateKey(new Date(Date.now() + SCHEDULE_DAYS_AHEAD * 86_400_000)))
  const names = rowNames(row)
  const rescheduling = card.starts_at !== null

  function submit() {
    if (busy) return
    const issue = scheduleError(date, time, court)
    setProblem(issue ?? '')
    const startsAt = combineDateTime(date, time)
    if (issue || !startsAt || !court) return
    setSent(sentKey(date, time, court))
    onSubmit(scheduleInput(startsAt, court))
  }

  const picker = city ? { id: card.id, city, sport: card.sport, format: card.format } : null
  const blocked = conflict !== null && sent === sentKey(date, time, court)
  const message = problem || error
  const verb = rescheduling ? 'Reagendar' : 'Agendar'

  return <Sheet title={`${verb} ${row.label}`} onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, lineHeight: 18 }}>{`${names.join(' × ')} · ${row.stage}`}</Text>
    <FieldLabel>Data</FieldLabel>
    <DateField label="Data da partida" value={date} onChange={setDate} max={last} invalid={Boolean(problem) && !date} />
    <FieldLabel>Horário de início</FieldLabel>
    <TimeField label="Horário de início" value={time} onChange={setTime} stepMinutes={1} invalid={Boolean(problem) && !time} />
    <Hint>Digite o horário de início, ao minuto.</Hint>

    {picker
      ? <CourtPicker detail={picker} selected={court} onSelect={setCourt} canSuggest deferSuggestion onExpired={onExpired} />
      : <Text style={{ marginTop: 14, color: colors['ink-muted'], fontSize: 11.5 }}>Defina a cidade do evento para escolher a quadra.</Text>}

    {conflict ? <View testID="schedule-conflict" accessibilityRole="alert" accessibilityLiveRegion="assertive"
      style={{ marginTop: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, backgroundColor: colors['warning-bg'], padding: 12 }}>
      <View style={{ marginTop: 1 }}><Icon name="triangle-alert" size={18} color={colors.warning} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '700' }}>{conflict.kind === 'quadra' ? 'Conflito de quadra' : 'Conflito de horário do time'}</Text>
        <Text style={{ marginTop: 2, color: colors.ink, fontSize: 11.5, lineHeight: 17 }}>{error}</Text>
        <Text style={{ marginTop: 4, color: colors['ink-muted'], fontSize: 10.5, lineHeight: 15 }}>
          {`Em conflito: ${conflict.label} · ${conflict.stage}${conflict.starts_at ? ` · ${whenText(conflict.starts_at)}` : ''}${conflict.court_name ? ` · ${conflict.court_name}` : ''}`}
        </Text>
      </View>
    </View> : null}
    {message && !conflict ? <ErrorText>{message}</ErrorText> : null}
    {problem && conflict ? <ErrorText>{problem}</ErrorText> : null}
    <BusyStatus text={busy ? 'Salvando o agendamento…' : ''} />

    <View style={{ marginTop: 16 }}>
      <ActionButton block tone="brand" icon="calendar-check" title={busy ? 'Salvando…' : rescheduling ? 'Salvar alteração' : 'Agendar'} accessibilityLabel={rescheduling ? 'Salvar alteração' : 'Agendar'}
        disabled={blocked} busy={busy} onPress={submit} accessibilityHint={blocked ? 'Escolha outro horário ou outra quadra para tentar de novo.' : undefined} />
    </View>
    <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <View style={{ marginTop: 1 }}><Icon name="info" size={15} color={colors['ink-muted']} /></View>
      <Text style={{ flex: 1, minWidth: 0, color: colors['ink-muted'], fontSize: 10.5, lineHeight: 16 }}>Os dois elencos são avisados. A reserva da quadra é com o local; o Arena só registra.</Text>
    </View>
    {onOpenMatch ? <View style={{ marginTop: 10, alignItems: 'flex-start' }}><ActionButton fit tone="outline" icon="messages-square" title="Abrir partida e chat" onPress={onOpenMatch} /></View> : null}
  </Sheet>
}

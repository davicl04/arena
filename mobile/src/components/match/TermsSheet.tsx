import { useState } from 'react'
import { Text, View } from 'react-native'
import type { CourtOut, MatchDetail, Side, TermsInput } from '../../api/matches'
import { nameOf, orderedSides, sideName } from '../../data/match'
import { colors } from '../../theme'
import { combineDateTime, splitDateTime, toDateKey } from '../../utils/dateKey'
import { DateField } from '../arena/DateField'
import { TimeField } from '../arena/TimeField'
import { ActionButton, BusyStatus, ChoicePills, ErrorText, FieldLabel, Hint, SwitchRow } from '../arena/controls'
import { Icon } from '../Icon'
import Sheet from '../Sheet'
import { CourtPicker } from './CourtPicker'
import { MAX_DAYS_AHEAD, STEP_MINUTES, termsError } from './termsRules'

/**
 * Folha "Propor condições" (P2): data (calendário com os dias passados desabilitados, até 60 dias à frente), horário com passo
 * de 15 min, quadra (catálogo da cidade ou sugestão em revisão) e quem reserva com o local (RN08). Parte da proposta pendente
 * ou das condições combinadas, quando houver; no tênis, também o super tie-break. O servidor repete as validações.
 */
export function TermsSheet({ detail, busy, error, onSubmit, onClose, onExpired }: {
  detail: MatchDetail
  busy: boolean
  error: string
  onSubmit: (input: TermsInput) => void
  onClose: () => void
  onExpired: () => void
}) {
  const base = detail.terms.pending ?? detail.terms.current
  const initial = splitDateTime(base?.starts_at)
  const sides = orderedSides(detail)
  const [date, setDate] = useState(initial?.date ?? '')
  const [time, setTime] = useState(initial?.time ?? '')
  const [court, setCourt] = useState<CourtOut | null>(base && base.court.state !== 'rejeitada' ? base.court : null)
  const [booking, setBooking] = useState<Side>(base?.booking_side ?? detail.my_side ?? 'a')
  const [tiebreak, setTiebreak] = useState(Boolean(base?.super_tiebreak ?? detail.super_tiebreak))
  const [problem, setProblem] = useState('')
  const tennis = detail.sport === 'tenis'
  const [last] = useState(() => toDateKey(new Date(Date.now() + MAX_DAYS_AHEAD * 86_400_000)))

  function submit() {
    if (busy) return
    const issue = termsError(date, time, court)
    setProblem(issue ?? '')
    const startsAt = combineDateTime(date, time)
    if (issue || !startsAt || !court) return
    onSubmit({ starts_at: startsAt, court_id: court.id, booking_side: booking, ...(tennis ? { super_tiebreak: tiebreak } : {}) })
  }

  return <Sheet title="Propor condições" onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12 }}>{sides.map(side => sideName(side)).join(' × ')}</Text>
    <FieldLabel>Data</FieldLabel>
    <DateField label="Data" value={date} onChange={setDate} max={last} invalid={Boolean(problem) && !date} />
    <FieldLabel>Horário</FieldLabel>
    <TimeField label="Horário" value={time} onChange={setTime} stepMinutes={STEP_MINUTES} invalid={Boolean(problem) && !time} />

    <CourtPicker detail={detail} selected={court} onSelect={setCourt} canSuggest={detail.permissions.suggest_court} onExpired={onExpired} />

    <FieldLabel>Quem reserva com o local</FieldLabel>
    <ChoicePills<Side> label="Quem reserva com o local" value={booking} onChange={setBooking} options={sides.map(side => ({ value: side.side, label: sideName(side) }))} />
    <Hint>{nameOf(detail, booking)} reserva com o local e confirma aqui. O Arena só registra a situação da reserva.</Hint>

    {tennis ? <View style={{ marginTop: 10 }}>
      <SwitchRow label="Super tie-break" hint="Vale no lugar do 3º set, até 10 pontos." accessibilityLabel="Super tie-break no lugar do 3º set" checked={tiebreak} onChange={setTiebreak} />
    </View> : null}

    <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginTop: 1 }}><Icon name="calendar-check" size={15} color={colors['ink-muted']} /></View>
      <Text style={{ flex: 1, color: colors['ink-muted'], fontSize: 10.5, lineHeight: 16 }}>Quem propõe já aceita. A partida só é agendada quando o outro lado também aceitar estas condições.</Text>
    </View>

    {problem || error ? <ErrorText>{problem || error}</ErrorText> : null}
    <BusyStatus text={busy ? 'Enviando a proposta…' : ''} />
    <View style={{ marginTop: 14 }}>
      <ActionButton block tone="brand" icon="send" title={busy ? 'Enviando…' : 'Enviar proposta'} accessibilityLabel="Enviar proposta" busy={busy} onPress={submit} />
    </View>
  </Sheet>
}

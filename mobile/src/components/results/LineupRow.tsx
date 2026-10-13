import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { Position } from '../../api/client'
import { contestStat, reviewStat } from '../../api/results'
import type { Lineup, StatField, StatReviewInput } from '../../api/results'
import { useSubmit } from '../../hooks/useSubmit'
import { useThemeColors } from '../../hooks/useTheme'
import type { ThemeColors } from '../../theme'
import { StateBadge } from '../arena/StateBadge'
import { ActionButton, ChoicePills, ErrorText, FormField, MultiPills } from '../arena/controls'
import { Icon } from '../Icon'
import { Avatar } from '../media'
import { toast } from '../toast/toastStore'
import { positionAbbreviation, positionStat, statFieldLabel, statFields, statSummary } from './format'
import { Stepper } from './Stepper'
import { Muted, positionChoices } from './ui'

/*
 * Uma pessoa do elenco no "Revisar elenco": presença, posição e as estatísticas enviadas, com as ações do representante
 * (RN10): revisar as do próprio time, corrigindo o que estiver errado, ou contestar itens do adversário, com motivo (uma
 * vez por estatística). Um item contestado só pontua depois da nova revisão do representante do atleta, que é final.
 */
const stateText = { enviada: 'Enviada', revisada: 'Revisada', contestada: 'Contestada' } as const
const stateTone = { enviada: 'draft', revisada: 'open', contestada: 'pending' } as const
const REASON = { min: 5, max: 300 }

export interface LineupAttendance { present: boolean; position: Position | null }

export function LineupRow({ matchId, lineup, attendance, onAttendance, onUpdated, onExpired, token }: {
  matchId: number
  lineup: Lineup
  /** Rascunho da presença deste atleta (só quando o representante registra a presença do próprio lado). */
  attendance?: LineupAttendance
  onAttendance?: (change: LineupAttendance) => void
  onUpdated: (lineup: Lineup) => void
  onExpired: () => void
  /** Token da sessão para a foto; sem ele (ou nulo), as iniciais. */
  token?: string | null
}) {
  const colors = useThemeColors()
  const [panel, setPanel] = useState<'review' | 'contest' | null>(null)
  const { user, stat } = lineup
  // Com a presença em edição, quem ainda não foi informado só vira "Jogou" quando é marcado.
  const present = attendance ? (attendance.present ? true : lineup.present === null ? null : false) : lineup.present
  const position = attendance ? attendance.position : lineup.position
  const contested = stat?.contested_at != null
  const label = present === true ? 'Jogou' : present === false ? 'Não jogou' : 'Presença não informada'

  return <View testID={`lineup-${user.id}`} style={{ gap: 8, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Avatar path={user.avatar_url} name={user.name} token={token ?? null} size={32} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{user.name}</Text>
          {lineup.guest ? <StateBadge tone="closed">Avulso</StateBadge> : null}
        </View>
        <Text style={{ marginTop: 2, color: colors['ink-muted'], fontSize: 10.5 }}>
          {position ? `${positionAbbreviation[position]} · ` : ''}{present === false ? label : `${label} · ${statSummary(lineup)}`}
        </Text>
      </View>
      {attendance && onAttendance
        ? <Pressable accessibilityRole="checkbox" accessibilityLabel={`${user.name} jogou`} accessibilityState={{ checked: attendance.present }}
          onPress={() => onAttendance({ ...attendance, present: !attendance.present })} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1.5, borderColor: attendance.present ? colors.brand : colors['line-strong'], backgroundColor: attendance.present ? colors.brand : colors.surface }}>
            {attendance.present ? <Icon name="check" size={15} color={colors['on-brand']} strokeWidth={3} /> : null}
          </View>
        </Pressable>
        : null}
    </View>

    {attendance && onAttendance && attendance.present && !lineup.position
      ? <ChoicePills label={`Posição de ${user.name}`} options={positionChoices} value={attendance.position} onChange={value => onAttendance({ ...attendance, position: value })} />
      : null}

    {stat?.state === 'contestada'
      ? <View style={{ borderRadius: 10, backgroundColor: colors['warning-bg'], padding: 9 }}>
        <Muted tone="warning">
          {stat.contested_by?.name ?? 'O representante adversário'} contestou{stat.contested_fields?.length ? ` ${stat.contested_fields.map(field => statFieldLabel(field, lineup.position).toLowerCase()).join(', ')}` : ''}
          {stat.contest_reason ? `: “${stat.contest_reason}”` : '.'} O item contestado só pontua depois da nova revisão do representante do atleta.
        </Muted>
      </View>
      : null}
    {stat?.state === 'revisada' && contested ? <Muted>Revisão final depois da contestação.</Muted> : null}

    {(stat || lineup.can_review || lineup.can_contest) && !panel
      ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {stat ? <StateBadge tone={stateTone[stat.state]}>{stateText[stat.state]}</StateBadge> : null}
        {lineup.can_review
          ? <ActionButton tone="outline" size="sm" fit title={stat?.state === 'contestada' ? 'Revisar de novo' : stat?.state === 'revisada' ? 'Rever' : 'Revisar'}
            accessibilityLabel={`${stat?.state === 'contestada' ? 'Revisar de novo' : stat?.state === 'revisada' ? 'Rever' : 'Revisar'} estatísticas de ${user.name}`} onPress={() => setPanel('review')} />
          : null}
        {lineup.can_contest ? <ActionButton tone="outline" size="sm" fit title="Contestar" accessibilityLabel={`Contestar estatísticas de ${user.name}`} onPress={() => setPanel('contest')} /> : null}
      </View>
      : null}
    {panel === 'review' && stat
      ? <ReviewPanel matchId={matchId} lineup={lineup} onClose={() => setPanel(null)}
        onDone={updated => { setPanel(null); onUpdated(updated); toast.success('Estatísticas revisadas') }} onExpired={onExpired} />
      : null}
    {panel === 'contest' && stat
      ? <ContestPanel matchId={matchId} lineup={lineup} onClose={() => setPanel(null)}
        onDone={updated => { setPanel(null); onUpdated(updated); toast.success('Contestação enviada') }} onExpired={onExpired} />
      : null}
  </View>
}

const panelBoxOf = (c: ThemeColors) => ({ gap: 10, borderRadius: 12, backgroundColor: c.subtle, padding: 10 }) as const

function ReviewPanel({ matchId, lineup, onClose, onDone, onExpired }: {
  matchId: number
  lineup: Lineup
  onClose: () => void
  onDone: (lineup: Lineup) => void
  onExpired: () => void
}) {
  const colors = useThemeColors()
  const stat = lineup.stat!
  const [position, setPosition] = useState<Position | null>(lineup.position)
  const [goals, setGoals] = useState(stat.goals ?? 0)
  const [assists, setAssists] = useState(stat.assists ?? 0)
  const [extra, setExtra] = useState(stat.position_stat ?? 0)
  const { busy, error, run } = useSubmit(onExpired)
  const name = lineup.user.name
  const extraLabel = position ? positionStat[position].label : 'Estatística da posição'

  async function approve() {
    // Só o que mudou vai como correção; zero vira campo vazio, que não soma nem tira pontos.
    const changes: StatReviewInput = {}
    if (position && position !== lineup.position) changes.position = position
    if (goals !== (stat.goals ?? 0)) changes.goals = goals || null
    if (assists !== (stat.assists ?? 0)) changes.assists = assists || null
    if (extra !== (stat.position_stat ?? 0)) changes.position_stat = extra || null
    const updated = await run(() => reviewStat(matchId, stat.id, changes), 'Não foi possível revisar as estatísticas.')
    if (updated) onDone(updated)
  }

  return <View accessibilityLabel={`Revisar estatísticas de ${name}`} style={panelBoxOf(colors)}>
    <ChoicePills label={`Posição em que ${name} jogou`} options={positionChoices} value={position} onChange={setPosition} disabled={busy} />
    {([['Gols', goals, setGoals], ['Assistências', assists, setAssists], [extraLabel, extra, setExtra]] as const).map(([title, value, set]) => (
      <View key={title} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ flex: 1, minWidth: 0, color: colors.ink, fontSize: 12, fontWeight: '600' }}>{title}</Text>
        <Stepper label={`${title} de ${name}`} value={value} max={50} disabled={busy} onChange={set} />
      </View>
    ))}
    {stat.state === 'contestada' ? <Muted>Depois de uma contestação, esta revisão é final.</Muted> : null}
    {error ? <ErrorText>{error}</ErrorText> : null}
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <ActionButton tone="outline" size="sm" title="Cancelar" accessibilityLabel={`Cancelar a revisão de ${name}`} disabled={busy} onPress={onClose} grow />
      <ActionButton tone="brand" size="sm" title={busy ? 'Salvando…' : 'Aprovar'} accessibilityLabel={`Aprovar estatísticas de ${name}`} busy={busy} disabled={!position} onPress={() => void approve()} grow />
    </View>
  </View>
}

function ContestPanel({ matchId, lineup, onClose, onDone, onExpired }: {
  matchId: number
  lineup: Lineup
  onClose: () => void
  onDone: (lineup: Lineup) => void
  onExpired: () => void
}) {
  const colors = useThemeColors()
  const stat = lineup.stat!
  const [fields, setFields] = useState<StatField[]>([])
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const { busy, error, run } = useSubmit(onExpired)
  const text = reason.trim()
  const invalid = !fields.length || text.length < REASON.min || text.length > REASON.max
  const value = (field: StatField) => (field === 'gols' ? stat.goals : field === 'assistencias' ? stat.assists : stat.position_stat) ?? 0
  const choices = statFields.map(field => ({ value: field, label: `${statFieldLabel(field, lineup.position)}: ${value(field)}` }))

  async function send() {
    setTouched(true)
    if (invalid) return
    const updated = await run(() => contestStat(matchId, stat.id, { fields, reason: text }), 'Não foi possível enviar a contestação.')
    if (updated) onDone(updated)
  }
  const problem = touched && invalid && !error ? (fields.length ? 'Conte por que a estatística está errada.' : 'Escolha o que está errado.') : ''

  return <View accessibilityLabel={`Contestar estatísticas de ${lineup.user.name}`} style={panelBoxOf(colors)}>
    <Text style={{ color: colors.ink, fontSize: 11.5, fontWeight: '700' }}>O que está errado? <Text style={{ fontWeight: '400', color: colors['ink-muted'] }}>(cada estatística só pode ser contestada uma vez)</Text></Text>
    <MultiPills label="O que está errado" options={choices} values={fields} onChange={setFields} />
    <FormField label="Motivo" multiline maxLength={REASON.max} value={reason} onChangeText={setReason} editable={!busy} placeholder="Ex.: ele não fez dois gols, foi um só."
      hint={`Mínimo de ${REASON.min} caracteres. ${reason.length}/${REASON.max}`} />
    {problem ? <ErrorText>{problem}</ErrorText> : null}
    {error ? <ErrorText>{error}</ErrorText> : null}
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <ActionButton tone="outline" size="sm" title="Cancelar" accessibilityLabel={`Cancelar a contestação de ${lineup.user.name}`} disabled={busy} onPress={onClose} grow />
      <ActionButton tone="brand" size="sm" title={busy ? 'Enviando…' : 'Enviar contestação'} accessibilityLabel="Enviar contestação" busy={busy} onPress={() => void send()} grow />
    </View>
  </View>
}

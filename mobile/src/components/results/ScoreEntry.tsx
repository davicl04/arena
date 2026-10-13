import { useState } from 'react'
import { Text, View, useWindowDimensions } from 'react-native'
import type { ResultInput, ResultMatch } from '../../api/results'
import type { MatchSideOut, ScoreOut } from '../../api/matches'
import { sideName, sideOf } from '../../data/match'
import { colors } from '../../theme'
import { TeamCrest } from '../arena/TeamCrest'
import { ActionButton, ErrorText } from '../arena/controls'
import { otherSide, viewSide } from './format'
import { Stepper } from './Stepper'
import { TennisSets } from './TennisSets'
import { draftToInput, emptySets, reportToDraft, validateTennisSets } from './tennis'
import type { SetDraft } from './tennis'
import { CardTitle, Muted, ResultCard } from './ui'

/*
 * "Informe o placar" (R4): no futebol, −/+ por lado, com o meu lado à esquerda; no tênis, os sets com o tie-break em 7-6 e
 * o terceiro set (ou o super tie-break combinado) só quando os dois primeiros foram divididos. O tênis confere o placar
 * como o servidor antes de enviar. Os botões são "Revisar elenco" (futebol) e "Enviar placar"; ao corrigir o meu placar
 * entra "Cancelar".
 */
export interface ScoreEntryProps {
  match: ResultMatch
  /** O placar que o meu lado já informou (corrigir o meu). */
  initial?: ScoreOut
  busy: boolean
  error: string
  /** "3/7 estatísticas": o andamento do elenco, só no futebol. */
  summary?: string
  /** Aviso sobre o outro lado ("Ferrugem FC já informou o placar"), sem revelar o placar dele. */
  notice?: string
  onRoster?: () => void
  onCancel?: () => void
  onSubmit: (input: ResultInput) => void
}

export function ScoreEntry({ match, initial, busy, error, summary, notice, onRoster, onCancel, onSubmit }: ScoreEntryProps) {
  const mySide = viewSide(match)
  const tennis = match.sport === 'tenis'
  const mine = sideOf(match, mySide)
  const theirs = sideOf(match, otherSide(mySide))
  const myName = tennis ? 'Você' : sideName(mine, 'Seu time')
  const theirName = sideName(theirs)
  const [goals, setGoals] = useState<[number, number]>(() => {
    const own = mySide === 'a'
    return initial && !tennis ? (own ? [initial.a, initial.b] : [initial.b, initial.a]) : [0, 0]
  })
  const [sets, setSets] = useState<SetDraft[]>(() => (tennis && initial ? reportToDraft(initial, mySide) : emptySets()))
  const [attempted, setAttempted] = useState(false)
  const compact = useWindowDimensions().width < 360
  const superTiebreak = Boolean(match.super_tiebreak)
  const input = tennis ? draftToInput(sets, mySide, superTiebreak) : []
  const problem = tennis ? validateTennisSets(input, superTiebreak) : null

  function submit() {
    if (problem) {
      setAttempted(true)
      return
    }
    onSubmit(tennis ? { sets: input }
      : mySide === 'a' ? { goals_a: goals[0], goals_b: goals[1] } : { goals_a: goals[1], goals_b: goals[0] })
  }
  const patch = (index: number, change: Partial<SetDraft>) =>
    setSets(old => old.map((set, at) => (at === index ? { ...set, ...change } : set)))
  const message = error || (attempted && problem) || ''

  return <ResultCard testID="score-entry">
    <CardTitle icon="flag" title={initial ? 'Corrigir o meu placar' : 'Informe o placar'} trailing={summary ? <Text style={{ textAlign: 'right', color: colors['ink-muted'], fontSize: 10.5 }}>{summary}</Text> : undefined} />
    {notice ? <Muted>{notice}</Muted> : null}

    {tennis
      ? <TennisSets sets={sets} onPatch={patch} mineName={myName} theirName={theirName} superTiebreak={superTiebreak} disabled={busy} />
      : <View accessibilityLabel="Placar em gols" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <GoalsSide side={mine} name={myName} value={goals[0]} disabled={busy} compact={compact} onChange={value => setGoals(old => [value, old[1]])} />
        <Text accessibilityElementsHidden importantForAccessibility="no" style={{ paddingBottom: 10, color: colors['ink-muted'], fontSize: 20, fontWeight: '800' }}>×</Text>
        <GoalsSide side={theirs} name={theirName} value={goals[1]} disabled={busy} compact={compact} onChange={value => setGoals(old => [old[0], value])} />
      </View>}

    {message ? <ErrorText>{message}</ErrorText> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {onRoster && !initial ? <ActionButton tone="outline" icon="users" title="Revisar elenco" disabled={busy} onPress={onRoster} grow /> : null}
      {onCancel ? <ActionButton tone="outline" title="Cancelar" disabled={busy} onPress={onCancel} grow /> : null}
      <ActionButton tone="brand" title={busy ? 'Enviando…' : initial ? 'Enviar correção' : 'Enviar placar'} accessibilityLabel={initial ? 'Enviar correção' : 'Enviar placar'} busy={busy} onPress={submit} grow />
    </View>
  </ResultCard>
}

/** Um lado do placar do futebol: brasão, nome e o contador de gols (30 pt; 18 pt em telas estreitas, para caber em 320 pt). */
function GoalsSide({ side, name, value, disabled, compact, onChange }: {
  side: MatchSideOut | undefined
  name: string
  value: number
  disabled: boolean
  compact: boolean
  onChange: (value: number) => void
}) {
  return <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 6 }}>
    <TeamCrest name={name} initials={side?.team?.initials} path={side?.team?.crest_url} size="md" decorative />
    <Text numberOfLines={1} style={{ maxWidth: '100%', color: colors.ink, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>{name}</Text>
    <Stepper size={compact ? 'md' : 'lg'} label={`Gols do ${name}`} value={value} disabled={disabled} onChange={onChange} />
  </View>
}

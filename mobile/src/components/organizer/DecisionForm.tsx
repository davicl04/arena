import { useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { JUSTIFICATION_MAX, JUSTIFICATION_MIN } from '../../api/brackets'
import type { ResultDecisionInput } from '../../api/brackets'
import type { MatchDetail, ScoreOut, Side } from '../../api/matches'
import { sideName, sideOf } from '../../data/match'
import { useThemeColors } from '../../hooks/useTheme'
import { ActionButton, BusyStatus, ErrorText, FormField } from '../arena/controls'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import { TeamMark } from '../match/TeamMark'
import { scoreText, walkoverScoreText } from '../results/format'
import { Stepper } from '../results/Stepper'
import { TennisSets } from '../results/TennisSets'
import { draftToInput, emptySets, validateTennisSets } from '../results/tennis'
import type { SetDraft } from '../results/tennis'

export type DecisionMode = 'a' | 'b' | 'outro' | 'wo'

/** O placar informado por um lado, no formato do corpo da decisão. */
export function reportToInput(sport: MatchDetail['sport'], score: ScoreOut): NonNullable<ResultDecisionInput['score']> {
  if (sport === 'futebol') return { goals_a: score.a, goals_b: score.b }
  return { sets: (score.sets ?? []).map(set => ({ a: set.a, b: set.b, ...(set.tiebreak ? { tiebreak: set.tiebreak } : {}) })) }
}

/** Justificativa válida: de 5 a 500 caracteres depois de aparar. */
export const justificationOk = (note: string) => note.trim().length >= JUSTIFICATION_MIN && note.trim().length <= JUSTIFICATION_MAX

/** Um lado do placar do futebol: a marca, o nome e o contador de gols. */
function GoalsSide({ match, side, name, value, disabled, onChange }: {
  match: MatchDetail; side: Side; name: string; value: number; disabled: boolean; onChange: (value: number) => void
}) {
  const colors = useThemeColors()
  const info = sideOf(match, side)
  return <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 4 }}>
    {info ? <TeamMark side={info} /> : null}
    <Text numberOfLines={1} style={{ width: '100%', textAlign: 'center', color: colors.ink, fontSize: 12, fontWeight: '700' }}>{name}</Text>
    <Stepper size="lg" label={`Gols do ${name}`} value={value} disabled={disabled} onChange={onChange} />
  </View>
}

interface Choice<T extends string> { value: T; label: string; icon?: IconName; caption?: string; /** Placar informado: o texto em destaque, com "Escolhido" quando marcado. */ big?: boolean; accessibilityLabel: string }

/** Escolha de uma opção entre cartões: grupo de rádio com a escolhida marcada (`accessibilityState.checked`). */
function ChoiceCards<T extends string>({ label, items, value, disabled, onChange }: {
  label: string
  items: readonly Choice<T>[]
  value: T | null
  disabled: boolean
  onChange: (value: T) => void
}) {
  const colors = useThemeColors()
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
    {items.map(item => {
      const checked = item.value === value
      return <Pressable key={item.value} accessibilityRole="radio" accessibilityLabel={item.accessibilityLabel} accessibilityState={{ checked, selected: checked, disabled }}
        disabled={disabled} onPress={() => onChange(item.value)}
        style={{ flexBasis: '47%', flexGrow: 1, minHeight: 78, minWidth: 130, gap: 2, borderRadius: 14, borderWidth: 1.5, borderColor: checked ? colors.brand : colors['line-strong'], backgroundColor: checked ? colors['success-bg'] : colors.surface, padding: 10, opacity: disabled ? 0.6 : 1 }}>
        {item.icon ? <Icon name={item.icon} size={16} color={colors.brand} /> : null}
        {item.caption ? <Text style={{ color: colors['ink-muted'], fontSize: 10 }}>{item.caption}</Text> : null}
        <Text style={item.big ? { color: colors.ink, fontSize: 20, fontWeight: '800' } : { color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{item.label}</Text>
        {checked && item.big ? <Text style={{ color: colors.brand, fontSize: 10.5, fontWeight: '700' }}>Escolhido</Text> : null}
      </Pressable>
    })}
  </View>
}

const h2 = (color: string) => ({ color, fontSize: 15, fontWeight: '700' }) as const

/**
 * Decisão do organizador (D3): o placar informado por um dos times, outro placar (contadores no futebol, sets no tênis) ou
 * W.O. (o lado ausente), e a justificativa obrigatória (5 a 500 caracteres), registrada e visível aos dois times. O servidor
 * decide se vale: na eliminação não há empate, e a mensagem dele sai em toast (ou junto ao campo, se nomear um) sem fechar o formulário.
 */
export function DecisionForm({ match, busy, error, onSubmit }: {
  match: MatchDetail
  busy: boolean
  /** Recusa do servidor que fica no formulário (`422` com campos): as demais falhas de ação saem em toast. */
  error: string
  onSubmit: (input: ResultDecisionInput) => void
}) {
  const colors = useThemeColors()
  const tennis = match.sport === 'tenis'
  const sides = ['a', 'b'] as const
  const nameA = sideName(sideOf(match, 'a'), 'Lado A')
  const nameB = sideName(sideOf(match, 'b'), 'Lado B')
  const names: Record<Side, string> = { a: nameA, b: nameB }
  const reports = match.result?.reports
  const reported = sides.filter(key => reports?.[key]?.score)
  const [mode, setMode] = useState<DecisionMode | null>(reported.length === 1 ? reported[0] : null)
  const [goals, setGoals] = useState<[number, number]>([0, 0])
  const [sets, setSets] = useState<SetDraft[]>(emptySets)
  const [absent, setAbsent] = useState<Side | null>(null)
  const [note, setNote] = useState('')
  const [attempted, setAttempted] = useState(false)
  const superTiebreak = Boolean(match.super_tiebreak)

  const trimmed = note.trim()
  const noteOk = justificationOk(note)
  const sets3 = tennis && mode === 'outro' ? draftToInput(sets, 'a', superTiebreak) : []
  const tennisProblem = tennis && mode === 'outro' ? validateTennisSets(sets3, superTiebreak) : null

  let summary = 'decisão'
  let score: ScoreOut | null = null
  if (mode === 'a' || mode === 'b') {
    score = reports?.[mode]?.score ?? null
    summary = score ? scoreText(match.sport, score, 'a') : 'decisão'
  } else if (mode === 'outro') summary = tennis ? 'o placar' : `${goals[0]} × ${goals[1]}`
  else if (mode === 'wo') summary = absent ? `W.O. de ${names[absent]}` : 'W.O.'

  const ready = mode !== null && noteOk && (mode !== 'wo' || absent !== null) && !tennisProblem
  const problem = mode === null ? 'Escolha o placar ou o W.O.'
    : mode === 'wo' && !absent ? 'Escolha o lado que não compareceu.'
    : tennisProblem ?? (!noteOk ? `Escreva a justificativa, de ${JUSTIFICATION_MIN} a ${JUSTIFICATION_MAX} caracteres.` : null)

  function submit() {
    if (busy) return
    if (!ready || mode === null) { setAttempted(true); return }
    const justification = trimmed
    if (mode === 'wo') return onSubmit({ walkover_absent_side: absent, justification })
    if (mode === 'outro') return onSubmit({ score: tennis ? { sets: sets3 } : { goals_a: goals[0], goals_b: goals[1] }, justification })
    if (score) onSubmit({ score: reportToInput(match.sport, score), justification })
  }
  const patch = (index: number, change: Partial<SetDraft>) => setSets(old => old.map((set, at) => (at === index ? { ...set, ...change } : set)))

  const items: Choice<DecisionMode>[] = [
    ...reported.map((key): Choice<DecisionMode> => {
      const text = reports?.[key]?.score ? scoreText(match.sport, reports[key]!.score!, 'a') : ''
      return { value: key, label: text, caption: `Informado por ${names[key]}`, big: true, accessibilityLabel: `Placar informado por ${names[key]}: ${text}` }
    }),
    { value: 'outro', label: 'Outro placar', icon: 'pencil', caption: tennis ? 'Informe os sets' : 'Informe os gols', accessibilityLabel: 'Outro placar' },
    { value: 'wo', label: 'W.O.', icon: 'user-minus', caption: 'Um lado não compareceu', accessibilityLabel: 'W.O., um lado não compareceu' },
  ]
  const noteBox: ReactNode = <FormField label="Justificativa (obrigatória)" value={note} onChangeText={setNote} multiline editable={!busy} maxLength={JUSTIFICATION_MAX + 200}
    placeholder="Ex.: o vídeo mostra o gol antes do apito final." hint={`Fica registrada e os dois times veem. ${trimmed.length}/${JUSTIFICATION_MAX}`} />

  return <View testID="decision-form" accessibilityLabel="Sua decisão" style={{ gap: 14 }}>
    <Text accessibilityRole="header" style={h2(colors.ink)}>Sua decisão</Text>

    <ChoiceCards<DecisionMode> label="Como decidir o resultado" items={items} value={mode} disabled={busy} onChange={setMode} />

    {mode === 'outro' ? (tennis
      ? <View style={{ borderRadius: 16, backgroundColor: colors.surface, padding: 12 }}><TennisSets sets={sets} onPatch={patch} mineName={nameA} theirName={nameB} superTiebreak={superTiebreak} disabled={busy} /></View>
      : <View accessibilityLabel="Placar em gols" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderRadius: 16, backgroundColor: colors.surface, padding: 12 }}>
        <GoalsSide match={match} side="a" name={nameA} value={goals[0]} disabled={busy} onChange={value => setGoals(old => [value, old[1]])} />
        <Text accessibilityElementsHidden importantForAccessibility="no" style={{ paddingBottom: 12, color: colors['ink-muted'], fontSize: 20, fontWeight: '800' }}>×</Text>
        <GoalsSide match={match} side="b" name={nameB} value={goals[1]} disabled={busy} onChange={value => setGoals(old => [old[0], value])} />
      </View>) : null}

    {mode === 'wo' ? <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 12, fontWeight: '700' }}>Quem não compareceu?</Text>
      <ChoiceCards<Side> label="Lado ausente" value={absent} disabled={busy} onChange={setAbsent}
        items={sides.map(key => ({ value: key, label: names[key], caption: 'Ausente', accessibilityLabel: `Ausente: ${names[key]}` }))} />
      <Text style={{ color: colors['ink-muted'], fontSize: 10.5, lineHeight: 16 }}>
        {`O lado presente vence por ${walkoverScoreText(match.sport)}. Sem restrição automática: o W.O. fica no histórico.`}
      </Text>
    </View> : null}

    {noteBox}

    <View accessibilityLiveRegion="polite">
      {error ? <ErrorText>{error}</ErrorText> : null}
      {attempted && problem && !error ? <ErrorText>{problem}</ErrorText> : null}
    </View>
    <BusyStatus text={busy ? 'Registrando a decisão…' : ''} />

    <ActionButton block tone="brand" icon="check" title={busy ? 'Registrando…' : `Registrar ${summary}`} busy={busy} onPress={submit} />
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <View style={{ marginTop: 1 }}><Icon name="info" size={15} color={colors.brand} /></View>
      <Text style={{ flex: 1, minWidth: 0, color: colors['ink-muted'], fontSize: 10.5, lineHeight: 16 }}>
        O resultado entra na tabela e no ranking, a partida é encerrada e os dois elencos são avisados. A decisão fica no histórico da partida.
      </Text>
    </View>
  </View>
}

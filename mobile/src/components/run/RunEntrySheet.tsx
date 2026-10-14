import { useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { ApiError } from '../../api/client'
import { createRun, getRunRaces, previewRun } from '../../api/runs'
import type { RunCreated, RunInput, RunPreview, RunRace, RunSource } from '../../api/runs'
import { runDistances } from '../../data/arena'
import type { RunDistance } from '../../data/arena'
import { useResource } from '../../hooks/useResource'
import { reportActionError } from '../../hooks/useSubmit'
import { colors } from '../../theme'
import { toDateKey } from '../../utils/dateKey'
import { Icon } from '../Icon'
import { Screen } from '../Screen'
import { ToastViewport } from '../toast/ToastViewport'
import { DateField } from '../arena/DateField'
import { ActionButton, ChoicePills, FieldError, FieldLabel, FormField, Hint, Notice } from '../arena/controls'
import type { ChoiceOption } from '../arena/controls'
import { MAX_DISTANCE_M, MIN_DISTANCE_M, WINDOW_DAYS, formatKm, formatPace, impactView, paceOf, standardMeters, toSeconds } from '../play/runView'
import type { HmsParts } from '../play/runView'
import { PreviewHint, RunPreviewCard } from './RunPreviewCard'
import { RunRaces } from './RunRaces'
import { RunTimeFields } from './RunTimeFields'

/** Espera depois da última mudança antes de pedir a prévia (cada toque numa seta não vira uma chamada). */
export const PREVIEW_DELAY_MS = 300

type Choice = RunDistance | 'outra'
const rulerItems: { value: Choice; label: string }[] = [
  ...runDistances.map(item => ({ value: item.value as Choice, label: item.label })),
  { value: 'outra', label: 'Outra' },
]
const sourceOptions: ChoiceOption<RunSource>[] = [
  { value: 'treino', label: 'Treino' },
  { value: 'prova', label: 'Prova do Arena' },
]
export const MEASURE_RANGE = 'A distância deve ficar entre 1 km e 100 km.'

/**
 * O que o servidor recusou, por campo (`422`), mais o que não pertence a um campo (a falha da prévia, que fica junto a ela).
 * `blocked`: repetir não adianta. O erro de salvar que não é de campo sai em toast e não passa por aqui.
 */
export interface Problems { distance_m?: string; duration_s?: string; date?: string; entry_id?: string; general?: string; blocked: boolean }
/** Resposta da prévia (ou do salvar) para as entradas identificadas por `key`. */
interface Outcome { key: string; preview?: RunPreview; problems?: Problems }

const fieldNames = ['distance_m', 'duration_s', 'date', 'entry_id'] as const
/** Erro da API → mensagem no campo certo (`ApiError.fields`); o que não é de um campo vira `general`. */
export function problemsOf(cause: unknown, fallback: string): Problems {
  if (!(cause instanceof ApiError)) return { general: fallback, blocked: false }
  // Sem conexão: o aviso de conexão cuida, sem mensagem local.
  if (cause.isConnection) return { blocked: false }
  const problems: Problems = { blocked: cause.status >= 400 && cause.status < 500 }
  const rest: string[] = []
  for (const item of cause.fields) {
    const name = fieldNames.find(field => field === item.field)
    if (name) problems[name] ??= item.message
    else rest.push(item.message)
  }
  if (!cause.fields.length) rest.push(cause.message || fallback)
  if (rest.length) problems.general = rest.join(' ')
  return problems
}

/** Distância da régua: o tique cresce e fica menta na escolhida. */
function RulerTick({ item, selected, onPress }: { item: { value: Choice; label: string }; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={item.label} accessibilityState={{ selected, checked: selected }} onPress={onPress}
    style={{ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: selected ? colors.mint : 'transparent', marginBottom: -2 }}>
    <View style={{ width: selected ? 3 : 2, height: selected ? 22 : 14, backgroundColor: selected ? colors.mint : 'rgba(255,255,255,0.25)' }} />
    <Text numberOfLines={1} style={{ color: selected ? colors.mint : 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '800' }}>{item.label}</Text>
  </Pressable>
}

/**
 * Registrar corrida (K2), em tela cheia escura: régua de distâncias (3, 5, 10, 21, 42 km e "Outra" com metros), tempo em
 * h : min : s com setas, o ritmo ao vivo, Treino | Prova do Arena, a data e a prévia do que a marca faz com o ranking
 * (`POST /me/runs/preview`, a cada mudança, com espera de 300 ms). "Salvar corrida" grava (`POST /me/runs`); o servidor
 * decide tudo e os erros voltam no campo certo (`ApiError.fields`). Fechar sai sem gravar.
 *
 * Datas: o formulário usa o dia do **aparelho** (o calendário vai de hoje − 364 dias até hoje) e o servidor decide pelo dia
 * de **Brasília**; perto da meia-noite, fora de Brasília, os limites podem diferir em um dia, e o `422` aparece no campo.
 */
export function RunEntrySheet({ initialDistance, onClose, onSaved, onFindRaces, onExpired }: {
  initialDistance: RunDistance
  onClose: () => void
  onSaved: (created: RunCreated) => void
  /** Abre a lista de provas (quando não há prova para registrar). */
  onFindRaces?: () => void
  onExpired: () => void
}) {
  const [choice, setChoice] = useState<Choice>(initialDistance)
  const [otherMeters, setOtherMeters] = useState('')
  const [time, setTime] = useState<HmsParts>({ h: 0, m: 0, s: 0 })
  const [source, setSource] = useState<RunSource>('treino')
  const [raceId, setRaceId] = useState<number | null>(null)
  const [today] = useState(() => new Date())
  const todayKey = toDateKey(today)
  const firstKey = toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - WINDOW_DAYS))
  const [date, setDate] = useState(todayKey)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [busy, setBusy] = useState(false)
  // Dois toques no mesmo instante: o estado `busy` ainda não chegou à tela, mas o segundo já encontra o envio em curso.
  const saving = useRef(false)

  const races = useResource(getRunRaces, onExpired, { enabled: source === 'prova', fallback: 'Não foi possível carregar suas provas.' })
  const raceList: RunRace[] = races.data?.items ?? []
  const race = raceList.find(item => item.entry_id === raceId)

  const meters = choice === 'outra' ? Number(otherMeters) : standardMeters[choice]
  const metersOk = Number.isInteger(meters) && meters >= MIN_DISTANCE_M && meters <= MAX_DISTANCE_M
  const durationS = toSeconds(time)
  const hasRace = Boolean(race)
  const input = useMemo<RunInput | null>(() => {
    if (!metersOk || durationS <= 0) return null
    if (source === 'treino') return { distance_m: meters, duration_s: durationS, source, date }
    return hasRace ? { distance_m: meters, duration_s: durationS, source, entry_id: raceId } : null
  }, [metersOk, meters, durationS, source, date, hasRace, raceId])
  const key = useMemo(() => JSON.stringify(input), [input])

  useEffect(() => {
    if (!input) return
    let current = true
    const timer = setTimeout(() => {
      previewRun(input).then(preview => { if (current) setOutcome({ key, preview }) }, (cause: unknown) => {
        if (!current) return
        if (cause instanceof ApiError && cause.status === 401) onExpired()
        setOutcome({ key, problems: problemsOf(cause, 'Não foi possível calcular a prévia.') })
      })
    }, PREVIEW_DELAY_MS)
    return () => { current = false; clearTimeout(timer) }
  }, [input, key, onExpired])

  async function save() {
    if (!input || saving.current) return
    saving.current = true
    setBusy(true)
    try {
      onSaved(await createRun(input))
    } catch (cause) {
      // Só a recusa de campo (`422`) fica na tela; o resto vira toast (ou o aviso de conexão) e o botão segue disponível.
      const report = reportActionError(cause, 'Não foi possível salvar a corrida.', onExpired)
      if (report.kind === 'form') setOutcome(old => ({ key, preview: old?.key === key ? old.preview : undefined, problems: problemsOf(cause, 'Não foi possível salvar a corrida.') }))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  const current = input && outcome?.key === key ? outcome : null
  const fresh = Boolean(current)
  const problems = current?.problems
  const preview = input ? outcome?.preview : undefined
  const pace = (fresh && preview ? preview.pace_s_per_km : null) ?? (metersOk ? paceOf(durationS, meters) : null)
  const distanceText = preview ? (preview.standard_distance_km ? `${preview.standard_distance_km} km` : formatKm(preview.distance_m)) : ''
  const view = preview ? impactView(preview.impact, distanceText) : null
  const distanceProblem = choice === 'outra' && otherMeters !== '' && !metersOk ? MEASURE_RANGE : problems?.distance_m
  const hint = input ? (problems ? '' : 'Calculando o efeito no seu ranking…')
    : durationS <= 0 ? 'Informe o tempo para ver o que ele muda no seu ranking.'
      : !metersOk ? 'Informe a distância em metros.'
        : 'Escolha a prova para ver o efeito no seu ranking.'

  function pickRace(next: RunRace) {
    setRaceId(next.entry_id)
    setChoice(next.distance_km)
  }

  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy) onClose() }}>
    <Screen className="grow basis-0 bg-forest">
      <KeyboardAvoidingView className="grow basis-0" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingTop: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onClose}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={22} color="#ffffff" />
          </Pressable>
          <Text accessibilityRole="header" style={{ color: '#ffffff', fontSize: 15, fontWeight: '800' }}>Registrar corrida</Text>
          <View style={{ width: 44 }} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 20 }}>
          <View accessibilityRole="radiogroup" accessibilityLabel="Distância" style={{ flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: 'rgba(255,255,255,0.15)' }}>
            {rulerItems.map(item => <RulerTick key={String(item.value)} item={item} selected={choice === item.value} onPress={() => setChoice(item.value)} />)}
          </View>
          {choice === 'outra'
            ? <FormField surface="dark" label="Distância em metros" placeholder="7000" keyboardType="number-pad" inputMode="numeric" autoComplete="off" value={otherMeters}
              onChangeText={text => setOtherMeters(text.replace(/\D/g, '').slice(0, 6))} error={distanceProblem}
              hint={`${metersOk ? `${formatKm(meters)}. ` : ''}De 1 000 a 100 000 m. Fora de 3, 5, 10, 21 e 42 km (com 2% de tolerância), a marca fica só no histórico.`} />
            : <FieldError error={distanceProblem} surface="dark" />}

          <View style={{ marginTop: 24 }}><RunTimeFields value={time} onChange={setTime} invalid={Boolean(problems?.duration_s)} /></View>
          <FieldError error={problems?.duration_s} surface="dark" />
          <View accessible accessibilityLabel={pace ? `Ritmo ${formatPace(pace)}` : 'Ritmo indisponível'} style={{ marginTop: 14, alignItems: 'center' }}>
            <Text accessibilityElementsHidden importantForAccessibility="no" style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Ritmo</Text>
            <Text testID="run-pace" accessibilityElementsHidden importantForAccessibility="no" style={{ color: colors.mint, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{pace ? formatPace(pace) : '—'}</Text>
          </View>

          <View style={{ marginTop: 18 }}>
            <ChoicePills tone="dark" label="Origem da marca" options={sourceOptions} value={source} onChange={setSource} />
            {source === 'treino'
              ? <View>
                <FieldLabel surface="dark">Data</FieldLabel>
                <DateField tone="dark" label="Data" value={date} min={firstKey} max={todayKey} disablePast={false} now={today} invalid={Boolean(problems?.date)} onChange={setDate} />
                <FieldError error={problems?.date} surface="dark" />
                <Hint surface="dark">Treinos das últimas 52 semanas, até hoje.</Hint>
              </View>
              : <View>
                <FieldLabel surface="dark">Prova</FieldLabel>
                <RunRaces races={raceList} loading={races.loading} error={races.error} errorCause={races.errorCause} selected={race ? race.entry_id : null} onRetry={races.reload} onFind={onFindRaces} onSelect={pickRace} />
                <FieldError error={problems?.entry_id} surface="dark" />
                <FieldError error={problems?.date} surface="dark" />
                {raceList.length > 0 ? <Hint surface="dark">O dia da marca é o dia da prova.</Hint> : null}
              </View>}
          </View>

          <View accessibilityLiveRegion="polite" style={{ marginTop: 16, minHeight: 68 }}>
            {view ? <RunPreviewCard view={view} stale={!fresh} /> : hint ? <PreviewHint>{hint}</PreviewHint> : null}
          </View>
        </ScrollView>
        <View style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 18, backgroundColor: colors.forest }}>
          {problems?.general ? <Notice tone="error" surface="dark">{problems.general}</Notice> : null}
          <View style={{ marginTop: problems?.general ? 10 : 0 }}>
            <ActionButton block tone="mint" icon="check" title={busy ? 'Salvando…' : 'Salvar corrida'} busy={busy} disabled={!input || Boolean(problems?.blocked)} onPress={() => void save()} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
    <ToastViewport />
  </Modal>
}

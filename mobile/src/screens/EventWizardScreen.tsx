import { useCallback, useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { ApiError } from '../api/client'
import { createEvent, getOrganizerEvent, submitEvent, updateEvent } from '../api/events'
import type { OrganizerEventDetail } from '../api/events'
import { EventPoster } from '../components/arena/EventPoster'
import { ActionButton, Notice } from '../components/arena/controls'
import { StepBars } from '../components/arena/StepBars'
import {
  apiFormErrors, draftInput, emptyForm, FIELD_STEP, firstErrorField, firstIncompleteStep, formFromDetail, LAST_STEP, parseCapacity, parsePrice,
  startsAt, validateAll, validateDraft, validateStep, withCategory, WIZARD_STEPS,
} from '../components/organizer/eventForm'
import type { EventForm, FormErrors, FormField } from '../components/organizer/eventForm'
import { CapacityStep, NameStep, PriceStep, SportStep, WhenStep } from '../components/organizer/WizardSteps'
import type { CategoryChange } from '../components/organizer/WizardSteps'
import Sheet from '../components/Sheet'
import { Screen } from '../components/Screen'
import { useCities } from '../hooks/useCities'
import type { ScreenProps } from '../navigation/screens'
import { makeEntry } from '../navigation/routes'
import { colors } from '../theme'
import { Icon } from '../components/Icon'


type Busy = 'draft' | 'publish' | null

/**
 * Criar evento (V4): uma pergunta por vez em tela escura, com a prévia do cartaz abaixo. "Próxima" valida o passo e avança,
 * a seta volta; "Salvar rascunho" grava a qualquer momento (o servidor guarda o rascunho incompleto). No último passo, o
 * botão publica o gratuito ou envia o pago para a aprovação da administração. Com `eventId`, edita o rascunho, abrindo no
 * primeiro passo incompleto (ou em `step`). Erros da API voltam ao passo e ao campo certos. A tela ocupa o aparelho todo
 * (um `Modal`): o voltar do Android e o X perguntam antes de descartar o que não foi salvo.
 */
export default function EventWizardScreen({ params, navigation, onExpired }: ScreenProps<'event-wizard'>) {
  const eventId = params?.eventId
  const initialStep = params?.step
  const cities = useCities(onExpired)
  const [savedId, setSavedId] = useState<number | undefined>(eventId)
  const [loading, setLoading] = useState(Boolean(eventId))
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState<EventForm>(emptyForm)
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<FormErrors>({})
  const [general, setGeneral] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [dirty, setDirty] = useState(false)
  const [leaving, setLeaving] = useState(false)
  // Só o assistente no topo da pilha está montado: depois de desmontado, uma resposta tardia não navega (substituiria outra tela).
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if (!eventId) return
    let alive = true
    getOrganizerEvent(eventId).then(detail => {
      if (!alive) return
      if (detail.state !== 'rascunho') {
        setLoadError(detail.state === 'em_aprovacao' ? 'Retire o evento da aprovação para editar.' : 'Este evento não é mais um rascunho. Edite os dados pela gestão do evento.')
        return
      }
      const loaded = formFromDetail(detail)
      setForm(loaded)
      setStep(initialStep !== undefined ? Math.min(Math.max(initialStep, 0), LAST_STEP) : firstIncompleteStep(loaded))
    }).catch((cause: unknown) => {
      if (!alive) return
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setLoadError(cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar o rascunho.')
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [eventId, initialStep, onExpired])

  const update = useCallback((change: Partial<EventForm>) => {
    setForm(old => ({ ...old, ...change }))
    setDirty(true)
    setNotice('')
    setGeneral('')
    setErrors(old => {
      const keys = Object.keys(change) as FormField[]
      if (!keys.some(key => old[key])) return old
      const next = { ...old }
      for (const key of keys) delete next[key]
      return next
    })
  }, [])
  function category(change: CategoryChange) {
    setForm(old => withCategory(old, change))
    setDirty(true)
    setNotice('')
    setGeneral('')
    setErrors(old => {
      const next = { ...old }
      for (const key of ['sport', 'format', 'distanceKm', 'competitionType', 'capacity'] as FormField[]) delete next[key]
      return next
    })
  }
  /** Mostra os erros no passo do primeiro campo com erro. */
  function showErrors(found: FormErrors, message = '') {
    const first = firstErrorField(found)
    if (first) setStep(FIELD_STEP[first])
    setErrors(found)
    setGeneral(message)
  }

  function next() {
    if (step === LAST_STEP) return
    const found = validateStep(form, step)
    if (Object.keys(found).length) { showErrors(found, 'Revise o campo indicado.'); return }
    setErrors({}); setGeneral('')
    setStep(step + 1)
  }
  function previous() {
    setErrors({}); setGeneral('')
    setStep(Math.max(0, step - 1))
  }

  /** Cria ou atualiza o rascunho; erros vão para o passo do campo. Devolve o rascunho salvo. */
  async function persist(fallback: string): Promise<OrganizerEventDetail | null> {
    try {
      const body = draftInput(form)
      const detail = savedId ? await updateEvent(savedId, body) : await createEvent(body)
      setSavedId(detail.id)
      setDirty(false)
      return detail
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      const mapped = apiFormErrors(cause, form, fallback)
      if (mapped.step !== null) showErrors(mapped.errors, 'Revise o campo indicado.')
      else { setErrors({}); setGeneral(mapped.general) }
      return null
    }
  }

  async function saveDraft(): Promise<boolean> {
    setNotice('')
    const found = validateDraft(form)
    if (Object.keys(found).length) { showErrors(found, 'Revise o campo indicado.'); return false }
    setBusy('draft'); setGeneral('')
    const saved = await persist('Não foi possível salvar o rascunho.')
    setBusy(null)
    if (saved) {
      setErrors({})
      setNotice('Rascunho salvo. Ele fica em Meus eventos, com o checklist do que falta.')
    }
    return Boolean(saved)
  }

  async function publish() {
    setNotice('')
    const missing = validateAll(form)
    if (missing) { showErrors(missing.errors, 'Complete este passo para publicar.'); return }
    setBusy('publish'); setGeneral('')
    const saved = await persist('Não foi possível salvar o evento.')
    if (!saved) { setBusy(null); return }
    try {
      const sent = await submitEvent(saved.id)
      if (!mounted.current) return
      // Sai do assistente para a gestão do evento: se ela já está logo abaixo na pilha (veio dela), a substitui.
      navigation.replace(makeEntry('event-manage', { eventId: sent.id }), below => below.screen === 'event-manage' && below.params.eventId === sent.id)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      const mapped = apiFormErrors(cause, form, form.paid ? 'Não foi possível enviar para aprovação.' : 'Não foi possível publicar.')
      if (mapped.step !== null) showErrors(mapped.errors, 'Complete este passo para publicar.')
      else setGeneral(mapped.general)
      setBusy(null)
    }
  }

  /** Fechar (X ou voltar do Android): enquanto grava ou envia, não sai; a resposta ainda precisa levar a pessoa adiante. */
  function requestClose() {
    if (busy) return
    if (dirty) setLeaving(true)
    else navigation.back()
  }
  /** Sai sem salvar (da folha de confirmação); só quando nada está sendo enviado. */
  function leaveWithoutSaving() {
    if (!busy) navigation.back()
  }

  const header = <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 10 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Fechar" accessibilityState={{ disabled: Boolean(busy) }} disabled={Boolean(busy)} onPress={requestClose}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
      <Icon name="x" size={21} color="#ffffff" />
    </Pressable>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: colors.mint, fontSize: 9, fontWeight: '800', letterSpacing: 1.1 }}>ORGANIZADOR</Text>
      <Text accessibilityRole="header" style={{ color: '#ffffff', fontSize: 17, fontWeight: '800' }}>{eventId ? 'Editar rascunho' : 'Novo evento'}</Text>
    </View>
    {!loading && !loadError ? <View accessible accessibilityLabel={`Passo ${step + 1} de ${WIZARD_STEPS.length}`} style={{ marginRight: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '800' }}>{step + 1}/{WIZARD_STEPS.length}</Text>
    </View> : null}
  </View>

  const paid = form.paid === true
  const finalLabel = paid ? 'Enviar para aprovação' : 'Publicar'
  const previewCapacity = parseCapacity(form.capacity)
  const previewStart = startsAt(form) ?? (form.startDate ? `${form.startDate}T12:00:00` : null)
  const status = busy === 'draft' ? 'Salvando o rascunho…' : busy === 'publish' ? (paid ? 'Enviando para aprovação…' : 'Publicando…') : ''

  const body = loading || loadError
    ? <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
      {loadError ? <Notice surface="dark">{loadError}</Notice> : <Text accessibilityLiveRegion="polite" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Carregando o rascunho…</Text>}
      {loadError ? <View style={{ marginTop: 12 }}><ActionButton block tone="line" title="Voltar" onPress={navigation.back} /></View> : null}
    </View>
    : <>
      <StepBars done={step + 1} total={WIZARD_STEPS.length} inset={16} />
      <ScrollView key={step} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        <Text accessibilityLiveRegion="polite" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>{`Passo ${step + 1} de ${WIZARD_STEPS.length}. ${WIZARD_STEPS[step].question}`}</Text>
        <Text accessibilityRole="header" style={{ marginTop: 18, marginBottom: 4, color: '#ffffff', fontSize: 24, lineHeight: 28, fontWeight: '800' }}>{WIZARD_STEPS[step].question}</Text>

        {step === 0 ? <NameStep form={form} errors={errors} update={update} /> : null}
        {step === 1 ? <SportStep form={form} errors={errors} category={category} /> : null}
        {step === 2 ? <CapacityStep form={form} errors={errors} update={update} onBack={previous} /> : null}
        {step === 3 ? <WhenStep form={form} errors={errors} update={update} cities={Array.isArray(cities.data) ? cities.data : []} /> : null}
        {step === 4 ? <PriceStep form={form} errors={errors} update={update} /> : null}
        {step === 3 && cities.error ? <Notice surface="dark">{cities.error}</Notice> : null}

        {general ? <Notice surface="dark">{general}</Notice> : null}
        {notice ? <Notice surface="dark" tone="success">{notice}</Notice> : null}
        <Text accessibilityLiveRegion="polite" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>{status}</Text>

        <View style={{ marginTop: 18, flexDirection: 'row', gap: 8 }}>
          {step > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Voltar ao passo anterior" accessibilityState={{ disabled: Boolean(busy) }} disabled={Boolean(busy)} onPress={previous}
            style={{ width: 52, minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
            <Icon name="arrow-left" size={18} color="#ffffff" />
          </Pressable> : null}
          {step < LAST_STEP
            ? <ActionButton tone="mint" icon="arrow-right" title="Próxima" disabled={Boolean(busy)} onPress={next} />
            : <ActionButton tone="mint" icon="send" title={busy === 'publish' ? (paid ? 'Enviando…' : 'Publicando…') : finalLabel} accessibilityLabel={finalLabel} busy={busy === 'publish'} disabled={Boolean(busy)} onPress={() => void publish()} />}
        </View>
        <View style={{ marginTop: 8 }}>
          <ActionButton block tone="line" icon="save" title={busy === 'draft' ? 'Salvando…' : 'Salvar rascunho'} accessibilityLabel="Salvar rascunho" busy={busy === 'draft'} disabled={Boolean(busy)} onPress={() => void saveDraft()} />
        </View>

        <Text style={{ marginTop: 22, marginBottom: 8, color: colors.mint, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 }}>PRÉVIA DO CARTAZ</Text>
        <EventPoster name={form.name.trim() || 'Nome do evento'} sport={form.sport} startsAt={previewStart} format={form.format} distanceKm={form.distanceKm} eventType={form.competitionType}
          priceCents={form.paid === null ? null : paid ? parsePrice(form.price) : 0} acceptedTiers={form.restricted ? form.tiers : null}
          entries={previewCapacity ? { count: 0, capacity: previewCapacity } : null} state="rascunho" stateLabel={paid ? 'Vai para aprovação' : 'Rascunho'} showSport />
      </ScrollView>
    </>

  return <View style={{ flex: 1, backgroundColor: colors.forest }}>
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={requestClose}>
      <Screen className="grow basis-0 bg-forest">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {header}
          {body}
        </KeyboardAvoidingView>
        {leaving ? <Sheet title="Sair sem salvar?" onClose={() => setLeaving(false)}>
          <Text style={{ color: colors['ink-muted'], fontSize: 12, lineHeight: 18 }}>As mudanças desde o último rascunho salvo se perdem.</Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            <ActionButton block tone="brand" icon="save" title="Salvar rascunho e sair" disabled={Boolean(busy)} onPress={() => void saveDraft().then(saved => { setLeaving(false); if (saved && mounted.current) navigation.back() })} />
            <ActionButton block tone="outline" title="Sair sem salvar" disabled={Boolean(busy)} onPress={leaveWithoutSaving} />
            <ActionButton block tone="outline" title="Continuar editando" onPress={() => setLeaving(false)} />
          </View>
        </Sheet> : null}
      </Screen>
    </Modal>
  </View>
}

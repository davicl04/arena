import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Hourglass, Info, MapPin, QrCode, Save, Send, ShieldCheck, X } from 'lucide-react'
import { ApiError } from '@/api/client'
import type { City, Sport } from '@/api/client'
import { createEvent, EVENT_LIMITS, getOrganizerEvent, submitEvent, updateEvent } from '@/api/events'
import type { OrganizerEventDetail } from '@/api/events'
import SportIcon from '@/components/SportIcon'
import { EventPoster } from '@/components/events/EventPoster'
import {
  apiFormErrors, capacityError, closeDateMax, closesAt, draftInput, emptyForm, FIELD_STEP, firstErrorField, firstIncompleteStep,
  formFromDetail, LAST_STEP, parseCapacity, parsePrice, startsAt, validateAll, validateDraft, validateStep, withCategory, WIZARD_STEPS,
} from '@/components/organizer/eventForm'
import type { EventForm, FormErrors, FormField } from '@/components/organizer/eventForm'
import { CapacityStepper, DarkChoice, DarkFieldError, TierChips } from '@/components/organizer/WizardFields'
import { darkHint, darkInput, darkLabel, darkTextarea, describedBy } from '@/components/organizer/wizardStyles'
import { CitySheet } from '@/components/teams/CitySheet'
import { darkEyebrow, darkNotice, groupLabel, teamButton } from '@/components/teams/styles'
import { StepBars } from '@/components/teams/TeamsPlate'
import { IconButton } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { LoadError } from '@/components/ui/load-error'
import { Sheet } from '@/components/ui/sheet'
import { TimeField } from '@/components/ui/time-field'
import { toast } from '@/components/ui/toast'
import { eliminationCapacities, eventNoun, eventTypes, footballFormats, pixKeyType, pixKeyTypes, runDistances } from '@/data/arena'
import { sports } from '@/api/client'
import { reportActionError } from '@/hooks/useSubmit'
import { cn } from '@/lib/utils'

/** Id do elemento de cada campo (o primeiro com erro recebe o foco). */
const FIELD_ID: Record<FormField, string> = {
  name: 'ev-name', sport: 'ev-sport', format: 'ev-format', distanceKm: 'ev-distance', competitionType: 'ev-type',
  capacity: 'ev-capacity', restricted: 'ev-access', tiers: 'ev-tiers', startDate: 'ev-start-date', startTime: 'ev-start-time',
  closeDate: 'ev-close-date', closeTime: 'ev-close-time', cityId: 'ev-city', venue: 'ev-venue', courseNotes: 'ev-course',
  paid: 'ev-paid', price: 'ev-price', pixBeneficiary: 'ev-pix-beneficiary', pixKeyType: 'ev-pix-type', pixKey: 'ev-pix-key',
  pixCopyPaste: 'ev-pix-copy', pixInstructions: 'ev-pix-instructions', contact: 'ev-contact',
}
const { nameMax, venueMax, courseNotesMax, beneficiaryMax, pixKeyMax, copyPasteMax, instructionsMax, contactMax,
  roundRobinMin, roundRobinMax, raceMin, raceMax } = EVENT_LIMITS

type Busy = 'draft' | 'publish' | null

/** Unidade das vagas: "times", "atletas" ou "corredores". */
const unitFor = (sport: Sport | null) => (sport ? eventNoun[sport].entrants : 'vagas')

/**
 * Criar evento (V4): uma pergunta por vez em tela escura, com a prévia do cartaz abaixo. Enter avança (o passo é um
 * formulário), a seta volta; "Salvar rascunho" grava a qualquer momento (o servidor guarda o rascunho incompleto). No
 * último passo, o botão publica o gratuito ou envia o pago para a aprovação da administração. Com `eventId`, edita o
 * rascunho, abrindo no primeiro passo incompleto (ou em `initialStep`). Erros da API voltam ao passo do campo.
 */
export default function EventWizard({ eventId, initialStep, cities, onClose, onDone, onExpired }: {
  /** Rascunho a editar; ausente cria um evento. */
  eventId?: number
  /** Passo ao abrir (G3 → "Preencher"); sem ele, o primeiro incompleto. */
  initialStep?: number
  cities: City[]
  onClose: () => void
  /** Publicado ou enviado para aprovação: abre a gestão do evento. */
  onDone: (event: OrganizerEventDetail) => void
  onExpired: () => void
}) {
  const [savedId, setSavedId] = useState<number | undefined>(eventId)
  const [loading, setLoading] = useState(Boolean(eventId))
  /** O rascunho não pode ser editado aqui (já foi para aprovação ou publicado): é um estado, não uma falha. */
  const [notEditable, setNotEditable] = useState('')
  /** A leitura do rascunho falhou: a mensagem e o erro lançado, para o `LoadError` reconhecer a falta de conexão. */
  const [loadFailure, setLoadFailure] = useState<{ message: string; cause: unknown } | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [form, setForm] = useState<EventForm>(emptyForm)
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<FormErrors>({})
  /** Resumo que acompanha campos com erro ("Revise o campo indicado.") ou um 422 sem campo conhecido; falhas de envio viram toast. */
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [dirty, setDirty] = useState(false)
  const [picking, setPicking] = useState(false)
  const [leaving, setLeaving] = useState(false)
  /** Pedido de foco: a pergunta do passo ou o primeiro campo com erro (`pendingFocus`). */
  const [focusRequest, setFocusRequest] = useState(0)
  const questionRef = useRef<HTMLHeadingElement>(null)
  const pendingFocus = useRef<FormField | null>(null)

  useEffect(() => {
    if (!eventId) return
    let alive = true
    getOrganizerEvent(eventId).then(detail => {
      if (!alive) return
      if (detail.state !== 'rascunho') {
        setNotEditable(detail.state === 'em_aprovacao' ? 'Retire o evento da aprovação para editar.' : 'Este evento não é mais um rascunho. Edite os dados pela gestão do evento.')
        return
      }
      const loaded = formFromDetail(detail)
      setForm(loaded)
      setStep(initialStep !== undefined ? Math.min(Math.max(initialStep, 0), LAST_STEP) : firstIncompleteStep(loaded))
      setFocusRequest(n => n + 1)
    }).catch((cause: unknown) => {
      if (!alive) return
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setLoadFailure({ message: cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar o rascunho.', cause })
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [eventId, initialStep, onExpired, loadAttempt])

  // A cada passo, o foco vai para a pergunta (ou para o primeiro campo com erro, quando o erro trouxe o passo).
  useEffect(() => {
    if (loading) return
    const field = pendingFocus.current
    pendingFocus.current = null
    if (field) {
      const element = document.getElementById(FIELD_ID[field])
      const target = element?.matches('input, textarea, button') ? element : element?.querySelector<HTMLElement>('button, input')
      if (target) { target.focus(); return }
    }
    questionRef.current?.focus()
  }, [focusRequest, loading])

  function update(change: Partial<EventForm>) {
    setForm(old => ({ ...old, ...change }))
    setDirty(true)
    setSummary('')
    setErrors(old => {
      const keys = Object.keys(change) as FormField[]
      if (!keys.some(key => old[key])) return old
      const next = { ...old }
      for (const key of keys) delete next[key]
      return next
    })
  }
  function category(change: Parameters<typeof withCategory>[1]) {
    setForm(old => withCategory(old, change))
    setDirty(true)
    setSummary('')
    setErrors(old => {
      const next = { ...old }
      for (const key of ['sport', 'format', 'distanceKm', 'competitionType', 'capacity'] as FormField[]) delete next[key]
      return next
    })
  }
  /** Mostra os erros no passo do primeiro campo e foca esse campo. */
  function showErrors(found: FormErrors, message = '') {
    const first = firstErrorField(found)
    pendingFocus.current = first
    if (first) setStep(FIELD_STEP[first])
    setErrors(found)
    setSummary(message)
    setFocusRequest(n => n + 1)
  }

  function next(event: FormEvent) {
    event.preventDefault()
    if (step === LAST_STEP) return
    const found = validateStep(form, step)
    if (Object.keys(found).length) { showErrors(found); return }
    setErrors({}); setSummary('')
    setStep(step + 1)
    setFocusRequest(n => n + 1)
  }
  function previous() {
    setErrors({}); setSummary('')
    setStep(Math.max(0, step - 1))
    setFocusRequest(n => n + 1)
  }

  /**
   * Uma falha do servidor: campos recusados (422) vão para o passo do campo, com o resumo junto ao formulário; o resto segue a
   * regra única dos erros de ação (sessão expirada, aviso de conexão, aviso de estado velho ou toast de erro).
   */
  function reportFailure(cause: unknown, fallback: string, fieldsSummary: string) {
    const mapped = apiFormErrors(cause, form, fallback)
    if (mapped.step !== null) { showErrors(mapped.errors, fieldsSummary); return }
    setErrors({})
    const report = reportActionError(cause, fallback, onExpired)
    if (report.kind === 'form') setSummary(report.message)
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
      reportFailure(cause, fallback, 'Revise o campo indicado.')
      return null
    }
  }

  async function saveDraft(): Promise<boolean> {
    const found = validateDraft(form)
    if (Object.keys(found).length) { showErrors(found); return false }
    setBusy('draft'); setSummary('')
    const saved = await persist('Não foi possível salvar o rascunho.')
    setBusy(null)
    if (saved) {
      setErrors({})
      toast.success('Rascunho salvo.', { description: 'Ele fica em Meus eventos, com o checklist do que falta.' })
    }
    return Boolean(saved)
  }

  async function publish() {
    const missing = validateAll(form)
    if (missing) { showErrors(missing.errors, 'Complete este passo para publicar.'); return }
    setBusy('publish'); setSummary('')
    const saved = await persist('Não foi possível salvar o evento.')
    if (!saved) { setBusy(null); return }
    try {
      const sent = await submitEvent(saved.id)
      onDone(sent)
    } catch (cause) {
      reportFailure(cause, form.paid ? 'Não foi possível enviar para aprovação.' : 'Não foi possível publicar.', 'Complete este passo para publicar.')
    } finally {
      setBusy(null)
    }
  }

  function requestClose() {
    if (dirty && !busy) setLeaving(true)
    else onClose()
  }

  const heading = <div className="flex items-center gap-1 px-2 pt-2.5">
    <IconButton type="button" tone="glass" aria-label="Fechar" onClick={requestClose}><X size={21} /></IconButton>
    <div className="min-w-0 flex-1">
      <span className={darkEyebrow}>Organizador</span>
      <h1 className="text-[17px] leading-[1.2] text-white">{eventId ? 'Editar rascunho' : 'Novo evento'}</h1>
    </div>
    {!loading && !loadFailure && !notEditable && <span aria-hidden="true" className="mr-2 rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-bold text-white/80 tabular-nums">{step + 1}/{WIZARD_STEPS.length}</span>}
  </div>

  if (loading || notEditable || loadFailure) {
    return <div className="min-h-full text-white">
      {heading}
      <div className="px-4 pt-3">
        {loadFailure ? <LoadError size="screen" tone="dark" title="Não foi possível carregar o rascunho" text={loadFailure.message} cause={loadFailure.cause}
          onRetry={() => { setLoadFailure(null); setLoading(true); setLoadAttempt(n => n + 1) }} />
          : notEditable ? <p className={darkNotice({ tone: 'error' })} role="alert">{notEditable}</p>
            : <p role="status" className="text-[12px] text-white/70">Carregando o rascunho…</p>}
      </div>
    </div>
  }

  const paid = form.paid === true
  const finalLabel = paid ? 'Enviar para aprovação' : 'Publicar'
  const city = cities.find(item => item.id === form.cityId) ?? null
  const unit = unitFor(form.sport)
  const previewCapacity = parseCapacity(form.capacity)
  const previewStart = startsAt(form) ?? (form.startDate ? `${form.startDate}T12:00:00` : null)
  const status = busy === 'draft' ? 'Salvando o rascunho…' : busy === 'publish' ? (paid ? 'Enviando para aprovação…' : 'Publicando…') : ''

  return <div className="min-h-full text-white">
    {heading}
    <StepBars done={step + 1} total={WIZARD_STEPS.length} />
    <form key={step} className="px-4" aria-labelledby="wizard-question" noValidate onSubmit={next}>
      <p className="sr-only" id="wizard-progress">Passo {step + 1} de {WIZARD_STEPS.length}</p>
      <h2 id="wizard-question" ref={questionRef} tabIndex={-1} aria-describedby="wizard-progress"
        className="mt-[18px] mb-1 font-display text-[24px] leading-[1.15] font-extrabold text-white outline-none">
        {WIZARD_STEPS[step].question}
      </h2>

      {step === 0 && <NameStep form={form} errors={errors} update={update} />}
      {step === 1 && <SportStep form={form} errors={errors} category={category} />}
      {step === 2 && <CapacityStep form={form} errors={errors} update={update} unit={unit} onBack={previous} />}
      {step === 3 && <WhenStep form={form} errors={errors} update={update} city={city} onPickCity={() => setPicking(true)} />}
      {step === 4 && <PriceStep form={form} errors={errors} update={update} />}

      {summary && <p className={darkNotice({ tone: 'error' })} role="alert">{summary}</p>}
      <p role="status" className="sr-only">{status}</p>

      <div className="mt-[18px] flex gap-2">
        {step > 0 && <button type="button" className={cn(teamButton({ tone: 'line', size: 'md' }), 'w-[52px] flex-none px-0')} aria-label="Voltar ao passo anterior" onClick={previous} disabled={Boolean(busy)}>
          <ArrowLeft aria-hidden="true" />
        </button>}
        {step < LAST_STEP
          ? <button type="submit" className={cn(teamButton({ tone: 'mint', size: 'md' }), 'flex-1')} disabled={Boolean(busy)}>Próxima<ArrowRight aria-hidden="true" /></button>
          : <button type="button" className={cn(teamButton({ tone: 'mint', size: 'md' }), 'flex-1')} disabled={Boolean(busy)} onClick={() => void publish()}>
            <Send aria-hidden="true" />{busy === 'publish' ? (paid ? 'Enviando…' : 'Publicando…') : finalLabel}
          </button>}
      </div>
      <button type="button" className={cn(teamButton({ tone: 'line', size: 'block' }), 'mt-2')} disabled={Boolean(busy)} onClick={() => void saveDraft()}>
        <Save aria-hidden="true" />{busy === 'draft' ? 'Salvando…' : 'Salvar rascunho'}
      </button>
    </form>

    <section aria-labelledby="wizard-preview-label" className="px-4 pt-1 pb-6">
      <p id="wizard-preview-label" className={cn(groupLabel, 'mt-5 mb-2 text-mint')}>Prévia do cartaz</p>
      <EventPoster name={form.name.trim() || 'Nome do evento'} sport={form.sport} startsAt={previewStart} format={form.format}
        distanceKm={form.distanceKm} eventType={form.competitionType}
        priceCents={form.paid === null ? null : paid ? parsePrice(form.price) : 0}
        acceptedTiers={form.restricted ? form.tiers : null} entries={previewCapacity ? { count: 0, capacity: previewCapacity } : null}
        state="rascunho" stateLabel={paid ? 'Vai para aprovação' : 'Rascunho'} showSport />
    </section>

    {picking && <CitySheet cities={cities} selectedId={form.cityId} title="Cidade do evento" description="Os atletas veem a cidade no cartaz e no detalhe."
      onClose={() => setPicking(false)} onSelect={item => { update({ cityId: item.id }); setPicking(false) }} />}
    {leaving && <Sheet title="Sair sem salvar?" description="As mudanças desde o último rascunho salvo se perdem." onClose={() => setLeaving(false)}>
      <div className="mt-3 grid gap-2">
        <button type="button" data-autofocus className={teamButton({ tone: 'brand', size: 'block' })} disabled={Boolean(busy)}
          onClick={() => void saveDraft().then(saved => { setLeaving(false); if (saved) onClose() })}>
          <Save aria-hidden="true" />Salvar rascunho e sair
        </button>
        <button type="button" className={teamButton({ tone: 'outline', size: 'block' })} onClick={onClose}>Sair sem salvar</button>
        <button type="button" className={teamButton({ tone: 'outline', size: 'block' })} onClick={() => setLeaving(false)}>Continuar editando</button>
      </div>
    </Sheet>}
  </div>
}

interface StepProps {
  form: EventForm
  errors: FormErrors
  update: (change: Partial<EventForm>) => void
}

/** Nota sob os campos (`.fnote` na tela escura). */
function Note({ id, icon = <Info size={15} />, children }: { id?: string; icon?: ReactNode; children: ReactNode }) {
  return <p id={id} className="mt-3 flex items-start gap-2 text-[11px] leading-[1.5] text-white/70 [&>svg]:mt-px [&>svg]:flex-none [&>svg]:text-mint">
    {icon}<span className="min-w-0">{children}</span>
  </p>
}

function NameStep({ form, errors, update }: StepProps) {
  const id = FIELD_ID.name
  return <>
    <label htmlFor={id} className={darkLabel}>Nome do evento</label>
    <input id={id} className={cn(darkInput, 'font-display text-[18px] font-bold')} value={form.name} maxLength={nameMax} autoComplete="off"
      placeholder="Ex.: Copa Sudoeste Society" aria-invalid={Boolean(errors.name) || undefined} aria-describedby={describedBy(id, errors.name)}
      onChange={event => update({ name: event.target.value })} />
    <small id={`${id}-hint`} className={darkHint}>{form.name.length}/{nameMax} · pelo menos 3 letras. Aparece no cartaz.</small>
    <DarkFieldError id={id} error={errors.name} />
  </>
}

function SportStep({ form, errors, category }: Omit<StepProps, 'update'> & { category: (change: Parameters<typeof withCategory>[1]) => void }) {
  return <>
    <span id="ev-sport-label" className={darkLabel}>Modalidade</span>
    <DarkChoice id={FIELD_ID.sport} labelId="ev-sport-label" value={form.sport} error={errors.sport}
      options={sports.map(sport => ({ value: sport.value, label: <><SportIcon sport={sport.value} size={22} />{sport.label}</> }))}
      onChange={value => category({ sport: value })} />
    {form.sport === 'futebol' && <>
      <span id="ev-format-label" className={darkLabel}>Formato</span>
      <DarkChoice id={FIELD_ID.format} labelId="ev-format-label" value={form.format} error={errors.format}
        options={footballFormats.map(format => ({ value: format.value, label: `${format.label} ${format.size}` }))}
        onChange={value => category({ format: value })} />
    </>}
    {(form.sport === 'futebol' || form.sport === 'tenis') && <>
      <span id="ev-type-label" className={darkLabel}>Tipo</span>
      <DarkChoice id={FIELD_ID.competitionType} labelId="ev-type-label" value={form.competitionType} error={errors.competitionType}
        describedById="ev-type-hint" options={eventTypes.map(type => ({ value: type.value, label: type.label }))}
        onChange={value => category({ competitionType: value })} />
      <Note id="ev-type-hint">{form.sport === 'tenis' ? 'Tênis em simples, um contra um. ' : ''}Na eliminação simples, as vagas são 4, 8 ou 16.</Note>
    </>}
    {form.sport === 'corrida' && <>
      <span id="ev-distance-label" className={darkLabel}>Distância</span>
      <DarkChoice id={FIELD_ID.distanceKm} labelId="ev-distance-label" value={form.distanceKm} error={errors.distanceKm} describedById="ev-distance-hint"
        options={runDistances.map(distance => ({ value: distance.value, label: distance.label }))}
        onChange={value => category({ distanceKm: value })} />
      <Note id="ev-distance-hint">As distâncias do ranking da corrida. A prova não tem tipo.</Note>
    </>}
  </>
}

function CapacityStep({ form, errors, update, unit, onBack }: StepProps & { unit: string; onBack: () => void }) {
  const elimination = form.competitionType === 'eliminacao_simples'
  const race = form.sport === 'corrida'
  const typed = race || form.competitionType !== null
  const tierHint = form.sport === 'futebol'
    ? `Vale o elo do time em ${footballFormats.find(format => format.value === form.format)?.label ?? 'cada formato'}.`
    : form.sport === 'tenis' ? 'Vale o elo do atleta no tênis.'
      : form.distanceKm ? `Vale o elo do corredor nos ${form.distanceKm} km.` : 'Vale o elo do corredor na distância da prova.'
  return <>
    <span id="ev-capacity-label" className={darkLabel}>Vagas</span>
    {!typed ? <>
      <p className={darkHint}>{capacityError(form)}</p>
      <button type="button" className={cn(teamButton({ tone: 'line', size: 'sm' }), 'mt-2')} onClick={onBack}>Voltar à modalidade</button>
    </> : elimination
      ? <DarkChoice id={FIELD_ID.capacity} labelId="ev-capacity-label" value={parseCapacity(form.capacity)} error={errors.capacity}
        options={eliminationCapacities.map(value => ({ value, label: `${value} ${unit}` }))}
        onChange={value => update({ capacity: String(value) })} />
      : <>
        <CapacityStepper id={FIELD_ID.capacity} labelId="ev-capacity-label" value={form.capacity} error={errors.capacity} hintId="ev-capacity-hint"
          min={race ? raceMin : roundRobinMin} max={race ? raceMax : roundRobinMax} step={race ? 10 : 1} unit={unit}
          onChange={value => update({ capacity: value })} />
        <small id="ev-capacity-hint" className={darkHint}>{race ? `De ${raceMin} a ${raceMax} corredores.` : `De ${roundRobinMin} a ${roundRobinMax} ${unit} no todos contra todos.`}</small>
      </>}

    <span id="ev-access-label" className={darkLabel}>Quem pode se inscrever</span>
    <DarkChoice id={FIELD_ID.restricted} labelId="ev-access-label" value={form.restricted ? 'elos' : 'aberto'}
      options={[{ value: 'aberto', label: 'Aberto a todos' }, { value: 'elos', label: 'Só alguns elos' }]}
      onChange={value => update({ restricted: value === 'elos' })} />
    {form.restricted
      ? <>
        <span id="ev-tiers-label" className="sr-only">Elos aceitos</span>
        <TierChips id={FIELD_ID.tiers} labelId="ev-tiers-label" value={form.tiers} error={errors.tiers} describedById="ev-tiers-hint"
          onChange={value => update({ tiers: value })} />
        <Note id="ev-tiers-hint">{tierHint} Quem ainda está em classificação não entra em evento com elos escolhidos.</Note>
      </>
      : <Note>Quem ainda está em classificação só se inscreve em evento aberto a todos (RN18).</Note>}
  </>
}

function WhenStep({ form, errors, update, city, onPickCity }: StepProps & { city: City | null; onPickCity: () => void }) {
  const close = closesAt(form)
  return <>
    <label htmlFor={FIELD_ID.startDate} className={darkLabel}>Data e hora do evento</label>
    <div className="grid grid-cols-[minmax(0,1fr)_118px] gap-2">
      <DatePicker id={FIELD_ID.startDate} label="Data do evento" tone="dark" disablePast value={form.startDate} invalid={Boolean(errors.startDate)}
        aria-describedby={errors.startDate ? `${FIELD_ID.startDate}-error` : undefined} onChange={value => update({ startDate: value })} />
      <TimeField id={FIELD_ID.startTime} aria-label="Hora do início" tone="dark" stepMinutes={5} value={form.startTime} invalid={Boolean(errors.startTime)}
        aria-describedby={errors.startTime ? `${FIELD_ID.startTime}-error` : undefined} onChange={value => update({ startTime: value })} />
    </div>
    <DarkFieldError id={FIELD_ID.startDate} error={errors.startDate} />
    <DarkFieldError id={FIELD_ID.startTime} error={errors.startTime} />

    <label htmlFor={FIELD_ID.closeDate} className={darkLabel}>Inscrições até</label>
    <div className="grid grid-cols-[minmax(0,1fr)_118px] gap-2">
      <DatePicker id={FIELD_ID.closeDate} label="Fim das inscrições" tone="dark" disablePast max={closeDateMax(form)} value={form.closeDate}
        invalid={Boolean(errors.closeDate)} aria-describedby={describedBy(FIELD_ID.closeDate, errors.closeDate)} onChange={value => update({ closeDate: value })} />
      <TimeField id={FIELD_ID.closeTime} aria-label="Hora do fim das inscrições (opcional)" tone="dark" stepMinutes={5} value={form.closeTime}
        placeholder="23:59" onChange={value => update({ closeTime: value })} />
    </div>
    <small id={`${FIELD_ID.closeDate}-hint`} className={darkHint}>
      {form.closeDate && !form.closeTime ? 'Sem hora, fecham às 23:59. ' : 'Hora opcional (sem ela, 23:59). '}
      {form.paid ? 'Inscrições pagas também fecham 12 h antes do início.' : close ? '' : 'Até o dia do evento.'}
    </small>
    <DarkFieldError id={FIELD_ID.closeDate} error={errors.closeDate} />

    <span className={darkLabel} id="ev-city-label">Cidade</span>
    <div role="group" aria-labelledby="ev-city-label" className={cn('flex min-h-[46px] items-center gap-2 rounded-control border border-solid bg-white/5 py-1 pr-1.5 pl-3 text-[13px]', errors.cityId ? 'border-danger-soft' : 'border-transparent')}>
      <MapPin size={17} className="text-mint" aria-hidden="true" />
      <b className="min-w-0 flex-1 truncate">{city ? `${city.name} · ${city.state}` : 'Escolha a cidade do evento'}</b>
      <button type="button" id={FIELD_ID.cityId} className="min-h-9 border-0 bg-transparent px-1.5 text-[11px] font-bold text-mint focus-visible:outline-mint"
        aria-describedby={errors.cityId ? `${FIELD_ID.cityId}-error` : undefined} onClick={onPickCity}>{city ? 'Trocar' : 'Escolher'}</button>
    </div>
    <DarkFieldError id={FIELD_ID.cityId} error={errors.cityId} />

    <label htmlFor={FIELD_ID.venue} className={darkLabel}>Local</label>
    <input id={FIELD_ID.venue} className={darkInput} value={form.venue} maxLength={venueMax} autoComplete="off" placeholder="Ex.: Arena Sudoeste, quadra 1"
      aria-invalid={Boolean(errors.venue) || undefined} aria-describedby={describedBy(FIELD_ID.venue, errors.venue)} onChange={event => update({ venue: event.target.value })} />
    <small id={`${FIELD_ID.venue}-hint`} className={darkHint}>Quadra, clube ou ponto de largada. A reserva do local é com você.</small>
    <DarkFieldError id={FIELD_ID.venue} error={errors.venue} />

    {form.sport === 'corrida' && <>
      <label htmlFor={FIELD_ID.courseNotes} className={darkLabel}>Percurso (opcional)</label>
      <textarea id={FIELD_ID.courseNotes} className={darkTextarea} rows={3} value={form.courseNotes} maxLength={courseNotesMax}
        placeholder="Largada, chegada e pontos de hidratação" aria-invalid={Boolean(errors.courseNotes) || undefined}
        aria-describedby={describedBy(FIELD_ID.courseNotes, errors.courseNotes)} onChange={event => update({ courseNotes: event.target.value })} />
      <small id={`${FIELD_ID.courseNotes}-hint`} className={darkHint}>{form.courseNotes.length}/{courseNotesMax}</small>
      <DarkFieldError id={FIELD_ID.courseNotes} error={errors.courseNotes} />
    </>}
  </>
}

function PriceStep({ form, errors, update }: StepProps) {
  const paid = form.paid === true
  const keyInfo = form.pixKeyType ? pixKeyType[form.pixKeyType] : null
  const textField = (field: FormField, label: string, options: { max: number; placeholder: string; hint?: string; mono?: boolean; area?: boolean; inputMode?: 'decimal' | 'numeric' | 'email' | 'tel' | 'text' }) => {
    const id = FIELD_ID[field]
    const value = form[field] as string
    const error = errors[field]
    const common = {
      id, value, maxLength: options.max, placeholder: options.placeholder, autoComplete: 'off',
      'aria-invalid': Boolean(error) || undefined, 'aria-describedby': describedBy(id, error, Boolean(options.hint)),
    }
    return <>
      <label htmlFor={id} className={darkLabel}>{label}</label>
      {options.area
        ? <textarea {...common} rows={2} className={cn(darkTextarea, options.mono && 'font-mono text-[12px]')} onChange={event => update({ [field]: event.target.value } as Partial<EventForm>)} />
        : <input {...common} inputMode={options.inputMode} className={cn(darkInput, options.mono && 'font-mono text-[14px]')} onChange={event => update({ [field]: event.target.value } as Partial<EventForm>)} />}
      {options.hint && <small id={`${id}-hint`} className={darkHint}>{options.hint}</small>}
      <DarkFieldError id={id} error={error} />
    </>
  }
  return <>
    <span id="ev-paid-label" className={darkLabel}>Inscrição</span>
    <DarkChoice id={FIELD_ID.paid} labelId="ev-paid-label" value={form.paid === null ? null : paid ? 'paga' : 'gratuita'} error={errors.paid}
      options={[{ value: 'gratuita', label: 'Gratuita' }, { value: 'paga', label: 'Paga' }]}
      onChange={value => update({ paid: value === 'paga' })} />
    {paid && <>
      {textField('price', `Valor por ${form.sport === 'futebol' ? 'time' : 'inscrito'} (R$)`, { max: 12, placeholder: '0,00', inputMode: 'decimal', hint: 'De R$ 1,00 a R$ 10.000,00.' })}
      <div className="mt-3.5 rounded-card bg-white/[0.03] p-3.5 shadow-[inset_0_0_0_1.5px_var(--color-mint)]">
        <p className="flex items-center gap-2 text-[13px] font-bold"><QrCode size={18} className="text-mint" aria-hidden="true" />Pix para receber</p>
        {textField('pixBeneficiary', 'Favorecido', { max: beneficiaryMax, placeholder: 'Nome de quem recebe' })}
        <span id="ev-pix-type-label" className={darkLabel}>Tipo de chave</span>
        <DarkChoice id={FIELD_ID.pixKeyType} labelId="ev-pix-type-label" value={form.pixKeyType} error={errors.pixKeyType}
          options={pixKeyTypes.map(type => ({ value: type.value, label: type.label }))} onChange={value => update({ pixKeyType: value })} />
        {textField('pixKey', 'Chave Pix', { max: pixKeyMax, placeholder: keyInfo?.placeholder ?? 'Escolha o tipo de chave', mono: true, inputMode: keyInfo?.inputMode })}
        {textField('pixCopyPaste', 'Pix Copia e Cola (opcional)', { max: copyPasteMax, placeholder: 'Cole o código gerado no app do seu banco', mono: true, area: true, hint: 'Facilita para quem paga: o código já leva valor e favorecido.' })}
        {textField('pixInstructions', 'Instruções (opcional)', { max: instructionsMax, placeholder: 'Ex.: envie o comprovante em até 48 h, com o nome do time na descrição do Pix.', area: true })}
        <Note icon={<ShieldCheck size={15} />}>Só aparece para quem está logado. O Arena não recebe pagamentos: só registra os comprovantes.</Note>
      </div>
    </>}
    {textField('contact', 'Contato para dúvidas (opcional)', { max: contactMax, placeholder: 'WhatsApp ou e-mail' })}
    {paid
      ? <div className="mt-3.5 flex gap-3 rounded-[14px] bg-warning-bg p-3 text-[12px] text-ink">
        <Hourglass size={20} className="flex-none text-warning" aria-hidden="true" />
        <div><b className="block">Evento pago passa pela administração</b><small className="mt-0.5 text-[10.5px] leading-[1.45] text-ink-muted">Depois de enviar, ele fica “Em aprovação” até a conferência e só então abre as inscrições.</small></div>
      </div>
      : form.paid === false && <Note>Evento gratuito publica direto: as inscrições abrem na hora.</Note>}
  </>
}

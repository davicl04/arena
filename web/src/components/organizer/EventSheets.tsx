import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { cancelEvent, deleteEvent, EVENT_LIMITS, fieldMessage, updateEvent } from '@/api/events'
import type { EventDraftInput, OrganizerEventDetail } from '@/api/events'
import { ApiError } from '@/api/client'
import { errorClass, hintClass, invalidClass, textareaClass } from '@/components/organizer/fieldStyles'
import { ConfirmBox } from '@/components/teams/ConfirmBox'
import { teamButton } from '@/components/teams/styles'
import { feedbackVariants } from '@/components/ui/feedback'
import { Sheet, SheetActions } from '@/components/ui/sheet'
import { useSubmit } from '@/hooks/useSubmit'
import { cn } from '@/lib/utils'
import { cancelledOnCancel, refundsOnCancel } from './eventView'
import { plural } from '@/utils/format'

const { cancelReasonMin, cancelReasonMax, venueMin, venueMax, courseNotesMax, instructionsMax, contactMax } = EVENT_LIMITS

/**
 * Cancelar evento publicado ou em andamento: motivo obrigatório (5 a 500, vai no aviso automático aos inscritos) e
 * confirmação. Nos pagos, as inscrições confirmadas e em análise viram "Devolução pendente": o organizador devolve
 * por Pix e anexa o comprovante em Comprovantes.
 */
export function CancelEventSheet({ detail, onCancelled, onClose, onExpired }: {
  detail: OrganizerEventDetail
  onCancelled: (detail: OrganizerEventDetail) => void
  onClose: () => void
  onExpired: () => void
}) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const { busy, error, run } = useSubmit(onExpired)
  const text = reason.trim()
  const invalid = text.length < cancelReasonMin || text.length > cancelReasonMax
  const refunds = refundsOnCancel(detail)
  const cancelled = cancelledOnCancel(detail)
  const paid = Boolean(detail.price_cents)

  function next(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (!invalid) setConfirming(true)
  }
  async function confirm() {
    const done = await run(() => cancelEvent(detail.id, text), 'Não foi possível cancelar o evento.')
    if (done) onCancelled(done)
  }

  return <Sheet title="Cancelar evento" description={detail.name} onClose={() => { if (!busy) onClose() }}>
    <div className="mt-1 rounded-[14px] bg-subtle p-3 text-[11.5px] leading-[1.55] text-ink">
      {paid
        ? <>As inscrições confirmadas e as com comprovante em análise viram <b>Devolução pendente</b>: você devolve o valor por Pix e anexa o comprovante de cada devolução em Comprovantes. O participante confirma o recebimento (ou conta como recebido em 7 dias). Reservas sem pagamento são canceladas.</>
        : <>As inscrições são canceladas. Evento gratuito não tem devolução.</>}
      <br />Todos os inscritos recebem o aviso no canal do evento e nas notificações.
      {(refunds > 0 || cancelled > 0) && <ul className="m-0 mt-2 list-disc pl-4.5">
        {refunds > 0 && <li><b>{plural(refunds, 'inscrição vai', 'inscrições vão')}</b> para Devolução pendente.</li>}
        {cancelled > 0 && <li>{plural(cancelled, 'inscrição é cancelada', 'inscrições são canceladas')}.</li>}
      </ul>}
    </div>
    {!confirming
      ? <form onSubmit={next} noValidate>
        <label htmlFor="cancel-reason">Motivo do cancelamento</label>
        <textarea id="cancel-reason" data-autofocus className={cn(textareaClass, invalidClass)} rows={3} maxLength={cancelReasonMax} value={reason}
          aria-invalid={touched && invalid} aria-describedby={touched && invalid ? 'cancel-reason-hint cancel-reason-error' : 'cancel-reason-hint'}
          onChange={event => setReason(event.target.value)} />
        <p id="cancel-reason-hint" className={hintClass}>Vai no aviso automático aos inscritos. De {cancelReasonMin} a {cancelReasonMax} caracteres ({reason.length}/{cancelReasonMax}).</p>
        {touched && invalid && <p id="cancel-reason-error" className={errorClass}>Descreva o motivo do cancelamento.</p>}
        <SheetActions>
          <button type="button" className={teamButton({ tone: 'outline', size: 'md' })} onClick={onClose}>Voltar</button>
          <button type="submit" className={teamButton({ tone: 'danger', size: 'md' })}>Continuar</button>
        </SheetActions>
      </form>
      : <ConfirmBox confirmLabel="Cancelar evento" cancelLabel="Voltar" busy={busy} onConfirm={() => void confirm()} onCancel={() => setConfirming(false)}>
        <b>Cancelar {detail.name}?</b><br />Motivo: “{text}”<br />Não dá para desfazer.
      </ConfirmBox>}
    {error && <p className={cn(feedbackVariants(), 'mt-3')} role="alert">{error}</p>}
    {busy && <p role="status" className="sr-only">Cancelando o evento…</p>}
  </Sheet>
}

/** Excluir rascunho (sem inscrições, por definição), com confirmação. */
export function DeleteDraftSheet({ detail, onDeleted, onClose, onExpired }: {
  detail: OrganizerEventDetail
  onDeleted: () => void
  onClose: () => void
  onExpired: () => void
}) {
  const { busy, error, run } = useSubmit(onExpired)
  async function confirm() {
    const done = await run(async () => { await deleteEvent(detail.id); return true }, 'Não foi possível excluir o rascunho.')
    if (done) onDeleted()
  }
  return <Sheet title="Excluir rascunho" description={detail.name} onClose={() => { if (!busy) onClose() }}>
    <ConfirmBox confirmLabel="Excluir rascunho" cancelLabel="Manter rascunho" busy={busy} onConfirm={() => void confirm()} onCancel={onClose}>
      <b>Excluir o rascunho “{detail.name}”?</b><br />Os dados preenchidos se perdem. Não dá para desfazer.
    </ConfirmBox>
    {error && <p className={cn(feedbackVariants(), 'mt-3')} role="alert">{error}</p>}
  </Sheet>
}

type PublishedField = 'venue' | 'course_notes' | 'pix_instructions' | 'contact'
const PUBLISHED_FIELDS: { field: PublishedField; label: string; max: number; area?: boolean; hint: string }[] = [
  { field: 'venue', label: 'Local', max: venueMax, hint: `De ${venueMin} a ${venueMax} caracteres.` },
  { field: 'course_notes', label: 'Percurso (opcional)', max: courseNotesMax, area: true, hint: `Até ${courseNotesMax} caracteres.` },
  { field: 'pix_instructions', label: 'Instruções do Pix (opcional)', max: instructionsMax, area: true, hint: `Até ${instructionsMax} caracteres.` },
  { field: 'contact', label: 'Contato para dúvidas (opcional)', max: contactMax, hint: `Até ${contactMax} caracteres.` },
]
const currentValue = (detail: OrganizerEventDetail, field: PublishedField) =>
  (field === 'pix_instructions' ? detail.pix?.instructions : detail[field]) ?? ''

/**
 * Editar um evento publicado: só os campos de `editable_fields` que se aplicam (local, percurso da corrida, instruções
 * do Pix do pago e contato). Preço, datas, vagas e regras não mudam depois de publicado.
 */
export function EditPublishedSheet({ detail, onSaved, onClose, onExpired }: {
  detail: OrganizerEventDetail
  onSaved: (detail: OrganizerEventDetail) => void
  onClose: () => void
  onExpired: () => void
}) {
  const fields = PUBLISHED_FIELDS.filter(item => detail.editable_fields.includes(item.field)
    && (item.field !== 'course_notes' || detail.sport === 'corrida') && (item.field !== 'pix_instructions' || Boolean(detail.price_cents)))
  const [values, setValues] = useState<Record<PublishedField, string>>(() => ({
    venue: currentValue(detail, 'venue'), course_notes: currentValue(detail, 'course_notes'),
    pix_instructions: currentValue(detail, 'pix_instructions'), contact: currentValue(detail, 'contact'),
  }))
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PublishedField, string>>>({})
  const { busy, error, setError, run } = useSubmit(onExpired)
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => { formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus() }, [fieldErrors])

  async function save(event: FormEvent) {
    event.preventDefault()
    const changes: EventDraftInput = {}
    const errors: Partial<Record<PublishedField, string>> = {}
    for (const { field } of fields) {
      const text = values[field].trim()
      if (text === currentValue(detail, field).trim()) continue
      if (field === 'venue' && (text.length < venueMin || text.length > venueMax)) errors.venue = `Informe o local com ${venueMin} a ${venueMax} caracteres.`
      changes[field] = text || null
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    if (!Object.keys(changes).length) { onClose(); return }
    const saved = await run(async () => {
      try { return await updateEvent(detail.id, changes) } catch (cause) {
        // Campos recusados pelo servidor aparecem no próprio campo (e a mensagem junto ao formulário, em `error`); o resto vira toast.
        if (cause instanceof ApiError && cause.fields.length) {
          const mapped: Partial<Record<PublishedField, string>> = {}
          for (const item of cause.fields) if (fields.some(entry => entry.field === item.field)) mapped[item.field as PublishedField] = fieldMessage(item.message)
          setFieldErrors(mapped)
        }
        throw cause
      }
    }, 'Não foi possível salvar as alterações.')
    if (saved) onSaved(saved)
  }

  return <Sheet title="Editar dados do evento" description="Depois de publicado, só local, percurso, instruções e contato podem mudar." onClose={() => { if (!busy) onClose() }}>
    <form ref={formRef} onSubmit={event => void save(event)} noValidate>
      {fields.map(({ field, label, max, area, hint }, index) => {
        const id = `published-${field}`
        const fieldError = fieldErrors[field]
        const props = {
          id, value: values[field], maxLength: max, 'aria-invalid': Boolean(fieldError), 'data-autofocus': index === 0 ? true : undefined,
          'aria-describedby': fieldError ? `${id}-hint ${id}-error` : `${id}-hint`,
          onChange: (event: { target: { value: string } }) => { setValues(old => ({ ...old, [field]: event.target.value })); setError('') },
        }
        return <div key={field}>
          <label htmlFor={id}>{label}</label>
          {area ? <textarea {...props} rows={3} className={cn(textareaClass, invalidClass)} /> : <input {...props} className={invalidClass} />}
          <p id={`${id}-hint`} className={hintClass}>{hint}</p>
          {fieldError && <p id={`${id}-error`} className={errorClass}>{fieldError}</p>}
        </div>
      })}
      {error && <p className={cn(feedbackVariants(), 'mt-3')} role="alert">{error}</p>}
      <SheetActions>
        <button type="button" className={teamButton({ tone: 'outline', size: 'md' })} disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="submit" className={teamButton({ tone: 'brand', size: 'md' })} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </SheetActions>
    </form>
  </Sheet>
}

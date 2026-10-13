import { useState } from 'react'
import { Text, View } from 'react-native'
import { ApiError } from '../../api/client'
import { cancelEvent, deleteEvent, EVENT_LIMITS, fieldMessage, updateEvent } from '../../api/events'
import type { EventDraftInput, OrganizerEventDetail } from '../../api/events'
import { useSubmit } from '../../hooks/useSubmit'
import { useThemeColors } from '../../hooks/useTheme'
import { plural } from '../../utils/format'
import Sheet from '../Sheet'
import { ActionButton, ConfirmBox, FormField, Notice } from '../arena/controls'
import { cancelledOnCancel, refundsOnCancel } from './eventView'

const { cancelReasonMin, cancelReasonMax, venueMin, venueMax, courseNotesMax, instructionsMax, contactMax } = EVENT_LIMITS

const sectionText = (color: string) => ({ color, fontSize: 11.5, lineHeight: 18 }) as const

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
  const colors = useThemeColors()
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const { busy, error, run } = useSubmit(onExpired)
  const text = reason.trim()
  const invalid = text.length < cancelReasonMin || text.length > cancelReasonMax
  const refunds = refundsOnCancel(detail)
  const cancelled = cancelledOnCancel(detail)
  const paid = Boolean(detail.price_cents)

  function next() {
    setTouched(true)
    if (!invalid) setConfirming(true)
  }
  async function confirm() {
    const done = await run(() => cancelEvent(detail.id, text), 'Não foi possível cancelar o evento.')
    if (done) onCancelled(done)
  }

  return <Sheet title="Cancelar evento" onClose={() => { if (!busy) onClose() }}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12 }}>{detail.name}</Text>
    <View style={{ marginTop: 8, borderRadius: 14, backgroundColor: colors.subtle, padding: 12 }}>
      <Text style={sectionText(colors.ink)}>
        {paid
          ? 'As inscrições confirmadas e as com comprovante em análise viram Devolução pendente: você devolve o valor por Pix e anexa o comprovante de cada devolução em Comprovantes. O participante confirma o recebimento (ou conta como recebido em 7 dias). Reservas sem pagamento são canceladas.'
          : 'As inscrições são canceladas. Evento gratuito não tem devolução.'}
        {'\n'}Todos os inscritos recebem o aviso no canal do evento e nas notificações.
      </Text>
      {refunds > 0 ? <Text style={[sectionText(colors.ink), { marginTop: 6 }]}>{'• '}{plural(refunds, 'inscrição vai', 'inscrições vão')} para Devolução pendente.</Text> : null}
      {cancelled > 0 ? <Text style={[sectionText(colors.ink), { marginTop: refunds > 0 ? 2 : 6 }]}>{'• '}{plural(cancelled, 'inscrição é cancelada', 'inscrições são canceladas')}.</Text> : null}
    </View>
    {!confirming
      ? <>
        <FormField label="Motivo do cancelamento" value={reason} onChangeText={setReason} multiline maxLength={cancelReasonMax}
          hint={`Vai no aviso automático aos inscritos. De ${cancelReasonMin} a ${cancelReasonMax} caracteres (${reason.length}/${cancelReasonMax}).`}
          error={touched && invalid ? 'Descreva o motivo do cancelamento.' : undefined} />
        <View style={{ marginTop: 12 }}><ActionButton tone="danger" block title="Continuar" onPress={next} /></View>
      </>
      : <ConfirmBox confirmLabel="Cancelar evento" cancelLabel="Voltar" busy={busy} onConfirm={() => void confirm()} onCancel={() => setConfirming(false)}>
        <Text style={{ fontWeight: '700' }}>Cancelar {detail.name}?</Text>{'\n'}Motivo: “{text}”{'\n'}Não dá para desfazer.
      </ConfirmBox>}
    {error ? <Notice>{error}</Notice> : null}
    {busy ? <Text accessibilityLiveRegion="polite" style={{ marginTop: 8, color: colors['ink-muted'], fontSize: 11.5 }}>Cancelando o evento…</Text> : null}
  </Sheet>
}

/** Excluir rascunho (sem inscrições, por definição), com confirmação. */
export function DeleteDraftSheet({ detail, onDeleted, onClose, onExpired }: {
  detail: OrganizerEventDetail
  onDeleted: () => void
  onClose: () => void
  onExpired: () => void
}) {
  const colors = useThemeColors()
  const { busy, run } = useSubmit(onExpired)
  async function confirm() {
    const done = await run(async () => { await deleteEvent(detail.id); return true }, 'Não foi possível excluir o rascunho.')
    if (done) onDeleted()
  }
  return <Sheet title="Excluir rascunho" onClose={() => { if (!busy) onClose() }}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12 }}>{detail.name}</Text>
    <ConfirmBox confirmLabel="Excluir rascunho" cancelLabel="Manter rascunho" busy={busy} onConfirm={() => void confirm()} onCancel={onClose}>
      <Text style={{ fontWeight: '700' }}>Excluir o rascunho “{detail.name}”?</Text>{'\n'}Os dados preenchidos se perdem. Não dá para desfazer.
    </ConfirmBox>
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
  const colors = useThemeColors()
  const fields = PUBLISHED_FIELDS.filter(item => detail.editable_fields.includes(item.field)
    && (item.field !== 'course_notes' || detail.sport === 'corrida') && (item.field !== 'pix_instructions' || Boolean(detail.price_cents)))
  const [values, setValues] = useState<Record<PublishedField, string>>(() => ({
    venue: currentValue(detail, 'venue'), course_notes: currentValue(detail, 'course_notes'),
    pix_instructions: currentValue(detail, 'pix_instructions'), contact: currentValue(detail, 'contact'),
  }))
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PublishedField, string>>>({})
  const { busy, error, setError, run } = useSubmit(onExpired)

  async function save() {
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
        // Campos recusados pelo servidor aparecem no próprio campo; a mensagem geral fica em `error`.
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

  return <Sheet title="Editar dados do evento" onClose={() => { if (!busy) onClose() }}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, lineHeight: 18 }}>Depois de publicado, só local, percurso, instruções e contato podem mudar.</Text>
    {fields.map(({ field, label, max, area, hint }) => <FormField key={field} label={label} value={values[field]} maxLength={max} multiline={area} hint={hint}
      error={fieldErrors[field]} onChangeText={value => { setValues(old => ({ ...old, [field]: value })); setError('') }} />)}
    {error ? <Notice>{error}</Notice> : null}
    <View style={{ marginTop: 12 }}><ActionButton block title={busy ? 'Salvando…' : 'Salvar'} accessibilityLabel="Salvar" busy={busy} onPress={() => void save()} /></View>
  </Sheet>
}

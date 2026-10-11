import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../api/client'
import { REPORT_DETAILS_MAX, REPORT_REASONS, sendReport } from '../api/social'
import type { ReportReason, ReportTarget } from '../api/social'
import { Button } from '@/components/ui/button'
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet, FieldTitle } from '@/components/ui/field'
import { GlassTextarea } from '@/components/ui/glass'
import { glassMessageVariants } from '@/components/ui/glass-variants'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

/** Formulário de denúncia de post, comentário ou conta: motivo obrigatório e detalhes opcionais. */
export default function ReportForm({ target, targetId, title = 'Por que você quer denunciar?', onSent, onExpired }: {
  target: ReportTarget
  targetId: number
  title?: string
  onSent: () => void
  onExpired: () => void
}) {
  const id = useId()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!reason || busy) return
    setBusy(true); setError('')
    try {
      await sendReport({ target_type: target, target_id: targetId, reason, description: details })
      onSent()
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setError(cause instanceof Error && cause.message ? cause.message : 'Não foi possível enviar a denúncia.')
      setBusy(false)
    }
  }

  return <form className="dark grid gap-1.5" onSubmit={event => void submit(event)}>
    <FieldSet className="gap-2">
      <FieldLegend variant="label" className="mb-0 px-0.5 text-[13px] font-bold">{title}</FieldLegend>
      <RadioGroup className="gap-1.5" name={`${id}-reason`} value={reason}
        onValueChange={value => setReason(value as ReportReason)}>
        {REPORT_REASONS.map(option => <FieldLabel key={option.value} htmlFor={`${id}-${option.value}`}
          className="*:data-[slot=field]:px-2.5 *:data-[slot=field]:py-2">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle className="text-xs font-bold">{option.label}</FieldTitle>
              <FieldDescription className="text-[11px] leading-snug">{option.description}</FieldDescription>
            </FieldContent>
            <RadioGroupItem value={option.value} id={`${id}-${option.value}`} />
          </Field>
        </FieldLabel>)}
      </RadioGroup>
    </FieldSet>
    <label className="sr-only" htmlFor={`${id}-details`}>Detalhes da denúncia (opcional)</label>
    <GlassTextarea id={`${id}-details`} className="min-h-12" value={details} maxLength={REPORT_DETAILS_MAX} rows={2}
      placeholder="Detalhes (opcional)" onChange={event => setDetails(event.target.value)} />
    {error && <p className={glassMessageVariants()} role="alert">{error}</p>}
    <Button type="submit" variant="glass" className="mt-0.5 justify-self-end" disabled={!reason || busy}>{busy ? 'Enviando…' : 'Enviar denúncia'}</Button>
  </form>
}

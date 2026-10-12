import { useId, useState } from 'react'
import { Check, CircleCheck, CircleX, Info, X } from 'lucide-react'
import { decideReceipt, receiptRefusalError, receiptRefusalInput, receiptRefusalText, RECEIPT_LIMITS, subjectName } from '@/api/receipts'
import type { EventPix, Receipt, ReceiptReview } from '@/api/events'
import { ReceiptLink, ReceiptPreview } from '@/components/events/ReceiptFile'
import { errorClass, textareaClass } from '@/components/organizer/fieldStyles'
import { useSubmit } from '@/hooks/useSubmit'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { feedbackVariants } from '@/components/ui/feedback'
import { Sheet, SheetActions } from '@/components/ui/sheet'
import { pixKeyType, receiptRefusalReasons } from '@/data/arena'
import type { ReceiptRefusalReason } from '@/data/arena'
import { cn } from '@/lib/utils'
import { formatDeadline, formatPrice, parseIso } from '@/utils/format'
import { relativeTime } from '@/utils/relativeTime'

const eyebrow = 'text-[9px] font-extrabold tracking-[0.08em] text-ink-muted uppercase'

/** Prazo ausente ou já vencido. */
function isPast(iso: string | null, now: number = Date.now()) {
  const date = parseIso(iso)
  return !date || date.getTime() <= now
}

/** "Esperado": o valor da inscrição e o Pix do evento, para conferir com o comprovante. */
function Expected({ priceCents, pix }: { priceCents: number; pix: EventPix | null }) {
  const kind = pix?.key_type ? pixKeyType[pix.key_type] : null
  const items: [string, string][] = [
    ['Valor', formatPrice(priceCents)],
    ['Favorecido', pix?.beneficiary ?? '—'],
    [kind ? `Chave (${kind.inline})` : 'Chave', pix?.key ?? '—'],
  ]
  return <section aria-label="Esperado" className="mt-2 rounded-xl bg-subtle p-3">
    <p className={eyebrow}>Esperado</p>
    <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12px]">
      {items.map(([term, value]) => <div key={term} className="contents">
        <dt className="text-ink-muted">{term}</dt>
        <dd className="font-semibold wrap-anywhere">{value}</dd>
      </div>)}
    </dl>
  </section>
}

/** Recusas anteriores da inscrição, da mais recente à mais antiga, com o arquivo de cada envio. */
function RefusalHistory({ previous, name }: { previous: Receipt[]; name: string }) {
  const refused = previous.filter(item => item.decision === 'recusado')
  if (!refused.length) return null
  return <section aria-label="Recusas anteriores" className="mt-3">
    <p className={eyebrow}>Recusas anteriores</p>
    <ol className="mt-1.5 grid gap-1.5">
      {refused.map(item => <li key={item.id} className="flex items-start gap-2.5 rounded-xl border border-solid border-line p-2.5">
        <CircleX size={17} className="mt-px flex-none text-danger" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <b className="block text-[12px]">Recusado em {formatDeadline(item.decided_at)}</b>
          <small className="text-[11px] leading-[1.5] text-ink-muted wrap-anywhere">{receiptRefusalText(item.reason_code, item.reason_detail)}</small>
          <ReceiptLink receipt={item} label={`Ver o envio recusado de ${name} em ${formatDeadline(item.created_at)} (nova aba)`} className="min-h-8">
            Ver envio de {formatDeadline(item.created_at)}
          </ReceiptLink>
        </span>
      </li>)}
    </ol>
  </section>
}

/** Decisão já tomada (aba Decididos). */
function Decision({ receipt }: { receipt: Receipt }) {
  const approved = receipt.decision === 'aprovado'
  return <div className={cn('mt-3 flex items-start gap-2.5 rounded-xl p-3 text-[12px] leading-[1.5]', approved ? 'bg-success-bg text-brand' : 'bg-[#fff0f2] text-danger')}>
    {approved ? <CircleCheck size={17} className="mt-px flex-none" aria-hidden="true" /> : <CircleX size={17} className="mt-px flex-none" aria-hidden="true" />}
    <span className="min-w-0">
      <b>{approved ? 'Aprovado' : 'Recusado'}{receipt.decided_at && ` em ${formatDeadline(receipt.decided_at)}`}</b>
      {!approved && <span className="block text-ink-muted wrap-anywhere">Motivo: {receiptRefusalText(receipt.reason_code, receipt.reason_detail)}</span>}
    </span>
  </div>
}

/**
 * Folha do comprovante (A2): o arquivo (imagem ou PDF pela rota autorizada), quando e como foi enviado, o valor
 * esperado, as recusas anteriores da inscrição e, se ainda não decidido, Aprovar | Recusar com motivo.
 */
export function ReceiptSheet({ review, pix, locked = false, onClose, onDecided, onExpired }: {
  review: ReceiptReview
  /** Pix do evento ("Esperado"). */
  pix: EventPix | null
  /** Revogação pendente: a administração decide antes; as decisões ficam suspensas. */
  locked?: boolean
  onClose: () => void
  onDecided: (decided: ReceiptReview, message: string) => void
  onExpired: () => void
}) {
  const id = useId()
  const { receipt, entry, attempt, previous } = review
  const name = subjectName(entry.subject)
  const [refusing, setRefusing] = useState(false)
  const [reason, setReason] = useState<ReceiptRefusalReason | null>(null)
  const [detail, setDetail] = useState('')
  const [attempted, setAttempted] = useState(false)
  const { busy, error, setError, run } = useSubmit(onExpired)
  const problem = attempted ? receiptRefusalError(reason, detail) : null
  const pending = receipt.decision === null
  const reservationOver = isPast(entry.reserved_until)
  const kind = receipt.file_type === 'pdf' ? 'PDF' : 'Imagem'
  const meta = [`Enviado ${relativeTime(receipt.created_at)}`, kind, attempt > 1 ? `${attempt}ª tentativa` : ''].filter(Boolean).join(' · ')

  async function approve() {
    const decided = await run(() => decideReceipt(receipt.id, { decision: 'aprovar' }), 'Não foi possível aprovar o comprovante.')
    if (decided) onDecided(decided, `Inscrição de ${name} confirmada.`)
  }
  async function refuse() {
    setAttempted(true)
    if (receiptRefusalError(reason, detail) || !reason) return
    const decided = await run(() => decideReceipt(receipt.id, receiptRefusalInput(reason, detail)), 'Não foi possível recusar o comprovante.')
    if (decided) onDecided(decided, `Comprovante de ${name} recusado.`)
  }

  return <Sheet title={name} description={meta} onClose={onClose}>
    <ReceiptPreview receipt={receipt} title={`Comprovante enviado por ${name}`} onExpired={onExpired} />
    <p className="mt-1 text-[11px] leading-[1.5] text-ink-muted">
      Enviado em {formatDeadline(receipt.created_at)}{receipt.uploaded_by && <> por {receipt.uploaded_by.name}</>}
    </p>
    <Expected priceCents={entry.price_cents} pix={pix} />
    <RefusalHistory previous={previous} name={name} />
    {!pending && <Decision receipt={receipt} />}

    {pending && locked && <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning-bg p-3 text-[11.5px] leading-[1.5] text-warning">
      <Info size={15} className="mt-px flex-none" aria-hidden="true" />A administração está decidindo se o evento segue. A análise fica em espera até a decisão.</p>}

    {pending && !locked && !refusing && <SheetActions>
      <Button disabled={busy} onClick={() => void approve()}><Check size={17} aria-hidden="true" />{busy ? 'Aprovando…' : 'Aprovar'}</Button>
      <Button variant="secondary" disabled={busy} onClick={() => { setRefusing(true); setError('') }}><X size={17} aria-hidden="true" />Recusar</Button>
    </SheetActions>}

    {pending && !locked && refusing && <div className="mt-3 grid gap-2.5 rounded-card p-3.5 shadow-[inset_0_0_0_1.5px_#b9374955]">
      <b id={`${id}-reason`} className="text-[13px]">Motivo da recusa</b>
      <div role="group" aria-labelledby={`${id}-reason`} aria-describedby={problem && !reason ? `${id}-problem` : undefined} className="flex flex-wrap gap-1.5">
        {receiptRefusalReasons.map(option => <Chip key={option.value} type="button" aria-pressed={reason === option.value}
          className="aria-pressed:border-danger aria-pressed:bg-danger" onClick={() => setReason(option.value)}>{option.label}</Chip>)}
      </div>
      <label htmlFor={`${id}-detail`} className="m-0">Detalhe para {entry.subject.kind === 'time' ? 'o time' : 'o atleta'} {reason === 'outro' ? '(obrigatório)' : '(opcional)'}</label>
      <textarea id={`${id}-detail`} className={textareaClass} rows={2} maxLength={RECEIPT_LIMITS.detailMax} value={detail}
        aria-invalid={Boolean(problem && reason)} aria-describedby={problem ? `${id}-problem` : undefined} onChange={event => setDetail(event.target.value)} />
      {problem && <p id={`${id}-problem`} className={errorClass} role="alert">{problem}</p>}
      <p className="flex items-start gap-2 text-[11px] leading-[1.5] text-ink-muted"><Info size={15} className="mt-px flex-none text-brand" aria-hidden="true" />
        {reservationOver
          ? 'A reserva já terminou: ao recusar, a vaga é liberada.'
          : `${entry.subject.kind === 'time' ? 'O time' : 'O atleta'} vê o motivo e pode enviar outro comprovante até ${formatDeadline(entry.reserved_until)}.`}
      </p>
      <SheetActions className="mt-0">
        <Button variant="secondary" disabled={busy} onClick={() => { setRefusing(false); setAttempted(false); setError('') }}>Voltar</Button>
        <Button className="bg-danger-ink shadow-none hover:bg-[#9a1e14]" disabled={busy} onClick={() => void refuse()}>{busy ? 'Recusando…' : 'Recusar'}</Button>
      </SheetActions>
    </div>}
    <div aria-live="polite">{error && <p className={feedbackVariants()} role="alert">{error}</p>}</div>
  </Sheet>
}

import { useCallback, useId, useState } from 'react'
import { CheckCheck, ChevronRight, ExternalLink, Info } from 'lucide-react'
import { eventReceiptsPath, getReceiptsEvent, subjectName } from '@/api/receipts'
import type { ReceiptReview } from '@/api/events'
import type { ReceiptsEvent, ReceiptTab } from '@/api/receipts'
import { ReceiptLink, ReceiptThumb } from '@/components/events/ReceiptFile'
import { StateBadge } from '@/components/events/StateBadge'
import { ReceiptSheet } from '@/components/organizer/ReceiptSheet'
import { RefundList } from '@/components/organizer/RefundList'
import { DarkTopBar, TeamsPlate } from '@/components/teams/TeamsPlate'
import { usePagedList } from '@/hooks/usePagedList'
import { useResource } from '@/hooks/useResource'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { feedbackVariants } from '@/components/ui/feedback'
import { Tabs } from '@/components/ui/tabs'
import { formatDeadline, formatPrice, plural } from '@/utils/format'
import { relativeTime } from '@/utils/relativeTime'

type PageTab = ReceiptTab | 'devolucoes'

/** Linha da placa: o que falta no A2 (comprovantes) ou nas devoluções do evento cancelado. */
function summary(event: ReceiptsEvent): string {
  const { pending } = event
  if (event.state === 'cancelado') {
    const parts = [
      pending.refunds_to_send && plural(pending.refunds_to_send, 'devolução para enviar', 'devoluções para enviar'),
      pending.refunds_awaiting && plural(pending.refunds_awaiting, 'aguardando o participante', 'aguardando os participantes'),
      pending.refund_disputes && plural(pending.refund_disputes, 'contestada', 'contestadas'),
    ].filter(Boolean)
    return ['Evento cancelado', ...parts].join(' · ')
  }
  const head = pending.receipts ? plural(pending.receipts, 'comprovante para analisar', 'comprovantes para analisar') : 'Nada para analisar'
  return event.registration_deadline ? `${head} · inscrições até ${formatDeadline(event.registration_deadline)}` : head
}

/** Linha da lista: miniatura, quem enviou, quando e o valor; o PDF ganha "Abrir PDF" ao lado. */
function ReceiptRow({ review, decided, onOpen, onExpired }: { review: ReceiptReview; decided: boolean; onOpen: () => void; onExpired: () => void }) {
  const { receipt, entry, attempt } = review
  const name = subjectName(entry.subject)
  const when = decided ? `Decidido ${relativeTime(receipt.decided_at ?? receipt.created_at)}` : `Enviado ${relativeTime(receipt.created_at)}`
  return <li className="relative flex items-center gap-3 rounded-card bg-white p-2.5 shadow-[0_2px_8px_#0000000a] has-[button:focus-visible]:outline-3 has-[button:focus-visible]:outline-offset-2 has-[button:focus-visible]:outline-focus hover:bg-[#fbfbfc]">
    <ReceiptThumb receipt={receipt} name={name} onExpired={onExpired} />
    <span className="grid min-w-0 flex-1 justify-items-start gap-[3px]">
      <button type="button" className="max-w-full truncate border-0 bg-transparent p-0 text-left text-[13px] font-bold text-inherit after:absolute after:inset-0 after:rounded-card focus-visible:outline-none"
        aria-label={`${name}: ${when.toLowerCase()} · ${receipt.file_type === 'pdf' ? 'PDF' : 'imagem'}`} onClick={onOpen}>{name}</button>
      <small className="text-[10.5px] leading-[1.4] text-ink-muted">{when} · {formatPrice(entry.price_cents)}</small>
      <span className="flex flex-wrap gap-1">
        {!decided && attempt > 1 && <StateBadge tone="pending">{attempt}ª tentativa</StateBadge>}
        {decided && <StateBadge tone={receipt.decision === 'aprovado' ? 'open' : 'danger'}>{receipt.decision === 'aprovado' ? 'Aprovado' : 'Recusado'}</StateBadge>}
      </span>
    </span>
    {receipt.file_type === 'pdf' && <ReceiptLink receipt={receipt} label={`Abrir PDF do comprovante de ${name} (nova aba)`} className="relative z-1 flex-none">
      <ExternalLink aria-hidden="true" />Abrir PDF
    </ReceiptLink>}
    <ChevronRight size={18} className="flex-none text-ink-muted" aria-hidden="true" />
  </li>
}

/** Aba "Para analisar" (do mais antigo ao mais recente) ou "Decididos" (do mais recente), com a folha do comprovante. */
function ReceiptQueue({ event, tab, onDecided, onExpired }: {
  event: ReceiptsEvent; tab: ReceiptTab; onDecided: (message: string) => void; onExpired: () => void
}) {
  const list = usePagedList<ReceiptReview>(eventReceiptsPath(event.id, tab), onExpired)
  const [open, setOpen] = useState<ReceiptReview | null>(null)
  const decided = tab === 'decididos'
  return <>
    {list.loading && <p role="status" className="py-4 text-[12px]">Carregando comprovantes…</p>}
    {list.error && <div className={feedbackVariants()} role="alert">{list.error.message} <Button variant="text" onClick={list.reload}>Tentar novamente</Button></div>}
    {!list.loading && !list.error && !list.items.length && <EmptyState Icon={CheckCheck}
      title={decided ? 'Nenhum comprovante decidido' : 'Nada para analisar'}
      text={decided ? 'Os comprovantes aprovados ou recusados aparecem aqui.' : 'Quando alguém enviar o comprovante, ele aparece aqui e nas suas notificações.'} />}
    {list.items.length > 0 && <ul className="grid gap-2" aria-label={decided ? 'Comprovantes decididos' : 'Comprovantes para analisar'}>
      {list.items.map(item => <ReceiptRow key={item.receipt.id} review={item} decided={decided} onOpen={() => setOpen(item)} onExpired={onExpired} />)}
    </ul>}
    {list.moreError && <p className={feedbackVariants()} role="alert">{list.moreError}</p>}
    {list.hasMore && <Button variant="secondary" className="mt-[18px] w-full" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais comprovantes</Button>}
    {open && <ReceiptSheet review={open} pix={event.pix} locked={event.revocation_pending} onClose={() => setOpen(null)} onExpired={onExpired}
      onDecided={(item, message) => {
        list.setItems(old => old.filter(other => other.receipt.id !== item.receipt.id))
        setOpen(null)
        onDecided(message)
      }} />}
  </>
}

/**
 * Comprovantes do evento (A2): abas Para analisar | Decididos com miniaturas e a folha do comprovante. No evento
 * cancelado, a primeira aba vira Devoluções: o organizador anexa a devolução de cada inscrição paga e acompanha a
 * resposta do participante. Aberta pela gestão do evento (G3) e pela notificação de comprovante recebido.
 */
export default function ReceiptsPage({ eventId, onBack, onExpired }: { eventId: number; onBack: () => void; onExpired: () => void }) {
  const ids = useId()
  const load = useCallback(() => getReceiptsEvent(eventId), [eventId])
  const event = useResource(load, onExpired, { fallback: 'Não foi possível carregar o evento.' })
  const [chosen, setChosen] = useState<PageTab | null>(null)
  const [notice, setNotice] = useState('')
  const data = event.data
  const cancelled = data?.state === 'cancelado'
  const first: PageTab = cancelled ? 'devolucoes' : 'para_analisar'
  const tab: PageTab = chosen === 'decididos' ? 'decididos' : first
  const { setData } = event

  /** Atualiza os contadores da placa e das abas depois de uma decisão ou envio, sem recarregar a tela. */
  const refresh = useCallback(() => {
    getReceiptsEvent(eventId).then(fresh => setData(fresh)).catch(() => undefined)
  }, [eventId, setData])

  const tabs = data ? [
    cancelled
      ? { value: 'devolucoes' as const, label: data.pending.refunds_to_send ? `Devoluções (${data.pending.refunds_to_send})` : 'Devoluções' }
      : { value: 'para_analisar' as const, label: data.pending.receipts ? `Para analisar (${data.pending.receipts})` : 'Para analisar' },
    { value: 'decididos' as const, label: 'Decididos' },
  ] : []

  return <>
    <TeamsPlate className="pb-4">
      <DarkTopBar eyebrow={data?.name ?? 'Evento'} title="Comprovantes" onBack={onBack} backLabel="Voltar para o evento" />
      {data && <p className="mt-2 px-[18px] text-[11.5px] leading-[1.5] text-white/72">{summary(data)}</p>}
    </TeamsPlate>
    <div className="px-5 pt-3.5">
      {event.loading && <p role="status" className="py-4 text-[12px]">Carregando o evento…</p>}
      {event.error && <div className={feedbackVariants()} role="alert">{event.error} <Button variant="text" onClick={event.reload}>Tentar novamente</Button></div>}
      {data && <>
        {data.revocation_pending && <p className="mb-3 flex items-start gap-2 rounded-xl bg-warning-bg p-3 text-[11.5px] leading-[1.5] text-warning">
          <Info size={15} className="mt-px flex-none" aria-hidden="true" />A administração está decidindo se o evento segue. A análise dos comprovantes fica em espera; as devoluções continuam.</p>}
        <Tabs variant="segmented" items={tabs} value={tab} label="Comprovantes do evento" idPrefix={`${ids}-tab-`} controls={`${ids}-panel`}
          onChange={value => { setChosen(value); setNotice('') }} />
        <div aria-live="polite">{notice && <p className={feedbackVariants({ tone: 'success' })} role="status">{notice}</p>}</div>
        <div id={`${ids}-panel`} role="tabpanel" aria-labelledby={`${ids}-tab-${tab}`} className="pt-1 pb-4">
          {tab === 'devolucoes'
            ? <RefundList eventId={data.id} onExpired={onExpired}
              onSent={entry => { setNotice(`Devolução de ${subjectName(entry.subject)} enviada. O participante confirma o recebimento.`); refresh() }} />
            : <ReceiptQueue key={tab} event={data} tab={tab} onExpired={onExpired} onDecided={message => { setNotice(message); refresh() }} />}
        </div>
      </>}
    </div>
  </>
}

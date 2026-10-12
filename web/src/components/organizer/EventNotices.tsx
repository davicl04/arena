import { useState } from 'react'
import type { FormEvent } from 'react'
import { CircleX, Megaphone, Send } from 'lucide-react'
import { EVENT_LIMITS, eventMessagesPath, postEventMessage } from '@/api/events'
import type { EventMessage } from '@/api/events'
import { textareaClass } from '@/components/organizer/fieldStyles'
import { teamButton } from '@/components/teams/styles'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { usePagedList } from '@/hooks/usePagedList'
import { useSubmit } from '@/hooks/useSubmit'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/utils/relativeTime'

/** Um aviso: o automático do cancelamento em destaque (vermelho, com o selo "Evento cancelado"). */
function Notice({ message }: { message: EventMessage }) {
  const cancelled = message.kind === 'evento_cancelado'
  const author = message.author?.name ?? (cancelled ? 'Aviso automático' : 'Organizador')
  return <li data-kind={message.kind} className={cn('rounded-card p-3 text-[12px] leading-[1.55]', cancelled ? 'bg-[#fff0f2] shadow-[inset_0_0_0_1px_#b9374933]' : 'bg-white')}>
    <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-ink-muted">
      {cancelled && <span className="inline-flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-[9.5px] font-extrabold text-white"><CircleX size={12} aria-hidden="true" />Evento cancelado</span>}
      <b className="text-ink">{author}</b>
      <time dateTime={message.created_at}>{relativeTime(message.created_at)}</time>
    </div>
    <p className="m-0 whitespace-pre-wrap wrap-anywhere text-ink">{message.body}</p>
  </li>
}

/**
 * Canal de avisos do evento (`GET`/`POST /events/{id}/messages`): o organizador escreve, os inscritos leem e recebem a
 * notificação. Do mais recente ao mais antigo; o aviso automático do cancelamento aparece em destaque.
 */
export function EventNotices({ eventId, canWrite, onExpired }: {
  eventId: number
  /** Publicado ou depois, sem a decisão pendente da administração. */
  canWrite: boolean
  onExpired: () => void
}) {
  const list = usePagedList<EventMessage>(eventMessagesPath(eventId), onExpired)
  const [body, setBody] = useState('')
  const [notice, setNotice] = useState('')
  const { busy, error, setError, run } = useSubmit(onExpired)
  const text = body.trim()
  const max = EVENT_LIMITS.messageMax

  async function send(event: FormEvent) {
    event.preventDefault()
    setNotice('')
    if (!text) { setError('Escreva o aviso (até 1000 caracteres).'); return }
    const sent = await run(() => postEventMessage(eventId, text), 'Não foi possível publicar o aviso.')
    if (!sent) return
    list.setItems(old => [sent, ...old.filter(item => item.id !== sent.id)])
    setBody('')
    setNotice('Aviso publicado. Os inscritos recebem uma notificação.')
  }

  return <section aria-labelledby="notices-title" className="mt-6">
    <h2 id="notices-title" className="flex items-center gap-2 text-[16px]"><Megaphone size={18} className="text-brand" aria-hidden="true" />Avisos do evento</h2>
    <p className="mt-1 text-[11px] leading-[1.5] text-ink-muted">Só você escreve. Os inscritos (atletas ou elencos dos times) leem aqui e recebem a notificação.</p>
    {canWrite && <form onSubmit={event => void send(event)} noValidate className="mt-3 rounded-card bg-white p-3">
      <label htmlFor="notice-body" className="mt-0 mb-1.5">Novo aviso</label>
      <textarea id="notice-body" className={textareaClass} rows={3} maxLength={max} value={body} placeholder="Ex.: mudamos o horário da primeira rodada para 9h."
        aria-describedby="notice-body-hint" aria-invalid={Boolean(error) || undefined} onChange={event => { setBody(event.target.value); setError(''); setNotice('') }} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <small id="notice-body-hint" className="text-[10.5px] text-ink-muted">{body.length}/{max}</small>
        <button type="submit" className={teamButton({ tone: 'brand', size: 'sm' })} disabled={busy || !text}><Send aria-hidden="true" />{busy ? 'Publicando…' : 'Publicar aviso'}</button>
      </div>
      <div aria-live="polite">
        {error && <p className="mt-2 text-[11px] text-error" role="alert">{error}</p>}
        {notice && <p className="mt-2 text-[11px] text-brand" role="status">{notice}</p>}
      </div>
    </form>}
    {list.loading && <p role="status" className="mt-3 text-[11.5px] text-ink-muted">Carregando os avisos…</p>}
    {list.error && <div className={cn(feedbackVariants(), 'mt-3')} role="alert">{list.error.message} <Button variant="text" onClick={list.reload}>Tentar novamente</Button></div>}
    {!list.loading && !list.error && (list.items.length
      ? <ul className="m-0 mt-3 grid list-none gap-2 p-0" aria-label="Avisos publicados">{list.items.map(message => <Notice key={message.id} message={message} />)}</ul>
      : <p className="mt-3 text-[11.5px] text-ink-muted">Nenhum aviso ainda.</p>)}
    {list.moreError && <p className="mt-2 text-[11px] text-error" role="alert">{list.moreError}</p>}
    {list.hasMore && <Button variant="link" className="mt-1" disabled={list.busy} onClick={() => void list.loadMore()}>{list.busy ? 'Carregando…' : 'Carregar avisos anteriores'}</Button>}
  </section>
}

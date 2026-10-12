import { useEffect, useRef, useState } from 'react'
import { BadgeCheck, CalendarRange, Check, ChevronRight, CircleX, Hourglass, Plus, RotateCcw, Trophy, X } from 'lucide-react'
import { ApiError } from '@/api/client'
import { cancelOrganizerRequest, getOrganizerStatus, refusalText, sentence } from '@/api/organizer'
import type { OrganizerState, OrganizerStatus } from '@/api/organizer'
import type { OrganizerEventCard } from '@/api/events'
import { EventPoster } from '@/components/events/EventPoster'
import { useSubmit } from '@/hooks/useSubmit'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { glassMessageVariants } from '@/components/ui/glass-variants'
import { ListGroup, ListHeading } from '@/components/ui/list-row'
import { cn } from '@/lib/utils'
import { alertCount, posterProps } from './eventView'
import { shortDate } from '@/utils/relativeTime'

type Stage = 'done' | 'current' | 'bad' | 'todo'
const stageNames = ['Pedir', 'Análise', 'Organizar'] as const
const stagesFor: Record<Exclude<OrganizerState, 'aprovado'>, Stage[]> = {
  sem_pedido: ['current', 'todo', 'todo'],
  em_analise: ['done', 'current', 'todo'],
  recusado: ['done', 'bad', 'todo'],
  revogado: ['done', 'done', 'bad'],
}
const stageText: Record<Stage, string> = { done: 'concluída', current: 'etapa atual', bad: 'não concluída', todo: 'a seguir' }
const secondaryOnDark = 'w-full border border-solid border-white/25 text-white'

/** Etapas Pedir → Análise → Organizar do cartão P3. */
function Stages({ stages }: { stages: Stage[] }) {
  return <ol className="my-3.5 grid grid-cols-3 gap-1.5" aria-label="Etapas do pedido">
    {stageNames.map((name, index) => {
      const stage = stages[index]
      return <li key={name} data-stage={stage} className="grid justify-items-center gap-1 text-[10.5px] font-bold text-white/60 data-[stage=current]:text-white data-[stage=done]:text-white">
        <i aria-hidden="true" className={cn('grid size-7 place-items-center rounded-full bg-white/8 font-display text-[11px] font-extrabold not-italic',
          stage === 'done' && 'bg-mint text-night', stage === 'current' && 'text-mint shadow-[0_0_0_2px_var(--color-mint)]', stage === 'bad' && 'bg-danger-soft text-night')}>
          {stage === 'done' ? <Check size={14} /> : stage === 'bad' ? <X size={14} /> : index + 1}
        </i>
        <span>{name}<span className="sr-only">: {stageText[stage]}</span></span>
      </li>
    })}
  </ol>
}

/** Bloco de situação dentro do cartão (em análise, recusado, revogado). */
function Situation({ tone, title, text }: { tone: 'wait' | 'bad'; title: string; text: string }) {
  const Icon = tone === 'wait' ? Hourglass : CircleX
  return <div className="mb-2.5 flex gap-3 rounded-card bg-white/5 p-3.5">
    <span className={cn('grid size-10 flex-none place-items-center rounded-xl', tone === 'wait' ? 'bg-[#f6c26b22] text-[#f6c26b]' : 'bg-[#b9374940] text-danger-soft')}><Icon size={20} /></span>
    <div className="min-w-0">
      <b className="block text-[13.5px] text-white">{title}</b>
      <small className="mt-0.5 text-[11px] leading-[1.5] wrap-anywhere text-white/65">{text}</small>
    </div>
  </div>
}

/**
 * Cartão escuro "Organizar no Arena" (P3) no Menu, com as etapas e o estado do pedido: sem pedido ("Quero
 * organizar"), em análise ("Cancelar pedido", com confirmação), recusado ou revogado (motivo e "Enviar novo
 * pedido"). Com a permissão aprovada, o Menu mostra `OrganizerEvents` no lugar dele.
 */
export function OrganizerCard({ status, onRequest, onChange, onExpired }: {
  status: OrganizerStatus
  /** Abre a página "Seja organizador" (P5). */
  onRequest: () => void
  /** Novo estado depois de cancelar o pedido. */
  onChange: (status: OrganizerStatus) => void
  onExpired: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState('')
  const { busy, error, setError, run } = useSubmit(onExpired)
  const question = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (confirming) question.current?.focus() }, [confirming])
  if (status.state === 'aprovado' || !(status.state in stagesFor)) return null
  const state = status.state
  async function cancel() {
    let stale = false
    const done = await run(async () => {
      try { await cancelOrganizerRequest(); return true } catch (cause) {
        // Pedido já decidido (ou cancelado em outro lugar): o cartão confere o estado atual em vez de manter o antigo.
        stale = cause instanceof ApiError && (cause.status === 404 || cause.status === 409)
        throw cause
      }
    }, 'Não foi possível cancelar o pedido.')
    if (!done) {
      if (stale) {
        setConfirming(false)
        getOrganizerStatus().then(onChange).catch((cause: unknown) => { if (cause instanceof ApiError && cause.status === 401) onExpired() })
      }
      return
    }
    setConfirming(false)
    setNotice('Pedido cancelado. Você pode enviar um novo quando quiser.')
    onChange({ state: 'sem_pedido', request: null, organizer: null, revocation: null })
  }
  const sent = status.request?.created_at ? shortDate(status.request.created_at) : ''
  return <section data-slot="organizer-card" data-state={state} aria-labelledby="organizer-card-title" className="mt-5 rounded-panel bg-forest p-3.5 text-white">
    <div className="flex items-center gap-2.5">
      <Trophy size={24} className="flex-none text-mint" aria-hidden="true" />
      <div className="min-w-0">
        <h2 id="organizer-card-title" className="font-display text-[14px] text-white">Organizar no Arena</h2>
        <small className="text-[10.5px] text-white/65">Campeonatos de futebol e tênis e provas de corrida</small>
      </div>
    </div>
    <Stages stages={stagesFor[state]} />
    {state === 'sem_pedido' && <>
      <p className="mb-3 text-[11px] leading-[1.55] text-white/70">Peça a permissão de organizador. A administração do Arena analisa o pedido e responde nas notificações.</p>
      <Button variant="glass" className="w-full" onClick={onRequest}>Quero organizar</Button>
    </>}
    {state === 'em_analise' && <>
      <Situation tone="wait" title="Pedido em análise" text={`${sent ? `Enviado em ${sent}. ` : ''}Você recebe a resposta nas notificações.`} />
      {confirming
        ? <div className="rounded-card bg-white/5 p-3.5">
          <p ref={question} tabIndex={-1} className="font-display text-[13px] font-bold text-white outline-none">Cancelar o pedido em análise?</p>
          <p className="mt-1 mb-3 text-[11px] leading-[1.5] text-white/65">A administração deixa de analisá-lo. Você pode enviar outro depois.</p>
          <div className="flex gap-2 *:flex-1">
            <Button variant="glass-secondary" className={secondaryOnDark} disabled={busy} onClick={() => { setConfirming(false); setError('') }}>Manter pedido</Button>
            <Button variant="glass-danger" disabled={busy} onClick={() => void cancel()}>{busy ? 'Cancelando…' : 'Cancelar pedido'}</Button>
          </div>
        </div>
        : <Button variant="glass-secondary" className={secondaryOnDark} onClick={() => { setConfirming(true); setNotice('') }}>Cancelar pedido</Button>}
    </>}
    {state === 'recusado' && <>
      <Situation tone="bad" title="Pedido recusado" text={`Motivo: ${sentence(refusalText(status.request?.reason_code, status.request?.reason_detail))} Você pode enviar um novo pedido.`} />
      <Button variant="glass" className="flex w-full items-center justify-center gap-2" onClick={onRequest}><RotateCcw size={16} aria-hidden="true" />Enviar novo pedido</Button>
    </>}
    {state === 'revogado' && <>
      <Situation tone="bad" title="Permissão revogada" text={`Motivo: ${sentence(status.revocation?.reason || 'não informado')} Você pode enviar um novo pedido.`} />
      <Button variant="glass" className="flex w-full items-center justify-center gap-2" onClick={onRequest}><RotateCcw size={16} aria-hidden="true" />Enviar novo pedido</Button>
    </>}
    <div aria-live="polite">
      {error && <p className={cn(glassMessageVariants(), 'mt-2.5')} role="alert">{error}</p>}
      {notice && <p className={cn(glassMessageVariants({ tone: 'notice' }), 'mt-2.5')} role="status">{notice}</p>}
    </div>
  </section>
}

/**
 * Seção "Organizador · Meus eventos" do Menu: com a permissão (ou com eventos mantidos), a prévia dos eventos em
 * aberto em cartazes compactos (os dois primeiros, por data) e o acesso à área do organizador (O3). Sem eventos,
 * o estado vazio leva a criar o primeiro.
 */
export function OrganizerEvents({ status, events, loading, error, onReload, onOpenList, onOpenEvent, onCreate }: {
  status: OrganizerStatus | null
  /** Eventos em aberto (`GET /organizer/events?scope=abertos`). */
  events: OrganizerEventCard[]
  loading: boolean
  error: string
  onReload: () => void
  /** Abre a área do organizador (O3). */
  onOpenList: () => void
  /** Abre a gestão de um evento (G3). */
  onOpenEvent: (eventId: number) => void
  /** Abre o Criar evento (V4); só com a permissão ativa. */
  onCreate: () => void
}) {
  const approved = status?.state === 'aprovado'
  const preview = events.slice(0, 2)
  const pending = events.reduce((total, event) => total + alertCount(event), 0)
  return <section aria-labelledby="organizer-events-title">
    <ListHeading id="organizer-events-title">Organizador</ListHeading>
    {loading && <p role="status" className="mx-1 mb-2 text-[11px] text-ink-muted">Carregando os seus eventos…</p>}
    {error && <div className={cn(feedbackVariants(), 'mt-0')} role="alert">{error} <Button variant="text" onClick={onReload}>Tentar novamente</Button></div>}
    {preview.length > 0 && <ul className="m-0 mb-2.5 grid list-none grid-cols-2 gap-2.5 p-0" aria-label="Próximos eventos">
      {preview.map(event => <li key={event.id} className="grid min-w-0">
        <EventPoster {...posterProps(event)} pendingCount={alertCount(event)} showSport className="min-h-[170px] pt-[56px]" onClick={() => onOpenEvent(event.id)} />
      </li>)}
    </ul>}
    <ListGroup>
      <button type="button" onClick={onOpenList} className="flex min-h-[54px] w-full items-center gap-3 border-0 bg-transparent px-3.5 py-2.5 text-left text-inherit enabled:hover:bg-[#f6f7f9]">
        <span className="grid size-[34px] flex-none place-items-center rounded-[10px] bg-[#005a3612] text-brand"><CalendarRange size={17} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <b className="flex items-center gap-1.5 text-[12px]">Meus eventos{approved && status?.organizer && <BadgeCheck size={14} className="text-brand" aria-hidden="true" />}</b>
          <small className="mt-0.5 text-[11px] leading-[1.5] text-ink-muted">
            {approved && status?.organizer ? `${status.organizer.display_name} · ` : ''}
            {loading ? 'Carregando…' : events.length
              ? `${events.length === 1 ? '1 evento em aberto' : `${events.length} eventos em aberto`}${pending ? ` · ${pending === 1 ? '1 pendência' : `${pending} pendências`}` : ''}`
              : 'Nenhum evento em aberto.'}
          </small>
        </span>
        <ChevronRight size={16} className="flex-none text-ink-muted" aria-hidden="true" />
      </button>
      {approved && !loading && !events.length && <button type="button" onClick={onCreate} className="flex min-h-[54px] w-full items-center gap-3 border-0 border-t border-solid border-line bg-transparent px-3.5 py-2.5 text-left text-inherit enabled:hover:bg-[#f6f7f9]">
        <span className="grid size-[34px] flex-none place-items-center rounded-[10px] bg-[#005a3612] text-brand"><Plus size={17} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1 text-[12px] font-bold">Criar evento</span>
        <ChevronRight size={16} className="flex-none text-ink-muted" aria-hidden="true" />
      </button>}
    </ListGroup>
  </section>
}

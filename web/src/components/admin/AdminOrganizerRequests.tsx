import { useId, useState } from 'react'
import { CheckCheck, ChevronRight, ShieldOff, UserCheck } from 'lucide-react'
import { ADMIN_ORGANIZERS_PATH, organizerRequestsPath, revokeError, revokeOrganizer } from '@/api/admin'
import type { OrganizerQueue } from '@/api/admin'
import { ORGANIZER_LIMITS, sportNames } from '@/api/organizer'
import type { AdminOrganizer, AdminOrganizerRequest } from '@/api/organizer'
import type { Person } from '@/api/client'
import { SocialPhoto } from '@/components/SocialPhoto'
import { errorClass, textareaClass } from '@/components/organizer/fieldStyles'
import { usePagedList } from '@/hooks/usePagedList'
import { useSubmit } from '@/hooks/useSubmit'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { feedbackVariants } from '@/components/ui/feedback'
import { Sheet, SheetActions } from '@/components/ui/sheet'
import { Tabs } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { relativeTime, shortDate } from '@/utils/relativeTime'
import { InfoList, OrganizerRequestSheet } from './OrganizerRequestSheet'

type AdminTab = OrganizerQueue | 'organizadores'
const tabs = [
  { value: 'em_analise', label: 'Para analisar' },
  { value: 'decididos', label: 'Decididos' },
  { value: 'organizadores', label: 'Organizadores' },
] as const
const stateBadge = {
  em_analise: ['Em análise', 'bg-warning-bg text-warning'],
  aprovado: ['Aprovado', 'bg-success-bg text-brand'],
  recusado: ['Recusado', 'bg-[#fff0f2] text-danger'],
  cancelado: ['Cancelado', 'bg-subtle text-ink-muted'],
} as const

/** Linha da fila (AD1): foto, nome, resumo e chevron; abre a folha. */
function QueueRow({ person, title, text, badge, onOpen }: { person: Person; title: string; text: string; badge?: readonly [string, string]; onOpen: () => void }) {
  return <li>
    <button type="button" className="flex w-full items-center gap-3 rounded-card border-0 bg-white p-2.5 text-left text-inherit shadow-[0_2px_8px_#0000000a] hover:bg-[#fbfbfc]" onClick={onOpen}>
      <SocialPhoto path={person.avatar_url} name={person.name} />
      <span className="grid min-w-0 flex-1 justify-items-start gap-[3px]">
        <b className="max-w-full truncate text-[13px]">{title}</b>
        <small className="text-[10.5px] leading-[1.4] text-ink-muted">{text}</small>
        {badge && <span className={cn('rounded-full px-2 py-[3px] text-[9.5px] font-extrabold', badge[1])}>{badge[0]}</span>}
      </span>
      <ChevronRight size={18} className="flex-none text-ink-muted" aria-hidden="true" />
    </button>
  </li>
}

export function ListState({ loading, error, onRetry, empty, emptyTitle, emptyText }: {
  loading: boolean; error: Error | null; onRetry: () => void; empty: boolean; emptyTitle: string; emptyText: string
}) {
  if (loading) return <p role="status" className="py-4 text-[12px]">Carregando…</p>
  if (error) return <div className={feedbackVariants()} role="alert">{error.message} <Button variant="text" onClick={onRetry}>Tentar novamente</Button></div>
  if (empty) return <EmptyState Icon={CheckCheck} title={emptyTitle} text={emptyText} />
  return null
}

/** Fila "Para analisar" ou "Decididos" (`GET /admin/organizer-requests`). */
function RequestQueue({ queue, onOpenUser, onNotice, onExpired }: { queue: OrganizerQueue; onOpenUser: (id: number) => void; onNotice: (text: string) => void; onExpired: () => void }) {
  const list = usePagedList<AdminOrganizerRequest>(organizerRequestsPath(queue), onExpired)
  const [open, setOpen] = useState<AdminOrganizerRequest | null>(null)
  const pending = queue === 'em_analise'
  return <>
    <ListState loading={list.loading} error={list.error} onRetry={list.reload} empty={!list.items.length}
      emptyTitle={pending ? 'Nada para analisar' : 'Nenhum pedido decidido'}
      emptyText={pending ? 'Quando chegar um novo pedido de organizador, ele aparece aqui.' : 'Os pedidos aprovados, recusados ou cancelados aparecem aqui.'} />
    {!list.loading && !list.error && list.items.length > 0 && <ul className="grid gap-2" aria-label={pending ? 'Pedidos para analisar' : 'Pedidos decididos'}>
      {list.items.map(item => <QueueRow key={item.id} person={item.requester} title={item.display_name}
        text={`${item.requester.name} · ${sportNames(item.sports)} · ${relativeTime(pending ? item.created_at : item.decided_at ?? item.created_at)}`}
        badge={pending ? undefined : stateBadge[item.state]} onOpen={() => setOpen(item)} />)}
    </ul>}
    {list.moreError && <p className={feedbackVariants()} role="alert">{list.moreError}</p>}
    {list.hasMore && <Button variant="secondary" className="mt-[18px] w-full" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais pedidos</Button>}
    {open && <OrganizerRequestSheet item={open} onClose={() => setOpen(null)} onOpenUser={onOpenUser} onExpired={onExpired}
      onDecided={(decided, message) => {
        list.setItems(old => old.filter(item => item.id !== decided.id))
        setOpen(null)
        onNotice(message)
      }}
      onStale={message => {
        // Já decidido ou cancelado em outro lugar: a folha fecha e a fila confere o estado atual.
        setOpen(null)
        onNotice(message)
        list.reload()
      }} />}
  </>
}

/** Folha do organizador ativo, com "Revogar" exigindo o motivo. */
function OrganizerSheet({ item, onClose, onOpenUser, onRevoked, onExpired }: {
  item: AdminOrganizer; onClose: () => void; onOpenUser: (id: number) => void; onRevoked: () => void; onExpired: () => void
}) {
  const id = useId()
  const [revoking, setRevoking] = useState(false)
  const [reason, setReason] = useState('')
  const [attempted, setAttempted] = useState(false)
  const { busy, error, setError, run } = useSubmit(onExpired)
  const problem = attempted ? revokeError(reason) : null
  async function revoke() {
    setAttempted(true)
    if (revokeError(reason)) return
    const done = await run(async () => { await revokeOrganizer(item.id, reason); return true }, 'Não foi possível revogar a permissão.')
    if (done) onRevoked()
  }
  return <Sheet title="Organizador" onClose={onClose}>
    <div className="mt-1 flex items-center gap-3">
      <SocialPhoto path={item.user.avatar_url} name={item.user.name} size="lg" className="mb-0" />
      <div className="min-w-0">
        <b className="block font-display text-[16px] wrap-anywhere">{item.display_name}</b>
        <small className="text-[11px] text-ink-muted">{item.user.name} · @{item.user.username}</small>
      </div>
    </div>
    <InfoList items={[
      ['Organizador desde', shortDate(item.approved_at)],
      ['Aprovado por', item.approved_by?.name ?? 'Administração'],
    ]} />
    <Button variant="link" className="mt-1.5 justify-self-start" onClick={() => { onClose(); onOpenUser(item.user.id) }}>Ver perfil de {item.user.name.trim().split(/\s+/)[0]}</Button>
    {!revoking
      ? <SheetActions><Button variant="secondary" onClick={() => { setRevoking(true); setError('') }}><ShieldOff size={17} aria-hidden="true" />Revogar permissão</Button></SheetActions>
      : <div className="mt-3 grid gap-2.5 rounded-card p-3.5 shadow-[inset_0_0_0_1.5px_#b9374955]">
        <label htmlFor={`${id}-reason`} className="m-0 text-[13px] font-bold">Motivo da revogação</label>
        <textarea id={`${id}-reason`} data-autofocus className={textareaClass} rows={3} maxLength={ORGANIZER_LIMITS.detailMax} value={reason}
          aria-invalid={Boolean(problem)} aria-describedby={problem ? `${id}-problem` : `${id}-hint`} onChange={event => setReason(event.target.value)} />
        {problem
          ? <p id={`${id}-problem`} className={errorClass} role="alert">{problem}</p>
          : <p id={`${id}-hint`} className="text-[11px] leading-[1.5] text-ink-muted">A pessoa recebe o motivo nas notificações e deixa de ver a seção Organizador.</p>}
        <SheetActions className="mt-0">
          <Button variant="secondary" disabled={busy} onClick={() => { setRevoking(false); setAttempted(false); setError('') }}>Voltar</Button>
          <Button className="bg-danger-ink shadow-none hover:bg-[#9a1e14]" disabled={busy} onClick={() => void revoke()}>{busy ? 'Revogando…' : 'Revogar'}</Button>
        </SheetActions>
      </div>}
    <div aria-live="polite">{error && <p className={feedbackVariants()} role="alert">{error}</p>}</div>
  </Sheet>
}

/** Organizadores ativos (`GET /admin/organizers`). */
function OrganizerList({ onOpenUser, onNotice, onExpired }: { onOpenUser: (id: number) => void; onNotice: (text: string) => void; onExpired: () => void }) {
  const list = usePagedList<AdminOrganizer>(ADMIN_ORGANIZERS_PATH, onExpired)
  const [open, setOpen] = useState<AdminOrganizer | null>(null)
  return <>
    <ListState loading={list.loading} error={list.error} onRetry={list.reload} empty={!list.items.length}
      emptyTitle="Nenhum organizador ativo" emptyText="Quem tiver o pedido aprovado aparece aqui." />
    {!list.loading && !list.error && list.items.length > 0 && <ul className="grid gap-2" aria-label="Organizadores ativos">
      {list.items.map(item => <QueueRow key={item.id} person={item.user} title={item.display_name}
        text={`${item.user.name} · desde ${shortDate(item.approved_at)}`} onOpen={() => setOpen(item)} />)}
    </ul>}
    {list.moreError && <p className={feedbackVariants()} role="alert">{list.moreError}</p>}
    {list.hasMore && <Button variant="secondary" className="mt-[18px] w-full" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais organizadores</Button>}
    {open && <OrganizerSheet item={open} onClose={() => setOpen(null)} onOpenUser={onOpenUser} onExpired={onExpired}
      onRevoked={() => {
        list.setItems(old => old.filter(item => item.id !== open.id))
        setOpen(null)
        onNotice(`Permissão de ${open.display_name} revogada.`)
      }} />}
  </>
}

/**
 * Fila "Pedidos de organizador" da administração (AD1): abas Para analisar | Decididos | Organizadores, folha
 * do pedido com Aprovar | Recusar (motivo obrigatório) e revogação dos organizadores ativos.
 */
export default function AdminOrganizerRequests({ onOpenUser, onExpired }: { onOpenUser: (id: number) => void; onExpired: () => void }) {
  const ids = useId()
  const [tab, setTab] = useState<AdminTab>('em_analise')
  const [notice, setNotice] = useState('')
  return <section aria-label="Pedidos de organizador">
    <p className="mb-1 flex items-start gap-2 text-[11.5px] leading-[1.5] text-ink-muted"><UserCheck size={16} className="mt-px flex-none text-brand" aria-hidden="true" />
      Aprove quem pode criar campeonatos e provas. A pessoa recebe a decisão nas notificações.</p>
    <Tabs variant="segmented" className="mt-1 grid-cols-3" items={tabs} value={tab} label="Filas do organizador" idPrefix={`${ids}-tab-`} controls={`${ids}-panel`}
      onChange={value => { setTab(value); setNotice('') }} />
    <div aria-live="polite">{notice && <p className={feedbackVariants({ tone: 'success' })} role="status">{notice}</p>}</div>
    <div id={`${ids}-panel`} role="tabpanel" aria-labelledby={`${ids}-tab-${tab}`} className="pt-1">
      {tab === 'organizadores'
        ? <OrganizerList onOpenUser={onOpenUser} onNotice={setNotice} onExpired={onExpired} />
        : <RequestQueue key={tab} queue={tab} onOpenUser={onOpenUser} onNotice={setNotice} onExpired={onExpired} />}
    </div>
  </section>
}

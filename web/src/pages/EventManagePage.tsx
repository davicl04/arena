import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CalendarDays, ChevronDown, ChevronRight, FileText, Flag, GitFork, Pencil, QrCode, Receipt, Trash2, Undo2, Users, XCircle } from 'lucide-react'
import { ApiError, sports } from '@/api/client'
import { getOrganizerEvent, PUBLISHED_STATES, submitEvent, withdrawEvent } from '@/api/events'
import type { OrganizerEventDetail } from '@/api/events'
import { EventPoster } from '@/components/events/EventPoster'
import { EventEntries } from '@/components/organizer/EventEntries'
import { EventNotices } from '@/components/organizer/EventNotices'
import { CancelEventSheet, DeleteDraftSheet, EditPublishedSheet } from '@/components/organizer/EventSheets'
import { entriesTitle, entrantsUnit, posterProps } from '@/components/organizer/eventView'
import { NextActionCard } from '@/components/organizer/NextActionCard'
import { teamButton } from '@/components/teams/styles'
import { DarkTopBar, TeamsPlate } from '@/components/teams/TeamsPlate'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { feedbackVariants } from '@/components/ui/feedback'
import { LoadError } from '@/components/ui/load-error'
import { toast } from '@/components/ui/toast'
import { eventFormatParts, pixKeyType, tiers } from '@/data/arena'
import { useResource } from '@/hooks/useResource'
import { useSubmit } from '@/hooks/useSubmit'
import { cn } from '@/lib/utils'
import { formatDeadline, formatPrice, plural } from '@/utils/format'

type SectionKey = 'entries' | 'data' | 'pix'
type SheetKind = 'cancel' | 'delete' | 'edit' | null

const rowClass = 'flex min-h-[58px] w-full items-center gap-3 border-0 bg-transparent px-0 py-2 text-left text-ink'
const rowIcon = 'grid size-[34px] flex-none place-items-center rounded-[10px] bg-[#005a3612] text-brand'

/** Rótulo e valor da linha de seção (`.nl`): título em negrito e o resumo abaixo. */
function RowText({ title, value, hot }: { title: string; value: ReactNode; hot?: boolean }) {
  return <span className="min-w-0 flex-1">
    <b className="block text-[13px]">{title}</b>
    <small className={cn('text-[10.5px] leading-[1.4]', hot ? 'font-bold text-danger' : 'text-ink-muted')}>{value}</small>
  </span>
}

/** Seção que abre na própria gestão (inscritos, dados, Pix). */
function SectionPanel({ id, Icon, title, value, hot, open, onOpenChange, children }: {
  id: string
  Icon: LucideIcon
  title: string
  value: ReactNode
  hot?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return <Collapsible open={open} onOpenChange={onOpenChange} className="border-0 border-b border-solid border-line last:border-b-0">
    <CollapsibleTrigger id={id} className={cn(rowClass, 'enabled:hover:bg-[#f6f7f9]')}>
      <span className={rowIcon}><Icon size={17} aria-hidden="true" /></span>
      <RowText title={title} value={value} hot={hot} />
      <ChevronDown size={17} aria-hidden="true" className={cn('flex-none text-ink-muted motion-safe:transition-transform', open && 'rotate-180')} />
    </CollapsibleTrigger>
    <CollapsibleContent className="pb-3">{children}</CollapsibleContent>
  </Collapsible>
}

/** Seção com tela própria (comprovantes e devoluções). */
function SectionLink({ Icon, title, value, hot, onClick }: { Icon: LucideIcon; title: string; value: ReactNode; hot?: boolean; onClick: () => void }) {
  return <div className="border-0 border-b border-solid border-line last:border-b-0">
    <button type="button" className={cn(rowClass, 'hover:bg-[#f6f7f9]')} onClick={onClick}>
      <span className={rowIcon}><Icon size={17} aria-hidden="true" /></span>
      <RowText title={title} value={value} hot={hot} />
      <ChevronRight size={17} aria-hidden="true" className="flex-none text-ink-muted" />
    </button>
  </div>
}

/** Seção que ainda não existe nesta etapa (chaveamento, partidas, resultados): apagada, sem ação. */
function SectionLater({ Icon, title, value }: { Icon: LucideIcon; title: string; value: string }) {
  return <div className="border-0 border-b border-solid border-line last:border-b-0">
    <div className={cn(rowClass, 'opacity-60')} aria-disabled="true">
      <span className={rowIcon}><Icon size={17} aria-hidden="true" /></span>
      <RowText title={title} value={value} />
    </div>
  </div>
}

/** Lista de dados (`dl`) do evento ou do Pix; valor ausente aparece como "—". */
function DataList({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className="m-0 grid gap-0 rounded-xl bg-subtle px-3 py-1">
    {rows.map(([label, value]) => <div key={label} className="grid grid-cols-[minmax(0,40%)_minmax(0,1fr)] gap-2 border-0 border-b border-solid border-line py-2 text-[11.5px] last:border-b-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={cn('m-0 font-semibold wrap-anywhere', (value === null || value === '') && 'font-normal text-ink-muted')}>{value === null || value === '' ? '—' : value}</dd>
    </div>)}
  </dl>
}

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Gestão do evento (G3): o cartaz no topo, o cartão "Agora" com a próxima ação da API e as seções — inscritos (lista
 * da API), comprovantes e devoluções (tela própria), chaveamento ou tabela e partidas (telas próprias, com os contadores
 * do cartaz; antes do sorteio ficam apagadas), dados do evento (editáveis conforme `editable_fields`) e pagamento/Pix —, o canal de avisos e as ações de excluir rascunho,
 * retirar da aprovação e cancelar.
 */
export default function EventManagePage({ eventId, onBack, onEdit, onReceipts, onBracket, onMatches, onDeleted, onExpired }: {
  eventId: number
  onBack: () => void
  /** Abre o assistente do rascunho no passo indicado (ou no primeiro incompleto). */
  onEdit: (step?: number) => void
  /** Comprovantes e devoluções (tela `event-receipts`). */
  onReceipts: () => void
  /** Chaveamento ou tabela do campeonato (tela `event-bracket`). */
  onBracket: () => void
  /** Partidas do campeonato: agenda e decisões (tela `event-matches`). */
  onMatches: () => void
  /** Rascunho excluído. */
  onDeleted: () => void
  onExpired: () => void
}) {
  const load = useCallback(() => getOrganizerEvent(eventId), [eventId])
  const resource = useResource(load, onExpired, { fallback: 'Não foi possível carregar o evento.' })
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ entries: false, data: false, pix: false })
  const [sheet, setSheet] = useState<SheetKind>(null)
  const action = useSubmit(onExpired)
  const detail = resource.data

  const toggle = (key: SectionKey) => (value: boolean) => setOpen(old => ({ ...old, [key]: value }))
  function update(next: OrganizerEventDetail, message: string) {
    resource.setData(next)
    toast.success(message)
  }

  if (!detail) {
    return <div>
      <TeamsPlate className="pb-4"><DarkTopBar eyebrow="Organizador" title="Gestão do evento" onBack={onBack} /></TeamsPlate>
      <div className="px-5 pt-4">
        {resource.loading && <p role="status" className="text-[12px] text-ink-muted">Carregando o evento…</p>}
        {resource.error && <LoadError size="screen" text={resource.error} cause={resource.errorCause} onRetry={resource.reload} />}
      </div>
    </div>
  }

  const paid = Boolean(detail.price_cents)
  const editable = detail.editable_fields.length > 0
  const draft = detail.state === 'rascunho'
  const published = detail.state === 'publicado' || detail.state === 'em_andamento'
  const beforeRegistration = draft || detail.state === 'em_aprovacao'
  const phaseOpen = beforeRegistration || detail.phase === 'inscricoes_abertas'
  const unit = entrantsUnit(detail.sport)
  const pending = detail.pending
  const refunds = pending.refunds_to_send + pending.refunds_awaiting + pending.refund_disputes
  const missing = detail.checklist.filter(item => !item.done).length
  const sportLabel = sports.find(sport => sport.value === detail.sport)?.label
  const format = detail.sport ? eventFormatParts({ sport: detail.sport, format: detail.format, distanceKm: detail.distance_km, eventType: detail.competition_type }) : []
  const tierText = detail.accepted_tiers ? detail.accepted_tiers.map(tier => tiers[tier]?.name ?? tier).join(', ') : 'Aberto a todos'
  const canEditPublished = published && detail.editable_fields.some(field => ['venue', 'course_notes', 'pix_instructions', 'contact'].includes(field))

  async function submit() {
    if (!detail) return
    const sent = await action.run(() => submitEvent(detail.id), paid ? 'Não foi possível enviar para aprovação.' : 'Não foi possível publicar.')
    if (sent) update(sent, sent.state === 'em_aprovacao' ? 'Enviado para aprovação. Você recebe a resposta nas notificações.' : 'Evento publicado: as inscrições estão abertas.')
    else getOrganizerEvent(detail.id).then(fresh => resource.setData(fresh)).catch((cause: unknown) => { if (cause instanceof ApiError && cause.status === 401) onExpired() })
  }
  async function withdraw() {
    if (!detail) return
    const back = await action.run(() => withdrawEvent(detail.id), 'Não foi possível retirar da aprovação.')
    if (back) update(back, 'Evento retirado da aprovação. Edite e envie de novo quando quiser.')
  }
  function showEntries() {
    setOpen(old => ({ ...old, entries: true }))
    requestAnimationFrame(() => {
      const trigger = document.getElementById('section-entries')
      trigger?.scrollIntoView?.({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
      trigger?.focus({ preventScroll: true })
    })
  }

  /* Chaveamento (ou Tabela) e Partidas: ficam apagadas até haver o que fazer; depois abrem as telas do campeonato. */
  const champ = detail.championship ?? null
  const treeTitle = detail.competition_type === 'todos_contra_todos' ? 'Tabela' : 'Chaveamento'
  const drawable = detail.state === 'publicado' && !phaseOpen && champ !== null && champ.confirmed >= 2
  const bracketReady = champ !== null && (champ.bracket === 'confirmado' || (detail.state === 'publicado' && (champ.bracket === 'sorteado' || drawable)))
  const bracketValue = champ === null ? (phaseOpen ? 'Depois das inscrições' : 'Em breve no Arena')
    : champ.bracket === 'confirmado' ? `Confirmado · ${plural(champ.matches_total, 'jogo', 'jogos')}`
    : champ.bracket === 'sorteado' ? 'Sorteio feito · falta confirmar'
    : phaseOpen ? 'Depois das inscrições'
    : drawable ? `Pronto para sortear · ${plural(champ.confirmed, 'confirmado', 'confirmados')}` : detail.state === 'publicado' ? 'Confirme pelo menos 2 inscrições' : 'Sem chaveamento'
  const bracketSection = bracketReady
    ? <SectionLink Icon={GitFork} title={treeTitle} value={bracketValue} hot={champ?.bracket === 'sorteado'} onClick={onBracket} />
    : <SectionLater Icon={GitFork} title={treeTitle} value={bracketValue} />
  const matchesReady = champ !== null && champ.bracket === 'confirmado'
  const matchesValue = !matchesReady ? (champ?.bracket === 'sorteado' ? 'Depois de confirmar o chaveamento' : phaseOpen ? 'Depois das inscrições' : 'Depois do sorteio')
    : [champ.to_decide && `${champ.to_decide} para decidir`, champ.to_schedule && `${champ.to_schedule} para agendar`, champ.scheduled && `${plural(champ.scheduled, 'agendada', 'agendadas')}`,
      champ.waiting && `${champ.waiting} esperando`, champ.finished && `${champ.finished} de ${champ.matches_total} encerradas`].filter(Boolean).join(' · ') || `${plural(champ.matches_total, 'jogo', 'jogos')}`
  const matchesSection = matchesReady
    ? <SectionLink Icon={CalendarDays} title="Partidas" value={matchesValue} hot={champ.attention > 0} onClick={onMatches} />
    : <SectionLater Icon={CalendarDays} title="Partidas" value={matchesValue} />

  const dataRows: [string, ReactNode][] = [
    ['Nome', detail.name],
    ['Modalidade', sportLabel ? [sportLabel, ...format].join(' · ') : null],
    ['Vagas', detail.capacity ? `${detail.capacity} ${unit}` : null],
    ['Elos aceitos', tierText],
    ['Início', formatDeadline(detail.starts_at)],
    ['Inscrições até', formatDeadline(detail.registration_closes_at)],
    ...(paid && detail.registration_deadline && detail.registration_deadline !== detail.registration_closes_at
      ? [['Fecham de fato', `${formatDeadline(detail.registration_deadline)} (12 h antes, por ser pago)`] as [string, ReactNode]] : []),
    ['Cidade', detail.city ? `${detail.city.name} · ${detail.city.state}` : null],
    ['Local', detail.venue],
    ...(detail.sport === 'corrida' ? [['Percurso', detail.course_notes] as [string, ReactNode]] : []),
    ['Inscrição', detail.price_cents == null ? null : formatPrice(detail.price_cents)],
    ['Contato', detail.contact],
  ]
  const pix = detail.pix
  const pixRows: [string, ReactNode][] = pix ? [
    ['Favorecido', pix.beneficiary],
    ['Tipo de chave', pix.key_type ? pixKeyType[pix.key_type].label : null],
    ['Chave', pix.key ? <code className="font-mono text-[11.5px]">{pix.key}</code> : null],
    ['Copia e Cola', pix.copy_paste ? 'Cadastrado' : 'Não informado'],
    ['Instruções', pix.instructions],
  ] : []

  return <div>
    <TeamsPlate className="pb-4">
      <DarkTopBar eyebrow="Organizador" title="Gestão do evento" onBack={onBack} />
      <div className="px-4 pt-3">
        <EventPoster {...posterProps(detail)} size="hero" />
      </div>
    </TeamsPlate>

    <div className="px-5 pt-4">
      {action.error && <p className={cn(feedbackVariants(), 'mb-3')} role="alert">{action.error}</p>}

      <NextActionCard detail={detail} busy={action.busy} onSubmit={() => void submit()} onWithdraw={() => void withdraw()}
        onFill={step => onEdit(step)} onReceipts={onReceipts} onShowEntries={showEntries} onBracket={onBracket} onMatches={onMatches} />

      <h2 className="mt-5 mb-2 text-[16px]">Seções</h2>
      <div className="rounded-card bg-white px-3.5">
        {beforeRegistration
          ? <SectionLater Icon={Users} title={entriesTitle(detail.sport)} value={detail.capacity ? `0 de ${detail.capacity} · depois de publicar` : 'Depois de publicar'} />
          : <SectionPanel id="section-entries" Icon={Users} title={entriesTitle(detail.sport)} open={open.entries} onOpenChange={toggle('entries')}
            value={detail.capacity ? `${detail.entries_count} de ${detail.capacity} ${unit} · ${detail.confirmed_count} confirmados` : `${detail.entries_count} ${unit}`}>
            {open.entries && <EventEntries eventId={detail.id} onReceipts={onReceipts} onExpired={onExpired} />}
          </SectionPanel>}
        {paid && !beforeRegistration && <SectionLink Icon={Receipt} title="Comprovantes" onClick={onReceipts} hot={pending.receipts > 0}
          value={pending.receipts ? `${plural(pending.receipts, 'comprovante', 'comprovantes')} para analisar` : 'Nenhum pendente'} />}
        {refunds > 0 && <SectionLink Icon={Undo2} title="Devoluções" onClick={onReceipts} hot={pending.refunds_to_send > 0}
          value={[pending.refunds_to_send && `${pending.refunds_to_send} para enviar`, pending.refunds_awaiting && `${pending.refunds_awaiting} aguardando`,
            pending.refund_disputes && `${pending.refund_disputes} contestadas`].filter(Boolean).join(' · ')} />}
        {detail.sport === 'corrida'
          ? <SectionLater Icon={Flag} title="Resultados" value={phaseOpen ? 'Depois da prova' : 'Em breve no Arena'} />
          : <>
            {bracketSection}
            {matchesSection}
          </>}
        <SectionPanel id="section-data" Icon={FileText} title="Dados do evento" open={open.data} onOpenChange={toggle('data')} hot={draft && missing > 0}
          value={draft ? (missing ? `${missing === 1 ? 'Falta 1 item' : `Faltam ${missing} itens`} do checklist` : 'Rascunho completo') : 'Modalidade, datas, local e elos'}>
          <DataList rows={dataRows} />
          {detail.tennis_bonus && <p className="mt-2 text-[10.5px] leading-[1.5] text-ink-muted">
            Bônus do ranking do tênis (RN16): campeão +{detail.tennis_bonus.champion}, vice +{detail.tennis_bonus.runner_up} e semifinalistas +{detail.tennis_bonus.semifinalist}, com pelo menos {detail.tennis_bonus.min_entries} inscritos{detail.tennis_bonus.applies ? ' (já vale).' : '.'}
          </p>}
          {draft && editable && <button type="button" className={cn(teamButton({ tone: 'outline', size: 'sm' }), 'mt-2.5')} onClick={() => onEdit()}><Pencil aria-hidden="true" />Editar no assistente</button>}
          {canEditPublished && <button type="button" className={cn(teamButton({ tone: 'outline', size: 'sm' }), 'mt-2.5')} onClick={() => setSheet('edit')}><Pencil aria-hidden="true" />Editar local e contato</button>}
          {!draft && !published && detail.state !== 'em_aprovacao' && <p className="mt-2 text-[10.5px] text-ink-muted">Este evento não pode mais ser editado.</p>}
          {detail.state === 'em_aprovacao' && <p className="mt-2 text-[10.5px] text-ink-muted">Para editar, retire o evento da aprovação.</p>}
        </SectionPanel>
        <SectionPanel id="section-pix" Icon={QrCode} title="Pagamento e Pix" open={open.pix} onOpenChange={toggle('pix')}
          value={detail.price_cents == null ? 'Gratuito ou pago: a definir' : paid ? `${formatPrice(detail.price_cents)} · chave, Copia e Cola e instruções` : 'Evento gratuito'}>
          {paid && pix ? <>
            <DataList rows={pixRows} />
            <p className="mt-2 text-[10.5px] leading-[1.5] text-ink-muted">Só aparece para quem está logado. O Arena não recebe pagamentos: só registra os comprovantes.</p>
          </> : <p className="text-[11.5px] leading-[1.5] text-ink-muted">{detail.price_cents == null ? 'Escolha no assistente se a inscrição é gratuita ou paga.' : 'Evento gratuito: sem Pix e sem comprovantes.'}</p>}
          {draft && editable && <button type="button" className={cn(teamButton({ tone: 'outline', size: 'sm' }), 'mt-2.5')} onClick={() => onEdit(4)}><Pencil aria-hidden="true" />Editar inscrição e Pix</button>}
        </SectionPanel>
      </div>

      {PUBLISHED_STATES.includes(detail.state) && <EventNotices key={detail.state} eventId={detail.id} canWrite={!detail.revocation_pending} onExpired={onExpired} />}

      {(draft || published) && editable && <div className="mt-6 border-0 border-t border-solid border-line pt-4">
        {draft && <Button variant="text" className="flex items-center gap-1.5 text-danger-ink no-underline" onClick={() => setSheet('delete')}><Trash2 size={16} aria-hidden="true" />Excluir rascunho</Button>}
        {published && <>
          <button type="button" className={cn(teamButton({ tone: 'outline', size: 'md' }), 'w-full border-danger/40 text-danger')} onClick={() => setSheet('cancel')}>
            <XCircle aria-hidden="true" />Cancelar evento
          </button>
          <p className="mt-2 text-[10.5px] leading-[1.5] text-ink-muted">
            {paid ? 'As inscrições pagas viram “Devolução pendente”: você devolve por Pix e anexa o comprovante de cada devolução.' : 'As inscrições são canceladas e os inscritos, avisados.'}
          </p>
        </>}
      </div>}
    </div>

    {sheet === 'cancel' && <CancelEventSheet detail={detail} onClose={() => setSheet(null)} onExpired={onExpired}
      onCancelled={next => { setSheet(null); update(next, 'Evento cancelado. Os inscritos foram avisados no canal e nas notificações.') }} />}
    {sheet === 'delete' && <DeleteDraftSheet detail={detail} onClose={() => setSheet(null)} onExpired={onExpired} onDeleted={() => { setSheet(null); onDeleted() }} />}
    {sheet === 'edit' && <EditPublishedSheet detail={detail} onClose={() => setSheet(null)} onExpired={onExpired}
      onSaved={next => { setSheet(null); update(next, 'Dados do evento salvos.') }} />}
  </div>
}

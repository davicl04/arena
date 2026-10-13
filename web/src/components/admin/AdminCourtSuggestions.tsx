import { useCallback, useId, useState } from 'react'
import { Check, Info, MapPin, MapPinned, TriangleAlert, X } from 'lucide-react'
import { ApiError } from '@/api/client'
import { COURT_LIMITS, courtKindLabel, courtPublishError, courtRejectError, courtSuggestionsPath, decideCourt } from '@/api/admin'
import type { AdminCourtSuggestion, CourtDecisionInput, CourtQueue, MatchRef } from '@/api/admin'
import { getMatch } from '@/api/matches'
import type { CourtOut } from '@/api/matches'
import { errorClass } from '@/components/organizer/fieldStyles'
import { StateBadge } from '@/components/events/StateBadge'
import { usePagedList } from '@/hooks/usePagedList'
import { useResource } from '@/hooks/useResource'
import { useSubmit } from '@/hooks/useSubmit'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { Sheet, SheetActions } from '@/components/ui/sheet'
import { Tabs } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'
import { footballFormat } from '@/data/arena'
import { formatDeadline } from '@/utils/format'
import { relativeTime } from '@/utils/relativeTime'
import { ReasonPanel } from './AdminEventParts'
import { ListState } from './AdminOrganizerRequests'
import { TileRow } from './AdminMatchParts'
import { matchTitle } from './adminMatchView'
import { InfoList } from './OrganizerRequestSheet'

const tabs = [
  { value: 'em_revisao', label: 'Para analisar' },
  { value: 'decididas', label: 'Decididas' },
] as const

const place = (court: CourtOut) => `${court.city.name} · ${court.city.state}`
const category = (court: CourtOut) => courtKindLabel[court.kind]

/** "Partida #12 · Society · seg, 20 out · 16:00". */
function originText(match: MatchRef) {
  const format = match.format ? footballFormat[match.format].label : 'Tênis'
  const when = formatDeadline(match.starts_at)
  return `Partida #${match.id} · ${format}${when ? ` · ${when}` : ''}`
}

/** Partida de origem: os dados do `MatchRef` e, se a leitura da partida responder, os nomes dos lados. */
function OriginMatch({ match, onExpired }: { match: MatchRef; onExpired: () => void }) {
  const load = useCallback(() => getMatch(match.id), [match.id])
  const sides = useResource(load, onExpired, { fallback: '' })
  return <>
    {sides.data && <span className="block">{matchTitle(sides.data.sides)}</span>}
    <span className="block font-medium text-ink-muted">{originText(match)}</span>
  </>
}

/** Aviso de possível duplicidade: quadras publicadas parecidas na mesma cidade e tipo. */
function DuplicateWarning({ duplicates }: { duplicates: CourtOut[] }) {
  return <section aria-label="Possível duplicidade" className="mt-3 rounded-xl bg-warning-bg p-3 text-warning">
    <p className="flex items-center gap-2 text-[12px] font-bold"><TriangleAlert size={16} aria-hidden="true" />Possível duplicidade</p>
    <p className="mt-1 text-[11.5px] leading-[1.5]">Já há quadras parecidas publicadas nesta cidade. Se for o mesmo lugar, rejeite apontando a quadra do catálogo.</p>
    <ul className="mt-1.5 grid gap-1 text-[11.5px] font-semibold">
      {duplicates.map(court => <li key={court.id} className="wrap-anywhere">{court.name}{court.address ? ` · ${court.address}` : ''}</li>)}
    </ul>
  </section>
}

/**
 * Folha da sugestão: dados, aviso de duplicidade e a decisão. Publicar (com a correção opcional de nome e endereço)
 * ou rejeitar com motivo, ou apontando a quadra duplicada do catálogo (o motivo passa a ser opcional).
 */
function CourtSheet({ item, onClose, onDecided, onStale, onExpired }: {
  item: AdminCourtSuggestion
  onClose: () => void
  onDecided: (message: string) => void
  /** A sugestão já foi decidida em outro lugar (409/404): o `useSubmit` avisa com a mensagem do servidor; a fila recarrega e a folha fecha. */
  onStale: () => void
  onExpired: () => void
}) {
  const id = useId()
  const { court, suggested_by: by, origin_match: origin, possible_duplicates: duplicates } = item
  const [mode, setMode] = useState<'publish' | 'reject' | null>(null)
  const [name, setName] = useState(court.name)
  const [address, setAddress] = useState(court.address ?? '')
  const [duplicateId, setDuplicateId] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [attempted, setAttempted] = useState(false)
  const { busy, error, setError, run } = useSubmit(onExpired)
  const publishProblems = attempted ? courtPublishError(name, address) : {}
  const rejectProblem = attempted ? courtRejectError(reason, duplicateId !== null) : null
  const chosen = duplicates.find(other => other.id === duplicateId)

  function decide(input: CourtDecisionInput, fallback: string) {
    // 404 e "já foi decidida" são sugestão fora da fila; o 409 de nome repetido fica na folha (rejeitar como duplicada).
    return run(() => decideCourt(court.id, input), fallback, cause => {
      if (cause instanceof ApiError && (cause.status === 404 || (cause.status === 409 && /já foi decidida/i.test(cause.message)))) onStale()
    })
  }
  async function publish() {
    setAttempted(true)
    if (Object.keys(courtPublishError(name, address)).length) return
    const input: CourtDecisionInput = { decision: 'publicar' }
    if (name.trim() !== court.name) input.name = name.trim()
    if (address.trim() !== (court.address ?? '')) input.address = address.trim() || null
    const decided = await decide(input, 'Não foi possível publicar a quadra.')
    if (decided) onDecided(`${decided.court.name} entrou no catálogo de ${decided.court.city.name}.`)
  }
  async function reject() {
    setAttempted(true)
    if (courtRejectError(reason, duplicateId !== null)) return
    const input: CourtDecisionInput = { decision: 'rejeitar' }
    if (reason.trim()) input.reason = reason.trim()
    if (duplicateId !== null) input.duplicate_of_id = duplicateId
    const decided = await decide(input, 'Não foi possível rejeitar a sugestão.')
    if (decided) onDecided(chosen ? `${court.name} rejeitada como duplicada de ${chosen.name}.` : `Sugestão ${court.name} rejeitada.`)
  }
  const back = () => { setMode(null); setAttempted(false); setError('') }

  return <Sheet title="Sugestão de quadra" description={`${court.name} · ${place(court)}`} onClose={onClose}>
    <InfoList items={[
      ['Nome', court.name],
      ['Endereço', court.address ?? '—'],
      ['Cidade', place(court)],
      ['Tipo', category(court)],
      ['Sugerida por', by ? `${by.name} · ${relativeTime(item.created_at)}` : `Conta removida · ${relativeTime(item.created_at)}`],
      ['Partida de origem', origin ? <OriginMatch match={origin} onExpired={onExpired} /> : '—'],
    ]} />
    {duplicates.length > 0 && <DuplicateWarning duplicates={duplicates} />}

    {mode === null && <SheetActions>
      <Button disabled={busy} onClick={() => { setMode('publish'); setError('') }}><Check size={17} aria-hidden="true" />Publicar</Button>
      <Button variant="secondary" disabled={busy} onClick={() => { setMode('reject'); setError('') }}><X size={17} aria-hidden="true" />Rejeitar</Button>
    </SheetActions>}

    {mode === 'publish' && <div className="mt-3 grid gap-2.5 rounded-card p-3.5 shadow-[inset_0_0_0_1.5px_#005a3655]">
      <b className="text-[13px]">Publicar no catálogo</b>
      <label htmlFor={`${id}-name`} className="m-0">Nome da quadra</label>
      <input id={`${id}-name`} data-autofocus value={name} maxLength={COURT_LIMITS.nameMax} aria-invalid={Boolean(publishProblems.name)}
        aria-describedby={publishProblems.name ? `${id}-name-error` : undefined} className="aria-invalid:border-error" onChange={event => setName(event.target.value)} />
      {publishProblems.name && <p id={`${id}-name-error`} className={errorClass} role="alert">{publishProblems.name}</p>}
      <label htmlFor={`${id}-address`} className="m-0">Endereço (opcional)</label>
      <input id={`${id}-address`} value={address} maxLength={COURT_LIMITS.addressMax} aria-invalid={Boolean(publishProblems.address)}
        aria-describedby={publishProblems.address ? `${id}-address-error` : undefined} className="aria-invalid:border-error" onChange={event => setAddress(event.target.value)} />
      {publishProblems.address && <p id={`${id}-address-error`} className={errorClass} role="alert">{publishProblems.address}</p>}
      <p className="flex items-start gap-2 text-[11px] leading-[1.5] text-ink-muted"><Info size={15} className="mt-px flex-none text-brand" aria-hidden="true" />
        A quadra entra no catálogo de {court.city.name} para qualquer partida. Corrija o nome ou o endereço, se precisar; quem sugeriu é avisado.</p>
      <SheetActions className="mt-0">
        <Button variant="secondary" disabled={busy} onClick={back}>Voltar</Button>
        <Button disabled={busy} onClick={() => void publish()}>{busy ? 'Publicando…' : 'Publicar quadra'}</Button>
      </SheetActions>
    </div>}

    {mode === 'reject' && <ReasonPanel title="Rejeitar sugestão" max={COURT_LIMITS.reasonMax}
      options={duplicates.length ? duplicates.map(other => ({ value: String(other.id), label: `Duplicada: ${other.name}` })) : undefined}
      option={duplicateId === null ? null : String(duplicateId)}
      onOption={value => setDuplicateId(current => current === Number(value) ? null : Number(value))}
      textLabel={`Motivo da recusa ${duplicateId === null ? '(obrigatório)' : '(opcional)'}`} text={reason} onText={setReason}
      error={rejectProblem}
      note={chosen
        ? `As partidas que usavam esta sugestão passam a usar ${chosen.name}, do catálogo, sem novo aceite.`
        : 'Quem sugeriu vê o motivo nas notificações. A partida segue com a quadra combinada, marcada como "Sugestão recusada".'}
      confirmLabel="Rejeitar sugestão" busyLabel="Rejeitando…" busy={busy} onConfirm={() => void reject()} onCancel={back} />}
    {error && <p className={feedbackVariants()} role="alert">{error}</p>}
  </Sheet>
}

/** Fila de sugestões (`GET /admin/court-suggestions`): em revisão, com a folha de decisão; decididas, só leitura. */
function CourtQueueList({ queue, onExpired }: { queue: CourtQueue; onExpired: () => void }) {
  const list = usePagedList<AdminCourtSuggestion>(courtSuggestionsPath(queue), onExpired)
  const [open, setOpen] = useState<AdminCourtSuggestion | null>(null)
  const pending = queue === 'em_revisao'
  return <>
    <ListState loading={list.loading} error={list.error} onRetry={list.reload} empty={!list.items.length}
      emptyTitle={pending ? 'Nada para analisar' : 'Nenhuma sugestão decidida'}
      emptyText={pending ? 'Quando um time sugerir uma quadra que não está no catálogo, ela aparece aqui.' : 'As quadras publicadas e as rejeitadas aparecem aqui.'} />
    {!list.loading && !list.error && list.items.length > 0 && <ul className="grid gap-2" aria-label={pending ? 'Sugestões para analisar' : 'Sugestões decididas'}>
      {list.items.map(item => {
        const { court, suggested_by: by, origin_match: origin } = item
        const base = [court.address ?? 'Sem endereço', `${category(court)} · ${place(court)}`]
        if (pending) {
          return <TileRow key={court.id} Icon={MapPin} title={court.name} onOpen={() => setOpen(item)}
            lines={[...base, `Sugerida por ${by?.name ?? 'conta removida'} ${relativeTime(item.created_at)}${origin ? ` · partida #${origin.id}` : ''}`]}
            badge={item.possible_duplicates.length > 0 ? <StateBadge tone="pending">Possível duplicidade</StateBadge> : undefined} />
        }
        const published = court.state === 'publicada'
        const why = item.duplicate_of ? `Duplicada de ${item.duplicate_of.name}${item.review_reason ? `: ${item.review_reason}` : ''}` : item.review_reason
        return <TileRow key={court.id} Icon={MapPinned} title={court.name}
          lines={[...base, `Sugerida por ${by?.name ?? 'conta removida'}${item.reviewed_at ? ` · decidida ${relativeTime(item.reviewed_at)}` : ''}`, ...(why ? [why] : [])]}
          badge={<StateBadge tone={published ? 'open' : 'danger'}>{published ? 'Publicada' : 'Rejeitada'}</StateBadge>} />
      })}
    </ul>}
    {list.moreError && <p className={feedbackVariants()} role="alert">{list.moreError}</p>}
    {list.hasMore && <Button variant="secondary" className="mt-[18px] w-full" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais sugestões</Button>}
    {open && <CourtSheet item={open} onClose={() => setOpen(null)} onExpired={onExpired}
      onDecided={message => {
        list.setItems(old => old.filter(item => item.court.id !== open.court.id))
        setOpen(null)
        toast.success(message)
      }}
      onStale={() => { setOpen(null); list.reload() }} />}
  </>
}

/**
 * Fila "Sugestões de quadra" da administração (0002-jogar, seção 10.4): abas Para analisar | Decididas. Publicar
 * coloca a quadra no catálogo da cidade; rejeitar exige o motivo, salvo quando aponta a quadra duplicada.
 */
export default function AdminCourtSuggestions({ onExpired }: { onExpired: () => void }) {
  const ids = useId()
  const [tab, setTab] = useState<CourtQueue>('em_revisao')
  return <section aria-label="Sugestões de quadra">
    <p className="mb-1 flex items-start gap-2 text-[11.5px] leading-[1.5] text-ink-muted"><MapPin size={16} className="mt-px flex-none text-brand" aria-hidden="true" />
      As quadras sugeridas valem só na partida de origem até a sua decisão. Publique as que existem; quem sugeriu recebe a resposta nas notificações.</p>
    <Tabs variant="segmented" className="mt-1" items={tabs} value={tab} label="Filas de quadras" idPrefix={`${ids}-tab-`} controls={`${ids}-panel`}
      onChange={setTab} />
    <div id={`${ids}-panel`} role="tabpanel" aria-labelledby={`${ids}-tab-${tab}`} className="pt-1">
      <CourtQueueList key={tab} queue={tab} onExpired={onExpired} />
    </div>
  </section>
}

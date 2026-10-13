import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleCheck, Gavel, Scale, X } from 'lucide-react'
import { ApiError } from '@/api/client'
import { decideWalkover, WALKOVER_DISPUTES_PATH, WALKOVER_REASON_MESSAGE, reasonError } from '@/api/admin'
import type { DisputeMatch, WalkoverDecision, WalkoverDispute } from '@/api/admin'
import { getMessages } from '@/api/matches'
import type { MatchSideOut, WalkoverOut } from '@/api/matches'
import { StateBadge } from '@/components/events/StateBadge'
import { usePagedList } from '@/hooks/usePagedList'
import { useResource } from '@/hooks/useResource'
import { useSubmit } from '@/hooks/useSubmit'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { Sheet, SheetActions } from '@/components/ui/sheet'
import { footballFormat } from '@/data/arena'
import { formatDeadline } from '@/utils/format'
import { relativeTime } from '@/utils/relativeTime'
import { ReasonPanel } from './AdminEventParts'
import { ListState } from './AdminOrganizerRequests'
import { TileRow } from './AdminMatchParts'
import { matchTitle, sheetEyebrow, sideName } from './adminMatchView'
import { InfoList } from './OrganizerRequestSheet'

/** Placar do W.O. (RN: 3×0 no futebol, 6-0 6-0 no tênis), para o lado que compareceu. */
const walkoverScore = { futebol: '3 × 0', tenis: '6-0 6-0' } as const

/** Quantas mensagens do chat a administração lê para decidir. */
const CHAT_EXCERPT = 12

const otherSide = (side: 'a' | 'b') => (side === 'a' ? 'b' : 'a')
const sideOf = (match: DisputeMatch, side: 'a' | 'b'): MatchSideOut | undefined => match.sides.find(item => item.side === side)
const modality = (match: DisputeMatch) => (match.format ? footballFormat[match.format].label : match.sport === 'tenis' ? 'Tênis' : 'Futebol')

/** Quem fez o registro ou a contestação: pessoa, lado, horário e, na contestação, o motivo. */
function Party({ title, person, side, role, at, reason }: {
  title: string; person: WalkoverDispute['walkover']['registered_by']; side: MatchSideOut | undefined; role: string; at: string | null; reason?: string | null
}) {
  return <section aria-label={title} className="mt-2.5 rounded-xl border border-solid border-line p-3">
    <p className="text-[9px] font-extrabold tracking-[0.08em] text-ink-muted uppercase">{title}</p>
    <b className="mt-0.5 block text-[13px] wrap-anywhere">{person?.name ?? 'Conta indisponível'}</b>
    <small className="text-[11px] text-ink-muted">{sideName(side)} · {role}{at ? ` · ${formatDeadline(at)}` : ''}</small>
    {reason !== undefined && <blockquote className="mt-2 rounded-xl border-l-4 border-solid border-danger bg-[#fff0f2] px-3 py-2.5 text-[12px] leading-[1.5] whitespace-pre-line wrap-anywhere">
      {reason ?? 'Sem motivo informado.'}
    </blockquote>}
  </section>
}

/** Trecho do chat: a administração lê as últimas mensagens para decidir (0002-jogar, seção 8). */
function ChatExcerpt({ match, onExpired }: { match: DisputeMatch; onExpired: () => void }) {
  const load = useCallback(() => getMessages(match.id, { limit: CHAT_EXCERPT }), [match.id])
  const chat = useResource(load, onExpired, { fallback: 'Não foi possível carregar o chat da partida.' })
  const lines = chat.data?.items ?? []
  const list = useRef<HTMLOListElement>(null)
  // As últimas mensagens são as que importam: a lista abre rolada até o fim.
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight }, [lines.length])
  return <section aria-label="Trecho do chat da partida">
    <p className={sheetEyebrow}>Chat da partida</p>
    {chat.loading && <p role="status" className="mt-1 text-[11.5px] text-ink-muted">Carregando o chat…</p>}
    {chat.error && <p role="alert" className="mt-1 text-[11.5px] text-error">{chat.error} <Button variant="text" className="inline min-h-0" onClick={chat.reload}>Tentar novamente</Button></p>}
    {chat.data && !lines.length && <p className="mt-1 text-[11.5px] text-ink-muted">Nenhuma mensagem no chat.</p>}
    {lines.length > 0 && <>
      <ol ref={list} tabIndex={0} className="mt-1.5 grid max-h-[220px] gap-1.5 overflow-y-auto rounded-xl bg-subtle p-2.5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus" aria-label="Mensagens do chat">
        {lines.map(line => line.kind === 'evento'
          ? <li key={line.id} className="text-center text-[10.5px] leading-[1.4] text-ink-muted italic wrap-anywhere">{line.body}</li>
          : <li key={line.id} className="rounded-lg bg-white px-2.5 py-2 text-[11.5px] leading-[1.45]">
            <b>{line.author?.name ?? 'Conta indisponível'}</b>
            <small className="inline text-[10px] text-ink-muted"> · {sideName(sideOf(match, line.side ?? 'a'))} · {formatDeadline(line.created_at)}</small>
            <p className={line.removed ? 'mt-0.5 text-ink-muted italic' : 'mt-0.5 wrap-anywhere'}>{line.removed ? 'Mensagem removida' : line.body}</p>
          </li>)}
      </ol>
      {chat.data?.has_more && <small className="mt-1 text-[10.5px] text-ink-muted">Mostrando as últimas {lines.length} mensagens.</small>}
    </>}
  </section>
}

/**
 * Folha do W.O. contestado: quem registrou, quem contestou (com o motivo), o trecho do chat e a decisão. Manter dá a
 * vitória a quem compareceu (3×0 ou 6-0 6-0) e encerra a partida; anular a deixa sem resultado. Os dois exigem a justificativa.
 */
function DisputeSheet({ dispute, onClose, onDecided, onStale, onExpired }: {
  dispute: WalkoverDispute
  onClose: () => void
  onDecided: (message: string) => void
  /** O W.O. já foi decidido (409/404): a fila recarrega e a folha fecha. */
  onStale: (message: string) => void
  onExpired: () => void
}) {
  const { match, walkover } = dispute
  const absent = sideOf(match, walkover.absent_side)
  const present = sideOf(match, otherSide(walkover.absent_side))
  const [decision, setDecision] = useState<WalkoverDecision | null>(null)
  const [reason, setReason] = useState('')
  const [attempted, setAttempted] = useState(false)
  const { busy, error, setError, run } = useSubmit(onExpired)
  const title = matchTitle(match.sides)
  const score = walkoverScore[match.sport]

  async function decide() {
    setAttempted(true)
    if (!decision || reasonError(reason, WALKOVER_REASON_MESSAGE)) return
    let stale = ''
    const decided = await run(async () => {
      try { return await decideWalkover(match.id, decision, reason) } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 409)) stale = cause.message
        throw cause
      }
    }, 'Não foi possível registrar a decisão.')
    if (!decided && stale) onStale(stale)
    if (decided) onDecided(decision === 'manter'
      ? `W.O. mantido: vitória de ${sideName(present)} por ${score}.`
      : `W.O. anulado: ${title} ficou sem resultado.`)
  }
  const back = () => { setDecision(null); setAttempted(false); setError('') }

  return <Sheet title="W.O. contestado" description={title} onClose={onClose}>
    <InfoList items={[
      ['Partida', `${modality(match)} · #${match.id}`],
      ['Horário', formatDeadline(match.starts_at) || '—'],
      ['Quadra', match.court?.name ?? '—'],
      ['Lado ausente', sideName(absent)],
    ]} />
    <Party title="Registrou o W.O." person={walkover.registered_by} side={present} role="compareceu" at={walkover.registered_at} />
    <Party title="Contestou" person={walkover.contested_by} side={absent} role="lado ausente" at={walkover.contested_at} reason={walkover.contest_reason} />
    <ChatExcerpt match={match} onExpired={onExpired} />

    {!decision && <SheetActions>
      <Button disabled={busy} onClick={() => { setDecision('manter'); setError('') }}><CircleCheck size={17} aria-hidden="true" />Manter o W.O.</Button>
      <Button variant="secondary" disabled={busy} onClick={() => { setDecision('anular'); setError('') }}><X size={17} aria-hidden="true" />Anular</Button>
    </SheetActions>}
    {decision && <ReasonPanel tone={decision === 'manter' ? 'brand' : 'danger'}
      title={decision === 'manter' ? 'Manter o W.O.' : 'Anular o W.O.'}
      textLabel="Justificativa da decisão (os dois lados veem)" text={reason} onText={setReason}
      error={attempted ? reasonError(reason, WALKOVER_REASON_MESSAGE) : null}
      note={decision === 'manter'
        ? `Vale ${score} para ${sideName(present)}: a partida é encerrada e o ranking é recalculado.`
        : 'A partida fica sem resultado e ninguém pontua. Os dois lados recebem a decisão nas notificações.'}
      confirmLabel={decision === 'manter' ? 'Manter o W.O.' : 'Anular o W.O.'} busyLabel="Registrando…" busy={busy}
      onConfirm={() => void decide()} onCancel={back} />}
    <div aria-live="polite">{error && <p className={feedbackVariants()} role="alert">{error}</p>}</div>
  </Sheet>
}

/** Resumo da linha: quem registrou e quem contestou. */
const rowLines = (match: DisputeMatch, walkover: WalkoverOut) => [
  `${modality(match)}${match.starts_at ? ` · ${formatDeadline(match.starts_at)}` : ''}`,
  `Registrado por ${walkover.registered_by?.name ?? 'conta indisponível'} · contestado por ${walkover.contested_by?.name ?? 'conta indisponível'}${walkover.contested_at ? ` ${relativeTime(walkover.contested_at)}` : ''}`,
]

/** Fila "W.O. contestados": a contestação mais antiga primeiro; a administração decide cada uma. */
export default function AdminWalkoverDisputes({ onExpired }: { onExpired: () => void }) {
  const list = usePagedList<WalkoverDispute>(WALKOVER_DISPUTES_PATH, onExpired)
  const [open, setOpen] = useState<WalkoverDispute | null>(null)
  const [notice, setNotice] = useState('')
  return <section aria-label="W.O. contestados">
    <p className="mb-3 flex items-start gap-2 text-[11.5px] leading-[1.5] text-ink-muted"><Scale size={16} className="mt-px flex-none text-brand" aria-hidden="true" />
      O lado que faltou disse que compareceu. Leia os dois relatos e o chat; a partida só fecha com a sua decisão.</p>
    <div aria-live="polite">{notice && <p className={feedbackVariants({ tone: 'success' })} role="status">{notice}</p>}</div>
    <ListState loading={list.loading} error={list.error} onRetry={list.reload} empty={!list.items.length}
      emptyTitle="Nenhum W.O. contestado" emptyText="Quando um time contestar um W.O., ele aparece aqui e nas notificações." />
    {!list.loading && !list.error && list.items.length > 0 && <ul className="grid gap-2" aria-label="W.O. para decidir">
      {list.items.map(item => <TileRow key={item.match.id} Icon={Gavel} title={matchTitle(item.match.sides)} lines={rowLines(item.match, item.walkover)}
        badge={<StateBadge tone="pending">Aguarda decisão</StateBadge>} onOpen={() => { setOpen(item); setNotice('') }} />)}
    </ul>}
    {list.moreError && <p className={feedbackVariants()} role="alert">{list.moreError}</p>}
    {list.hasMore && <Button variant="secondary" className="mt-[18px] w-full" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais W.O.</Button>}
    {open && <DisputeSheet dispute={open} onClose={() => setOpen(null)} onExpired={onExpired}
      onDecided={message => {
        list.setItems(old => old.filter(item => item.match.id !== open.match.id))
        setOpen(null)
        setNotice(message)
      }}
      onStale={message => { setOpen(null); setNotice(message); list.reload() }} />}
  </section>
}

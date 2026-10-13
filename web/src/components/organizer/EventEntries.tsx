import { eventEntriesPath } from '@/api/events'
import type { OrganizerEntry } from '@/api/events'
import { SocialPhoto } from '@/components/SocialPhoto'
import { TeamCrest } from '@/components/arena/TeamCrest'
import { StateBadge } from '@/components/events/StateBadge'
import { Button } from '@/components/ui/button'
import { LoadError } from '@/components/ui/load-error'
import { entryState } from '@/data/arena'
import { usePagedList } from '@/hooks/usePagedList'
import { formatDeadline } from '@/utils/format'
import { relativeTime } from '@/utils/relativeTime'

/** Linha secundária da inscrição: quando entrou, o prazo da reserva ou o estado do comprovante e da devolução. */
function entryInfo(entry: OrganizerEntry): string {
  switch (entry.state) {
    case 'reservada': return entry.reserved_until ? `Reserva até ${formatDeadline(entry.reserved_until)}` : 'Vaga reservada'
    case 'em_analise': return entry.latest_payment ? `Comprovante enviado ${relativeTime(entry.latest_payment.created_at)}` : 'Comprovante em análise'
    case 'rejeitada': return entry.reserved_until ? `Pode enviar outro até ${formatDeadline(entry.reserved_until)}` : 'Comprovante recusado'
    case 'confirmada': return `Confirmada ${relativeTime(entry.confirmed_at ?? entry.created_at)}`
    case 'devolucao_pendente': return entry.refund && entry.refund.participant_response === null && entry.refund.resolution === null
      ? `Devolução enviada ${relativeTime(entry.refund.created_at)} · aguardando o participante` : 'Envie o comprovante da devolução'
    case 'devolucao_contestada': return 'A administração decide a devolução'
    default: return `Inscrição ${relativeTime(entry.created_at)}`
  }
}

/**
 * "Times inscritos" / "Inscritos" da gestão (`GET /organizer/events/{id}/entries`), em ordem de inscrição: escudo ou
 * foto, nome, estado efetivo e o prazo ou a situação do comprovante. "Ver comprovante" abre a tela de comprovantes.
 */
export function EventEntries({ eventId, onReceipts, onExpired }: {
  eventId: number
  onReceipts: () => void
  onExpired: () => void
}) {
  const list = usePagedList<OrganizerEntry>(eventEntriesPath(eventId), onExpired)
  if (list.loading) return <p role="status" className="px-1 py-3 text-[11.5px] text-ink-muted">Carregando as inscrições…</p>
  if (list.error) return <LoadError size="section" title="Não foi possível carregar as inscrições" text={list.error.message} cause={list.error} onRetry={list.reload} />
  if (!list.items.length) return <p className="px-1 py-3 text-[11.5px] leading-[1.5] text-ink-muted">Nenhuma inscrição ainda. Quem se inscrever aparece aqui, com o estado do pagamento.</p>
  return <>
    <ul className="m-0 list-none p-0" aria-label="Inscrições do evento">
      {list.items.map(entry => {
        const team = entry.subject.team
        const athlete = entry.subject.athlete
        const name = team?.name ?? athlete?.name ?? 'Inscrição'
        const info = entryState[entry.state]
        return <li key={entry.id} className="flex min-h-[54px] items-center gap-3 border-0 border-b border-solid border-line py-2 last:border-b-0">
          {team ? <TeamCrest name={team.name} initials={team.initials} path={team.crest_url} size="sm" decorative />
            : <SocialPhoto path={athlete?.avatar_url ?? null} name={name} size="comment" />}
          <span className="min-w-0 flex-1">
            <b className="block text-[12.5px] wrap-anywhere">{name}</b>
            <small className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] text-ink-muted">
              {info && <StateBadge tone={info.tone}>{info.label}</StateBadge>}
              <span>{entryInfo(entry)}</span>
            </small>
          </span>
          {entry.state === 'em_analise' && <button type="button" onClick={onReceipts} aria-label={`Ver comprovante de ${name}`}
            className="min-h-9 flex-none rounded-[11px] border border-solid border-line-strong bg-surface px-2.5 text-[11px] font-bold text-brand hover:bg-subtle">Ver comprovante</button>}
        </li>
      })}
    </ul>
    {list.moreError && <p className="mt-2 text-[11px] text-error" role="alert">{list.moreError}</p>}
    {list.hasMore && <Button variant="link" className="mt-1" disabled={list.busy} onClick={() => void list.loadMore()}>{list.busy ? 'Carregando…' : 'Carregar mais'}</Button>}
  </>
}

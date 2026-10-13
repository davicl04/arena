import { Plus, Trophy } from 'lucide-react'
import { listOpenOrganizerEvents, organizerEventsPath } from '@/api/events'
import type { OrganizerEventCard } from '@/api/events'
import { getOrganizerStatus } from '@/api/organizer'
import { EventPoster, NewEventPoster } from '@/components/events/EventPoster'
import { alertCount, posterProps } from '@/components/organizer/eventView'
import { teamButton } from '@/components/teams/styles'
import { DarkTopBar, TeamsPlate } from '@/components/teams/TeamsPlate'
import { Button, IconButton } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { usePagedList } from '@/hooks/usePagedList'
import { useResource } from '@/hooks/useResource'
import { cn } from '@/lib/utils'

/**
 * Área do organizador (O3): os eventos como cartazes, com o estado no canto, a barra de inscrições e o alerta de
 * pendências (`pending.total`); "Novo evento" é o último cartaz, tracejado. Abaixo, os encerrados e cancelados
 * (paginados). Sem permissão ativa (revogado), os eventos mantidos continuam, mas não há criação.
 */
export default function OrganizerEventsPage({ onBack, onOpen, onCreate, onExpired }: {
  onBack: () => void
  /** Abre a gestão (G3). */
  onOpen: (eventId: number) => void
  /** Abre o Criar evento (V4). */
  onCreate: () => void
  onExpired: () => void
}) {
  const open = useResource(listOpenOrganizerEvents, onExpired, { fallback: 'Não foi possível carregar os seus eventos.' })
  const closed = usePagedList<OrganizerEventCard>(organizerEventsPath('encerrados'), onExpired)
  const status = useResource(getOrganizerStatus, onExpired)
  const canCreate = status.data?.state === 'aprovado'
  const openItems = open.data?.items ?? []
  const empty = !open.loading && !open.error && !openItems.length && !closed.loading && !closed.items.length

  return <div>
    <TeamsPlate className="pb-4">
      <div className="flex items-center pr-2">
        <DarkTopBar eyebrow="Menu" title="Meus eventos" onBack={onBack} backLabel="Voltar para o Menu" className="min-w-0 flex-1" />
        {canCreate && <IconButton type="button" tone="glass" aria-label="Criar evento" className="mt-2.5 text-mint" onClick={onCreate}><Plus size={22} /></IconButton>}
      </div>
      <p className="px-4 pt-1 text-[11px] leading-[1.5] text-white/70">Campeonatos de futebol e tênis e provas de corrida. Toque num cartaz para gerir.</p>
    </TeamsPlate>

    <div className="px-5 pt-4">
      {status.data && !canCreate && <p className="mb-3 rounded-field bg-warning-bg p-3 text-[11.5px] leading-[1.5] text-warning">
        {status.data.state === 'revogado' ? 'Sua permissão de organizador foi revogada. Os eventos que a administração manteve continuam aqui.' : 'Você precisa ser organizador para criar eventos.'}
      </p>}
      {open.loading && <p role="status" className="text-[12px] text-ink-muted">Carregando os seus eventos…</p>}
      {open.error && <div className={feedbackVariants()} role="alert">{open.error} <Button variant="text" onClick={open.reload}>Tentar novamente</Button></div>}

      {empty ? <div className="px-3 py-8 text-center">
        <span className="mx-auto mb-3.5 grid size-14 place-items-center rounded-[18px] bg-[#005a3610] text-brand"><Trophy size={26} aria-hidden="true" /></span>
        <h2 className="text-[15px]">Seu primeiro evento</h2>
        <p className="mx-auto mt-[7px] max-w-[290px] text-[12px] leading-[1.7] text-ink-muted">
          Campeonato de futebol ou tênis (todos contra todos ou eliminação simples) ou prova de corrida. Eventos pagos passam pela aprovação da administração antes de publicar.
        </p>
        {canCreate && <button type="button" className={cn(teamButton({ tone: 'brand', size: 'md' }), 'mx-auto mt-4')} onClick={onCreate}><Plus aria-hidden="true" />Criar evento</button>}
      </div> : !open.loading && !open.error && <section aria-labelledby="open-events-title">
        <h2 id="open-events-title" className="sr-only">Eventos em aberto</h2>
        <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0">
          {openItems.map(event => <li key={event.id} className="grid min-w-0">
            <EventPoster {...posterProps(event)} pendingCount={alertCount(event)} showSport onClick={() => onOpen(event.id)} />
          </li>)}
          {canCreate && <li className="grid min-w-0"><NewEventPoster onClick={onCreate} /></li>}
        </ul>
      </section>}

      {closed.items.length > 0 && <section aria-labelledby="closed-events-title" className="mt-6">
        <h2 id="closed-events-title" className="mb-2 text-[16px]">Encerrados e cancelados</h2>
        <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0">
          {closed.items.map(event => <li key={event.id} className="grid min-w-0">
            <EventPoster {...posterProps(event)} pendingCount={alertCount(event)} showSport onClick={() => onOpen(event.id)} />
          </li>)}
        </ul>
        {closed.moreError && <p className="mt-2 text-[11px] text-error" role="alert">{closed.moreError}</p>}
        {closed.hasMore && <Button variant="link" className="mt-2" disabled={closed.busy} onClick={() => void closed.loadMore()}>{closed.busy ? 'Carregando…' : 'Carregar mais'}</Button>}
      </section>}
      {closed.error && <div className={feedbackVariants()} role="alert">{closed.error.message} <Button variant="text" onClick={closed.reload}>Tentar novamente</Button></div>}
    </div>
  </div>
}

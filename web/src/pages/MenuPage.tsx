import { BadgeCheck, Banknote, Bell, Flag, Info, LogOut, RotateCcw, ShieldOff, Trophy, UserCog } from 'lucide-react'
import { getQueueCounts } from '../api/admin'
import { getOrganizerStatus } from '../api/organizer'
import { listOpenOrganizerEvents } from '../api/events'
import { OrganizerCard, OrganizerEvents } from '../components/organizer/OrganizerCard'
import { useResource } from '../hooks/useResource'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { ListGroup, ListHeading, ListRow } from '@/components/ui/list-row'
import { cn } from '@/lib/utils'
import { appVersion } from '../data/arena'

/** Contador de pendências da fila (AD1). */
function QueueCount({ count }: { count: number }) {
  return <span className="inline-grid h-[17px] min-w-[17px] place-items-center rounded-[9px] bg-danger px-1 text-[9.5px] font-extrabold text-white">
    {count > 99 ? '99+' : count}<span className="sr-only"> {count === 1 ? 'pendente' : 'pendentes'}</span>
  </span>
}

/** Valor da linha da fila: o contador, só quando há pendências. */
const queueValue = (count: number | undefined) => typeof count === 'number' && count > 0 ? <QueueCount count={count} /> : undefined

/**
 * Menu do perfil (hambúrguer): atalhos da conta, o cartão "Organizar no Arena" (P3) ou, com a permissão, a seção
 * Organizador; para a administração, as filas (AD1); informações do app e saída.
 */
export default function MenuPage({ isAdmin, busy, onEditProfile, onSports, onModeration, onOrganizerRequest, onOrganizerRequests, onPaidEvents, onRevokedEvents, onRefundDisputes, onOrganizerEvents, onOpenEvent, onNewEvent, onNotifications, onLogout, onExpired }: {
  isAdmin: boolean
  busy: boolean
  onEditProfile: () => void
  onSports: () => void
  onModeration: () => void
  /** Abre "Seja organizador" (P5). */
  onOrganizerRequest: () => void
  /** Abre a fila "Pedidos de organizador" (AD1). */
  onOrganizerRequests: () => void
  /** Abre a fila "Eventos pagos" (AD1). */
  onPaidEvents: () => void
  /** Abre a fila "Eventos de organizador revogado". */
  onRevokedEvents: () => void
  /** Abre a fila "Devoluções contestadas". */
  onRefundDisputes: () => void
  /** Abre a área do organizador (O3). */
  onOrganizerEvents: () => void
  /** Abre a gestão de um evento (G3). */
  onOpenEvent: (eventId: number) => void
  /** Abre o Criar evento (V4). */
  onNewEvent: () => void
  /** Abre a tela Notificações (a mesma do sino do Início). */
  onNotifications: () => void
  onLogout: () => void
  onExpired: () => void
}) {
  const organizer = useResource(getOrganizerStatus, onExpired, { fallback: 'Não foi possível carregar o seu pedido de organizador.' })
  const counts = useResource(getQueueCounts, onExpired, { enabled: isAdmin })
  const status = organizer.data
  // A seção "Organizador · Meus eventos" aparece com a permissão ou quando há eventos em aberto (contrato 0003, seção 14).
  const events = useResource(listOpenOrganizerEvents, onExpired, { fallback: 'Não foi possível carregar os seus eventos.' })
  const eventItems = events.data?.items ?? []
  const showEvents = status?.state === 'aprovado' || eventItems.length > 0
  return <>
    <ListHeading>Conta</ListHeading>
    <ListGroup>
      <ListRow Icon={UserCog} label="Editar perfil" onClick={onEditProfile} />
      <ListRow Icon={Trophy} label="Minhas modalidades" onClick={onSports} />
    </ListGroup>
    {organizer.loading && <p role="status" className="mx-1 mt-5 text-[11px] text-ink-muted">Carregando a área do organizador…</p>}
    {organizer.error && <div className={cn(feedbackVariants(), 'mt-5')} role="alert">{organizer.error} <Button variant="text" onClick={organizer.reload}>Tentar novamente</Button></div>}
    {status && status.state !== 'aprovado' && <OrganizerCard status={status} onRequest={onOrganizerRequest} onChange={organizer.setData} onExpired={onExpired} />}
    {showEvents && <OrganizerEvents status={status} events={eventItems} loading={events.loading} error={status?.state === 'aprovado' ? events.error : ''}
      onReload={events.reload} onOpenList={onOrganizerEvents} onOpenEvent={onOpenEvent} onCreate={onNewEvent} />}
    {isAdmin && <>
      <ListHeading>Administração</ListHeading>
      <ListGroup>
        <ListRow Icon={BadgeCheck} label="Pedidos de organizador" value={queueValue(counts.data?.organizer_requests)} onClick={onOrganizerRequests} />
        <ListRow Icon={Banknote} label="Eventos pagos" value={queueValue(counts.data?.paid_events)} onClick={onPaidEvents} />
        <ListRow Icon={ShieldOff} label="Eventos de organizador revogado" value={queueValue(counts.data?.revoked_events)} onClick={onRevokedEvents} />
        <ListRow Icon={RotateCcw} label="Devoluções contestadas" value={queueValue(counts.data?.refund_disputes)} onClick={onRefundDisputes} />
        <ListRow Icon={Flag} label="Denúncias" onClick={onModeration} />
      </ListGroup>
    </>}
    <ListHeading>App</ListHeading>
    <ListGroup>
      <ListRow Icon={Bell} label="Notificações" onClick={onNotifications} />
      <ListRow Icon={Info} label="Sobre o ARENA" value={`Versão ${appVersion}`} />
    </ListGroup>
    <ListGroup className="mt-5">
      <ListRow Icon={LogOut} label={busy ? 'Aguarde…' : 'Sair da conta'} tone="danger" disabled={busy} onClick={onLogout} />
    </ListGroup>
  </>
}

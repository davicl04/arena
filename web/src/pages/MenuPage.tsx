import { BadgeCheck, Bell, Flag, Info, LogOut, Trophy, UserCog } from 'lucide-react'
import { getQueueCounts } from '../api/admin'
import { getOrganizerStatus } from '../api/organizer'
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

/**
 * Menu do perfil (hambúrguer): atalhos da conta, o cartão "Organizar no Arena" (P3) ou, com a permissão, a seção
 * Organizador; para a administração, as filas (AD1); informações do app e saída.
 */
export default function MenuPage({ isAdmin, busy, onEditProfile, onSports, onModeration, onOrganizerRequest, onOrganizerRequests, onNotifications, onLogout, onExpired }: {
  isAdmin: boolean
  busy: boolean
  onEditProfile: () => void
  onSports: () => void
  onModeration: () => void
  /** Abre "Seja organizador" (P5). */
  onOrganizerRequest: () => void
  /** Abre a fila "Pedidos de organizador" (AD1). */
  onOrganizerRequests: () => void
  /** Abre a tela Notificações (a mesma do sino do Início). */
  onNotifications: () => void
  onLogout: () => void
  onExpired: () => void
}) {
  const organizer = useResource(getOrganizerStatus, onExpired, { fallback: 'Não foi possível carregar o seu pedido de organizador.' })
  const counts = useResource(getQueueCounts, onExpired, { enabled: isAdmin })
  const status = organizer.data
  const pending = counts.data?.organizer_requests
  return <>
    <ListHeading>Conta</ListHeading>
    <ListGroup>
      <ListRow Icon={UserCog} label="Editar perfil" onClick={onEditProfile} />
      <ListRow Icon={Trophy} label="Minhas modalidades" onClick={onSports} />
    </ListGroup>
    {organizer.loading && <p role="status" className="mx-1 mt-5 text-[11px] text-ink-muted">Carregando a área do organizador…</p>}
    {organizer.error && <div className={cn(feedbackVariants(), 'mt-5')} role="alert">{organizer.error} <Button variant="text" onClick={organizer.reload}>Tentar novamente</Button></div>}
    {status?.state === 'aprovado' && <OrganizerEvents status={status} />}
    {status && status.state !== 'aprovado' && <OrganizerCard status={status} onRequest={onOrganizerRequest} onChange={organizer.setData} onExpired={onExpired} />}
    {isAdmin && <>
      <ListHeading>Administração</ListHeading>
      <ListGroup>
        <ListRow Icon={BadgeCheck} label="Pedidos de organizador" value={typeof pending === 'number' && pending > 0 ? <QueueCount count={pending} /> : undefined} onClick={onOrganizerRequests} />
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

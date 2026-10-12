import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import type { JoinRequest, Person, TeamInviteSent } from '@/api/teams'
import { Button, IconButton } from '@/components/ui/button'
import { SectionTitle } from '@/components/ui/section-title'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/utils/relativeTime'
import { MemberFace } from './MemberFace'
import { teamButton, textAction } from './styles'

/** Linha de pessoa das listas do representante (.prow, .inv-sent): rosto, nome, detalhe e ações. */
function PersonLine({ person, detail, children }: { person: Person; detail: string; children: ReactNode }) {
  return <li className="flex min-w-0 items-center gap-2.5 border-0 border-b border-solid border-line py-2.5 last:border-b-0">
    <MemberFace name={person.name} avatarUrl={person.avatar_url} size="row" />
    <div className="min-w-0 flex-1 text-[12.5px] font-semibold text-ink">
      <span className="block truncate">{person.name}</span>
      <small className="text-[10.5px] leading-[1.4] font-medium text-ink-muted">{detail}</small>
    </div>
    {children}
  </li>
}

const listCard = 'm-0 list-none rounded-card bg-white px-[13px] py-0.5 shadow-card'

/** Pedidos para entrar pelo link (só representantes): Aprovar | Recusar. */
export function JoinRequestsList({ requests, busyId, onDecide, onOpenLink }: {
  requests: JoinRequest[]
  busyId: number | null
  onDecide: (request: JoinRequest, decision: 'aprovar' | 'recusar') => void
  onOpenLink: () => void
}) {
  if (!requests.length) return null
  return <section aria-labelledby="join-requests-title">
    <SectionTitle className="mt-[22px] mb-2.5" title={<span id="join-requests-title">Pedidos para entrar · {requests.length}</span>}
      action={<Button variant="link" className="text-[11px]" onClick={onOpenLink}>Link e QR</Button>} />
    <ul className={listCard}>
      {requests.map(request => <PersonLine key={request.id} person={request.requester} detail={`Pelo link · ${relativeTime(request.created_at)}`}>
        <button type="button" className={teamButton({ tone: 'brand' })} disabled={busyId !== null} aria-label={`Aprovar pedido de ${request.requester.name}`}
          onClick={() => onDecide(request, 'aprovar')}>Aprovar</button>
        <IconButton type="button" className="size-[34px]" disabled={busyId !== null} aria-label={`Recusar pedido de ${request.requester.name}`}
          onClick={() => onDecide(request, 'recusar')}><X size={18} /></IconButton>
      </PersonLine>)}
    </ul>
  </section>
}

/** Convites enviados e pendentes (só representantes), com Cancelar. */
export function SentInvitesList({ invites, busyId, onCancel, onInvite }: {
  invites: TeamInviteSent[]
  busyId: number | null
  onCancel: (invite: TeamInviteSent) => void
  onInvite: () => void
}) {
  if (!invites.length) return null
  return <section aria-labelledby="sent-invites-title">
    <SectionTitle className="mt-[22px] mb-2.5" title={<span id="sent-invites-title">Convites enviados</span>}
      action={<Button variant="link" className="text-[11px]" onClick={onInvite}>Convidar</Button>} />
    <ul className={listCard}>
      {invites.map(invite => <PersonLine key={invite.id} person={invite.invitee} detail={`Aguardando resposta · enviado ${relativeTime(invite.created_at)}`}>
        <button type="button" className={cn(textAction, 'px-1')} disabled={busyId !== null} aria-label={`Cancelar convite de ${invite.invitee.name}`}
          onClick={() => onCancel(invite)}>{busyId === invite.id ? 'Cancelando…' : 'Cancelar'}</button>
      </PersonLine>)}
    </ul>
  </section>
}

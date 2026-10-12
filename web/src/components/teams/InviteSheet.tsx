import { Check, Info } from 'lucide-react'
import { ApiError } from '@/api/client'
import { decideInvite } from '@/api/teams'
import type { TeamCard, TeamInviteReceived } from '@/api/teams'
import { PlacementBadge } from '@/components/arena/PlacementMeter'
import { TeamCrest } from '@/components/arena/TeamCrest'
import { TierEmblem } from '@/components/arena/TierEmblem'
import { Sheet } from '@/components/ui/sheet'
import { useSubmit } from '@/hooks/useSubmit'
import { footballFormat, shownTier } from '@/data/arena'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/utils/relativeTime'
import { darkNotice, teamButton } from './styles'
import { RosterStack } from './TeamIdCard'
import { playedFormats } from './teamView'

/** Pílulas dos formatos em que o time já jogou: o elo (só com a classificação completa) ou "n/3". */
function FormatPills({ team }: { team: TeamCard }) {
  const cells = playedFormats(team.formats)
  if (!cells.length) return null
  return <ul className="m-0 mt-2 flex list-none flex-wrap gap-[5px] p-0" aria-label="Formatos em que o time jogou">
    {cells.map(cell => {
      const tier = shownTier(cell.tier, cell.played, cell.required)
      return <li key={cell.format} className="inline-flex items-center gap-[5px] rounded-full bg-white/7 py-[3px] pr-2 pl-1 text-[10px] font-bold">
        {tier ? <TierEmblem tier={tier} size="xs" /> : <PlacementBadge played={cell.played} required={cell.required} size="xs" />}
        {footballFormat[cell.format].label}{!tier && ` ${Math.min(cell.played, cell.required)}/${cell.required}`}
      </li>
    })}
  </ul>
}

/** Cartão único do convite recebido (K1): brasão e nome, quem convidou e quando, elos, mensagem citada e elenco. */
function InviteCard({ invite, busy, onDecide }: { invite: TeamInviteReceived; busy: boolean; onDecide: (decision: 'aceitar' | 'recusar') => void }) {
  const { team } = invite
  const titleId = `invite-${invite.id}-title`
  return <article aria-labelledby={titleId} className="min-w-0 rounded-[18px] p-3.5 text-white shadow-[inset_0_0_0_1px_#ffffff1f] bg-white/5">
    <div className="flex min-w-0 items-center gap-[11px]">
      <TeamCrest name={team.name} initials={team.initials} path={team.crest_url} size="md" decorative />
      <div className="min-w-0">
        <b id={titleId} className="block truncate font-display text-[15px]">{team.name}</b>
        <small className="text-[10.5px] text-white/66">{invite.inviter?.name ?? 'Um representante'} convidou você · {relativeTime(invite.created_at)}</small>
      </div>
    </div>
    <FormatPills team={team} />
    {invite.message && <blockquote className="mx-0 mt-2.5 mb-0 border-0 border-l-[3px] border-solid border-mint py-0.5 pl-[11px] text-[12.5px] leading-[1.5] wrap-anywhere text-white/88">
      {invite.message}
    </blockquote>}
    <RosterStack roster={team.roster_preview} count={team.member_count} className="mt-2.5" />
    <div className="mt-3 flex gap-2 *:flex-1">
      <button type="button" className={teamButton()} disabled={busy} onClick={() => onDecide('aceitar')} aria-label={`Aceitar convite do ${team.name}`}>
        <Check aria-hidden="true" />Aceitar
      </button>
      <button type="button" className={teamButton({ tone: 'line' })} disabled={busy} onClick={() => onDecide('recusar')} aria-label={`Recusar convite do ${team.name}`}>
        Recusar
      </button>
    </div>
  </article>
}

/**
 * Folha escura dos convites recebidos (R2 + K1). Aceitar põe o time no carrossel como membro; recusar só tira o convite.
 * Um convite que deixou de valer (409) some da lista com a mensagem do servidor.
 */
export function InviteSheet({ invites, loadError = '', onRetry, onClose, onAccepted, onDeclined, onStale, onExpired }: {
  invites: TeamInviteReceived[]
  /** Falha ao carregar os convites: a folha não diz "nenhum convite" quando a lista não chegou. */
  loadError?: string
  onRetry?: () => void
  onClose: () => void
  onAccepted: (invite: TeamInviteReceived, team: TeamCard | null) => void
  onDeclined: (invite: TeamInviteReceived) => void
  /** Convite que não está mais pendente: a página recarrega a lista. */
  onStale: () => void
  onExpired: () => void
}) {
  const { busy, error, run } = useSubmit(onExpired)
  async function decide(invite: TeamInviteReceived, decision: 'aceitar' | 'recusar') {
    let stale = false
    const result = await run(async () => {
      try { return await decideInvite(invite.id, decision) } catch (cause) {
        stale = cause instanceof ApiError && (cause.status === 404 || cause.status === 409)
        throw cause
      }
    }, 'Não foi possível responder ao convite.')
    if (result?.state === 'aceito') onAccepted(invite, result.team)
    else if (result) onDeclined(invite)
    else if (stale) onStale()
  }
  return <Sheet title={invites.length > 1 ? `Convites para times · ${invites.length}` : 'Convite para time'} onClose={() => { if (!busy) onClose() }}
    className="bg-forest text-white [&_[data-slot=sheet-title]]:text-white">
    {error && <p className={darkNotice({ tone: 'error' })} role="alert">{error}</p>}
    {loadError && <div className={darkNotice({ tone: 'error' })} role="alert">{loadError}
      {onRetry && <button type="button" className="ml-1 border-0 bg-transparent p-0 font-bold text-mint underline" onClick={onRetry}>Tentar novamente</button>}</div>}
    {invites.length
      ? <div className="mt-2 grid gap-3">{invites.map(invite => <InviteCard key={invite.id} invite={invite} busy={busy} onDecide={decision => void decide(invite, decision)} />)}</div>
      : !loadError && <p className="py-3.5 text-center text-[11.5px] text-white/66">Nenhum convite pendente.</p>}
    <p className={cn('mt-3.5 flex items-start gap-2 text-[11px] leading-[1.5] text-white/66')}>
      <Info size={15} className="mt-px text-mint" aria-hidden="true" />
      Ao aceitar, você entra como membro e sua posição preferida do futebol aparece no elenco. Você pode estar em vários times.
    </p>
  </Sheet>
}

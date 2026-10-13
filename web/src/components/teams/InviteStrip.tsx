import { ChevronRight } from 'lucide-react'
import type { TeamInviteReceived } from '@/api/teams'
import { TeamCrest } from '@/components/arena/TeamCrest'

/**
 * Faixa menta no topo da placa (R2): "Leões do Cerrado convidou você" ou "2 convites para times". Abre a folha de
 * convites. Sem convites pendentes, não aparece.
 */
export function InviteStrip({ invites, onOpen }: { invites: TeamInviteReceived[]; onOpen: () => void }) {
  if (!invites.length) return null
  const first = invites[0].team
  const many = invites.length > 1
  return <button type="button" onClick={onOpen} aria-haspopup="dialog"
    className="mx-4 mt-2.5 flex w-[calc(100%-32px)] items-center gap-2.5 rounded-[14px] border-0 bg-mint/10 py-[9px] pr-2.5 pl-2.5 text-left text-[11.5px] text-white shadow-[inset_0_0_0_1px_#8fe0b455] outline-offset-2 focus-visible:outline-mint">
    <TeamCrest name={first.name} initials={first.initials} path={first.crest_url} size="sm" decorative />
    <span className="min-w-0 flex-1 leading-[1.35]">
      {many ? <><b>{invites.length} convites</b> para times</> : <><b className="wrap-anywhere">{first.name}</b> convidou você</>}
    </span>
    <ChevronRight size={18} className="text-mint" aria-hidden="true" />
  </button>
}
